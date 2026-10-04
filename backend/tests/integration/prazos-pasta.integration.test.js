// Plano de testes de Processos — passo C4 (ver PLANO-TESTES-PROCESSOS.md): o servidor dos PRAZOS usados pela aba "Prazos" da pasta.
// Contra MySQL real isolado: criar, editar, concluir, cancelar, "fazendo"/liberar, excluir, listar com filtros, histórico, entradas
// inválidas e permissões. Cada teste junta TODAS as falhas e mostra a lista completa no fim (em vez de parar na primeira).
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
const dia = (deslocamento = 0) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function juntar() {
  const falhas = [];
  return { checar: (ok, texto) => { if (!ok) falhas.push(texto); }, fim: () => assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`) };
}
const corpo = (extra = {}) => ({ processo_id: F.proc, subtipo_id: F.subtipo, descricao: 'Prazo de teste', data_inicio: dia(0), data_final: dia(10), quantidade: 10, tipo_dias: 'corridos', ...extra });
async function criarPrazo(extra = {}, token = admin) {
  const r = await api(token).post('/api/prazos').send(corpo(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const prazo = (id) => um('SELECT * FROM prazos_processo WHERE id = ?', [id]);

let seq = 100;
async function criarUsuario(rotulo, nivel, permissoes) {
  seq += 1;
  const id = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo, notif_tela)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0, 0)`,
    [`Usuário ${rotulo}`, `u${seq}`, `u${seq}@example.invalid`, nivel, `sessao-${seq}`])).insertId;
  for (const [m, s, a] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return { id, token: emitir(id, nivel, `sessao-${seq}`) };
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6101, 1)')).insertId;
  F.proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000101-00.2026.5.15.0001', 'PROCESSO DOS PRAZOS', 1, 1, 1, 1)", [pasta])).insertId;
  F.outro = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000102-00.2026.5.15.0001', 'OUTRO PROCESSO', 1, 1, 1, 1)", [pasta])).insertId;
  F.tipo = (await sql("INSERT INTO tipo_prazo (nome, ativo) VALUES ('Recurso', 1)")).insertId;
  F.subtipo = (await sql("INSERT INTO prazo_subtipo (tipo_prazo_id, nome, ativo) VALUES (?, 'Apelação', 1)", [F.tipo])).insertId;
  F.comum = await criarUsuario('comum', 2, [['prazos', null, 'visualizar'], ['prazos', null, 'cadastrar'], ['prazos', null, 'alterar'], ['prazos', null, 'excluir']]);
  F.comum2 = await criarUsuario('comum2', 2, [['prazos', null, 'visualizar'], ['prazos', null, 'cadastrar'], ['prazos', null, 'alterar'], ['prazos', null, 'excluir']]);
});
test.after(async () => pool.end());

test('criar: grava com a data final que veio, delega, registra auditoria e vale a data final digitada; sem data final calcula pela quantidade', async () => {
  const r = await api().post('/api/prazos').send(corpo({ delegado_para: F.comum.id }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const p = await prazo(r.body.dados.id);
  assert.deepEqual({ proc: p.processo_id, sub: p.subtipo_id, deleg: p.delegado_para, por: p.criado_por, desc: p.descricao, tipo: p.tipo_dias }, { proc: F.proc, sub: F.subtipo, deleg: F.comum.id, por: 1, desc: 'Prazo de teste', tipo: 'corridos' });
  assert.equal((await sql("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'criar' AND registro_id = ?", [p.id])).length, 1);
  const calc = await api().post('/api/prazos').send(corpo({ data_final: undefined, data_inicio: '2026-03-02', quantidade: 5, tipo_dias: 'corridos' }));
  assert.equal(calc.status, 201, JSON.stringify(calc.body));
  assert.equal(String(calc.body.dados.data_vencimento).slice(0, 10), '2026-03-06');
  const semDatas = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: dia(0) });
  assert.equal(semDatas.status, 400);
  assert.match(msg(semDatas), /data final/i);
});

test('quantidade 0 (início e final no mesmo domingo, dias úteis) não é erro: a data final manda e a quantidade fica vazia — criar e editar', async () => {
  const domingo = '2030-06-02';                                     // domingo: zero dias úteis entre início e final
  const t = juntar();
  for (const zero of [0, '0', '00']) {
    const r = await api().post('/api/prazos').send(corpo({ data_inicio: domingo, data_final: domingo, quantidade: zero, tipo_dias: 'uteis' }));
    t.checar(r.status === 201, `criar com quantidade ${JSON.stringify(zero)} → ${r.status} ${JSON.stringify(r.body).slice(0, 110)} (esperado 201)`);
    if (r.status !== 201) continue;
    const p = await prazo(r.body.dados.id);
    t.checar(p.quantidade === null && String(p.data_vencimento.toISOString ? p.data_vencimento.toISOString().slice(0, 10) : p.data_vencimento).slice(0, 10) === domingo && p.tipo_dias === 'uteis',
      `criar com quantidade ${JSON.stringify(zero)}: gravou quantidade=${p.quantidade}, vencimento=${p.data_vencimento}, tipo=${p.tipo_dias} (esperado quantidade vazia, vencimento ${domingo}, uteis)`);
  }
  const id = await criarPrazo();
  const ed = await api().put(`/api/prazos/${id}`).send({ subtipo_id: F.subtipo, descricao: 'No domingo', data_inicio: domingo, data_final: domingo, quantidade: '0', tipo_dias: 'uteis' });
  t.checar(ed.status === 200, `editar com quantidade "0" → ${ed.status} ${JSON.stringify(ed.body).slice(0, 110)} (esperado 200)`);
  const pe = await prazo(id);
  t.checar(pe.quantidade === null && pe.descricao === 'No domingo', `editar com quantidade "0": gravou quantidade=${pe.quantidade}, descrição=${pe.descricao}`);
  // sem data final, o zero não calcula nada: pede a data final (ou uma quantidade maior que zero) e não grava
  const antes = await total('SELECT COUNT(*) AS n FROM prazos_processo');
  for (const zero of [0, '0']) {
    const r = await api().post('/api/prazos').send(corpo({ data_final: undefined, quantidade: zero }));
    t.checar(r.status === 400 && /data final/i.test(msg(r)), `criar só com quantidade ${JSON.stringify(zero)} e sem data final → ${r.status} ${msg(r)} (esperado 400 pedindo a data final)`);
    const e = await api().put(`/api/prazos/${id}`).send({ subtipo_id: F.subtipo, descricao: 'X', data_inicio: dia(0), quantidade: zero, tipo_dias: 'corridos' });
    t.checar(e.status === 400 && /data final/i.test(msg(e)), `editar só com quantidade ${JSON.stringify(zero)} e sem data final → ${e.status} ${msg(e)} (esperado 400 pedindo a data final)`);
  }
  t.checar(await total('SELECT COUNT(*) AS n FROM prazos_processo') === antes, 'um prazo sem data final foi gravado');
  // o que continua inválido de verdade: negativo, texto, decimal, enorme (e "-0" não vira zero)
  for (const ruim of [-1, '-0', 'abc', 1.5, '1.5', 99999999999]) {
    const r = await api().post('/api/prazos').send(corpo({ quantidade: ruim }));
    t.checar(r.status === 400, `criar com quantidade ${JSON.stringify(ruim)} → ${r.status} (esperado 400)`);
  }
  t.fim();
});

test('criar: entradas inválidas dão aviso claro (400/404) — nunca erro interno nem prazo gravado', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM prazos_processo');
  const t = juntar();
  const casos = [
    ['processo ausente', { processo_id: undefined }], ['processo inexistente', { processo_id: 999999 }], ['processo "abc"', { processo_id: 'abc' }],
    ['processo 0', { processo_id: 0 }], ['processo lista', { processo_id: [1] }],
    ['data_inicio "xyz"', { data_inicio: 'xyz' }], ['data_inicio 2026-13-45', { data_inicio: '2026-13-45' }], ['data_inicio número', { data_inicio: 20260315 }],
    ['data_final "xyz"', { data_final: 'xyz' }], ['data_final 2026-02-30', { data_final: '2026-02-30' }], ['data_final lista', { data_final: ['2026-03-01'] }],
    ['data_final antes do início', { data_inicio: dia(10), data_final: dia(1) }],
    ['quantidade negativa', { quantidade: -3 }], ['quantidade "abc"', { quantidade: 'abc' }], ['quantidade 1.5', { quantidade: 1.5 }], ['quantidade enorme', { quantidade: 99999999999 }],
    ['tipo_dias "xyz"', { tipo_dias: 'xyz' }], ['tipo_dias número', { tipo_dias: 5 }],
    ['descrição número', { descricao: 123 }], ['descrição lista', { descricao: ['a'] }], ['descrição com 1001 caracteres', { descricao: 'x'.repeat(1001) }],
    ['subtipo inexistente', { subtipo_id: 999999 }], ['subtipo "abc"', { subtipo_id: 'abc' }],
    ['delegado inexistente', { delegado_para: 999999 }], ['delegado "abc"', { delegado_para: 'abc' }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().post('/api/prazos').send(corpo(extra));
    t.checar([400, 404, 409].includes(r.status) && !/Erro interno/.test(msg(r)), `criar com ${rotulo} → ${r.status} ${JSON.stringify(r.body).slice(0, 110)} (esperado 400/404/409, sem erro interno)`);
  }
  t.checar(await total('SELECT COUNT(*) AS n FROM prazos_processo') === antes, 'algum prazo inválido foi gravado');
  t.fim();
});

test('criar: 1.000 caracteres na descrição são aceitos; processo inativo não recebe prazo', async () => {
  const ok = await api().post('/api/prazos').send(corpo({ descricao: 'x'.repeat(1000) }));
  assert.equal(ok.status, 201);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [F.outro]);
  const inativo = await api().post('/api/prazos').send(corpo({ processo_id: F.outro }));
  assert.equal(inativo.status, 404, JSON.stringify(inativo.body));
  await sql('UPDATE tblproc SET ativo = 1 WHERE id = ?', [F.outro]);
});

test('editar: troca os campos e a data final manda; guarda auditoria; entradas inválidas são recusadas; prazo finalizado não é editado', async () => {
  const id = await criarPrazo();
  const ok = await api().put(`/api/prazos/${id}`).send({ subtipo_id: F.subtipo, descricao: 'Editado', data_inicio: dia(1), data_final: dia(20), quantidade: 19, tipo_dias: 'corridos', delegado_para: F.comum.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const p = await prazo(id);
  assert.deepEqual({ desc: p.descricao, deleg: p.delegado_para }, { desc: 'Editado', deleg: F.comum.id });
  assert.equal(String(p.data_vencimento.toISOString ? p.data_vencimento.toISOString().slice(0, 10) : p.data_vencimento).length >= 10, true);
  assert.equal((await sql("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'editar' AND registro_id = ?", [id])).length, 1);
  const t = juntar();
  const base = { subtipo_id: F.subtipo, descricao: 'X', data_inicio: dia(1), data_final: dia(5), quantidade: 4, tipo_dias: 'corridos' };
  const casos = [
    ['sem data de início', { data_inicio: undefined }], ['data_inicio "xyz"', { data_inicio: 'xyz' }], ['data_final "2026-13-45"', { data_final: '2026-13-45' }],
    ['data_final antes do início', { data_inicio: dia(10), data_final: dia(1) }], ['quantidade negativa', { quantidade: -1 }], ['tipo_dias "xyz"', { tipo_dias: 'xyz' }],
    ['descrição número', { descricao: 5 }], ['descrição 1001 caracteres', { descricao: 'x'.repeat(1001) }], ['subtipo inexistente', { subtipo_id: 999999 }], ['delegado inexistente', { delegado_para: 999999 }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().put(`/api/prazos/${id}`).send({ ...base, ...extra });
    t.checar([400, 404, 409].includes(r.status) && !/Erro interno/.test(msg(r)), `editar com ${rotulo} → ${r.status} ${JSON.stringify(r.body).slice(0, 110)} (esperado 400/404/409, sem erro interno)`);
  }
  for (const idRuim of ['999999', 'abc', '0', '-1']) {
    const r = await api().put(`/api/prazos/${idRuim}`).send(base);
    t.checar(r.status === 404, `editar prazo ${idRuim} → ${r.status} (esperado 404)`);
  }
  const finalizado = await criarPrazo();
  await api().put(`/api/prazos/${finalizado}/status`).send({ status: 'concluido' });
  const r2 = await api().put(`/api/prazos/${finalizado}`).send({ ...base, descricao: 'Mexi depois de concluído' });
  t.checar(r2.status === 400, `editar prazo concluído → ${r2.status} (esperado 400: prazo finalizado não pode ser alterado)`);
  t.checar((await prazo(finalizado)).descricao === 'Prazo de teste', 'o prazo concluído foi alterado');
  t.fim();
});

test('concluir: registra quem concluiu, cria o andamento "Prazo concluído: …", limpa o "fazendo", grava o histórico; não repete e não conclui prazo de outro sem permissão', async () => {
  const id = await criarPrazo();
  const r = await api().put(`/api/prazos/${id}/status`).send({ status: 'concluido', observacao: 'Feito' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = await prazo(id);
  assert.deepEqual({ status: p.status, por: p.concluido_por, fazendo: p.fazendo_por }, { status: 'concluido', por: 1, fazendo: null });
  assert.equal(await total("SELECT COUNT(*) AS n FROM andamento_processual WHERE processo_id = ? AND descricao = 'Prazo concluído: Apelação' AND fonte = 'manual'", [F.proc]) >= 1, true);
  assert.equal(await total("SELECT COUNT(*) AS n FROM auditoria_prazo WHERE prazo_id = ? AND status_novo = 'concluido'", [id]), 1);
  const dnv = await api().put(`/api/prazos/${id}/status`).send({ status: 'concluido' });
  assert.equal(dnv.status, 400);
  assert.match(msg(dnv), /finalizado/i);
  const t = juntar();
  const doComum = await criarPrazo({ delegado_para: F.comum.id });
  const intruso = await api(F.comum2.token).put(`/api/prazos/${doComum}/status`).send({ status: 'concluido' });
  t.checar(intruso.status === 403, `usuário sem "ver todos" concluir prazo delegado a outro → ${intruso.status} (esperado 403)`);
  const meu = await api(F.comum.token).put(`/api/prazos/${doComum}/status`).send({ status: 'concluido' });
  t.checar(meu.status === 200, `concluir o prazo delegado a si → ${meu.status}`);
  for (const status of [undefined, 'aberto', 'xyz', 123, ['concluido'], { a: 1 }]) {
    const id2 = await criarPrazo();
    const x = await api().put(`/api/prazos/${id2}/status`).send({ status });
    t.checar(x.status === 400, `status=${JSON.stringify(status)} → ${x.status} (esperado 400)`);
  }
  t.fim();
});

test('cancelar: motivo obrigatório (texto, até 300), limpa o "fazendo", guarda motivo e histórico; entradas inválidas e prazo já finalizado são recusados', async () => {
  const t = juntar();
  const id = await criarPrazo();
  for (const motivo of [undefined, null, '', '   ', 123, ['a'], { a: 1 }, 'x'.repeat(301)]) {
    const r = await api().put(`/api/prazos/${id}/status`).send({ status: 'cancelado', motivo_cancelamento: motivo });
    t.checar(r.status === 400, `cancelar com motivo=${String(JSON.stringify(motivo)).slice(0, 20)} → ${r.status} ${JSON.stringify(r.body).slice(0, 90)} (esperado 400)`);
  }
  t.checar((await prazo(id)).status !== 'cancelado', 'o prazo foi cancelado com motivo inválido');
  const ok = await api().put(`/api/prazos/${id}/status`).send({ status: 'cancelado', motivo_cancelamento: '  Cliente desistiu  ' });
  t.checar(ok.status === 200, `cancelar com motivo válido → ${ok.status}`);
  const p = await prazo(id);
  t.checar(p.status === 'cancelado' && p.motivo_cancelamento === 'Cliente desistiu', `estado após cancelar: ${p.status} / ${p.motivo_cancelamento}`);
  t.checar(await total("SELECT COUNT(*) AS n FROM auditoria_prazo WHERE prazo_id = ? AND status_novo = 'cancelado'", [id]) === 1, 'faltou o registro no histórico');
  const dnv = await api().put(`/api/prazos/${id}/status`).send({ status: 'cancelado', motivo_cancelamento: 'De novo' });
  t.checar(dnv.status === 400, `cancelar duas vezes → ${dnv.status}`);
  const ok300 = await criarPrazo();
  const r300 = await api().put(`/api/prazos/${ok300}/status`).send({ status: 'cancelado', motivo_cancelamento: 'x'.repeat(300) });
  t.checar(r300.status === 200, `motivo com 300 caracteres deveria ser aceito → ${r300.status}`);
  const inexistente = await api().put('/api/prazos/999999/status').send({ status: 'cancelado', motivo_cancelamento: 'x' });
  t.checar(inexistente.status === 404, `cancelar prazo inexistente → ${inexistente.status}`);
  const naoNumero = await api().put('/api/prazos/abc/status').send({ status: 'cancelado', motivo_cancelamento: 'x' });
  t.checar(naoNumero.status === 404, `cancelar prazo "abc" → ${naoNumero.status} (esperado 404)`);
  t.fim();
});

test('fazendo / liberar: marca, trava para outros, libera (o próprio ou admin), histórico, e não age em prazo finalizado ou inexistente', async () => {
  const t = juntar();
  const id = await criarPrazo();
  const a = await api(F.comum.token).put(`/api/prazos/${id}/fazendo`).send({});
  t.checar(a.status === 200 && (await prazo(id)).fazendo_por === F.comum.id, `marcar fazendo → ${a.status}`);
  const repete = await api(F.comum.token).put(`/api/prazos/${id}/fazendo`).send({});
  t.checar(repete.status === 200 && /já está fazendo/i.test(msg(repete)), 'marcar de novo deveria só avisar que já está fazendo');
  const outro = await api(F.comum2.token).put(`/api/prazos/${id}/fazendo`).send({});
  t.checar(outro.status === 400 && /outro usuário/i.test(msg(outro)), `outra pessoa marcar → ${outro.status} ${msg(outro)}`);
  const concluirOutro = await api(F.comum2.token).put(`/api/prazos/${id}/status`).send({ status: 'concluido' });
  t.checar(concluirOutro.status === 403, `outra pessoa concluir prazo que está sendo feito → ${concluirOutro.status} (esperado 403)`);
  const editarOutro = await api(F.comum2.token).put(`/api/prazos/${id}`).send({ subtipo_id: F.subtipo, descricao: 'X', data_inicio: dia(0), data_final: dia(3), quantidade: 3, tipo_dias: 'corridos' });
  t.checar(editarOutro.status === 403, `outra pessoa editar prazo que está sendo feito → ${editarOutro.status} (esperado 403)`);
  const excluirOutro = await api(F.comum2.token).delete(`/api/prazos/${id}`);
  t.checar(excluirOutro.status === 403, `outra pessoa excluir prazo que está sendo feito → ${excluirOutro.status} (esperado 403)`);
  const liberarOutro = await api(F.comum2.token).put(`/api/prazos/${id}/liberar-fazendo`).send({});
  t.checar(liberarOutro.status === 403, `outra pessoa liberar → ${liberarOutro.status} (esperado 403)`);
  const liberarAdmin = await api().put(`/api/prazos/${id}/liberar-fazendo`).send({});
  t.checar(liberarAdmin.status === 200 && (await prazo(id)).fazendo_por === null, `admin liberar → ${liberarAdmin.status}`);
  const liberarVazio = await api(F.comum.token).put(`/api/prazos/${id}/liberar-fazendo`).send({});
  t.checar(liberarVazio.status === 200 && /ninguém/i.test(msg(liberarVazio)), 'liberar prazo que ninguém faz deveria só avisar');
  const hist = await total("SELECT COUNT(*) AS n FROM auditoria_prazo WHERE prazo_id = ? AND (status_novo = 'fazendo' OR status_anterior = 'fazendo')", [id]);
  t.checar(hist === 2, `histórico de fazendo/liberar: ${hist} linhas (esperado 2)`);
  const fim = await criarPrazo();
  await api().put(`/api/prazos/${fim}/status`).send({ status: 'concluido' });
  const emFinal = await api().put(`/api/prazos/${fim}/fazendo`).send({});
  t.checar(emFinal.status === 400, `fazendo em prazo concluído → ${emFinal.status}`);
  for (const rota of ['fazendo', 'liberar-fazendo']) {
    for (const idRuim of ['999999', 'abc']) {
      const r = await api().put(`/api/prazos/${idRuim}/${rota}`).send({});
      t.checar(r.status === 404, `${rota} prazo ${idRuim} → ${r.status} (esperado 404)`);
    }
  }
  // quem não vê prazos de todos não pode "fazer" um prazo delegado a outra pessoa
  const deOutro = await criarPrazo({ delegado_para: F.comum.id });
  const intruso = await api(F.comum2.token).put(`/api/prazos/${deOutro}/fazendo`).send({});
  t.checar(intruso.status === 403, `marcar "fazendo" no prazo delegado a OUTRA pessoa, sem poder ver todos → ${intruso.status} (esperado 403)`);
  t.fim();
});

test('excluir: apaga prazo aberto com histórico, notificações e vínculos tratados; prazo finalizado não; entradas inválidas dão 404', async () => {
  const t = juntar();
  const id = await criarPrazo();
  await api().put(`/api/prazos/${id}/fazendo`).send({});
  await sql("INSERT INTO notificacoes (usuario_id, mensagem, prazo_id) VALUES (1, 'teste', ?)", [id]).catch(() => null);
  const tarefa = (await sql("INSERT INTO tarefas (titulo, criado_por, prazo_id) VALUES ('Tarefa ligada', 1, ?)", [id]).catch(() => [{ insertId: 0 }])).insertId;
  const r = await api().delete(`/api/prazos/${id}`);
  t.checar(r.status === 200, `excluir → ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  t.checar(await total('SELECT COUNT(*) AS n FROM prazos_processo WHERE id = ?', [id]) === 0, 'o prazo continua no banco');
  t.checar(await total('SELECT COUNT(*) AS n FROM auditoria_prazo WHERE prazo_id = ?', [id]) === 0, 'sobrou histórico órfão');
  if (tarefa) t.checar(await total('SELECT COUNT(*) AS n FROM tarefas WHERE id = ? AND prazo_id IS NULL', [tarefa]) === 1, 'a tarefa deveria continuar, só desvinculada');
  t.checar((await sql("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'excluir' AND registro_id = ?", [id])).length === 1, 'faltou a auditoria de exclusão');
  const fin = await criarPrazo();
  await api().put(`/api/prazos/${fin}/status`).send({ status: 'cancelado', motivo_cancelamento: 'x' });
  const bloq = await api().delete(`/api/prazos/${fin}`);
  t.checar(bloq.status === 400 && /concluídos ou cancelados/.test(msg(bloq)), `excluir prazo cancelado → ${bloq.status}`);
  for (const idRuim of ['999999', 'abc', '0', '-1', '1.5']) {
    const x = await api().delete(`/api/prazos/${idRuim}`);
    t.checar(x.status === 404, `excluir prazo ${idRuim} → ${x.status} (esperado 404)`);
  }
  t.fim();
});

test('listar (como a aba da pasta usa): filtro por processo, status calculado, datas, escondidos os encerrados, ordem, "ver todos" e limite', async () => {
  const t = juntar();
  const proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) SELECT pasta_id, '0000103-00.2026.5.15.0001', 'LISTA PRAZOS', 1, 1, 1, 1 FROM tblproc WHERE id = ?", [F.proc])).insertId;
  const atrasado = await criarPrazo({ processo_id: proc, data_inicio: dia(-10), data_final: dia(-2), descricao: 'Atrasado' });
  const hoje = await criarPrazo({ processo_id: proc, data_inicio: dia(-3), data_final: dia(0), descricao: 'Hoje' });
  const futuro = await criarPrazo({ processo_id: proc, data_inicio: dia(0), data_final: dia(5), descricao: 'Futuro' });
  const concl = await criarPrazo({ processo_id: proc, data_inicio: dia(0), data_final: dia(9), descricao: 'Concluído' });
  await api().put(`/api/prazos/${concl}/status`).send({ status: 'concluido' });
  const canc = await criarPrazo({ processo_id: proc, data_inicio: dia(0), data_final: dia(8), descricao: 'Cancelado' });
  await api().put(`/api/prazos/${canc}/status`).send({ status: 'cancelado', motivo_cancelamento: 'x' });
  await api().put(`/api/prazos/${futuro}/fazendo`).send({});
  const lista = async (q, token = admin) => (await api(token).get(`/api/prazos?processo_id=${proc}&${q}`)).body.dados;
  const nomes = (l) => l.registros.map(x => x.descricao);
  t.checar(JSON.stringify(nomes(await lista('limite=50'))) === JSON.stringify(['Atrasado', 'Hoje', 'Futuro']), `padrão (só em aberto, por vencimento): ${JSON.stringify(nomes(await lista('limite=50')))}`);
  t.checar((await lista('mostrar_encerrados=true&limite=50')).registros.length === 5, 'com "mostrar encerrados" deveria vir 5');
  for (const [filtro, esperado] of [['atrasado', ['Atrasado']], ['pendente', ['Hoje']], ['agendado', ['Futuro']], ['fazendo', ['Futuro']], ['concluido', ['Concluído']], ['cancelado', ['Cancelado']]])
    t.checar(JSON.stringify(nomes(await lista(`status=${filtro}&limite=50`))) === JSON.stringify(esperado), `status=${filtro}: ${JSON.stringify(nomes(await lista(`status=${filtro}&limite=50`)))}`);
  const faixa = await lista(`data_de=${dia(0)}&data_ate=${dia(5)}&limite=50`);
  t.checar(JSON.stringify(nomes(faixa)) === JSON.stringify(['Hoje', 'Futuro']), `faixa de datas: ${JSON.stringify(nomes(faixa))}`);
  const l1 = (await lista('limite=50')).registros.find(x => x.descricao === 'Atrasado');
  t.checar(l1.status === 'atrasado' && l1.dias_restantes === -2 && l1.pasta_numero_fmt === '6101', `campos do atrasado: ${JSON.stringify({ s: l1.status, d: l1.dias_restantes, p: l1.pasta_numero_fmt })}`);
  const total2 = (await lista('limite=2&pagina=1')).total;
  t.checar(total2 === 3 && (await lista('limite=2&pagina=1')).registros.length === 2 && (await lista('limite=2&pagina=2')).registros.length === 1, 'paginação: total/primeira/segunda página');
  t.checar((await api().get('/api/prazos?limite=abc&pagina=xyz')).status === 200, 'limite/pagina que não são número deveriam ser ignorados');
  // quem não vê prazos de todos enxerga só os próprios e os do escritório
  const meu = await criarPrazo({ processo_id: proc, descricao: 'Meu do comum', delegado_para: F.comum.id });
  const deOutro = await criarPrazo({ processo_id: proc, descricao: 'Do outro', delegado_para: F.comum2.id });
  const comum = nomes(await lista('limite=50', F.comum.token));
  t.checar(comum.includes('Meu do comum') && comum.includes('Atrasado') && !comum.includes('Do outro'), `visão do usuário comum: ${JSON.stringify(comum)}`);
  const burla = nomes((await api(F.comum.token).get(`/api/prazos?processo_id=${proc}&usuario_id=${F.comum2.id}&limite=50`)).body.dados);
  t.checar(!burla.includes('Do outro'), 'usuário comum conseguiu ver o prazo de outro pessoa passando usuario_id');
  t.checar(deOutro > 0 && meu > 0 && atrasado > 0 && hoje > 0, 'criação');
  t.fim();
});

test('histórico do prazo: criação, "fazendo", liberado, concluído/cancelado na ordem; prazo inexistente é 404', async () => {
  const t = juntar();
  const id = await criarPrazo();
  await api().put(`/api/prazos/${id}/fazendo`).send({});
  await api().put(`/api/prazos/${id}/liberar-fazendo`).send({});
  await api().put(`/api/prazos/${id}/status`).send({ status: 'cancelado', motivo_cancelamento: 'Sem objeto' });
  const r = await api().get(`/api/prazos/${id}/historico`);
  t.checar(r.status === 200, `histórico → ${r.status}`);
  const descr = (r.body.dados.eventos || r.body.dados || []).map(e => e.descricao);
  t.checar(descr[0] === 'Prazo cadastrado' && descr.some(d => /Iniciado por/.test(d)) && descr.some(d => /liberado/i.test(d)) && descr[descr.length - 1] === 'Prazo cancelado', `linha do tempo: ${JSON.stringify(descr)}`);
  for (const idRuim of ['999999', 'abc']) t.checar((await api().get(`/api/prazos/${idRuim}/historico`)).status === 404, `histórico do prazo ${idRuim} deveria ser 404`);
  t.fim();
});

test('permissões: cada rota exige a permissão certa (visualizar/cadastrar/alterar/excluir/histórico) e sem login é 401', async () => {
  const t = juntar();
  const so = async (acao) => (await criarUsuario(`só ${acao}`, 2, [['prazos', null, acao]])).token;
  const tokens = { visualizar: await so('visualizar'), cadastrar: await so('cadastrar'), alterar: await so('alterar'), excluir: await so('excluir'), historico: await so('historico') };
  const id = await criarPrazo();
  const ROTAS = [
    ['get', `/api/prazos?processo_id=${F.proc}`, 'visualizar', {}],
    ['post', '/api/prazos', 'cadastrar', {}],
    ['put', `/api/prazos/${id}`, 'alterar', {}],
    ['delete', `/api/prazos/999999`, 'excluir', {}],
    ['get', `/api/prazos/${id}/historico`, 'historico', {}],
  ];
  for (const [metodo, caminho, exigida, c] of ROTAS) {
    const sem = await request(app)[metodo](caminho).send(c);
    t.checar(sem.status === 401, `${metodo} ${caminho} sem login → ${sem.status}`);
    for (const [acao, token] of Object.entries(tokens)) {
      const r = await api(token)[metodo](caminho).send(c);
      if (acao === exigida) t.checar(r.status !== 401 && r.status !== 403, `${metodo} ${caminho} com "${acao}" (a exigida) foi barrado: ${r.status}`);
      else t.checar(r.status === 403, `${metodo} ${caminho} com só "${acao}" → ${r.status} (esperado 403)`);
    }
  }
  t.fim();
});
