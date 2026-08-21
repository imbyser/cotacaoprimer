import assert from "node:assert/strict";
import test from "node:test";

await import("../assets/quote-core.js");

const core = globalThis.CotacaoCore;

test("exige nome e sobrenome do fornecedor", () => {
  assert.equal(core.nomeCompletoValido("João"), false);
  assert.equal(core.nomeCompletoValido("  João   Silva  "), true);
  assert.equal(core.nomeCompletoValido("Ana Sá"), true);
});

test("interpreta preços brasileiros e calcula em centavos", () => {
  assert.equal(core.precoParaCentavos("27,90"), 2790);
  assert.equal(core.precoParaCentavos("1.234,56"), 123456);
  assert.equal(core.precoParaCentavos("1,234.56"), 123456);
  assert.equal(core.precoParaCentavos("27.9"), 2790);
  assert.equal(core.precoParaCentavos("texto"), null);
});

test("mantém compatibilidade com ofertas antigas por nome", () => {
  const produtos = [{ id: 0, nome: "Arroz 5kg", emb: "Fardo c/ 6" }];
  const ofertas = {
    "Maria Silva": { vendedor: "Maria Silva", precos: { "Arroz 5kg": 27.9 } },
    "João Souza": { vendedor: "João Souza", precos: { "Arroz 5kg": 28.5 } }
  };

  assert.deepEqual(core.calcularVencedores(produtos, ofertas), [{
    produtoId: "0",
    vencedor: "Maria Silva",
    precoCentavos: 2790
  }]);
});

test("distingue produtos com o mesmo nome usando o identificador", () => {
  const produtos = [
    { id: "A", nome: "Arroz", emb: "Fardo c/ 6" },
    { id: "B", nome: "Arroz", emb: "Unidade" }
  ];
  const ofertas = {
    "Maria Silva": {
      itens: [
        { produtoId: "A", preco: 10 },
        { produtoId: "B", preco: 20 }
      ]
    },
    "João Souza": {
      itens: [
        { produtoId: "A", preco: 11 },
        { produtoId: "B", preco: 19 }
      ]
    }
  };

  assert.deepEqual(core.calcularVencedores(produtos, ofertas), [
    { produtoId: "A", vencedor: "Maria Silva", precoCentavos: 1000 },
    { produtoId: "B", vencedor: "João Souza", precoCentavos: 1900 }
  ]);
});

test("soma quantidades sem erro de ponto flutuante e separa fornecedores", () => {
  const resumo = core.agruparPedidoPorFornecedor([
    { nome: "Arroz", quantidade: 3, precoCentavos: 1001, vencedor: "Maria Silva" },
    { nome: "Feijão", quantidade: 2, precoCentavos: 255, vencedor: "João Souza" },
    { nome: "Sem preço", quantidade: 9, precoCentavos: 0, vencedor: "Sem oferta" }
  ]);

  assert.equal(resumo.totalCentavos, 3513);
  assert.deepEqual(resumo.fornecedores.map((grupo) => [grupo.fornecedor, grupo.totalCentavos]), [
    ["Maria Silva", 3003],
    ["João Souza", 510]
  ]);
});
