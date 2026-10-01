// Relatórios (Fase 4) — preferências de exibição (visão e gráfico) por relatório salvo, contra MySQL real.
// Só PREFERÊNCIAS são guardadas — nunca os dados do relatório.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let chefe; let outro; let modeloId;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const prefs = async (t) => (await req(t).get('/api/relatorios/modelos')).body.dados.modelos.find(m => m.id === modeloId).preferencias;
const RECEITA = { assunto: 'prazos', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [{ campo: 'responsavel' }], metricas: [{ funcao: 'contagem' }] };

test.before(async () => {
  await recriarBancoTeste();
  for (const [id, login] of [[4, 'chefe'], [5, 'outro']]) {
    await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
               VALUES (?, ?, ?, 'x', ?, 'advogado', 2, 1, 0, ?, 0, 0)`, [id, `Usuario ${id}`, login, `${login}@example.invalid`, `sessao-${login}`]);
    await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'relatorios', NULL, 'visualizar', 1), (?, 'relatorios', 'criar', 'cadastrar', 1), (?, 'prazos', NULL, 'visualizar', 1)", [id, id, id]);
  }
  app = criarApp();
  chefe = token(4, 2, 'sessao-chefe'); outro = token(5, 2, 'sessao-outro');
  const criado = await req(chefe).post('/api/relatorios/modelos').send({ nome: 'Prazos por responsável', receita: RECEITA });
  assert.equal(criado.status, 201);
  modeloId = criado.body.dados.id;
});
test.after(async () => pool.end());

test('relatório novo começa sem preferências; gravar a visão não apaga o resto', async () => {
  assert.deepEqual(await prefs(chefe), {});
  const a = await req(chefe).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send({ linhas_por_pagina: 25 });
  assert.equal(a.status, 200);
  const b = await req(chefe).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send({ visao: 'grafico' });
  assert.deepEqual(b.body.dados, { linhas_por_pagina: 25, visao: 'grafico' });          // mesclou, não substituiu
  assert.deepEqual(await prefs(chefe), { linhas_por_pagina: 25, visao: 'grafico' });
});

test('gráfico: mudar só o tipo mantém o total escolhido; cada campo é validado', async () => {
  await req(chefe).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send({ grafico: { tipo: 'colunas', metrica: 'm2', empilhado: false } });
  const r = await req(chefe).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send({ grafico: { tipo: 'linhas' } });
  assert.deepEqual(r.body.dados.grafico, { tipo: 'linhas', metrica: 'm2', empilhado: false });
  for (const ruim of [{ grafico: { tipo: 'radar' } }, { grafico: { metrica: 'm7' } }, { grafico: { metrica: 'abc' } }, { grafico: { empilhado: 1 } },
    { visao: 'pizza' }, { linhas_por_pagina: 7 }, { qualquer: 'coisa' }, {}, { visao: 'tabela', extra: 1 }]) {
    assert.equal((await req(chefe).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send(ruim)).status, 422, JSON.stringify(ruim));
  }
  assert.deepEqual((await prefs(chefe)).grafico, { tipo: 'linhas', metrica: 'm2', empilhado: false });   // recusas não mudaram nada
});

test('preferência é de cada usuário e só do relatório que ele enxerga', async () => {
  assert.equal((await req(outro).put(`/api/relatorios/modelos/${modeloId}/preferencias`).send({ visao: 'cruzada' })).status, 404);
  assert.equal((await req(outro).put('/api/relatorios/modelos/999999/preferencias').send({ visao: 'cruzada' })).status, 404);
  assert.equal((await prefs(chefe)).visao, 'grafico');
});

test('só preferências ficam guardadas: a receita e o banco não ganham dados do relatório', async () => {
  await req(chefe).post('/api/relatorios/executar').send({ modelo_id: modeloId });
  const [m] = await sql('SELECT definicao FROM relatorio_modelo WHERE id = ?', [modeloId]);
  const def = typeof m.definicao === 'string' ? JSON.parse(m.definicao) : m.definicao;
  assert.deepEqual(Object.keys(def).sort(), ['agrupar', 'assunto', 'colunas', 'filtros', 'metricas', 'ordem', 'ordemGrupo', 'versao']);
  const [v] = await sql('SELECT preferencias FROM relatorio_modelo_usuario WHERE modelo_id = ? AND usuario_id = 4', [modeloId]);
  const p = typeof v.preferencias === 'string' ? JSON.parse(v.preferencias) : v.preferencias;
  assert.deepEqual(Object.keys(p).sort(), ['grafico', 'linhas_por_pagina', 'visao']);
});
