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

test("separa listas ativas, apagadas e vencidas sem alterar documentos antigos", () => {
  const agora = new Date("2026-08-27T12:00:00Z").getTime();
  const grupos = painel.separarCotacoes([
    { id: "antiga-sem-campos", cliente: "Mercado Antigo" },
    {
      id: "apagada-recente",
      excluidoEm: new Date("2026-08-25T12:00:00Z"),
      excluirDefinitivamenteEm: new Date("2026-09-01T12:00:00Z")
    },
    {
      id: "apagada-vencida",
      excluidoEm: new Date("2026-08-10T12:00:00Z"),
      excluirDefinitivamenteEm: new Date("2026-08-17T12:00:00Z")
    }
  ], agora);

  assert.deepEqual(grupos.ativas.map((item) => item.id), ["antiga-sem-campos"]);
  assert.deepEqual(grupos.apagadas.map((item) => item.id), ["apagada-recente"]);
  assert.deepEqual(grupos.expiradas.map((item) => item.id), ["apagada-vencida"]);
});

test("calcula os 7 dias mesmo para uma lista sem data final explícita", () => {
  const excluidoEm = new Date("2026-08-27T12:00:00Z");
  const cotacao = { excluidoEm };
  assert.equal(
    painel.dataDaExclusaoDefinitiva(cotacao),
    excluidoEm.getTime() + (7 * 24 * 60 * 60 * 1000)
  );
  assert.equal(painel.textoPrazoExclusao(cotacao, excluidoEm.getTime()), "Será apagada em 7 dias");
});

test("mantém lixeira, confirmação e restauração dentro do painel", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="deletedLists"/);
  assert.match(html, /id="listaExcluirModal"[^>]*role="dialog"/);
  assert.match(html, /excluidoEm: serverTimestamp\(\)/);
  assert.match(html, /excluidoEm: null,[\s\S]*excluirDefinitivamenteEm: null/);
});

test("permite digitar a quantidade e repetir mais ou menos ao manter pressionado", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /quantidade\.inputMode = 'numeric'/);
  assert.doesNotMatch(html, /quantidade\.readOnly = true/);
  assert.match(html, /setTimeout\(\(\) => \{[\s\S]*setInterval\(\(\) => alterarQtd\(botao, delta\), 130\);[\s\S]*\}, 450\);/);
});

test("usa os primeiros produtos quando a lista ainda não recebeu nome", () => {
  assert.equal(painel.tituloDaCotacao({
    cliente: "Cliente",
    produtos: [{ nome: "Cebola" }, { nome: "Tomate" }, { nome: "Feijão" }]
  }), "Cebola + Tomate");
});
