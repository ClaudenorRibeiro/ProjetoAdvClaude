// Motor de relatórios — regras puras (sem banco): datas relativas, condições, validador e montador.
const test = require('node:test');
const assert = require('node:assert/strict');

const { dataValida, resolverData, resolverPeriodo } = require('../../src/services/relatorios/datasRelativas');
const { condicaoSql } = require('../../src/services/relatorios/condicoes');
const { validarReceita } = require('../../src/services/relatorios/validador');
const { montarConsulta, montarContagem } = require('../../src/services/relatorios/montador');
const { obterAssunto } = require('../../src/services/relatorios/catalogo');
const { ErroRelatorio } = require('../../src/services/relatorios/erros');

const HOJE = '2026-10-01'; // quinta-feira
const admin = { ehAdmin: true, permissoes: {}, id: 1, hoje: HOJE, usuario: { id: 1, nome: 'Admin' } };
const comum = (permissoes) => ({ ehAdmin: false, permissoes, id: 7, hoje: HOJE, usuario: { id: 7, nome: 'Comum' } });

async function recusa(receita, ctx, trecho, status = 422) {
  await assert.rejects(() => validarReceita(receita, ctx), (e) => {
    assert.ok(e instanceof ErroRelatorio);
    assert.equal(e.status, status);
    if (trecho) assert.match(e.mensagens.join(' | '), trecho);
    return true;
  });
}
const base = (extra = {}) => ({ assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });

test('datas relativas: períodos corretos, semana de domingo a sábado e ano bissexto', () => {
  assert.deepEqual(resolverPeriodo('hoje', HOJE), [HOJE, HOJE]);
  assert.deepEqual(resolverPeriodo('este_mes', HOJE), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(resolverPeriodo('esta_semana', HOJE), ['2026-09-27', '2026-10-03']);
  assert.deepEqual(resolverPeriodo('semana_passada', HOJE), ['2026-09-20', '2026-09-26']);
  assert.deepEqual(resolverPeriodo('mes_passado', HOJE), ['2026-09-01', '2026-09-30']);
  assert.deepEqual(resolverPeriodo('proximo_mes', '2026-12-15'), ['2027-01-01', '2027-01-31']);
  assert.deepEqual(resolverPeriodo('ultimos_30_dias', HOJE), ['2026-09-01', HOJE]);
  assert.deepEqual(resolverPeriodo('proximos_7_dias', HOJE), [HOJE, '2026-10-08']);
  assert.deepEqual(resolverPeriodo('este_mes', '2028-02-10'), ['2028-02-01', '2028-02-29']);
  assert.equal(resolverPeriodo('inexistente', HOJE), null);
});

test('datas: rejeita data impossível e resolve "hoje ± dias"', () => {
  assert.equal(dataValida('2026-02-30'), false);
  assert.equal(dataValida('2026-2-3'), false);
  assert.equal(dataValida('2026-02-28'), true);
  assert.equal(resolverData({ rel: 'hoje', dias: -30 }, HOJE), '2026-09-01');
  assert.equal(resolverData({ rel: 'hoje' }, HOJE), HOJE);
  assert.equal(resolverData({ rel: 'amanha' }, HOJE), null);
  assert.equal(resolverData('2026-13-01', HOJE), null);
});

test('condições: o valor do usuário nunca entra no texto do SQL (só em parâmetros) e curingas do LIKE são protegidos', () => {
  const campo = { tipo: 'texto', expr: 'pr.numProc' };
  const maldoso = "x'; DROP TABLE usuarios; --";
  const c = condicaoSql(campo, 'contem', maldoso, HOJE);
  assert.equal(c.sql, 'pr.numProc LIKE ?');
  assert.ok(!c.sql.includes('DROP'));
  assert.deepEqual(c.params, [`%${maldoso}%`]);
  assert.deepEqual(condicaoSql(campo, 'contem', '50%_x\\', HOJE).params, ['%50\\%\\_x\\\\%']);
  assert.deepEqual(condicaoSql({ tipo: 'texto', expr: 'a' }, 'vazio', null, HOJE), { sql: "(a IS NULL OR a = '')", params: [] });
  assert.deepEqual(condicaoSql({ tipo: 'numero', expr: 'n' }, 'entre', [1, 5], HOJE), { sql: 'n BETWEEN ? AND ?', params: [1, 5] });
  assert.deepEqual(condicaoSql({ tipo: 'datahora', expr: 'd' }, 'no_periodo', 'este_mes', HOJE),
    { sql: 'DATE(d) BETWEEN ? AND ?', params: ['2026-10-01', '2026-10-31'] });
  assert.deepEqual(condicaoSql({ tipo: 'data', expr: 'd' }, 'depois', { rel: 'hoje', dias: 5 }, HOJE), { sql: 'd > ?', params: ['2026-10-06'] });
  assert.deepEqual(condicaoSql({ tipo: 'lista', expr: 'x' }, 'nao_em', ['a', 'b'], HOJE),
    { sql: '(x NOT IN (?, ?) OR x IS NULL)', params: ['a', 'b'] });
  assert.deepEqual(condicaoSql({ tipo: 'booleano', expr: 'b' }, 'falso', null, HOJE), { sql: '(b = 0 OR b IS NULL)', params: [] });
});

test('validador: recusa assunto, coluna, campo, operador e valores inválidos', async () => {
  await recusa({ assunto: 'financeiro', colunas: ['x'] }, admin, /assunto/i);
  await recusa(base({ colunas: [] }), admin, /ao menos uma coluna/);
  await recusa(base({ colunas: ['pasta', 'senha_hash'] }), admin, /Coluna indisponível: senha_hash/);
  await recusa(base({ colunas: ['constructor'] }), admin, /Coluna indisponível/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'inexistente', operador: 'igual', valor: 1 }] } }), admin, /Campo de filtro indisponível/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'contem', valor: 'x' }] } }), admin, /não aceita essa condição/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'igual', valor: '2026-02-30' }] } }), admin, /Valor inválido/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'entre', valor: ['2026-01-01'] }] } }), admin, /dois valores/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'vencimento', operador: 'no_periodo', valor: 'ontem_e_amanha' }] } }), admin, /Período inválido/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: ['agendado', 'inventado'] }] } }), admin, /opção que você não pode usar/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: [] }] } }), admin, /ao menos uma opção/);
  await recusa(base({ filtros: { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: 'x'.repeat(300) }] } }), admin, /Valor inválido/);
  await recusa(base({ ordem: [{ campo: 'nao_existe', direcao: 'asc' }] }), admin, /ordem indisponível/);
  await recusa(base({ colunas: Array.from({ length: 41 }, (_, i) => `c${i}`) }), admin, /No máximo 40 colunas/);
});

test('validador: limites de condições e de aninhamento', async () => {
  const cond = { campo: 'pasta', operador: 'igual', valor: '0001' };
  await recusa(base({ filtros: { op: 'E', itens: Array.from({ length: 26 }, () => cond) } }), admin, /No máximo 25 condições/);
  let no = { op: 'E', itens: [cond] };
  for (let i = 0; i < 4; i++) no = { op: 'OU', itens: [cond, no] };
  await recusa(base({ filtros: no }), admin, /aninhados demais/);
});

test('validador: aceita receita correta e devolve versão limpa (sem lixo, colunas sem repetição)', async () => {
  const { assunto, receita } = await validarReceita({
    assunto: 'prazos', colunas: ['pasta', 'pasta', 'status'], lixo: 'x',
    filtros: { op: 'OU', itens: [
      { campo: 'pasta', operador: 'contem', valor: '  8969  ' },
      { op: 'E', itens: [{ campo: 'vencimento', operador: 'no_periodo', valor: 'proximos_30_dias' }, { campo: 'status', operador: 'em', valor: ['atrasado', 'atrasado'] }] },
      { op: 'E', itens: [] },
    ] },
    ordem: [{ campo: 'vencimento', direcao: 'desc' }, { campo: 'vencimento', direcao: 'asc' }, { campo: 'pasta', direcao: 'qualquer' }],
  }, admin);
  assert.equal(assunto.chave, 'prazos');
  assert.deepEqual(receita.colunas, ['pasta', 'status']);
  assert.equal(receita.lixo, undefined);
  assert.equal(receita.filtros.itens.length, 2);           // o grupo vazio foi descartado
  assert.equal(receita.filtros.itens[0].valor, '8969');    // texto aparado
  assert.deepEqual(receita.filtros.itens[1].itens[1].valor, ['atrasado']);
  assert.deepEqual(receita.ordem, [{ campo: 'vencimento', direcao: 'desc' }, { campo: 'pasta', direcao: 'asc' }]);
});

test('validador: usuário sem a permissão do assunto é barrado (403); com ela, passa', async () => {
  await recusa(base(), comum({}), /permissão/i, 403);
  await recusa(base({ assunto: 'tarefas', colunas: ['titulo'] }), comum({ prazos: { visualizar: true } }), /permissão/i, 403);
  const ok = await validarReceita(base(), comum({ prazos: { visualizar: true } }));
  assert.equal(ok.receita.assunto, 'prazos');
});

test('montador: só entra no SQL a junção que a receita usa; valores só em parâmetros', async () => {
  const { assunto, receita } = await validarReceita(base({ colunas: ['pasta', 'vencimento'] }), admin);
  const q = montarConsulta(assunto, receita, admin, { limite: 50, offset: 0 });
  assert.match(q.sql, /JOIN tblproc pr/);          // obrigatória (mesma regra da tela de Prazos)
  assert.match(q.sql, /JOIN tblpasta pa/);
  assert.doesNotMatch(q.sql, /usuarios ur|usuarios uc|prazo_subtipo|tipo_prazo/);
  assert.match(q.sql, /ORDER BY pp\.data_vencimento ASC, pp\.id ASC LIMIT 50 OFFSET 0$/);

  const r2 = await validarReceita(base({ colunas: ['responsavel', 'tipo_prazo'] }), admin);
  const q2 = montarConsulta(assunto, r2.receita, admin, { limite: 50, offset: 0 });
  assert.match(q2.sql, /LEFT JOIN usuarios ur/);
  assert.match(q2.sql, /LEFT JOIN prazo_subtipo ps[\s\S]*LEFT JOIN tipo_prazo tp/); // dependência na ordem certa
});

test('montador: restrição "ver todos" — sem a permissão só vê os seus + os do escritório; com ela, sem restrição', async () => {
  const semTodos = comum({ prazos: { visualizar: true } });
  const { assunto, receita } = await validarReceita(base(), semTodos);
  const q = montarConsulta(assunto, receita, semTodos, { limite: 50, offset: 0 });
  assert.match(q.sql, /WHERE \(pp\.delegado_para = \? OR pp\.delegado_para IS NULL\)/);
  assert.deepEqual(q.params, [7]);

  const comTodos = comum({ prazos: { visualizar: true }, 'prazos.ver_todos': { visualizar: true } });
  const q2 = montarConsulta(assunto, receita, comTodos, { limite: 50, offset: 0 });
  assert.doesNotMatch(q2.sql, /WHERE/);

  // o filtro do usuário vem DEPOIS da restrição e nunca a substitui
  const r3 = (await validarReceita(base({ filtros: { op: 'OU', itens: [{ campo: 'pasta', operador: 'igual', valor: '0001' }, { campo: 'pasta', operador: 'igual', valor: '0002' }] } }), semTodos)).receita;
  const q3 = montarConsulta(assunto, r3, semTodos, { limite: 50, offset: 0 });
  assert.match(q3.sql, /WHERE \(pp\.delegado_para = \? OR pp\.delegado_para IS NULL\) AND \(IF\(pa\.numPasta >= 1000, CAST\(pa\.numPasta AS CHAR\), LPAD\(pa\.numPasta, 4, '0'\)\) = \? OR IF\(/);
  assert.deepEqual(q3.params, [7, '0001', '0002']);
});

test('montador: contagem não ordena nem usa junção de coluna; tarefas trazem a junção de processo para a pasta; limite é sempre inteiro', async () => {
  const { assunto, receita } = await validarReceita(base({ assunto: 'tarefas', colunas: ['titulo', 'pasta'] }), admin);
  const t = obterAssunto('tarefas');
  const q = montarConsulta(t, receita, admin, { limite: '10; DROP TABLE x', offset: '-5' });
  assert.match(q.sql, /LEFT JOIN tblproc pr[\s\S]*LEFT JOIN tblpasta pa/);
  assert.match(q.sql, /LIMIT 10 OFFSET 0$/);
  const c = montarContagem(t, receita, admin);
  assert.match(c.sql, /^SELECT \/\*\+ MAX_EXECUTION_TIME\(\d+\) \*\/ COUNT\(\*\) AS total FROM tarefas t\s*$/);
  assert.ok(assunto);
});
