import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator
} from "mercadopago";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PLANOS = Object.freeze({
  Mensal: Object.freeze({ valor: 149, descricao: "Plano Mensal" }),
  Trimestral: Object.freeze({ valor: 327, descricao: "Plano Trimestral" }),
  Anual: Object.freeze({ valor: 1068, descricao: "Plano Anual" })
});

const COLECAO_CHECKOUTS = "checkoutsCotacaoPrime";
const STATUS_AGUARDANDO = "AGUARDANDO_PAGAMENTO";
const STATUS_APROVADO = "APROVADO";
const FIREBASE_WEB_API_KEY = "AIzaSyAPBH_zOO3xrdiyW1qk20b3b1ejMlyYSvg";
const FIREBASE_PROJECT_ID = "supercotacao-6a43c";

function obterConfiguracao() {
  const obrigatorias = [
    "MP_ACCESS_TOKEN",
    "FIREBASE_SERVICE_ACCOUNT",
    "CHECKOUT_DATA_SECRET"
  ];
  const ausentes = obrigatorias.filter((nome) => !process.env[nome]);

  if (ausentes.length) {
    throw new Error(`Configuração ausente: ${ausentes.join(", ")}`);
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  return {
    accessToken: process.env.MP_ACCESS_TOKEN,
    webhookSecret: process.env.MP_WEBHOOK_SECRET || "",
    checkoutSecret: process.env.CHECKOUT_DATA_SECRET,
    serviceAccount,
    firestoreRest: {
      apiKey: process.env.FIREBASE_WEB_API_KEY || FIREBASE_WEB_API_KEY,
      projectId: process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID
    }
  };
}

function obterServicos() {
  const config = obterConfiguracao();

  if (!getApps().length) {
    initializeApp({ credential: cert(config.serviceAccount) });
  }

  return {
    config,
    db: getFirestore(),
    mercadoPago: new MercadoPagoConfig({ accessToken: config.accessToken })
  };
}

function limparTexto(valor, limite) {
  return String(valor || "").trim().replace(/\s+/g, " ").slice(0, limite);
}

function limparTelefone(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 11);
}

function validarCadastro(body) {
  const nome = limparTexto(body?.nome, 100);
  const telefone = limparTelefone(body?.telefone);
  const senha = String(body?.senha || "");
  const plano = limparTexto(body?.plano, 20);

  if (nome.length < 2) throw new Error("NOME_INVALIDO");
  if (!/^\d{10,11}$/.test(telefone)) throw new Error("TELEFONE_INVALIDO");
  if (senha.length < 8 || senha.length > 128) throw new Error("SENHA_INVALIDA");
  if (!PLANOS[plano]) throw new Error("PLANO_INVALIDO");

  return { nome, telefone, senha, plano };
}

function obterOrigemDaRequisicao(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const protocolo = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();

  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("HOST_INVALIDO");
  }

  return `${protocolo === "http" ? "http" : "https"}://${host}`;
}

function obterBaseUrl(req) {
  const urlConfigurada = process.env.PUBLIC_SITE_URL;
  const hostVercel = process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;
  const candidata = urlConfigurada || (hostVercel ? `https://${hostVercel}` : obterOrigemDaRequisicao(req));

  try {
    const url = new URL(candidata);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("PROTOCOLO_INVALIDO");
    }
    return url.origin;
  } catch {
    throw new Error("URL_PUBLICA_INVALIDA");
  }
}

function obterUrlNotificacao(baseUrl, webhookSecret) {
  return webhookSecret
    ? `${baseUrl}/api/checkout?action=webhook`
    : `${baseUrl}/api/checkout?action=ipn&source_news=ipn`;
}

function origemPermitida(req) {
  const origem = req.headers.origin;
  if (!origem) return true;

  try {
    return new URL(origem).origin === obterOrigemDaRequisicao(req);
  } catch {
    return false;
  }
}

function chaveCriptografica(secret) {
  return createHash("sha256").update(secret).digest();
}

function protegerSenha(senha, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chaveCriptografica(secret), iv);
  const conteudo = Buffer.concat([cipher.update(senha, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, conteudo].map((parte) => parte.toString("base64url")).join(".");
}

function recuperarSenha(valor, secret) {
  const [ivBase64, tagBase64, conteudoBase64] = String(valor || "").split(".");
  if (!ivBase64 || !tagBase64 || !conteudoBase64) throw new Error("SENHA_PROTEGIDA_INVALIDA");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    chaveCriptografica(secret),
    Buffer.from(ivBase64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(conteudoBase64, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function configurarResposta(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.headers.origin && origemPermitida(req)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
  }
}

function erroDePermissaoFirestore(error) {
  const codigo = String(error?.code || "").toLowerCase();
  const mensagem = String(error?.message || "").toLowerCase();

  return codigo === "7" ||
    codigo === "permission-denied" ||
    codigo.includes("permission_denied") ||
    mensagem.includes("permission_denied") ||
    mensagem.includes("missing or insufficient permissions");
}

function erroDePrecondicaoFirestore(error) {
  const codigo = String(error?.code || "").toLowerCase();
  const mensagem = String(error?.message || "").toLowerCase();
  return codigo === "failed_precondition" || mensagem.includes("failed_precondition");
}

function valorParaFirestore(valor) {
  if (valor === null) return { nullValue: null };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (typeof valor === "string") return { stringValue: valor };
  if (typeof valor === "boolean") return { booleanValue: valor };

  if (typeof valor === "number") {
    return Number.isInteger(valor)
      ? { integerValue: String(valor) }
      : { doubleValue: valor };
  }

  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(valorParaFirestore) } };
  }

  if (valor && typeof valor === "object") {
    return { mapValue: { fields: objetoParaFirestore(valor) } };
  }

  throw new Error("VALOR_FIRESTORE_INVALIDO");
}

function objetoParaFirestore(objeto) {
  return Object.fromEntries(
    Object.entries(objeto)
      .filter(([, valor]) => valor !== undefined)
      .map(([campo, valor]) => [campo, valorParaFirestore(valor)])
  );
}

function valorDoFirestore(valor) {
  if (!valor || typeof valor !== "object") return undefined;
  if ("nullValue" in valor) return null;
  if ("stringValue" in valor) return valor.stringValue;
  if ("booleanValue" in valor) return Boolean(valor.booleanValue);
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return Number(valor.doubleValue);
  if ("timestampValue" in valor) return valor.timestampValue;
  if ("arrayValue" in valor) return (valor.arrayValue.values || []).map(valorDoFirestore);

  if ("mapValue" in valor) {
    return objetoDoFirestore(valor.mapValue.fields || {});
  }

  return undefined;
}

function objetoDoFirestore(campos = {}) {
  return Object.fromEntries(
    Object.entries(campos).map(([campo, valor]) => [campo, valorDoFirestore(valor)])
  );
}

function documentoRestNormalizado(documento) {
  if (!documento?.name) return null;

  return {
    id: documento.name.split("/").pop(),
    data: objetoDoFirestore(documento.fields || {}),
    name: documento.name,
    updateTime: documento.updateTime
  };
}

function criarRepositorioAdmin(db) {
  return {
    tipo: "admin",

    async buscarAssinantePorTelefone(telefone) {
      const snapshot = await db.collection("assinantes")
        .where("telefone", "==", telefone)
        .limit(1)
        .get();
      if (snapshot.empty) return null;
      const documento = snapshot.docs[0];
      return { id: documento.id, data: documento.data(), ref: documento.ref };
    },

    async buscarAssinantePorId(id) {
      const documento = await db.collection("assinantes").doc(id).get();
      return documento.exists
        ? { id: documento.id, data: documento.data(), ref: documento.ref }
        : null;
    },

    async salvarCheckout(id, dados) {
      await db.collection(COLECAO_CHECKOUTS).doc(id).set(dados);
    },

    async buscarCheckout(id) {
      const documento = await db.collection(COLECAO_CHECKOUTS).doc(id).get();
      return documento.exists
        ? { id: documento.id, data: documento.data(), ref: documento.ref }
        : null;
    },

    async ativarAssinatura({ checkoutId, checkout, paymentData, senha }) {
      await ativarAssinaturaAdmin({ db, checkoutId, checkout, paymentData, senha });
    }
  };
}

function criarRepositorioRest(config) {
  const raiz = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)`;
  const apiKey = encodeURIComponent(config.apiKey);

  function nomeDocumento(colecao, id) {
    return `projects/${config.projectId}/databases/(default)/documents/${colecao}/${id}`;
  }

  async function requisitar(caminho, options = {}) {
    const separador = caminho.includes("?") ? "&" : "?";
    const response = await fetch(`${raiz}/${caminho}${separador}key=${apiKey}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = response.status === 204
      ? null
      : await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(payload?.error?.message || `FIRESTORE_REST_${response.status}`);
      error.code = payload?.error?.status || String(response.status);
      throw error;
    }

    return payload;
  }

  async function buscarDocumento(colecao, id) {
    try {
      const documento = await requisitar(`documents/${colecao}/${encodeURIComponent(id)}`);
      return documentoRestNormalizado(documento);
    } catch (error) {
      if (String(error.code) === "NOT_FOUND" || String(error.code) === "404") return null;
      throw error;
    }
  }

  async function buscarAssinantePorTelefone(telefone) {
    const resultados = await requisitar("documents:runQuery", {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
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
      })
    });
    const encontrado = resultados.find((resultado) => resultado.document);
    return encontrado ? documentoRestNormalizado(encontrado.document) : null;
  }

  async function commit(writes) {
    return requisitar("documents:commit", {
      method: "POST",
      body: JSON.stringify({ writes })
    });
  }

  return {
    tipo: "rest",
    buscarAssinantePorTelefone,

    async buscarAssinantePorId(id) {
      return buscarDocumento("assinantes", id);
    },

    async salvarCheckout(id, dados) {
      await requisitar(`documents/${COLECAO_CHECKOUTS}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: objetoParaFirestore(dados) })
      });
    },

    async buscarCheckout(id) {
      return buscarDocumento(COLECAO_CHECKOUTS, id);
    },

    async ativarAssinatura({ checkoutId, checkout, checkoutRecord, paymentData, senha }) {
      let assinanteExistente = null;

      if (checkout.assinanteId) {
        assinanteExistente = await buscarDocumento("assinantes", checkout.assinanteId);
      }

      if (!assinanteExistente) {
        assinanteExistente = await buscarAssinantePorTelefone(checkout.telefone);
      }

      if (!assinanteExistente && checkout.assinanteId) {
        throw new Error("ASSINANTE_EXISTENTE_NAO_ENCONTRADO");
      }

      const agora = new Date();
      const dadosPagamento = {
        statusAssinatura: "ATIVA",
        plano: checkout.plano,
        dataPagamento: agora,
        ultimoPagamentoId: String(paymentData.id)
      };
      const writes = [];

      if (assinanteExistente) {
        writes.push({
          update: {
            name: assinanteExistente.name,
            fields: objetoParaFirestore(dadosPagamento)
          },
          updateMask: { fieldPaths: Object.keys(dadosPagamento) }
        });
      } else {
        const assinanteId = randomUUID();
        const novoAssinante = {
          nome: checkout.nome,
          telefone: checkout.telefone,
          senha,
          plano: checkout.plano,
          statusAssinatura: "ATIVA",
          criadoEm: agora,
          dataPagamento: agora,
          ultimoPagamentoId: String(paymentData.id)
        };
        writes.push({
          update: {
            name: nomeDocumento("assinantes", assinanteId),
            fields: objetoParaFirestore(novoAssinante)
          },
          currentDocument: { exists: false }
        });
      }

      const atualizacaoCheckout = {
        status: STATUS_APROVADO,
        pagamentoId: String(paymentData.id),
        aprovadoEm: agora
      };
      const checkoutWrite = {
        update: {
          name: nomeDocumento(COLECAO_CHECKOUTS, checkoutId),
          fields: objetoParaFirestore(atualizacaoCheckout)
        },
        updateMask: {
          fieldPaths: [...Object.keys(atualizacaoCheckout), "senhaProtegida"]
        }
      };

      if (checkoutRecord?.updateTime) {
        checkoutWrite.currentDocument = { updateTime: checkoutRecord.updateTime };
      }
      writes.push(checkoutWrite);

      try {
        await commit(writes);
      } catch (error) {
        if (!erroDePrecondicaoFirestore(error)) throw error;
        const checkoutAtual = await buscarDocumento(COLECAO_CHECKOUTS, checkoutId);
        if (checkoutAtual?.data?.status !== STATUS_APROVADO) throw error;
      }
    }
  };
}

async function selecionarRepositorio({ db, firestoreRest }, operacao, ...args) {
  const repositorioAdmin = criarRepositorioAdmin(db);

  try {
    return {
      repositorio: repositorioAdmin,
      resultado: await repositorioAdmin[operacao](...args)
    };
  } catch (error) {
    if (!erroDePermissaoFirestore(error)) throw error;
    console.warn("Firebase Admin sem permissão; usando compatibilidade das regras atuais.");
    const repositorioRest = criarRepositorioRest(firestoreRest);
    return {
      repositorio: repositorioRest,
      resultado: await repositorioRest[operacao](...args)
    };
  }
}

async function iniciarCheckout(req, res) {
  if (!origemPermitida(req)) {
    return res.status(403).json({ error: "Origem não permitida." });
  }

  let cadastro;
  try {
    cadastro = validarCadastro(req.body);
  } catch {
    return res.status(400).json({ error: "Confira os dados e tente novamente." });
  }

  try {
    const { config, db, mercadoPago } = obterServicos();
    const plano = PLANOS[cadastro.plano];
    const checkoutId = randomUUID();
    const referencia = `CP:${checkoutId}`;
    const baseUrl = obterBaseUrl(req);
    const notificationUrl = obterUrlNotificacao(baseUrl, config.webhookSecret);
    const selecao = await selecionarRepositorio(
      { db, firestoreRest: config.firestoreRest },
      "buscarAssinantePorTelefone",
      cadastro.telefone
    );
    const { repositorio } = selecao;
    const assinanteExistente = selecao.resultado;

    if (
      assinanteExistente?.data?.senha &&
      assinanteExistente.data.senha !== cadastro.senha
    ) {
      return res.status(401).json({
        code: "SENHA_EXISTENTE_INVALIDA",
        error: "Esse WhatsApp já está cadastrado. Digite a senha atual para renovar."
      });
    }

    const preference = new Preference(mercadoPago);
    const resultado = await preference.create({
      body: {
        items: [{
          id: `cotacao-prime-${cadastro.plano.toLowerCase()}`,
          title: `Cotação Prime - ${plano.descricao}`,
          quantity: 1,
          unit_price: plano.valor,
          currency_id: "BRL"
        }],
        payer: {
          name: cadastro.nome,
          phone: {
            area_code: cadastro.telefone.slice(0, 2),
            number: cadastro.telefone.slice(2)
          }
        },
        external_reference: referencia,
        notification_url: notificationUrl,
        back_urls: {
          success: `${baseUrl}/index.html?pagamento=aprovado`,
          pending: `${baseUrl}/index.html?pagamento=pendente`,
          failure: `${baseUrl}/vendas.html?pagamento=nao-concluido#planos`
        },
        auto_return: "approved"
      }
    });

    if (!resultado.id || !resultado.init_point) {
      throw new Error("PREFERENCIA_INCOMPLETA");
    }

    const dadosCheckout = {
      nome: cadastro.nome,
      telefone: cadastro.telefone,
      plano: cadastro.plano,
      valor: plano.valor,
      status: STATUS_AGUARDANDO,
      preferenciaId: resultado.id,
      criadoEm: new Date(),
      expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    if (assinanteExistente) {
      dadosCheckout.assinanteId = assinanteExistente.id;
    } else {
      dadosCheckout.senhaProtegida = protegerSenha(cadastro.senha, config.checkoutSecret);
    }

    await repositorio.salvarCheckout(checkoutId, dadosCheckout);

    return res.status(200).json({ init_point: resultado.init_point });
  } catch (error) {
    console.error("Falha ao iniciar checkout:", error?.message || error);
    return res.status(503).json({ error: "O pagamento está indisponível no momento." });
  }
}

function validarWebhook(req, secret) {
  const dataId = String(req.query?.["data.id"] || req.body?.data?.id || "");

  if (!dataId || !req.headers["x-signature"] || !req.headers["x-request-id"]) {
    throw new InvalidWebhookSignatureError("Cabeçalhos ausentes");
  }

  WebhookSignatureValidator.validate({
    xSignature: req.headers["x-signature"],
    xRequestId: req.headers["x-request-id"],
    dataId,
    secret
  });

  return dataId;
}

function obterIdPagamentoIpn(req) {
  const tipo = String(req.query?.topic || req.body?.type || req.body?.topic || "");
  if (tipo && tipo !== "payment") return null;

  const dataId = String(
    req.query?.id ||
    req.query?.["data.id"] ||
    req.body?.data?.id ||
    req.body?.id ||
    ""
  );

  if (!/^\d{1,30}$/.test(dataId)) throw new Error("PAGAMENTO_ID_INVALIDO");
  return dataId;
}

async function ativarAssinaturaAdmin({ db, checkoutId, checkout, paymentData, senha }) {
  const checkoutRef = db.collection(COLECAO_CHECKOUTS).doc(checkoutId);
  let assinanteExistente = null;

  if (checkout.assinanteId) {
    const snapshot = await db.collection("assinantes").doc(checkout.assinanteId).get();
    if (snapshot.exists) assinanteExistente = snapshot;
  }

  if (!assinanteExistente) {
    const assinantes = await db.collection("assinantes")
      .where("telefone", "==", checkout.telefone)
      .limit(1)
      .get();
    assinanteExistente = assinantes.empty ? null : assinantes.docs[0];
  }

  if (!assinanteExistente && checkout.assinanteId) {
    throw new Error("ASSINANTE_EXISTENTE_NAO_ENCONTRADO");
  }

  await db.runTransaction(async (transaction) => {
    const checkoutAtual = await transaction.get(checkoutRef);
    if (!checkoutAtual.exists || checkoutAtual.data().status === STATUS_APROVADO) return;

    const dadosPagamento = {
      statusAssinatura: "ATIVA",
      plano: checkout.plano,
      dataPagamento: FieldValue.serverTimestamp(),
      ultimoPagamentoId: String(paymentData.id)
    };

    if (assinanteExistente) {
      // Renovação: mantém nome e senha atuais para não bloquear um cliente existente.
      transaction.update(assinanteExistente.ref, dadosPagamento);
    } else {
      const novoAssinanteRef = db.collection("assinantes").doc();
      transaction.set(novoAssinanteRef, {
        nome: checkout.nome,
        telefone: checkout.telefone,
        senha,
        plano: checkout.plano,
        statusAssinatura: "ATIVA",
        criadoEm: FieldValue.serverTimestamp(),
        dataPagamento: FieldValue.serverTimestamp(),
        ultimoPagamentoId: String(paymentData.id)
      });
    }

    transaction.update(checkoutRef, {
      status: STATUS_APROVADO,
      pagamentoId: String(paymentData.id),
      aprovadoEm: FieldValue.serverTimestamp(),
      senhaProtegida: FieldValue.delete()
    });
  });
}

async function receberNotificacao(req, res, modo) {
  try {
    const { config, db, mercadoPago } = obterServicos();
    const dataId = modo === "webhook"
      ? validarWebhook(req, config.webhookSecret)
      : obterIdPagamentoIpn(req);

    if (!dataId || (req.body?.type && req.body.type !== "payment")) {
      return res.status(200).send("OK");
    }

    const payment = new Payment(mercadoPago);
    const paymentData = await payment.get({ id: dataId });

    if (paymentData.status !== "approved") {
      return res.status(200).send("OK");
    }

    const referencia = String(paymentData.external_reference || "");
    if (!referencia.startsWith("CP:")) {
      return res.status(200).send("OK");
    }

    const checkoutId = referencia.slice(3);
    const selecao = await selecionarRepositorio(
      { db, firestoreRest: config.firestoreRest },
      "buscarCheckout",
      checkoutId
    );
    const { repositorio } = selecao;
    const checkoutRecord = selecao.resultado;

    if (!checkoutRecord) {
      console.error("Checkout aprovado não encontrado:", checkoutId);
      return res.status(200).send("OK");
    }

    const checkout = checkoutRecord.data;
    if (checkout.status === STATUS_APROVADO) {
      return res.status(200).send("OK");
    }

    const plano = PLANOS[checkout.plano];
    const valorRecebido = Number(paymentData.transaction_amount);

    if (
      !plano ||
      paymentData.currency_id !== "BRL" ||
      Math.abs(valorRecebido - plano.valor) > 0.001 ||
      Math.abs(Number(checkout.valor) - plano.valor) > 0.001
    ) {
      console.error("Pagamento aprovado com dados divergentes:", String(paymentData.id));
      return res.status(200).send("OK");
    }

    const senha = checkout.assinanteId
      ? null
      : recuperarSenha(checkout.senhaProtegida, config.checkoutSecret);
    await repositorio.ativarAssinatura({
      checkoutId,
      checkout,
      checkoutRecord,
      paymentData,
      senha
    });
    return res.status(200).send("OK");
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return res.status(401).send("Assinatura inválida");
    }

    console.error("Falha ao processar notificação de pagamento:", error?.message || error);
    return res.status(500).send("Erro ao processar notificação");
  }
}

export const checkoutInternals = Object.freeze({
  PLANOS,
  erroDePermissaoFirestore,
  obterConfiguracao,
  obterIdPagamentoIpn,
  obterUrlNotificacao
});

export default async function handler(req, res) {
  configurarResposta(req, res);

  if (req.method === "OPTIONS") {
    if (!origemPermitida(req)) return res.status(403).end();
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const action = String(req.query?.action || "");
  if (action === "webhook" || action === "ipn") {
    return receberNotificacao(req, res, action);
  }

  return iniciarCheckout(req, res);
}
