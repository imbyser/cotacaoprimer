(function criarPainelCotacao(global) {
  "use strict";

  function dataEmMilissegundos(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") {
      return valor.seconds * 1000 + Math.floor(Number(valor.nanoseconds || 0) / 1e6);
    }
    if (valor instanceof Date) return valor.getTime();
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  function dataDaCotacao(cotacao) {
    return dataEmMilissegundos(cotacao?.atualizadoEm) ||
      dataEmMilissegundos(cotacao?.criadoEm);
  }

  function ordenarCotacoesRecentes(cotacoes) {
    return [...(Array.isArray(cotacoes) ? cotacoes : [])].sort((a, b) => {
      const diferenca = dataDaCotacao(b) - dataDaCotacao(a);
      if (diferenca !== 0) return diferenca;
      return String(b?.id || "").localeCompare(String(a?.id || ""), "pt-BR");
    });
  }

  function formatarData(valor) {
    const milissegundos = dataEmMilissegundos(valor);
    if (!milissegundos) return "Data não informada";

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(milissegundos)).replace(" de ", " ");
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function tituloDaCotacao(cotacao) {
    const cliente = String(cotacao?.cliente || "").trim();
    if (cliente && cliente.toLocaleLowerCase("pt-BR") !== "cliente") return cliente;
    const nomes = (Array.isArray(cotacao?.produtos) ? cotacao.produtos : [])
      .map((produto) => String(produto?.nome || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    return nomes.length ? nomes.join(" + ") : "Lista sem nome";
  }

  function criarCartaoCotacao(cotacao, aoAbrir) {
    const card = criarElemento("article", "lista-salva-card");
    const botao = criarElemento("button", "lista-salva-abrir");
    botao.type = "button";
    botao.addEventListener("click", () => aoAbrir(cotacao.id));

    const topo = criarElemento("div", "lista-salva-topo");
    const tituloTexto = tituloDaCotacao(cotacao);
    const titulo = criarElemento("h3", "", tituloTexto);
    const seta = criarElemento("span", "lista-salva-seta", "Abrir →");
    topo.append(titulo, seta);

    const produtos = Array.isArray(cotacao.produtos) ? cotacao.produtos.length : 0;
    const respostas = cotacao.ofertas && typeof cotacao.ofertas === "object"
      ? Object.keys(cotacao.ofertas).length
      : 0;
    const resumo = criarElemento("div", "lista-salva-resumo");
    resumo.append(
      criarElemento("span", "", `${produtos} ${produtos === 1 ? "produto" : "produtos"}`),
      criarElemento("span", "", `${respostas} ${respostas === 1 ? "resposta" : "respostas"}`)
    );

    const rodape = criarElemento(
      "p",
      "lista-salva-data",
      `Atualizada ${formatarData(cotacao.atualizadoEm || cotacao.criadoEm)}`
    );
    botao.setAttribute(
      "aria-label",
      `Abrir ${tituloTexto}, ${produtos} produtos, ${respostas} respostas`
    );
    botao.append(topo, resumo, rodape);
    card.appendChild(botao);
    return card;
  }

  function renderizarListas({ container, cotacoes, limite = Infinity, aoAbrir, mensagemVazia }) {
    if (!container) return;
    container.replaceChildren();
    const ordenadas = ordenarCotacoesRecentes(cotacoes).slice(0, limite);

    if (!ordenadas.length) {
      const vazio = criarElemento("div", "listas-vazio");
      vazio.append(
        criarElemento("strong", "", "Nenhuma lista salva ainda"),
        criarElemento("p", "", mensagemVazia || "Crie sua primeira lista digitando ou falando os produtos.")
      );
      container.appendChild(vazio);
      return;
    }

    ordenadas.forEach((cotacao) => container.appendChild(criarCartaoCotacao(cotacao, aoAbrir)));
  }

  global.CotacaoDashboardUI = Object.freeze({
    dataEmMilissegundos,
    ordenarCotacoesRecentes,
    formatarData,
    tituloDaCotacao,
    renderizarListas
  });
})(globalThis);
