// Plano de testes de Processos — passo A3 (ver PLANO-TESTES-PROCESSOS.md).
// Servidor, contra MySQL real isolado: fóruns, varas, tipos, status, instâncias e assuntos — criar, editar, excluir
// (exclusão "suave", sempre com os bloqueios de uso) e as entradas inválidas. Permissões ficam para o passo A4.
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
const BASE = '/api/processos/auxiliares';

const api = () => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${admin}`),
  post: (p, c) => request(app).post(p).set('Authorization', `Bearer ${admin}`).send(c),
  put: (p, c) => request(app).put(p).set('Authorization', `Bearer ${admin}`).send(c),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${admin}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const lista = async (chave) => (await api().get(`${BASE}`)).body.dados[chave];
const auditoria = (tabela, id, acao = 'excluir') => sql('SELECT * FROM logs_auditoria WHERE tabela = ? AND registro_id = ? AND acao = ?', [tabela, id, acao]);
let seq = 0;
// processo "casca" criado direto no banco, para ter o que bloquear a exclusão (pasta 1 do banco de teste)
const novoProc = async (cols = {}) => {
  seq += 1;
  const dados = { pasta_id: 1, numProc: `A3-${seq}`, NomeTituloProc: `PROCESSO A3 ${seq}`, ativo: 1, criado_por: 1, ...cols };
  const nomes = Object.keys(dados);
  return (await sql(`INSERT INTO tblproc (${nomes.join(',')}) VALUES (${nomes.map(() => '?').join(',')})`, Object.values(dados))).insertId;
};

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = jwt.sign({ id: 1, nome: 'Teste 1', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
});
test.after(async () => pool.end());

// ------------------------------------------------------------------ fóruns
test('fórum: criar limpa os campos (CEP só dígitos, UF maiúscula e cortada, vazio vira nulo) e aparece na lista', async () => {
  const r = await api().post(`${BASE}/foruns`, { abrev_nome: '  FCC  ', nome: '  Fórum Cível Central  ', cep: '13.010-111', logradouro: ' Rua das Flores ',
    num_end: ' 100 ', compl_end: '', bairro: ' Centro ', cidade: ' Campinas ', uf: 'sp-extra' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.dados, { id: r.body.dados.id, nome: 'Fórum Cível Central', abrev_nome: 'FCC' });
  const f = await um('SELECT * FROM tblforum WHERE id = ?', [r.body.dados.id]);
  assert.deepEqual({ abrev: f.abrev_nome, nome: f.nome, cep: f.cep, log: f.logradouro, num: f.num_end, compl: f.compl_end, bairro: f.bairro, cidade: f.cidade, uf: f.uf, ativo: f.ativo, criado_por: f.criado_por },
    { abrev: 'FCC', nome: 'Fórum Cível Central', cep: '13010111', log: 'Rua das Flores', num: '100', compl: null, bairro: 'Centro', cidade: 'Campinas', uf: 'SP', ativo: 1, criado_por: 1 });
  assert.ok((await lista('foruns')).some(x => x.id === r.body.dados.id));
  const minimo = await api().post(`${BASE}/foruns`, { nome: 'Só o nome' });                      // só o nome é obrigatório
  assert.equal(minimo.status, 201);
  assert.equal((await um('SELECT cep, uf, abrev_nome FROM tblforum WHERE id = ?', [minimo.body.dados.id])).uf, null);
});

test('fórum: nome obrigatório (vazio, só espaços, ausente, não é texto) e campos longos demais dão aviso de cliente, nunca erro interno', async () => {
  for (const ruim of [{}, { nome: '' }, { nome: '   ' }, { nome: null }, { nome: 123 }, { nome: ['x'] }, { nome: { a: 1 } }]) {
    const r = await api().post(`${BASE}/foruns`, ruim);
    assert.equal(r.status, 400, `${JSON.stringify(ruim)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), /Nome é obrigatório/);
  }
  for (const longo of [{ nome: 'N'.repeat(151) }, { nome: 'ok', abrev_nome: 'A'.repeat(51) }, { nome: 'ok', cep: '1'.repeat(9) }, { nome: 'ok', num_end: '1'.repeat(12) },
    { nome: 'ok', cidade: 'C'.repeat(101) }, { nome: 'ok', logradouro: 'L'.repeat(301) }]) {
    const r = await api().post(`${BASE}/foruns`, longo);
    assert.equal(r.status, 400, `${Object.keys(longo)} longo → ${r.status} ${JSON.stringify(r.body)}`);
    assert.doesNotMatch(JSON.stringify(r.body), /ER_|SQLSTATE|Data too long/i);
  }
});

test('fórum: editar substitui tudo (campos vazios viram nulo); 404 para inexistente e excluído; nome obrigatório', async () => {
  const { id } = (await api().post(`${BASE}/foruns`, { nome: 'Fórum Original', cidade: 'Santos', uf: 'SP', cep: '11000000' })).body.dados;
  const r = await api().put(`${BASE}/foruns/${id}`, { nome: ' Fórum Editado ', abrev_nome: 'FE', uf: 'rj' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const f = await um('SELECT * FROM tblforum WHERE id = ?', [id]);
  assert.deepEqual({ nome: f.nome, abrev: f.abrev_nome, uf: f.uf, cidade: f.cidade, cep: f.cep, alt: f.alterado_por }, { nome: 'Fórum Editado', abrev: 'FE', uf: 'RJ', cidade: null, cep: null, alt: 1 });
  assert.equal((await api().put(`${BASE}/foruns/${id}`, { nome: '  ' })).status, 400);
  assert.equal((await api().put(`${BASE}/foruns/999999`, { nome: 'x' })).status, 404);
  assert.equal((await api().put(`${BASE}/foruns/abc`, { nome: 'x' })).status, 404);
  assert.equal((await api().put(`${BASE}/foruns/${id}`, { nome: 'N'.repeat(151) })).status, 400);
  assert.equal((await api().delete(`${BASE}/foruns/${id}`)).status, 200);
  assert.equal((await api().put(`${BASE}/foruns/${id}`, { nome: 'revive' })).status, 404);      // excluído não é editável
});

test('fórum: excluir é bloqueado enquanto houver vara ativa (com a lista), liberado depois, deixa auditoria e some da lista', async () => {
  const forum = (await api().post(`${BASE}/foruns`, { nome: 'Fórum com varas' })).body.dados.id;
  const v1 = (await api().post(`${BASE}/varas`, { nome: '1ª Vara', forum_id: forum })).body.dados.id;
  const v2 = (await api().post(`${BASE}/varas`, { nome: '2ª Vara', forum_id: forum })).body.dados.id;
  const bloqueio = await api().delete(`${BASE}/foruns/${forum}`);
  assert.equal(bloqueio.status, 400);
  assert.match(msg(bloqueio), /possui 2 vara\(s\) vinculada\(s\)/);
  assert.deepEqual(bloqueio.body.detalhes.varas, ['1ª Vara', '2ª Vara']);
  assert.equal((await um('SELECT ativo FROM tblforum WHERE id = ?', [forum])).ativo, 1);
  await api().delete(`${BASE}/varas/${v1}`);
  assert.match(msg(await api().delete(`${BASE}/foruns/${forum}`)), /possui 1 vara/);
  await api().delete(`${BASE}/varas/${v2}`);
  const ok = await api().delete(`${BASE}/foruns/${forum}`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await um('SELECT ativo FROM tblforum WHERE id = ?', [forum])).ativo, 0);          // exclusão suave: a linha continua
  assert.equal((await auditoria('tblforum', forum)).length, 1);
  assert.ok(!(await lista('foruns')).some(x => x.id === forum));
});

test('excluir fórum, vara, tipo, instância, status e assunto que NÃO existem (ou já foram excluídos) dá 404, sem registrar auditoria falsa', async () => {
  for (const rota of ['foruns', 'varas', 'tipos', 'instancias', 'status', 'assuntos']) {
    const r = await api().delete(`${BASE}/${rota}/999999`);
    assert.equal(r.status, 404, `${rota} inexistente → ${r.status} ${JSON.stringify(r.body)}`);
    assert.equal(await total('SELECT COUNT(*) AS n FROM logs_auditoria WHERE registro_id = 999999 AND acao = ?', ['excluir']), 0, `${rota}: auditoria de algo que não existe`);
  }
  const t = (await api().post(`${BASE}/tipos`, { nome: 'Tipo que será excluído 2x' })).body.dados.id;
  assert.equal((await api().delete(`${BASE}/tipos/${t}`)).status, 200);
  assert.equal((await api().delete(`${BASE}/tipos/${t}`)).status, 404, 'excluir de novo um tipo já excluído');
  assert.equal((await auditoria('tbltipoproc', t)).length, 1);                                    // uma exclusão, uma auditoria
});

// ------------------------------------------------------------------ varas
test('vara: criar e editar (limpa campos), fórum obrigatório e existente, mudar de fórum, 404', async () => {
  const f1 = (await api().post(`${BASE}/foruns`, { nome: 'Fórum A' })).body.dados.id;
  const f2 = (await api().post(`${BASE}/foruns`, { nome: 'Fórum B' })).body.dados.id;
  const r = await api().post(`${BASE}/varas`, { abrev_nome: ' 1ªVT ', nome: ' 1ª Vara do Trabalho ', forum_id: f1, codVaraNoProc: ' 0001 ', compl_end: ' 2º andar ', tel: ' (19) 3333-4444 ', email: ' vara@example.invalid ' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const v = await um('SELECT * FROM tblvara WHERE id = ?', [r.body.dados.id]);
  assert.deepEqual({ abrev: v.abrev_nome, nome: v.nome, forum: v.forum_id, cod: v.codVaraNoProc, compl: v.compl_end, tel: v.tel, email: v.email, ativo: v.ativo },
    { abrev: '1ªVT', nome: '1ª Vara do Trabalho', forum: f1, cod: '0001', compl: '2º andar', tel: '(19) 3333-4444', email: 'vara@example.invalid', ativo: 1 });
  assert.ok((await lista('varas')).some(x => x.id === r.body.dados.id && x.forum_nome === 'Fórum A'));
  for (const ruim of [{}, { nome: 'sem fórum' }, { forum_id: f1 }, { nome: '   ', forum_id: f1 }, { nome: 123, forum_id: f1 }]) {
    const e = await api().post(`${BASE}/varas`, ruim);
    assert.equal(e.status, 400, JSON.stringify(ruim)); assert.match(msg(e), /Nome e fórum são obrigatórios/);
  }
  const inexistente = await api().post(`${BASE}/varas`, { nome: 'Vara órfã', forum_id: 999999 });
  assert.equal(inexistente.status, 409); assert.match(msg(inexistente), /não existe mais.*Recarregue a tela/);
  assert.equal(await total("SELECT COUNT(*) AS n FROM tblvara WHERE nome = 'Vara órfã'"), 0);
  for (const longo of [{ nome: 'N'.repeat(151) }, { codVaraNoProc: 'C'.repeat(16) }, { email: 'e'.repeat(101) }, { tel: 't'.repeat(51) }, { compl_end: 'c'.repeat(101) }]) {
    const e = await api().post(`${BASE}/varas`, { nome: 'Vara longa', forum_id: f1, ...longo });
    assert.equal(e.status, 400, `${Object.keys(longo)} longo → ${e.status}`); assert.doesNotMatch(JSON.stringify(e.body), /ER_|SQLSTATE|Data too long/i);
  }
  // editar: muda de fórum e esvazia campos
  const ed = await api().put(`${BASE}/varas/${r.body.dados.id}`, { nome: 'Vara Editada', forum_id: f2 });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  const v2 = await um('SELECT * FROM tblvara WHERE id = ?', [r.body.dados.id]);
  assert.deepEqual({ nome: v2.nome, forum: v2.forum_id, cod: v2.codVaraNoProc, tel: v2.tel, alt: v2.alterado_por }, { nome: 'Vara Editada', forum: f2, cod: null, tel: null, alt: 1 });
  assert.equal((await api().put(`${BASE}/varas/${r.body.dados.id}`, { nome: 'x' })).status, 400);                 // fórum obrigatório também ao editar
  assert.equal((await api().put(`${BASE}/varas/${r.body.dados.id}`, { nome: 'x', forum_id: 999999 })).status, 409);
  assert.equal((await api().put(`${BASE}/varas/999999`, { nome: 'x', forum_id: f1 })).status, 404);
});

test('vara: não pode ser criada nem movida para um fórum já excluído', async () => {
  const morto = (await api().post(`${BASE}/foruns`, { nome: 'Fórum que será excluído' })).body.dados.id;
  const vivo = (await api().post(`${BASE}/foruns`, { nome: 'Fórum vivo' })).body.dados.id;
  await api().delete(`${BASE}/foruns/${morto}`);
  const nova = await api().post(`${BASE}/varas`, { nome: 'Vara em fórum excluído', forum_id: morto });
  assert.ok(nova.status >= 400 && nova.status < 500, `criou vara num fórum excluído (${nova.status})`);
  const v = (await api().post(`${BASE}/varas`, { nome: 'Vara viva', forum_id: vivo })).body.dados.id;
  const mover = await api().put(`${BASE}/varas/${v}`, { nome: 'Vara viva', forum_id: morto });
  assert.ok(mover.status >= 400 && mover.status < 500, `moveu a vara para um fórum excluído (${mover.status})`);
  assert.equal((await um('SELECT forum_id FROM tblvara WHERE id = ?', [v])).forum_id, vivo);
});

test('vara: excluir é bloqueada por processo ativo e por audiência; processo inativo não bloqueia; auditoria; some da lista', async () => {
  const forum = (await api().post(`${BASE}/foruns`, { nome: 'Fórum das varas' })).body.dados.id;
  const vara = (await api().post(`${BASE}/varas`, { nome: 'Vara em uso', forum_id: forum })).body.dados.id;
  const proc = await novoProc({ vara_id: vara, numProc: 'A3-VARA-1' });
  const comProcesso = await api().delete(`${BASE}/varas/${vara}`);
  assert.equal(comProcesso.status, 400); assert.match(msg(comProcesso), /possui 1 processo\(s\) vinculado\(s\)/);
  assert.deepEqual(comProcesso.body.detalhes.processos, ['A3-VARA-1']);
  assert.equal((await um('SELECT ativo FROM tblvara WHERE id = ?', [vara])).ativo, 1);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [proc]);                                  // processo inativo não impede
  const aud = (await sql("INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, criado_por, vara_id) VALUES (?, 1, '2026-01-05', '10:00:00', 1, ?)", [proc, vara])).insertId;
  const comAudiencia = await api().delete(`${BASE}/varas/${vara}`);
  assert.equal(comAudiencia.status, 400); assert.match(msg(comAudiencia), /vinculada a 1 audiência\(s\)/);
  await sql('DELETE FROM audiencia WHERE id = ?', [aud]);
  const ok = await api().delete(`${BASE}/varas/${vara}`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await um('SELECT ativo FROM tblvara WHERE id = ?', [vara])).ativo, 0);
  assert.equal((await auditoria('tblvara', vara)).length, 1);
  assert.ok(!(await lista('varas')).some(x => x.id === vara));
  assert.equal((await um('SELECT vara_id FROM tblproc WHERE id = ?', [proc])).vara_id, vara);     // o processo inativo mantém o vínculo (sem órfão)
});

// ------------------------------------------------------------------ tipos e instâncias (só nome)
for (const [rotulo, rota, tabela, coluna, singular] of [['tipo', 'tipos', 'tbltipoproc', 'tipo_id', 'Tipo'], ['instância', 'instancias', 'tblinstanciaproc', 'instancia_id', 'Instância']]) {
  test(`${rotulo}: criar, nome obrigatório (vazio, só espaços, não é texto), nome longo, editar, 404 e lista`, async () => {
    const r = await api().post(`${BASE}/${rota}`, { nome: `  ${singular} de Teste  ` });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.dados, { id: r.body.dados.id, nome: `${singular} de Teste` });
    assert.equal((await um(`SELECT nome, ativo, criado_por FROM ${tabela} WHERE id = ?`, [r.body.dados.id])).nome, `${singular} de Teste`);
    const chave = rota === 'tipos' ? 'tipos' : 'instancias';
    assert.ok((await lista(chave)).some(x => x.id === r.body.dados.id));
    for (const ruim of [{}, { nome: '' }, { nome: '   ' }, { nome: null }, { nome: 123 }, { nome: ['x'] }]) {
      const e = await api().post(`${BASE}/${rota}`, ruim);
      assert.equal(e.status, 400, `${rotulo} ${JSON.stringify(ruim)} → ${e.status} ${JSON.stringify(e.body)}`);
      assert.match(msg(e), /Nome é obrigatório/);
    }
    assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE TRIM(nome) = ''`), 0, `${rotulo} com nome vazio gravado`);
    const longo = await api().post(`${BASE}/${rota}`, { nome: 'N'.repeat(101) });
    assert.equal(longo.status, 400, `nome com 101 caracteres → ${longo.status}`); assert.doesNotMatch(JSON.stringify(longo.body), /ER_|SQLSTATE|Data too long/i);
    // editar
    const ed = await api().put(`${BASE}/${rota}/${r.body.dados.id}`, { nome: ` ${singular} Editado ` });
    assert.equal(ed.status, 200); assert.equal((await um(`SELECT nome FROM ${tabela} WHERE id = ?`, [r.body.dados.id])).nome, `${singular} Editado`);
    for (const ruim of [{}, { nome: '  ' }, { nome: 5 }, { nome: 'N'.repeat(101) }]) assert.equal((await api().put(`${BASE}/${rota}/${r.body.dados.id}`, ruim)).status, 400, JSON.stringify(ruim));
    assert.equal((await api().put(`${BASE}/${rota}/999999`, { nome: 'x' })).status, 404);
    assert.equal((await api().put(`${BASE}/${rota}/abc`, { nome: 'x' })).status, 404);
  });

  test(`${rotulo}: não aceita nome repetido (ignorando maiúscula e espaços) entre os ativos; depois de excluir, o nome pode ser usado de novo`, async () => {
    const a = await api().post(`${BASE}/${rota}`, { nome: `${singular} Único` });
    assert.equal(a.status, 201);
    for (const igual of [`${singular} Único`, `  ${singular} Único  `, `${singular.toUpperCase()} ÚNICO`]) {
      const dup = await api().post(`${BASE}/${rota}`, { nome: igual });
      assert.equal(dup.status, 400, `${JSON.stringify(igual)} duplicado foi aceito (${dup.status})`); assert.match(msg(dup), /Já existe/);
    }
    const outro = (await api().post(`${BASE}/${rota}`, { nome: `${singular} Outro` })).body.dados.id;
    assert.equal((await api().put(`${BASE}/${rota}/${outro}`, { nome: `${singular} Único` })).status, 400, 'renomear para um nome já existente');
    assert.equal((await api().put(`${BASE}/${rota}/${a.body.dados.id}`, { nome: `${singular} Único` })).status, 200);   // o próprio nome não conta como repetido
    assert.equal((await api().delete(`${BASE}/${rota}/${a.body.dados.id}`)).status, 200);
    assert.equal((await api().post(`${BASE}/${rota}`, { nome: `${singular} Único` })).status, 201);                     // livre de novo
  });

  test(`${rotulo}: excluir é bloqueado por processo ATIVO, liberado quando só há processo inativo, com auditoria e sem órfão`, async () => {
    const id = (await api().post(`${BASE}/${rota}`, { nome: `${singular} em uso` })).body.dados.id;
    const proc = await novoProc({ [coluna]: id });
    const bloqueio = await api().delete(`${BASE}/${rota}/${id}`);
    assert.equal(bloqueio.status, 400); assert.match(msg(bloqueio), /vinculado a 1 processo\(s\) ativo\(s\)/);
    assert.equal((await um(`SELECT ativo FROM ${tabela} WHERE id = ?`, [id])).ativo, 1);
    await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [proc]);
    const ok = await api().delete(`${BASE}/${rota}/${id}`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await um(`SELECT ativo FROM ${tabela} WHERE id = ?`, [id])).ativo, 0);
    assert.equal((await auditoria(tabela, id)).length, 1);
    assert.ok(!(await lista(rota === 'tipos' ? 'tipos' : 'instancias')).some(x => x.id === id));
    assert.equal((await um(`SELECT ${coluna} AS v FROM tblproc WHERE id = ?`, [proc])).v, id);        // o processo inativo mantém o vínculo
  });
}

// ------------------------------------------------------------------ status
test('status: criar (com e sem "encerra o processo"), nome obrigatório e longo, editar nome/flag, 404', async () => {
  const a = await api().post(`${BASE}/status`, { nome: ' Em andamento A3 ' });
  assert.equal(a.status, 201); assert.deepEqual(a.body.dados, { id: a.body.dados.id, nome: 'Em andamento A3', encerra_processo: 0 });
  for (const [valor, esperado] of [[true, 1], ['1', 1], ['true', 1], [1, 1], [false, 0], ['0', 0], ['false', 0], ['qualquer', 0], ['', 0]]) {
    const r = await api().post(`${BASE}/status`, { nome: `Status flag ${String(valor)}-${esperado}`, encerra_processo: valor });
    assert.equal(r.status, 201); assert.equal(r.body.dados.encerra_processo, esperado, `encerra_processo=${JSON.stringify(valor)}`);
  }
  for (const ruim of [{}, { nome: '' }, { nome: '   ' }, { nome: null }]) {
    const e = await api().post(`${BASE}/status`, ruim); assert.equal(e.status, 400, JSON.stringify(ruim)); assert.match(msg(e), /Nome é obrigatório/);
  }
  const longo = await api().post(`${BASE}/status`, { nome: 'N'.repeat(101) });
  assert.equal(longo.status, 400, `status com 101 caracteres → ${longo.status}`); assert.doesNotMatch(JSON.stringify(longo.body), /ER_|SQLSTATE|Data too long/i);
  const id = a.body.dados.id;
  assert.equal((await api().put(`${BASE}/status/${id}`, { nome: 'Em andamento A3', encerra_processo: true })).status, 200);   // só a marcação muda
  assert.equal((await um('SELECT encerra_processo FROM tblstatusproc WHERE id = ?', [id])).encerra_processo, 1);
  assert.equal((await api().put(`${BASE}/status/${id}`, { nome: 'Renomeado A3' })).status, 200);                             // sem enviar a marcação: preserva
  const s = await um('SELECT nome, encerra_processo FROM tblstatusproc WHERE id = ?', [id]);
  assert.deepEqual([s.nome, s.encerra_processo], ['Renomeado A3', 1]);
  assert.equal((await auditoria('tblstatusproc', id, 'alterar')).length, 2);
  assert.equal((await api().put(`${BASE}/status/${id}`, { nome: '' })).status, 400);
  assert.equal((await api().put(`${BASE}/status/999999`, { nome: 'x' })).status, 404);
});

test('status: nome repetido entre os ativos é recusado (criar e renomear); o nome de um status excluído pode voltar', async () => {
  const a = await api().post(`${BASE}/status`, { nome: 'Status Único A3' });
  assert.equal(a.status, 201);
  const dup = await api().post(`${BASE}/status`, { nome: ' status único a3 ' });
  assert.equal(dup.status, 400, `status duplicado foi aceito (${dup.status})`); assert.match(msg(dup), /Já existe/);
  const outro = (await api().post(`${BASE}/status`, { nome: 'Status Outro A3' })).body.dados.id;
  assert.equal((await api().put(`${BASE}/status/${outro}`, { nome: 'Status Único A3' })).status, 400, 'renomear para nome já existente');
  assert.equal((await api().delete(`${BASE}/status/${a.body.dados.id}`)).status, 200);
  assert.equal((await api().post(`${BASE}/status`, { nome: 'Status Único A3' })).status, 201);
});

test('status: renomear e excluir são bloqueados se há processo ativo OU etiqueta do escritório; o "encerra" muda mesmo em uso; livre exclui com auditoria', async () => {
  const st = (await api().post(`${BASE}/status`, { nome: 'Status em uso A3' })).body.dados.id;
  const proc = await novoProc({ status_id: st });
  const renomear = await api().put(`${BASE}/status/${st}`, { nome: 'Outro nome A3' });
  assert.equal(renomear.status, 400); assert.match(msg(renomear), /Não é possível renomear — este status está em uso por 1 processo\(s\) ativo\(s\)/);
  assert.equal((await api().put(`${BASE}/status/${st}`, { nome: 'Status em uso A3', encerra_processo: true })).status, 200);   // a marcação pode mudar em uso
  const excluir = await api().delete(`${BASE}/status/${st}`);
  assert.equal(excluir.status, 400); assert.match(msg(excluir), /Não é possível excluir — este status está em uso por 1 processo\(s\) ativo\(s\)/);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [proc]);
  await sql("INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado, status_id) VALUES ('processos', 1, '#2563eb', 'Teste A3', ?)", [st]);
  const comEtiqueta = await api().delete(`${BASE}/status/${st}`);
  assert.equal(comEtiqueta.status, 400); assert.match(msg(comEtiqueta), /1 etiqueta\(s\) do escritório/);
  assert.match(msg(await api().put(`${BASE}/status/${st}`, { nome: 'Outro nome A3' })), /1 etiqueta\(s\) do escritório/);
  await sql("DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = 'processos' AND slot = 1");
  const ok = await api().delete(`${BASE}/status/${st}`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await um('SELECT ativo FROM tblstatusproc WHERE id = ?', [st])).ativo, 0);
  assert.equal((await auditoria('tblstatusproc', st)).length, 1);
  assert.ok(!(await lista('status')).some(x => x.id === st));
  assert.equal((await um('SELECT status_id FROM tblproc WHERE id = ?', [proc])).status_id, st);
});

// ------------------------------------------------------------------ assuntos
test('assunto: criar, nome obrigatório e longo, repetido recusado, editar, 404 e lista', async () => {
  const a = await api().post(`${BASE}/assuntos`, { nome: '  Horas extras A3  ' });
  assert.equal(a.status, 201, JSON.stringify(a.body)); assert.deepEqual(a.body.dados, { id: a.body.dados.id, nome: 'Horas extras A3' });
  assert.ok((await lista('assuntos')).some(x => x.id === a.body.dados.id));
  for (const ruim of [{}, { nome: '' }, { nome: '   ' }, { nome: null }, { nome: 123 }]) {
    const e = await api().post(`${BASE}/assuntos`, ruim); assert.equal(e.status, 400, `${JSON.stringify(ruim)} → ${e.status} ${JSON.stringify(e.body)}`); assert.match(msg(e), /Nome é obrigatório/);
  }
  const longo = await api().post(`${BASE}/assuntos`, { nome: 'N'.repeat(151) });
  assert.equal(longo.status, 400, `assunto com 151 caracteres → ${longo.status}`); assert.doesNotMatch(JSON.stringify(longo.body), /ER_|SQLSTATE|Data too long/i);
  const dup = await api().post(`${BASE}/assuntos`, { nome: 'Horas extras A3' });
  assert.equal(dup.status, 400); assert.match(msg(dup), /Já existe um assunto cadastrado com este nome/);
  const outro = (await api().post(`${BASE}/assuntos`, { nome: 'Rescisão A3' })).body.dados.id;
  const dupEd = await api().put(`${BASE}/assuntos/${outro}`, { nome: 'Horas extras A3' });
  assert.equal(dupEd.status, 400); assert.match(msg(dupEd), /Já existe um assunto/);
  assert.equal((await api().put(`${BASE}/assuntos/${outro}`, { nome: ' Rescisão Editada A3 ' })).status, 200);
  assert.equal((await um('SELECT nome FROM tblassuntoproc WHERE id = ?', [outro])).nome, 'Rescisão Editada A3');
  for (const ruim of [{}, { nome: '  ' }, { nome: 'N'.repeat(151) }]) assert.equal((await api().put(`${BASE}/assuntos/${outro}`, ruim)).status, 400, JSON.stringify(ruim));
  assert.equal((await api().put(`${BASE}/assuntos/999999`, { nome: 'x' })).status, 404);
});

test('assunto: excluir é bloqueado por QUALQUER vínculo com processo (inclusive inativo), liberado sem vínculo, e o nome pode ser usado de novo', async () => {
  const id = (await api().post(`${BASE}/assuntos`, { nome: 'Assunto vinculado A3' })).body.dados.id;
  const proc = await novoProc();
  await sql('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [proc, id]);
  const bloqueio = await api().delete(`${BASE}/assuntos/${id}`);
  assert.equal(bloqueio.status, 400); assert.match(msg(bloqueio), /vinculado a 1 processo\(s\)/);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [proc]);
  assert.equal((await api().delete(`${BASE}/assuntos/${id}`)).status, 400);                         // o vínculo com processo inativo também protege (sem órfão)
  await sql('DELETE FROM processo_assunto WHERE processo_id = ?', [proc]);
  const ok = await api().delete(`${BASE}/assuntos/${id}`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await um('SELECT ativo FROM tblassuntoproc WHERE id = ?', [id])).ativo, 0);
  assert.equal((await auditoria('tblassuntoproc', id)).length, 1);
  assert.ok(!(await lista('assuntos')).some(x => x.id === id));
  const denovo = await api().post(`${BASE}/assuntos`, { nome: 'Assunto vinculado A3' });          // o nome de um assunto excluído volta a poder ser usado
  assert.equal(denovo.status, 201, `recriar o assunto excluído → ${denovo.status} ${JSON.stringify(denovo.body)}`);
});
