// Plano de testes de Processos — passo C5 (ver PLANO-TESTES-PROCESSOS.md): o servidor das TAREFAS usadas na aba Tarefas da pasta.
// Contra MySQL real isolado: listar (filtros, limite, quem vê todas), criar, editar, concluir (gera andamento), reabrir (desfaz),
// excluir, histórico, entradas inválidas, permissões e auditoria.
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
const emitir = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = (token = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${token}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${token}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${token}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${token}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const auditoria = (id, acao) => sql("SELECT * FROM logs_auditoria WHERE tabela = 'tarefas' AND registro_id = ? AND acao = ?", [id, acao]);

let seq = 100;
async function criarUsuario(rotulo, nivel, permissoes) {
  seq += 1;
  const id = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0)`,
    [`Usuário ${rotulo}`, `u${seq}`, `u${seq}@example.invalid`, nivel, `sessao-${seq}`])).insertId;
  for (const [m, s, a] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return { id, token: emitir(id, nivel, `sessao-${seq}`) };
}

function juntar() {
  const falhas = [];
  return { checar: (ok, texto) => { if (!ok) falhas.push(texto); }, fim: () => assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`) };
}
const hojeSp = () => { const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`; };
const dia = (n) => { const d = new Date(`${hojeSp()}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const tarefa = (id) => um("SELECT *, DATE_FORMAT(data_vencimento, '%Y-%m-%d') AS venc FROM tarefas WHERE id = ?", [id]);
async function nova(extra = {}, token = admin) {
  const r = await api(token).post('/api/tarefas').send({ titulo: 'Tarefa de teste', processo_id: F.proc, data_vencimento: dia(3), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6101, 1)')).insertId;
  const proc = async (num, ativo = 1) => (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'PROCESSO DE TAREFAS', 1, 1, ?, 1)", [pasta, num, ativo])).insertId;
  F.proc = await proc('0000011-00.2026.5.15.0001');
  F.outro = await proc('0000012-00.2026.5.15.0001');
  F.inativo = await proc('0000013-00.2026.5.15.0001', 0);
});
test.after(async () => pool.end());

test('criar: grava tudo, tira espaços do título, vencimento padrão = hoje (Brasília), prioridade padrão normal, criador e auditoria', async () => {
  const r = await api().post('/api/tarefas').send({ titulo: '  Preparar contestação  ', descricao: 'Detalhe', processo_id: F.proc, data_vencimento: '2099-05-04', prioridade: 'urgente' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const t = await tarefa(r.body.dados.id);
  assert.deepEqual({ titulo: t.titulo, desc: t.descricao, proc: t.processo_id, venc: t.venc, prio: t.prioridade, por: t.criado_por, conc: t.concluida },
    { titulo: 'Preparar contestação', desc: 'Detalhe', proc: F.proc, venc: '2099-05-04', prio: 'urgente', por: 1, conc: 0 });
  assert.equal((await auditoria(t.id, 'criar')).length, 1);
  const semData = await nova({ data_vencimento: undefined, prioridade: undefined });
  const s = await tarefa(semData);
  assert.equal(s.venc, hojeSp());
  assert.equal(s.prioridade, 'normal');
});

test('criar: título obrigatório e de verdade (vazio, espaços, número, lista, objeto) — nada gravado e nunca erro interno', async () => {
  const t = juntar();
  const antes = await total('SELECT COUNT(*) AS n FROM tarefas');
  for (const titulo of [undefined, null, '', '   ', '\n\t', 123, true, ['a'], { a: 1 }]) {
    const r = await api().post('/api/tarefas').send({ titulo, processo_id: F.proc });
    t.checar(r.status === 400, `título=${JSON.stringify(titulo)} → ${r.status} ${JSON.stringify(r.body)} (esperado 400)`);
  }
  t.checar(await total('SELECT COUNT(*) AS n FROM tarefas') === antes, 'alguma tarefa inválida foi gravada');
  t.fim();
});

test('criar: título muito longo (mais de 300), descrição que não é texto e prioridade inventada são recusados com mensagem clara (400), nunca erro interno', async () => {
  const t = juntar();
  const casos = [
    ['título com 301 letras', { titulo: 'a'.repeat(301) }],
    ['descrição numérica', { descricao: 12345 }],
    ['descrição lista', { descricao: ['x'] }],
    ['prioridade inventada', { prioridade: 'super' }],
    ['prioridade número', { prioridade: 5 }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().post('/api/tarefas').send({ titulo: 'Ok', processo_id: F.proc, ...extra });
    t.checar(r.status === 400, `${rotulo} → ${r.status} ${JSON.stringify(r.body)} (esperado 400)`);
  }
  t.fim();
});

test('criar: data de vencimento impossível/mal escrita e vínculos inexistentes/inválidos são recusados (400/404/409), nunca erro interno nem gravação', async () => {
  const t = juntar();
  const antes = await total('SELECT COUNT(*) AS n FROM tarefas');
  const casos = [
    ['data 2026-02-30', { data_vencimento: '2026-02-30' }],
    ['data texto', { data_vencimento: 'amanhã' }],
    ['data número', { data_vencimento: 20260301 }],
    ['processo inexistente', { processo_id: 999999 }],
    ['processo texto', { processo_id: 'abc' }],
    ['processo negativo', { processo_id: -1 }],
    ['processo inativo (excluído)', { processo_id: F.inativo }],
    ['responsável inexistente', { atribuida_para: 999999 }],
    ['responsável texto', { atribuida_para: 'abc' }],
    ['prazo inexistente', { prazo_id: 999999 }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().post('/api/tarefas').send({ titulo: 'Ok', processo_id: F.proc, data_vencimento: dia(2), ...extra });
    t.checar([400, 404, 409].includes(r.status), `${rotulo} → ${r.status} ${JSON.stringify(r.body)} (esperado 400/404/409)`);
  }
  t.checar(await total('SELECT COUNT(*) AS n FROM tarefas') === antes, 'alguma tarefa com dados inválidos foi gravada');
  t.fim();
});

test('criar: usuário comum não agenda no passado (400); admin pode; avisar-conclusão só vale com responsável', async () => {
  const comum = await criarUsuario('comum', 3, [['tarefas', null, 'visualizar'], ['tarefas', null, 'cadastrar'], ['tarefas', null, 'alterar']]);
  const r = await api(comum.token).post('/api/tarefas').send({ titulo: 'Passado', processo_id: F.proc, data_vencimento: dia(-1) });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(msg(r), /administrador/i);
  const ok = await api().post('/api/tarefas').send({ titulo: 'Passado admin', processo_id: F.proc, data_vencimento: dia(-1) });
  assert.equal(ok.status, 201);
  const ed = await nova({ data_vencimento: dia(2) }, comum.token);
  const bloq = await api(comum.token).put(`/api/tarefas/${ed}`).send({ titulo: 'Passado', processo_id: F.proc, data_vencimento: dia(-1) });
  assert.equal(bloq.status, 400, JSON.stringify(bloq.body));
  const sem = await nova({ notificar_conclusao: true });
  assert.equal((await tarefa(sem)).notificar_conclusao, 1, 'documentando: criar grava notificar_conclusao mesmo sem responsável');
});

test('editar: altera os campos, mantém o vínculo, registra auditoria; tarefa inexistente = 404; título vazio/inválido = 400; id não numérico = 400/404', async () => {
  const t = juntar();
  const id = await nova({ titulo: 'Original' });
  const r = await api().put(`/api/tarefas/${id}`).send({ titulo: ' Novo título ', descricao: 'D', prioridade: 'baixa', data_vencimento: dia(9), processo_id: F.outro, atribuida_para: 1 });
  t.checar(r.status === 200, `editar → ${r.status} ${JSON.stringify(r.body)}`);
  const x = await tarefa(id);
  t.checar(x.titulo === 'Novo título' && x.descricao === 'D' && x.prioridade === 'baixa' && x.venc === dia(9) && x.processo_id === F.outro && x.atribuida_para === 1, `campos não ficaram como enviados: ${JSON.stringify(x)}`);
  t.checar((await auditoria(id, 'alterar')).length === 1, 'sem auditoria de alteração');
  const fantasma = await api().put('/api/tarefas/999999').send({ titulo: 'X', data_vencimento: dia(1) });
  t.checar(fantasma.status === 404, `editar tarefa inexistente → ${fantasma.status} ${JSON.stringify(fantasma.body)} (esperado 404)`);
  for (const titulo of [undefined, '', '   ', 5, ['a'], 'a'.repeat(301)]) {
    const e = await api().put(`/api/tarefas/${id}`).send({ titulo, data_vencimento: dia(1) });
    t.checar(e.status === 400, `editar com título=${JSON.stringify(titulo)?.slice(0, 20)} → ${e.status} (esperado 400)`);
  }
  const txt = await api().put('/api/tarefas/abc').send({ titulo: 'X', data_vencimento: dia(1) });
  t.checar([400, 404].includes(txt.status), `editar id "abc" → ${txt.status} (esperado 400/404)`);
  t.checar((await tarefa(id)).titulo === 'Novo título', 'edição inválida alterou a tarefa');
  t.fim();
});

test('concluir: marca, registra quem/quando, lança o andamento "Tarefa concluída: …" no processo e guarda o vínculo; reabrir desfaz tudo', async () => {
  const t = juntar();
  const id = await nova({ titulo: 'Protocolar recurso' });
  const c = await api().put(`/api/tarefas/${id}/concluir`).send();
  t.checar(c.status === 200, `concluir → ${c.status} ${JSON.stringify(c.body)}`);
  const x = await tarefa(id);
  t.checar(x.concluida === 1 && x.concluida_por === 1 && !!x.concluida_em && !!x.andamento_id, `estado após concluir: ${JSON.stringify(x)}`);
  const a = await um('SELECT * FROM andamento_processual WHERE id = ?', [x.andamento_id]);
  t.checar(a && a.descricao === 'Tarefa concluída: Protocolar recurso' && a.processo_id === F.proc && a.fonte === 'manual', `andamento gerado: ${JSON.stringify(a)}`);
  t.checar((await auditoria(id, 'concluir')).length === 1, 'sem auditoria de concluir');
  const rb = await api().put(`/api/tarefas/${id}/reabrir`).send();
  t.checar(rb.status === 200, `reabrir → ${rb.status}`);
  const y = await tarefa(id);
  t.checar(y.concluida === 0 && y.concluida_por === null && y.concluida_em === null && y.andamento_id === null, `estado após reabrir: ${JSON.stringify(y)}`);
  t.checar(await total('SELECT COUNT(*) AS n FROM andamento_processual WHERE id = ?', [x.andamento_id]) === 0, 'o andamento não foi apagado ao reabrir');
  t.checar((await auditoria(id, 'reabrir')).length === 1, 'sem auditoria de reabrir');
  t.fim();
});

test('concluir duas vezes (duas telas abertas): não pode duplicar o andamento nem deixar andamento solto', async () => {
  const t = juntar();
  const id = await nova({ titulo: 'Dupla conclusão' });
  await api().put(`/api/tarefas/${id}/concluir`).send();
  const segunda = await api().put(`/api/tarefas/${id}/concluir`).send();
  const n = await total("SELECT COUNT(*) AS n FROM andamento_processual WHERE descricao = 'Tarefa concluída: Dupla conclusão'");
  t.checar(n === 1, `andamentos "Tarefa concluída: Dupla conclusão" = ${n} (esperado 1); segunda chamada respondeu ${segunda.status}`);
  await api().put(`/api/tarefas/${id}/reabrir`).send();
  const sobra = await total("SELECT COUNT(*) AS n FROM andamento_processual WHERE descricao = 'Tarefa concluída: Dupla conclusão'");
  t.checar(sobra === 0, `depois de reabrir sobraram ${sobra} andamento(s) solto(s)`);
  t.fim();
});

test('ids inválidos nas ações (concluir, reabrir, excluir, histórico): inexistente = 404, nunca erro interno', async () => {
  const t = juntar();
  for (const [metodo, rota] of [['put', 'concluir'], ['put', 'reabrir'], ['delete', ''], ['get', 'historico']]) {
    for (const id of ['999999', 'abc', '-1']) {
      const r = await api()[metodo](`/api/tarefas/${id}${rota ? '/' + rota : ''}`).send();
      t.checar([400, 404].includes(r.status), `${metodo.toUpperCase()} ${id}/${rota} → ${r.status} (esperado 400/404)`);
    }
  }
  t.fim();
});

test('excluir: apaga a tarefa e registra auditoria; a ata que apontava para ela fica sem referência', async () => {
  const id = await nova({ titulo: 'Para excluir' });
  const r = await api().delete(`/api/tarefas/${id}`).send();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await total('SELECT COUNT(*) AS n FROM tarefas WHERE id = ?', [id]), 0);
  assert.equal((await auditoria(id, 'excluir')).length, 1);
  const de = await api().delete(`/api/tarefas/${id}`).send();
  assert.equal(de.status, 404);
});

test('histórico: cadastrada → concluída → reaberta → editada, com o nome de quem fez, em ordem', async () => {
  const id = await nova({ titulo: 'Com histórico' });
  await api().put(`/api/tarefas/${id}/concluir`).send();
  await api().put(`/api/tarefas/${id}/reabrir`).send();
  await api().put(`/api/tarefas/${id}`).send({ titulo: 'Com histórico', processo_id: F.proc, data_vencimento: dia(4) });
  const r = await api().get(`/api/tarefas/${id}/historico`);
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.tarefa_titulo, 'Com histórico');
  assert.deepEqual(r.body.dados.eventos.map(e => e.descricao), ['Tarefa cadastrada', 'Tarefa concluída', 'Tarefa reaberta', 'Tarefa editada']);
  assert.ok(r.body.dados.eventos.every(e => e.usuario && e.usuario !== '—'));
});

test('listar: filtros (pendentes/concluídas/todas/atrasadas, prioridade, datas, processo, busca) e total', async () => {
  const t = juntar();
  await sql("DELETE FROM tarefas");
  const a = await nova({ titulo: 'Alfa pendente', prioridade: 'urgente', data_vencimento: dia(5) });
  const b = await nova({ titulo: 'Beta concluida', prioridade: 'baixa', data_vencimento: dia(6) });
  const c = await nova({ titulo: 'Gama atrasada', prioridade: 'normal', data_vencimento: dia(-3) });
  const d = await nova({ titulo: 'Delta outro processo', processo_id: F.outro, data_vencimento: dia(7) });
  await api().put(`/api/tarefas/${b}/concluir`).send();
  const ids = async (q) => { const r = await api().get(`/api/tarefas?${q}`); return r.body.dados.registros.map(x => x.id).sort((m, n) => m - n); };
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const so = (...v) => v.sort((m, n) => m - n);
  t.checar(eq(await ids(`processo_id=${F.proc}&concluida=0`), so(a, c)), 'pendentes do processo');
  t.checar(eq(await ids(`processo_id=${F.proc}&concluida=1`), so(b)), 'concluídas do processo');
  t.checar(eq(await ids(`processo_id=${F.proc}&concluida=`), so(a, b, c)), 'todas do processo');
  t.checar(eq(await ids(`processo_id=${F.proc}&atrasadas=1`), so(c)), 'atrasadas do processo');
  t.checar(eq(await ids(`processo_id=${F.proc}&prioridade=urgente&concluida=`), so(a)), 'prioridade urgente');
  t.checar(eq(await ids(`processo_id=${F.proc}&concluida=&data_de=${dia(5)}&data_ate=${dia(5)}`), so(a)), 'intervalo de datas (um dia)');
  t.checar(eq(await ids(`processo_id=${F.outro}&concluida=`), so(d)), 'outro processo');
  t.checar(eq(await ids('concluida=&busca=Alfa'), so(a)), 'busca por título');
  const r = await api().get(`/api/tarefas?processo_id=${F.proc}&concluida=`);
  t.checar(r.body.dados.total === 3, `total = ${r.body.dados.total} (esperado 3)`);
  t.fim();
});

test('listar: limite de 100 por página — a tela precisa conseguir buscar mais de 100 tarefas de um processo (total e paginação corretos)', async () => {
  const t = juntar();
  await sql('DELETE FROM tarefas');
  const valores = Array.from({ length: 130 }, (_, i) => `('Em massa ${i}', 'normal', ${F.proc}, '${dia(10)}', 1)`).join(',');
  await sql(`INSERT INTO tarefas (titulo, prioridade, processo_id, data_vencimento, criado_por) VALUES ${valores}`);
  const p1 = await api().get(`/api/tarefas?processo_id=${F.proc}&concluida=0&limite=500`);
  t.checar(p1.body.dados.registros.length === 100 && p1.body.dados.total === 130, `pág.1 = ${p1.body.dados.registros.length} de ${p1.body.dados.total}`);
  const p2 = await api().get(`/api/tarefas?processo_id=${F.proc}&concluida=0&limite=100&pagina=2`);
  t.checar(p2.body.dados.registros.length === 30, `pág.2 = ${p2.body.dados.registros.length} (esperado 30)`);
  const lixo = await api().get(`/api/tarefas?processo_id=${F.proc}&pagina=abc&limite=xyz`);
  t.checar(lixo.status === 200, `pagina/limite lixo → ${lixo.status}`);
  const neg = await api().get(`/api/tarefas?processo_id=${F.proc}&pagina=-5`);
  t.checar(neg.status === 200, `pagina negativa → ${neg.status}`);
  await sql('DELETE FROM tarefas');
  t.fim();
});

test('quem vê o quê: sem "ver todas" só as próprias e as do escritório; com a permissão vê todas e pode filtrar por pessoa; ações em tarefa de outra pessoa = 403', async () => {
  const t = juntar();
  await sql('DELETE FROM tarefas');
  const basico = [['tarefas', null, 'visualizar'], ['tarefas', null, 'cadastrar'], ['tarefas', null, 'alterar'], ['tarefas', null, 'excluir'], ['tarefas', null, 'historico']];
  const ana = await criarUsuario('ana', 3, basico);
  const bia = await criarUsuario('bia', 3, basico);
  const chefe = await criarUsuario('chefe', 3, [...basico, ['tarefas', 'ver_todos', 'visualizar']]);
  const daAna = await nova({ titulo: 'Da Ana', atribuida_para: ana.id });
  const daBia = await nova({ titulo: 'Da Bia', atribuida_para: bia.id });
  const esc = await nova({ titulo: 'Do escritório' });
  const titulos = async (tk, q = '') => (await api(tk).get(`/api/tarefas?processo_id=${F.proc}&concluida=${q}`)).body.dados.registros.map(x => x.titulo).sort();
  t.checar(JSON.stringify(await titulos(ana.token)) === JSON.stringify(['Da Ana', 'Do escritório']), `Ana viu ${JSON.stringify(await titulos(ana.token))}`);
  t.checar(JSON.stringify(await titulos(chefe.token)) === JSON.stringify(['Da Ana', 'Da Bia', 'Do escritório']), `Chefe viu ${JSON.stringify(await titulos(chefe.token))}`);
  const burla = (await api(ana.token).get(`/api/tarefas?processo_id=${F.proc}&concluida=&usuario_id=${bia.id}`)).body.dados.registros.map(x => x.titulo).sort();
  t.checar(JSON.stringify(burla) === JSON.stringify(['Da Ana', 'Do escritório']), `Ana pedindo a Bia viu ${JSON.stringify(burla)}`);
  const filtro = (await api(chefe.token).get(`/api/tarefas?processo_id=${F.proc}&concluida=&usuario_id=${bia.id}`)).body.dados.registros.map(x => x.titulo).sort();
  t.checar(JSON.stringify(filtro) === JSON.stringify(['Da Bia', 'Do escritório']), `Chefe filtrando Bia viu ${JSON.stringify(filtro)}`);
  t.checar((await api(ana.token).put(`/api/tarefas/${daBia}/concluir`).send()).status === 403, 'Ana concluiu tarefa da Bia');
  t.checar((await api(ana.token).put(`/api/tarefas/${daAna}/concluir`).send()).status === 200, 'Ana não concluiu a própria');
  t.checar((await api(ana.token).put(`/api/tarefas/${esc}/concluir`).send()).status === 200, 'Ana não concluiu a do escritório');
  t.checar((await api(chefe.token).put(`/api/tarefas/${daBia}/concluir`).send()).status === 200, 'Chefe não concluiu a da Bia');
  t.checar((await api(ana.token).put(`/api/tarefas/${daBia}/reabrir`).send()).status === 403, 'Ana reabriu tarefa da Bia');
  // Editar / excluir / ver histórico de tarefa que não é dela: a regra do sistema hoje só olha o módulo, não o dono
  t.checar([403, 404].includes((await api(ana.token).get(`/api/tarefas/${daBia}/historico`)).status), 'Ana viu histórico da tarefa da Bia');
  t.checar([403, 404].includes((await api(ana.token).put(`/api/tarefas/${daBia}`).send({ titulo: 'Invadida', data_vencimento: dia(2) })).status), 'Ana editou tarefa da Bia');
  t.checar([403, 404].includes((await api(ana.token).delete(`/api/tarefas/${daBia}`).send()).status), 'Ana excluiu tarefa da Bia');
  await sql('DELETE FROM tarefas');
  t.fim();
});

test('permissões por ação: sem visualizar/cadastrar/alterar/excluir/histórico = 403 e nada muda', async () => {
  const t = juntar();
  const id = await nova({ titulo: 'Protegida' });
  const nada = await criarUsuario('nada', 3, []);
  const so = await criarUsuario('so_ver', 3, [['tarefas', null, 'visualizar']]);
  t.checar((await api(nada.token).get('/api/tarefas')).status === 403, 'listar sem permissão');
  t.checar((await api(so.token).get('/api/tarefas')).status === 200, 'listar com visualizar');
  t.checar((await api(so.token).post('/api/tarefas').send({ titulo: 'X', processo_id: F.proc })).status === 403, 'criar sem cadastrar');
  t.checar((await api(so.token).put(`/api/tarefas/${id}`).send({ titulo: 'X', data_vencimento: dia(2) })).status === 403, 'editar sem alterar');
  t.checar((await api(so.token).delete(`/api/tarefas/${id}`).send()).status === 403, 'excluir sem excluir');
  t.checar((await api(so.token).get(`/api/tarefas/${id}/historico`)).status === 403, 'histórico sem permissão');
  t.checar((await tarefa(id)).titulo === 'Protegida', 'a tarefa foi alterada sem permissão');
  t.fim();
});
