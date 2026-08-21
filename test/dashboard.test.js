import assert from "node:assert/strict";
import test from "node:test";

await import("../assets/dashboard.js");

const painel = globalThis.CotacaoDashboardUI;

test("ordena listas pela última atualização e usa criação como fallback", () => {
  const listas = painel.ordenarCotacoesRecentes([
    { id: "antiga", atualizadoEm: new Date("2026-01-01T10:00:00Z") },
    { id: "nova", atualizadoEm: { seconds: 1787313600, nanoseconds: 0 } },
    { id: "meio", criadoEm: new Date("2026-04-01T10:00:00Z") }
  ]);

  assert.deepEqual(listas.map((item) => item.id), ["nova", "meio", "antiga"]);
});

test("não altera a ordem original recebida", () => {
  const original = [
    { id: "a", atualizadoEm: new Date("2026-01-01T00:00:00Z") },
    { id: "b", atualizadoEm: new Date("2026-02-01T00:00:00Z") }
  ];

  painel.ordenarCotacoesRecentes(original);
  assert.deepEqual(original.map((item) => item.id), ["a", "b"]);
});

test("usa os primeiros produtos quando a lista ainda não recebeu nome", () => {
  assert.equal(painel.tituloDaCotacao({
    cliente: "Cliente",
    produtos: [{ nome: "Cebola" }, { nome: "Tomate" }, { nome: "Feijão" }]
  }), "Cebola + Tomate");
});
