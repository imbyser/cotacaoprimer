import assert from "node:assert/strict";
import test from "node:test";

await import("../assets/order-panel.js");

const painel = globalThis.CotacaoPedidoUI;
const formatar = (centavos) => (Number(centavos || 0) / 100).toFixed(2).replace(".", ",");

test("monta o resumo fechado com produtos, unidades e total", () => {
  const modelo = painel.criarModelo({
    totalCentavos: 6700,
    fornecedores: [
      {
        fornecedor: "Thiago Lima (Rio Vale)",
        totalCentavos: 6200,
        itens: [
          {
            nome: "Arroz 5kg",
            emb: "Fardo c/ 6",
            quantidade: 1,
            precoCentavos: 1200,
            subtotalCentavos: 1200
          },
          {
            nome: "Calabresa",
            emb: "Embalagem",
            quantidade: 1,
            precoCentavos: 5000,
            subtotalCentavos: 5000
          }
        ]
      },
      {
        fornecedor: "João Pedro",
        totalCentavos: 500,
        itens: [
          {
            nome: "Pão",
            emb: "Embalagem",
            quantidade: 2,
            precoCentavos: 250,
            subtotalCentavos: 500
          }
        ]
      }
    ]
  }, formatar);

  assert.equal(modelo.totalFormatado, "67,00");
  assert.equal(modelo.quantidadeFornecedores, 2);
  assert.deepEqual(
    modelo.fornecedores.map((fornecedor) => ({
      nome: fornecedor.fornecedor,
      produtos: fornecedor.quantidadeProdutos,
      unidades: fornecedor.quantidadeUnidades,
      total: fornecedor.totalFormatado
    })),
    [
      { nome: "Thiago Lima (Rio Vale)", produtos: 2, unidades: 2, total: "62,00" },
      { nome: "João Pedro", produtos: 1, unidades: 2, total: "5,00" }
    ]
  );
});

test("suporta vinte fornecedores sem misturar seus itens", () => {
  const fornecedores = Array.from({ length: 20 }, (_, indice) => ({
    fornecedor: `Fornecedor ${indice + 1}`,
    totalCentavos: (indice + 1) * 100,
    itens: [{
      nome: `Produto ${indice + 1}`,
      emb: "Caixa",
      quantidade: 1,
      precoCentavos: (indice + 1) * 100,
      subtotalCentavos: (indice + 1) * 100
    }]
  }));
  const modelo = painel.criarModelo({ totalCentavos: 21000, fornecedores }, formatar);

  assert.equal(modelo.quantidadeFornecedores, 20);
  assert.equal(modelo.fornecedores[0].itens[0].nome, "Produto 1");
  assert.equal(modelo.fornecedores[19].itens[0].nome, "Produto 20");
  assert.equal(painel.LIMITE_PARA_BUSCA, 8);
});

test("a busca ignora maiúsculas e acentos", () => {
  assert.equal(painel.normalizarBusca("  João Comércio  "), "joao comercio");
});
