// ============================================================
// CATÁLOGO — assunto FINANCEIRO · LANÇAMENTOS (conta corrente dos processos; tabela conta_corrente)
// Uma linha por lançamento (entrada ou saída). "Valor com sinal" soma como o saldo da tela:
// entrada positiva, saída negativa. Sem filtro por responsável (como a tela do Financeiro).
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, opcoesLista } = require('./comum');

const ROTULOS_TIPO = { entrada: 'Entrada', saida: 'Saída' };
const ROTULOS_ORIGEM = {
  manual: 'Lançamento manual', recebimento: 'Recebimento de parcela', rep_cliente: 'Repasse ao cliente', rep_parceiro: 'Repasse ao parceiro',
  multa: 'Recebimento de multa', multa_rep_cli: 'Repasse de multa ao cliente', multa_rep_par: 'Repasse de multa ao parceiro',
};

module.exports = {
  chave: 'financeiro_lancamentos',
  rotulo: 'Financeiro — conta corrente (lançamentos)',
  permissao: { chave: 'financeiro', acao: 'visualizar' },
  from: 'conta_corrente cc',
  pk: 'cc.id',
  juncoes: [
    { id: 'pr', obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = cc.processo_id' },
    { id: 'pa', obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'cf', sql: 'LEFT JOIN conta_financeira cf ON cf.id = cc.conta_financeira_id' },
    { id: 'u',  sql: 'LEFT JOIN usuarios u ON u.id = cc.usuario_id' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'data', 'descricao', 'tipo', 'valor'],
  ordemPadrao: [{ campo: 'data', direcao: 'asc' }],
  visibilidade: () => null,
  campos: {
    pasta:            { rotulo: 'Pasta',               tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',            tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo',  tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    data:             { rotulo: 'Data do lançamento',  tipo: 'data',  expr: 'cc.data' },
    descricao:        { rotulo: 'Descrição',           tipo: 'texto', expr: 'cc.descricao' },
    tipo:             { rotulo: 'Tipo',                tipo: 'lista', expr: 'cc.tipo', rotulosValor: ROTULOS_TIPO, opcoes: opcoesLista(ROTULOS_TIPO) },
    origem:           { rotulo: 'Origem do lançamento', tipo: 'lista', expr: 'cc.origem', rotulosValor: ROTULOS_ORIGEM, opcoes: opcoesLista(ROTULOS_ORIGEM) },
    valor:            { rotulo: 'Valor',               tipo: 'numero', formato: 'moeda', expr: 'cc.valor' },
    valor_com_sinal:  { rotulo: 'Valor com sinal (entrada +, saída −)', tipo: 'numero', formato: 'moeda',
                        expr: "(CASE WHEN cc.tipo = 'entrada' THEN cc.valor ELSE -cc.valor END)" },
    conta:            { rotulo: 'Conta do escritório', tipo: 'lista', expr: 'cf.nome', exprFiltro: 'cf.id', juncoes: ['cf'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM conta_financeira WHERE ativo = 1 ORDER BY nome') },
    usuario:          { rotulo: 'Lançado por',         tipo: 'texto', agrupavel: true, expr: 'u.nome', juncoes: ['u'] },
    criado_em:        { rotulo: 'Criado em',           tipo: 'datahora', expr: 'cc.criado_em' },
  },
};
