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
  ]), { total: 3, ativas: 1, suspensas: 1, pendentes: 1, listas: 6 });
});
