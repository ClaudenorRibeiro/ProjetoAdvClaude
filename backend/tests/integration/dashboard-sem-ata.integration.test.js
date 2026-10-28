// Dashboard > "Audiências sem ata": cada linha traz a MODALIDADE, para a tela mostrar "Concluir" (e não "Registrar ata")
// no ato "sem comparecimento" (ex.: Julgamento), que não tem ata. Contra MySQL real isolado.
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

test('audiências sem ata: cada linha traz a modalidade (julgamento "sem comparecimento" e presencial); cancelada e com ata continuam de fora', async () => {
  const julgamento = await nova('sem_comparecimento', '08:00:00');
  const presencial = await nova('presencial', '09:00:00');
  const cancelada = await nova('sem_comparecimento', '10:00:00', 'cancelada');
  const comAta = await nova('sem_comparecimento', '11:00:00');
  await sql('INSERT INTO ata_audiencia (audiencia_id, criado_por) VALUES (?, 1)', [comAta]).catch(async () => { await sql('UPDATE audiencia SET ata_impressa = 1 WHERE id = ?', [comAta]); });
  const r = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const linhas = r.body.dados.audiencias_sem_ata;
  const porId = Object.fromEntries(linhas.map(l => [l.id, l.modalidade]));
  assert.equal(porId[julgamento], 'sem_comparecimento', 'o julgamento traz a modalidade "sem_comparecimento"');
  assert.equal(porId[presencial], 'presencial', 'a audiência presencial traz "presencial"');
  assert.ok(!(cancelada in porId), 'cancelada não entra');
  assert.ok(!(comAta in porId), 'com ata (ou ata impressa) não entra');
});
