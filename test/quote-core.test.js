import assert from "node:assert/strict";
import test from "node:test";

await import("../assets/quote-core.js");

const core = globalThis.CotacaoCore;

test("exige nome e sobrenome do fornecedor", () => {
  assert.equal(core.nomeCompletoValido("João"), false);
  assert.equal(core.nomeCompletoValido("  João   Silva  "), true);
  assert.equal(core.nomeCompletoValido("Ana Sá"), true);
});

test("exige nome da loja e WhatsApp com DDD antes do envio", () => {
  assert.deepEqual(core.validarDadosLoja("", "(81) 99999-9999"), {
    valido: false,
    campo: "nomeCliente",
    mensagem: "Digite o nome da loja para continuar."
  });
  assert.deepEqual(core.validarDadosLoja("Cliente", "(81) 99999-9999"), {
    valido: false,
    campo: "nomeCliente",
    mensagem: "Digite o nome da loja para continuar."
  });
  assert.deepEqual(core.validarDadosLoja("Mercado Central", "9999"), {
    valido: false,
    campo: "telCliente",
    mensagem: "Digite um WhatsApp válido da loja, com DDD."
  });
  assert.deepEqual(core.validarDadosLoja("  Mercado   Central ", "(81) 99999-9999"), {
    valido: true,
    nome: "Mercado Central",
    telefone: "81999999999"
  });
});

test("gera link, mensagem de WhatsApp e dados do compartilhamento sem carregar parâmetros antigos", () => {
  const link = core.criarLinkVendedor(
    "https://cotacaoprimer.vercel.app/index.html?pagamento=aprovado#listas",
    "COT-123"
  );
  assert.equal(link, "https://cotacaoprimer.vercel.app/index.html?c=COT-123&e=2");

  const mensagem = core.criarMensagemSolicitacao("  Mercado   Central ", link);
  assert.match(mensagem, /Cliente: \*Mercado Central\*/);
  assert.match(mensagem, /COT-123/);
  assert.equal(
    core.criarUrlWhatsApp(mensagem),
    `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  );
  assert.deepEqual(core.criarDadosCompartilhamento("Mercado Central", link), {
    title: "Cotação de Mercado Central",
    text: "Mercado Central enviou uma lista para você informar seus preços.",
    url: link
  });
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

test("cria rascunho sem apagar o texto ainda incompleto", () => {
  const rascunho = core.criarRascunhoCotacao({
    usuario: "(81) 99999-9999",
    cotacaoId: "COT-123",
    cliente: "Mercado do Bairro ",
    produtos: [
      { id: "P-1", nome: "Arroz ", emb: "Fardo c/ 6" },
      { id: 2, nome: "", emb: "Caixa" }
    ],
    salvoEm: 123456
  });

  assert.deepEqual(rascunho, {
    versao: 1,
    usuario: "81999999999",
    cotacaoId: "COT-123",
    cliente: "Mercado do Bairro ",
    tel: "",
    prazo: "",
    tipo: "",
    produtos: [
      { id: "P-1", nome: "Arroz ", emb: "Fardo c/ 6" },
      { id: 2, nome: "", emb: "Caixa" }
    ],
    salvoEm: 123456
  });
  assert.equal(core.rascunhoCotacaoValido(rascunho, "81999999999"), true);
});

test("não aceita rascunho de outro usuário ou em formato inválido", () => {
  const rascunho = core.criarRascunhoCotacao({
    usuario: "81999999999",
    produtos: [{ id: "P-1", nome: "Feijão", emb: "Fardo" }],
    salvoEm: 123456
  });

  assert.equal(core.rascunhoCotacaoValido(rascunho, "11999999999"), false);
  assert.equal(core.rascunhoCotacaoValido({ ...rascunho, produtos: "Feijão" }, "81999999999"), false);
  assert.equal(core.rascunhoCotacaoValido({ ...rascunho, versao: 99 }, "81999999999"), false);
});
