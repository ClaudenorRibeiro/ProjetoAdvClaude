// ============================================================
// CATÁLOGO — assunto FINANCEIRO · PARCELAS (acordos e alvarás; tabela acordo_parcela)
// Uma linha por parcela, como a "Consulta" do Financeiro (sem filtro por responsável: quem tem
// permissão no módulo vê tudo). Valores em R$ (formato "moeda") podem ser somados e tirados a média.
// "Repasse pendente" usa a mesma regra da tela de repasses pendentes.
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, opcoesLista, ORIGEM_ACORDO_EXPR } = require('./comum');

const ROTULOS_STATUS = { pendente: 'Pendente', pago: 'Recebida', cancelada: 'Cancelada' };
const ROTULOS_TIPO = { acordo: 'Acordo', alvara: 'Alvará' };
const ROTULOS_ACORDO = { ativo: 'Ativo', cancelado: 'Cancelado' };
const PARCEIRO_EXPR = `CASE ap.parceria_pessoa_tipo
  WHEN 'fisica' THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = ap.parceria_pessoa_id)
  WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
  ELSE NULL END`;
const moeda = (rotulo, coluna) => ({ rotulo, tipo: 'numero', formato: 'moeda', expr: coluna });

module.exports = {
  chave: 'financeiro_parcelas',
  rotulo: 'Financeiro — parcelas de acordos e alvarás',
  permissao: { chave: 'financeiro', acao: 'visualizar' },
  from: 'acordo_parcela ap',
  pk: 'ap.id',
  juncoes: [
    { id: 'a',  obrigatoria: true, sql: 'JOIN acordo a ON a.id = ap.acordo_id' },
    { id: 'pr', obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = a.processo_id', depende: ['a'] },
    { id: 'pa', obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'fp', sql: 'LEFT JOIN forma_pagamento fp ON fp.id = ap.recebimento_forma_id' },
    { id: 'cf', sql: 'LEFT JOIN conta_financeira cf ON cf.id = ap.recebimento_conta_financeira_id' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'origem', 'parcela', 'vencimento', 'valor_bruto', 'honorario', 'valor_liquido', 'status'],
  ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
  visibilidade: () => null,
  campos: {
    pasta:            { rotulo: 'Pasta',               tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',            tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo',  tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    tipo_origem:      { rotulo: 'Origem (acordo ou alvará)', tipo: 'lista', expr: 'a.tipo', rotulosValor: ROTULOS_TIPO, opcoes: opcoesLista(ROTULOS_TIPO) },
    origem:           { rotulo: 'Acordo/alvará (nº)',  tipo: 'texto', expr: ORIGEM_ACORDO_EXPR },
    situacao_acordo:  { rotulo: 'Situação do acordo',  tipo: 'lista', expr: 'a.status', rotulosValor: ROTULOS_ACORDO, opcoes: opcoesLista(ROTULOS_ACORDO) },
    parcela:          { rotulo: 'Nº da parcela',       tipo: 'numero', expr: 'ap.numero' },
    total_parcelas:   { rotulo: 'Total de parcelas do acordo', tipo: 'numero', expr: '(SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id)' },
    vencimento:       { rotulo: 'Vencimento',          tipo: 'data',  expr: 'ap.vencimento' },
    status:           { rotulo: 'Status da parcela',   tipo: 'lista', expr: 'ap.status', rotulosValor: ROTULOS_STATUS, opcoes: opcoesLista(ROTULOS_STATUS) },
    vencida:          { rotulo: 'Vencida e ainda não recebida', tipo: 'booleano', expr: "(ap.status = 'pendente' AND ap.vencimento < CURDATE())" },
    valor_bruto:      moeda('Valor bruto', 'ap.valor_bruto'),
    honorario:        moeda('Honorário', 'ap.honor_valor'),
    valor_liquido:    moeda('Valor líquido (cliente)', 'ap.valor_liquido'),
    parceria:         moeda('Valor da parceria', 'ap.parceria_valor'),
    parceiro:         { rotulo: 'Parceiro',            tipo: 'texto', agrupavel: true, expr: PARCEIRO_EXPR },
    recebido_em:      { rotulo: 'Recebida em',         tipo: 'data',  expr: 'ap.recebido_em' },
    forma_recebimento:{ rotulo: 'Forma de recebimento', tipo: 'lista', expr: 'fp.nome', exprFiltro: 'fp.id', juncoes: ['fp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM forma_pagamento WHERE ativo = 1 ORDER BY nome') },
    conta_recebimento:{ rotulo: 'Conta do escritório que recebeu', tipo: 'lista', expr: 'cf.nome', exprFiltro: 'cf.id', juncoes: ['cf'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM conta_financeira WHERE ativo = 1 ORDER BY nome') },
    repasse_cliente_em:  { rotulo: 'Repasse ao cliente em',  tipo: 'data', expr: 'ap.repasse_cliente_em' },
    repasse_parceiro_em: { rotulo: 'Repasse ao parceiro em', tipo: 'data', expr: 'ap.repasse_parceiro_em' },
    repasse_cliente_pendente:  { rotulo: 'Repasse ao cliente pendente',  tipo: 'booleano', expr: "(ap.status = 'pago' AND ap.valor_liquido > 0 AND ap.repasse_cliente_em IS NULL)" },
    repasse_parceiro_pendente: { rotulo: 'Repasse ao parceiro pendente', tipo: 'booleano', expr: "(ap.status = 'pago' AND ap.parceria_pessoa_id IS NOT NULL AND ap.repasse_parceiro_em IS NULL)" },
    observacao:       { rotulo: 'Observação da parcela', tipo: 'texto', expr: 'ap.observacao' },
  },
};
