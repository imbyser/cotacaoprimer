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
  Mensal: Object.freeze({ valor: 98.9, descricao: "Plano Mensal" }),
  Trimestral: Object.freeze({ valor: 275.7, descricao: "Plano Trimestral" }),
  Anual: Object.freeze({ valor: 1006.8, descricao: "Plano Anual" })
});

const COLECAO_CHECKOUTS = "checkoutsCotacaoPrime";
const STATUS_AGUARDANDO = "AGUARDANDO_PAGAMENTO";
const STATUS_APROVADO = "APROVADO";

function obterConfiguracao() {
  const obrigatorias = [
    "MP_ACCESS_TOKEN",
    "MP_WEBHOOK_SECRET",
    "FIREBASE_SERVICE_ACCOUNT",
    "CHECKOUT_DATA_SECRET"
  ];
  const ausentes = obrigatorias.filter((nome) => !process.env[nome]);

  if (ausentes.length) {
    throw new Error(`Configuração ausente: ${ausentes.join(", ")}`);
  }

  return {
    accessToken: process.env.MP_ACCESS_TOKEN,
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
    checkoutSecret: process.env.CHECKOUT_DATA_SECRET,
    serviceAccount: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
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
    const checkoutRef = db.collection(COLECAO_CHECKOUTS).doc(checkoutId);
    const baseUrl = obterBaseUrl(req);
    const assinantes = await db.collection("assinantes")
      .where("telefone", "==", cadastro.telefone)
      .limit(1)
      .get();
    const assinanteExistente = assinantes.empty ? null : assinantes.docs[0];

    if (
      assinanteExistente?.data()?.senha &&
      assinanteExistente.data().senha !== cadastro.senha
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
        notification_url: `${baseUrl}/api/checkout?action=webhook`,
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
      criadoEm: FieldValue.serverTimestamp(),
      expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    if (assinanteExistente) {
      dadosCheckout.assinanteId = assinanteExistente.id;
    } else {
      dadosCheckout.senhaProtegida = protegerSenha(cadastro.senha, config.checkoutSecret);
    }

    await checkoutRef.set(dadosCheckout);

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

async function ativarAssinatura({ db, checkoutRef, checkout, paymentData, senha }) {
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

async function receberWebhook(req, res) {
  try {
    const { config, db, mercadoPago } = obterServicos();
    const dataId = validarWebhook(req, config.webhookSecret);

    if (req.body?.type && req.body.type !== "payment") {
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
    const checkoutRef = db.collection(COLECAO_CHECKOUTS).doc(checkoutId);
    const checkoutSnap = await checkoutRef.get();

    if (!checkoutSnap.exists) {
      console.error("Checkout aprovado não encontrado:", checkoutId);
      return res.status(200).send("OK");
    }

    const checkout = checkoutSnap.data();
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
    await ativarAssinatura({ db, checkoutRef, checkout, paymentData, senha });
    return res.status(200).send("OK");
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return res.status(401).send("Assinatura inválida");
    }

    console.error("Falha ao processar webhook:", error?.message || error);
    return res.status(500).send("Erro ao processar notificação");
  }
}

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

  if (String(req.query?.action || "") === "webhook") {
    return receberWebhook(req, res);
  }

  return iniciarCheckout(req, res);
}
