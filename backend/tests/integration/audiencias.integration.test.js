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

test('ata: o item "Tarefa" sozinho basta para registrar, grava a tarefa e o item da ata; excluir a tarefa só solta o vínculo', async () => {
  const criada = await criar(audiencia({ modalidade: 'presencial', tipo_audiencia_id: 4, hora: '10:31' }));
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  const id = criada.body.dados.id;
  const r = await request(app).post(`/api/audiencias/${id}/ata`).set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ advogado_acompanhante: 'ninguem', tarefas: [{ origem_ata: 'tarefa', titulo: 'Tarefa avulsa da ata', data_vencimento: '2030-06-10', prioridade: 'normal' }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const detalhes = await request(app).get(`/api/audiencias/${id}/detalhes-ata`).set('Authorization', `Bearer ${tokenAdmin}`);
  assert.deepEqual(detalhes.body.dados.itens.map(i => i.tipo), ['tarefa']);
  const item = detalhes.body.dados.itens[0];
  assert.equal(item.titulo, 'Tarefa avulsa da ata');
  assert.ok(item.registro_id, 'o item da ata precisa apontar para a tarefa criada');
  const conn = await conectarBancoTeste();
  try {
    const [t] = await conn.execute('SELECT titulo, processo_id FROM tarefas WHERE id = ?', [item.registro_id]);
    assert.equal(t[0].titulo, 'Tarefa avulsa da ata');
    assert.ok(t[0].processo_id, 'a tarefa nasce ligada ao processo da audiência');
    const del = await request(app).delete(`/api/tarefas/${item.registro_id}`).set('Authorization', `Bearer ${tokenAdmin}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    const [it] = await conn.execute("SELECT registro_id FROM ata_audiencia_itens WHERE tipo = 'tarefa' AND titulo = 'Tarefa avulsa da ata'");
    assert.equal(it.length, 1, 'o histórico da ata continua');
    assert.equal(it[0].registro_id, null);
  } finally { await conn.end(); }
});

test('editar ata: corrige o advogado, o resumo e as observações e ACRESCENTA itens; o que já existe não muda; tudo no Histórico', async () => {
  const criada = await criar(audiencia({ modalidade: 'presencial', tipo_audiencia_id: 4, hora: '10:41' }));
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  const id = criada.body.dados.id;
  const adm = (r) => r.set('Authorization', `Bearer ${tokenAdmin}`);
  const registrar = await adm(request(app).post(`/api/audiencias/${id}/ata`))
    .send({ advogado_acompanhante: 'ninguem', observacoes: 'Obs original', tarefas: [{ origem_ata: 'tarefa', titulo: 'Tarefa original da ata', data_vencimento: '2030-06-10' }] });
  assert.equal(registrar.status, 201, JSON.stringify(registrar.body));
  const editar = (corpo, tk = tokenAdmin) => request(app).put(`/api/audiencias/${id}/ata`).set('Authorization', `Bearer ${tk}`).send(corpo);
  const detalhes = async () => (await adm(request(app).get(`/api/audiencias/${id}/detalhes-ata`))).body.dados;
  const historico = async () => (await adm(request(app).get(`/api/audiencias/${id}/historico`))).body.dados;

  // nada para salvar, entradas ruins e permissão
  const nada = await editar({});
  assert.equal(nada.status, 400); assert.match(nada.body.mensagem, /nenhuma alteração/i);
  assert.match((await editar({ advogado_acompanhante: '' })).body.mensagem, /advogado/i);
  assert.match((await editar({ advogado_acompanhante: 'abc' })).body.mensagem, /advogado inválido/i);
  assert.equal((await editar({ observacoes: { x: 1 } })).status, 400);
  assert.equal((await editar({ observacoes: 'x'.repeat(5001) })).status, 400);
  assert.equal((await editar({ tarefas: 'não é lista' })).status, 400);
  assert.equal((await editar({ tarefas: [{ origem_ata: 'qualquer', titulo: 'x', data_vencimento: '2030-06-10' }] })).status, 400);
  assert.equal((await editar({ teve_desistencia: 1 })).status, 400);                          // desistência exige o motivo
  assert.equal((await editar({ tarefas: [{ origem_ata: 'desistencia', titulo: 'x', data_vencimento: '2030-06-10' }] })).status, 400);   // tarefa de desistência sem desistência
  // sem a permissão de ata (pode ver audiências, mas não a ata): 403
  const semAta = await (async () => {
    const c = await conectarBancoTeste();
    try {
      const [u] = await c.execute(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
        VALUES ('Sem Ata', 'sem_ata_edit', 'x', 'sem_ata_edit@example.invalid', 'advogado', 2, 1, 0, 'sessao-sem-ata', 0, 0)`);
      await c.execute("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'audiencias', NULL, 'visualizar', 1)", [u.insertId]);
      return token(u.insertId, 2, 'sessao-sem-ata');
    } finally { await c.end(); }
  })();
  assert.equal((await editar({ observacoes: 'Nova' }, semAta)).status, 403);
  const inexistente = await request(app).put('/api/audiencias/999999/ata').set('Authorization', `Bearer ${tokenAdmin}`).send({ observacoes: 'x' });
  assert.equal(inexistente.status, 404);
  assert.equal((await detalhes()).itens.length, 1, 'as tentativas recusadas não gravaram nada');

  // corrige advogado, resumo e observações
  const corrigido = await editar({ advogado_acompanhante: 'usuario:1', resultado_texto: 'Resumo corrigido', observacoes: 'Obs corrigida' });
  assert.equal(corrigido.status, 200, JSON.stringify(corrigido.body));
  let d = await detalhes();
  assert.equal(d.ata.advogado_id, 1); assert.equal(d.ata.sem_advogado, 0);
  assert.equal(d.ata.resultado, 'Resumo corrigido'); assert.equal(d.ata.observacoes, 'Obs corrigida');
  assert.equal(d.itens.length, 1, 'o item que já existia continua só um');
  const campos = (await historico()).map(h => h.campo_alterado);
  for (const c of ['ata_advogado', 'ata_resumo', 'ata_observacoes']) assert.ok(campos.includes(c), `Histórico sem ${c}`);
  const trocaAdv = (await historico()).find(h => h.campo_alterado === 'ata_advogado');
  assert.match(trocaAdv.valor_anterior, /Ninguém/); assert.ok(trocaAdv.valor_novo);
  assert.equal((await editar({ advogado_acompanhante: 'usuario:1' })).status, 400, 'mesmo advogado e nada mais = nenhuma alteração');

  // acrescenta itens esquecidos: outra tarefa, desistência (com tarefa) e retorno aos autos
  const mais = await editar({
    tarefas: [{ origem_ata: 'tarefa', titulo: 'Tarefa esquecida', data_vencimento: '2030-07-01' },
              { origem_ata: 'desistencia', titulo: 'Providências da desistência', data_vencimento: '2030-07-02' }],
    teve_desistencia: 1, motivo_desistencia: 'Cliente desistiu', teve_retorno_autos: 1, comentario_retorno_autos: 'Voltar aos autos',
  });
  assert.equal(mais.status, 200, JSON.stringify(mais.body)); assert.equal(mais.body.dados.itens_acrescentados, 4);
  d = await detalhes();
  assert.deepEqual(d.itens.map(i => i.tipo), ['tarefa', 'tarefa', 'tarefa_desistencia', 'desistencia', 'retorno_autos']);
  assert.equal(d.ata.teve_desistencia, 1); assert.equal(d.ata.teve_retorno_autos, 1);
  const conn = await conectarBancoTeste();
  try {
    const [t] = await conn.execute("SELECT COUNT(*) AS n FROM tarefas WHERE titulo IN ('Tarefa esquecida', 'Providências da desistência')");
    assert.equal(Number(t[0].n), 2, 'as tarefas acrescentadas existem de verdade');
  } finally { await conn.end(); }
  assert.equal((await historico()).filter(h => h.campo_alterado === 'ata_item').length, 4);

  // repetir a desistência não duplica o item (a ata já tem)
  const repetida = await editar({ teve_desistencia: 1, motivo_desistencia: 'Outro motivo', observacoes: 'Obs final' });
  assert.equal(repetida.status, 200, JSON.stringify(repetida.body));
  d = await detalhes();
  assert.equal(d.itens.filter(i => i.tipo === 'desistencia').length, 1);
  assert.equal(d.ata.observacoes, 'Obs final');
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
