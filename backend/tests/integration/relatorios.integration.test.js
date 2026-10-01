// Relatórios (Fase 1) — API + MySQL descartável: permissões, visibilidade, limite "x", Excel e registro de uso.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const ExcelJS = require('exceljs');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const L = require('../../src/services/relatorios/limites');

let app; let admin; let usuario; let semPermissao; let chefe;

const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const receitaPrazos = (extra = {}) => ({ assunto: 'prazos', colunas: ['pasta', 'processo', 'vencimento', 'status', 'responsavel'], filtros: { op: 'E', itens: [] }, ordem: [{ campo: 'vencimento', direcao: 'asc' }], ...extra });
const baixarBinario = (res, cb) => { const partes = []; res.on('data', c => partes.push(c)); res.on('end', () => cb(null, Buffer.concat(partes))); };

test.before(async () => {
  await recriarBancoTeste();
  // usuário 4: vê prazos de todos e pode criar relatórios
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (4, 'Chefe de Testes', 'chefeteste', 'x', 'chefe@example.invalid', 'advogado', 2, 1, 0, 'sessao-chefe', 0, 0)`);
  const perms = [];
  for (const m of ['prazos', 'tarefas', 'relatorios']) perms.push([4, m, null, 'visualizar', 1]);
  perms.push([4, 'prazos', 'ver_todos', 'visualizar', 1], [4, 'relatorios', 'criar', 'cadastrar', 1]);
  const conn = await conectarBancoTeste();
  try { await conn.query('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES ?', [perms]); } finally { await conn.end(); }

  // prazos: admin(1), usuário(2), escritório(NULL), sem-permissão(3) + 7 do escritório para a paginação
  const p = (resp, venc) => sql('INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, delegado_para, criado_por, descricao) VALUES (1, ?, ?, ?, 1, ?)', ['2026-01-05', venc, resp, `prazo ${resp}`]);
  await p(1, '2026-01-10'); await p(2, '2026-01-11'); await p(null, '2026-01-12'); await p(3, '2026-01-13');
  for (let i = 0; i < 7; i++) await p(null, `2026-02-0${i + 1}`);
  const t = (resp, titulo) => sql('INSERT INTO tarefas (titulo, atribuida_para, data_vencimento, criado_por, processo_id) VALUES (?, ?, ?, 1, 1)', [titulo, resp, '2026-03-01']);
  await t(2, 'tarefa do usuário'); await t(1, 'tarefa do admin'); await t(null, 'tarefa do escritório');

  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario');
  semPermissao = token(3, 2, 'sessao-sem-permissao'); chefe = token(4, 2, 'sessao-chefe');
});
test.after(async () => pool.end());

test('catálogo: só mostra o que o usuário pode usar e nunca vaza SQL', async () => {
  const a = await req(admin).get('/api/relatorios/catalogo');
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.dados.assuntos.map(x => x.chave).sort(), ['audiencias', 'financeiro_lancamentos', 'financeiro_parcelas', 'pericias', 'pessoas_fisicas', 'pessoas_juridicas', 'prazos', 'processos', 'tarefas']);
  assert.ok(a.body.dados.periodos.some(p => p.valor === 'proximos_30_dias'));
  const txt = JSON.stringify(a.body);
  assert.doesNotMatch(txt, /pp\.|LPAD|JOIN|tblproc|expr/);
  const prazos = a.body.dados.assuntos.find(x => x.chave === 'prazos');
  const status = prazos.campos.find(c => c.chave === 'status');
  assert.ok(status.operadores.some(o => o.valor === 'em') && status.opcoes.length === 5);

  assert.equal((await req(usuario).get('/api/relatorios/catalogo')).status, 200);
  assert.equal((await req(semPermissao).get('/api/relatorios/catalogo')).status, 403);
});

test('visibilidade: sem "ver todos" só os seus + os do escritório; admin e quem tem a permissão veem tudo', async () => {
  const run = async (t) => (await req(t).post('/api/relatorios/executar').send({ receita: receitaPrazos({ colunas: ['descricao'] }), limite: 200 }));
  const u = await run(usuario);
  assert.equal(u.status, 200);
  const descricoes = u.body.dados.linhas.map(l => l.descricao);
  assert.ok(descricoes.includes('prazo 2'));                                   // o dele
  assert.equal(descricoes.filter(d => d === 'prazo null').length, 8);         // os do escritório
  assert.ok(!descricoes.includes('prazo 1') && !descricoes.includes('prazo 3')); // dos outros usuários: nunca
  assert.equal(u.body.dados.total, 9);
  assert.equal((await run(admin)).body.dados.total, 11);
  assert.equal((await run(chefe)).body.dados.total, 11);
});

test('segurança: não dá para burlar a restrição por filtro, nem injetar SQL', async () => {
  const outro = receitaPrazos({ filtros: { op: 'E', itens: [{ campo: 'responsavel', operador: 'em', valor: ['1'] }] } });
  const r = await req(usuario).post('/api/relatorios/executar').send({ receita: outro });
  assert.equal(r.status, 422);
  assert.match(r.body.mensagem, /opção que você não pode usar/);

  const inj = receitaPrazos({ filtros: { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: "x'); DROP TABLE prazos_processo; --" }] } });
  const ok = await req(admin).post('/api/relatorios/executar').send({ receita: inj });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.dados.total, 0);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM prazos_processo'))[0].n, 11);

  const coluna = await req(admin).post('/api/relatorios/executar').send({ receita: receitaPrazos({ colunas: ['pasta', 'senha_hash'] }) });
  assert.equal(coluna.status, 422);
  assert.equal((await req(semPermissao).post('/api/relatorios/executar').send({ receita: receitaPrazos() })).status, 403);
});

test('execução: filtros, ordem, paginação estável e dados legíveis', async () => {
  const r = receitaPrazos({
    colunas: ['pasta', 'processo', 'vencimento', 'status', 'responsavel', 'descricao'],
    filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'entre', valor: ['2026-02-01', '2026-02-28'] }] },
  });
  const vistos = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    const res = await req(admin).post('/api/relatorios/executar').send({ receita: r, pagina, limite: 3 });
    assert.equal(res.status, 200);
    assert.equal(res.body.dados.total, 7);
    vistos.push(...res.body.dados.linhas.map(l => l.vencimento));
    if (pagina === 3) assert.equal(res.body.dados.linhas.length, 1);
  }
  assert.deepEqual(vistos, ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07']);
  const um = (await req(admin).post('/api/relatorios/executar').send({ receita: r, limite: 1 })).body.dados;
  assert.equal(um.linhas[0].pasta, '99001');
  assert.equal(um.linhas[0].processo, '0000001-01.2026.5.15.0001');
  assert.equal(um.linhas[0].status, 'Atrasado');   // rótulo, não o código
  assert.ok(um.linhas[0].__pasta_id);
  assert.deepEqual(um.colunas.map(c => c.rotulo), ['Pasta', 'Processo', 'Vencimento', 'Status', 'Responsável', 'Descrição']);

  const bool = await req(admin).post('/api/relatorios/executar').send({ receita: { assunto: 'tarefas', colunas: ['titulo', 'concluida', 'pasta'],
    filtros: { op: 'E', itens: [{ campo: 'concluida', operador: 'falso' }] } } });
  assert.equal(bool.body.dados.total, 3);
  assert.equal(bool.body.dados.linhas[0].concluida, false);
  assert.equal(bool.body.dados.linhas[0].pasta, '99001'); // pasta veio pelo processo vinculado
});

test('relatórios salvos: permissão "criar", limite "x" (padrão e exceção), nome único, dono e duplicar', async () => {
  const dados = { nome: 'Prazos da semana', descricao: 'teste', receita: receitaPrazos() };
  assert.equal((await req(usuario).post('/api/relatorios/modelos').send(dados)).status, 403); // não tem relatorios.criar

  assert.equal((await req(admin).put('/api/relatorios/limites').send({ padrao: 2 })).status, 200);
  const a = await req(chefe).post('/api/relatorios/modelos').send(dados);
  assert.equal(a.status, 201);
  assert.equal(a.body.dados.nome, 'Prazos da semana');
  assert.equal((await req(chefe).post('/api/relatorios/modelos').send(dados)).status, 409);  // mesmo nome
  const b = await req(chefe).post('/api/relatorios/modelos').send({ ...dados, nome: 'Outro' });
  assert.equal(b.status, 201);
  const cheio = await req(chefe).post('/api/relatorios/modelos').send({ ...dados, nome: 'Terceiro' });
  assert.equal(cheio.status, 409);
  assert.match(cheio.body.mensagem, /2 de 2 relatórios/);
  assert.equal((await req(chefe).post(`/api/relatorios/modelos/${a.body.dados.id}/duplicar`)).status, 409); // duplicar também respeita o limite

  assert.equal((await req(admin).put('/api/relatorios/limites').send({ usuarios: { 4: 4 } })).status, 200);
  const dup = await req(chefe).post(`/api/relatorios/modelos/${a.body.dados.id}/duplicar`);
  assert.equal(dup.status, 201);
  assert.equal(dup.body.dados.nome, 'Cópia de Prazos da semana');

  const lista = await req(chefe).get('/api/relatorios/modelos');
  assert.deepEqual({ n: lista.body.dados.modelos.length, limite: lista.body.dados.limite, criados: lista.body.dados.criados }, { n: 3, limite: 4, criados: 3 });
  assert.equal((await req(admin).get('/api/relatorios/modelos')).body.dados.modelos.length, 0); // ninguém vê o do outro
  assert.equal((await req(admin).post('/api/relatorios/executar').send({ modelo_id: a.body.dados.id })).status, 404);

  // a receita salva é só escolhas — nunca dados
  const [linha] = await sql('SELECT definicao FROM relatorio_modelo WHERE id = ?', [a.body.dados.id]);
  const def = typeof linha.definicao === 'string' ? JSON.parse(linha.definicao) : linha.definicao;
  assert.deepEqual(Object.keys(def).sort(), ['agrupar', 'assunto', 'colunas', 'filtros', 'metricas', 'ordem', 'ordemGrupo', 'versao']);

  const upd = await req(chefe).put(`/api/relatorios/modelos/${b.body.dados.id}`).send({ nome: 'Renomeado', receita: receitaPrazos({ colunas: ['pasta'] }) });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.body.dados.receita.colunas, ['pasta']);
  assert.equal((await req(chefe).put(`/api/relatorios/modelos/${b.body.dados.id}`).send({ nome: 'Prazos da semana' })).status, 409);
  assert.equal((await req(chefe).put(`/api/relatorios/modelos/${b.body.dados.id}/preferencias`).send({ linhas_por_pagina: 25 })).status, 200);
  assert.equal((await req(chefe).put(`/api/relatorios/modelos/${b.body.dados.id}/preferencias`).send({ linhas_por_pagina: 7 })).status, 422);
  assert.deepEqual((await req(chefe).get('/api/relatorios/modelos')).body.dados.modelos.find(m => m.id === b.body.dados.id).preferencias, { linhas_por_pagina: 25 });

  assert.equal((await req(chefe).delete(`/api/relatorios/modelos/${dup.body.dados.id}`)).status, 200);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM relatorio_modelo_usuario WHERE modelo_id = ?', [dup.body.dados.id]))[0].n, 0); // vínculo saiu junto
  assert.equal((await req(chefe).delete(`/api/relatorios/modelos/${dup.body.dados.id}`)).status, 404);
});

test('relatório salvo roda de novo com as permissões de HOJE do usuário', async () => {
  const [salvo] = await sql("SELECT id FROM relatorio_modelo WHERE dono_id = 4 AND nome = 'Prazos da semana'");
  const ok = await req(chefe).post('/api/relatorios/executar').send({ modelo_id: salvo.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.dados.modelo.nome, 'Prazos da semana');
  await sql("UPDATE permissoes SET permitido = 0 WHERE usuario_id = 4 AND modulo = 'prazos' AND submodulo IS NULL");
  assert.equal((await req(chefe).post('/api/relatorios/executar').send({ modelo_id: salvo.id })).status, 403);
  await sql("UPDATE permissoes SET permitido = 1 WHERE usuario_id = 4 AND modulo = 'prazos' AND submodulo IS NULL");
});

test('Excel: arquivo legível com cabeçalho, datas reais e aba de informações', async () => {
  const receita = receitaPrazos({ colunas: ['pasta', 'vencimento', 'status', 'descricao'], filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'no_periodo', valor: 'este_ano' }] } });
  const res = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(baixarBinario).send({ receita, formato: 'xlsx', nome: 'Meu relatório/teste' });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml/);
  const nomeArquivo = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers['content-disposition'])[1]);
  assert.match(nomeArquivo, /^Meu relatórioteste - \d{4}-\d{2}-\d{2}\.xlsx$/); // acento preservado; "/" removido
  assert.equal(res.headers['cache-control'], 'no-store');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const ws = wb.getWorksheet(1);
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Pasta', 'Vencimento', 'Status', 'Descrição']);
  assert.equal(ws.rowCount, 1 + 11);
  const dataCell = ws.getRow(2).getCell(2).value;
  assert.ok(dataCell instanceof Date);
  assert.equal(dataCell.toISOString().slice(0, 10), '2026-01-10');
  assert.equal(ws.getRow(2).getCell(2).numFmt, 'dd/mm/yyyy');
  assert.equal(ws.getRow(2).getCell(1).value, '99001');
  const info = wb.getWorksheet('Informações');
  const mapa = Object.fromEntries(info.getRows(1, info.rowCount).map(r => [r.getCell(1).value, r.getCell(2).value]));
  assert.equal(mapa['Total de linhas'], 11);
  assert.equal(mapa.Assunto, 'Prazos');
  assert.match(String(mapa.Filtros), /Vencimento no período Este ano/);
});

test('Excel: respeita a restrição do usuário, recusa excesso de linhas e formato inválido', async () => {
  const doUsuario = await req(usuario).post('/api/relatorios/exportar').buffer(true).parse(baixarBinario).send({ receita: receitaPrazos({ colunas: ['descricao'] }) });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(doUsuario.body);
  assert.equal(wb.getWorksheet(1).rowCount, 1 + 9);

  const original = L.LIMITE_EXCEL;
  L.LIMITE_EXCEL = 3;
  try {
    const grande = await req(admin).post('/api/relatorios/exportar').send({ receita: receitaPrazos() });
    assert.equal(grande.status, 413);
    assert.match(grande.body.mensagem, /máximo para exportar/);
  } finally { L.LIMITE_EXCEL = original; }
  assert.equal((await req(admin).post('/api/relatorios/exportar').send({ receita: receitaPrazos(), formato: 'pdf' })).status, 422);
  assert.equal((await req(semPermissao).post('/api/relatorios/exportar').send({ receita: receitaPrazos() })).status, 403);
});

test('registro de uso: rodar (só 1ª página) e exportar aparecem no Histórico', async () => {
  await sql("DELETE FROM logs_auditoria WHERE acao IN ('rodar', 'exportar')");
  await req(chefe).post('/api/relatorios/executar').send({ receita: receitaPrazos(), pagina: 1, limite: 3 });
  await req(chefe).post('/api/relatorios/executar').send({ receita: receitaPrazos(), pagina: 2, limite: 3 });
  await req(chefe).post('/api/relatorios/exportar').buffer(true).parse(baixarBinario).send({ receita: receitaPrazos() });
  const [salvo] = await sql("SELECT id FROM relatorio_modelo WHERE dono_id = 4 AND nome = 'Prazos da semana'");
  await req(chefe).post('/api/relatorios/executar').send({ modelo_id: salvo.id });

  const logs = await sql("SELECT tabela, acao, registro_id, descricao FROM logs_auditoria WHERE usuario_id = 4 AND acao IN ('rodar','exportar') ORDER BY id");
  assert.deepEqual(logs.map(l => `${l.tabela}:${l.acao}`), ['relatorio:rodar', 'relatorio:exportar', 'relatorio_modelo:rodar']); // a página 2 não conta
  assert.equal(logs[0].descricao, 'Relatório não salvo: Prazos');
  assert.equal(logs[2].descricao, 'Relatório: Prazos da semana');
  const hist = await req(admin).get('/api/configuracoes/usuarios/4/historico');
  assert.ok(hist.body.dados.registros.some(r => r.acao === 'rodar'));
});

test('limites (admin): só administrador; valores inválidos são recusados', async () => {
  assert.equal((await req(usuario).get('/api/relatorios/limites')).status, 403);
  assert.equal((await req(chefe).put('/api/relatorios/limites').send({ padrao: 99 })).status, 403);
  const g = await req(admin).get('/api/relatorios/limites');
  assert.equal(g.status, 200);
  assert.equal(g.body.dados.padrao, 2);
  assert.equal(g.body.dados.usuarios.find(u => u.id === 4).max_relatorios, 4);
  assert.equal((await req(admin).put('/api/relatorios/limites').send({ padrao: -1 })).status, 422);
  assert.equal((await req(admin).put('/api/relatorios/limites').send({ padrao: 'dez' })).status, 422);
  assert.equal((await req(admin).put('/api/relatorios/limites').send({ usuarios: { 4: 9999 } })).status, 422);
  const volta = await req(admin).put('/api/relatorios/limites').send({ usuarios: { 4: null } });
  assert.equal(volta.body.dados.usuarios.find(u => u.id === 4).max_relatorios, null);
});

test('usuário que tem relatórios não pode ser excluído (regra nº 1: nada de órfãos)', async () => {
  const r = await req(admin).delete('/api/configuracoes/usuarios/4');
  assert.equal(r.status, 400);
  assert.match(r.body.mensagem, /relatorio_modelo/);
});
