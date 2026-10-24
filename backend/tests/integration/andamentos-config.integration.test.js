// Aviso diário de andamentos do DataJud — a CONFIGURAÇÃO (só administrador), a tela "Novidades dos processos", a LIMPEZA dos
// 6 meses, o efeito nos "processos parados" e o campo "destino" do sino.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { apagarAndamentosAntigosDoDataJud } = require('../../src/andamentosDatajud/limpeza');
const { contarProcessosParados } = require('../../src/controllers/processosController');

let app;
const emitir = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const admin = emitir(1, 1, 'sessao-admin');
const comum = emitir(2, 2, 'sessao-usuario');         // vai ganhar processos/visualizar
const semPermissao = emitir(3, 2, 'sessao-sem-permissao');
const api = (t = admin) => ({
  get: (p) => request(app).get(p).set('Authorization', `Bearer ${t}`),
  put: (p) => request(app).put(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];

let seqPasta = 9000; let seqHash = 0;
async function novoProcesso({ responsavel = null, criadoEm = null } = {}) {
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [seqPasta += 1])).insertId;
  return (await sql('INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, status_id, ativo, responsavel_id, criado_por, criado_em) VALUES (?, ?, ?, 1, 1, ?, 1, COALESCE(?, NOW()))',
    [pasta, `0000${seqPasta}-00.2026.8.26.0100`, `PROCESSO ${seqPasta}`, responsavel, criadoEm])).insertId;
}
const andamento = (processo, { fonte = 'datajud', data = '2026-10-20', codigo = 67, novidadeDias = null, criadoPor = null, descricao = 'Movimento' } = {}) =>
  sql(`INSERT INTO andamento_processual (processo_id, data, descricao, fonte, codigo_movimento, hash_movimento, criado_por, novidade_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${novidadeDias === null ? 'NULL' : 'DATE_SUB(NOW(), INTERVAL ? DAY)'})`,
    [processo, data, descricao, fonte, codigo, fonte === 'datajud' ? `h${String(seqHash += 1).padStart(6, '0')}`.padEnd(40, '0') : null, criadoPor, ...(novidadeDias === null ? [] : [novidadeDias])]);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (2, 'processos', NULL, 'visualizar', 1)");
});
test.after(async () => pool.end());
test.beforeEach(async () => {
  await sql('DELETE FROM notificacoes');
  await sql('DELETE FROM andamento_processual');
  await sql('DELETE FROM datajud_tipos_andamento');
  await sql('DELETE FROM processo_oabs');
  await sql('DELETE FROM tblproc WHERE id <> 1');
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'nenhum', datajud_aviso_escopo = 'meus', ativo = 1");
  await sql("UPDATE configuracoes_escritorio SET datajud_aviso_modo = 'todos', datajud_aviso_horario = '07:30'");
});

// ---------- configuração ----------
test('configuração: lê os padrões (todos os andamentos, 07:30, ninguém recebe) com a lista de pessoas e de tipos', async () => {
  await sql("INSERT INTO datajud_tipos_andamento (codigo, nome, quantidade) VALUES (51, 'Conclusão', 3), (67, 'Juntada', 9)");
  const r = await api().get('/api/configuracoes/datajud-avisos');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.dados;
  assert.equal(d.modo, 'todos'); assert.equal(d.horario, '07:30');
  assert.deepEqual(d.tipos.map((t) => [t.codigo, t.importante, t.novo, t.quantidade]), [[67, false, true, 9], [51, false, true, 3]], 'mais frequentes primeiro');
  assert.ok(d.usuarios.length >= 3 && d.usuarios.every((u) => u.canal === 'nenhum' && u.escopo === 'meus'));
});

test('configuração: só administrador lê e grava; sem login é 401', async () => {
  assert.equal((await request(app).get('/api/configuracoes/datajud-avisos')).status, 401);
  assert.equal((await api(comum).get('/api/configuracoes/datajud-avisos')).status, 403);
  assert.equal((await api(comum).put('/api/configuracoes/datajud-avisos').send({ modo: 'todos' })).status, 403);
  assert.equal((await request(app).put('/api/configuracoes/datajud-avisos').send({ modo: 'todos' })).status, 401);
});

test('configuração: grava modo, horário, tipos importantes e o canal de cada pessoa; o "novo" dos tipos some e fica no histórico', async () => {
  await sql("INSERT INTO datajud_tipos_andamento (codigo, nome) VALUES (51, 'Conclusão'), (67, 'Juntada')");
  const r = await api().put('/api/configuracoes/datajud-avisos').send({
    modo: 'importantes', horario: '08:45', tipos_importantes: [51],
    usuarios: [{ id: 2, canal: 'ambos', escopo: 'todos' }, { id: 3, canal: 'sino', escopo: 'meus' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.dados;
  assert.deepEqual([d.modo, d.horario], ['importantes', '08:45']);
  assert.deepEqual(d.tipos.map((t) => [t.codigo, t.importante, t.novo]).sort(), [[51, true, false], [67, false, false]]);
  assert.deepEqual(d.usuarios.filter((u) => [2, 3].includes(u.id)).map((u) => [u.id, u.canal, u.escopo]), [[2, 'ambos', 'todos'], [3, 'sino', 'meus']]);
  assert.equal((await sql("SELECT 1 FROM logs_auditoria WHERE tabela = 'configuracoes_escritorio' AND acao = 'datajud_avisos'")).length, 1);
  // desmarcar o tipo e voltar para "todos"
  const volta = await api().put('/api/configuracoes/datajud-avisos').send({ modo: 'todos', tipos_importantes: [] });
  assert.equal(volta.status, 200);
  assert.ok(volta.body.dados.tipos.every((t) => t.importante === false));
});

test('configuração: entradas ruins são recusadas com aviso claro e NADA é gravado (nem a parte que estava certa)', async () => {
  await sql("INSERT INTO datajud_tipos_andamento (codigo, nome) VALUES (51, 'Conclusão')");
  await sql("UPDATE usuarios SET email = NULL WHERE id = 3");
  const historicoAntes = (await sql("SELECT 1 FROM logs_auditoria WHERE acao = 'datajud_avisos'")).length;
  const ruins = [
    [{}, /Nada para alterar/], [[], /Nada para alterar/], [{ foo: 1 }, /não reconhecido/],
    [{ modo: 'x' }, /Modo inválido/], [{ modo: 5 }, /Modo inválido/],
    [{ horario: '7:30' }, /Horário inválido/], [{ horario: '24:00' }, /Horário inválido/], [{ horario: '07:60' }, /Horário inválido/], [{ horario: 730 }, /Horário inválido/],
    [{ tipos_importantes: 'a' }, /tipos inválida/], [{ tipos_importantes: [1.5] }, /tipos inválida/], [{ tipos_importantes: [999] }, /não existe na lista/],
    [{ usuarios: 'a' }, /pessoas inválida/], [{ usuarios: [{ id: 'a', canal: 'sino', escopo: 'meus' }] }, /Pessoa inválida/],
    [{ usuarios: [{ id: 2, canal: 'zap', escopo: 'meus' }] }, /Canal inválido/], [{ usuarios: [{ id: 2, canal: 'sino', escopo: 'x' }] }, /Escopo inválido/],
    [{ usuarios: [{ id: 999, canal: 'sino', escopo: 'meus' }] }, /Usuário não encontrado/],
    [{ usuarios: [{ id: 3, canal: 'email', escopo: 'meus' }] }, /e-mail cadastrado/],
    [{ modo: 'importantes' }, /ao menos um tipo/],
  ];
  for (const [corpo, esperado] of ruins) {
    const r = await api().put('/api/configuracoes/datajud-avisos').send(corpo);
    assert.ok(r.status === 400 || r.status === 404, `${JSON.stringify(corpo)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.mensagem), esperado, JSON.stringify(corpo));
  }
  // parte certa + parte errada: nada vale
  const r = await api().put('/api/configuracoes/datajud-avisos').send({
    horario: '09:00', tipos_importantes: [51], usuarios: [{ id: 2, canal: 'sino', escopo: 'todos' }, { id: 999, canal: 'sino', escopo: 'meus' }],
  });
  assert.equal(r.status, 404);
  assert.equal((await um('SELECT datajud_aviso_horario AS h FROM configuracoes_escritorio')).h, '07:30');
  assert.equal((await um('SELECT datajud_aviso_canal AS c FROM usuarios WHERE id = 2')).c, 'nenhum');
  assert.deepEqual(await um('SELECT importante, novo FROM datajud_tipos_andamento WHERE codigo = 51'), { importante: 0, novo: 1 });
  assert.equal((await sql("SELECT 1 FROM logs_auditoria WHERE acao = 'datajud_avisos'")).length, historicoAntes, 'nada no histórico');
});

// ---------- novidades dos processos ----------
const novidades = (t) => api(t).get('/api/andamentos/novidades');

test('novidades: só a permissão de Processos entra; mostra os últimos 7 dias, agrupado por processo, do mais novo ao mais antigo', async () => {
  assert.equal((await novidades(semPermissao)).status, 403);
  assert.equal((await request(app).get('/api/andamentos/novidades')).status, 401);
  const a = await novoProcesso(); const b = await novoProcesso();
  await andamento(a, { novidadeDias: 2, descricao: 'A antigo' });
  await andamento(a, { novidadeDias: 1, descricao: 'A recente' });
  await andamento(b, { novidadeDias: 0, descricao: 'B hoje' });
  await andamento(b, { novidadeDias: 9, descricao: 'B fora da semana' });
  await andamento(b, { novidadeDias: null, descricao: 'B primeira leitura (sem novidade)' });
  await andamento(b, { fonte: 'manual', novidadeDias: 0, criadoPor: 1, descricao: 'B manual' });
  await sql("UPDATE usuarios SET datajud_aviso_escopo = 'todos' WHERE id = 2");
  const r = await novidades(comum);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dados.dias, 7);
  assert.deepEqual(r.body.dados.processos.map((p) => [p.processo_id, p.andamentos.map((x) => x.descricao)]), [[b, ['B hoje']], [a, ['A recente', 'A antigo']]]);
  assert.ok(r.body.dados.processos[0].numPasta > 0 && r.body.dados.processos[0].pasta_id > 0);
});

test('novidades: "meus" mostra só os processos em que a pessoa é responsável ou está nas OABs; "só importantes" filtra os tipos', async () => {
  const meu = await novoProcesso({ responsavel: 2 });
  const daOab = await novoProcesso(); await sql('INSERT INTO processo_oabs (processo_id, usuario_id, criado_por) VALUES (?, 2, 1)', [daOab]);
  const alheio = await novoProcesso({ responsavel: 3 });
  await andamento(meu, { novidadeDias: 1, codigo: 51 }); await andamento(daOab, { novidadeDias: 1, codigo: 67 }); await andamento(alheio, { novidadeDias: 1 });
  const ids = async (t) => (await novidades(t)).body.dados.processos.map((p) => p.processo_id).sort();
  assert.deepEqual(await ids(comum), [meu, daOab].sort());
  await sql("UPDATE usuarios SET datajud_aviso_escopo = 'todos' WHERE id = 2");
  assert.deepEqual(await ids(comum), [meu, daOab, alheio].sort());
  await sql("INSERT INTO datajud_tipos_andamento (codigo, nome, importante) VALUES (51, 'Conclusão', 1), (67, 'Juntada', 0)");
  await sql("UPDATE configuracoes_escritorio SET datajud_aviso_modo = 'importantes'");
  assert.deepEqual(await ids(comum), [meu]);
});

// ---------- limpeza dos 6 meses ----------
test('limpeza: apaga só andamento do DataJud com mais de 6 meses (em pedaços); manual e os criados por prazo/tarefa ficam', async () => {
  const p = await novoProcesso();
  const valores = []; const params = [];
  for (let i = 0; i < 2500; i += 1) { valores.push("(?, '2025-01-15', 'Antigo', 'datajud', 26, ?, NULL)"); params.push(p, `a${String(i).padStart(6, '0')}`.padEnd(40, '0')); }
  await sql(`INSERT INTO andamento_processual (processo_id, data, descricao, fonte, codigo_movimento, hash_movimento, criado_por) VALUES ${valores.join(',')}`, params);
  await andamento(p, { descricao: 'DataJud recente', data: '2026-10-10' });
  await andamento(p, { descricao: 'DataJud de 4 meses', data: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10) });   // dentro dos 6 meses: fica
  await andamento(p, { fonte: 'manual', data: '2020-01-01', criadoPor: 1, descricao: 'Manual antigo' });
  await andamento(p, { fonte: 'manual', data: '2021-05-05', criadoPor: 1, descricao: 'Prazo concluído: X' });
  assert.equal(await apagarAndamentosAntigosDoDataJud(), 2500);
  assert.deepEqual((await sql('SELECT descricao FROM andamento_processual ORDER BY descricao')).map((x) => x.descricao), ['DataJud de 4 meses', 'DataJud recente', 'Manual antigo', 'Prazo concluído: X']);
  assert.equal(await apagarAndamentosAntigosDoDataJud(), 0, 'rodar de novo não apaga mais nada');
});

test('processos parados: o dia do último movimento do DataJud fica no processo e sobrevive à limpeza', async () => {
  const parado = await novoProcesso({ criadoEm: '2020-01-01 10:00:00' });
  const base = await contarProcessosParados();
  await sql('UPDATE tblproc SET datajud_ultima_movimentacao = DATE_SUB(CURDATE(), INTERVAL 20 DAY) WHERE id = ?', [parado]);
  assert.equal(await contarProcessosParados(), base - 1, 'movimento do DataJud recente tira o processo da lista de parados');
  await andamento(parado, { data: '2025-01-15' });
  await apagarAndamentosAntigosDoDataJud();     // some o andamento, mas o dia continua no processo
  assert.equal((await sql('SELECT 1 FROM andamento_processual WHERE processo_id = ?', [parado])).length, 0);
  assert.equal(await contarProcessosParados(), base - 1);
});

// ---------- sino ----------
test('sino: as notificações trazem o "destino" (o sino abre a tela certa)', async () => {
  await sql("INSERT INTO notificacoes (usuario_id, mensagem, destino) VALUES (2, 'Com destino', 'novidades-processos'), (2, 'Sem destino', NULL)");
  for (const rota of ['/api/notificacoes', '/api/notificacoes/todas']) {
    const r = await api(comum).get(rota);
    assert.equal(r.status, 200);
    const por = Object.fromEntries(r.body.dados.map((n) => [n.mensagem, n.destino]));
    assert.deepEqual(por, { 'Com destino': 'novidades-processos', 'Sem destino': null }, rota);
  }
});
