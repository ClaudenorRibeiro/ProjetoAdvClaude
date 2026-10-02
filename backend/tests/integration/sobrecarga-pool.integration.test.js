// Aviso de capacidade contra o pool REAL de conexões do MySQL:
//  - muitas consultas ao mesmo tempo (fila de milissegundos) NÃO acendem o aviso;
//  - conexões presas por vários segundos com gente esperando acendem o aviso.
const test = require('node:test');
const assert = require('node:assert/strict');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { pool, sistemaSobrecarregado, lerFilaDoPool } = require('../../src/config/database');

test.before(async () => { await recriarBancoTeste(); });
test.after(async () => pool.end());

test('a fila do pool é legível (se o mysql2 mudar isso, a bateria avisa)', () => {
  assert.equal(typeof lerFilaDoPool(), 'number');
});

test('rajada de consultas simultâneas (fila de milissegundos) não acende o aviso', async () => {
  const consultas = Array.from({ length: 60 }, () => pool.query('SELECT SLEEP(0.01)'));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(lerFilaDoPool() > 0, 'a rajada precisa ter formado fila para o teste valer');
  await Promise.all(consultas);
  await new Promise(r => setTimeout(r, 3500));          // tempo de sobra para o detector olhar a fila várias vezes
  assert.equal(sistemaSobrecarregado(), false);
});

test('todas as conexões presas por vários segundos, com gente esperando, acendem o aviso', async () => {
  const presas = await Promise.all(Array.from({ length: 15 }, () => pool.getConnection()));
  const esperando = pool.query('SELECT 1');             // fica na fila: não há conexão livre
  try {
    await new Promise(r => setTimeout(r, 4500));
    assert.ok(lerFilaDoPool() > 0);
    assert.equal(sistemaSobrecarregado(), true);
  } finally {
    presas.forEach(c => c.release());
    await esperando;
  }
});
