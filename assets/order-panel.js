(function criarModuloPainelDePedidos(global) {
  "use strict";

  const LIMITE_PARA_BUSCA = 8;

  function textoQuantidade(quantidade, singular, plural) {
    return `${quantidade} ${quantidade === 1 ? singular : plural}`;
  }

  function normalizarBusca(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  }

  function criarModelo(resumo, formatarCentavos) {
    const formatar = typeof formatarCentavos === "function"
      ? formatarCentavos
      : (valor) => String(valor || 0);
    const fornecedores = Array.isArray(resumo?.fornecedores) ? resumo.fornecedores : [];

    return {
      totalCentavos: Number(resumo?.totalCentavos) || 0,
      totalFormatado: formatar(Number(resumo?.totalCentavos) || 0),
      quantidadeFornecedores: fornecedores.length,
      fornecedores: fornecedores.map((grupo, indice) => {
        const itens = Array.isArray(grupo?.itens) ? grupo.itens : [];
        const quantidadeUnidades = itens.reduce(
          (total, item) => total + Math.max(1, Number.parseInt(item?.quantidade, 10) || 1),
          0
        );

        return {
          indice: indice + 1,
          fornecedor: String(grupo?.fornecedor || "Fornecedor"),
          totalCentavos: Number(grupo?.totalCentavos) || 0,
          totalFormatado: formatar(Number(grupo?.totalCentavos) || 0),
          quantidadeProdutos: itens.length,
          quantidadeUnidades,
          itens: itens.map((item) => ({
            nome: String(item?.nome || "Produto"),
            emb: String(item?.emb || ""),
            quantidade: Math.max(1, Number.parseInt(item?.quantidade, 10) || 1),
            precoFormatado: formatar(Number(item?.precoCentavos) || 0),
            subtotalFormatado: formatar(Number(item?.subtotalCentavos) || 0)
          }))
        };
      })
    };
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function criarCabecalho(modelo) {
    const cabecalho = criarElemento("div", "pedido-painel-cabecalho");
    const textos = criarElemento("div", "pedido-painel-titulos");
    const titulo = criarElemento("h2", "pedido-painel-titulo", "Pedidos por fornecedor");
    titulo.id = "pedidoPainelTitulo";
    const ajuda = criarElemento(
      "p",
      "pedido-painel-ajuda",
      "Toque em um fornecedor para conferir os itens e enviar o pedido."
    );
    textos.append(titulo, ajuda);

    const contador = criarElemento("div", "pedido-painel-contador");
    contador.setAttribute("aria-label", textoQuantidade(
      modelo.quantidadeFornecedores,
      "fornecedor com itens",
      "fornecedores com itens"
    ));
    contador.append(
      criarElemento("strong", "", String(modelo.quantidadeFornecedores)),
      criarElemento(
        "span",
        "",
        modelo.quantidadeFornecedores === 1 ? "fornecedor" : "fornecedores"
      )
    );
    cabecalho.append(textos, contador);
    return cabecalho;
  }

  function criarItemDoPedido(item) {
    const linha = criarElemento("li", "pedido-item");
    const identificacao = criarElemento("div", "pedido-item-identificacao");
    identificacao.append(
      criarElemento("strong", "pedido-item-nome", item.nome),
      criarElemento("span", "pedido-item-embalagem", item.emb || "Embalagem não informada")
    );

    const valores = criarElemento("div", "pedido-item-valores");
    valores.append(
      criarElemento("span", "pedido-item-calculo", `${item.quantidade} × R$ ${item.precoFormatado}`),
      criarElemento("strong", "pedido-item-subtotal", `R$ ${item.subtotalFormatado}`)
    );
    linha.append(identificacao, valores);
    return linha;
  }

  function criarFornecedor(modeloFornecedor, aoEnviar) {
    const detalhes = criarElemento("details", "pedido-fornecedor");
    detalhes.dataset.fornecedor = modeloFornecedor.fornecedor;
    detalhes.dataset.busca = normalizarBusca(modeloFornecedor.fornecedor);

    const resumo = criarElemento("summary", "pedido-fornecedor-resumo");
    resumo.setAttribute("aria-label", `${modeloFornecedor.fornecedor}. ${textoQuantidade(
      modeloFornecedor.quantidadeProdutos,
      "produto",
      "produtos"
    )}. Total R$ ${modeloFornecedor.totalFormatado}. Toque para abrir.`);

    const indice = criarElemento(
      "span",
      "pedido-fornecedor-indice",
      String(modeloFornecedor.indice).padStart(2, "0")
    );
    indice.setAttribute("aria-hidden", "true");

    const identificacao = criarElemento("span", "pedido-fornecedor-identificacao");
    identificacao.append(
      criarElemento("strong", "pedido-fornecedor-nome", modeloFornecedor.fornecedor),
      criarElemento(
        "small",
        "pedido-fornecedor-meta",
        `${textoQuantidade(modeloFornecedor.quantidadeProdutos, "produto", "produtos")} · ${textoQuantidade(
          modeloFornecedor.quantidadeUnidades,
          "unidade",
          "unidades"
        )}`
      )
    );

    const total = criarElemento("span", "pedido-fornecedor-total");
    total.append(
      criarElemento("small", "", "Total"),
      criarElemento("strong", "", `R$ ${modeloFornecedor.totalFormatado}`)
    );

    const seta = criarElemento("span", "pedido-fornecedor-seta", "+");
    seta.setAttribute("aria-hidden", "true");
    resumo.append(indice, identificacao, total, seta);

    const corpo = criarElemento("div", "pedido-fornecedor-corpo");
    const lista = criarElemento("ul", "pedido-itens");
    modeloFornecedor.itens.forEach((item) => lista.appendChild(criarItemDoPedido(item)));

    const botao = criarElemento("button", "btn-send-vendor", "Enviar pelo WhatsApp");
    botao.type = "button";
    botao.setAttribute("aria-label", `Enviar pedido para ${modeloFornecedor.fornecedor} pelo WhatsApp`);
    botao.addEventListener("click", () => aoEnviar(modeloFornecedor.fornecedor));
    corpo.append(lista, botao);
    detalhes.append(resumo, corpo);
    return detalhes;
  }

  function adicionarBusca(container, lista, quantidadeFornecedores) {
    if (quantidadeFornecedores < LIMITE_PARA_BUSCA) return;

    const busca = criarElemento("div", "pedido-busca");
    const label = criarElemento("label", "pedido-busca-label", "Encontrar fornecedor");
    label.htmlFor = "buscaFornecedorPedido";
    const input = criarElemento("input", "pedido-busca-input");
    input.id = "buscaFornecedorPedido";
    input.type = "search";
    input.placeholder = "Digite o nome do fornecedor";
    input.autocomplete = "off";
    const status = criarElemento("p", "pedido-busca-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    input.addEventListener("input", () => {
      const termo = normalizarBusca(input.value);
      let visiveis = 0;
      lista.querySelectorAll(".pedido-fornecedor").forEach((cartao) => {
        const mostrar = !termo || cartao.dataset.busca.includes(termo);
        cartao.hidden = !mostrar;
        if (mostrar) visiveis += 1;
      });
      status.hidden = visiveis > 0;
      status.textContent = visiveis > 0 ? "" : "Nenhum fornecedor encontrado.";
    });

    busca.append(label, input, status);
    container.appendChild(busca);
  }

  function renderizar({ container, resumo, formatarCentavos, aoEnviar }) {
    if (!container) throw new Error("CONTAINER_PEDIDO_AUSENTE");

    const fornecedorAberto = container.querySelector(".pedido-fornecedor[open]")?.dataset.fornecedor || "";
    const modelo = criarModelo(resumo, formatarCentavos);
    container.replaceChildren();
    container.classList.add("pedido-painel");
    container.setAttribute("aria-labelledby", "pedidoPainelTitulo");

    if (modelo.quantidadeFornecedores === 0) {
      const vazio = criarElemento(
        "p",
        "pedido-vazio",
        "Aguardando os fornecedores enviarem preços. Os pedidos aparecerão aqui."
      );
      container.removeAttribute("aria-labelledby");
      container.appendChild(vazio);
      return modelo;
    }

    container.appendChild(criarCabecalho(modelo));
    const lista = criarElemento("div", "pedido-fornecedores-lista");
    adicionarBusca(container, lista, modelo.quantidadeFornecedores);

    modelo.fornecedores.forEach((fornecedor) => {
      const cartao = criarFornecedor(
        fornecedor,
        typeof aoEnviar === "function" ? aoEnviar : () => {}
      );
      if (fornecedor.fornecedor === fornecedorAberto) {
        cartao.open = true;
        cartao.querySelector(".pedido-fornecedor-seta").textContent = "−";
      }
      cartao.addEventListener("toggle", () => {
        cartao.querySelector(".pedido-fornecedor-seta").textContent = cartao.open ? "−" : "+";
        if (!cartao.open) return;
        lista.querySelectorAll(".pedido-fornecedor[open]").forEach((outro) => {
          if (outro !== cartao) outro.open = false;
        });
      });
      lista.appendChild(cartao);
    });

    container.appendChild(lista);
    return modelo;
  }

  global.CotacaoPedidoUI = Object.freeze({
    LIMITE_PARA_BUSCA,
    criarModelo,
    normalizarBusca,
    renderizar,
    textoQuantidade
  });
})(globalThis);
