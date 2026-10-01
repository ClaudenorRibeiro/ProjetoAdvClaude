// Relatórios (Fase 3C) — assuntos Financeiro (parcelas e lançamentos) contra MySQL real.
// Cada valor em R$ é conferido contra uma consulta escrita à mão e contra as telas antigas
// do Financeiro (Consulta, saldo da conta corrente e Repasses pendentes).
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

let app; let admin; let usuario; let semPermissao; let soRelatorios;
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
const PRIMEIRA = { financeiro_parcelas: 'pasta', financeiro_lancamentos: 'pasta' };
const receita = (assunto, extra = {}) => ({ assunto, colunas: [PRIMEIRA[assunto]], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });
const rodar = (t, corpo) => req(t).post('/api/relatorios/executar').send(corpo);
const filtro = (campo, operador, valor = null) => ({ op: 'E', itens: [{ campo, operador, valor }] });
const linhasGrupo = (r) => r.body.dados.linhas.filter(l => l.tipo === 'grupo');
const total = (r) => r.body.dados.linhas.find(l => l.tipo === 'total');
const num = (v) => Math.round(Number(v) * 100) / 100;
const M = [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor_bruto' }, { funcao: 'soma', campo: 'honorario' }, { funcao: 'soma', campo: 'valor_liquido' }];

test.before(async () => {
  await recriarBancoTeste();
  await sql("INSERT INTO conta_financeira (id, nome, tipo, principal, ativo) VALUES (1, 'Caixa do escritório', 'especie', 1, 1)");
  await sql("INSERT INTO pessoas_fisicas (id, nome) VALUES (1, 'Parceiro Teste')");
  // Acordo 1 (3 parcelas), Alvará 1 cancelado, Acordo 2 com parcela vencida
  await sql(`INSERT INTO acordo (id, processo_id, tipo, valor_total, qtd_parcelas, data_primeira, status, criado_por) VALUES
    (1, 1, 'acordo', 300.50, 3, '2026-01-10', 'ativo', 1), (2, 1, 'alvara', 50, 1, '2026-01-20', 'cancelado', 1), (3, 1, 'acordo', 200, 1, '2020-01-01', 'ativo', 1)`);
  await sql(`INSERT INTO acordo_parcela (id, acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_valor, valor_liquido, parceria_pessoa_tipo, parceria_pessoa_id, parceria_valor, status, recebido_em, recebimento_forma_id, recebimento_conta_financeira_id, repasse_cliente_em) VALUES
    (1, 1, 1, '2026-01-10', 100.00, 'percent', 30.00, 70.00, NULL, NULL, NULL, 'pago', '2026-01-12', 1, 1, '2026-01-15'),
    (2, 1, 2, '2026-02-10', 100.00, 'percent', 30.00, 70.00, 'fisica', 1, 10.00, 'pago', '2026-02-11', 1, 1, NULL),
    (3, 1, 3, '2999-03-10', 100.50, 'percent', 30.15, 70.35, NULL, NULL, NULL, 'pendente', NULL, NULL, NULL, NULL),
    (4, 2, 1, '2026-01-20', 50.00, 'percent', 0.00, 50.00, NULL, NULL, NULL, 'cancelada', NULL, NULL, NULL, NULL),
    (5, 3, 1, '2020-01-01', 200.00, 'percent', 60.00, 140.00, NULL, NULL, NULL, 'pendente', NULL, NULL, NULL, NULL)`);
  await sql(`INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id, conta_financeira_id) VALUES
    (1, NULL, '2026-01-05', 'Adiantamento', 'entrada', 150.00, 'manual', 1, NULL),
    (1, 1, '2026-01-12', 'Recebimento parc 1', 'entrada', 100.00, 'recebimento', 1, 1),
    (1, 1, '2026-01-15', 'Repasse cliente', 'saida', 70.00, 'rep_cliente', 1, 1),
    (1, NULL, '2026-02-01', 'Custas', 'saida', 25.25, 'manual', 2, NULL)`);
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (5, 'So Relatorios', 'sorel', 'x', 'sorel@example.invalid', 'advogado', 2, 1, 0, 'sessao-so-rel', 0, 0)`);
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (5, 'relatorios', NULL, 'visualizar', 1), (5, 'prazos', NULL, 'visualizar', 1)");
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); semPermissao = token(3, 2, 'sessao-sem-permissao'); soRelatorios = token(5, 2, 'sessao-so-rel');
});
test.after(async () => pool.end());

test('catálogo: financeiro só para quem tem permissão no módulo; valores têm formato moeda; nada de SQL', async () => {
  const a = await req(admin).get('/api/relatorios/catalogo');
  const parc = a.body.dados.assuntos.find(x => x.chave === 'financeiro_parcelas');
  assert.ok(parc && a.body.dados.assuntos.some(x => x.chave === 'financeiro_lancamentos'));
  const bruto = parc.campos.find(c => c.chave === 'valor_bruto');
  assert.equal(bruto.formato, 'moeda');
  assert.deepEqual(bruto.funcoes.map(f => f.valor), ['soma', 'media', 'minimo', 'maximo']);
  assert.doesNotMatch(JSON.stringify(a.body), /acordo_parcela|conta_corrente|ap\.valor|cc\.valor/);
  assert.ok((await req(usuario).get('/api/relatorios/catalogo')).body.dados.assuntos.some(x => x.chave === 'financeiro_parcelas'));
  const so = await req(soRelatorios).get('/api/relatorios/catalogo');
  assert.ok(!so.body.dados.assuntos.some(x => x.chave.startsWith('financeiro')));
  for (const assunto of ['financeiro_parcelas', 'financeiro_lancamentos']) {
    assert.equal((await rodar(soRelatorios, { receita: receita(assunto) })).status, 403, assunto);
    assert.equal((await rodar(semPermissao, { receita: receita(assunto) })).status, 403, assunto);
  }
});

test('parcelas: valores em R$ chegam como número e batem com o banco; origem "Acordo 1/2" e "Alvará 1" como na tela', async () => {
  const r = await rodar(admin, { receita: receita('financeiro_parcelas', { colunas: ['origem', 'parcela', 'vencimento', 'valor_bruto', 'honorario', 'valor_liquido', 'parceria', 'parceiro', 'status'], ordem: [{ campo: 'vencimento', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 5);
  const l = r.body.dados.linhas;
  assert.equal(typeof l[0].valor_bruto, 'number');                    // DECIMAL vira número (e não texto)
  assert.deepEqual(l.map(x => x.origem), ['Acordo 2', 'Acordo 1', 'Alvará 1', 'Acordo 1', 'Acordo 1']);
  assert.deepEqual(l.map(x => x.valor_bruto), [200, 100, 50, 100, 100.5]);
  assert.deepEqual(l.map(x => x.status), ['Pendente', 'Recebida', 'Cancelada', 'Recebida', 'Pendente']);
  assert.equal(l[3].parceiro, 'Parceiro Teste');
  assert.equal(l[3].parceria, 10);
  assert.equal(l[0].parceria, null);
  const [{ n }] = await sql('SELECT COUNT(*) n FROM acordo_parcela');
  assert.equal(r.body.dados.total, Number(n));
});

test('parcelas: soma, média, mínimo e máximo por status e total geral conferem com o banco e com a Consulta do Financeiro', async () => {
  const r = await rodar(admin, { receita: receita('financeiro_parcelas', { agrupar: [{ campo: 'status' }], metricas: [...M, { funcao: 'media', campo: 'valor_bruto' }, { funcao: 'maximo', campo: 'valor_bruto' }] }) });
  assert.equal(r.status, 200);
  const gab = await sql(`SELECT status k, COUNT(*) n, SUM(valor_bruto) b, SUM(honor_valor) h, SUM(valor_liquido) l, ROUND(AVG(valor_bruto), 2) m, MAX(valor_bruto) x FROM acordo_parcela GROUP BY status`);
  for (const g of gab) {
    const linha = linhasGrupo(r).find(x => String(x.chaves[0]) === g.k);
    assert.deepEqual(linha.valores.map(Number), [g.n, g.b, g.h, g.l, g.m, g.x].map(Number), g.k);
  }
  const t = total(r).valores.map(Number);
  assert.deepEqual(t.slice(0, 4), [5, 550.5, 150.15, 400.35]);
  assert.equal(r.body.dados.colunas.metricas[1].formato, 'moeda');       // total de R$ avisa que é dinheiro
  assert.equal(r.body.dados.colunas.metricas[0].formato, null);          // a contagem não é dinheiro

  // mesma conta da tela "Consulta" do Financeiro, só parcelas recebidas
  const consulta = await req(admin).get('/api/financeiro/consulta?status=pago');
  const recebidas = linhasGrupo(r).find(x => String(x.chaves[0]) === 'pago');
  assert.equal(num(consulta.body.dados.totais.bruto), num(recebidas.valores[1]));
  assert.equal(num(consulta.body.dados.totais.honorario), num(recebidas.valores[2]));
  assert.equal(num(consulta.body.dados.totais.liquido), num(recebidas.valores[3]));
  assert.equal(consulta.body.dados.total, recebidas.valores[0]);
});

test('parcelas: vencidas, repasses pendentes (mesma regra da tela de Repasses pendentes) e filtros de valor', async () => {
  const idsDe = async (f) => (await rodar(admin, { receita: receita('financeiro_parcelas', { colunas: ['origem', 'parcela'], filtros: f }), limite: 50 })).body.dados.total;
  assert.equal(await idsDe(filtro('vencida', 'verdadeiro')), 1);                         // só a de 2020 (a de 2999 não venceu; a cancelada não conta)
  assert.equal(await idsDe(filtro('repasse_cliente_pendente', 'verdadeiro')), 1);        // parcela 2
  assert.equal(await idsDe(filtro('repasse_parceiro_pendente', 'verdadeiro')), 1);
  const pend = await req(admin).get('/api/financeiro/repasses-pendentes');
  const idsTela = pend.body.dados.filter(p => p.origem === 'parcela').map(p => p.id).sort();
  const nova = await rodar(admin, { receita: receita('financeiro_parcelas', { colunas: ['origem'], filtros: { op: 'OU', itens: [
    { campo: 'repasse_cliente_pendente', operador: 'verdadeiro', valor: null }, { campo: 'repasse_parceiro_pendente', operador: 'verdadeiro', valor: null }] } }), limite: 50 });
  assert.equal(nova.body.dados.total, idsTela.length);                                    // mesmos itens da tela antiga
  assert.deepEqual(idsTela, [2]);
  assert.equal(await idsDe(filtro('valor_bruto', 'maior_igual', 100.5)), 2);              // 100,50 e 200
  assert.equal(await idsDe(filtro('valor_bruto', 'entre', [50, 100])), 3);
  assert.equal(await idsDe(filtro('situacao_acordo', 'em', ['cancelado'])), 1);
  assert.equal(await idsDe(filtro('forma_recebimento', 'em', ['1'])), 2);
  assert.equal(await idsDe(filtro('conta_recebimento', 'vazio')), 3);
});

test('parcelas: agrupar por mês de vencimento e por origem; detalhe do grupo abre as parcelas certas', async () => {
  const r = await rodar(admin, { receita: receita('financeiro_parcelas', { agrupar: [{ campo: 'vencimento', passo: 'ano' }], metricas: [{ funcao: 'soma', campo: 'valor_bruto' }] }) });
  const gab = await sql('SELECT YEAR(vencimento) k, SUM(valor_bruto) s FROM acordo_parcela GROUP BY 1');
  assert.deepEqual(Object.fromEntries(linhasGrupo(r).map(x => [String(x.chaves[0]), num(x.valores[0])])), Object.fromEntries(gab.map(g => [String(g.k), num(g.s)])));
  const d = await rodar(admin, { receita: receita('financeiro_parcelas', { agrupar: [{ campo: 'tipo_origem' }] }), grupo: ['acordo'], limite: 50 });
  assert.equal(d.status, 200);
  assert.equal(d.body.dados.total, 4);
});

test('lançamentos: entrada/saída, origem com nome claro e saldo = soma do valor com sinal (igual à conta corrente da tela)', async () => {
  const r = await rodar(admin, { receita: receita('financeiro_lancamentos', { colunas: ['data', 'descricao', 'tipo', 'origem', 'valor', 'valor_com_sinal', 'conta', 'usuario'], ordem: [{ campo: 'data', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  const l = r.body.dados.linhas;
  assert.deepEqual(l.map(x => x.tipo), ['Entrada', 'Entrada', 'Saída', 'Saída']);
  assert.deepEqual(l.map(x => x.origem), ['Lançamento manual', 'Recebimento de parcela', 'Repasse ao cliente', 'Lançamento manual']);
  assert.deepEqual(l.map(x => x.valor), [150, 100, 70, 25.25]);
  assert.deepEqual(l.map(x => x.valor_com_sinal), [150, 100, -70, -25.25]);
  assert.deepEqual([l[1].conta, l[0].conta, l[3].usuario], ['Caixa do escritório', null, 'Usuário de Testes']);

  const saldo = await rodar(admin, { receita: receita('financeiro_lancamentos', { agrupar: [{ campo: 'tipo' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor' }, { funcao: 'soma', campo: 'valor_com_sinal' }] }) });
  const porTipo = Object.fromEntries(linhasGrupo(saldo).map(x => [x.chaves[0], x.valores.map(Number)]));
  assert.deepEqual(porTipo, { entrada: [2, 250, 250], saida: [2, 95.25, -95.25] });
  const tela = await req(admin).get('/api/financeiro/processo/1');
  assert.equal(num(total(saldo).valores[2]), num(tela.body.dados.saldo_total));            // 154,75 nos dois lugares
  assert.equal(num(total(saldo).valores[2]), 154.75);

  const porMes = await rodar(admin, { receita: receita('financeiro_lancamentos', { agrupar: [{ campo: 'data', passo: 'mes' }], metricas: [{ funcao: 'soma', campo: 'valor_com_sinal' }] }) });
  assert.deepEqual(linhasGrupo(porMes).map(x => [x.rotulos[0], num(x.valores[0])]), [['01/2026', 180], ['02/2026', -25.25]]);   // fluxo de caixa mensal
  const manual = await rodar(admin, { receita: receita('financeiro_lancamentos', { filtros: filtro('origem', 'em', ['manual']) }) });
  assert.equal(manual.body.dados.total, 2);
});

test('Excel: valores em R$ saem como número com formato monetário (detalhe e resumo)', async () => {
  const res = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send({
    receita: receita('financeiro_parcelas', { colunas: ['origem', 'vencimento', 'valor_bruto', 'honorario', 'status'], ordem: [{ campo: 'vencimento', direcao: 'asc' }] }), formato: 'xlsx', nome: 'Parcelas' });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body);
  const ws = wb.getWorksheet(1);
  assert.equal(ws.rowCount, 1 + 5);
  const c = ws.getRow(2).getCell(3);
  assert.equal(typeof c.value, 'number');
  assert.equal(c.value, 200);
  assert.match(c.numFmt, /R\$/);

  const ag = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send({
    receita: receita('financeiro_parcelas', { agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor_bruto' }] }), formato: 'xlsx', nome: 'Resumo' });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(ag.body);
  const resumo = wb2.getWorksheet('Resumo');
  const ultima = resumo.getRow(resumo.rowCount);
  assert.equal(ultima.getCell(1).value, 'TOTAL GERAL');
  assert.equal(ultima.getCell(3).value, 550.5);
  assert.match(ultima.getCell(3).numFmt, /R\$/);
  assert.ok(!/R\$/.test(ultima.getCell(2).numFmt || ''));                                  // a contagem não ganha R$
});

test('recusas: não dá para somar texto/lista; campo de outro assunto é recusado', async () => {
  assert.equal((await rodar(admin, { receita: receita('financeiro_parcelas', { agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'soma', campo: 'status' }] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('financeiro_lancamentos', { agrupar: [{ campo: 'tipo' }], metricas: [{ funcao: 'media', campo: 'descricao' }] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('financeiro_lancamentos', { colunas: ['honorario'] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('financeiro_parcelas', { colunas: ['valor'] }) })).status, 422);
});
