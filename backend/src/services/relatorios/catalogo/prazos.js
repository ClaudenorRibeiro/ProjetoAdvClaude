// ============================================================
// CATÁLOGO — assunto PRAZOS (tabela prazos_processo)
// Diz ao motor o que existe, como ler cada campo e quem pode ver o quê.
// ============================================================
const { restringirPorResponsavel, opcoesUsuarios, opcoesTabela } = require('../visibilidade');

// Mesma regra da tela de Prazos para o status exibido
const STATUS_EXPR = `CASE WHEN pp.status = 'concluido' THEN 'concluido' WHEN pp.status = 'cancelado' THEN 'cancelado' WHEN pp.data_vencimento < CURDATE() THEN 'atrasado' WHEN pp.data_vencimento = CURDATE() THEN 'pendente' ELSE 'agendado' END`;
const ROTULOS_STATUS = { concluido: 'Concluído', cancelado: 'Cancelado', atrasado: 'Atrasado', pendente: 'Vence hoje', agendado: 'Agendado' };

const { PASTA_EXPR } = require('./comum');

module.exports = {
  chave: 'prazos',
  rotulo: 'Prazos',
  permissao: { chave: 'prazos', acao: 'visualizar' }, // quem pode usar este assunto
  from: 'prazos_processo pp',
  pk: 'pp.id',
  juncoes: [
    { id: 'pr',  obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = pp.processo_id' },
    { id: 'pa',  obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'ps',  sql: 'LEFT JOIN prazo_subtipo ps ON ps.id = pp.subtipo_id' },
    { id: 'tp',  sql: 'LEFT JOIN tipo_prazo tp ON tp.id = ps.tipo_prazo_id', depende: ['ps'] },
    { id: 'ur',  sql: 'LEFT JOIN usuarios ur ON ur.id = pp.delegado_para' },
    { id: 'uc',  sql: 'LEFT JOIN usuarios uc ON uc.id = pp.criado_por' },
    { id: 'ucl', sql: 'LEFT JOIN usuarios ucl ON ucl.id = pp.concluido_por' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] }, // id da pasta, para a tela abrir a pasta ao clicar
  colunasPadrao: ['pasta', 'processo', 'subtipo', 'vencimento', 'status', 'responsavel'],
  ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
  visibilidade: (ctx) => restringirPorResponsavel(ctx, 'prazos', 'pp.delegado_para'),
  campos: {
    pasta:            { rotulo: 'Pasta',             tipo: 'texto', agrupavel: true,  expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',          tipo: 'texto', agrupavel: true,  expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo', tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    tipo_prazo:       { rotulo: 'Tipo de prazo',     tipo: 'lista',  expr: 'tp.nome', exprFiltro: 'tp.id', juncoes: ['tp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tipo_prazo WHERE ativo = 1 ORDER BY nome') },
    subtipo:          { rotulo: 'Subtipo',           tipo: 'lista',  expr: 'ps.nome', exprFiltro: 'ps.id', juncoes: ['ps'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM prazo_subtipo WHERE ativo = 1 ORDER BY nome') },
    descricao:        { rotulo: 'Descrição',         tipo: 'texto',  expr: 'pp.descricao' },
    data_inicio:      { rotulo: 'Data de início',    tipo: 'data',   expr: 'pp.data_inicio' },
    quantidade:       { rotulo: 'Quantidade de dias', tipo: 'numero', expr: 'pp.quantidade' },
    tipo_dias:        { rotulo: 'Tipo de dias',      tipo: 'lista',  expr: 'pp.tipo_dias',
                        rotulosValor: { uteis: 'Úteis', corridos: 'Corridos' },
                        opcoes: () => [{ valor: 'uteis', rotulo: 'Úteis' }, { valor: 'corridos', rotulo: 'Corridos' }] },
    vencimento:       { rotulo: 'Vencimento',        tipo: 'data',   expr: 'pp.data_vencimento' },
    status:           { rotulo: 'Status',            tipo: 'lista',  expr: STATUS_EXPR, rotulosValor: ROTULOS_STATUS,
                        opcoes: () => Object.entries(ROTULOS_STATUS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    responsavel:      { rotulo: 'Responsável',       tipo: 'lista',  expr: 'ur.nome', exprFiltro: 'pp.delegado_para', juncoes: ['ur'],
                        opcoes: (ctx) => opcoesUsuarios(ctx, 'prazos') },
    criado_por:       { rotulo: 'Criado por',        tipo: 'texto', agrupavel: true,  expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Criado em',         tipo: 'datahora', expr: 'pp.criado_em' },
    concluido_por:    { rotulo: 'Concluído por',     tipo: 'texto', agrupavel: true,  expr: 'ucl.nome', juncoes: ['ucl'] },
    concluido_em:     { rotulo: 'Concluído em',      tipo: 'datahora', expr: 'pp.concluido_em' },
    motivo_cancelamento: { rotulo: 'Motivo do cancelamento', tipo: 'texto', expr: 'pp.motivo_cancelamento' },
  },
};
