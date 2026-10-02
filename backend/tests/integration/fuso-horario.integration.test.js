// O banco do sistema precisa seguir o relógio de Brasília, não o do servidor onde o MySQL roda.
// Sem isso, num servidor em UTC o "hoje" do MySQL vira o dia seguinte a partir das 21h de Brasília.
const test = require('node:test');
const assert = require('node:assert/strict');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { pool } = require('../../src/config/database');

test.before(async () => { await recriarBancoTeste(); });
test.after(async () => pool.end());

test('toda conexão do sistema usa o fuso de Brasília (-03:00)', async () => {
  const conexoes = await Promise.all([pool.getConnection(), pool.getConnection(), pool.getConnection()]);
  try {
    for (const c of conexoes) {
      const [[linha]] = await c.query('SELECT @@session.time_zone AS fuso');
      assert.equal(linha.fuso, '-03:00');
    }
  } finally { conexoes.forEach(c => c.release()); }
});

test('CURDATE() e NOW() do banco batem com a data e a hora de Brasília', async () => {
  const [[linha]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje, DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') AS agora");
  const brasilia = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });   // AAAA-MM-DD HH:MM:SS
  assert.equal(linha.hoje, brasilia.slice(0, 10));
  const diferencaMin = Math.abs(Date.parse(linha.agora.replace(' ', 'T') + ':00Z') - Date.parse(brasilia.slice(0, 16).replace(' ', 'T') + ':00Z')) / 60000;
  assert.ok(diferencaMin <= 1, `NOW() do banco difere ${diferencaMin} min do relógio de Brasília`);
});
