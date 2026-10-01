// Relatórios (Fase 2) — agrupar, totalizar, detalhe do grupo, perguntas e Excel agrupado, contra MySQL real.
// Cada número da API é conferido contra uma consulta escrita à mão (o "gabarito").
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

let app; let admin; let usuario; let chefe;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };
const receita = (extra = {}) => ({ assunto: 'prazos', colunas: ['pasta', 'descricao'], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });
const rodar = async (t, corpo) => req(t).post('/api/relatorios/executar').send(corpo);
const linhas = (r, tipo) => r.body.dados.linhas.filter(l => l.tipo === tipo);

// vencimento, responsável, quantidade, status
const PRAZOS = [
  ['2026-01-04', 1, 5, 'aberto'], ['2026-01-10', 1, 10, 'concluido'], ['2026-01-11', 2, 15, 'aberto'], ['2026-01-12', 2, null, 'aberto'],
  ['2026-02-03', null, 20, 'cancelado'], ['2026-02-03', null, 30, 'aberto'], ['2027-03-15', 4, 7, 'aberto'], ['2027-03-16', 4, 7, 'aberto'],
];

test.before(async () => {
  await recriarBancoTeste();
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (4, 'Chefe de Testes', 'chefeteste', 'x', 'chefe@example.invalid', 'advogado', 2, 1, 0, 'sessao-chefe', 0, 0)`);
  const conn = await conectarBancoTeste();
  try {
    await conn.query('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES ?', [[
      [4, 'prazos', null, 'visualizar', 1], [4, 'tarefas', null, 'visualizar', 1], [4, 'relatorios', null, 'visualizar', 1],
      [4, 'prazos', 'ver_todos', 'visualizar', 1], [4, 'relatorios', 'criar', 'cadastrar', 1]]]);
  } finally { await conn.end(); }
  for (const [venc, resp, qtd, status] of PRAZOS) {
    await sql('INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, delegado_para, criado_por, quantidade, status, descricao) VALUES (1, ?, ?, ?, 1, ?, ?, ?)',
      ['2026-01-01', venc, resp, qtd, status, 'x']);
  }
  await sql("INSERT INTO tarefas (titulo, atribuida_para, data_vencimento, criado_por, concluida) VALUES ('t1', 2, '2026-03-01', 1, 1), ('t2', 2, '2026-03-02', 1, 0), ('t3', NULL, '2026-03-03', 1, 0)");
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); chefe = token(4, 2, 'sessao-chefe');
});
test.after(async () => pool.end());

test('agrupar por responsável: contagens iguais ao gabarito, "(sem valor)" para o escritório e total geral', async () => {
  const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }] }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.modo, 'agrupado');
  const gabarito = await sql('SELECT delegado_para AS k, COUNT(*) AS n FROM prazos_processo GROUP BY delegado_para');
  const doApi = Object.fromEntries(linhas(r, 'grupo').map(l => [String(l.chaves[0]), l.valores[0]]));
  assert.deepEqual(doApi, Object.fromEntries(gabarito.map(g => [String(g.k), Number(g.n)])));
  assert.deepEqual(linhas(r, 'grupo').map(l => l.rotulos[0]), ['Administrador de Testes', 'Chefe de Testes', 'Usuário de Testes', '(sem valor)']);
  assert.equal(linhas(r, 'total')[0].valores[0], 8);
  assert.deepEqual(r.body.dados.colunas.metricas.map(m => m.rotulo), ['Quantidade']);
});

test('dois níveis: subtotal de cada bloco = soma dos filhos; total geral = soma dos subtotais', async () => {
  const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }, { campo: 'status' }],
    metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'quantidade' }] }) });
  assert.equal(r.status, 200);
  const todas = r.body.dados.linhas;
  const subtotais = todas.filter(l => l.tipo === 'subtotal');
  assert.equal(subtotais.length, 4);
  for (const s of subtotais) {
    const filhos = todas.filter(l => l.tipo === 'grupo' && l.chaves[0] === s.chaves[0]);
    assert.equal(filhos.reduce((a, f) => a + f.valores[0], 0), s.valores[0]);
    assert.equal(filhos.reduce((a, f) => a + (f.valores[1] ?? 0), 0), s.valores[1] ?? 0);
  }
  const total = linhas(r, 'total')[0];
  assert.deepEqual(total.valores, [8, 94]);                      // 5+10+15+20+30+7+7 = 94 (NULL não soma)
  assert.equal(subtotais.reduce((a, s) => a + s.valores[0], 0), 8);
  // cada subtotal vem logo depois do último filho do seu bloco
  const tipos = todas.map(l => l.tipo);
  assert.equal(tipos.at(-1), 'total');
  assert.ok(tipos.every((t, i) => t !== 'grupo' || tipos.slice(i).includes('subtotal')));
});

test('totais: soma, média (ignora vazios), mínimo e máximo — por grupo e no total, iguais ao gabarito', async () => {
  const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }],
    metricas: [{ funcao: 'soma', campo: 'quantidade' }, { funcao: 'media', campo: 'quantidade' }, { funcao: 'minimo', campo: 'quantidade' },
      { funcao: 'maximo', campo: 'vencimento' }, { funcao: 'minimo', campo: 'vencimento' }] }) });
  assert.equal(r.status, 200);
  const g = await sql('SELECT delegado_para AS k, SUM(quantidade) s, ROUND(AVG(quantidade), 2) a, MIN(quantidade) mn, MAX(data_vencimento) mx, MIN(data_vencimento) md FROM prazos_processo GROUP BY delegado_para');
  for (const linha of linhas(r, 'grupo')) {
    const esperado = g.find(x => String(x.k) === String(linha.chaves[0]));
    assert.deepEqual(linha.valores, [esperado.s === null ? null : Number(esperado.s), esperado.a === null ? null : Number(esperado.a),
      esperado.mn === null ? null : Number(esperado.mn), esperado.mx, esperado.md]);
  }
  const [t] = await sql('SELECT SUM(quantidade) s, ROUND(AVG(quantidade), 2) a FROM prazos_processo');
  assert.deepEqual(linhas(r, 'total')[0].valores.slice(0, 2), [Number(t.s), Number(t.a)]);
  assert.equal(r.body.dados.colunas.metricas[3].rotulo, 'Máximo de Vencimento');
});

test('datas: dia, semana (domingo a sábado), mês e ano', async () => {
  const por = async (passo) => {
    const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'vencimento', passo }] }) });
    assert.equal(r.status, 200);
    return Object.fromEntries(linhas(r, 'grupo').map(l => [l.chaves[0], l.valores[0]]));
  };
  assert.deepEqual(await por('mes'), { '2026-01': 4, '2026-02': 2, '2027-03': 2 });
  assert.deepEqual(await por('ano'), { 2026: 6, 2027: 2 });
  // 04/01/2026 é domingo: 04..10/01 formam uma semana (itens 1 e 2); 11/01 abre outra (itens 3 e 4)
  assert.deepEqual(await por('semana'), { '2026-01-04': 2, '2026-01-11': 2, '2026-02-01': 2, '2027-03-14': 2 });
  assert.equal(Object.keys(await por('dia')).length, 7);
  const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'vencimento', passo: 'semana' }] }) });
  assert.equal(linhas(r, 'grupo')[0].rotulos[0], 'Semana de 04/01/2026');
});

test('detalhe do grupo: devolve exatamente os itens contados, com páginas', async () => {
  const base = receita({ colunas: ['descricao', 'vencimento', 'responsavel'], agrupar: [{ campo: 'responsavel' }, { campo: 'vencimento', passo: 'mes' }] });
  const grupos = await rodar(admin, { receita: base });
  for (const g of linhas(grupos, 'grupo')) {
    const d = await rodar(admin, { receita: base, grupo: g.chaves, limite: 200 });
    assert.equal(d.status, 200);
    assert.equal(d.body.dados.total, g.valores[0], `grupo ${g.rotulos.join('/')}`);
    assert.equal(d.body.dados.linhas.length, g.valores[0]);
    assert.ok(d.body.dados.linhas.every(l => l.vencimento.startsWith(g.chaves[1])));
  }
  const pag = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }] }), grupo: [null], limite: 1, pagina: 2 });
  assert.equal(pag.body.dados.total, 2);
  assert.equal(pag.body.dados.linhas.length, 1);
  // o detalhe respeita os filtros do relatório
  const filtrado = receita({ colunas: ['descricao'], agrupar: [{ campo: 'responsavel' }], filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: ['cancelado'] }] } });
  assert.equal((await rodar(admin, { receita: filtrado, grupo: [null] })).body.dados.total, 1);
  assert.equal((await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }] }), grupo: ['1; DROP TABLE x'] })).status, 200); // vira parâmetro: só não acha nada
  assert.equal((await rodar(admin, { receita: receita({ agrupar: [{ campo: 'responsavel' }] }), grupo: [{ a: 1 }] })).status, 422);
  assert.equal((await rodar(admin, { receita: receita(), grupo: [1] })).status, 422);          // sem agrupamento não há grupo
  assert.equal((await sql('SELECT COUNT(*) AS n FROM prazos_processo'))[0].n, 8);
});

test('visibilidade no agrupamento: quem não tem "ver todos" só conta o que já pode ver', async () => {
  const corpo = { receita: receita({ agrupar: [{ campo: 'responsavel' }] }) };
  const u = await rodar(usuario, corpo);
  assert.equal(u.status, 200);
  assert.deepEqual(linhas(u, 'grupo').map(l => String(l.chaves[0])).sort(), ['2', 'null']);   // só ele e o escritório
  assert.equal(linhas(u, 'total')[0].valores[0], 4);
  assert.equal(linhas(await rodar(chefe, corpo), 'total')[0].valores[0], 8);
  // o detalhe de um grupo que ele não pode ver volta vazio (não vaza)
  const d = await rodar(usuario, { ...corpo, grupo: [4] });
  assert.equal(d.body.dados.total, 0);
});

test('regras: o servidor recusa agrupamentos e totais que não fazem sentido', async () => {
  const recusado = async (extra, trecho) => {
    const r = await rodar(admin, { receita: receita(extra) });
    assert.equal(r.status, 422, JSON.stringify(extra));
    assert.match(r.body.mensagem, trecho);
  };
  await recusado({ agrupar: [{ campo: 'descricao' }] }, /Não faz sentido agrupar/);
  await recusado({ metricas: [{ funcao: 'soma', campo: 'status' }] }, /Não dá para calcular soma/);
  await recusado({ agrupar: [{ campo: 'status' }, { campo: 'responsavel' }, { campo: 'pasta' }] }, /no máximo 2/);
  await recusado({ agrupar: [{ campo: 'status' }], ordemGrupo: { por: 'm9' } }, /Ordem dos grupos inválida/);
  assert.equal((await rodar(usuario, { receita: receita({ assunto: 'financeiro' }) })).status, 422);
});

test('grupos demais: recusa com mensagem clara (limite de grupos na tela)', async () => {
  const original = L.LIMITE_TELA;
  L.LIMITE_TELA = 2;
  try {
    const r = await rodar(admin, { receita: receita({ agrupar: [{ campo: 'vencimento', passo: 'dia' }] }) });
    assert.equal(r.status, 422);
    assert.match(r.body.mensagem, /gera 7 grupos e o máximo é 2/);
  } finally { L.LIMITE_TELA = original; }
});

test('tarefas: booleano agrupa em Sim/Não e só o total geral funciona sem agrupar', async () => {
  const r = await rodar(admin, { receita: { assunto: 'tarefas', colunas: ['titulo'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [{ campo: 'concluida' }] } });
  assert.deepEqual(linhas(r, 'grupo').map(l => [l.rotulos[0], l.valores[0]]), [['Não', 2], ['Sim', 1]].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')));
  const so = await rodar(admin, { receita: receita({ metricas: [{ funcao: 'contagem' }, { funcao: 'maximo', campo: 'vencimento' }] }) });
  assert.deepEqual(so.body.dados.linhas.map(l => l.tipo), ['total']);
  assert.deepEqual(so.body.dados.linhas[0].valores, [8, '2027-03-16']);
});

test('perguntar ao abrir: salva sem valor, exige resposta ao rodar, aplica a resposta e recusa resposta indevida', async () => {
  const pergunta = receita({ agrupar: [{ campo: 'status' }], filtros: { op: 'E', itens: [
    { campo: 'vencimento', operador: 'no_periodo', valor: '', perguntar: true },
    { campo: 'pasta', operador: 'contem', valor: '99' }] } });
  const salvo = await req(chefe).post('/api/relatorios/modelos').send({ nome: 'Com pergunta', receita: pergunta });
  assert.equal(salvo.status, 201);
  assert.equal(salvo.body.dados.receita.filtros.itens[0].perguntar, true);
  const id = salvo.body.dados.id;

  const sem = await rodar(chefe, { modelo_id: id });
  assert.equal(sem.status, 422);
  const com = await rodar(chefe, { modelo_id: id, parametros: [{ caminho: [0], valor: 'este_ano' }] });
  assert.equal(com.status, 200);
  const ano = String(new Date().getFullYear());
  const [{ n }] = await sql("SELECT COUNT(*) AS n FROM prazos_processo WHERE YEAR(data_vencimento) = ?", [ano]);
  assert.equal(linhas(com, 'total')[0].valores[0], Number(n));
  assert.equal((await rodar(chefe, { modelo_id: id, parametros: [{ caminho: [1], valor: 'x' }] })).status, 422);       // não é pergunta
  assert.equal((await rodar(chefe, { modelo_id: id, parametros: [{ caminho: [0], valor: 'ontem_e_amanha' }] })).status, 422); // resposta inválida
  assert.equal((await sql('SELECT definicao FROM relatorio_modelo WHERE id = ?', [id])).length, 1);                    // a receita salva continua sem a resposta
  const [def] = await sql('SELECT definicao FROM relatorio_modelo WHERE id = ?', [id]);
  assert.equal((typeof def.definicao === 'string' ? JSON.parse(def.definicao) : def.definicao).filtros.itens[0].valor, null);
});

test('Excel agrupado: aba Resumo com subtotais e total, aba Detalhes opcional e Informações', async () => {
  const corpo = { receita: receita({ agrupar: [{ campo: 'responsavel' }, { campo: 'status' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'quantidade' }] }), formato: 'xlsx', nome: 'Resumo teste' };
  const res = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send(corpo);
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Resumo', 'Informações']);
  const resumo = wb.getWorksheet('Resumo');
  assert.deepEqual(resumo.getRow(1).values.slice(1), ['Responsável', 'Status', 'Quantidade', 'Soma de Quantidade de dias']);
  const ultima = resumo.getRow(resumo.rowCount);
  assert.equal(ultima.getCell(1).value, 'TOTAL GERAL');
  assert.equal(ultima.getCell(3).value, 8);
  assert.equal(ultima.getCell(4).value, 94);
  assert.equal(ultima.font.bold, true);
  const subs = [];
  resumo.eachRow(r => { if (String(r.getCell(2).value).startsWith('Subtotal de')) subs.push(r.getCell(3).value); });
  assert.equal(subs.reduce((a, b) => a + b, 0), 8);
  const info = wb.getWorksheet('Informações');
  const mapa = Object.fromEntries(info.getRows(1, info.rowCount).map(r => [r.getCell(1).value, r.getCell(2).value]));
  assert.equal(mapa['Agrupado por'], 'Responsável; Status');
  assert.equal(mapa['Detalhes na planilha'], 'Não');

  const comDet = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send({ ...corpo, incluirDetalhes: true });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(comDet.body);
  assert.deepEqual(wb2.worksheets.map(w => w.name), ['Resumo', 'Detalhes', 'Informações']);
  assert.equal(wb2.getWorksheet('Detalhes').rowCount, 1 + 8);

  const original = L.LIMITE_EXCEL;
  L.LIMITE_EXCEL = 3;
  try {
    const grande = await req(admin).post('/api/relatorios/exportar').send({ ...corpo, incluirDetalhes: true });
    assert.equal(grande.status, 413);
    assert.equal((await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send(corpo)).status, 200); // o resumo não depende do tamanho do detalhe
  } finally { L.LIMITE_EXCEL = original; }
});

test('relatórios da Fase 1 (sem agrupamento) continuam iguais', async () => {
  const antigo = { assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [] };   // sem os campos novos
  const r = await rodar(admin, { receita: antigo, limite: 3 });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 8);
  assert.equal(r.body.dados.modo, undefined);
  assert.equal(r.body.dados.linhas.length, 3);
});
