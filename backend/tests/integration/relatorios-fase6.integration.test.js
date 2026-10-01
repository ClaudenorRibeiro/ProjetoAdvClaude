// Relatórios (Fase 6) — relatórios do sistema, compartilhamento com colegas, permissões e menu de ações,
// contra MySQL real. Todos os relatórios padrão são RODADOS de verdade (confere o SQL de cada um no banco).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin; let usuario; let colegaA; let colegaB; let colegaC; let colegaD; let semPermissao;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
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
const lista = async (t) => (await req(t).get('/api/relatorios/modelos')).body.dados;
const nomes = (d) => d.modelos.map(m => m.nome).sort();
const RECEITA = { assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [] };
const criarPessoal = async (t, nome, extra = {}) => (await req(t).post('/api/relatorios/modelos').send({ nome, receita: RECEITA, ...extra }));

async function criarUsuario(id, nome, ativo, permissoes) {
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (?, ?, ?, 'x', ?, 'advogado', 2, ?, 0, ?, 0, 0)`, [id, nome, `u${id}`, `u${id}@example.invalid`, ativo, `sessao-${id}`]);
  for (const [modulo, acao] of permissoes) await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, NULL, ?, 1)", [id, modulo, acao]);
}

test.before(async () => {
  await recriarBancoTeste();
  await criarUsuario(4, 'Colega A', 1, [['relatorios', 'visualizar'], ['relatorios', 'cadastrar'], ['prazos', 'visualizar']]);
  await criarUsuario(5, 'Colega B (sem Prazos)', 1, [['relatorios', 'visualizar']]);
  await criarUsuario(6, 'Colega C (inativo)', 0, [['relatorios', 'visualizar'], ['prazos', 'visualizar']]);
  await criarUsuario(7, 'Colega D (sem Relatórios)', 1, [['prazos', 'visualizar']]);
  // pessoas: P1 e P2 clientes (P1 faz aniversário hoje e já foi parabenizada neste ano; P2 daqui a 3 dias); P3 faz hoje, mas não é cliente
  await sql(`INSERT INTO pessoas_fisicas (id, nome, data_nascimento, ativo) VALUES
    (1, 'Cliente Hoje', DATE_SUB(CURDATE(), INTERVAL 30 YEAR), 1), (2, 'Cliente Em Breve', DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 3 DAY), INTERVAL 40 YEAR), 1),
    (3, 'Nao Cliente Hoje', DATE_SUB(CURDATE(), INTERVAL 20 YEAR), 1)`);
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', 1), (1, 'fisica', 2)");
  await sql("INSERT INTO parabens_enviados (pessoa_id, ano, canal, usuario_id) VALUES (1, YEAR(CURDATE()), 'email', 1)");
  await sql("INSERT INTO telefones_pf (pessoa_id, numero, principal, ativo) VALUES (1, '11-5555', 1, 1)");
  await sql("INSERT INTO emails_pf (pessoa_id, email, principal, ativo) VALUES (1, 'cliente@example.invalid', 1, 1)");
  await sql("INSERT INTO pericia (processo_id, data, status, perito_tipo, perito_id, criado_por) VALUES (1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'agendada', 'fisica', 3, 1)");
  await sql("INSERT INTO telefones_pf (pessoa_id, numero, principal, ativo) VALUES (3, '19-0000', 1, 1)");
  // permissão de CRIAR relatórios (submódulo "relatorios.criar"): usuário 2 e Colega A podem; os demais só visualizam
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (2, 'relatorios', 'criar', 'cadastrar', 1), (4, 'relatorios', 'criar', 'cadastrar', 1)");
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); semPermissao = token(3, 2, 'sessao-sem-permissao');
  colegaA = token(4, 2, 'sessao-4'); colegaB = token(5, 2, 'sessao-5'); colegaC = token(6, 2, 'sessao-6'); colegaD = token(7, 2, 'sessao-7');
});
test.after(async () => pool.end());

test('instalar os relatórios padrão: só administrador; cria 10; repetir não duplica', async () => {
  assert.equal((await req(usuario).post('/api/relatorios/sistema/padrao').send({})).status, 403);
  const a = await req(admin).post('/api/relatorios/sistema/padrao').send({});
  assert.equal(a.status, 200);
  assert.equal(a.body.dados.criados.length, 10, JSON.stringify(a.body.dados.falhas));
  assert.deepEqual(a.body.dados.falhas, []);
  const b = await req(admin).post('/api/relatorios/sistema/padrao').send({});
  assert.deepEqual([b.body.dados.criados.length, b.body.dados.jaExistiam.length], [0, 10]);
  assert.equal((await sql("SELECT COUNT(*) n FROM relatorio_modelo WHERE escopo = 'sistema'"))[0].n, 10);
});

test('cada relatório padrão RODA no banco (SQL válido) e os de pergunta aceitam resposta', async () => {
  const sistema = (await lista(admin)).modelos.filter(m => m.origem === 'sistema');
  assert.equal(sistema.length, 10);
  for (const m of sistema) {
    const sem = await req(admin).post('/api/relatorios/executar').send({ modelo_id: m.id });
    if (m.nome === 'Aniversariantes do mês') { assert.equal(sem.status, 422, 'sem a resposta do mês deve recusar'); continue; }
    assert.equal(sem.status, 200, `${m.nome}: ${JSON.stringify(sem.body).slice(0, 200)}`);
  }
  const mes = sistema.find(m => m.nome === 'Aniversariantes do mês');
  const mesAtual = (await sql('SELECT MONTH(CURDATE()) m'))[0].m;
  const r = await req(admin).post('/api/relatorios/executar').send({ modelo_id: mes.id, parametros: [{ caminho: [1], valor: [String(mesAtual)] }] });
  assert.equal(r.status, 200);
  assert.ok(r.body.dados.linhas.some(l => l.nome === 'Cliente Hoje'));
});

test('aniversariantes: só clientes, idade que completa e "já parabenizado" batem com a regra da tela antiga', async () => {
  const sistema = (await lista(admin)).modelos.filter(m => m.origem === 'sistema');
  const rodar = async (nome) => (await req(admin).post('/api/relatorios/executar').send({ modelo_id: sistema.find(m => m.nome === nome).id })).body.dados;
  const hoje = await rodar('Aniversariantes de hoje');
  assert.deepEqual(hoje.linhas.map(l => l.nome), ['Cliente Hoje']);                  // a não-cliente não entra
  assert.equal(hoje.linhas[0].idade_completa, 30);
  assert.equal(hoje.linhas[0].parabenizado, true);
  assert.equal(hoje.linhas[0].telefone, '11-5555');
  const semana = await rodar('Aniversariantes da semana');
  assert.deepEqual(semana.linhas.map(l => [l.nome, l.idade_completa, l.parabenizado]), [['Cliente Hoje', 30, true], ['Cliente Em Breve', 40, false]]);
  const antiga = await req(admin).get('/api/pessoas/aniversariantes?filtro=semana');
  assert.deepEqual(antiga.body.dados.registros.map(r => r.nome).sort(), ['Cliente Em Breve', 'Cliente Hoje']);   // mesma lista da tela antiga
  const periciasPorPerito = await rodar('Perícias por perito');
  assert.equal(periciasPorPerito.linhas[0].perito, 'Nao Cliente Hoje');
  assert.equal(periciasPorPerito.linhas[0].perito_telefone, '19-0000');
});

test('lista por usuário: cada um vê os do sistema só dos assuntos que pode usar', async () => {
  const completo = await lista(usuario);                                      // usuário 2 tem todos os módulos
  assert.equal(completo.modelos.filter(m => m.origem === 'sistema').length, 10);
  const soPrazos = await lista(colegaA);                                      // só Relatórios + Prazos
  assert.deepEqual(nomes(soPrazos), ['Prazos do período']);
  assert.equal((await lista(colegaB)).modelos.length, 0);
  assert.equal((await req(semPermissao).get('/api/relatorios/modelos')).status, 403);
});

test('relatório do sistema: só administrador cria/altera/exclui; todos podem abrir, duplicar e guardar preferências', async () => {
  const prazos = (await lista(usuario)).modelos.find(m => m.nome === 'Prazos do período');
  assert.equal((await criarPessoal(usuario, 'Tentativa', { escopo: 'sistema' })).status, 403);
  assert.equal((await req(usuario).put(`/api/relatorios/modelos/${prazos.id}`).send({ nome: 'Renomeado' })).status, 403);
  assert.equal((await req(usuario).delete(`/api/relatorios/modelos/${prazos.id}`)).status, 403);
  assert.equal((await req(usuario).put(`/api/relatorios/modelos/${prazos.id}/compartilhamento`).send({ usuarios: [4] })).status, 422);   // já é de todos
  assert.equal((await req(admin).post('/api/relatorios/modelos').send({ nome: 'Prazos do período', receita: RECEITA, escopo: 'sistema' })).status, 409);   // nome repetido
  const novo = await req(admin).post('/api/relatorios/modelos').send({ nome: 'Relatório do escritório', receita: RECEITA, escopo: 'sistema' });
  assert.equal(novo.status, 201);
  assert.equal(novo.body.dados.origem, 'sistema');
  assert.equal((await req(admin).put(`/api/relatorios/modelos/${novo.body.dados.id}`).send({ nome: 'Prazos do período' })).status, 409);
  assert.equal((await req(admin).put(`/api/relatorios/modelos/${novo.body.dados.id}`).send({ descricao: 'atualizado' })).status, 200);
  // preferências: cada usuário guarda as suas, sem mexer nas dos outros
  assert.equal((await req(usuario).put(`/api/relatorios/modelos/${prazos.id}/preferencias`).send({ visao: 'grafico' })).status, 200);
  assert.equal((await req(colegaA).put(`/api/relatorios/modelos/${prazos.id}/preferencias`).send({ linhas_por_pagina: 25 })).status, 200);
  assert.deepEqual((await lista(usuario)).modelos.find(m => m.id === prazos.id).preferencias, { visao: 'grafico' });
  assert.deepEqual((await lista(colegaA)).modelos.find(m => m.id === prazos.id).preferencias, { linhas_por_pagina: 25 });
  // duplicar vira pessoal (entra no limite de quem duplica)
  const copia = await req(colegaA).post(`/api/relatorios/modelos/${prazos.id}/duplicar`).send({});
  assert.equal(copia.status, 201);
  assert.equal(copia.body.dados.origem, 'proprio');
  assert.equal((await req(colegaA).put(`/api/relatorios/modelos/${copia.body.dados.id}`).send({ nome: 'Minha cópia' })).status, 200);
  assert.equal((await lista(colegaA)).criados, 1);                                         // os do sistema não contam no limite
  assert.equal((await req(admin).delete(`/api/relatorios/modelos/${novo.body.dados.id}`)).status, 200);
});

test('compartilhar: só com colega ATIVO que tem acesso a Relatórios e ao assunto; só o dono; revogar tira o acesso', async () => {
  const c = await criarPessoal(usuario, 'Prazos do Usuário');
  assert.equal(c.status, 201);
  const id = c.body.dados.id;
  const cons = (await req(usuario).get(`/api/relatorios/modelos/${id}/compartilhamento`)).body.dados;
  const porNome = Object.fromEntries(cons.candidatos.map(x => [x.nome, x]));
  assert.equal(porNome['Colega A'].pode, true);
  assert.match(porNome['Colega B (sem Prazos)'].motivo, /Prazos/);
  assert.match(porNome['Colega D (sem Relatórios)'].motivo, /Relatórios/);
  assert.ok(!porNome['Colega C (inativo)'], 'inativo nem aparece');
  assert.ok(!cons.candidatos.some(x => x.id === 2), 'eu mesmo não apareço');
  assert.equal(porNome['Administrador de Testes'].pode, true);

  const env = (usuarios) => req(usuario).put(`/api/relatorios/modelos/${id}/compartilhamento`).send({ usuarios });
  for (const ruim of [[5], [6], [7], [2], [999], ['x'], 'texto', [4, 5]]) assert.equal((await env(ruim)).status, 422, JSON.stringify(ruim));
  assert.equal((await env([4, 4])).status, 200);                                            // repetido vira um só
  assert.deepEqual((await req(usuario).get(`/api/relatorios/modelos/${id}/compartilhamento`)).body.dados.compartilhados.map(x => x.nome), ['Colega A']);

  const recebido = (await lista(colegaA)).modelos.find(m => m.id === id);
  assert.deepEqual([recebido.origem, recebido.dono_nome, recebido.sem_acesso], ['compartilhado', 'Usuário de Testes', false]);
  assert.equal((await lista(colegaA)).criados, 1);                                           // compartilhado NÃO conta no limite de quem recebe
  assert.equal((await lista(usuario)).modelos.find(m => m.id === id).compartilhado_com, 1);
  assert.equal((await req(colegaA).post('/api/relatorios/executar').send({ modelo_id: id })).status, 200);   // abre e roda
  assert.equal((await req(colegaA).post('/api/relatorios/exportar').buffer(true).parse((r, cb) => { const p = []; r.on('data', x => p.push(x)); r.on('end', () => cb(null, Buffer.concat(p))); }).send({ modelo_id: id })).status, 200);
  assert.equal((await req(colegaA).put(`/api/relatorios/modelos/${id}`).send({ nome: 'X' })).status, 403);   // não altera
  assert.equal((await req(colegaA).delete(`/api/relatorios/modelos/${id}`)).status, 403);                  // não exclui o do dono
  assert.equal((await req(colegaA).put(`/api/relatorios/modelos/${id}/compartilhamento`).send({ usuarios: [5] })).status, 403);   // não repassa
  assert.equal((await req(colegaB).get(`/api/relatorios/modelos/${id}/compartilhamento`)).status, 403);    // sem a permissão de criar relatórios
  assert.equal((await req(admin).get(`/api/relatorios/modelos/${id}/compartilhamento`)).status, 404);      // nem o administrador enxerga o pessoal de outro
  assert.equal((await req(admin).post('/api/relatorios/executar').send({ modelo_id: id })).status, 404);
  assert.equal((await req(colegaA).post(`/api/relatorios/modelos/${id}/duplicar`).send({})).status, 201);  // pode copiar para si

  // perdeu a permissão do assunto depois: aparece marcado e o motor recusa na hora de abrir
  await sql("DELETE FROM permissoes WHERE usuario_id = 4 AND modulo = 'prazos'");
  assert.equal((await lista(colegaA)).modelos.find(m => m.id === id).sem_acesso, true);
  assert.equal((await req(colegaA).post('/api/relatorios/executar').send({ modelo_id: id })).status, 403);
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (4, 'prazos', NULL, 'visualizar', 1)");

  // o colega tira da própria lista; o dono continua com o relatório e pode compartilhar de novo
  assert.equal((await req(colegaA).delete(`/api/relatorios/modelos/${id}/compartilhado-comigo`)).status, 200);
  assert.equal((await req(colegaA).delete(`/api/relatorios/modelos/${id}/compartilhado-comigo`)).status, 404);
  assert.equal((await req(colegaA).post('/api/relatorios/executar').send({ modelo_id: id })).status, 404);
  assert.equal((await lista(usuario)).modelos.find(m => m.id === id).compartilhado_com, 0);
  await env([4]);
  assert.equal((await env([])).status, 200);                                                 // dono revoga
  assert.equal((await req(colegaA).post('/api/relatorios/executar').send({ modelo_id: id })).status, 404);
  const logs = await sql("SELECT acao FROM logs_auditoria WHERE tabela = 'relatorio_modelo' AND acao IN ('compartilhar', 'descompartilhar') ORDER BY id");
  assert.deepEqual(logs.map(l => l.acao), ['compartilhar', 'descompartilhar', 'compartilhar', 'compartilhar']);
});

test('menu de ações: "parabenizar" só para quem pode alterar Pessoas; linhas trazem o identificador; dados da pessoa para a mensagem', async () => {
  const rec = { assunto: 'pessoas_fisicas', colunas: ['nome'], filtros: { op: 'E', itens: [] }, ordem: [{ campo: 'nome', direcao: 'asc' }] };
  const comAcao = await req(usuario).post('/api/relatorios/executar').send({ receita: rec });          // usuário 2 tem pessoas.alterar
  assert.deepEqual(comAcao.body.dados.acoes, ['parabenizar']);
  assert.deepEqual(comAcao.body.dados.linhas.map(l => l.__id), [2, 1, 3]);   // na ordem do nome: Em Breve, Hoje, Nao Cliente
  await sql("INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo) VALUES (8, 'So Ve', 'sove', 'x', 'sove@example.invalid', 'advogado', 2, 1, 0, 'sessao-8', 0, 0)");
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (8, 'relatorios', NULL, 'visualizar', 1), (8, 'pessoas', NULL, 'visualizar', 1)");
  const soVe = token(8, 2, 'sessao-8');
  assert.deepEqual((await req(soVe).post('/api/relatorios/executar').send({ receita: rec })).body.dados.acoes, []);
  assert.equal((await req(soVe).get('/api/pessoas/1/parabens')).status, 403);

  const info = await req(usuario).get('/api/pessoas/1/parabens');
  assert.equal(info.status, 200);
  assert.deepEqual([info.body.dados.nome, info.body.dados.telefone, info.body.dados.email, info.body.dados.ja_parabenizado], ['Cliente Hoje', '11-5555', 'cliente@example.invalid', true]);
  assert.match(info.body.dados.mensagem, /Cliente|Olá/);
  assert.equal((await req(usuario).get('/api/pessoas/3/parabens')).status, 404);                       // não é cliente
  assert.equal((await req(usuario).get('/api/pessoas/999/parabens')).status, 404);
});
