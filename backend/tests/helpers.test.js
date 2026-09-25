const test = require('node:test');
const assert = require('node:assert/strict');

const helpers = require('../src/utils/helpers');
const { valorPorExtenso } = require('../src/utils/extenso');

test('formatadores de CPF, CNPJ e números preservam o contrato', () => {
  assert.equal(helpers.formatarCPF('12345678900'), '123.456.789-00');
  assert.equal(helpers.formatarCNPJ('12345678000195'), '12.345.678/0001-95');
  assert.equal(helpers.apenasNumeros('abc123.45-6'), '123456');
  assert.equal(helpers.apenasNumeros(null), '');
});

test('datas brasileiras são convertidas sem deslocamento de fuso', () => {
  assert.equal(helpers.dataParaMySQL('25/12/2026'), '2026-12-25');
  assert.equal(helpers.dataParaMySQL('5-1-2026'), '2026-01-05');
  assert.equal(helpers.dataParaMySQL(''), null);
  assert.equal(helpers.dataParaIsoLocal(new Date(2026, 0, 5, 12)), '2026-01-05');
  assert.equal(helpers.dataParaIsoLocal(new Date('inválida')), '');
});

test('regra de agendamento passado distingue usuário comum de administrador', () => {
  assert.equal(helpers.bloqueiaAgendarPassado({ nivel: 2 }, '2000-01-01'), true);
  assert.equal(helpers.bloqueiaAgendarPassado({ nivel: 1 }, '2000-01-01'), false);
  assert.equal(helpers.bloqueiaAgendarPassado({ nivel: 0 }, '2000-01-01'), false);
  assert.equal(helpers.bloqueiaAgendarPassado({ nivel: 2 }, '2999-01-01'), false);
});

test('número da pasta, truncamento e data de Brasília mantêm formato', () => {
  assert.equal(helpers.formatarNumeroPasta(42), '0042');
  assert.equal(helpers.truncar('abcdef', 3), 'abc...');
  assert.match(helpers.hojeBrasilia(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(helpers.hojeBrasilia(1) > helpers.hojeBrasilia());
});

test('parseMoeda só reconhece texto com vírgula, do jeito que o Financeiro busca por valor', () => {
  assert.equal(helpers.parseMoeda('1.000,00'), 1000);
  assert.equal(helpers.parseMoeda('700,10'), 700.1);
  assert.equal(helpers.parseMoeda('1.234.567,89'), 1234567.89);
  assert.equal(helpers.parseMoeda('0001527-49.2026.5.02.0075'), null); // nº de processo (CNJ) não tem vírgula
  assert.equal(helpers.parseMoeda('0042'), null); // nº de pasta também não
  assert.equal(helpers.parseMoeda('0,00'), null); // valor zero não é uma busca válida
  assert.equal(helpers.parseMoeda(''), null);
  assert.equal(helpers.parseMoeda(null), null);
});

test('valor por extenso cobre singular, plural, centavos e milhões', () => {
  assert.equal(valorPorExtenso(0), 'zero real');
  assert.equal(valorPorExtenso(1), 'um real');
  assert.equal(valorPorExtenso(1523.45), 'mil quinhentos e vinte e três reais e quarenta e cinco centavos');
  assert.equal(valorPorExtenso(1000000), 'um milhão de reais');
  assert.equal(valorPorExtenso(0.006), 'um centavo');
});
