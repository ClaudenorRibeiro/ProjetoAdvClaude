// ============================================================
// CATÁLOGO — assunto FINANCEIRO · MULTAS POR ATRASO (tabela acordo_parcela_multa)
// Uma linha por multa lançada numa parcela de acordo ou alvará (o recebimento avulso não tem multa).
// A multa é independente da parcela: tem vencimento, recebimento e repasses próprios. Mesma permissão do
// Financeiro (quem tem permissão no módulo vê tudo). Valores em R$ podem ser somados e tirados a média.
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, opcoesLista, ORIGEM_ACORDO_EXPR } = require('./comum');

const ROTULOS_STATUS = { pendente: 'Pendente', pago: 'Recebida' };
const ROTULOS_TIPO = { acordo: 'Acordo', alvara: 'Alvará' };
const PARCEIRO_EXPR = `CASE m.parceria_pessoa_tipo
  WHEN 'fisica' THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = m.parceria_pessoa_id)
  WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = m.parceria_pessoa_id)
  ELSE NULL END`;
const moeda = (rotulo, coluna) => ({ rotulo, tipo: 'numero', formato: 'moeda', expr: coluna });

module.exports = {
  chave: 'financeiro_multas',
  rotulo: 'Financeiro — multas por atraso',
  permissao: { chave: 'financeiro', acao: 'visualizar' },
  from: 'acordo_parcela_multa m',
  pk: 'm.id',
  juncoes: [
    { id: 'ap', obrigatoria: true, sql: 'JOIN acordo_parcela ap ON ap.id = m.parcela_id' },
    { id: 'a',  obrigatoria: true, sql: 'JOIN acordo a ON a.id = ap.acordo_id', depende: ['ap'] },
    { id: 'pr', obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = a.processo_id', depende: ['a'] },
    { id: 'pa', obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'fp', sql: 'LEFT JOIN forma_pagamento fp ON fp.id = m.recebimento_forma_id' },
    { id: 'cf', sql: 'LEFT JOIN conta_financeira cf ON cf.id = m.recebimento_conta_financeira_id' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'origem', 'parcela', 'vencimento', 'valor_bruto', 'status'],
  ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
  visibilidade: () => null,
  campos: {
    pasta:            { rotulo: 'Pasta',               tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',            tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo',  tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    tipo_origem:      { rotulo: 'Origem (acordo ou alvará)', tipo: 'lista', expr: 'a.tipo', rotulosValor: ROTULOS_TIPO, opcoes: opcoesLista(ROTULOS_TIPO) },
    origem:           { rotulo: 'Acordo/alvará (nº)',  tipo: 'texto', expr: ORIGEM_ACORDO_EXPR },
    parcela:          { rotulo: 'Nº da parcela da multa', tipo: 'numero', expr: 'ap.numero' },
    vencimento:       { rotulo: 'Vencimento da multa', tipo: 'data',  expr: 'm.vencimento' },
    percentual_juiz:  { rotulo: 'Multa fixada pelo juiz (%)', tipo: 'numero', expr: 'm.percentual_juiz' },
    status:           { rotulo: 'Status da multa',     tipo: 'lista', expr: 'm.status', rotulosValor: ROTULOS_STATUS, opcoes: opcoesLista(ROTULOS_STATUS) },
    vencida:          { rotulo: 'Vencida e ainda não recebida', tipo: 'booleano', expr: "(m.status = 'pendente' AND m.vencimento < CURDATE())" },
    valor_bruto:      moeda('Valor da multa', 'm.valor_bruto'),
    honorario:        moeda('Honorário', 'm.honor_valor'),
    valor_liquido:    moeda('Valor líquido (cliente)', 'm.valor_liquido'),
    parceria:         moeda('Valor da parceria', 'm.parceria_valor'),
    parceiro:         { rotulo: 'Parceiro',            tipo: 'texto', agrupavel: true, expr: PARCEIRO_EXPR },
    recebido_em:      { rotulo: 'Recebida em',         tipo: 'data',  expr: 'm.recebido_em' },
    forma_recebimento:{ rotulo: 'Forma de recebimento', tipo: 'lista', expr: 'fp.nome', exprFiltro: 'fp.id', juncoes: ['fp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM forma_pagamento WHERE ativo = 1 ORDER BY nome') },
    conta_recebimento:{ rotulo: 'Conta do escritório que recebeu', tipo: 'lista', expr: 'cf.nome', exprFiltro: 'cf.id', juncoes: ['cf'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM conta_financeira WHERE ativo = 1 ORDER BY nome') },
    repasse_cliente_em:  { rotulo: 'Repasse ao cliente em',  tipo: 'data', expr: 'm.repasse_cliente_em' },
    repasse_parceiro_em: { rotulo: 'Repasse ao parceiro em', tipo: 'data', expr: 'm.repasse_parceiro_em' },
    repasse_cliente_pendente:  { rotulo: 'Repasse ao cliente pendente',  tipo: 'booleano', expr: "(m.status = 'pago' AND m.repasse_cliente_habilitado = 1 AND m.repasse_cliente_em IS NULL)" },
    repasse_parceiro_pendente: { rotulo: 'Repasse ao parceiro pendente', tipo: 'booleano', expr: "(m.status = 'pago' AND m.repasse_parceiro_habilitado = 1 AND m.repasse_parceiro_em IS NULL)" },
  },
};
