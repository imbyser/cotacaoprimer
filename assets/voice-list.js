(function criarListaPorVoz(global) {
  "use strict";

  const LIMITE_SEGUNDOS = 90;
  const LIMITE_BYTES = 3 * 1024 * 1024;

  function mimeTypeDisponivel() {
    const tipos = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus"
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function") return "audio/mp4";
    return tipos.find((tipo) => MediaRecorder.isTypeSupported(tipo)) || "";
  }

  function blobParaDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result || ""));
      leitor.onerror = () => reject(new Error("Não foi possível preparar o áudio."));
      leitor.readAsDataURL(blob);
    });
  }

  function criarControlador({ modal, obterCredenciais, aoConfirmar }) {
    const estados = Object.fromEntries(
      Array.from(modal.querySelectorAll("[data-voice-state]"))
        .map((elemento) => [elemento.dataset.voiceState, elemento])
    );
    const erros = Array.from(modal.querySelectorAll("[data-voice-error]"));
    const tempo = modal.querySelector("[data-voice-time]");
    const revisao = modal.querySelector("[data-voice-review]");
    const transcricao = modal.querySelector("[data-voice-transcript]");
    let recorder = null;
    let stream = null;
    let chunks = [];
    let timer = null;
    let segundos = 0;
    let produtosReconhecidos = [];
    let cancelado = false;

    function mostrarEstado(nome) {
      Object.entries(estados).forEach(([chave, elemento]) => {
        elemento.hidden = chave !== nome;
      });
    }

    function definirErro(mensagem) {
      erros.forEach((erro) => {
        erro.textContent = mensagem || "";
        erro.hidden = !mensagem;
      });
    }

    function pararCaptura() {
      clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    function fechar() {
      cancelado = true;
      if (recorder?.state === "recording") recorder.stop();
      pararCaptura();
      modal.hidden = true;
      document.body.style.overflow = "";
      mostrarEstado("intro");
      definirErro("");
    }

    function abrir() {
      cancelado = false;
      produtosReconhecidos = [];
      segundos = 0;
      tempo.textContent = "00:00";
      definirErro("");
      mostrarEstado("intro");
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      modal.querySelector("[data-voice-start]")?.focus();
    }

    function atualizarTempo() {
      const minutos = String(Math.floor(segundos / 60)).padStart(2, "0");
      const segundosRestantes = String(segundos % 60).padStart(2, "0");
      tempo.textContent = `${minutos}:${segundosRestantes}`;
    }

    function montarRevisao(produtos, texto) {
      revisao.replaceChildren();
      produtos.forEach((produto, indice) => {
        const item = document.createElement("li");
        const labelNome = document.createElement("label");
        const labelEmbalagem = document.createElement("label");
        const textoNome = document.createElement("span");
        const textoEmbalagem = document.createElement("span");
        const nome = document.createElement("input");
        const embalagem = document.createElement("input");

        textoNome.textContent = `Produto ${indice + 1}`;
        textoEmbalagem.textContent = "Embalagem (se tiver)";
        nome.type = "text";
        nome.value = produto.nome;
        nome.maxLength = 120;
        nome.autocomplete = "off";
        nome.dataset.voiceProductName = "";
        embalagem.type = "text";
        embalagem.value = produto.emb || "";
        embalagem.maxLength = 80;
        embalagem.autocomplete = "off";
        embalagem.dataset.voiceProductPackaging = "";
        labelNome.append(textoNome, nome);
        labelEmbalagem.append(textoEmbalagem, embalagem);
        item.append(labelNome, labelEmbalagem);
        revisao.appendChild(item);
      });
      transcricao.textContent = texto ? `Entendi: “${texto}”` : "";
    }

    function produtosDaRevisao() {
      return Array.from(revisao.querySelectorAll("li")).reduce((produtos, item) => {
        const nome = item.querySelector("[data-voice-product-name]")?.value.trim().slice(0, 120) || "";
        const emb = item.querySelector("[data-voice-product-packaging]")?.value.trim().slice(0, 80) || "";
        if (nome) produtos.push({ nome, emb });
        return produtos;
      }, []);
    }

    async function processarAudio(blob) {
      if (blob.size < 100) throw new Error("O áudio ficou muito curto. Tente falar novamente.");
      if (blob.size > LIMITE_BYTES) throw new Error("O áudio ficou muito longo. Grave uma lista menor.");

      const credenciais = obterCredenciais();
      const audio = await blobParaDataUrl(blob);
      const response = await fetch("/api/voice-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: credenciais.telefone,
          senha: credenciais.senha,
          audio,
          mimeType: blob.type || "audio/webm"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não consegui entender o áudio agora.");
      if (!Array.isArray(payload.produtos) || !payload.produtos.length) {
        throw new Error("Não encontrei produtos no áudio. Fale os nomes com um pouco mais de calma.");
      }

      produtosReconhecidos = payload.produtos;
      montarRevisao(produtosReconhecidos, payload.transcricao);
      mostrarEstado("review");
    }

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        definirErro("Este navegador não consegue gravar áudio. Use a opção de digitar a lista.");
        return;
      }

      try {
        cancelado = false;
        definirErro("");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = mimeTypeDisponivel();
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", async () => {
          pararCaptura();
          if (cancelado) return;
          mostrarEstado("processing");
          try {
            const tipoDoAudio = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || mimeType || "audio/webm";
            const blob = new Blob(chunks, { type: tipoDoAudio });
            await processarAudio(blob);
          } catch (falha) {
            mostrarEstado("intro");
            definirErro(falha.message || "Não consegui montar a lista. Tente novamente.");
          }
        }, { once: true });

        segundos = 0;
        atualizarTempo();
        recorder.start();
        mostrarEstado("recording");
        timer = setInterval(() => {
          segundos += 1;
          atualizarTempo();
          if (segundos >= LIMITE_SEGUNDOS && recorder?.state === "recording") recorder.stop();
        }, 1000);
      } catch {
        pararCaptura();
        mostrarEstado("intro");
        definirErro("Não consegui acessar o microfone. Libere a permissão e tente novamente.");
      }
    }

    function terminar() {
      if (recorder?.state === "recording") recorder.stop();
    }

    async function confirmar() {
      produtosReconhecidos = produtosDaRevisao();
      if (!produtosReconhecidos.length) {
        definirErro("Deixe pelo menos um produto preenchido para continuar.");
        return;
      }
      const botao = modal.querySelector("[data-voice-confirm]");
      botao.disabled = true;
      botao.textContent = "Abrindo a lista...";
      try {
        await aoConfirmar(produtosReconhecidos);
        fechar();
      } finally {
        botao.disabled = false;
        botao.textContent = "Usar estes itens";
      }
    }

    modal.querySelectorAll("[data-voice-close]").forEach((botao) => {
      botao.addEventListener("click", fechar);
    });
    modal.querySelector("[data-voice-start]").addEventListener("click", iniciar);
    modal.querySelector("[data-voice-stop]").addEventListener("click", terminar);
    modal.querySelector("[data-voice-retry]").addEventListener("click", () => {
      produtosReconhecidos = [];
      definirErro("");
      mostrarEstado("intro");
    });
    modal.querySelector("[data-voice-confirm]").addEventListener("click", confirmar);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) fechar();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) fechar();
    });

    return Object.freeze({ abrir, fechar });
  }

  global.CotacaoVoice = Object.freeze({ criarControlador });
})(globalThis);
