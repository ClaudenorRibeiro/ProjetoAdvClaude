const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app;
let tokenAdmin;
let tokenUsuario;

function token(id, nivel, sessao) {
  return jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function audiencia(overrides = {}) {
  return {
    processo_id: 1,
    tipo_audiencia_id: 1,
    data: '2001-01-01',
    hora: '10:00',
    modalidade: 'sem_comparecimento',
    responsaveis: [],
    testemunhas: [],
    ...overrides,
  };
}

async function criar(dados, autorizacao = tokenAdmin) {
  return request(app).post('/api/audiencias').set('Authorization', `Bearer ${autorizacao}`).send(dados);
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  tokenAdmin = token(1, 1, 'sessao-admin');
  tokenUsuario = token(2, 2, 'sessao-usuario');
});

test.after(async () => {
  await pool.end();
});

test('data e horário continuam obrigatórios em evento sem comparecimento', async () => {
  const semHora = await criar(audiencia({ hora: '' }));
  assert.equal(semHora.status, 400);
  assert.match(semHora.body.mensagem, /data e hora/i);
});

test('modalidade inválida é recusada pelo backend', async () => {
  const resposta = await criar(audiencia({ modalidade: 'qualquer_coisa', hora: '10:01' }));
  assert.equal(resposta.status, 400);
  assert.match(resposta.body.mensagem, /modalidade/i);
});

test('sem comparecimento ignora localização e dados virtuais e permanece agendado', async () => {
  const resposta = await criar(audiencia({
    hora: '10:02', vara_id: 999, plataforma_virtual: 'Zoom', link_virtual: 'https://example.invalid/sala',
  }));
  assert.equal(resposta.status, 201);

  const conn = await conectarBancoTeste();
  try {
    const [rows] = await conn.execute('SELECT modalidade, vara_id, plataforma_virtual, link_virtual, status FROM audiencia WHERE id=?', [resposta.body.dados.id]);
    assert.deepEqual(rows[0], {
      modalidade: 'sem_comparecimento', vara_id: null, plataforma_virtual: null, link_virtual: null, status: 'agendada',
    });
  } finally { await conn.end(); }
});

test('evento passado não é concluído automaticamente', async () => {
  const resposta = await criar(audiencia({ tipo_audiencia_id: 2, hora: '10:03' }));
  assert.equal(resposta.status, 201);
  const detalhe = await request(app).get(`/api/audiencias/${resposta.body.dados.id}`).set('Authorization', `Bearer ${tokenAdmin}`);
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.body.dados.status, 'agendada');
});

test('resultado sem comparecimento exige texto e permite texto sem providência adicional', async () => {
  const criada = await criar(audiencia({ tipo_audiencia_id: 3, hora: '10:04' }));
  const id = criada.body.dados.id;

  const vazio = await request(app).post(`/api/audiencias/${id}/ata`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ advogado_acompanhante: 'ninguem', resultado_texto: '   ' });
  assert.equal(vazio.status, 400);
  assert.match(vazio.body.mensagem, /descreva/i);

  const salvo = await request(app).post(`/api/audiencias/${id}/ata`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ advogado_acompanhante: 'ninguem', resultado_texto: 'Conclusos para sentença.' });
  assert.equal(salvo.status, 201); // registrar ata CRIA a ata (ata_audiencia) — 201, não 200

  const detalhes = await request(app).get(`/api/audiencias/${id}/detalhes-ata`)
    .set('Authorization', `Bearer ${tokenAdmin}`);
  assert.equal(detalhes.status, 200);
  assert.equal(detalhes.body.dados.ata.resultado, 'Conclusos para sentença.');
  assert.deepEqual(detalhes.body.dados.itens, []);
});

test('audiência presencial mantém a exigência de ao menos um acontecimento', async () => {
  const criada = await criar(audiencia({ modalidade: 'presencial', tipo_audiencia_id: 4, hora: '10:05' }));
  const resposta = await request(app).post(`/api/audiencias/${criada.body.dados.id}/ata`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ advogado_acompanhante: 'ninguem', resultado_texto: 'Texto isolado' });
  assert.equal(resposta.status, 400);
  assert.match(resposta.body.mensagem, /selecione ao menos um item/i);
});

test('sem comparecimento recusa testemunhas e desfaz a audiência inteira', async () => {
  const resposta = await criar(audiencia({
    hora: '10:06',
    testemunhas: [{ pessoa_id: 99991, parte_pessoa_id: 99992 }],
  }));
  assert.equal(resposta.status, 400);

  const conn = await conectarBancoTeste();
  try {
    const [rows] = await conn.execute("SELECT id FROM audiencia WHERE data='2001-01-01' AND hora='10:06:00'");
    assert.equal(rows.length, 0);
  } finally { await conn.end(); }
});

test('falha após o INSERT provoca rollback real', async () => {
  const resposta = await criar(audiencia({
    modalidade: 'presencial', hora: '10:07',
    testemunhas: [{ pessoa_id: 99991, parte_pessoa_id: 99992 }],
  }));
  assert.ok([400, 422, 500].includes(resposta.status));

  const conn = await conectarBancoTeste();
  try {
    const [rows] = await conn.execute("SELECT id FROM audiencia WHERE data='2001-01-01' AND hora='10:07:00'");
    assert.equal(rows.length, 0);
  } finally { await conn.end(); }
});

test('duas gravações concorrentes no mesmo horário deixam apenas uma ativa', async () => {
  const dados = audiencia({ hora: '10:08' });
  const respostas = await Promise.all([criar(dados), criar(dados)]);
  assert.deepEqual(respostas.map(r => r.status).sort(), [201, 409]);

  const conn = await conectarBancoTeste();
  try {
    const [rows] = await conn.execute("SELECT id FROM audiencia WHERE data='2001-01-01' AND hora='10:08:00' AND status='agendada'");
    assert.equal(rows.length, 1);
  } finally { await conn.end(); }
});

test('usuário autenticado sem nível administrativo recebe 403 em área administrativa', async () => {
  const resposta = await request(app).get('/api/configuracoes/escritorio').set('Authorization', `Bearer ${tokenUsuario}`);
  assert.equal(resposta.status, 403);
  assert.doesNotMatch(resposta.body.mensagem, /token|sessão expirada/i);
});
