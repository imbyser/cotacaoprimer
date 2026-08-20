import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/checkout.js";

function criarResposta() {
  return {
    body: undefined,
    headers: new Map(),
    statusCode: 200,
    setHeader(nome, valor) {
      this.headers.set(nome.toLowerCase(), valor);
    },
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
}

function criarRequisicao(overrides = {}) {
  return {
    method: "POST",
    headers: {
      host: "cotacao-prime.test",
      origin: "https://cotacao-prime.test",
      "x-forwarded-proto": "https"
    },
    query: {},
    body: {},
    ...overrides
  };
}

test("recusa cadastro incompleto antes de abrir qualquer serviço externo", async () => {
  const req = criarRequisicao({
    body: { nome: "A", telefone: "81", senha: "123", plano: "Mensal", valor: 0.01 }
  });
  const res = criarResposta();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Confira os dados e tente novamente.");
});

test("recusa um plano que não existe", async () => {
  const req = criarRequisicao({
    body: {
      nome: "Mercado Teste",
      telefone: "81999999999",
      senha: "senha-segura",
      plano: "Plano inventado",
      valor: 0.01
    }
  });
  const res = criarResposta();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

test("recusa chamadas de outro site", async () => {
  const req = criarRequisicao({
    headers: {
      host: "cotacao-prime.test",
      origin: "https://site-malicioso.test",
      "x-forwarded-proto": "https"
    },
    body: {
      nome: "Mercado Teste",
      telefone: "81999999999",
      senha: "senha-segura",
      plano: "Mensal"
    }
  });
  const res = criarResposta();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Origem não permitida.");
});

test("não aceita GET no checkout", async () => {
  const req = criarRequisicao({ method: "GET" });
  const res = criarResposta();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.get("allow"), "POST, OPTIONS");
});
