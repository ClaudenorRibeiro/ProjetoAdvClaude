// Dashboard > "Audiências sem ata": o ato "sem comparecimento" (ex.: Julgamento) não tem ata e NÃO aparece no quadro. Contra MySQL real isolado.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let token; const F = {};
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  token = jwt.sign({ id: 1, nome: 'Teste 1', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6201, 1)')).insertId;
  F.proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000201-00.2026.5.15.0001', 'PROCESSO DO DASHBOARD', 1, 1, 1, 1)", [pasta])).insertId;
  F.tipo = (await sql("INSERT INTO tipo_audiencia (nome, ativo) VALUES ('Julgamento - DOE', 1)")).insertId;
});
test.after(async () => pool.end());

const nova = (modalidade, hora, status = 'agendada') => sql(
  'INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, status, criado_por) VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 3 DAY), ?, ?, ?, 1)',
  [F.proc, F.tipo, hora, modalidade, status]).then(r => r.insertId);

test('audiências sem ata: o ato "sem comparecimento" (julgamento) NÃO entra; presencial entra; cancelada e com ata continuam de fora', async () => {
  const julgamento = await nova('sem_comparecimento', '08:00:00');
  const presencial = await nova('presencial', '09:00:00');
  const cancelada = await nova('presencial', '10:00:00', 'cancelada');
  const comAta = await nova('presencial', '11:00:00');
  await sql('INSERT INTO ata_audiencia (audiencia_id, criado_por) VALUES (?, 1)', [comAta]).catch(async () => { await sql('UPDATE audiencia SET ata_impressa = 1 WHERE id = ?', [comAta]); });
  const r = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const ids = r.body.dados.audiencias_sem_ata.map(l => l.id);
  assert.ok(ids.includes(presencial), 'a presencial sem ata entra');
  assert.ok(!ids.includes(julgamento), 'o julgamento (sem comparecimento) não entra');
  assert.ok(!ids.includes(cancelada), 'cancelada não entra');
  assert.ok(!ids.includes(comAta), 'com ata (ou ata impressa) não entra');
  assert.equal(r.body.dados.contadores.sem_ata, ids.length, 'o contador do sino acompanha a lista');
});

test('filtro sem_ata=true da lista de audiências: não lista ato "sem comparecimento" (ele não tem ata), mas lista a presencial sem ata', async () => {
  const julgamento = await nova('sem_comparecimento', '12:00:00');
  const presencial = await nova('presencial', '13:00:00');
  const r = await request(app).get('/api/audiencias?sem_ata=true&limite=100').set('Authorization', `Bearer ${token}`);
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const ids = r.body.dados.registros.map(l => l.id);
  assert.ok(ids.includes(presencial), 'a presencial sem ata continua na lista');
  assert.ok(!ids.includes(julgamento), 'o ato sem comparecimento não entra no filtro "sem ata"');
});
