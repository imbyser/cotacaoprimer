(function () {
  "use strict";

  const estado = { usuarios: [], resumo: null, busca: "", adminTelefone: "" };
  const mensagensErro = {
    "Failed to fetch": "Não foi possível conectar agora. Confira sua internet.",
    "Unexpected end of JSON input": "A resposta do servidor veio incompleta. Tente novamente."
  };

  const porId = (id) => document.getElementById(id);

  function somenteDigitos(valor) {
    return String(valor || "").replace(/\D/g, "").slice(0, 11);
  }

  function formatarTelefone(valor) {
    const telefone = somenteDigitos(valor);
    if (telefone.length === 11) return telefone.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
    if (telefone.length === 10) return telefone.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
    return telefone || "Não informado";
  }

  function formatarData(valor) {
    if (!valor) return "Sem registro";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return "Sem registro";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(data).replace(" de ", " ").replace(" de ", " ");
  }

  function criarAutorizacao(telefone, senha) {
    const bytes = new TextEncoder().encode(`${somenteDigitos(telefone)}:${senha}`);
    let binario = "";
    bytes.forEach((byte) => { binario += String.fromCharCode(byte); });
    return `Basic ${btoa(binario)}`;
  }

  function definirErro(elemento, mensagem = "") {
    elemento.textContent = mensagem;
    elemento.hidden = !mensagem;
  }

  function mostrarToast(mensagem, tipo = "sucesso") {
    const toast = porId("adminToast");
    toast.textContent = mensagem;
    toast.dataset.tipo = tipo;
    toast.hidden = false;
    clearTimeout(mostrarToast.timer);
    mostrarToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  async function requisitar(caminho = "", options = {}) {
    const response = await fetch(`/api/admin-users${caminho}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && porId("adminApp").hidden === false) encerrarSessaoLocal();
      throw new Error(payload.error || `Erro ${response.status}`);
    }
    return payload;
  }

  function statusDaConta(status) {
    if (status === "ATIVA") return { texto: "Liberado", classe: "liberado" };
    if (status === "SUSPENSA") return { texto: "Bloqueado", classe: "bloqueado" };
    return { texto: "Aguardando", classe: "aguardando" };
  }

  function textoDaConta(usuario) {
    const plano = usuario.plano || "Sem plano";
    const senha = usuario.temSenha ? "Senha cadastrada" : "Sem senha";
    return `${plano} · ${senha}`;
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function renderizarUsuario(usuario) {
    const linha = criarElemento("article", "admin-user-row");
    linha.dataset.userId = usuario.id;

    const identidade = criarElemento("div", "admin-user-identity");
    const iniciais = criarElemento("span", "admin-user-mark", (usuario.nome || "C").slice(0, 1).toUpperCase());
    const nome = criarElemento("div");
    nome.append(
      criarElemento("strong", "", usuario.nome || "Conta sem nome"),
      criarElemento("span", "", formatarTelefone(usuario.telefone))
    );
    identidade.append(iniciais, nome);

    const statusInfo = statusDaConta(usuario.statusAssinatura);
    const acesso = criarElemento("div", "admin-user-access");
    acesso.append(
      criarElemento("span", `admin-status admin-status-${statusInfo.classe}`, statusInfo.texto),
      criarElemento("small", "", `${usuario.listas} ${usuario.listas === 1 ? "lista" : "listas"}`)
    );

    const conta = criarElemento("div", "admin-user-account");
    conta.append(
      criarElemento("strong", "", textoDaConta(usuario)),
      criarElemento("span", "", `Última atividade: ${formatarData(usuario.ultimaAtividade || usuario.atualizadoEm)}`)
    );

    const acoes = criarElemento("div", "admin-user-actions");
    const editar = criarElemento("button", "admin-btn admin-btn-edit", "Editar conta");
    editar.type = "button";
    editar.addEventListener("click", () => abrirEdicao(usuario));
    const senha = criarElemento("button", "admin-btn admin-btn-password", "Redefinir senha");
    senha.type = "button";
    senha.addEventListener("click", () => abrirSenha(usuario));
    acoes.append(editar, senha);

    linha.append(identidade, acesso, conta, acoes);
    return linha;
  }

  function filtrarUsuarios() {
    const busca = estado.busca.toLocaleLowerCase("pt-BR");
    return estado.usuarios.filter((usuario) => {
      const alvo = `${usuario.nome} ${usuario.telefone} ${formatarTelefone(usuario.telefone)} ${usuario.plano}`
        .toLocaleLowerCase("pt-BR");
      return alvo.includes(busca);
    });
  }

  function renderizarUsuarios() {
    const container = porId("usersList");
    const usuarios = filtrarUsuarios();
    container.replaceChildren();
    porId("resultadoContagem").textContent = `${usuarios.length} ${usuarios.length === 1 ? "conta encontrada" : "contas encontradas"}`;

    if (!usuarios.length) {
      const vazio = criarElemento("div", "admin-empty");
      vazio.append(
        criarElemento("strong", "", estado.busca ? "Nenhuma conta combina com a busca." : "Nenhuma conta cadastrada."),
        criarElemento("p", "", estado.busca ? "Confira o nome ou o WhatsApp digitado." : "Use “Nova conta” para fazer o primeiro cadastro.")
      );
      container.appendChild(vazio);
      return;
    }

    usuarios.forEach((usuario) => container.appendChild(renderizarUsuario(usuario)));
  }

  function renderizarResumo() {
    const resumo = estado.resumo || {};
    porId("statTotal").textContent = resumo.total ?? "—";
    porId("statAtivas").textContent = resumo.ativas ?? "—";
    porId("statSuspensas").textContent = resumo.suspensas ?? "—";
    porId("statListas").textContent = resumo.listas ?? "—";
  }

  async function carregarUsuarios() {
    const payload = await requisitar();
    estado.usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
    estado.resumo = payload.resumo || null;
    estado.adminTelefone = somenteDigitos(payload.admin?.telefone);
    porId("adminIdentificacao").textContent = formatarTelefone(payload.admin?.telefone);
    renderizarResumo();
    renderizarUsuarios();
  }

  function abrirDialogo(dialogo) {
    if (typeof dialogo.showModal === "function") dialogo.showModal();
    else dialogo.setAttribute("open", "");
  }

  function fecharDialogo(dialogo) {
    if (typeof dialogo.close === "function") dialogo.close();
    else dialogo.removeAttribute("open");
  }

  function prepararConta(usuario = null) {
    const criando = !usuario;
    porId("accountForm").reset();
    definirErro(porId("accountError"));
    porId("accountId").value = usuario?.id || "";
    porId("accountName").value = usuario?.nome || "";
    porId("accountPhone").value = formatarTelefone(usuario?.telefone || "").replace("Não informado", "");
    porId("accountPlan").value = usuario?.plano || "";
    porId("accountStatus").value = usuario?.statusAssinatura || "ATIVA";
    const contaAdministradora = !criando && somenteDigitos(usuario?.telefone) === estado.adminTelefone;
    porId("accountPhone").disabled = contaAdministradora;
    porId("accountStatus").disabled = contaAdministradora;
    porId("accountPhoneHelp").hidden = !contaAdministradora;
    porId("accountMeta").hidden = criando;
    porId("accountMetaLists").textContent = usuario?.listas ?? 0;
    porId("accountMetaActivity").textContent = formatarData(usuario?.ultimaAtividade || usuario?.atualizadoEm);
    porId("accountMetaPaymentDate").textContent = formatarData(usuario?.dataPagamento);
    porId("accountMetaPaymentId").textContent = usuario?.ultimoPagamentoId || "Sem registro";
    porId("newPasswordField").hidden = !criando;
    porId("accountPassword").required = criando;
    porId("accountDialogKicker").textContent = criando ? "Cadastro" : "Dados do cliente";
    porId("accountDialogTitle").textContent = criando ? "Nova conta" : "Editar conta";
    porId("accountSubmit").textContent = criando ? "Criar conta" : "Salvar alterações";
    abrirDialogo(porId("accountDialog"));
    setTimeout(() => porId(criando ? "accountName" : "accountPhone").focus(), 20);
  }

  function abrirEdicao(usuario) {
    prepararConta(usuario);
  }

  function abrirSenha(usuario) {
    porId("passwordForm").reset();
    definirErro(porId("passwordError"));
    porId("passwordAccountId").value = usuario.id;
    porId("passwordAccountLabel").textContent = `${usuario.nome || "Conta sem nome"} · ${formatarTelefone(usuario.telefone)}`;
    abrirDialogo(porId("passwordDialog"));
    setTimeout(() => porId("newPassword").focus(), 20);
  }

  function definirCarregando(botao, carregando, texto) {
    if (!botao.dataset.textoOriginal) botao.dataset.textoOriginal = botao.textContent;
    botao.disabled = carregando;
    botao.textContent = carregando ? texto : botao.dataset.textoOriginal;
  }

  async function salvarConta(event) {
    event.preventDefault();
    const id = porId("accountId").value;
    const criando = !id;
    const status = porId("accountStatus").value;
    const usuarioAtual = estado.usuarios.find((usuario) => usuario.id === id);
    if (!criando && status === "SUSPENSA" && usuarioAtual?.statusAssinatura !== "SUSPENSA") {
      const confirmou = window.confirm("Bloquear esta conta? O cliente não conseguirá entrar até você liberar novamente.");
      if (!confirmou) return;
    }
    const novoTelefone = somenteDigitos(porId("accountPhone").value);
    if (!criando && usuarioAtual && novoTelefone !== somenteDigitos(usuarioAtual.telefone)) {
      const confirmou = window.confirm(
        `Trocar o WhatsApp desta conta? As ${usuarioAtual.listas} listas existentes continuarão com o cliente no novo número.`
      );
      if (!confirmou) return;
    }

    const body = {
      action: criando ? "create" : "update",
      id: id || undefined,
      nome: porId("accountName").value,
      telefone: novoTelefone,
      plano: porId("accountPlan").value,
      statusAssinatura: status
    };
    if (criando) body.senha = porId("accountPassword").value;

    const botao = porId("accountSubmit");
    definirErro(porId("accountError"));
    definirCarregando(botao, true, criando ? "Criando..." : "Salvando...");
    try {
      await requisitar("", { method: "POST", body: JSON.stringify(body) });
      fecharDialogo(porId("accountDialog"));
      await carregarUsuarios();
      mostrarToast(criando ? "Conta criada e pronta para entrar." : "Alterações salvas.");
    } catch (error) {
      definirErro(porId("accountError"), mensagensErro[error.message] || error.message);
    } finally {
      definirCarregando(botao, false);
    }
  }

  async function salvarSenha(event) {
    event.preventDefault();
    const senha = porId("newPassword").value;
    const confirmacao = porId("confirmPassword").value;
    if (senha !== confirmacao) {
      definirErro(porId("passwordError"), "As duas senhas precisam ser iguais.");
      return;
    }

    const botao = porId("passwordSubmit");
    definirErro(porId("passwordError"));
    definirCarregando(botao, true, "Salvando...");
    try {
      await requisitar("", {
        method: "POST",
        body: JSON.stringify({
          action: "reset-password",
          id: porId("passwordAccountId").value,
          senha
        })
      });
      fecharDialogo(porId("passwordDialog"));
      await carregarUsuarios();
      mostrarToast("Nova senha salva. A anterior deixou de funcionar.");
    } catch (error) {
      definirErro(porId("passwordError"), mensagensErro[error.message] || error.message);
    } finally {
      definirCarregando(botao, false);
    }
  }

  function entrarNaInterface() {
    porId("adminLogin").hidden = true;
    porId("adminApp").hidden = false;
  }

  function encerrarSessaoLocal() {
    estado.usuarios = [];
    estado.adminTelefone = "";
    porId("adminApp").hidden = true;
    porId("adminLogin").hidden = false;
    porId("adminSenha").value = "";
  }

  async function sair() {
    try {
      await requisitar("", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    } catch {
      // Mesmo sem rede, os dados da tela são removidos imediatamente.
    }
    encerrarSessaoLocal();
  }

  async function entrar(event) {
    event?.preventDefault();
    const telefone = porId("adminTelefone").value;
    const senha = porId("adminSenha").value;
    const botao = porId("loginButton");
    definirErro(porId("loginErro"));
    definirCarregando(botao, true, "Entrando...");

    try {
      await requisitar("", {
        method: "POST",
        headers: { Authorization: criarAutorizacao(telefone, senha) },
        body: JSON.stringify({ action: "login" })
      });
      const payload = await requisitar();
      estado.usuarios = payload.usuarios || [];
      estado.resumo = payload.resumo || null;
      estado.adminTelefone = somenteDigitos(payload.admin?.telefone);
      entrarNaInterface();
      porId("adminIdentificacao").textContent = formatarTelefone(payload.admin?.telefone);
      renderizarResumo();
      renderizarUsuarios();
    } catch (error) {
      definirErro(porId("loginErro"), mensagensErro[error.message] || error.message);
    } finally {
      definirCarregando(botao, false);
    }
  }

  function conectarEventos() {
    porId("loginForm").addEventListener("submit", entrar);
    porId("logoutButton").addEventListener("click", sair);
    porId("newUserButton").addEventListener("click", () => prepararConta());
    porId("accountForm").addEventListener("submit", salvarConta);
    porId("passwordForm").addEventListener("submit", salvarSenha);
    porId("userSearch").addEventListener("input", (event) => {
      estado.busca = event.target.value.trim();
      renderizarUsuarios();
    });
    document.querySelectorAll("[data-close-dialog]").forEach((botao) => {
      botao.addEventListener("click", () => fecharDialogo(porId(botao.dataset.closeDialog)));
    });
    [porId("adminTelefone"), porId("accountPhone")].forEach((campo) => {
      campo.addEventListener("input", () => { campo.value = formatarTelefone(campo.value).replace("Não informado", ""); });
    });
    document.querySelectorAll(".admin-dialog").forEach((dialogo) => {
      dialogo.addEventListener("click", (event) => {
        if (event.target === dialogo) fecharDialogo(dialogo);
      });
    });
  }

  async function iniciar() {
    conectarEventos();
    try {
      await carregarUsuarios();
      entrarNaInterface();
    } catch {
      encerrarSessaoLocal();
    }
  }

  window.CotacaoPrimeAdmin = {
    iniciar,
    formatarTelefone,
    criarAutorizacao,
    statusDaConta
  };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
