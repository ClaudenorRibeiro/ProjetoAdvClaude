// Leitura segura de campos de texto vindos da tela (nome obrigatório, limite do banco, não-texto).
const test = require('node:test');
const assert = require('node:assert/strict');
const { texto, lerTextos } = require('../../src/utils/camposTexto');

test('texto: limpa espaços; vazio obrigatório é erro; vazio opcional vira nulo', () => {
  assert.deepEqual(texto('  Fórum  ', { rotulo: 'Nome', max: 50, obrigatorio: true }), { valor: 'Fórum' });
  for (const vazio of ['', '   ', null, undefined]) {
    assert.deepEqual(texto(vazio, { rotulo: 'Nome', obrigatorio: true }), { erro: 'Nome é obrigatório' }, JSON.stringify(vazio));
    assert.deepEqual(texto(vazio, { rotulo: 'Cidade' }), { valor: null }, JSON.stringify(vazio));
  }
});

test('texto: o que não é texto (número, lista, objeto, booleano) não vale como nome; em campo opcional é "inválido"; número só onde permitido', () => {
  for (const ruim of [123, ['x'], { a: 1 }, true, NaN]) {
    assert.deepEqual(texto(ruim, { rotulo: 'Nome', obrigatorio: true }), { erro: 'Nome é obrigatório' }, JSON.stringify(ruim));
    assert.deepEqual(texto(ruim, { rotulo: 'Cidade' }), { erro: 'Cidade inválido' }, JSON.stringify(ruim));
  }
  assert.deepEqual(texto(100, { rotulo: 'Número', aceitaNumero: true }), { valor: '100' });
  assert.deepEqual(texto(NaN, { rotulo: 'Número', aceitaNumero: true }), { erro: 'Número inválido' });
});

test('texto: acima do limite do banco dá aviso com o máximo; no limite passa', () => {
  assert.deepEqual(texto('A'.repeat(100), { rotulo: 'Nome', max: 100, obrigatorio: true }), { valor: 'A'.repeat(100) });
  assert.deepEqual(texto('A'.repeat(101), { rotulo: 'Nome', max: 100, obrigatorio: true }), { erro: 'Nome muito longo (máximo 100 caracteres)' });
  assert.deepEqual(texto(`  ${'A'.repeat(100)}  `, { rotulo: 'Nome', max: 100 }), { valor: 'A'.repeat(100) });   // o limite vale depois de limpar os espaços
});

test('lerTextos: lê vários campos e devolve o primeiro erro', () => {
  const campos = { nome: { rotulo: 'Nome', max: 10, obrigatorio: true }, cidade: { rotulo: 'Cidade', max: 5 } };
  assert.deepEqual(lerTextos({ nome: ' Ana ', cidade: '' }, campos), { dados: { nome: 'Ana', cidade: null } });
  assert.deepEqual(lerTextos({ nome: 'Ana', cidade: 'Campinas' }, campos), { erro: 'Cidade muito longo (máximo 5 caracteres)' });
  assert.deepEqual(lerTextos({}, campos), { erro: 'Nome é obrigatório' });
  assert.deepEqual(lerTextos(undefined, campos), { erro: 'Nome é obrigatório' });
});
