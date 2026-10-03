// Plano de testes de Processos — passo C8 (ver PLANO-TESTES-PROCESSOS.md): o servidor do FINANCEIRO usado na aba Financeiro da pasta.
// Contra MySQL real isolado: conta corrente (extrato, saldo, filtros), lançamento manual (criar, editar campo a campo, excluir,
// histórico), acordo/alvará (entradas inválidas na criação e na edição, cancelar), lançamentos de acordo intocáveis e permissões.
// As regras de recebimento, repasse e multa já têm testes próprios (financeiro-completo).
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
const histLanc = (id) => sql('SELECT acao, campo_alterado, valor_anterior, valor_novo FROM auditoria_conta_corrente WHERE lancamento_id = ? ORDER BY id', [id]);

let seq = 200;
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

const lancBase = (extra = {}) => ({ data: '2026-03-10', descricao: 'Custas do cartório', valor: 150.5, tipo: 'saida', ...extra });
async function lancar(extra = {}, token = admin, proc = F.proc) {
  const r = await api(token).post(`/api/financeiro/processo/${proc}/lancamento`).send(lancBase(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const parcela = (extra = {}) => ({ numero: 1, vencimento: '2026-04-06', valor_bruto: 1000, honor_tipo: 'percent', honor_percentual: 30, ...extra });
const acordoBase = (extra = {}) => ({ descricao: 'Acordo da pasta', valor_total: 1000, qtd_parcelas: 1, data_primeira: '2026-04-06', parcelas: [parcela()], ...extra });
async function novoAcordo(extra = {}, proc = F.proc) {
  const r = await api().post(`/api/financeiro/processo/${proc}/acordo`).send(acordoBase(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const nLanc = () => total('SELECT COUNT(*) AS n FROM conta_corrente');
const nAcordo = () => total('SELECT COUNT(*) AS n FROM acordo');

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6401, 1)')).insertId;
  const proc = async (num, ativo = 1) => (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'PROCESSO FINANCEIRO', 1, 1, ?, 1)", [pasta, num, ativo])).insertId;
  F.proc = await proc('0000041-00.2026.5.15.0001');
  F.outro = await proc('0000042-00.2026.5.15.0001');
  F.inativo = await proc('0000043-00.2026.5.15.0001', 0);
  F.parceiro = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro C8', '11144477735')")).insertId;
});
test.after(async () => pool.end());

test('lançamento: grava (descrição aparada, valor, data), entra no extrato com saldo acumulado e registra "criado" no histórico; sem data vale hoje', async () => {
  const t = juntar();
  const e = await lancar({ tipo: 'entrada', valor: 500, descricao: '  Adiantamento do cliente  ', data: '2026-03-01' });
  const s = await lancar({ tipo: 'saida', valor: 120.25, descricao: 'Cartório', data: '2026-03-05' });
  const semData = await um('SELECT DATE_FORMAT(data, "%Y-%m-%d") AS d FROM conta_corrente WHERE id = ?', [await lancar({ data: undefined, descricao: 'Sem data' })]);
  t.checar(/^\d{4}-\d{2}-\d{2}$/.test(semData.d), `data padrão: ${semData.d}`);
  const l = await um('SELECT descricao, tipo, valor, origem, usuario_id FROM conta_corrente WHERE id = ?', [e]);
  t.checar(l.descricao === 'Adiantamento do cliente' && l.tipo === 'entrada' && Number(l.valor) === 500 && l.origem === 'manual' && l.usuario_id === 1, `gravado: ${JSON.stringify(l)}`);
  const h = await histLanc(e);
  t.checar(h.length === 1 && h[0].acao === 'criado', `histórico: ${JSON.stringify(h)}`);
  const conta = (await api().get(`/api/financeiro/processo/${F.proc}`)).body.dados;
  const dois = conta.lancamentos.filter(x => x.id === e || x.id === s);
  t.checar(dois.length === 2 && dois[0].saldo_acumulado !== undefined, 'extrato');
  const soEsses = (await api().get(`/api/financeiro/processo/${F.proc}?data_de=2026-03-01&data_ate=2026-03-05`)).body.dados;
  t.checar(soEsses.lancamentos.length === 2 && soEsses.saldo_total === 379.75, `filtro por data/saldo: ${soEsses.lancamentos.length} / ${soEsses.saldo_total}`);
  t.fim();
});

test('lançamento: dados de verdade — processo, descrição (300), valor, tipo, data — nada gravado e nunca erro interno', async () => {
  const t = juntar();
  const antes = await nLanc();
  const casos = [
    ['processo texto', { proc: 'abc' }], ['processo negativo', { proc: -1 }], ['processo inexistente', { proc: 999999 }], ['processo excluído (inativo)', { proc: F.inativo }],
    ['descrição vazia', { descricao: '' }], ['descrição só espaços', { descricao: '   ' }], ['descrição número', { descricao: 123 }], ['descrição lista', { descricao: ['x'] }], ['descrição 301', { descricao: 'd'.repeat(301) }],
    ['valor zero', { valor: 0 }], ['valor negativo', { valor: -5 }], ['valor texto', { valor: 'abc' }], ['valor lista', { valor: [5] }], ['valor objeto', { valor: { a: 1 } }],
    ['valor gigante', { valor: 1e20 }], ['valor acima da coluna', { valor: 99999999999999.99 }], ['valor infinito', { valor: 'Infinity' }],
    ['tipo inválido', { tipo: 'transferencia' }], ['tipo número', { tipo: 1 }], ['tipo vazio', { tipo: '' }],
    ['data impossível', { data: '2026-02-30' }], ['data texto', { data: 'ontem' }], ['data número', { data: 20260310 }], ['data lista', { data: ['2026-03-10'] }],
  ];
  for (const [rotulo, extra] of casos) {
    const { proc, ...resto } = extra;
    const r = await api().post(`/api/financeiro/processo/${proc ?? F.proc}/lancamento`).send(lancBase(resto));
    t.checar([400, 404, 422].includes(r.status), `${rotulo} → ${r.status} ${msg(r)} (esperado 400/404/422)`);
  }
  t.checar(await nLanc() === antes, `foram gravados ${await nLanc() - antes} lançamento(s) inválido(s)`);
  t.fim();
});

test('lançamento: editar grava o histórico campo a campo (De → Para), salvar sem mudar não registra nada, descrição aparada; inválidos recusados', async () => {
  const t = juntar();
  const id = await lancar({ descricao: 'Original', valor: 100, tipo: 'saida', data: '2026-03-10' });
  const base = { data: '2026-03-10', descricao: 'Original', valor: 100, tipo: 'saida' };
  t.checar((await api().put(`/api/financeiro/lancamento/${id}`).send({ ...base, descricao: '  Original  ' })).status === 200, 'salvar sem mudar');
  t.checar((await histLanc(id)).length === 1, `salvar sem mudar mexeu no histórico: ${JSON.stringify(await histLanc(id))}`);
  const r = await api().put(`/api/financeiro/lancamento/${id}`).send({ data: '2026-03-12', descricao: ' Novo texto ', valor: 250.1, tipo: 'entrada' });
  t.checar(r.status === 200, `editar → ${r.status} ${msg(r)}`);
  const l = await um('SELECT descricao, valor, tipo, DATE_FORMAT(data, "%Y-%m-%d") AS d FROM conta_corrente WHERE id = ?', [id]);
  t.checar(l.descricao === 'Novo texto' && Number(l.valor) === 250.1 && l.tipo === 'entrada' && l.d === '2026-03-12', `gravado: ${JSON.stringify(l)}`);
  const campos = (await histLanc(id)).filter(x => x.acao === 'editado').map(x => x.campo_alterado).sort();
  t.checar(JSON.stringify(campos) === JSON.stringify(['Data', 'Descrição', 'Tipo', 'Valor']), `campos no histórico: ${campos}`);
  t.checar((await api().put('/api/financeiro/lancamento/999999').send(base)).status === 404, 'inexistente');
  t.checar((await api().put('/api/financeiro/lancamento/abc').send(base)).status === 404, 'id texto');
  for (const [rotulo, extra] of [['descrição vazia', { descricao: '' }], ['descrição número', { descricao: 5 }], ['descrição 301', { descricao: 'd'.repeat(301) }], ['valor zero', { valor: 0 }], ['valor texto', { valor: 'abc' }], ['valor gigante', { valor: 1e20 }], ['tipo inválido', { tipo: 'x' }], ['data impossível', { data: '2026-02-30' }], ['data texto', { data: 'ontem' }], ['data número', { data: 20260310 }]]) {
    const e = await api().put(`/api/financeiro/lancamento/${id}`).send({ data: '2026-03-12', descricao: 'Novo texto', valor: 250.1, tipo: 'entrada', ...extra });
    t.checar([400, 422].includes(e.status), `editar com ${rotulo} → ${e.status} (esperado 400/422)`);
  }
  const depois = await um('SELECT descricao, valor FROM conta_corrente WHERE id = ?', [id]);
  t.checar(depois.descricao === 'Novo texto' && Number(depois.valor) === 250.1, 'edição inválida alterou o lançamento');
  t.fim();
});

test('lançamento: excluir apaga o lançamento e o histórico; inexistente e id texto = 404; lançamento de acordo (recebimento) não edita nem exclui', async () => {
  const t = juntar();
  const id = await lancar({ descricao: 'Para excluir' });
  t.checar((await api().delete(`/api/financeiro/lancamento/${id}`)).status === 200, 'excluir');
  t.checar(await total('SELECT COUNT(*) AS n FROM conta_corrente WHERE id = ?', [id]) === 0 && (await histLanc(id)).length === 0, 'sobrou lançamento ou histórico');
  t.checar((await api().delete(`/api/financeiro/lancamento/${id}`)).status === 404, 'excluir de novo');
  t.checar((await api().delete('/api/financeiro/lancamento/abc')).status === 404, 'id texto');
  const doAcordo = (await sql("INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, origem, usuario_id) VALUES (?, '2026-03-20', 'Recebimento do acordo', 'entrada', 100, 'recebimento', 1)", [F.proc])).insertId;
  const ed = await api().put(`/api/financeiro/lancamento/${doAcordo}`).send(lancBase());
  const ex = await api().delete(`/api/financeiro/lancamento/${doAcordo}`);
  t.checar(ed.status === 400 && ex.status === 400, `lançamento de acordo: editar ${ed.status}, excluir ${ex.status} (esperado 400)`);
  t.checar(await total('SELECT COUNT(*) AS n FROM conta_corrente WHERE id = ?', [doAcordo]) === 1, 'lançamento de acordo foi mexido');
  t.fim();
});

test('lançamento: histórico em ordem, com o nome de quem fez; lançamento inexistente ou id texto = 404 (não "lista vazia")', async () => {
  const t = juntar();
  const id = await lancar({ descricao: 'Com histórico' });
  await api().put(`/api/financeiro/lancamento/${id}`).send(lancBase({ descricao: 'Com histórico', valor: 99 }));
  const r = await api().get(`/api/financeiro/lancamento/${id}/historico`);
  t.checar(r.status === 200 && r.body.dados[0].acao === 'criado' && r.body.dados.every(x => x.usuario_nome), `histórico: ${JSON.stringify(r.body.dados)}`);
  t.checar((await api().get('/api/financeiro/lancamento/999999/historico')).status === 404, 'histórico de inexistente');
  t.checar((await api().get('/api/financeiro/lancamento/abc/historico')).status === 404, 'histórico com id texto');
  t.fim();
});

test('extrato e listas por processo: processo inexistente, excluído ou id texto = 404; datas do filtro inválidas = 400; um processo não vê o lançamento do outro', async () => {
  const t = juntar();
  const meu = await lancar({ descricao: 'Do processo A' });
  await lancar({ descricao: 'Do processo B' }, admin, F.outro);
  const conta = (await api().get(`/api/financeiro/processo/${F.proc}`)).body.dados;
  t.checar(conta.lancamentos.some(l => l.id === meu) && conta.lancamentos.every(l => l.descricao !== 'Do processo B'), 'misturou processos');
  for (const p of ['abc', '-1', '999999', String(F.inativo)]) {
    t.checar((await api().get(`/api/financeiro/processo/${p}`)).status === 404, `extrato do processo ${p}`);
    t.checar((await api().get(`/api/financeiro/processo/${p}/acordos`)).status === 404, `acordos do processo ${p}`);
  }
  t.checar((await api().get(`/api/financeiro/processo/${F.proc}?data_de=2026-02-30`)).status === 400, 'data_de impossível');
  t.checar((await api().get(`/api/financeiro/processo/${F.proc}?data_ate=ontem`)).status === 400, 'data_ate texto');
  t.fim();
});

test('acordo/alvará: criar grava descrição aparada e tipo; entradas inválidas (processo, descrição 300, valores, datas, parcelas, parceria, observação) são recusadas e nada é gravado', async () => {
  const t = juntar();
  const id = await novoAcordo({ descricao: '  Acordo trabalhista  ', tipo: 'alvara' });
  const a = await um('SELECT descricao, tipo, status FROM acordo WHERE id = ?', [id]);
  t.checar(a.descricao === 'Acordo trabalhista' && a.tipo === 'alvara' && a.status === 'ativo', `gravado: ${JSON.stringify(a)}`);
  const antes = await nAcordo();
  const casos = [
    ['processo texto', { proc: 'abc' }], ['processo inexistente', { proc: 999999 }], ['processo excluído', { proc: F.inativo }],
    ['descrição número', { descricao: 5 }], ['descrição lista', { descricao: ['x'] }], ['descrição 301', { descricao: 'd'.repeat(301) }],
    ['valor total texto', { valor_total: 'abc', parcelas: [parcela({ valor_bruto: 1000 })] }], ['valor total lista', { valor_total: [1000] }], ['valor total gigante', { valor_total: 1e20, parcelas: [parcela({ valor_bruto: 1e20 })] }],
    ['parcelas não é lista', { parcelas: 'x' }], ['parcela que não é objeto', { parcelas: [5] }], ['parcela nula', { parcelas: [null] }],
    ['vencimento ausente', { parcelas: [parcela({ vencimento: undefined })] }], ['vencimento impossível', { parcelas: [parcela({ vencimento: '2026-02-30' })] }],
    ['vencimento texto', { parcelas: [parcela({ vencimento: 'amanhã' })] }], ['vencimento número', { parcelas: [parcela({ vencimento: 20260406 })] }],
    ['valor bruto texto', { parcelas: [parcela({ valor_bruto: 'abc' })] }], ['valor bruto negativo', { valor_total: -5, parcelas: [parcela({ valor_bruto: -5 })] }],
    ['observação 301', { parcelas: [parcela({ observacao: 'o'.repeat(301) })] }], ['observação número', { parcelas: [parcela({ observacao: 5 })] }],
    ['honorário 150%', { parcelas: [parcela({ honor_percentual: 150 })] }], ['honorário 1000%', { parcelas: [parcela({ honor_percentual: 1000 })] }], ['honorário texto', { parcelas: [parcela({ honor_percentual: 'abc' })] }],
    ['multa 1000%', { parcelas: [parcela({ multa_percentual: 1000 })] }], ['multa negativa', { parcelas: [parcela({ multa_percentual: -1 })] }],
    ['parceiro inexistente', { parcelas: [parcela({ parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: 999999, parceria_tipo: 'percent', parceria_percentual: 10 })] }],
    ['tipo de pessoa da parceria inválido', { parcelas: [parcela({ parceria_pessoa_tipo: 'outra', parceria_pessoa_id: F.parceiro, parceria_tipo: 'percent', parceria_percentual: 10 })] }],
    ['1000 parcelas', { valor_total: 1000, parcelas: Array.from({ length: 1000 }, (_, i) => parcela({ numero: i + 1, valor_bruto: 1 })) }],
  ];
  for (const [rotulo, extra] of casos) {
    const { proc, ...resto } = extra;
    const r = await api().post(`/api/financeiro/processo/${proc ?? F.proc}/acordo`).send(acordoBase(resto));
    t.checar([400, 404, 422].includes(r.status), `${rotulo} → ${r.status} ${msg(r)} (esperado 400/404/422)`);
  }
  t.checar(await nAcordo() === antes, `foram gravados ${await nAcordo() - antes} acordo(s) inválido(s)`);
  t.fim();
});

test('acordo: prévia recusa entradas absurdas (parcelas demais, valores/datas inválidos) sem travar o servidor', async () => {
  const t = juntar();
  const previa = (extra) => api().post('/api/financeiro/acordo/previa').send({ valor_total: 100, qtd_parcelas: 2, data_primeira: '2026-04-06', ...extra });
  t.checar((await previa({})).status === 200, 'prévia normal');
  for (const [rotulo, extra] of [['10 mil parcelas', { qtd_parcelas: 10000 }], ['parcelas texto', { qtd_parcelas: 'abc' }], ['parcelas decimal', { qtd_parcelas: 2.5 }], ['valor texto', { valor_total: 'abc' }], ['valor gigante', { valor_total: 1e20 }],
    ['data impossível', { data_primeira: '2026-02-30' }], ['data texto', { data_primeira: 'amanhã' }], ['honorário 150%', { honor_percentual: 150 }], ['honorário negativo', { honor_percentual: -1 }], ['multa 1000%', { multa_percentual: 1000 }]]) {
    const r = await previa(extra);
    t.checar([400, 422].includes(r.status), `prévia com ${rotulo} → ${r.status} (esperado 400/422)`);
  }
  t.fim();
});

test('acordo: editar recusa entradas inválidas e não mexe em nada; id texto/inexistente = 404; cancelar exige motivo de verdade (≤300) e grava nas parcelas', async () => {
  const t = juntar();
  const id = await novoAcordo({ descricao: 'Para editar' });
  const atual = (await api().get(`/api/financeiro/acordo/${id}`)).body.dados;
  const pid = atual.parcelas[0].id;
  const corpo = (extra = {}) => ({ descricao: 'Editado', valor_total: 1000, qtd_parcelas: 1, data_primeira: '2026-04-06', parcelas: [{ id: pid, numero: 1, vencimento: '2026-04-06', valor_bruto: 1000, honor_tipo: 'percent', honor_percentual: 30 }], ...extra });
  t.checar((await api().put(`/api/financeiro/acordo/${id}`).send(corpo({ descricao: '  Editado  ' }))).status === 200, 'editar ok');
  t.checar((await um('SELECT descricao FROM acordo WHERE id = ?', [id])).descricao === 'Editado', 'descrição não foi aparada');
  t.checar((await api().put('/api/financeiro/acordo/abc').send(corpo())).status === 404, 'id texto');
  t.checar((await api().put('/api/financeiro/acordo/999999').send(corpo())).status === 404, 'inexistente');
  for (const [rotulo, extra] of [['descrição 301', { descricao: 'd'.repeat(301) }], ['descrição número', { descricao: 5 }], ['valor total texto', { valor_total: 'abc' }],
    ['vencimento impossível', { parcelas: [{ id: pid, numero: 1, vencimento: '2026-02-30', valor_bruto: 1000 }] }], ['vencimento ausente', { parcelas: [{ id: pid, numero: 1, valor_bruto: 1000 }] }],
    ['observação 301', { parcelas: [{ id: pid, numero: 1, vencimento: '2026-04-06', valor_bruto: 1000, observacao: 'o'.repeat(301) }] }],
    ['honorário 1000%', { parcelas: [{ id: pid, numero: 1, vencimento: '2026-04-06', valor_bruto: 1000, honor_tipo: 'percent', honor_percentual: 1000 }] }],
    ['parcela que não é objeto', { parcelas: [5] }]]) {
    const r = await api().put(`/api/financeiro/acordo/${id}`).send(corpo(extra));
    t.checar([400, 404, 422].includes(r.status), `editar com ${rotulo} → ${r.status} ${msg(r)} (esperado 400/404/422)`);
  }
  t.checar((await um('SELECT descricao FROM acordo WHERE id = ?', [id])).descricao === 'Editado', 'edição inválida alterou o acordo');
  for (const motivo of [undefined, '', '   ', 5, ['a'], { a: 1 }, 'm'.repeat(301)]) {
    const r = await api().put(`/api/financeiro/acordo/${id}/cancelar`).send({ motivo });
    t.checar(r.status === 400, `cancelar motivo=${JSON.stringify(motivo)?.slice(0, 15)} → ${r.status} (esperado 400)`);
  }
  t.checar((await um('SELECT status FROM acordo WHERE id = ?', [id])).status === 'ativo', 'motivo inválido cancelou o acordo');
  t.checar((await api().put(`/api/financeiro/acordo/${id}/cancelar`).send({ motivo: '  Réu quitou  ' })).status === 200, 'cancelar');
  const h = await sql("SELECT valor_novo FROM auditoria_parcela WHERE parcela_id = ? AND acao = 'cancelada'", [pid]);
  t.checar(h.length === 1 && h[0].valor_novo === 'Cancelada — Réu quitou', `histórico da parcela: ${JSON.stringify(h)}`);
  t.checar((await api().put('/api/financeiro/acordo/abc/cancelar').send({ motivo: 'x' })).status === 404, 'cancelar id texto');
  t.checar((await api().delete('/api/financeiro/acordo/abc')).status === 404, 'excluir id texto');
  t.checar((await api().get('/api/financeiro/acordo/abc')).status === 404, 'buscar id texto');
  t.fim();
});

test('permissões: sem visualizar/cadastrar/alterar/excluir = 403 em cada ação do financeiro e nada muda', async () => {
  const t = juntar();
  const lid = await lancar({ descricao: 'Protegido' });
  const aid = await novoAcordo({ descricao: 'Protegido' });
  const nada = await criarUsuario('nada', 3, []);
  const ver = await criarUsuario('ver', 3, [['financeiro', null, 'visualizar']]);
  const antes = { l: await nLanc(), a: await nAcordo() };
  t.checar((await api(nada.token).get(`/api/financeiro/processo/${F.proc}`)).status === 403, 'extrato sem permissão');
  t.checar((await api(nada.token).get(`/api/financeiro/processo/${F.proc}/acordos`)).status === 403, 'acordos sem permissão');
  t.checar((await api(ver.token).get(`/api/financeiro/processo/${F.proc}`)).status === 200, 'extrato com visualizar');
  t.checar((await api(ver.token).get(`/api/financeiro/lancamento/${lid}/historico`)).status === 200, 'histórico com visualizar');
  t.checar((await api(ver.token).post(`/api/financeiro/processo/${F.proc}/lancamento`).send(lancBase())).status === 403, 'lançar sem cadastrar');
  t.checar((await api(ver.token).post(`/api/financeiro/processo/${F.proc}/acordo`).send(acordoBase())).status === 403, 'acordo sem cadastrar');
  t.checar((await api(ver.token).put(`/api/financeiro/lancamento/${lid}`).send(lancBase({ valor: 1 }))).status === 403, 'editar sem alterar');
  t.checar((await api(ver.token).put(`/api/financeiro/acordo/${aid}`).send(acordoBase())).status === 403, 'editar acordo sem alterar');
  t.checar((await api(ver.token).put(`/api/financeiro/acordo/${aid}/cancelar`).send({ motivo: 'x' })).status === 403, 'cancelar sem alterar');
  t.checar((await api(ver.token).delete(`/api/financeiro/lancamento/${lid}`)).status === 403, 'excluir lançamento sem excluir');
  t.checar((await api(ver.token).delete(`/api/financeiro/acordo/${aid}`)).status === 403, 'excluir acordo sem excluir');
  t.checar(await nLanc() === antes.l && await nAcordo() === antes.a, 'algo mudou sem permissão');
  t.fim();
});
