// PROCESSO APENSO — arquivar e excluir o principal (edição do processo e etiqueta do escritório). Servidor contra MySQL real isolado.
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
const F = {};
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
const msg = (r) => String(r.body.mensagem || '');
const partes = () => ({ autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.credor }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.devedora }] });
let seq = 0;
async function comum() {
  seq += 1;
  const r = await api().post('/api/processos').send({ numPasta: 9100 + seq, numProc: `ARQ-COMUM-${seq}`, NomeTituloProc: `COMUM ${seq}`, tipo_id: 1, status_id: F.aberto, cliente_polo: 'autor', ...partes() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}
async function apenso(p, numero, extra = {}) {
  const r = await api().post('/api/processos').send({ apenso_de_id: p.id, numProc: numero, NomeTituloProc: `APENSO ${numero}`, tipo_id: 1, status_id: F.aberto, cliente_polo: 'autor', ...partes(), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const statusDe = async (id) => Number((await sql('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id);
const editar = (id, statusId, extra = {}) => api().put(`/api/processos/${id}`).send({ NomeTituloProc: 'EDIT', tipo_id: 1, status_id: statusId, cliente_polo: 'autor', ...extra });
const etiquetar = (id, extra = {}) => api().put('/api/etiquetas/escritorio/marcar').send({ modulo: 'processos', registro_id: id, slot: 1, ...extra });
const existe = async (id) => (await sql('SELECT id FROM tblproc WHERE id = ?', [id])).length === 1;

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  F.credor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Credor Arquivar', '52998224725')")).insertId;
  F.devedora = (await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Devedora Arquivar Ltda', '11222333000181')")).insertId;
  F.aberto = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Em andamento APA', 0)")).insertId;
  F.outro = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Outro aberto APA', 0)")).insertId;
  F.arquivado = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Arquivado APA', 1)")).insertId;
  F.encerrado = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Encerrado APA', 1)")).insertId;
  await sql("INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado, status_id) VALUES ('processos', 1, '#888888', 'Arquivado APA', ?) ON DUPLICATE KEY UPDATE status_id = VALUES(status_id)", [F.arquivado]);
});
test.after(async () => pool.end());

test('arquivar o principal com apensos abertos: avisa (409), nada muda; confirmando, arquiva todos com o MESMO status', async () => {
  const p = await comum(); const a1 = await apenso(p, 'ARQ-A-1'); const a2 = await apenso(p, 'ARQ-A-2');
  const r1 = await editar(p.id, F.arquivado);
  assert.equal(r1.status, 409, JSON.stringify(r1.body));
  assert.equal(r1.body.detalhes.codigo, 'CONFIRMAR_ARQUIVAMENTO_DE_APENSOS');
  assert.deepEqual(r1.body.detalhes.apensos.map(x => x.numProc), ['ARQ-A-1', 'ARQ-A-2']);
  assert.match(msg(r1), /2 apenso\(s\): ARQ-A-1, ARQ-A-2/);
  for (const id of [p.id, a1, a2]) assert.equal(await statusDe(id), F.aberto);   // nada foi gravado
  const r2 = await editar(p.id, F.arquivado, { confirmar_apensos: true, motivo_status: 'Encerrado' });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  for (const id of [p.id, a1, a2]) assert.equal(await statusDe(id), F.arquivado);
  const hist = await sql("SELECT dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status'", [a1]);
  assert.equal(hist.length, 1);
  const dn = typeof hist[0].dados_novos === 'string' ? JSON.parse(hist[0].dados_novos) : hist[0].dados_novos;
  assert.equal(dn.origem, 'arquivamento_do_principal'); assert.equal(dn.status_novo_id, F.arquivado); assert.equal(dn.motivo, 'Encerrado');
});

test('apenso com pendência BLOQUEIA o arquivamento do principal e diz qual apenso', async () => {
  const p = await comum(); const a1 = await apenso(p, 'PEND-A-1'); await apenso(p, 'PEND-A-2');
  await sql("INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, criado_por, status) VALUES (?, '2020-01-01', '2020-01-10', 1, 'aberto')", [a1]);
  for (const confirmar of [undefined, true]) {
    const r = await editar(p.id, F.arquivado, { confirmar_apensos: confirmar });
    assert.equal(r.status, 422, JSON.stringify(r.body));
    assert.match(msg(r), /o apenso PEND-A-1 — 1 prazo em aberto/); assert.doesNotMatch(msg(r), /PEND-A-2/);
  }
  assert.equal(await statusDe(p.id), F.aberto);
  // pela etiqueta também
  const e = await etiquetar(p.id, { confirmar_apensos: true });
  assert.equal(e.status, 422); assert.equal((await sql('SELECT slot FROM processos_etiquetas_escritorio WHERE processo_id = ?', [p.id])).length, 0);
  // resolvida a pendência, passa
  await sql("UPDATE prazos_processo SET status = 'concluido' WHERE processo_id = ?", [a1]);
  assert.equal((await editar(p.id, F.arquivado, { confirmar_apensos: true })).status, 200);
});

test('pendência do PRÓPRIO principal continua bloqueando (422) antes do aviso dos apensos', async () => {
  const p = await comum(); await apenso(p, 'PROPRIO-A-1');
  await sql("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa do principal', ?, 1, 0)", [p.id]);
  const r = await editar(p.id, F.arquivado);
  assert.equal(r.status, 422); assert.match(msg(r), /1 tarefa em aberto/);
});

test('apenso já arquivado não é tocado nem listado; só o aberto acompanha', async () => {
  const p = await comum(); const velho = await apenso(p, 'JA-ARQ-1', { status_id: F.encerrado }); const novo = await apenso(p, 'JA-ARQ-2');
  const r1 = await editar(p.id, F.arquivado);
  assert.equal(r1.status, 409); assert.deepEqual(r1.body.detalhes.apensos.map(x => x.numProc), ['JA-ARQ-2']);
  await editar(p.id, F.arquivado, { confirmar_apensos: true });
  assert.equal(await statusDe(velho), F.encerrado); assert.equal(await statusDe(novo), F.arquivado);
  assert.equal((await sql("SELECT id FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status'", [velho])).length, 0);
});

test('principal sem apenso aberto arquiva direto; outras pastas com o mesmo número do apenso não são afetadas', async () => {
  const p1 = await comum(); const p2 = await comum();
  const a1 = await apenso(p1, 'MESMO-NUM'); const a2 = await apenso(p2, 'MESMO-NUM');
  await editar(a1, F.arquivado, { numProc: 'MESMO-NUM' });   // o apenso se arquiva sozinho
  assert.equal(await statusDe(a1), F.arquivado);
  const r = await editar(p1.id, F.arquivado);   // sem apenso aberto: sem aviso
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await statusDe(a2), F.aberto); assert.equal(await statusDe(p2.id), F.aberto);
  const solo = await comum();
  assert.equal((await editar(solo.id, F.arquivado)).status, 200);
});

test('apenso arquivado sozinho respeita as próprias travas', async () => {
  const p = await comum(); const a = await apenso(p, 'SOZ-A-1');
  await sql("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa do apenso', ?, 1, 0)", [a]);
  const r = await editar(a, F.arquivado, { numProc: 'SOZ-A-1' });
  assert.equal(r.status, 422); assert.match(msg(r), /1 tarefa em aberto/); assert.equal(await statusDe(a), F.aberto);
});

test('reabrir o principal NÃO reabre os apensos; status que não encerra nunca mexe neles', async () => {
  const p = await comum(); const a = await apenso(p, 'REAB-A-1');
  await editar(p.id, F.arquivado, { confirmar_apensos: true });
  assert.equal((await editar(p.id, F.aberto)).status, 200);
  assert.equal(await statusDe(p.id), F.aberto); assert.equal(await statusDe(a), F.arquivado);
  const q = await comum(); const b = await apenso(q, 'OUTRO-A-1');
  assert.equal((await editar(q.id, F.outro)).status, 200);   // sem aviso: não arquiva
  assert.equal(await statusDe(b), F.aberto);
  // arquivado → outro encerrado não dispara a cadeia
  const c = await comum(); await apenso(c, 'ENC-A-1');
  await editar(c.id, F.arquivado, { confirmar_apensos: true });
  assert.equal((await editar(c.id, F.encerrado)).status, 200);
});

test('etiqueta do escritório ligada a status: mesmo aviso, mesma confirmação, mesmo efeito', async () => {
  const p = await comum(); const a = await apenso(p, 'ETQ-A-1');
  const r1 = await etiquetar(p.id);
  assert.equal(r1.status, 409, JSON.stringify(r1.body)); assert.equal(r1.body.detalhes.codigo, 'CONFIRMAR_ARQUIVAMENTO_DE_APENSOS');
  assert.equal((await sql('SELECT processo_id FROM processos_etiquetas_escritorio WHERE processo_id = ?', [p.id])).length, 0);   // a marca foi desfeita
  assert.equal(await statusDe(a), F.aberto);
  const r2 = await etiquetar(p.id, { confirmar_apensos: true });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(await statusDe(p.id), F.arquivado); assert.equal(await statusDe(a), F.arquivado);
  const hist = await sql("SELECT dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status'", [a]);
  const dn = typeof hist[0].dados_novos === 'string' ? JSON.parse(hist[0].dados_novos) : hist[0].dados_novos;
  assert.equal(dn.origem, 'arquivamento_do_principal');
});

test('excluir o principal: pede confirmação, leva os apensos junto e não deixa órfãos', async () => {
  const p = await comum(); const a1 = await apenso(p, 'EXC-A-1'); const a2 = await apenso(p, 'EXC-A-2');
  const r1 = await api().delete(`/api/processos/${p.id}`);
  assert.equal(r1.status, 409, JSON.stringify(r1.body)); assert.equal(r1.body.detalhes.codigo, 'CONFIRMAR_EXCLUSAO_DE_APENSOS');
  assert.deepEqual(r1.body.detalhes.apensos.map(x => x.numProc), ['EXC-A-1', 'EXC-A-2']);
  for (const id of [p.id, a1, a2]) assert.equal(await existe(id), true);
  assert.equal((await api().delete(`/api/processos/${p.id}?confirmar_apensos=0`)).status, 409);
  const r2 = await api().delete(`/api/processos/${p.id}?confirmar_apensos=1`);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  for (const id of [p.id, a1, a2]) assert.equal(await existe(id), false);
  for (const t of ['tbltituloprocautor', 'tbltituloprocreu']) assert.equal((await sql(`SELECT id FROM ${t} WHERE proc_id IN (?, ?, ?)`, [p.id, a1, a2])).length, 0);
  assert.equal((await sql("SELECT id FROM logs_auditoria WHERE tabela = 'tblproc' AND acao = 'excluir' AND registro_id IN (?, ?)", [a1, a2])).length, 2);
});

test('excluir o principal é bloqueado se algum apenso tem ligação com outros cadastros', async () => {
  const p = await comum(); const a1 = await apenso(p, 'LIG-A-1'); const a2 = await apenso(p, 'LIG-A-2');
  await sql("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa presa', ?, 1, 1)", [a2]);
  const r = await api().delete(`/api/processos/${p.id}?confirmar_apensos=1`);
  assert.equal(r.status, 400); assert.match(msg(r), /o apenso LIG-A-2 possui: 1 tarefa\(s\)/); assert.doesNotMatch(msg(r), /LIG-A-1/);
  for (const id of [p.id, a1, a2]) assert.equal(await existe(id), true);
});

test('o principal com apenso nunca é apagado pelo banco sozinho; apenso e principal sem apenso excluem direto', async () => {
  const p = await comum(); const a = await apenso(p, 'FK-A-1');
  await assert.rejects(() => sql('DELETE FROM tblproc WHERE id = ?', [p.id]), /foreign key/i);
  assert.equal((await api().delete(`/api/processos/${a}`)).status, 200);   // apenso sozinho
  assert.equal((await api().delete(`/api/processos/${p.id}`)).status, 200);   // sem apensos, sem pergunta
});
