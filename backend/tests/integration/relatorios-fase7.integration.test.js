// Relatórios (Fase 7) — agendamento e envio por e-mail, contra MySQL real.
// O servidor de e-mail é trocado por um falso (nada sai de verdade): o teste confere o que SERIA enviado.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const nodemailer = require('nodemailer');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
process.env.SMTP_HOST = 'smtp.teste.invalid';
const enviados = [];
nodemailer.createTransport = () => ({ sendMail: async (o) => { enviados.push(o); return {}; } });

const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { executarVencidos } = require('../../src/services/relatorios/agendamento/envio');
const { proximaExecucao } = require('../../src/services/relatorios/agendamento/proxima');

let app;
const token = (id, nivel) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao: `sessao-${id}` }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
async function criarUsuario(id, nome, { ativo = 1, email = `u${id}@example.invalid`, permissoes = [] } = {}) {
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (?, ?, ?, 'x', ?, 'advogado', 2, ?, 0, ?, 0, 0)`, [id, nome, `u${id}`, email, ativo, `sessao-${id}`]);
  for (const [modulo, sub, acao] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, modulo, sub, acao]);
}
const RECEITA = { assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [] };
const BASE = { frequencia: 'diaria', hora: '08:00', formato: 'pdf' };
const vencer = (id) => sql('UPDATE relatorio_agendamento SET proxima_execucao = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [id]);
const ag = async (id) => (await sql('SELECT * FROM relatorio_agendamento WHERE id = ?', [id]))[0];

let dono; let colega; let modeloId;
test.before(async () => {
  await recriarBancoTeste();
  const base = [['relatorios', null, 'visualizar'], ['prazos', null, 'visualizar']];
  await criarUsuario(4, 'Dono', { permissoes: [...base, ['relatorios', 'criar', 'cadastrar']] });
  await criarUsuario(5, 'Colega Ok', { permissoes: base });
  await criarUsuario(6, 'Colega sem Prazos', { permissoes: [['relatorios', null, 'visualizar']] });
  await criarUsuario(7, 'Colega Inativo', { ativo: 0, permissoes: base });
  await criarUsuario(8, 'Colega sem Email', { email: '', permissoes: base });
  await criarUsuario(9, 'Outro com criar', { permissoes: [...base, ['relatorios', 'criar', 'cadastrar']] });
  app = criarApp();
  dono = token(4, 2); colega = token(5, 2);
  const m = await req(dono).post('/api/relatorios/modelos').send({ nome: 'Prazos agendados', receita: RECEITA });
  modeloId = m.body.dados.id;
});
test.after(async () => pool.end());

test('quem não pode criar relatórios não agenda; campos inválidos são recusados', async () => {
  assert.equal((await req(colega).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [5] })).status, 403);
  for (const ruim of [{ frequencia: 'anual' }, { hora: '25:00' }, { formato: 'exe' }, { destinatarios: [] }, { frequencia: 'semanal' }, { frequencia: 'mensal', dia_mes: 32 }]) {
    const r = await req(dono).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [5], ...ruim });
    assert.equal(r.status, 422, JSON.stringify(ruim));
  }
  assert.equal((await req(dono).post('/api/relatorios/agendamentos').send({ ...BASE, modelo_id: 99999, destinatarios: [5] })).status, 404);
});

test('destinatários: só ativos, com e-mail, com acesso a Relatórios e ao assunto', async () => {
  const c = (await req(dono).get(`/api/relatorios/agendamentos/candidatos?modelo_id=${modeloId}`)).body.dados.candidatos;
  const por = Object.fromEntries(c.map(x => [x.id, x.pode]));
  assert.deepEqual([por[4], por[5], por[6], por[7], por[8]], [true, true, false, undefined, false]);
  assert.ok(c.every(x => !('email' in x)), 'a tela não recebe e-mails');
  for (const ruim of [6, 7, 8, 999]) {
    const r = await req(dono).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [5, ruim] });
    assert.equal(r.status, 422, `destinatário ${ruim}`);
  }
  assert.equal((await sql('SELECT COUNT(*) AS n FROM relatorio_agendamento'))[0].n, 0);
});

test('cálculo do próximo envio (diário, semanal, mensal em mês curto)', () => {
  assert.equal(proximaExecucao({ frequencia: 'diaria', hora: '08:00:00' }, '2026-10-01 07:59:00'), '2026-10-01 08:00:00');
  assert.equal(proximaExecucao({ frequencia: 'diaria', hora: '08:00:00' }, '2026-10-01 08:00:00'), '2026-10-02 08:00:00');
  assert.equal(proximaExecucao({ frequencia: 'semanal', dia_semana: 1, hora: '09:30:00' }, '2026-10-01 10:00:00'), '2026-10-05 09:30:00');   // 01/10/2026 é quinta
  assert.equal(proximaExecucao({ frequencia: 'mensal', dia_mes: 31, hora: '06:00:00' }, '2027-02-10 00:00:00'), '2027-02-28 06:00:00');
  assert.equal(proximaExecucao({ frequencia: 'mensal', dia_mes: 1, hora: '06:00:00' }, '2026-12-31 23:00:00'), '2027-01-01 06:00:00');
});

let agId;
test('criar, listar, atualizar e o limite de 10 por usuário', async () => {
  const r = await req(dono).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [4, 5] });
  assert.equal(r.status, 201);
  agId = r.body.dados.id;
  assert.equal(r.body.dados.hora, '08:00');
  assert.deepEqual(r.body.dados.destinatarios.map(d => d.nome), ['Dono', 'Colega Ok']);
  assert.ok(r.body.dados.proxima_execucao);
  assert.equal((await req(dono).get('/api/relatorios/agendamentos')).body.dados.agendamentos.length, 1);
  const u = await req(dono).put(`/api/relatorios/agendamentos/${agId}`).send({ frequencia: 'semanal', dia_semana: 3, hora: '10:15', formato: 'docx' });
  assert.equal(u.status, 200);
  assert.deepEqual([u.body.dados.frequencia, u.body.dados.hora, u.body.dados.formato], ['semanal', '10:15', 'docx']);
  for (let i = 0; i < 9; i++) assert.equal((await req(dono).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [5] })).status, 201);
  assert.equal((await req(dono).post('/api/relatorios/agendamentos').send({ modelo_id: modeloId, ...BASE, destinatarios: [5] })).status, 409);
  await sql('DELETE FROM relatorio_agendamento WHERE id <> ?', [agId]);
});

test('só o dono vê, altera, exclui e testa o próprio agendamento', async () => {
  const outro = token(9, 2);
  assert.equal((await req(outro).get('/api/relatorios/agendamentos')).body.dados.agendamentos.length, 0);
  assert.equal((await req(outro).put(`/api/relatorios/agendamentos/${agId}`).send({ ativo: false })).status, 404);
  assert.equal((await req(outro).delete(`/api/relatorios/agendamentos/${agId}`)).status, 404);
  assert.equal((await req(outro).post(`/api/relatorios/agendamentos/${agId}/testar`)).status, 404);
});

test('envio automático: PDF anexado a cada destinatário, uma vez só, e registro no histórico', async () => {
  await req(dono).put(`/api/relatorios/agendamentos/${agId}`).send({ frequencia: 'diaria', hora: '08:00', formato: 'pdf' });
  enviados.length = 0;
  await executarVencidos();
  assert.equal(enviados.length, 0, 'ainda não venceu');
  await vencer(agId);
  await executarVencidos();
  assert.deepEqual(enviados.map(e => e.to).sort(), ['u4@example.invalid', 'u5@example.invalid']);
  const a = enviados[0].attachments[0];
  assert.match(a.filename, /^Prazos agendados - \d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(a.content.subarray(0, 4).toString(), '%PDF');
  assert.ok(!/Prazo|vencimento/i.test(enviados[0].html.replace(/Prazos agendados/g, '')), 'o corpo não carrega dados do relatório');
  const x = await ag(agId);
  assert.deepEqual([x.ultimo_status, x.falhas_seguidas], ['ok', 0]);
  assert.ok(new Date(x.proxima_execucao) > new Date(Date.now() - 4 * 3600000), 'próximo envio reprogramado para o futuro');
  await executarVencidos();
  assert.equal(enviados.length, 2, 'rodar de novo não repete o envio');
  assert.equal((await sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'relatorio_agendamento' AND acao = 'enviar'"))[0].n, 1);
});

test('Excel e Word também saem como anexo de verdade', async () => {
  for (const [formato, ext] of [['xlsx', 'xlsx'], ['docx', 'docx']]) {
    await req(dono).put(`/api/relatorios/agendamentos/${agId}`).send({ formato });
    enviados.length = 0;
    await vencer(agId);
    await executarVencidos();
    assert.equal(enviados.length, 2, formato);
    assert.match(enviados[0].attachments[0].filename, new RegExp(`\\.${ext}$`));
    assert.equal(enviados[0].attachments[0].content.subarray(0, 2).toString(), 'PK');
  }
});

test('conferência a cada envio: quem perdeu o acesso não recebe; sem ninguém elegível vira falha', async () => {
  await sql("DELETE FROM permissoes WHERE usuario_id = 5 AND modulo = 'prazos'");
  enviados.length = 0;
  await vencer(agId);
  await executarVencidos();
  assert.deepEqual(enviados.map(e => e.to), ['u4@example.invalid']);
  await sql('UPDATE usuarios SET ativo = 0 WHERE id = 4');   // dono inativo: ninguém recebe e o agendamento falha
  enviados.length = 0;
  await vencer(agId);
  await executarVencidos();
  assert.equal(enviados.length, 0);
  const x = await ag(agId);
  assert.deepEqual([x.ultimo_status, x.falhas_seguidas], ['falha', 1]);
  assert.match(x.ultimo_erro, /inativo/);
  await sql('UPDATE usuarios SET ativo = 1 WHERE id = 4');
});

test('3 falhas seguidas pausam o agendamento e avisam o dono; retomar zera a contagem', async () => {
  await sql("UPDATE permissoes SET permitido = 0 WHERE usuario_id = 4 AND submodulo = 'criar'");   // dono perdeu o direito de criar relatórios
  enviados.length = 0;
  for (let i = 0; i < 2; i++) { await vencer(agId); await executarVencidos(); }
  const x = await ag(agId);
  assert.deepEqual([!!x.ativo, x.falhas_seguidas, x.proxima_execucao], [false, 3, null]);
  assert.equal(enviados.length, 1, 'aviso de pausa ao dono');
  assert.equal(enviados[0].to, 'u4@example.invalid');
  assert.match(enviados[0].subject, /pausado/);
  await sql("UPDATE permissoes SET permitido = 1 WHERE usuario_id = 4 AND submodulo = 'criar'");
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (5, 'prazos', NULL, 'visualizar', 1)");
  const r = await req(dono).put(`/api/relatorios/agendamentos/${agId}`).send({ ativo: true });
  assert.equal(r.status, 200);
  const y = await ag(agId);
  assert.deepEqual([!!y.ativo, y.falhas_seguidas], [true, 0]);
  assert.ok(y.proxima_execucao);
});

test('"Testar agora" manda só para o dono; relatório excluído leva o agendamento junto', async () => {
  enviados.length = 0;
  assert.equal((await req(dono).post(`/api/relatorios/agendamentos/${agId}/testar`)).status, 200);
  assert.deepEqual(enviados.map(e => e.to), ['u4@example.invalid']);
  assert.equal((await req(dono).delete(`/api/relatorios/modelos/${modeloId}`)).status, 200);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM relatorio_agendamento'))[0].n, 0);
});
