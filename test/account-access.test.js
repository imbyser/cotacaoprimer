import assert from 'node:assert/strict';
import test from 'node:test';

await import('../assets/account-access.js');
const { motivoDoBloqueio, criarMonitor } = globalThis.CotacaoAccountAccess;
const telefone = '81988887777';
const senha = 'senha-de-teste';
const ativa = { telefone, senha, statusAssinatura: 'ATIVA' };
const snapshot = (dados, metadata = {}) => ({ exists: () => Boolean(dados), data: () => dados, metadata });

test('suspensão, senha alterada e conta removida encerram o acesso; conta ativa continua', () => {
  assert.equal(motivoDoBloqueio(ativa, telefone, senha), null);
  assert.equal(motivoDoBloqueio({ ...ativa, statusAssinatura: 'SUSPENSA' }, telefone, senha), 'ACESSO_SUSPENSO');
  assert.equal(motivoDoBloqueio({ ...ativa, statusAssinatura: 'PENDENTE' }, telefone, senha), 'ACESSO_SUSPENSO');
  assert.equal(motivoDoBloqueio({ ...ativa, senha: 'senha-nova' }, telefone, senha), 'SENHA_ALTERADA');
  assert.equal(motivoDoBloqueio({ ...ativa, telefone: '81977776666' }, telefone, senha), 'CONTA_ALTERADA');
  assert.equal(motivoDoBloqueio(null, telefone, senha), 'CONTA_REMOVIDA');
  assert.equal(motivoDoBloqueio({ ...ativa, senha: '' }, telefone, senha), null);
});

test('suspensão recebida pela assinatura bloqueia uma sessão aberta e encerra o monitor', () => {
  let emitir; let desligou = 0; const bloqueios = [];
  const monitor = criarMonitor({
    assinar: (_, callback) => { emitir = callback; return () => { desligou += 1; }; },
    aoBloquear: motivo => bloqueios.push(motivo)
  });
  monitor.iniciar({ referencia: 'conta-teste', telefone, senha });
  emitir(snapshot(ativa));
  assert.deepEqual(bloqueios, []);
  emitir(snapshot({ ...ativa, statusAssinatura: 'SUSPENSA' }));
  emitir(snapshot({ ...ativa, statusAssinatura: 'SUSPENSA' }));
  assert.deepEqual(bloqueios, ['ACESSO_SUSPENSO']);
  assert.equal(desligou, 1);
});

test('cache e gravação local pendente não provocam um bloqueio antes da confirmação do servidor', () => {
  let emitir; const bloqueios = [];
  const monitor = criarMonitor({ assinar: (_, callback) => { emitir = callback; return () => {}; }, aoBloquear: motivo => bloqueios.push(motivo) });
  monitor.iniciar({ referencia: 'conta-teste', telefone, senha });
  emitir(snapshot({ ...ativa, statusAssinatura: 'SUSPENSA' }, { fromCache: true }));
  emitir(snapshot({ ...ativa, statusAssinatura: 'SUSPENSA' }, { hasPendingWrites: true }));
  assert.deepEqual(bloqueios, []);
  emitir(snapshot({ ...ativa, statusAssinatura: 'SUSPENSA' }));
  assert.deepEqual(bloqueios, ['ACESSO_SUSPENSO']);
});

test('ao trocar de conta, respostas atrasadas da assinatura anterior são ignoradas', () => {
  const callbacks = []; const bloqueios = []; let desligou = 0;
  const monitor = criarMonitor({
    assinar: (_, callback) => { callbacks.push(callback); return () => { desligou += 1; }; },
    aoBloquear: motivo => bloqueios.push(motivo)
  });
  monitor.iniciar({ referencia: 'primeira', telefone, senha });
  monitor.iniciar({ referencia: 'segunda', telefone: '81977776666', senha });
  callbacks[0](snapshot(null));
  assert.deepEqual(bloqueios, []);
  callbacks[1](snapshot({ ...ativa, telefone: '81977776666', statusAssinatura: 'SUSPENSA' }));
  assert.deepEqual(bloqueios, ['ACESSO_SUSPENSO']);
  assert.equal(desligou, 2);
});

test('falha temporária de rede não expulsa uma conta ativa', () => {
  let falhar; const erros = []; const bloqueios = [];
  const monitor = criarMonitor({
    assinar: (_, callback, onError) => { falhar = onError; return () => {}; },
    aoBloquear: motivo => bloqueios.push(motivo), aoErro: error => erros.push(error.message)
  });
  monitor.iniciar({ referencia: 'conta-teste', telefone, senha });
  falhar(new Error('unavailable'));
  assert.deepEqual(erros, ['unavailable']);
  assert.deepEqual(bloqueios, []);
});
