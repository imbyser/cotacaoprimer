(function criarNucleoCotacao(global) {
  "use strict";

  const SEM_OFERTA = "Sem oferta";

  function normalizarEspacos(valor) {
    return String(valor || "").trim().replace(/\s+/g, " ");
  }

  function nomeCompletoValido(valor) {
    const partes = normalizarEspacos(valor).split(" ").filter(Boolean);
    return partes.length >= 2 && partes.every((parte) => /[\p{L}\p{N}]/u.test(parte));
  }

  function precoParaCentavos(valor) {
    if (typeof valor === "number") {
      if (!Number.isFinite(valor) || valor < 0) return null;
      const centavos = Math.round(valor * 100);
      return Number.isSafeInteger(centavos) ? centavos : null;
    }

    let texto = String(valor ?? "")
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\s+/g, "");

    if (!texto || !/^\d[\d.,]*$/.test(texto)) return null;

    const ultimaVirgula = texto.lastIndexOf(",");
    const ultimoPonto = texto.lastIndexOf(".");
    let separadorDecimal = "";

    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
      separadorDecimal = ultimaVirgula > ultimoPonto ? "," : ".";
    } else {
      const separador = ultimaVirgula >= 0 ? "," : ultimoPonto >= 0 ? "." : "";
      if (separador) {
        const ocorrencias = texto.split(separador).length - 1;
        const casasFinais = texto.length - texto.lastIndexOf(separador) - 1;
        if (casasFinais >= 1 && casasFinais <= 2) {
          separadorDecimal = separador;
        } else if (ocorrencias > 1 && casasFinais > 0 && casasFinais !== 3) {
          return null;
        }
      }
    }

    let inteiro;
    let decimal = "";

    if (separadorDecimal) {
      const indiceDecimal = texto.lastIndexOf(separadorDecimal);
      inteiro = texto.slice(0, indiceDecimal).replace(/[.,]/g, "");
      decimal = texto.slice(indiceDecimal + 1);
      if (!/^\d{1,2}$/.test(decimal)) return null;
    } else {
      inteiro = texto.replace(/[.,]/g, "");
    }

    if (!/^\d+$/.test(inteiro)) return null;
    const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0") || 0);
    return Number.isSafeInteger(centavos) ? centavos : null;
  }

  function centavosParaNumero(centavos) {
    return Number((Number(centavos || 0) / 100).toFixed(2));
  }

  function formatarCentavos(centavos) {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(centavos || 0) / 100);
  }

  function chaveDoProduto(produto, indice = 0) {
    const id = produto && produto.id;
    if (id !== undefined && id !== null && String(id) !== "") return String(id);
    return `indice:${indice}`;
  }

  function precoDaOfertaEmCentavos(oferta, produto, indice) {
    if (!oferta || typeof oferta !== "object") return null;

    const chave = chaveDoProduto(produto, indice);
    if (Array.isArray(oferta.itens)) {
      const item = oferta.itens.find((candidato) => {
        if (!candidato || String(candidato.produtoId ?? "") !== chave) return false;
        if (
          candidato.nomeProduto &&
          normalizarEspacos(candidato.nomeProduto) !== normalizarEspacos(produto?.nome)
        ) return false;
        if (
          candidato.embProduto &&
          normalizarEspacos(candidato.embProduto) !== normalizarEspacos(produto?.emb)
        ) return false;
        return true;
      });
      const centavosItem = item ? precoParaCentavos(item.preco) : null;
      if (centavosItem !== null) return centavosItem;
    }

    if (
      oferta.precosPorProduto &&
      typeof oferta.precosPorProduto === "object" &&
      Object.prototype.hasOwnProperty.call(oferta.precosPorProduto, chave)
    ) {
      return precoParaCentavos(oferta.precosPorProduto[chave]);
    }

    const mapaLegado = oferta.precos && typeof oferta.precos === "object"
      ? oferta.precos
      : oferta;
    const nome = String(produto?.nome || "");

    if (nome && Object.prototype.hasOwnProperty.call(mapaLegado, nome)) {
      return precoParaCentavos(mapaLegado[nome]);
    }

    return null;
  }

  function calcularVencedores(produtos, ofertas) {
    const listaProdutos = Array.isArray(produtos) ? produtos : [];
    const listaOfertas = ofertas && typeof ofertas === "object" ? ofertas : {};

    return listaProdutos.map((produto, indice) => {
      let vencedor = SEM_OFERTA;
      let precoCentavos = null;

      for (const [nomeFornecedor, oferta] of Object.entries(listaOfertas)) {
        const candidato = precoDaOfertaEmCentavos(oferta, produto, indice);
        if (candidato === null || candidato <= 0) continue;

        if (precoCentavos === null || candidato < precoCentavos) {
          precoCentavos = candidato;
          vencedor = nomeFornecedor;
        }
      }

      return {
        produtoId: chaveDoProduto(produto, indice),
        vencedor,
        precoCentavos: precoCentavos || 0
      };
    });
  }

  function agruparPedidoPorFornecedor(itens) {
    const grupos = new Map();
    let totalCentavos = 0;

    for (const item of Array.isArray(itens) ? itens : []) {
      const quantidade = Math.max(1, Number.parseInt(item?.quantidade, 10) || 1);
      const precoCentavos = Number.parseInt(item?.precoCentavos, 10);
      const vencedor = normalizarEspacos(item?.vencedor) || SEM_OFERTA;

      if (!Number.isSafeInteger(precoCentavos) || precoCentavos <= 0) continue;

      const subtotalCentavos = precoCentavos * quantidade;
      if (!Number.isSafeInteger(subtotalCentavos)) continue;
      totalCentavos += subtotalCentavos;

      if (vencedor === SEM_OFERTA) continue;
      if (!grupos.has(vencedor)) {
        grupos.set(vencedor, { fornecedor: vencedor, totalCentavos: 0, itens: [] });
      }

      const grupo = grupos.get(vencedor);
      grupo.totalCentavos += subtotalCentavos;
      grupo.itens.push({
        ...item,
        quantidade,
        precoCentavos,
        subtotalCentavos
      });
    }

    return { totalCentavos, fornecedores: Array.from(grupos.values()) };
  }

  global.CotacaoCore = Object.freeze({
    SEM_OFERTA,
    normalizarEspacos,
    nomeCompletoValido,
    precoParaCentavos,
    centavosParaNumero,
    formatarCentavos,
    chaveDoProduto,
    precoDaOfertaEmCentavos,
    calcularVencedores,
    agruparPedidoPorFornecedor
  });
})(globalThis);
