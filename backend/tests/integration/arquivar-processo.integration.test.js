// Trava de arquivamento: processo só vai para um status que ENCERRA (ex.: "Arquivado") com nada pendente —
// pela edição do processo e pela etiqueta do escritório ligada a um status. Vale por processo, nunca por pasta.
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
  post: p => request(app).post(p).set('Authorization', `Bearer ${admin}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${admin}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
let seq = 0;
async function novoProc() {
  const r = await api().post('/api/processos').send({
    numPasta: 7300 + (++seq), NomeTituloProc: `ARQUIVAR ${seq}`, tipo_id: 1, status_id: F.aberto, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autor }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reu }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const statusDe = async (id) => Number((await sql('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id);
const editar = (id, statusId) => api().put(`/api/processos/${id}`).send({ NomeTituloProc: 'ARQUIVAR EDIT', tipo_id: 1, status_id: statusId, cliente_polo: 'autor' });
const etiquetar = (id) => api().put('/api/etiquetas/escritorio/marcar').send({ modulo: 'processos', registro_id: id, slot: 1 });

// cada item cria UMA pendência de um tipo; "resolver" deixa o mesmo item resolvido
const PENDENCIAS = {
  'parcela a receber': {
    criar: async (p) => { const a = await acordo(p); await parcela(a, 'pendente'); },
    resolver: async (p) => { await sql("UPDATE acordo_parcela ap JOIN acordo a ON a.id = ap.acordo_id SET ap.status = 'cancelada' WHERE a.processo_id = ?", [p]); },
  },
  'multa a receber': {
    criar: async (p) => { const a = await acordo(p); const pa = await parcela(a, 'pago', { cli: '2026-01-06' }); await multa(pa, 'pendente'); },
    resolver: async (p) => { await sql("UPDATE acordo_parcela_multa m JOIN acordo_parcela ap ON ap.id = m.parcela_id JOIN acordo a ON a.id = ap.acordo_id SET m.status = 'cancelada' WHERE a.processo_id = ?", [p]); },
  },
  'repasse a fazer (parcela)': {
    criar: async (p) => { const a = await acordo(p); await parcela(a, 'pago', {}); },
    resolver: async (p) => { await sql("UPDATE acordo_parcela ap JOIN acordo a ON a.id = ap.acordo_id SET ap.repasse_cliente_em = '2026-01-07' WHERE a.processo_id = ?", [p]); },
  },
  'repasse a fazer (multa)': {
    criar: async (p) => { const a = await acordo(p); const pa = await parcela(a, 'pago', { cli: '2026-01-06' }); await multa(pa, 'pago', { habilitado: 1 }); },
    resolver: async (p) => { await sql("UPDATE acordo_parcela_multa m JOIN acordo_parcela ap ON ap.id = m.parcela_id JOIN acordo a ON a.id = ap.acordo_id SET m.repasse_cliente_em = '2026-01-07' WHERE a.processo_id = ?", [p]); },
  },
  'prazo em aberto': {
    criar: async (p) => { await sql("INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, criado_por, status) VALUES (?, '2020-01-01', '2020-01-10', 1, 'aberto')", [p]); },
    resolver: async (p) => { await sql("UPDATE prazos_processo SET status = 'concluido' WHERE processo_id = ?", [p]); },
  },
  'tarefa em aberto': {
    criar: async (p) => { await sql("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa pendente', ?, 1, 0)", [p]); },
    resolver: async (p) => { await sql('UPDATE tarefas SET concluida = 1 WHERE processo_id = ?', [p]); },
  },
  'audiência em aberto': {
    criar: async (p) => { await sql("INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, criado_por, status) VALUES (?, ?, '2020-01-10', '10:00:00', 1, 'agendada')", [p, F.tipoAud]); },
    resolver: async (p) => { await sql("UPDATE audiencia SET status = 'realizada' WHERE processo_id = ?", [p]); },
  },
  'perícia em aberto': {
    criar: async (p) => { await sql("INSERT INTO pericia (processo_id, criado_por, status) VALUES (?, 1, 'agendada')", [p]); },
    resolver: async (p) => { await sql("UPDATE pericia SET status = 'cancelada' WHERE processo_id = ?", [p]); },
  },
};
const TEXTO = {
  'parcela a receber': /1 parcela a receber/, 'multa a receber': /1 multa a receber/,
  'repasse a fazer (parcela)': /1 repasse a fazer/, 'repasse a fazer (multa)': /1 repasse a fazer/,
  'prazo em aberto': /1 prazo em aberto/, 'tarefa em aberto': /1 tarefa em aberto/,
  'audiência em aberto': /1 audiência em aberto/, 'perícia em aberto': /1 perícia em aberto/,
};
const acordo = async (p) => (await sql("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, status) VALUES (?, 'acordo', 'Arquivar', 100, 1, '2026-01-05', 'ativo')", [p])).insertId;
const parcela = async (a, status, { cli = null } = {}) =>
  (await sql("INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_valor, valor_liquido, status, recebido_em, repasse_cliente_em) VALUES (?, 1, '2026-01-05', 100, 20, 80, ?, ?, ?)",
    [a, status, status === 'pago' ? '2026-01-05' : null, cli])).insertId;
const multa = async (pa, status, { habilitado = 0 } = {}) =>
  (await sql("INSERT INTO acordo_parcela_multa (parcela_id, vencimento, valor_bruto, honor_valor, valor_liquido, repasse_cliente_habilitado, status, recebido_em) VALUES (?, '2026-01-05', 10, 2, 8, ?, ?, ?)",
    [pa, habilitado, status, status === 'pago' ? '2026-01-06' : null])).insertId;

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  F.autor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Autora Arquivar', '52998224725')")).insertId;
  F.reu = (await sql("INSERT INTO pessoas_juridicas (razao_social, nome_fantasia, cnpj) VALUES ('Reu Arquivar Ltda', 'Reu Arq', '11222333000181')")).insertId;
  F.aberto = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Em andamento ARQ', 0)")).insertId;
  F.outro = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Outro aberto ARQ', 0)")).insertId;
  F.arquivado = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Arquivado ARQ', 1)")).insertId;
  F.encerrado = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Encerrado ARQ', 1)")).insertId;
  F.tipoAud = (await sql("INSERT INTO tipo_audiencia (nome) VALUES ('Arquivar ARQ')")).insertId;
  await sql("INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado, status_id) VALUES ('processos', 1, '#888888', 'Arquivado ARQ', ?) ON DUPLICATE KEY UPDATE status_id = VALUES(status_id)", [F.arquivado]);
});

test.after(async () => pool.end());

for (const [nome, p] of Object.entries(PENDENCIAS)) {
  test(`arquivar com ${nome}: recusa (edição e etiqueta), nada muda; resolvido, arquiva`, async () => {
    const id = await novoProc();
    await p.criar(id);

    const r1 = await editar(id, F.arquivado);
    assert.equal(r1.status, 422, JSON.stringify(r1.body));
    assert.match(r1.body.mensagem, /^Não é possível arquivar: 1 /);
    assert.match(r1.body.mensagem, TEXTO[nome]);
    assert.equal(await statusDe(id), F.aberto);

    const r2 = await etiquetar(id);
    assert.equal(r2.status, 422, JSON.stringify(r2.body));
    assert.match(r2.body.mensagem, /^Não é possível arquivar: /);
    assert.equal(await statusDe(id), F.aberto);
    assert.equal((await sql('SELECT COUNT(*) AS n FROM processos_etiquetas_escritorio WHERE processo_id = ?', [id]))[0].n, 0, 'a etiqueta não pode ficar gravada');

    await p.resolver(id);
    const r3 = await editar(id, F.arquivado);
    assert.equal(r3.status, 200, JSON.stringify(r3.body));
    assert.equal(await statusDe(id), F.arquivado);
  });
}

test('a mensagem junta tudo o que está pendente, no plural', async () => {
  const id = await novoProc();
  await PENDENCIAS['parcela a receber'].criar(id);
  await PENDENCIAS['parcela a receber'].criar(id);
  await PENDENCIAS['prazo em aberto'].criar(id);
  await PENDENCIAS['audiência em aberto'].criar(id);
  const r = await editar(id, F.arquivado);
  assert.equal(r.status, 422);
  assert.equal(r.body.mensagem, 'Não é possível arquivar: 2 parcelas a receber, 1 prazo em aberto, 1 audiência em aberto.');
});

test('só barra quem ARQUIVA: status que não encerra e troca entre status encerrados passam com pendência', async () => {
  const id = await novoProc();
  await PENDENCIAS['tarefa em aberto'].criar(id);
  assert.equal((await editar(id, F.outro)).status, 200);
  assert.equal(await statusDe(id), F.outro);
  assert.equal((await editar(id, F.aberto)).status, 200);

  const j = await novoProc();
  await sql('UPDATE tblproc SET status_id = ? WHERE id = ?', [F.arquivado, j]);   // já arquivado antes da regra
  await PENDENCIAS['tarefa em aberto'].criar(j);
  assert.equal((await editar(j, F.arquivado)).status, 200, 'salvar sem mudar o status não é barrado');
  assert.equal((await editar(j, F.encerrado)).status, 200, 'arquivado → outro encerrado não é barrado');
});

test('a regra é por processo: o irmão da mesma pasta sem pendência arquiva', async () => {
  const a = await novoProc();
  const pasta = (await sql('SELECT pasta_id FROM tblproc WHERE id = ?', [a]))[0].pasta_id;
  const b = (await sql("INSERT INTO tblproc (pasta_id, NomeTituloProc, tipo_id, status_id, ativo) VALUES (?, 'IRMAO ARQ', 1, ?, 1)", [pasta, F.aberto])).insertId;
  await PENDENCIAS['prazo em aberto'].criar(a);
  assert.equal((await editar(a, F.arquivado)).status, 422);
  assert.equal((await editar(b, F.arquivado)).status, 200);
});

test('etiqueta Arquivado sem pendência arquiva e grava a etiqueta', async () => {
  const id = await novoProc();
  const r = await etiquetar(id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await statusDe(id), F.arquivado);
});
