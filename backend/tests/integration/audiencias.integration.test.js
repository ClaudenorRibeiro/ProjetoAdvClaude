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

test('ata: prazo com quantidade 0 usa a data final; com as duas, a data final manda; só com quantidade 0 recusa', async () => {
  const conn = await conectarBancoTeste();
  let subtipo;
  try { subtipo = (await conn.execute('SELECT id FROM prazo_subtipo ORDER BY id LIMIT 1'))[0][0].id; } finally { await conn.end(); }
  const domingo = '2030-06-02';
  const ata = async (hora, prazos) => {
    const criada = await criar(audiencia({ modalidade: 'presencial', tipo_audiencia_id: 4, hora }));
    assert.equal(criada.status, 201, JSON.stringify(criada.body));
    const r = await request(app).post(`/api/audiencias/${criada.body.dados.id}/ata`).set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ advogado_acompanhante: 'ninguem', teve_prazo: true, prazos });
    return { r, id: criada.body.dados.id };
  };
  const base = { data_inicio: domingo, subtipo_id: subtipo, tipo_dias: 'uteis', descricao: 'Prazo da ata' };
  // 1) zero dias úteis (início e final no mesmo domingo): grava com a data final e sem quantidade
  const a = await ata('10:21', [{ ...base, data_final: domingo, quantidade: '0' }]);
  assert.equal(a.r.status, 201, JSON.stringify(a.r.body));
  // 2) quantidade e data final diferentes: a data final digitada manda
  const b = await ata('10:22', [{ ...base, data_inicio: '2030-06-03', data_final: '2030-06-28', quantidade: '3', tipo_dias: 'corridos', descricao: 'Final manda' }]);
  assert.equal(b.r.status, 201, JSON.stringify(b.r.body));
  const c2 = await conectarBancoTeste();
  try {
    const [r1] = await c2.execute("SELECT quantidade, data_vencimento FROM prazos_processo WHERE descricao = 'Prazo da ata' ORDER BY id DESC LIMIT 1");
    assert.equal(r1[0].quantidade, null);
    assert.equal(String(r1[0].data_vencimento instanceof Date ? r1[0].data_vencimento.toISOString() : r1[0].data_vencimento).slice(0, 10), domingo);
    const [r2] = await c2.execute("SELECT quantidade, data_vencimento FROM prazos_processo WHERE descricao = 'Final manda' ORDER BY id DESC LIMIT 1");
    assert.equal(String(r2[0].data_vencimento instanceof Date ? r2[0].data_vencimento.toISOString() : r2[0].data_vencimento).slice(0, 10), '2030-06-28');
  } finally { await c2.end(); }
  // 3) só com quantidade 0 e sem data final: recusa com a mensagem da ata e não cria a ata
  const d = await ata('10:23', [{ ...base, quantidade: 0 }]);
  assert.equal(d.r.status, 400, JSON.stringify(d.r.body));
  assert.match(d.r.body.mensagem, /data final ou quantidade de dias/i);
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

// ---- link da audiência virtual: sem espaços, com https:// e só endereço de verdade ----
test('link da audiência: espaço no meio sai, https:// é completado, endereço inválido é recusado (criar e editar); fora do virtual o link é ignorado', async () => {
  const virtual = (hora, link, extra = {}) => criar(audiencia({ modalidade: 'virtual', data: '2031-02-03', hora, plataforma_virtual: 'zoom', link_virtual: link, ...extra }));
  const linkNoBanco = async (id) => {
    const conn = await conectarBancoTeste();
    try { return (await conn.execute('SELECT link_virtual FROM audiencia WHERE id = ?', [id]))[0][0].link_virtual; } finally { await conn.end(); }
  };
  const comEspaco = await virtual('11:01', ' https://us02web.zoom.us/j /85601023093?pwd=dytLODJ6\nckdYamZOUjF2YW ');
  assert.equal(comEspaco.status, 201, JSON.stringify(comEspaco.body));
  assert.equal(await linkNoBanco(comEspaco.body.dados.id), 'https://us02web.zoom.us/j/85601023093?pwd=dytLODJ6ckdYamZOUjF2YW');
  const semHttps = await virtual('11:02', 'meet.google.com/abc-defg-hij');
  assert.equal(semHttps.status, 201, JSON.stringify(semHttps.body));
  assert.equal(await linkNoBanco(semHttps.body.dados.id), 'https://meet.google.com/abc-defg-hij');
  const vazio = await virtual('11:03', '   ');
  assert.equal(vazio.status, 201);
  assert.equal(await linkNoBanco(vazio.body.dados.id), null);

  for (const [hora, ruim] of [['11:04', 'link da sala'], ['11:05', 'javascript:alert(1)'], ['11:06', 'Link: https://zoom.us/j/1'], ['11:07', 'https://semponto']]) {
    const r = await virtual(hora, ruim);
    assert.equal(r.status, 400, `${ruim}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.mensagem, /não é um endereço válido/);
  }
  const naoTexto = await virtual('11:08', ['https://zoom.us/j/1']);
  assert.equal(naoTexto.status, 400);

  // editar: link com espaço é limpo; link inválido é recusado e nada muda
  const id = comEspaco.body.dados.id;
  const editar = (link) => request(app).put(`/api/audiencias/${id}`).set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ tipo_audiencia_id: 1, data: '2031-02-03', hora: '11:01', modalidade: 'virtual', plataforma_virtual: 'zoom', link_virtual: link, responsaveis: [], testemunhas: [] });
  const ok = await editar('https://zoom.us/j/ 999');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(await linkNoBanco(id), 'https://zoom.us/j/999');
  const ruim = await editar('qualquer coisa');
  assert.equal(ruim.status, 400);
  assert.equal(await linkNoBanco(id), 'https://zoom.us/j/999');

  // fora do virtual o link nem é conferido (link velho esquecido não impede de salvar) e não é gravado
  const presencial = await criar(audiencia({ modalidade: 'presencial', data: '2031-02-03', hora: '11:09', link_virtual: 'lixo antigo' }));
  assert.equal(presencial.status, 201, JSON.stringify(presencial.body));
  assert.equal(await linkNoBanco(presencial.body.dados.id), null);
});

test('link da audiência: a nova audiência criada pela ata também limpa o link e recusa endereço inválido', async () => {
  const ata = async (hora, link, horaNova = '09:30') => {
    const criada = await criar(audiencia({ modalidade: 'presencial', data: '2001-03-05', hora, tipo_audiencia_id: 4 }));
    assert.equal(criada.status, 201, JSON.stringify(criada.body));
    return request(app).post(`/api/audiencias/${criada.body.dados.id}/ata`).set('Authorization', `Bearer ${tokenAdmin}`).send({
      advogado_acompanhante: 'ninguem', nova_audiencia: true,
      nova_audiencia_dados: { tipo_audiencia_id: 1, data: '2031-03-04', hora: horaNova, modalidade: 'virtual', plataforma_virtual: 'zoom', link_virtual: link },
    });
  };
  const boa = await ata('12:01', 'zoom.us/j /123 456');
  assert.equal(boa.status, 201, JSON.stringify(boa.body));
  const conn = await conectarBancoTeste();
  try {
    const [r] = await conn.execute("SELECT link_virtual FROM audiencia WHERE data = '2031-03-04' AND hora = '09:30:00'");
    assert.equal(r.length, 1);
    assert.equal(r[0].link_virtual, 'https://zoom.us/j/123456');
  } finally { await conn.end(); }
  const ruim = await ata('12:02', 'sem endereço', '09:45');
  assert.equal(ruim.status, 400, JSON.stringify(ruim.body));
  assert.match(ruim.body.mensagem, /não é um endereço válido/);
  const c2 = await conectarBancoTeste();
  try { assert.equal((await c2.execute("SELECT COUNT(*) n FROM audiencia WHERE data = '2031-03-04' AND hora = '09:30:00'"))[0][0].n, 1); } finally { await c2.end(); }   // a recusada não criou nada
});
