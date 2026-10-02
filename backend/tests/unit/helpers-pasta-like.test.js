// Regras únicas de utils/helpers usadas no SQL: pasta com 4+ dígitos sem cortar e curingas do LIKE protegidos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { escaparLike, pastaFormatadaSql } = require('../../src/utils/helpers');

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
