import assert from "node:assert/strict";
import test from "node:test";

import { _internals as admin } from "../api/admin-users.js";

test("lê o login administrativo sem perder caracteres da senha", () => {
  const authorization = `Basic ${Buffer.from("81999999999:senha:com:dois-pontos").toString("base64")}`;
  assert.deepEqual(admin.lerCredenciaisBasicas(authorization), {
    telefone: "81999999999",
    senha: "senha:com:dois-pontos"
  });
  assert.equal(admin.lerCredenciaisBasicas("Bearer teste"), null);
  assert.equal(admin.lerCredenciaisBasicas(`Basic ${Buffer.from("81:x").toString("base64")}`), null);
});

test("assina a sessão e rejeita adulteração ou vencimento", () => {
  const segredo = "s".repeat(48);
  const agora = Date.UTC(2026, 7, 22, 12, 0, 0);
  const token = admin.assinarSessao("81999999999", segredo, agora);
  const sessao = admin.validarSessao(
    `outra=1; cotacao_prime_admin=${token}; final=2`,
    "81999999999",
    segredo,
    agora + 1_000
  );
  assert.equal(sessao.telefone, "81999999999");
  assert.equal(admin.validarSessao(`cotacao_prime_admin=${token}x`, "81999999999", segredo, agora), null);
  assert.equal(admin.validarSessao(`cotacao_prime_admin=${token}`, "81999999999", segredo, agora + 9 * 60 * 60 * 1000), null);
});

test("limita tentativas administrativas repetidas", () => {
  const chave = `teste-${Date.now()}`;
  const agora = Date.UTC(2026, 7, 22, 12, 0, 0);
  for (let i = 0; i < 8; i += 1) admin.registrarFalhaLogin(chave, agora);
  assert.throws(() => admin.verificarLimiteLogin(chave, agora + 1_000), /MUITAS_TENTATIVAS/);
  assert.doesNotThrow(() => admin.verificarLimiteLogin(chave, agora + 16 * 60 * 1000));
});

test("valida criação de conta sem aceitar plano, telefone ou senha inválidos", () => {
  assert.deepEqual(admin.validarCriacao({
    nome: "  Mercado   Central ",
    telefone: "(81) 99999-9999",
    senha: "senha-segura",
    plano: "Mensal",
    statusAssinatura: "ativa"
  }), {
    nome: "Mercado Central",
    telefone: "81999999999",
    senha: "senha-segura",
    plano: "Mensal",
    statusAssinatura: "ATIVA"
  });
  assert.throws(() => admin.validarCriacao({
    nome: "Mercado",
    telefone: "81",
    senha: "curta",
    plano: "Inventado",
    statusAssinatura: "ATIVA"
  }));
});

test("a atualização preserva campos legados vazios e só aceita alterações conhecidas", () => {
  assert.deepEqual(admin.validarAtualizacao({
    id: "conta_01",
    nome: "",
    telefone: "81999999999",
    plano: "",
    statusAssinatura: "SUSPENSA"
  }), {
    id: "conta_01",
    atualizacao: {
      telefone: "81999999999",
      statusAssinatura: "SUSPENSA"
    }
  });
  assert.throws(() => admin.validarAtualizacao({ id: "../conta", telefone: "81999999999" }));
  assert.throws(() => admin.validarAtualizacao({ id: "conta_01", campoInventado: true }));
});

test("impede que o administrador bloqueie ou perca a própria conta", () => {
  assert.equal(admin.alteracaoProtegidaDoAdmin("81999999999", {
    telefone: "81988888888",
    statusAssinatura: "ATIVA"
  }, "81999999999"), true);
  assert.equal(admin.alteracaoProtegidaDoAdmin("81999999999", {
    telefone: "81999999999",
    statusAssinatura: "SUSPENSA"
  }, "81999999999"), true);
  assert.equal(admin.alteracaoProtegidaDoAdmin("81977777777", {
    telefone: "81988888888",
    statusAssinatura: "ATIVA"
  }, "81999999999"), false);
});

test("nunca devolve a senha ao painel e calcula somente o resumo necessário", () => {
  const usuario = admin.sanitizarAssinante("abc", {
    nome: "Mercado Central",
    telefone: "81999999999",
    senha: "segredo-que-nao-pode-sair",
    plano: "Mensal",
    statusAssinatura: "ATIVA"
  }, { listas: 4, ultimaAtividade: "2026-08-22T12:00:00.000Z" });

  assert.equal(Object.hasOwn(usuario, "senha"), false);
  assert.equal(JSON.stringify(usuario).includes("segredo-que-nao-pode-sair"), false);
  assert.equal(usuario.temSenha, true);
  assert.deepEqual(admin.calcularResumo([
    usuario,
    { statusAssinatura: "SUSPENSA", listas: 2 },
    { statusAssinatura: "PENDENTE", listas: 0 }
  ]), {
    total: 3,
    contas: 3,
    semConta: 0,
    ativas: 1,
    suspensas: 1,
    pendentes: 1,
    listas: 6,
    listasVinculadas: 6,
    listasSemUsuario: 0
  });
});

test("une contas cadastradas e números encontrados nas listas sem alterar o histórico", () => {
  const resultado = admin.montarListagemUsuarios([
    {
      id: "conta-1",
      data: {
        nome: "Conta existente",
        telefone: "81999999999",
        senha: "segredo",
        statusAssinatura: "ATIVA"
      }
    }
  ], [
    { id: "lista-1", data: { userId: "81999999999", cliente: "Loja A", criadoEm: "2026-08-20T10:00:00.000Z" } },
    { id: "lista-2", data: { userId: "81988888888", cliente: "Loja antiga", criadoEm: "2026-08-19T10:00:00.000Z" } },
    { id: "lista-3", data: { userId: "81988888888", cliente: "Loja atual", atualizadoEm: "2026-08-21T10:00:00.000Z" } },
    { id: "lista-legada", data: { cliente: "Sem dono salvo", criadoEm: "2026-08-18T10:00:00.000Z" } }
  ]);

  assert.equal(resultado.usuarios.length, 2);
  const historico = resultado.usuarios.find((usuario) => usuario.contaCadastrada === false);
  assert.equal(historico.telefone, "81988888888");
  assert.equal(historico.nome, "Loja atual");
  assert.equal(historico.listas, 2);
  assert.equal(Object.hasOwn(historico, "senha"), false);
  assert.deepEqual(resultado.resumo, {
    total: 2,
    contas: 1,
    semConta: 1,
    ativas: 1,
    suspensas: 0,
    pendentes: 0,
    listas: 4,
    listasVinculadas: 3,
    listasSemUsuario: 1
  });
});

test("erro de login fica no painel e não abre o popup nativo do navegador", () => {
  const headers = {};
  let payload;
  const res = {
    setHeader(nome, valor) { headers[nome] = valor; },
    status(valor) {
      assert.equal(valor, 401);
      return this;
    },
    json(valor) {
      payload = valor;
      return valor;
    }
  };
  const error = new Error("ACESSO_NEGADO");
  error.status = 401;
  admin.responderErro(res, error);

  assert.equal(Object.hasOwn(headers, "WWW-Authenticate"), false);
  assert.match(payload.error, /senha de administrador incorretos/i);
});

test("troca para o acesso REST quando a conta técnica do Firebase está sem permissão", async () => {
  const servicos = {
    db: {},
    firestoreRest: { projectId: "projeto-teste", apiKey: "chave-teste" }
  };
  const resultado = await admin.executarComCompatibilidade(
    servicos,
    async () => {
      const error = new Error("Missing or insufficient permissions.");
      error.code = 7;
      throw error;
    },
    async (repositorio) => {
      assert.equal(typeof repositorio.consultar, "function");
      assert.equal(typeof repositorio.commit, "function");
      return "compatibilidade-ativa";
    }
  );
  assert.equal(resultado, "compatibilidade-ativa");
});

test("converte documentos do Firestore REST sem devolver formatos internos", () => {
  const documento = admin.documentoRestNormalizado({
    name: "projects/p/databases/(default)/documents/assinantes/conta-1",
    updateTime: "2026-08-22T12:00:00.000Z",
    fields: {
      nome: { stringValue: "Mercado Central" },
      ativo: { booleanValue: true },
      listas: { integerValue: "3" },
      atualizadoEm: { timestampValue: "2026-08-22T12:00:00.000Z" }
    }
  });
  assert.deepEqual(documento, {
    id: "conta-1",
    name: "projects/p/databases/(default)/documents/assinantes/conta-1",
    updateTime: "2026-08-22T12:00:00.000Z",
    data: {
      nome: "Mercado Central",
      ativo: true,
      listas: 3,
      atualizadoEm: "2026-08-22T12:00:00.000Z"
    }
  });
});

test("consulta o Firestore REST somente com os campos pedidos", async () => {
  const fetchOriginal = globalThis.fetch;
  let requisicao;
  globalThis.fetch = async (url, options) => {
    requisicao = { url: String(url), body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return [{
          document: {
            name: "projects/p/databases/(default)/documents/assinantes/conta-1",
            fields: { telefone: { stringValue: "81999999999" } }
          }
        }];
      }
    };
  };

  try {
    const repositorio = admin.criarRepositorioRest({ projectId: "p", apiKey: "chave" });
    const documentos = await repositorio.consultar("assinantes", {
      campo: "telefone",
      valor: "81999999999",
      campos: ["telefone"]
    });
    assert.equal(documentos[0].data.telefone, "81999999999");
    assert.match(requisicao.url, /documents:runQuery\?key=chave$/);
    assert.deepEqual(requisicao.body.structuredQuery.select, {
      fields: [{ fieldPath: "telefone" }]
    });
    assert.equal(
      requisicao.body.structuredQuery.where.fieldFilter.value.stringValue,
      "81999999999"
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
