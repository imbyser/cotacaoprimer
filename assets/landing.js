const planos = Object.freeze({
  Mensal: {
    resumo: "R$ 98,90 por mês"
  },
  Trimestral: {
    resumo: "R$ 275,70 a cada 3 meses"
  },
  Anual: {
    resumo: "R$ 1.006,80 por ano"
  }
});

let planoSelecionado = null;

const gridPlanos = document.getElementById("gridPlanos");
const secaoCadastro = document.getElementById("secaoCadastro");
const tituloPlanoSelecionado = document.getElementById("tituloPlanoSelecionado");
const formCadastro = document.getElementById("formCadastro");
const btnFinalizar = document.getElementById("btnFinalizar");
const formError = document.getElementById("formError");
const formStatus = document.getElementById("formStatus");
const supportLink = document.getElementById("supportLink");

const pagamento = new URLSearchParams(window.location.search).get("pagamento");
if (pagamento === "nao-concluido") {
  const aviso = document.createElement("div");
  aviso.className = "payment-notice";
  aviso.setAttribute("role", "alert");
  aviso.textContent = "O pagamento não foi concluído. Você pode escolher o plano e tentar novamente.";
  document.querySelector(".site-header")?.insertAdjacentElement("afterend", aviso);
}

function apenasNumeros(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 11);
}

function exibirMensagem(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.hidden = false;
}

function limparMensagens() {
  formError.hidden = true;
  formError.textContent = "";
  formStatus.hidden = true;
  formStatus.textContent = "";
}

window.mascaraTelefone = function mascaraTelefone(input) {
  const numeros = apenasNumeros(input.value);

  if (numeros.length <= 2) {
    input.value = numeros ? `(${numeros}` : "";
    return;
  }

  const ddd = numeros.slice(0, 2);
  const parteInicial = numeros.length === 11
    ? numeros.slice(2, 7)
    : numeros.slice(2, 6);
  const parteFinal = numeros.length === 11
    ? numeros.slice(7)
    : numeros.slice(6);

  input.value = `(${ddd}) ${parteInicial}${parteFinal ? `-${parteFinal}` : ""}`;
};

window.selecionarPlano = function selecionarPlano(nomePlano) {
  const plano = planos[nomePlano];
  if (!plano) return;

  planoSelecionado = nomePlano;
  limparMensagens();
  tituloPlanoSelecionado.textContent = `${nomePlano}: ${plano.resumo}`;
  gridPlanos.hidden = true;
  secaoCadastro.hidden = false;

  window.requestAnimationFrame(() => {
    secaoCadastro.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("cadNome").focus({ preventScroll: true });
  });
};

window.voltarParaPlanos = function voltarParaPlanos() {
  planoSelecionado = null;
  limparMensagens();
  secaoCadastro.hidden = true;
  gridPlanos.hidden = false;

  window.requestAnimationFrame(() => {
    gridPlanos.scrollIntoView({ behavior: "smooth", block: "start" });
    gridPlanos.querySelector("button")?.focus({ preventScroll: true });
  });
};

formCadastro.addEventListener("submit", async (event) => {
  event.preventDefault();
  limparMensagens();

  const nome = document.getElementById("cadNome").value.trim();
  const telefone = apenasNumeros(document.getElementById("cadTelefone").value);
  const senha = document.getElementById("cadSenha").value;

  if (!planoSelecionado || !planos[planoSelecionado]) {
    exibirMensagem(formError, "Escolha um plano para continuar.");
    return;
  }

  if (nome.length < 2) {
    exibirMensagem(formError, "Digite seu nome ou o nome da loja.");
    document.getElementById("cadNome").focus();
    return;
  }

  if (telefone.length < 10) {
    exibirMensagem(formError, "Digite um WhatsApp válido com DDD.");
    document.getElementById("cadTelefone").focus();
    return;
  }

  if (senha.length < 8) {
    exibirMensagem(formError, "Crie uma senha com pelo menos 8 caracteres.");
    document.getElementById("cadSenha").focus();
    return;
  }

  btnFinalizar.disabled = true;
  btnFinalizar.textContent = "Preparando o pagamento...";
  exibirMensagem(formStatus, "Aguarde. Estamos abrindo o pagamento seguro.");

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nome,
        telefone,
        senha,
        plano: planoSelecionado
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.init_point) {
      const checkoutError = new Error(payload.error || "Não foi possível abrir o pagamento.");
      checkoutError.code = payload.code;
      throw checkoutError;
    }

    window.location.assign(payload.init_point);
  } catch (error) {
    formStatus.hidden = true;
    if (error.code === "SENHA_EXISTENTE_INVALIDA") {
      exibirMensagem(formError, "Esse WhatsApp já tem cadastro. Digite sua senha atual para renovar.");
      document.getElementById("cadSenha").focus();
    } else {
      exibirMensagem(
        formError,
        "Não foi possível abrir o pagamento agora. Tente novamente ou fale com o atendimento."
      );
    }

    const mensagem = [
      "Olá! Tentei assinar o Cotação Prime, mas o pagamento não abriu.",
      `Plano: ${planoSelecionado}.`,
      `Nome: ${nome}.`,
      `WhatsApp: ${telefone}.`
    ].join("\n");
    supportLink.href = `https://api.whatsapp.com/send?phone=5581995432834&text=${encodeURIComponent(mensagem)}`;
    console.error("Falha ao iniciar pagamento:", error);
  } finally {
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = "Continuar para o pagamento";
  }
});
