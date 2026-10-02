// Regras únicas de utils/helpers usadas no SQL: pasta com 4+ dígitos sem cortar e curingas do LIKE protegidos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { escaparLike, pastaFormatadaSql, paginacao, numeroPastaValido } = require('../../src/utils/helpers');

test('escaparLike protege %, _ e a barra: o texto é procurado como foi digitado', () => {
  assert.equal(escaparLike('50%'), '50\\%');
  assert.equal(escaparLike('a_b'), 'a\\_b');
  assert.equal(escaparLike('c:\\x'), 'c:\\\\x');
  assert.equal(escaparLike('texto comum 123'), 'texto comum 123');
  assert.equal(escaparLike(42), '42');
});

test('pastaFormatadaSql usa o apelido pedido e só completa com zeros abaixo de 1000', () => {
  assert.equal(pastaFormatadaSql(), "IF(pa.numPasta >= 1000, CAST(pa.numPasta AS CHAR), LPAD(pa.numPasta, 4, '0'))");
  assert.equal(pastaFormatadaSql('pa2'), "IF(pa2.numPasta >= 1000, CAST(pa2.numPasta AS CHAR), LPAD(pa2.numPasta, 4, '0'))");
});

test('paginacao: ausente, texto, zero e negativo viram o padrão; limite e página têm teto', () => {
  assert.deepEqual(paginacao({}), { limite: 20, pagina: 1, offset: 0 });
  assert.deepEqual(paginacao({ limite: '2', pagina: '3' }), { limite: 2, pagina: 3, offset: 4 });
  for (const ruim of ['abc', '', '0', '-5', undefined, null, 'NaN']) {
    assert.deepEqual(paginacao({ limite: ruim, pagina: ruim }), { limite: 20, pagina: 1, offset: 0 }, String(ruim));
  }
  assert.equal(paginacao({ limite: '1000' }).limite, 100);
  assert.equal(paginacao({ limite: '1000' }, { limiteMax: 50 }).limite, 50);
  assert.equal(paginacao({ limite: '1.5' }).limite, 1);
  assert.equal(paginacao({ pagina: '99999999999999999999' }).pagina, 1000000);          // teto: o deslocamento sempre cabe no SQL
  assert.ok(Number.isSafeInteger(paginacao({ pagina: '99999999999999999999', limite: '100' }).offset));
});

test('numeroPastaValido: só inteiro positivo de até 9 dígitos; letras, decimal, notação científica e hexadecimal não valem', () => {
  for (const [entrada, esperado] of [[1, 1], ['42', 42], [' 15 ', 15], ['0042', 42], [99001, 99001], ['999999999', 999999999]]) {
    assert.equal(numeroPastaValido(entrada), esperado, JSON.stringify(entrada));
  }
  for (const ruim of [0, '0', -3, '-3', '', '  ', 'abc', '12abc', '12.7', 12.7, '1e3', '0x10', '1 2', null, undefined, NaN, '9999999999', {}, [], true]) {
    assert.equal(numeroPastaValido(ruim), null, JSON.stringify(ruim));
  }
});
