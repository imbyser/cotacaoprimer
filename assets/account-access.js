(function configurarAcessoConta(global) {
  'use strict';

  function motivoDoBloqueio(dados, telefone, senha) {
    if (!dados) return 'CONTA_REMOVIDA';
    if (dados.statusAssinatura !== 'ATIVA') return 'ACESSO_SUSPENSO';
    if (String(dados.telefone || '').replace(/\D/g, '') !== String(telefone || '').replace(/\D/g, '')) {
      return 'CONTA_ALTERADA';
    }
    if (dados.senha && dados.senha !== senha) return 'SENHA_ALTERADA';
    return null;
  }

  function criarMonitor({ assinar, aoBloquear, aoErro = () => {} }) {
    let cancelar = null;
    let versao = 0;

    function parar() {
      versao += 1;
      const anterior = cancelar;
      cancelar = null;
      anterior?.();
    }

    function iniciar({ referencia, telefone, senha }) {
      parar();
      const versaoAtual = versao;
      const desligar = assinar(referencia, (snapshot) => {
        if (versaoAtual !== versao || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
        const motivo = motivoDoBloqueio(snapshot.exists() ? snapshot.data() : null, telefone, senha);
        if (!motivo) return;
        parar();
        aoBloquear(motivo);
      }, (error) => {
        if (versaoAtual === versao) aoErro(error);
      });
      if (versaoAtual === versao) cancelar = desligar;
      else desligar?.();
    }

    return Object.freeze({ iniciar, parar });
  }

  global.CotacaoAccountAccess = Object.freeze({ motivoDoBloqueio, criarMonitor });
})(globalThis);
