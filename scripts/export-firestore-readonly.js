import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const outputArg = process.argv[2];
const outputPath = path.resolve(outputArg || "/tmp/cotacao-prime-firestore-backup.json");
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "supercotacao-6a43c";
const firebaseWebApiKey = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAPBH_zOO3xrdiyW1qk20b3b1ejMlyYSvg";
const colecoesConhecidas = ["assinantes", "cotacoes", "checkoutsCotacaoPrime"];

try {
  await access(outputPath, constants.F_OK);
  throw new Error(`O arquivo já existe e não será sobrescrito: ${outputPath}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let totalDocumentos = 0;

function normalizarValor(valor) {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map(normalizarValor);
  if (Buffer.isBuffer(valor)) return { __tipo: "bytes", base64: valor.toString("base64") };
  if (typeof valor?.toDate === "function") {
    return { __tipo: "timestamp", valor: valor.toDate().toISOString() };
  }
  if (typeof valor?.latitude === "number" && typeof valor?.longitude === "number") {
    return { __tipo: "geopoint", latitude: valor.latitude, longitude: valor.longitude };
  }
  if (typeof valor?.path === "string" && valor?.firestore) {
    return { __tipo: "referencia", caminho: valor.path };
  }
  if (typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, normalizarValor(item)]));
  }
  return valor;
}

async function exportarColecao(collectionRef) {
  const snapshot = await collectionRef.get();
  const documentos = {};

  for (const documento of snapshot.docs) {
    totalDocumentos += 1;
    const subcolecoes = await documento.ref.listCollections();
    const dadosSubcolecoes = {};

    for (const subcolecao of subcolecoes) {
      dadosSubcolecoes[subcolecao.id] = await exportarColecao(subcolecao);
    }

    documentos[documento.id] = {
      dados: normalizarValor(documento.data()),
      subcolecoes: dadosSubcolecoes
    };
  }

  return documentos;
}

function normalizarValorRest(valor) {
  if (!valor || typeof valor !== "object") return undefined;
  if ("nullValue" in valor) return null;
  if ("stringValue" in valor) return valor.stringValue;
  if ("booleanValue" in valor) return Boolean(valor.booleanValue);
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return Number(valor.doubleValue);
  if ("timestampValue" in valor) return { __tipo: "timestamp", valor: valor.timestampValue };
  if ("bytesValue" in valor) return { __tipo: "bytes", base64: valor.bytesValue };
  if ("referenceValue" in valor) return { __tipo: "referencia", caminho: valor.referenceValue };
  if ("geoPointValue" in valor) {
    return {
      __tipo: "geopoint",
      latitude: Number(valor.geoPointValue.latitude),
      longitude: Number(valor.geoPointValue.longitude)
    };
  }
  if ("arrayValue" in valor) {
    return (valor.arrayValue.values || []).map(normalizarValorRest);
  }
  if ("mapValue" in valor) {
    return Object.fromEntries(
      Object.entries(valor.mapValue.fields || {})
        .map(([chave, item]) => [chave, normalizarValorRest(item)])
    );
  }
  return undefined;
}

async function exportarColecaoRest(nomeColecao) {
  const documentos = {};
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/${nomeColecao}`
    );
    url.searchParams.set("key", firebaseWebApiKey);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Falha ao ler ${nomeColecao}: ${payload?.error?.message || response.status}`
      );
    }

    for (const documento of payload.documents || []) {
      const id = documento.name.split("/").pop();
      totalDocumentos += 1;
      documentos[id] = {
        dados: Object.fromEntries(
          Object.entries(documento.fields || {})
            .map(([chave, valor]) => [chave, normalizarValorRest(valor)])
        ),
        subcolecoes: {}
      };
    }

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return documentos;
}

let projeto;
let metodo;
const colecoes = {};

if (serviceAccountRaw) {
  const serviceAccount = JSON.parse(serviceAccountRaw);
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();
  const colecoesRaiz = await db.listCollections();

  for (const colecao of colecoesRaiz) {
    colecoes[colecao.id] = await exportarColecao(colecao);
  }
  projeto = serviceAccount.project_id;
  metodo = "firebase-admin";
} else {
  for (const nomeColecao of colecoesConhecidas) {
    colecoes[nomeColecao] = await exportarColecaoRest(nomeColecao);
  }
  projeto = firebaseProjectId;
  metodo = "firestore-rest-regras-atuais";
}

const backup = {
  formato: "cotacao-prime-firestore-json-v1",
  criadoEm: new Date().toISOString(),
  projeto,
  metodo,
  somenteLeitura: true,
  totalDocumentos,
  colecoes
};
const conteudo = `${JSON.stringify(backup, null, 2)}\n`;
const sha256 = createHash("sha256").update(conteudo).digest("hex");

await writeFile(outputPath, conteudo, { encoding: "utf8", mode: 0o600, flag: "wx" });

console.log(`Backup JSON criado com ${totalDocumentos} documentos.`);
console.log(`Arquivo: ${outputPath}`);
console.log(`SHA-256: ${sha256}`);
