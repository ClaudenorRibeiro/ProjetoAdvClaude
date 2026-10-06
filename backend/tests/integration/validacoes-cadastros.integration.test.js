// Teste de servidor das VALIDAÇÕES dos cadastros auxiliares e das listas (pendências P1, P2, P3 e P4 do CLAUDE.md):
// dado ruim (nome que não é texto, texto longo demais, id "abc", página negativa, busca com % e _) tem de dar aviso claro
// (400/404) ou resposta normal — NUNCA "Erro interno" (500) — e o que é válido continua funcionando.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = () => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${admin}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${admin}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${admin}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${admin}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const LONGO = 'x'.repeat(6000);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
});
test.after(async () => {
  // Gravar os dados do escritório reagenda os alertas de prazo (node-cron); sem parar, o processo de teste nunca termina.
  // (o último PUT do teste usa só UM horário: com dois, o node-cron guarda só um deles e o outro não dá para parar daqui)
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ------------------------------------------------------------------ P1: nome ruim nos cadastros auxiliares
// [rótulo, rota de criar, corpo válido, limite do nome]
const CADASTROS = [
  ['tipo de prazo', '/api/prazos/tipos'],
  ['tipo de audiência', '/api/audiencias/tipos'],
  ['tipo de perícia', '/api/pericias/tipos'],
  ['documento da pendência', '/api/pendencias-documento/tipos'],
  ['forma de pagamento', '/api/financeiro/formas-pagamento', { uso_permitido: 'ambos' }],
  ['instituição financeira', '/api/financeiro/instituicoes-financeiras'],
];
test('cadastros auxiliares: nome que não é texto, vazio ou longo demais = 400 com aviso (nunca 500); nome bom cria, renomeia e exclui', async () => {
  for (const [rotulo, rota, extra = {}] of CADASTROS) {
    for (const ruim of [123, ['a'], { a: 1 }, '   ', '', LONGO]) {
      const r = await api().post(rota).send({ nome: ruim, ...extra });
      assert.equal(r.status, 400, `${rotulo}: criar com nome ${JSON.stringify(ruim).slice(0, 20)} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
      assert.ok(r.body.mensagem, `${rotulo}: sem mensagem`);
    }
    const criado = await api().post(rota).send({ nome: `Item ${rotulo} Validado`, ...extra });
    assert.equal(criado.status, 201, `${rotulo}: criar bom → ${criado.status} ${JSON.stringify(criado.body)}`);
    const id = criado.body.dados.id;
    for (const ruim of [123, ['a'], LONGO]) {
      const r = await api().put(`${rota}/${id}`).send({ nome: ruim, ...extra });
      assert.equal(r.status, 400, `${rotulo}: renomear com ${JSON.stringify(ruim).slice(0, 20)} → ${r.status}`);
    }
    const renomeado = await api().put(`${rota}/${id}`).send({ nome: `Item ${rotulo} Renomeado`, ...extra });
    assert.equal(renomeado.status, 200, `${rotulo}: renomear bom → ${renomeado.status} ${JSON.stringify(renomeado.body)}`);
    const apagado = await api().delete(`${rota}/${id}`);
    assert.equal(apagado.status, 200, `${rotulo}: excluir → ${apagado.status}`);
  }
});

test('subtipo de prazo: nome ruim e tipo que não é número = 400; subtipo bom cria, renomeia e exclui', async () => {
  const tipo = (await api().post('/api/prazos/tipos').send({ nome: 'Tipo Para Subtipos' })).body.dados.id;
  for (const ruim of [{ nome: 123, tipo_prazo_id: tipo }, { nome: LONGO, tipo_prazo_id: tipo }, { nome: 'Bom', tipo_prazo_id: 'abc' }, { nome: 'Bom', tipo_prazo_id: [1] }, { nome: 'Bom' }]) {
    const r = await api().post('/api/prazos/subtipos').send(ruim);
    assert.equal(r.status, 400, `subtipo ${JSON.stringify(ruim).slice(0, 40)} → ${r.status}`);
  }
  const sub = await api().post('/api/prazos/subtipos').send({ nome: 'Subtipo Validado', tipo_prazo_id: tipo });
  assert.equal(sub.status, 201);
  const id = sub.body.dados.id;
  for (const ruim of [123, LONGO]) assert.equal((await api().put(`/api/prazos/subtipos/${id}`).send({ nome: ruim })).status, 400);
  assert.equal((await api().put(`/api/prazos/subtipos/${id}`).send({ nome: 'Subtipo Renomeado' })).status, 200);
  assert.equal((await api().delete(`/api/prazos/subtipos/${id}`)).status, 200);
});

test('freelancer (advogado freela): campos ruins = 400; bom cria, edita e exclui', async () => {
  const bom = { nome: 'Freela Validado', email: 'freela@example.invalid', oab: 'SP123456' };
  for (const ruim of [{ ...bom, nome: 123 }, { ...bom, nome: LONGO }, { ...bom, email: 123 }, { ...bom, email: 'sem-arroba' }, { ...bom, oab: LONGO }, { ...bom, telefone: LONGO }, { ...bom, cidade: ['a'] }, { ...bom, profissao_id: 'abc' }]) {
    const r = await api().post('/api/audiencias/freelas').send(ruim);
    assert.equal(r.status, 400, `freela ${JSON.stringify(ruim).slice(0, 50)} → ${r.status}`);
  }
  const criado = await api().post('/api/audiencias/freelas').send(bom);
  assert.equal(criado.status, 201, JSON.stringify(criado.body));
  const id = criado.body.dados.id;
  assert.equal((await api().put(`/api/audiencias/freelas/${id}`).send({ ...bom, nome: LONGO })).status, 400);
  assert.equal((await api().put(`/api/audiencias/freelas/${id}`).send({ ...bom, nome: 'Freela Editado' })).status, 200);
  assert.equal((await api().delete(`/api/audiencias/freelas/${id}`)).status, 200);
});

test('audiência: motivo da reversão que não é texto = 400 (e não 500)', async () => {
  for (const motivo of [123, ['a'], LONGO]) {
    const r = await api().put('/api/audiencias/1/reverter').send({ motivo });
    assert.equal(r.status, 400, `reverter com ${JSON.stringify(motivo).slice(0, 20)} → ${r.status}`);
  }
});

test('modelo de documento: nome ou descrição ruins = 400 (nada vai para o armazenamento)', async () => {
  for (const campos of [{ nome: LONGO }, { nome: 'Bom', descricao: LONGO }, { nome: '   ' }]) {
    let req = request(app).post('/api/documentos/modelos').set('Authorization', `Bearer ${admin}`);
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    const r = await req;
    assert.equal(r.status, 400, `modelo ${JSON.stringify(campos).slice(0, 30)} → ${r.status}`);
    assert.match(r.body.mensagem, /muito long|obrigat/, `modelo ${JSON.stringify(campos).slice(0, 30)}: o aviso tem de falar do campo, não do arquivo → ${r.body.mensagem}`);
  }
});

test('dados do escritório: texto longo, horário e dias inválidos = 400; dados bons gravam', async () => {
  const bom = { nome: 'Escritório Validado', horario_alerta_prazos: '18:00', dias_alerta_audiencia: 3 };
  for (const ruim of [{ ...bom, nome: LONGO }, { ...bom, nome: 123 }, { ...bom, nome: '' }, { ...bom, cidade: LONGO }, { ...bom, email: ['a'] }, { ...bom, horario_alerta_prazos: '25:99' },
    { ...bom, horario_alerta_prazos_2: 'abc' }, { ...bom, dias_alerta_audiencia: -5 }, { ...bom, dias_sem_movimentacao: 99999999999 }, { ...bom, mensagem_aniversario: LONGO + LONGO }, { ...bom, titulo_aba: LONGO }]) {
    const r = await api().put('/api/configuracoes/escritorio').send(ruim);
    assert.equal(r.status, 400, `escritório ${JSON.stringify(ruim).slice(0, 60)} → ${r.status}`);
  }
  const ok = await api().put('/api/configuracoes/escritorio').send({ ...bom, dias_alerta_pericia: '4', cidade: 'Campinas' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const lido = (await sql('SELECT nome, cidade, dias_alerta_audiencia, dias_alerta_pericia, horario_alerta_prazos FROM configuracoes_escritorio WHERE id = 1'))[0];
  assert.equal(lido.nome, 'Escritório Validado'); assert.equal(lido.cidade, 'Campinas');
  assert.equal(lido.dias_alerta_audiencia, 3); assert.equal(lido.dias_alerta_pericia, 4);
});

test('agenda: novo compromisso com dado ruim = 400; compromisso bom cria, edita e exclui', async () => {
  const bom = { titulo: 'Reunião validada', data: '2099-01-05', hora_inicio: '09:00', hora_fim: '10:00' };
  for (const ruim of [{ ...bom, titulo: 123 }, { ...bom, titulo: LONGO }, { ...bom, descricao: LONGO }, { ...bom, data: 'abc' }, { ...bom, data: 12345 }, { ...bom, hora_inicio: '99:99' },
    { ...bom, hora_fim: ['a'] }, { ...bom, delegado_para: 'abc' }, { ...bom, publicacao_id: [1] }]) {
    const r = await api().post('/api/agenda/compromissos').send(ruim);
    assert.equal(r.status, 400, `agenda ${JSON.stringify(ruim).slice(0, 50)} → ${r.status}`);
  }
  const criado = await api().post('/api/agenda/compromissos').send(bom);
  assert.equal(criado.status, 201, JSON.stringify(criado.body));
  const id = criado.body.dados.id;
  assert.equal((await api().put(`/api/agenda/compromissos/${id}`).send({ ...bom, titulo: LONGO })).status, 400);
  assert.equal((await api().put(`/api/agenda/compromissos/${id}`).send({ ...bom, titulo: 'Reunião editada' })).status, 200);
  assert.equal((await api().delete(`/api/agenda/compromissos/${id}`)).status, 200);
});

// ------------------------------------------------------------------ P4: id que não é número = "não encontrado" (404)
test('id "abc", negativo ou gigante nas rotas de alterar/excluir cadastros = 404 (nunca 500)', async () => {
  const rotas = [
    ['put', '/api/prazos/tipos/ID', { nome: 'x' }], ['delete', '/api/prazos/tipos/ID'], ['put', '/api/prazos/subtipos/ID', { nome: 'x' }], ['delete', '/api/prazos/subtipos/ID'],
    ['put', '/api/audiencias/tipos/ID', { nome: 'x' }], ['delete', '/api/audiencias/tipos/ID'], ['put', '/api/audiencias/freelas/ID', { nome: 'x', email: 'a@b.cc' }], ['delete', '/api/audiencias/freelas/ID'],
    ['put', '/api/audiencias/ID/ata-impressa', {}], ['put', '/api/audiencias/ID/reverter', { motivo: 'x' }],
    ['put', '/api/pericias/tipos/ID', { nome: 'x' }], ['delete', '/api/pericias/tipos/ID'],
    ['put', '/api/pendencias-documento/tipos/ID', { nome: 'x' }], ['delete', '/api/pendencias-documento/tipos/ID'],
    ['put', '/api/financeiro/formas-pagamento/ID', { nome: 'x', uso_permitido: 'ambos' }], ['delete', '/api/financeiro/formas-pagamento/ID'],
    ['put', '/api/financeiro/instituicoes-financeiras/ID', { nome: 'x' }], ['delete', '/api/financeiro/instituicoes-financeiras/ID'],
    ['put', '/api/documentos/modelos/ID/desativar', {}], ['put', '/api/documentos/modelos/ID/reativar', {}], ['delete', '/api/documentos/modelos/ID'],
    ['put', '/api/agenda/compromissos/ID', { titulo: 'x', data: '2099-01-05' }], ['delete', '/api/agenda/compromissos/ID'], ['put', '/api/agenda/compromissos/ID/baixa', {}],
  ];
  for (const [metodo, caminho, corpo] of rotas) {
    for (const id of ['abc', '-1', '99999999999999999999', '1.5']) {
      const r = corpo ? await api()[metodo](caminho.replace('ID', id)).send(corpo) : await api()[metodo](caminho.replace('ID', id));
      assert.equal(r.status, 404, `${metodo.toUpperCase()} ${caminho.replace('ID', id)} → ${r.status}`);
    }
  }
});

// ------------------------------------------------------------------ P3: página e limite ruins
test('listas: página/limite negativos, zero ou texto viram o padrão (200), nunca 500', async () => {
  for (const rota of ['/api/prazos', '/api/publicacoes', '/api/documentos/historico', '/api/financeiro/consulta']) {
    for (const q of ['pagina=-1&limite=-5', 'pagina=0&limite=0', 'pagina=abc&limite=abc', 'pagina=99999999999&limite=99999999999']) {
      const r = await api().get(`${rota}?${q}`);
      assert.equal(r.status, 200, `${rota}?${q} → ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
  }
});

test('busca que não é texto (?busca[]=a) ou longa demais = 400 nas listas que ainda tinham erro 500', async () => {
  for (const rota of ['/api/publicacoes', '/api/pendencias-documento', '/api/processos/pastas']) {
    assert.equal((await api().get(`${rota}?busca[]=a`)).status, 400, `${rota} busca em lista`);
    assert.equal((await api().get(`${rota}?busca=${LONGO}`)).status, 400, `${rota} busca longa`);
  }
});

// ------------------------------------------------------------------ P2: "%" e "_" na busca são texto comum
const ids = (r) => (Array.isArray(r.body.dados) ? r.body.dados : (r.body.dados?.registros || r.body.dados?.tarefas || r.body.dados?.publicacoes || []));
test('busca com % e _ procura o símbolo de verdade (Tarefas, Publicações, Pendências, Perícias, Freelas e Financeiro > Consulta)', async () => {
  // Tarefas
  await sql("INSERT INTO tarefas (titulo, criado_por) VALUES ('Cota de 100% paga', 1), ('Cota de 1000 paga', 1), ('Cota_um solta', 1), ('Cota dois solta', 1)");
  const tar = async (busca) => (await api().get(`/api/tarefas?busca=${encodeURIComponent(busca)}`)).body.dados;
  const lista = (d) => (Array.isArray(d) ? d : d.tarefas || d.registros || []);
  assert.deepEqual(lista(await tar('100%')).map(t => t.titulo), ['Cota de 100% paga'], 'Tarefas: 100%');
  assert.deepEqual(lista(await tar('Cota_um')).map(t => t.titulo), ['Cota_um solta'], 'Tarefas: Cota_um');
  // Publicações
  const hash = (n) => String(n).padStart(64, '0');
  await sql("INSERT INTO publicacoes (fonte, data_publicacao, texto, texto_hash) VALUES ('aasp', CURDATE(), 'desconto de 50% ao mes', ?), ('aasp', CURDATE(), 'desconto de 500 ao mes', ?)", [hash(1), hash(2)]);
  const pub = (await api().get('/api/publicacoes?busca=50%25')).body.dados;
  const pubLista = Array.isArray(pub) ? pub : pub.publicacoes || pub.registros || [];
  assert.equal(pubLista.length, 1, 'Publicações: 50%');
  // Pendências de documentos (busca pelo nome do cliente)
  const c1 = (await sql("INSERT INTO pessoas_fisicas (nome) VALUES ('Cliente 100% Certo')")).insertId;
  const c2 = (await sql("INSERT INTO pessoas_fisicas (nome) VALUES ('Cliente 1000 Certo')")).insertId;
  await sql("INSERT INTO pendencia_documento (tipo_pessoa, pessoa_id, criado_por) VALUES ('fisica', ?, 1), ('fisica', ?, 1)", [c1, c2]);
  const pen = await api().get('/api/pendencias-documento?status=todas&busca=100%25');
  assert.equal(pen.status, 200);
  assert.equal((Array.isArray(pen.body.dados) ? pen.body.dados : pen.body.dados.registros).length, 1, 'Pendências: 100%');
  const cli = await api().get('/api/pendencias-documento/clientes?busca=100%25');
  assert.deepEqual(cli.body.dados.map(x => x.nome), ['Cliente 100% Certo'], 'Pendências (clientes): 100%');
  // Perícias: busca de peritos para a ata
  const prof = (await sql("INSERT INTO profissao (nome) VALUES ('Perícia Médica')")).insertId;
  await sql("INSERT INTO pessoas_fisicas (nome, profissao_id) VALUES ('Perito 100% Bom', ?), ('Perito 1000 Bom', ?)", [prof, prof]);
  const per = await api().get('/api/pericias/busca-peritos?busca=100%25');
  assert.deepEqual(per.body.dados.map(x => x.nome), ['Perito 100% Bom'], 'Perícias: 100%');
  // Freelancers
  await sql("INSERT INTO advogados_freela (nome, email) VALUES ('Free 100% X', 'a@b.cc'), ('Free 1000 X', 'c@d.ee')");
  const fr = await api().get('/api/audiencias/freelas?q=100%25');
  assert.deepEqual(fr.body.dados.map(x => x.nome), ['Free 100% X'], 'Freelas: 100%');
  // Financeiro > Consulta: um acordo no processo 1 (número "0000001-01...") — "%" e "_" no número do processo não casam com tudo
  const ac = await api().post('/api/financeiro/processo/1/acordo').send({ descricao: 'Acordo', valor_total: 100, qtd_parcelas: 1, data_primeira: '2026-01-05',
    parcelas: [{ numero: 1, vencimento: '2026-01-05', valor_bruto: 100, honor_tipo: 'percent', honor_percentual: 30 }] });
  assert.equal(ac.status, 201, JSON.stringify(ac.body));
  const todos = await api().get('/api/financeiro/consulta');
  assert.equal(todos.body.dados.total, 1, 'consulta sem filtro');
  for (const simbolo of ['%', '_']) {
    const r = await api().get(`/api/financeiro/consulta?num_processo=${encodeURIComponent(simbolo)}`);
    assert.equal(r.body.dados.total, 0, `consulta com ${simbolo} no número do processo não pode casar com tudo`);
  }
  assert.equal((await api().get('/api/financeiro/consulta?num_processo=0000001')).body.dados.total, 1);
  void ids;
});
