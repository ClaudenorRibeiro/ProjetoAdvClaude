// Plano de testes de Processos — passo C3 (ver PLANO-TESTES-PROCESSOS.md): o servidor dos ANDAMENTOS do processo.
// Contra MySQL real isolado: listar, criar, editar, excluir (só os manuais), DataJud (desativado / sem número / já sincronizado hoje),
// entradas inválidas, permissões do submódulo "andamentos" e auditoria.
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
const auditoria = (id, acao) => sql("SELECT * FROM logs_auditoria WHERE tabela = 'andamento_processual' AND registro_id = ? AND acao = ?", [id, acao]);
const manual = async (processoId, data = '2026-03-01', descricao = 'Andamento manual') =>
  (await sql("INSERT INTO andamento_processual (processo_id, data, descricao, fonte, criado_por) VALUES (?, ?, ?, 'manual', 1)", [processoId, data, descricao])).insertId;
const datajud = async (processoId) =>
  (await sql("INSERT INTO andamento_processual (processo_id, data, data_hora, descricao, fonte, codigo_movimento, hash_movimento) VALUES (?, '2026-03-10', '2026-03-10 14:30:00', 'Movimento do CNJ', 'datajud', 26, ?)", [processoId, `h${Math.random()}`.padEnd(40, 'x').slice(0, 40)])).insertId;

let seq = 100;
async function criarUsuario(rotulo, nivel, permissoes) {
  seq += 1;
  const id = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0)`,
    [`Usuário ${rotulo}`, `u${seq}`, `u${seq}@example.invalid`, nivel, `sessao-${seq}`])).insertId;
  for (const [m, s, a] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return emitir(id, nivel, `sessao-${seq}`);
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql("INSERT INTO tblpasta (numPasta, criado_por) VALUES (6001, 1)")).insertId;
  const proc = async (num) => (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'PROCESSO DE ANDAMENTOS', 1, 1, 1, 1)", [pasta, num])).insertId;
  F.proc = await proc('0000001-00.2026.5.15.0001');
  F.procSemNumero = await proc(null);
  F.outro = await proc('0000002-00.2026.5.15.0001');
});
test.after(async () => pool.end());

test('criar: grava como manual, tira espaços das pontas, usa a data de hoje (Brasília) quando não vem, registra o autor e a auditoria', async () => {
  const r = await api().post(`/api/andamento/${F.proc}`).send({ data: '2026-03-15', descricao: '  Petição protocolada  ' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = await um('SELECT * FROM andamento_processual WHERE id = ?', [r.body.dados.id]);
  assert.deepEqual({ proc: a.processo_id, desc: a.descricao, fonte: a.fonte, por: a.criado_por }, { proc: F.proc, desc: 'Petição protocolada', fonte: 'manual', por: 1 });
  assert.equal(String(new Date(a.data).getFullYear()), '2026');
  assert.equal((await auditoria(a.id, 'criar')).length, 1);
  const semData = await api().post(`/api/andamento/${F.proc}`).send({ descricao: 'Sem data' });
  assert.equal(semData.status, 201);
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const esperado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const b = await um("SELECT DATE_FORMAT(data, '%Y-%m-%d') AS d FROM andamento_processual WHERE id = ?", [semData.body.dados.id]);
  assert.equal(b.d, esperado);
});

test('criar: descrição obrigatória e de verdade (vazia, só espaços, número, lista, objeto) — nada é gravado e nunca dá erro interno', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM andamento_processual');
  for (const descricao of [undefined, null, '', '   ', '\n\t', 123, true, ['a'], { a: 1 }]) {
    const r = await api().post(`/api/andamento/${F.proc}`).send({ data: '2026-03-15', descricao });
    assert.equal(r.status, 400, `descricao=${JSON.stringify(descricao)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), /descrição/i);
  }
  assert.equal(await total('SELECT COUNT(*) AS n FROM andamento_processual'), antes);
});

test('criar: data inválida, processo que não existe / não é número / está inativo e texto grande demais dão aviso claro, sem erro interno e sem gravar', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM andamento_processual');
  for (const data of ['xyz', '2026-13-45', '31/12/2026', 20260315, ['2026-03-15'], { a: 1 }, '2026-02-30']) {
    const r = await api().post(`/api/andamento/${F.proc}`).send({ data, descricao: 'Teste' });
    assert.equal(r.status, 400, `data=${JSON.stringify(data)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), /data/i);
  }
  for (const id of ['999999', 'abc', '0', '-1', '1.5']) {
    const r = await api().post(`/api/andamento/${id}`).send({ data: '2026-03-15', descricao: 'Teste' });
    assert.ok([400, 404, 409].includes(r.status), `processo ${id} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.doesNotMatch(msg(r), /Erro interno/i, `processo ${id}`);
  }
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [F.outro]);
  const inativo = await api().post(`/api/andamento/${F.outro}`).send({ data: '2026-03-15', descricao: 'Teste' });
  assert.ok([400, 404, 409].includes(inativo.status), `processo inativo → ${inativo.status} ${JSON.stringify(inativo.body)}`);
  await sql('UPDATE tblproc SET ativo = 1 WHERE id = ?', [F.outro]);
  const gigante = await api().post(`/api/andamento/${F.proc}`).send({ data: '2026-03-15', descricao: 'x'.repeat(200000) });
  assert.ok([201, 400, 413].includes(gigante.status), `texto enorme → ${gigante.status}`);
  assert.equal(await total('SELECT COUNT(*) AS n FROM andamento_processual'), antes + (gigante.status === 201 ? 1 : 0));
});

test('editar: troca data e descrição, guarda quem editou, mantém a data quando não vem e recusa descrição vazia/inválida e andamento do DataJud', async () => {
  const id = await manual(F.proc, '2026-03-01', 'Original');
  const ok = await api().put(`/api/andamento/${id}`).send({ data: '2026-03-20', descricao: '  Editado  ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const a = await um("SELECT DATE_FORMAT(data, '%Y-%m-%d') AS d, descricao, editado_por, editado_em FROM andamento_processual WHERE id = ?", [id]);
  assert.deepEqual({ d: a.d, descricao: a.descricao, por: a.editado_por, quando: !!a.editado_em }, { d: '2026-03-20', descricao: 'Editado', por: 1, quando: true });
  assert.equal((await auditoria(id, 'editar')).length, 1);
  const semData = await api().put(`/api/andamento/${id}`).send({ descricao: 'Só o texto' });
  assert.equal(semData.status, 200);
  assert.equal((await um("SELECT DATE_FORMAT(data, '%Y-%m-%d') AS d FROM andamento_processual WHERE id = ?", [id])).d, '2026-03-20');
  for (const descricao of [undefined, null, '', '   ', 123, ['a'], { a: 1 }]) {
    const r = await api().put(`/api/andamento/${id}`).send({ data: '2026-03-21', descricao });
    assert.equal(r.status, 400, `descricao=${JSON.stringify(descricao)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), /descrição/i);
  }
  for (const data of ['xyz', '2026-13-45']) {
    const r = await api().put(`/api/andamento/${id}`).send({ data, descricao: 'Texto' });
    assert.equal(r.status, 400, `data=${data} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert.equal((await um('SELECT descricao FROM andamento_processual WHERE id = ?', [id])).descricao, 'Só o texto');
  const dj = await datajud(F.proc);
  const r = await api().put(`/api/andamento/${dj}`).send({ descricao: 'Mexendo' });
  assert.equal(r.status, 400);
  assert.match(msg(r), /DataJud/);
  assert.equal((await um('SELECT descricao FROM andamento_processual WHERE id = ?', [dj])).descricao, 'Movimento do CNJ');
});

test('editar e excluir: andamento que não existe ou id que não é número dão "não encontrado" (nunca erro interno)', async () => {
  for (const id of ['999999', 'abc', '0', '-1', '1.5', '1;DROP']) {
    const e = await api().put(`/api/andamento/${id}`).send({ descricao: 'Teste' });
    assert.ok([400, 404].includes(e.status), `PUT ${id} → ${e.status} ${JSON.stringify(e.body)}`);
    assert.doesNotMatch(msg(e), /Erro interno/i, `PUT ${id}`);
    const x = await api().delete(`/api/andamento/${id}`);
    assert.ok([400, 404].includes(x.status), `DELETE ${id} → ${x.status} ${JSON.stringify(x.body)}`);
    assert.doesNotMatch(msg(x), /Erro interno/i, `DELETE ${id}`);
  }
});

test('excluir: apaga só o manual (com auditoria); o do DataJud não pode ser excluído; excluir duas vezes dá "não encontrado"', async () => {
  const id = await manual(F.proc, '2026-03-01', 'Para apagar');
  const r = await api().delete(`/api/andamento/${id}`);
  assert.equal(r.status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM andamento_processual WHERE id = ?', [id]), 0);
  assert.equal((await auditoria(id, 'excluir')).length, 1);
  assert.equal((await api().delete(`/api/andamento/${id}`)).status, 404);
  const dj = await datajud(F.proc);
  const bloqueado = await api().delete(`/api/andamento/${dj}`);
  assert.equal(bloqueado.status, 400);
  assert.match(msg(bloqueado), /DataJud/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM andamento_processual WHERE id = ?', [dj]), 1);
});

test('listar: do mais novo para o mais antigo (data/hora, depois id), com o nome de quem registrou; processo sem andamento ou que não existe devolve lista vazia', async () => {
  const proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) SELECT pasta_id, '0000009-00.2026.5.15.0001', 'LISTAGEM', 1, 1, 1, 1 FROM tblproc WHERE id = ?", [F.proc])).insertId;
  const a = await manual(proc, '2026-01-01', 'Mais antigo');
  const b = await manual(proc, '2026-02-01', 'Do meio');
  const dj = await datajud(proc);                                      // 10/03/2026 14:30
  const c = await manual(proc, '2026-03-10', 'Do mesmo dia do DataJud');
  const r = await api().get(`/api/andamento/${proc}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.dados.map(x => x.descricao), ['Movimento do CNJ', 'Do mesmo dia do DataJud', 'Do meio', 'Mais antigo']);
  const ordem = r.body.dados.map(x => x.id);
  assert.deepEqual(ordem.slice(-2), [b, a]);                              // os mais antigos por último
  assert.ok(ordem.includes(dj) && ordem.includes(c));
  assert.equal(r.body.dados.find(x => x.id === c).criado_por_nome, 'Administrador de Testes');
  assert.equal(r.body.dados.find(x => x.id === dj).criado_por_nome, null);
  const vazio = await api().get(`/api/andamento/${F.procSemNumero}`);
  assert.deepEqual(vazio.body.dados, []);
  const inexistente = await api().get('/api/andamento/999999');
  assert.equal(inexistente.status, 200);
  assert.deepEqual(inexistente.body.dados, []);
  const naoNumero = await api().get('/api/andamento/abc');
  assert.ok([200, 400, 404].includes(naoNumero.status));
  assert.doesNotMatch(msg(naoNumero), /Erro interno/i);
});

test('sincronizar (DataJud): desativado, processo inexistente, sem número CNJ e já sincronizado hoje — sem chamar o CNJ e sem erro', async () => {
  await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'datajud'");
  const desativado = await api().post(`/api/andamento/${F.proc}/sincronizar`).send({});
  assert.equal(desativado.status, 200, JSON.stringify(desativado.body));
  assert.equal(desativado.body.dados.datajud.tipo, 'inativo');
  assert.ok(Array.isArray(desativado.body.dados.andamentos));
  await sql("INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes) VALUES ('datajud', 1, '{}') ON DUPLICATE KEY UPDATE ativo = 1");
  const inexistente = await api().post('/api/andamento/999999/sincronizar').send({});
  assert.equal(inexistente.status, 404);
  const semNumero = await api().post(`/api/andamento/${F.procSemNumero}/sincronizar`).send({});
  assert.equal(semNumero.status, 200);
  assert.equal(semNumero.body.dados.datajud.tipo, 'sem_numero');
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const fmt = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} 08:05:00`;
  await sql('UPDATE tblproc SET datajud_sincronizado_em = ? WHERE id = ?', [fmt, F.proc]);
  const jaHoje = await api().post(`/api/andamento/${F.proc}/sincronizar`).send({});
  assert.equal(jaHoje.status, 200);
  assert.equal(jaHoje.body.dados.datajud.tipo, 'ja_hoje');
  assert.match(jaHoje.body.dados.datajud.mensagem, /08:05/);
  await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'datajud'");
});

test('permissões: cada rota exige a permissão do submódulo "andamentos" (visualizar/cadastrar/alterar/excluir) e sem login é 401', async () => {
  const id = await manual(F.proc, '2026-03-01', 'Para permissões');
  const so = async (acao) => criarUsuario(`só ${acao}`, 2, [['processos', 'andamentos', acao]]);
  const tokens = { visualizar: await so('visualizar'), cadastrar: await so('cadastrar'), alterar: await so('alterar'), excluir: await so('excluir'),
    modulo: await criarUsuario('só módulo processos', 2, [['processos', null, 'visualizar'], ['processos', null, 'cadastrar'], ['processos', null, 'alterar'], ['processos', null, 'excluir']]) };
  const ROTAS = [
    ['get', `/api/andamento/${F.proc}`, 'visualizar', {}],
    ['post', `/api/andamento/${F.procSemNumero}/sincronizar`, 'visualizar', {}],
    ['post', `/api/andamento/${F.proc}`, 'cadastrar', { descricao: 'Permissão', data: '2026-03-15' }],
    ['put', `/api/andamento/${id}`, 'alterar', { descricao: 'Permissão editada' }],
    ['delete', `/api/andamento/${id}`, 'excluir', {}],
  ];
  for (const [metodo, caminho, exigida, corpo] of ROTAS) {
    const sem = await request(app)[metodo](caminho).send(corpo);
    assert.equal(sem.status, 401, `${metodo} ${caminho} sem login → ${sem.status}`);
    for (const [acao, token] of Object.entries(tokens)) {
      if (acao === exigida) continue;
      const r = await api(token)[metodo](caminho).send(corpo);
      assert.equal(r.status, 403, `${metodo} ${caminho} com só "${acao}" → ${r.status} ${JSON.stringify(r.body)}`);
    }
  }
  // com a permissão certa passa (o excluir por último, porque apaga)
  assert.equal((await api(tokens.visualizar).get(`/api/andamento/${F.proc}`)).status, 200);
  assert.equal((await api(tokens.cadastrar).post(`/api/andamento/${F.proc}`).send({ descricao: 'Permissão', data: '2026-03-15' })).status, 201);
  assert.equal((await api(tokens.alterar).put(`/api/andamento/${id}`).send({ descricao: 'Permissão editada' })).status, 200);
  assert.equal((await api(tokens.excluir).delete(`/api/andamento/${id}`)).status, 200);
});
