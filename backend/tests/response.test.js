const test = require('node:test');
const assert = require('node:assert/strict');
const resposta = require('../src/utils/response');

function resFalso() {
  return {
    codigo: null,
    corpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; },
  };
}

test('respostas públicas não expõem detalhes técnicos', () => {
  const res = resFalso();
  const erroOriginal = console.error;
  console.error = () => {};
  try { resposta.erroInterno(res, new Error('detalhe técnico confidencial')); }
  finally { console.error = erroOriginal; }
  assert.equal(res.codigo, 500);
  assert.deepEqual(res.corpo, { ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' });
});

test('violação de vínculo retorna conflito amigável', () => {
  const res = resFalso();
  const erroOriginal = console.error;
  console.error = () => {};
  try { resposta.erroInterno(res, { code: 'ER_ROW_IS_REFERENCED_2' }); }
  finally { console.error = erroOriginal; }
  assert.equal(res.codigo, 409);
  assert.equal(res.corpo.ok, false);
  assert.match(res.corpo.mensagem, /vinculado/i);
});

test('401, 403 e 404 permanecem semanticamente distintos', () => {
  const naoAutorizado = resFalso();
  resposta.naoAutorizado(naoAutorizado, 'Sessão inválida', 'SESSAO_ENCERRADA');
  assert.equal(naoAutorizado.codigo, 401);
  assert.equal(naoAutorizado.corpo.codigo, 'SESSAO_ENCERRADA');

  const proibido = resFalso();
  resposta.proibido(proibido);
  assert.equal(proibido.codigo, 403);

  const ausente = resFalso();
  resposta.naoEncontrado(ausente);
  assert.equal(ausente.codigo, 404);
});
