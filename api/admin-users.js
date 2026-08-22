import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PLANOS = Object.freeze(["Mensal", "Trimestral", "Anual"]);
const STATUS = Object.freeze(["ATIVA", "SUSPENSA", "PENDENTE"]);
const COOKIE_SESSAO = "cotacao_prime_admin";
const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
const LIMITE_TENTATIVAS = 8;
const tentativasLogin = new Map();

function erro(codigo, status = 400) {
  const error = new Error(codigo);
  error.status = status;
  return error;
}

function limparTexto(valor, limite = 120) {
  return String(valor || "").trim().replace(/\s+/g, " ").slice(0, limite);
}

function limparTelefone(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 11);
}

function idValido(valor) {
  return /^[A-Za-z0-9_-]{1,180}$/.test(String(valor || ""));
}

function textoIgualSeguro(a, b) {
  const hashA = createHash("sha256").update(String(a || ""), "utf8").digest();
  const hashB = createHash("sha256").update(String(b || ""), "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

function lerCredenciaisBasicas(cabecalho) {
  const valor = String(cabecalho || "");
  if (!valor.startsWith("Basic ")) return null;

  try {
    const texto = Buffer.from(valor.slice(6), "base64").toString("utf8");
    const separador = texto.indexOf(":");
    if (separador <= 0) return null;
    const telefone = limparTelefone(texto.slice(0, separador));
    const senha = texto.slice(separador + 1);
    if (!/^\d{10,11}$/.test(telefone) || !senha || senha.length > 128) return null;
    return { telefone, senha };
  } catch {
    return null;
  }
}

function chaveDaRequisicao(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "desconhecido")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function verificarLimiteLogin(chave, agora = Date.now()) {
  const registro = tentativasLogin.get(chave);
  if (!registro || agora - registro.inicio >= JANELA_TENTATIVAS_MS) {
    tentativasLogin.delete(chave);
    return;
  }
  if (registro.quantidade >= LIMITE_TENTATIVAS) throw erro("MUITAS_TENTATIVAS", 429);
}

function registrarFalhaLogin(chave, agora = Date.now()) {
  const registro = tentativasLogin.get(chave);
  if (!registro || agora - registro.inicio >= JANELA_TENTATIVAS_MS) {
    tentativasLogin.set(chave, { inicio: agora, quantidade: 1 });
    return;
  }
  registro.quantidade += 1;
}

function lerCookies(cabecalho) {
  return Object.fromEntries(
    String(cabecalho || "").split(";").map((parte) => {
      const indice = parte.indexOf("=");
      if (indice < 1) return ["", ""];
      return [parte.slice(0, indice).trim(), parte.slice(indice + 1).trim()];
    }).filter(([nome]) => nome)
  );
}

function assinarSessao(telefone, segredo, agora = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    telefone,
    exp: Math.floor(agora / 1000) + DURACAO_SESSAO_SEGUNDOS
  })).toString("base64url");
  const assinatura = createHmac("sha256", segredo).update(payload).digest("base64url");
  return `${payload}.${assinatura}`;
}

function validarSessao(cabecalhoCookie, telefoneEsperado, segredo, agora = Date.now()) {
  const token = lerCookies(cabecalhoCookie)[COOKIE_SESSAO];
  const [payload, assinatura] = String(token || "").split(".");
  if (!payload || !assinatura) return null;
  const esperada = createHmac("sha256", segredo).update(payload).digest("base64url");
  if (!textoIgualSeguro(assinatura, esperada)) return null;

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const telefone = limparTelefone(dados.telefone);
    if (
      !textoIgualSeguro(telefone, telefoneEsperado) ||
      !Number.isFinite(dados.exp) ||
      dados.exp <= Math.floor(agora / 1000)
    ) return null;
    return { telefone, exp: dados.exp };
  } catch {
    return null;
  }
}

function validarSenhaNova(valor) {
  const senha = String(valor || "");
  if (senha.length < 8 || senha.length > 128) throw erro("SENHA_INVALIDA");
  return senha;
}

function validarCriacao(body) {
  const nome = limparTexto(body?.nome, 100);
  const telefone = limparTelefone(body?.telefone);
  const senha = validarSenhaNova(body?.senha);
  const plano = limparTexto(body?.plano, 20);
  const statusAssinatura = limparTexto(body?.statusAssinatura, 20).toUpperCase();

  if (nome.length < 2) throw erro("NOME_INVALIDO");
  if (!/^\d{10,11}$/.test(telefone)) throw erro("TELEFONE_INVALIDO");
  if (!PLANOS.includes(plano)) throw erro("PLANO_INVALIDO");
  if (!STATUS.includes(statusAssinatura)) throw erro("STATUS_INVALIDO");

  return { nome, telefone, senha, plano, statusAssinatura };
}

function validarAtualizacao(body) {
  if (!idValido(body?.id)) throw erro("CONTA_INVALIDA");
  const atualizacao = {};

  if (Object.hasOwn(body || {}, "nome")) {
    const nome = limparTexto(body.nome, 100);
    if (nome && nome.length < 2) throw erro("NOME_INVALIDO");
    if (nome) atualizacao.nome = nome;
  }
  if (Object.hasOwn(body || {}, "telefone")) {
    const telefone = limparTelefone(body.telefone);
    if (!/^\d{10,11}$/.test(telefone)) throw erro("TELEFONE_INVALIDO");
    atualizacao.telefone = telefone;
  }
  if (Object.hasOwn(body || {}, "plano")) {
    const plano = limparTexto(body.plano, 20);
    if (plano && !PLANOS.includes(plano)) throw erro("PLANO_INVALIDO");
    if (plano) atualizacao.plano = plano;
  }
  if (Object.hasOwn(body || {}, "statusAssinatura")) {
    const statusAssinatura = limparTexto(body.statusAssinatura, 20).toUpperCase();
    if (!STATUS.includes(statusAssinatura)) throw erro("STATUS_INVALIDO");
    atualizacao.statusAssinatura = statusAssinatura;
  }

  if (!Object.keys(atualizacao).length) throw erro("NENHUMA_ALTERACAO");
  return { id: String(body.id), atualizacao };
}

function alteracaoProtegidaDoAdmin(telefoneAtual, atualizacao, telefoneAdmin) {
  return telefoneAtual === telefoneAdmin && (
    (atualizacao.telefone && atualizacao.telefone !== telefoneAtual) ||
    (atualizacao.statusAssinatura && atualizacao.statusAssinatura !== "ATIVA")
  );
}

function paraIso(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (valor instanceof Date) return valor.toISOString();
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function sanitizarAssinante(id, dados, atividade = {}) {
  return {
    id,
    nome: limparTexto(dados?.nome, 100),
    telefone: limparTelefone(dados?.telefone),
    plano: PLANOS.includes(dados?.plano) ? dados.plano : "",
    statusAssinatura: STATUS.includes(dados?.statusAssinatura)
      ? dados.statusAssinatura
      : limparTexto(dados?.statusAssinatura, 20).toUpperCase(),
    temSenha: Boolean(dados?.senha),
    criadoEm: paraIso(dados?.criadoEm),
    atualizadoEm: paraIso(dados?.atualizadoEm),
    dataPagamento: paraIso(dados?.dataPagamento),
    senhaAtualizadaEm: paraIso(dados?.senhaAtualizadaEm),
    ultimoPagamentoId: limparTexto(dados?.ultimoPagamentoId, 120),
    listas: Number(atividade.listas || 0),
    ultimaAtividade: atividade.ultimaAtividade || null
  };
}

function calcularResumo(usuarios) {
  return usuarios.reduce((resumo, usuario) => {
    resumo.total += 1;
    resumo.listas += usuario.listas;
    if (usuario.statusAssinatura === "ATIVA") resumo.ativas += 1;
    else if (usuario.statusAssinatura === "SUSPENSA") resumo.suspensas += 1;
    else resumo.pendentes += 1;
    return resumo;
  }, { total: 0, ativas: 0, suspensas: 0, pendentes: 0, listas: 0 });
}

function obterDb() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw erro("ADMIN_NAO_CONFIGURADO", 503);
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}

function obterConfiguracaoAdmin() {
  const esperado = limparTelefone(process.env.ADMIN_WHATSAPP);
  const segredoSessao = String(process.env.ADMIN_SESSION_SECRET || "");
  if (!/^\d{10,11}$/.test(esperado) || segredoSessao.length < 32) {
    throw erro("ADMIN_NAO_CONFIGURADO", 503);
  }
  return { esperado, segredoSessao };
}

async function autenticarCredenciais(req, db, esperado) {
  const credenciais = lerCredenciaisBasicas(req.headers.authorization);
  if (!credenciais || !textoIgualSeguro(credenciais.telefone, esperado)) {
    throw erro("ACESSO_NEGADO", 401);
  }

  const snapshot = await db.collection("assinantes")
    .where("telefone", "==", esperado)
    .limit(1)
    .get();
  if (snapshot.empty) throw erro("ACESSO_NEGADO", 401);

  const dados = snapshot.docs[0].data();
  if (
    dados.statusAssinatura !== "ATIVA" ||
    !dados.senha ||
    !textoIgualSeguro(credenciais.senha, dados.senha)
  ) {
    throw erro("ACESSO_NEGADO", 401);
  }

  return { id: snapshot.docs[0].id, telefone: esperado };
}

function autenticarSessao(req, esperado, segredoSessao) {
  const sessao = validarSessao(req.headers.cookie, esperado, segredoSessao);
  if (!sessao) throw erro("ACESSO_NEGADO", 401);
  return { telefone: sessao.telefone };
}

function definirCookieSessao(res, token) {
  const seguro = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_SESSAO}=${token}; Path=/api/admin-users; HttpOnly; SameSite=Strict; Max-Age=${DURACAO_SESSAO_SEGUNDOS}${seguro}`
  );
}

function limparCookieSessao(res) {
  const seguro = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_SESSAO}=; Path=/api/admin-users; HttpOnly; SameSite=Strict; Max-Age=0${seguro}`
  );
}

async function listarUsuarios(db) {
  const [assinantes, cotacoes] = await Promise.all([
    db.collection("assinantes").get(),
    db.collection("cotacoes").select("userId", "criadoEm", "atualizadoEm").get()
  ]);
  const atividade = new Map();

  for (const documento of cotacoes.docs) {
    const dados = documento.data();
    const telefone = limparTelefone(dados.userId);
    if (!telefone) continue;
    const atual = atividade.get(telefone) || { listas: 0, ultimaAtividade: null };
    atual.listas += 1;
    const data = paraIso(dados.atualizadoEm || dados.criadoEm);
    if (data && (!atual.ultimaAtividade || data > atual.ultimaAtividade)) atual.ultimaAtividade = data;
    atividade.set(telefone, atual);
  }

  const usuarios = assinantes.docs.map((documento) => {
    const dados = documento.data();
    return sanitizarAssinante(
      documento.id,
      dados,
      atividade.get(limparTelefone(dados.telefone))
    );
  }).sort((a, b) => {
    const atividadeA = a.ultimaAtividade || a.atualizadoEm || a.criadoEm || "";
    const atividadeB = b.ultimaAtividade || b.atualizadoEm || b.criadoEm || "";
    return atividadeB.localeCompare(atividadeA) || a.telefone.localeCompare(b.telefone);
  });

  return { usuarios, resumo: calcularResumo(usuarios) };
}

async function criarUsuario(db, body, admin) {
  const dados = validarCriacao(body);
  const colecao = db.collection("assinantes");

  const id = await db.runTransaction(async (transaction) => {
    const existente = await transaction.get(colecao.where("telefone", "==", dados.telefone).limit(1));
    if (!existente.empty) throw erro("TELEFONE_JA_CADASTRADO", 409);
    const referencia = colecao.doc();
    transaction.create(referencia, {
      ...dados,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoPorAdmin: admin.telefone
    });
    return referencia.id;
  });

  return { id };
}

async function atualizarUsuario(db, body, admin) {
  const { id, atualizacao } = validarAtualizacao(body);
  const referencia = db.collection("assinantes").doc(id);

  await db.runTransaction(async (transaction) => {
    const atual = await transaction.get(referencia);
    if (!atual.exists) throw erro("CONTA_NAO_ENCONTRADA", 404);
    const telefoneAtual = limparTelefone(atual.data().telefone);
    let cotacoesDoTelefone = null;
    if (alteracaoProtegidaDoAdmin(telefoneAtual, atualizacao, admin.telefone)) {
      throw erro("ADMIN_CONTA_PROTEGIDA", 409);
    }

    if (atualizacao.telefone && atualizacao.telefone !== telefoneAtual) {
      const existente = await transaction.get(
        db.collection("assinantes").where("telefone", "==", atualizacao.telefone).limit(1)
      );
      if (existente.docs.some((documento) => documento.id !== id)) {
        throw erro("TELEFONE_JA_CADASTRADO", 409);
      }
      if (/^\d{10,11}$/.test(telefoneAtual)) {
        cotacoesDoTelefone = await transaction.get(
          db.collection("cotacoes").where("userId", "==", telefoneAtual)
        );
        if (cotacoesDoTelefone.size > 450) throw erro("MUITAS_LISTAS_PARA_MIGRAR", 409);
      }
    }

    transaction.update(referencia, {
      ...atualizacao,
      atualizadoEm: FieldValue.serverTimestamp()
    });
    cotacoesDoTelefone?.docs.forEach((documento) => {
      transaction.update(documento.ref, { userId: atualizacao.telefone });
    });
  });
}

async function redefinirSenha(db, body) {
  if (!idValido(body?.id)) throw erro("CONTA_INVALIDA");
  const senha = validarSenhaNova(body?.senha);
  const referencia = db.collection("assinantes").doc(String(body.id));
  const atual = await referencia.get();
  if (!atual.exists) throw erro("CONTA_NAO_ENCONTRADA", 404);
  await referencia.update({
    senha,
    senhaAtualizadaEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp()
  });
}

function configurarResposta(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.method === "OPTIONS") res.setHeader("Allow", "GET, POST, OPTIONS");
}

function responderErro(res, error) {
  const status = Number(error?.status) || 500;
  const mensagens = {
    ACESSO_NEGADO: "WhatsApp ou senha de administrador incorretos.",
    MUITAS_TENTATIVAS: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    ADMIN_NAO_CONFIGURADO: "A área administrativa ainda não foi configurada.",
    NOME_INVALIDO: "Digite um nome com pelo menos 2 caracteres.",
    TELEFONE_INVALIDO: "Digite um WhatsApp válido com DDD.",
    SENHA_INVALIDA: "A nova senha precisa ter de 8 a 128 caracteres.",
    PLANO_INVALIDO: "Escolha um plano válido.",
    STATUS_INVALIDO: "Escolha uma situação válida.",
    CONTA_INVALIDA: "Conta inválida.",
    CONTA_NAO_ENCONTRADA: "Conta não encontrada.",
    TELEFONE_JA_CADASTRADO: "Esse WhatsApp já está cadastrado.",
    MUITAS_LISTAS_PARA_MIGRAR: "Essa conta possui muitas listas para trocar o WhatsApp automaticamente. Faça essa alteração com suporte técnico.",
    ADMIN_CONTA_PROTEGIDA: "O WhatsApp e o acesso da conta administradora não podem ser alterados por esta tela.",
    NENHUMA_ALTERACAO: "Nenhuma alteração foi informada.",
    ACAO_INVALIDA: "Ação inválida."
  };
  res.status(status).json({ error: mensagens[error?.message] || "Não foi possível concluir agora." });
}

export default async function handler(req, res) {
  configurarResposta(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const db = obterDb();
    const { esperado, segredoSessao } = obterConfiguracaoAdmin();
    const body = req.method === "POST"
      ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
      : {};

    if (req.method === "POST" && body.action === "login") {
      const chave = chaveDaRequisicao(req);
      verificarLimiteLogin(chave);
      let admin;
      try {
        admin = await autenticarCredenciais(req, db, esperado);
        tentativasLogin.delete(chave);
      } catch (error) {
        if (error?.status === 401) registrarFalhaLogin(chave);
        throw error;
      }
      definirCookieSessao(res, assinarSessao(admin.telefone, segredoSessao));
      return res.status(200).json({ ok: true, admin: { telefone: admin.telefone } });
    }
    if (req.method === "POST" && body.action === "logout") {
      limparCookieSessao(res);
      return res.status(200).json({ ok: true });
    }

    const admin = autenticarSessao(req, esperado, segredoSessao);

    if (req.method === "GET") {
      return res.status(200).json({ ...(await listarUsuarios(db)), admin: { telefone: admin.telefone } });
    }

    if (body.action === "create") await criarUsuario(db, body, admin);
    else if (body.action === "update") await atualizarUsuario(db, body, admin);
    else if (body.action === "reset-password") await redefinirSenha(db, body);
    else throw erro("ACAO_INVALIDA");

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Falha na área administrativa:", error?.message || error);
    return responderErro(res, error);
  }
}

export const _internals = {
  PLANOS,
  STATUS,
  limparTexto,
  limparTelefone,
  textoIgualSeguro,
  lerCredenciaisBasicas,
  verificarLimiteLogin,
  registrarFalhaLogin,
  lerCookies,
  assinarSessao,
  validarSessao,
  validarSenhaNova,
  validarCriacao,
  validarAtualizacao,
  alteracaoProtegidaDoAdmin,
  paraIso,
  sanitizarAssinante,
  calcularResumo,
  responderErro
};
