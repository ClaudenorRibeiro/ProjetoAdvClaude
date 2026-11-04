// Horário sequencial de prazo/tarefa NOVOS na Agenda e no Google (backend/src/utils/horaAgenda.js):
// prazo e tarefa criados para a MESMA pessoa no MESMO dia ganham horários diferentes, em sequência
// (pares primeiro); sem responsável (do escritório) usa uma fila só deles; prazo/tarefa editados
// NÃO recalculam a hora (só na criação).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; const F = {};
const emitir = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const admin = () => emitir(1, 1, 'sessao-admin');
const api = (token = admin()) => ({
  post: p => request(app).post(p).set('Authorization', `Bearer ${token}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${token}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const dia = (deslocamento = 0) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const horaDoPrazo = async (id) => (await um('SELECT hora_agenda FROM prazos_processo WHERE id = ?', [id])).hora_agenda;
const horaDaTarefa = async (id) => (await um('SELECT hora_agenda FROM tarefas WHERE id = ?', [id])).hora_agenda;

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6301, 1)')).insertId;
  F.proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000301-00.2026.5.15.0001', 'PROCESSO DA HORA', 1, 1, 1, 1)", [pasta])).insertId;
  const resp = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo, notif_tela)
     VALUES ('Responsável Hora', 'u_hora_1', 'x', 'u_hora_1@example.invalid', 'advogado', 2, 1, 0, 'sessao-hora-1', 0, 0, 0)`)).insertId;
  F.resp = resp;
});
test.after(async () => pool.end());

test('prazo e tarefa NOVOS do MESMO responsável e MESMO dia ganham horas diferentes (fila por pessoa+dia, pares primeiro)', async () => {
  const d = dia(20);
  const p1 = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0), data_final: d, delegado_para: F.resp });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  const t1 = await api().post('/api/tarefas').send({ titulo: 'Tarefa 1 da hora', data_vencimento: d, atribuida_para: F.resp });
  assert.equal(t1.status, 201, JSON.stringify(t1.body));
  const p2 = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0), data_final: d, delegado_para: F.resp });
  assert.equal(p2.status, 201, JSON.stringify(p2.body));

  const h1 = await horaDoPrazo(p1.body.dados.id);
  const h2 = await horaDaTarefa(t1.body.dados.id);
  const h3 = await horaDoPrazo(p2.body.dados.id);
  assert.equal(h1, '08:00:00');
  assert.equal(h2, '08:02:00');
  assert.equal(h3, '08:04:00');
});

test('prazo/tarefa SEM responsável (do escritório) usa uma fila própria, separada da fila da pessoa', async () => {
  const d = dia(21);
  const semResp = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0), data_final: d });
  assert.equal(semResp.status, 201, JSON.stringify(semResp.body));
  const comResp = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0), data_final: d, delegado_para: F.resp });
  assert.equal(comResp.status, 201, JSON.stringify(comResp.body));
  assert.equal(await horaDoPrazo(semResp.body.dados.id), '08:00:00');
  assert.equal(await horaDoPrazo(comResp.body.dados.id), '08:00:00'); // filas diferentes: a da pessoa não repete a do escritório, mas também não "sabe" dela
});

test('editar o prazo NÃO recalcula a hora (só na criação)', async () => {
  const d = dia(22);
  const criado = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0), data_final: d, delegado_para: F.resp });
  assert.equal(criado.status, 201, JSON.stringify(criado.body));
  const antes = await horaDoPrazo(criado.body.dados.id);
  const ed = await api().put(`/api/prazos/${criado.body.dados.id}`).send({ descricao: 'Mudou só a descrição', data_inicio: dia(0), data_final: d });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(await horaDoPrazo(criado.body.dados.id), antes);
});
