// Agrupar e totalizar — regras puras (sem banco).
const test = require('node:test');
const assert = require('node:assert/strict');

const { validarReceita } = require('../../src/services/relatorios/validador');
const { montarAgrupado } = require('../../src/services/relatorios/montadorAgrupado');
const { condicoesDoGrupo, rotuloDoGrupo, rotuloData, valorDaMetrica, expressaoGrupo } = require('../../src/services/relatorios/agrupamento');
const { aplicarParametros, receitaDoDetalhe, temAgrupamento } = require('../../src/services/relatorios/parametros');
const { montarLinhas } = require('../../src/services/relatorios/linhasAgrupadas');
const { obterAssunto } = require('../../src/services/relatorios/catalogo');
const { ErroRelatorio } = require('../../src/services/relatorios/erros');

const HOJE = '2026-10-01';
const admin = { ehAdmin: true, permissoes: {}, id: 1, hoje: HOJE, usuario: { id: 1, nome: 'Admin' } };
const base = (extra = {}) => ({ assunto: 'prazos', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });
const prazos = obterAssunto('prazos');
const tarefas = obterAssunto('tarefas');

async function recusa(receita, trecho) {
  await assert.rejects(() => validarReceita(receita, admin), (e) => {
    assert.ok(e instanceof ErroRelatorio);
    assert.match(e.mensagens.join(' | '), trecho);
    return true;
  });
}

test('validador: regras do "sistema inteligente" para agrupar e totalizar', async () => {
  await recusa(base({ agrupar: [{ campo: 'descricao' }] }), /Não faz sentido agrupar por "Descrição"/);
  await recusa(base({ agrupar: [{ campo: 'inexistente' }] }), /Campo de agrupamento indisponível/);
  await recusa(base({ agrupar: [{ campo: 'status' }, { campo: 'status' }] }), /duas vezes/);
  await recusa(base({ agrupar: [{ campo: 'status' }, { campo: 'responsavel' }, { campo: 'vencimento' }] }), /no máximo 2 campos/);
  await recusa(base({ agrupar: [{ campo: 'vencimento', passo: 'decada' }] }), /dia, semana, mês ou ano/);
  await recusa(base({ metricas: [{ funcao: 'soma', campo: 'descricao' }] }), /Não dá para calcular soma de "Descrição"/);
  await recusa(base({ metricas: [{ funcao: 'media', campo: 'vencimento' }] }), /Não dá para calcular média/);
  await recusa(base({ metricas: [{ funcao: 'soma' }] }), /campo indisponível/);
  await recusa(base({ metricas: [{ funcao: 'raiz_quadrada', campo: 'quantidade' }] }), /Total inválido/);
  await recusa(base({ metricas: Array.from({ length: 7 }, (_, i) => ({ funcao: 'soma', campo: 'quantidade', x: i })) .concat([{ funcao: 'media', campo: 'quantidade' }, { funcao: 'minimo', campo: 'quantidade' }, { funcao: 'maximo', campo: 'quantidade' }, { funcao: 'minimo', campo: 'vencimento' }, { funcao: 'maximo', campo: 'vencimento' }, { funcao: 'minimo', campo: 'data_inicio' }]) }), /No máximo 6 totais/);
  await recusa(base({ agrupar: [{ campo: 'status' }], ordemGrupo: { por: 'g2' } }), /Ordem dos grupos inválida/);
  await recusa(base({ agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }], ordemGrupo: { por: 'm2' } }), /Ordem dos grupos inválida/);
  await recusa(base({ agrupar: [{ campo: 'status' }], ordemGrupo: { por: 'g1; DROP TABLE x' } }), /Ordem dos grupos inválida/);
});

test('validador: aceita e normaliza (passo padrão "mês", contagem automática, totais repetidos ignorados)', async () => {
  const { receita } = await validarReceita(base({
    agrupar: [{ campo: 'vencimento' }, { campo: 'responsavel' }],
    metricas: [{ funcao: 'soma', campo: 'quantidade' }, { funcao: 'soma', campo: 'quantidade' }, { funcao: 'minimo', campo: 'vencimento' }],
    ordemGrupo: { por: 'm1', direcao: 'qualquer' },
  }), admin);
  assert.equal(receita.versao, 2);
  assert.deepEqual(receita.agrupar, [{ campo: 'vencimento', passo: 'mes' }, { campo: 'responsavel' }]);
  assert.deepEqual(receita.metricas, [{ funcao: 'soma', campo: 'quantidade' }, { funcao: 'minimo', campo: 'vencimento' }]);
  assert.deepEqual(receita.ordemGrupo, { por: 'm1', direcao: 'asc' });

  const so = await validarReceita(base({ agrupar: [{ campo: 'status' }] }), admin);
  assert.deepEqual(so.receita.metricas, [{ funcao: 'contagem' }]);       // agrupar sem total ganha a contagem
  const totalGeral = await validarReceita(base({ metricas: [{ funcao: 'contagem' }] }), admin);
  assert.deepEqual(totalGeral.receita.agrupar, []);                      // só total geral
  assert.equal(temAgrupamento(totalGeral.receita), true);

  const v1 = await validarReceita(base(), admin);                         // receita da Fase 1 continua valendo
  assert.deepEqual([v1.receita.agrupar, v1.receita.metricas, v1.receita.ordemGrupo], [[], [], null]);
  assert.equal(temAgrupamento(v1.receita), false);
});

test('"perguntar ao abrir": ao salvar pode ficar sem valor; ao rodar é obrigatório', async () => {
  const receita = base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'no_periodo', valor: '', perguntar: true }, { campo: 'pasta', operador: 'contem', valor: 'x' }] } });
  const salva = await validarReceita(receita, admin, { salvando: true });
  assert.deepEqual(salva.receita.filtros.itens[0], { campo: 'vencimento', operador: 'no_periodo', valor: null, perguntar: true });
  await recusa(receita, /Período inválido/);                                    // rodar sem responder
  const semPergunta = base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'no_periodo', valor: '' }] } });
  await assert.rejects(() => validarReceita(semPergunta, admin, { salvando: true }), /Período inválido/); // só "perguntar" pode ficar vazio
});

test('respostas das perguntas: só entram em condições marcadas, por caminho, sem alterar a receita original', () => {
  const r = { filtros: { op: 'E', itens: [
    { campo: 'pasta', operador: 'contem', valor: 'a' },
    { op: 'OU', itens: [{ campo: 'status', operador: 'em', valor: null, perguntar: true }] },
  ] } };
  const nova = aplicarParametros(r, [{ caminho: [1, 0], valor: ['atrasado'] }]);
  assert.deepEqual(nova.filtros.itens[1].itens[0].valor, ['atrasado']);
  assert.equal(r.filtros.itens[1].itens[0].valor, null);                          // original intacto
  assert.equal(aplicarParametros(r, undefined), r);
  for (const ruim of [[{ caminho: [0], valor: 'x' }], [{ caminho: [1], valor: 'x' }], [{ caminho: [9, 9], valor: 'x' }], [{ caminho: [], valor: 'x' }], 'texto', [{ valor: 1 }]]) {
    assert.throws(() => aplicarParametros(r, ruim), ErroRelatorio);
  }
});

test('SQL agrupado: GROUP BY pelos apelidos, só as junções usadas, valores só em parâmetros', async () => {
  const { assunto, receita } = await validarReceita(base({
    agrupar: [{ campo: 'responsavel' }, { campo: 'vencimento', passo: 'semana' }],
    metricas: [{ funcao: 'contagem' }, { funcao: 'media', campo: 'quantidade' }],
    filtros: { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: "x'; DROP TABLE y; --" }] },
  }), admin);
  const q = montarAgrupado(assunto, receita, admin);
  assert.match(q.folhas.sql, /pp\.delegado_para AS g1, MIN\(ur\.nome\) AS g1_l, DATE_SUB\(pp\.data_vencimento, INTERVAL \(DAYOFWEEK\(pp\.data_vencimento\) - 1\) DAY\) AS g2, COUNT\(\*\) AS m1, AVG\(pp\.quantidade\) AS m2/);
  assert.match(q.folhas.sql, /GROUP BY g1, g2$/);
  assert.match(q.subtotais.sql, /GROUP BY g1$/);
  assert.doesNotMatch(q.total.sql, /GROUP BY/);
  assert.match(q.contagemGrupos.sql, /FROM \(SELECT .* GROUP BY g1, g2\) grupos_$/);
  assert.match(q.folhas.sql, /LEFT JOIN usuarios ur/);
  assert.doesNotMatch(q.folhas.sql, /DROP TABLE|prazo_subtipo|usuarios uc/);
  for (const k of ['folhas', 'subtotais', 'total', 'contagemGrupos']) assert.deepEqual(q[k].params, ["%x'; DROP TABLE y; --%"]);
  assert.equal(montarAgrupado(assunto, { ...receita, agrupar: [], metricas: [{ funcao: 'contagem' }] }, admin).folhas, null);
});

test('texto e booleano: "" e NULL viram o mesmo grupo; booleano vira 0/1', () => {
  assert.equal(expressaoGrupo(prazos.campos.pasta, undefined).chave, "NULLIF(IF(pa.numPasta >= 1000, CAST(pa.numPasta AS CHAR), LPAD(pa.numPasta, 4, '0')), '')");
  assert.equal(expressaoGrupo(tarefas.campos.concluida, undefined).chave, 'IF(t.concluida = 1, 1, 0)');
  assert.equal(expressaoGrupo(prazos.campos.vencimento, 'ano').chave, 'YEAR(pp.data_vencimento)');
  assert.equal(expressaoGrupo(prazos.campos.criado_em, 'dia').chave, 'DATE(pp.criado_em)');
});

test('rótulos legíveis dos grupos', () => {
  assert.equal(rotuloData('dia', '2026-10-01'), '01/10/2026');
  assert.equal(rotuloData('semana', '2026-09-27'), 'Semana de 27/09/2026');
  assert.equal(rotuloData('mes', '2026-10'), '10/2026');
  assert.equal(rotuloData('ano', 2026), '2026');
  assert.equal(rotuloDoGrupo(prazos.campos.responsavel, undefined, null, null), '(sem valor)');
  assert.equal(rotuloDoGrupo(prazos.campos.responsavel, undefined, 4, 'Chefe'), 'Chefe');
  assert.equal(rotuloDoGrupo(prazos.campos.status, undefined, 'atrasado', null), 'Atrasado');
  assert.equal(rotuloDoGrupo(tarefas.campos.concluida, undefined, 1, null), 'Sim');
  assert.equal(valorDaMetrica({ funcao: 'media', campo: 'quantidade' }, prazos, '12.3456'), 12.35);
  assert.equal(valorDaMetrica({ funcao: 'soma', campo: 'quantidade' }, prazos, '40'), 40);
  assert.equal(valorDaMetrica({ funcao: 'minimo', campo: 'vencimento' }, prazos, '2026-01-04'), '2026-01-04');
  assert.equal(valorDaMetrica({ funcao: 'soma', campo: 'quantidade' }, prazos, null), null);
});

test('detalhe do grupo: condições internas por tipo, com datas, nulos e entradas maliciosas', () => {
  const g = (agrupar, chaves) => condicoesDoGrupo(prazos, agrupar, chaves);
  assert.deepEqual(g([{ campo: 'responsavel' }], [4]), [{ campo: 'responsavel', operador: 'em', valor: ['4'] }]);
  assert.deepEqual(g([{ campo: 'responsavel' }], [null]), [{ campo: 'responsavel', operador: 'vazio', valor: null }]);
  assert.deepEqual(g([{ campo: 'pasta' }], ['0042']), [{ campo: 'pasta', operador: 'igual', valor: '0042' }]);
  assert.deepEqual(g([{ campo: 'vencimento', passo: 'dia' }], ['2026-10-01']), [{ campo: 'vencimento', operador: 'igual', valor: '2026-10-01' }]);
  assert.deepEqual(g([{ campo: 'vencimento', passo: 'semana' }], ['2026-09-27']), [{ campo: 'vencimento', operador: 'entre', valor: ['2026-09-27', '2026-10-03'] }]);
  assert.deepEqual(g([{ campo: 'vencimento', passo: 'mes' }], ['2028-02']), [{ campo: 'vencimento', operador: 'entre', valor: ['2028-02-01', '2028-02-29'] }]);
  assert.deepEqual(g([{ campo: 'vencimento', passo: 'ano' }], [2026]), [{ campo: 'vencimento', operador: 'entre', valor: ['2026-01-01', '2026-12-31'] }]);
  assert.deepEqual(g([{ campo: 'quantidade' }], ['15']), [{ campo: 'quantidade', operador: 'igual', valor: 15 }]);
  assert.deepEqual(condicoesDoGrupo(tarefas, [{ campo: 'concluida' }], [1]), [{ campo: 'concluida', operador: 'verdadeiro', valor: null }]);
  assert.deepEqual(condicoesDoGrupo(tarefas, [{ campo: 'concluida' }], [0]), [{ campo: 'concluida', operador: 'falso', valor: null }]);
  for (const ruim of [[[{ campo: 'responsavel' }], []], [[{ campo: 'responsavel' }], [{ a: 1 }]], [[{ campo: 'responsavel' }], 'x'],
    [[{ campo: 'vencimento', passo: 'dia' }], ['2026-02-30']], [[{ campo: 'vencimento', passo: 'mes' }], ['2026-13']],
    [[{ campo: 'vencimento', passo: 'ano' }], ["2026'; DROP"]], [[{ campo: 'quantidade' }], ['abc']]]) {
    assert.throws(() => g(...ruim), ErroRelatorio);
  }
  const filtros = { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: 'x' }] };
  const d = receitaDoDetalhe({ colunas: ['pasta'], filtros, ordem: [], agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }], ordemGrupo: null },
    [{ campo: 'status', operador: 'em', valor: ['atrasado'] }]);
  assert.deepEqual([d.agrupar, d.metricas], [[], []]);
  assert.deepEqual(d.filtros.itens, [filtros, { campo: 'status', operador: 'em', valor: ['atrasado'] }]);   // filtro original + grupo
});

const L = (chave, rotulo, valores) => ({ chaves: [chave], rotulos: [rotulo], valores });
const L2 = (k1, r1, k2, r2, valores) => ({ chaves: [k1, k2], rotulos: [r1, r2], valores });

test('linhas agrupadas: 1 nível ordena por nome (nulos por último) e fecha com o total', () => {
  const folhas = [L(2, 'Zélia', [3]), L(null, '(sem valor)', [1]), L(1, 'Ana', [5])];
  const linhas = montarLinhas({ assunto: prazos, agrupar: [{ campo: 'responsavel' }], ordemGrupo: null, folhas, subtotais: [], total: { valores: [9] } });
  assert.deepEqual(linhas.map(l => l.tipo), ['grupo', 'grupo', 'grupo', 'total']);
  assert.deepEqual(linhas.map(l => l.rotulos[0]), ['Ana', 'Zélia', '(sem valor)', undefined]);
  assert.deepEqual(linhas.at(-1).valores, [9]);
  const desc = montarLinhas({ assunto: prazos, agrupar: [{ campo: 'responsavel' }], ordemGrupo: { por: 'g1', direcao: 'desc' }, folhas, subtotais: [], total: { valores: [9] } });
  assert.deepEqual(desc.slice(0, 3).map(l => l.rotulos[0]), ['Zélia', 'Ana', '(sem valor)']);   // nulo continua por último
  const porTotal = montarLinhas({ assunto: prazos, agrupar: [{ campo: 'responsavel' }], ordemGrupo: { por: 'm1', direcao: 'desc' }, folhas, subtotais: [], total: { valores: [9] } });
  assert.deepEqual(porTotal.slice(0, 3).map(l => l.valores[0]), [5, 3, 1]);
});

test('linhas agrupadas: 2 níveis intercalam o subtotal depois dos filhos; datas ordenam pela chave', () => {
  const folhas = [L2('2026-02', '02/2026', 1, 'Ana', [2]), L2('2026-01', '01/2026', 2, 'Zé', [1]), L2('2026-01', '01/2026', 1, 'Ana', [4])];
  const subtotais = [L('2026-02', '02/2026', [2]), L('2026-01', '01/2026', [5])];
  const agrupar = [{ campo: 'vencimento', passo: 'mes' }, { campo: 'responsavel' }];
  const linhas = montarLinhas({ assunto: prazos, agrupar, ordemGrupo: null, folhas, subtotais, total: { valores: [7] } });
  assert.deepEqual(linhas.map(l => `${l.tipo}:${l.rotulos.join('/')}`), [
    'grupo:01/2026/Ana', 'grupo:01/2026/Zé', 'subtotal:01/2026', 'grupo:02/2026/Ana', 'subtotal:02/2026', 'total:']);
  const porTotal = montarLinhas({ assunto: prazos, agrupar, ordemGrupo: { por: 'm1', direcao: 'asc' }, folhas, subtotais, total: { valores: [7] } });
  assert.equal(porTotal[0].rotulos[0], '02/2026');                       // bloco de menor subtotal primeiro
});
