import { timingSafeEqual } from "node:crypto";

const FIREBASE_PROJECT_ID = "supercotacao-6a43c";
const FIREBASE_WEB_API_KEY = "AIzaSyAPBH_zOO3xrdiyW1qk20b3b1ejMlyYSvg";
const LIMITE_AUDIO_BYTES = 3 * 1024 * 1024;
const TIPOS_AUDIO = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/wav",
  "audio/x-wav"
]);
const tentativas = globalThis.__cotacaoPrimeVoiceAttempts || new Map();
globalThis.__cotacaoPrimeVoiceAttempts = tentativas;

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } }
};

export const maxDuration = 60;

function limparTexto(valor, limite) {
  return String(valor || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limite);
}

function limparTelefone(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 11);
}

function textoIgualSeguro(a, b) {
  const primeiro = Buffer.from(String(a || ""));
  const segundo = Buffer.from(String(b || ""));
  return primeiro.length === segundo.length && timingSafeEqual(primeiro, segundo);
}

function extrairJson(texto) {
  const conteudo = String(texto || "");
  const cercado = conteudo.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidato = cercado || conteudo.slice(conteudo.indexOf("{"), conteudo.lastIndexOf("}") + 1);
  return JSON.parse(candidato);
}

function limparProdutosIA(produtos) {
  const vistos = new Set();
  const resultado = [];

  for (const produto of Array.isArray(produtos) ? produtos.slice(0, 80) : []) {
    const nome = limparTexto(produto?.nome ?? produto?.name, 120);
    const emb = limparTexto(produto?.emb ?? produto?.embalagem ?? produto?.packaging, 80);
    if (!nome) continue;
    const chave = `${nome.toLocaleLowerCase("pt-BR")}|${emb.toLocaleLowerCase("pt-BR")}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push({ nome, emb });
  }

  return resultado;
}

function origemPermitida(req) {
  const origem = req.headers.origin;
  if (!origem) return true;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();

  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

function configurarResposta(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function valorFirestore(valor) {
  if (!valor || typeof valor !== "object") return undefined;
  if ("stringValue" in valor) return valor.stringValue;
  if ("booleanValue" in valor) return Boolean(valor.booleanValue);
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return Number(valor.doubleValue);
  return undefined;
}

async function buscarAssinante(telefone) {
  const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_WEB_API_KEY || FIREBASE_WEB_API_KEY;
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`
  );
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        select: {
          fields: [
            { fieldPath: "telefone" },
            { fieldPath: "senha" },
            { fieldPath: "statusAssinatura" }
          ]
        },
        from: [{ collectionId: "assinantes" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "telefone" },
            op: "EQUAL",
            value: { stringValue: telefone }
          }
        },
        limit: 1
      }
    }),
    signal: AbortSignal.timeout(12000)
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error("FIREBASE_INDISPONIVEL");
  const documento = payload.find((item) => item.document)?.document;
  if (!documento) return null;

  return Object.fromEntries(
    Object.entries(documento.fields || {}).map(([campo, valor]) => [campo, valorFirestore(valor)])
  );
}

function verificarLimite(telefone) {
  const agora = Date.now();
  const atual = tentativas.get(telefone) || { quantidade: 0, reiniciaEm: agora + 10 * 60 * 1000 };
  if (atual.reiniciaEm <= agora) {
    atual.quantidade = 0;
    atual.reiniciaEm = agora + 10 * 60 * 1000;
  }
  atual.quantidade += 1;
  tentativas.set(telefone, atual);
  return atual.quantidade <= 8;
}

function decodificarAudio(dataUrl, mimeInformado) {
  const correspondencia = String(dataUrl || "").match(/^data:([^;,]+(?:;codecs=[^;,]+)?);base64,([A-Za-z0-9+/=]+)$/);
  if (!correspondencia) throw new Error("AUDIO_INVALIDO");
  const mimeType = limparTexto(mimeInformado || correspondencia[1], 80).toLowerCase();
  if (!TIPOS_AUDIO.has(mimeType)) throw new Error("AUDIO_INVALIDO");
  const buffer = Buffer.from(correspondencia[2], "base64");
  if (buffer.length < 100 || buffer.length > LIMITE_AUDIO_BYTES) throw new Error("AUDIO_INVALIDO");
  return { buffer, mimeType };
}

function extensaoDoAudio(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

async function transcreverAudio(audio, apiKey) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio.buffer], { type: audio.mimeType }),
    `lista.${extensaoDoAudio(audio.mimeType)}`
  );
  form.append("model", "whisper-large-v3");
  form.append("language", "pt");
  form.append("response_format", "json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.text) throw new Error("TRANSCRICAO_FALHOU");
  return limparTexto(payload.text, 8000);
}

async function organizarProdutos(transcricao, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      temperature: 0,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lista_de_produtos",
          strict: true,
          schema: {
            type: "object",
            properties: {
              produtos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    emb: { type: "string" }
                  },
                  required: ["nome", "emb"],
                  additionalProperties: false
                }
              }
            },
            required: ["produtos"],
            additionalProperties: false
          }
        }
      },
      messages: [
        {
          role: "system",
          content: [
            "Você organiza uma lista brasileira de produtos para cotação.",
            "Extraia somente produtos explicitamente falados e nunca invente itens, marcas, pesos ou embalagens.",
            "Corrija apenas erros óbvios de transcrição.",
            "Responda JSON válido no formato {\"produtos\":[{\"nome\":\"\",\"emb\":\"\"}]}",
            "Use emb para caixa, fardo, pacote, unidade ou outra embalagem somente quando estiver clara no áudio.",
            "Quando a embalagem não for informada, use string vazia. Máximo de 80 produtos."
          ].join(" ")
        },
        { role: "user", content: transcricao }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detalhe = limparTexto(payload?.error?.message, 240);
    throw new Error(`ORGANIZACAO_FALHOU_${response.status}${detalhe ? `: ${detalhe}` : ""}`);
  }
  const conteudo = payload.choices?.[0]?.message?.content || "";
  let dados;
  try {
    dados = extrairJson(conteudo);
  } catch {
    const error = new Error("ORGANIZACAO_FALHOU");
    error.diagnostic = limparTexto(conteudo, 1000);
    throw error;
  }
  return limparProdutosIA(dados.produtos);
}

export const voiceListInternals = Object.freeze({
  limparProdutosIA,
  extrairJson,
  origemPermitida,
  decodificarAudio,
  transcreverAudio,
  organizarProdutos
});

export default async function handler(req, res) {
  configurarResposta(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }
  if (!origemPermitida(req)) return res.status(403).json({ error: "Origem não permitida." });

  const telefone = limparTelefone(req.body?.telefone);
  const senha = String(req.body?.senha || "");
  if (!/^\d{10,11}$/.test(telefone) || !senha || senha.length > 128) {
    return res.status(401).json({ error: "Entre novamente para usar a voz." });
  }

  try {
    const assinante = await buscarAssinante(telefone);
    if (
      !assinante ||
      assinante.statusAssinatura !== "ATIVA" ||
      (assinante.senha && !textoIgualSeguro(assinante.senha, senha))
    ) {
      return res.status(401).json({ error: "Entre novamente para usar a voz." });
    }
    if (!verificarLimite(telefone)) {
      return res.status(429).json({ error: "Muitas gravações seguidas. Aguarde alguns minutos." });
    }

    const apiKey = String(process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return res.status(503).json({ error: "A lista por voz ainda não está disponível." });
    const audio = decodificarAudio(req.body?.audio, req.body?.mimeType);
    const transcricao = await transcreverAudio(audio, apiKey);
    const produtos = await organizarProdutos(transcricao, apiKey);
    if (!produtos.length) {
      return res.status(422).json({ error: "Não encontrei produtos no áudio. Tente falar novamente." });
    }

    return res.status(200).json({ transcricao, produtos });
  } catch (error) {
    if (error.message === "AUDIO_INVALIDO") {
      return res.status(400).json({ error: "O áudio não pôde ser enviado. Tente gravar novamente." });
    }
    console.error("Falha ao montar lista por voz:", error?.message || error);
    return res.status(502).json({ error: "Não consegui entender o áudio agora. Tente novamente." });
  }
}
