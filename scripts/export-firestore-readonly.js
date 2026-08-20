import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const outputArg = process.argv[2];
const outputPath = path.resolve(outputArg || "/tmp/cotacao-prime-firestore-backup.json");
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountRaw) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT não está disponível. Nenhuma leitura foi feita.");
}

try {
  await access(outputPath, constants.F_OK);
  throw new Error(`O arquivo já existe e não será sobrescrito: ${outputPath}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const serviceAccount = JSON.parse(serviceAccountRaw);
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
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

const colecoesRaiz = await db.listCollections();
const colecoes = {};

for (const colecao of colecoesRaiz) {
  colecoes[colecao.id] = await exportarColecao(colecao);
}

const backup = {
  formato: "cotacao-prime-firestore-json-v1",
  criadoEm: new Date().toISOString(),
  projeto: serviceAccount.project_id,
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
