(function criarPainelCotacao(global) {
  "use strict";

  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  const PRAZO_LIXEIRA_MS = 7 * UM_DIA_MS;

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

  function dataDaExclusao(cotacao) {
    return dataEmMilissegundos(cotacao?.excluidoEm);
  }

  function cotacaoExcluida(cotacao) {
    return dataDaExclusao(cotacao) > 0;
  }

  function dataDaExclusaoDefinitiva(cotacao) {
    return dataEmMilissegundos(cotacao?.excluirDefinitivamenteEm) ||
      (dataDaExclusao(cotacao) ? dataDaExclusao(cotacao) + PRAZO_LIXEIRA_MS : 0);
  }

  function cotacaoExpirada(cotacao, agora = Date.now()) {
    const limite = dataDaExclusaoDefinitiva(cotacao);
    return cotacaoExcluida(cotacao) && limite > 0 && limite <= agora;
  }

  function separarCotacoes(cotacoes, agora = Date.now()) {
    return (Array.isArray(cotacoes) ? cotacoes : []).reduce((grupos, cotacao) => {
      if (!cotacaoExcluida(cotacao)) {
        grupos.ativas.push(cotacao);
      } else if (cotacaoExpirada(cotacao, agora)) {
        grupos.expiradas.push(cotacao);
      } else {
        grupos.apagadas.push(cotacao);
      }
      return grupos;
    }, { ativas: [], apagadas: [], expiradas: [] });
  }

  function ordenarCotacoesRecentes(cotacoes) {
    return [...(Array.isArray(cotacoes) ? cotacoes : [])].sort((a, b) => {
      const diferenca = dataDaCotacao(b) - dataDaCotacao(a);
      if (diferenca !== 0) return diferenca;
      return String(b?.id || "").localeCompare(String(a?.id || ""), "pt-BR");
    });
  }

  function ordenarCotacoesApagadas(cotacoes) {
    return [...(Array.isArray(cotacoes) ? cotacoes : [])].sort((a, b) => {
      const diferenca = dataDaExclusao(b) - dataDaExclusao(a);
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

  function textoPrazoExclusao(cotacao, agora = Date.now()) {
    const limite = dataDaExclusaoDefinitiva(cotacao);
    if (!limite || limite <= agora) return "Prazo encerrado";
    const dias = Math.max(1, Math.ceil((limite - agora) / UM_DIA_MS));
    return dias === 1 ? "Será apagada em 1 dia" : `Será apagada em ${dias} dias`;
  }

  function criarCartaoCotacao(cotacao, aoAbrir, aoExcluir) {
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

    if (typeof aoExcluir === "function") {
      const acoes = criarElemento("div", "lista-salva-acoes");
      const excluir = criarElemento("button", "lista-excluir", "Excluir lista");
      excluir.type = "button";
      excluir.setAttribute("aria-label", `Excluir ${tituloTexto}`);
      excluir.addEventListener("click", () => aoExcluir(cotacao.id));
      acoes.appendChild(excluir);
      card.appendChild(acoes);
    }
    return card;
  }

  function criarCartaoApagado(cotacao, aoRestaurar) {
    const card = criarElemento("article", "lista-salva-card lista-apagada-card");
    const conteudo = criarElemento("div", "lista-apagada-conteudo");
    const tituloTexto = tituloDaCotacao(cotacao);
    const titulo = criarElemento("h3", "", tituloTexto);
    const produtos = Array.isArray(cotacao.produtos) ? cotacao.produtos.length : 0;
    const respostas = cotacao.ofertas && typeof cotacao.ofertas === "object"
      ? Object.keys(cotacao.ofertas).length
      : 0;
    const resumo = criarElemento("div", "lista-salva-resumo");
    resumo.append(
      criarElemento("span", "", `${produtos} ${produtos === 1 ? "produto" : "produtos"}`),
      criarElemento("span", "", `${respostas} ${respostas === 1 ? "resposta" : "respostas"}`)
    );
    const prazo = criarElemento(
      "p",
      "lista-salva-data lista-apagada-prazo",
      `${textoPrazoExclusao(cotacao)}. Você ainda pode restaurar.`
    );
    conteudo.append(titulo, resumo, prazo);

    const acoes = criarElemento("div", "lista-apagada-acoes");
    const restaurar = criarElemento("button", "lista-restaurar", "Restaurar lista");
    restaurar.type = "button";
    restaurar.setAttribute("aria-label", `Restaurar ${tituloTexto}`);
    restaurar.addEventListener("click", () => aoRestaurar(cotacao.id));
    acoes.appendChild(restaurar);
    card.append(conteudo, acoes);
    return card;
  }

  function renderizarListas({ container, cotacoes, limite = Infinity, aoAbrir, aoExcluir, mensagemVazia }) {
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

    ordenadas.forEach((cotacao) => container.appendChild(criarCartaoCotacao(cotacao, aoAbrir, aoExcluir)));
  }

  function renderizarApagadas({ container, cotacoes, aoRestaurar }) {
    if (!container) return;
    container.replaceChildren();
    const apagadas = ordenarCotacoesApagadas(cotacoes);

    if (!apagadas.length) {
      const vazio = criarElemento("div", "listas-vazio listas-vazio-apagados");
      vazio.append(
        criarElemento("strong", "", "Nenhuma lista apagada"),
        criarElemento("p", "", "Quando você excluir uma lista, ela ficará aqui por 7 dias.")
      );
      container.appendChild(vazio);
      return;
    }

    apagadas.forEach((cotacao) => container.appendChild(criarCartaoApagado(cotacao, aoRestaurar)));
  }

  global.CotacaoDashboardUI = Object.freeze({
    dataEmMilissegundos,
    dataDaExclusaoDefinitiva,
    cotacaoExcluida,
    cotacaoExpirada,
    separarCotacoes,
    ordenarCotacoesRecentes,
    ordenarCotacoesApagadas,
    formatarData,
    textoPrazoExclusao,
    tituloDaCotacao,
    renderizarListas,
    renderizarApagadas
  });
})(globalThis);
