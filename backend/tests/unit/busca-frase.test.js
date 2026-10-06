// Peça única da busca por frase (backend/src/utils/buscaFrase.js): leitura do termo e montagem da condição.
const test = require('node:test');
const assert = require('node:assert/strict');
const { lerBuscaFrase, condBuscaFrase } = require('../../src/utils/buscaFrase');

test('lerBuscaFrase: texto aparado; vazio vira "sem busca"; lista, objeto, número e mais de 200 caracteres dão aviso', () => {
  assert.deepEqual(lerBuscaFrase('  José e Maria  '), { valor: 'José e Maria' });
  assert.deepEqual(lerBuscaFrase(''), { valor: null });
  assert.deepEqual(lerBuscaFrase('   '), { valor: null });
  assert.deepEqual(lerBuscaFrase(undefined), { valor: null });
  for (const ruim of [['a', 'b'], { x: 'a' }, 12, true]) assert.match(lerBuscaFrase(ruim).erro, /busca inválida/i);
  assert.match(lerBuscaFrase('a'.repeat(201)).erro, /muito longa \(máximo 200/);
  assert.equal(lerBuscaFrase('a'.repeat(200)).valor.length, 200);
});

test('condBuscaFrase: a frase inteira vai só em parâmetros (nunca no texto do SQL), "%" e "_" e "\\" são protegidos', () => {
  const f = condBuscaFrase("50%_\\'; DROP TABLE x;--", { colunas: ['pr.NomeTituloProc', 'ta.nome'] });
  assert.equal(f.cond, ' AND (pr.NomeTituloProc LIKE ? OR ta.nome LIKE ?)');
  assert.deepEqual(f.params, ["%50\\%\\_\\\\'; DROP TABLE x;--%", "%50\\%\\_\\\\'; DROP TABLE x;--%"]);
  assert.ok(!f.cond.includes('DROP'));
});

test('condBuscaFrase: pasta e partes entram só quando pedidas, com o número certo de parâmetros', () => {
  const so = condBuscaFrase('abc', { colunas: ['x.a'] });
  assert.equal(so.params.length, 1);
  const pasta = condBuscaFrase('abc', { colunas: ['x.a'], pasta: 'pa' });
  assert.equal(pasta.params.length, 2);
  assert.match(pasta.cond, /LPAD\(pa\.numPasta, 4, '0'\)/);
  const completa = condBuscaFrase('abc', { colunas: ['x.a', 'x.b'], pasta: 'pa', partesDe: 'pr' });
  assert.equal(completa.params.length, 2 + 1 + 6);
  assert.equal((completa.cond.match(/\?/g) || []).length, completa.params.length);
  assert.match(completa.cond, /tbltituloprocautor/);
  assert.match(completa.cond, /tbltituloprocreu/);
});

test('condBuscaFrase: a regra do número sem máscara só vale para frase numérica com 3 ou mais dígitos', () => {
  const com = (frase) => condBuscaFrase(frase, { colunas: ['x.a'], numeroProcessoSemMascara: 'pr' });
  assert.equal(com('1234567-89.2026').params.length, 2);
  assert.match(com('1234567-89.2026').cond, /REPLACE\(REPLACE\(REPLACE\(pr\.numProc/);
  assert.deepEqual(com('1234567-89.2026').params[1], '%123456789' + '2026%');
  assert.equal(com('12').params.length, 1);                 // menos de 3 dígitos
  assert.equal(com('José 2026').params.length, 1);          // tem letras: só a busca por frase
});
