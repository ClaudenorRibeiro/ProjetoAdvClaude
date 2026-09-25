const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverPeriodoTarefas } = require('../../src/controllers/dashboardController');

test('Dashboard aceita somente os quatro períodos de tarefas previstos', () => {
  assert.equal(resolverPeriodoTarefas('hoje'), 'hoje');
  assert.equal(resolverPeriodoTarefas('7_dias'), '7_dias');
  assert.equal(resolverPeriodoTarefas('30_dias'), '30_dias');
  assert.equal(resolverPeriodoTarefas('todas'), 'todas');
  assert.equal(resolverPeriodoTarefas('invalido'), '30_dias');
});

test('Todas não é confundido com um período inválido', () => {
  assert.notEqual(resolverPeriodoTarefas('todas'), resolverPeriodoTarefas('invalido'));
});

test('opção ausente mantém o período inicial de 30 dias', () => {
  assert.equal(resolverPeriodoTarefas(undefined), '30_dias');
});
