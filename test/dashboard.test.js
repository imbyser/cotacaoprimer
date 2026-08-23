import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../assets/dashboard.js");

const painel = globalThis.CotacaoDashboardUI;

test("usa a logo colorida correta no dashboard escuro sem filtro branco", async () => {
  const [html, css, logo] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../assets/cotacao-prime-logo-on-dark.svg", import.meta.url), "utf8")
  ]);
  assert.match(html, /class="dashboard-logo" src="assets\/cotacao-prime-logo-on-dark\.svg"/);
  assert.doesNotMatch(css, /\.dashboard-logo\s*\{[^}]*filter:/s);
  assert.match(logo, /fill="#fffaf0"[^>]*>COTAÇÃO</);
  assert.match(logo, /fill="#74d9a5"[^>]*>PRIME</);
});

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
