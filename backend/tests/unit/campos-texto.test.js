// Leitura segura de campos de texto vindos da tela (nome obrigatório, limite do banco, não-texto).
const test = require('node:test');
const assert = require('node:assert/strict');
const { texto, lerTextos, horaDoDia } = require('../../src/utils/camposTexto');

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

test('texto: rótulo feminino ("feminino: true") concorda — obrigatória, longa, inválida', () => {
  const op = { rotulo: 'A razão social', max: 5, obrigatorio: true, feminino: true };
  assert.deepEqual(texto('  ', op), { erro: 'A razão social é obrigatória' });
  assert.deepEqual(texto(123, op), { erro: 'A razão social é obrigatória' });
  assert.deepEqual(texto('ABCDEF', op), { erro: 'A razão social muito longa (máximo 5 caracteres)' });
  assert.deepEqual(texto('ABCDE', op), { valor: 'ABCDE' });
  assert.deepEqual(texto(['x'], { rotulo: 'A cidade', feminino: true }), { erro: 'A cidade inválida' });
  assert.deepEqual(texto('  ', { rotulo: 'A cidade', feminino: true }), { valor: null });
  // sem a opção, continua masculino (nada muda para quem já usa)
  assert.deepEqual(texto('  ', { rotulo: 'O nome', obrigatorio: true }), { erro: 'O nome é obrigatório' });
});

test('horaDoDia: aceita HH:MM e HH:MM:SS que existem; vazia = não informada; o resto é erro claro', () => {
  assert.deepEqual(horaDoDia('09:30'), { valor: '09:30' });
  assert.deepEqual(horaDoDia('23:59:59'), { valor: '23:59:59' });
  assert.deepEqual(horaDoDia(''), { valor: null });
  assert.deepEqual(horaDoDia(undefined), { valor: null });
  for (const ruim of ['24:00', '12:60', '9:30', 'abc', 930, ['09:30'], '09:30:99']) assert.deepEqual(horaDoDia(ruim, { rotulo: 'Hora de início' }), { erro: 'Hora de início inválida (use HH:MM)' });
});
