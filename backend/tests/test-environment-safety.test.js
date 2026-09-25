const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarAmbienteTeste } = require('./support/testEnvironment');
const { sqlSomenteEstruturaTeste } = require('./support/testDatabase');

const chaves = ['TEST_DB_NAME', 'TEST_DB_USER', 'TEST_DB_PASSWORD', 'TEST_DB_HOST', 'CI'];

function comAmbiente(valores, executar) {
  const anterior = Object.fromEntries(chaves.map(k => [k, process.env[k]]));
  Object.assign(process.env, valores);
  try { executar(); } finally {
    for (const [k, v] of Object.entries(anterior)) v === undefined ? delete process.env[k] : process.env[k] = v;
  }
}

test('recusa banco real mesmo quando outras credenciais parecem válidas', () => {
  comAmbiente({ TEST_DB_NAME: 'sistema_advocacia', TEST_DB_USER: 'novojud_test', TEST_DB_PASSWORD: 'x', TEST_DB_HOST: '127.0.0.1' }, () => {
    assert.throws(carregarAmbienteTeste, /SEGURANÇA/);
  });
});

test('recusa usuário root e host remoto', () => {
  comAmbiente({ TEST_DB_NAME: 'sistema_advocacia_test', TEST_DB_USER: 'root', TEST_DB_PASSWORD: 'x', TEST_DB_HOST: '127.0.0.1' }, () => {
    assert.throws(carregarAmbienteTeste, /root\/admin/);
  });
  comAmbiente({ TEST_DB_NAME: 'sistema_advocacia_test', TEST_DB_USER: 'novojud_test', TEST_DB_PASSWORD: 'x', TEST_DB_HOST: 'banco-producao' }, () => {
    assert.throws(carregarAmbienteTeste, /local/);
  });
  comAmbiente({ TEST_DB_NAME: 'sistema_advocacia_test', TEST_DB_USER: 'novojud_test', TEST_DB_PASSWORD: 'x', TEST_DB_HOST: 'mysql', CI: 'false' }, () => {
    assert.throws(carregarAmbienteTeste, /local/);
  });
});

test('aceita configuração isolada explícita', () => {
  comAmbiente({ TEST_DB_NAME: 'sistema_advocacia_test', TEST_DB_USER: 'novojud_test', TEST_DB_PASSWORD: 'x', TEST_DB_HOST: '127.0.0.1' }, () => {
    assert.equal(carregarAmbienteTeste().nome, 'sistema_advocacia_test');
  });
});

test('preparação remove comandos capazes de apagar ou selecionar banco', () => {
  const sql = sqlSomenteEstruturaTeste();
  assert.doesNotMatch(sql, /DROP\s+DATABASE|CREATE\s+DATABASE|\bUSE\s+`/i);
  assert.equal((sql.match(/^CREATE TABLE/gm) || []).length, 90);
});
