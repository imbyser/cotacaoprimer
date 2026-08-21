import assert from "node:assert/strict";
import test from "node:test";

import { voiceListInternals } from "../api/voice-list.js";

test("limpa, limita e remove produtos repetidos retornados pela IA", () => {
  assert.deepEqual(voiceListInternals.limparProdutosIA([
    { nome: "  Arroz   5kg ", emb: " Fardo com 6 " },
    { name: "arroz 5kg", packaging: "fardo com 6" },
    { name: "Feijão", packaging: "" },
    { name: "", packaging: "Caixa" }
  ]), [
    { nome: "Arroz 5kg", emb: "Fardo com 6" },
    { nome: "Feijão", emb: "" }
  ]);
});

test("extrai JSON mesmo quando a resposta vem cercada por markdown", () => {
  assert.deepEqual(
    voiceListInternals.extrairJson('```json\n{"produtos":[{"nome":"Cebola","emb":""}]}\n```'),
    { produtos: [{ nome: "Cebola", emb: "" }] }
  );
});

test("rejeita áudio fora dos formatos aceitos", () => {
  assert.throws(
    () => voiceListInternals.decodificarAudio("data:text/plain;base64,SGVsbG8=", "text/plain"),
    /AUDIO_INVALIDO/
  );
});
