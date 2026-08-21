import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const vendas = await readFile(new URL("../vendas.html", import.meta.url), "utf8");
const landing = await readFile(new URL("../assets/landing.js", import.meta.url), "utf8");

test("exibe os novos valores e os totais cobrados sem mudar os planos", () => {
  for (const texto of [
    "R$ 149,00",
    "R$ 109,00",
    "R$ 327,00",
    "R$ 89,00",
    "R$ 1.068,00"
  ]) {
    assert.equal(vendas.includes(texto), true, `valor ausente na página: ${texto}`);
  }

  assert.equal(landing.includes('resumo: "R$ 149,00 por mês"'), true);
  assert.equal(landing.includes('resumo: "R$ 327,00 a cada 3 meses"'), true);
  assert.equal(landing.includes('resumo: "R$ 1.068,00 por ano"'), true);
});
