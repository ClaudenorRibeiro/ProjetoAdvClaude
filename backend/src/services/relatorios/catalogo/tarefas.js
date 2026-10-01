// ============================================================
// CATÁLOGO — assunto TAREFAS (tabela tarefas)
// ============================================================
const { restringirPorResponsavel, opcoesUsuarios } = require('../visibilidade');

const ROTULOS_PRIORIDADE = { urgente: 'Urgente', normal: 'Normal', baixa: 'Baixa' };

// Pasta com no mínimo 4 dígitos (0042). LPAD sozinho CORTA números maiores (99001 viraria 9900),
// por isso só completa com zeros quando o número tem menos de 4 dígitos.
const PASTA_EXPR = "IF(pa.numPasta >= 1000, CAST(pa.numPasta AS CHAR), LPAD(pa.numPasta, 4, '0'))";

module.exports = {
  chave: 'tarefas',
  rotulo: 'Tarefas',
  permissao: { chave: 'tarefas', acao: 'visualizar' },
  from: 'tarefas t',
  pk: 't.id',
  juncoes: [
    { id: 'pr',  sql: 'LEFT JOIN tblproc pr ON pr.id = t.processo_id' },
    // pasta ligada direto à tarefa; se não houver, a pasta do processo vinculado
    { id: 'pa',  sql: 'LEFT JOIN tblpasta pa ON pa.id = COALESCE(t.pasta_id, pr.pasta_id)', depende: ['pr'] },
    { id: 'ua',  sql: 'LEFT JOIN usuarios ua ON ua.id = t.atribuida_para' },
    { id: 'uc',  sql: 'LEFT JOIN usuarios uc ON uc.id = t.criado_por' },
    { id: 'ucl', sql: 'LEFT JOIN usuarios ucl ON ucl.id = t.concluida_por' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] }, // id da pasta, para a tela abrir a pasta ao clicar
  colunasPadrao: ['titulo', 'pasta', 'processo', 'vencimento', 'prioridade', 'atribuida_para', 'concluida'],
  ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
  visibilidade: (ctx) => restringirPorResponsavel(ctx, 'tarefas', 't.atribuida_para'),
  campos: {
    titulo:         { rotulo: 'Título',            tipo: 'texto',  expr: 't.titulo' },
    descricao:      { rotulo: 'Descrição',         tipo: 'texto',  expr: 't.descricao' },
    prioridade:     { rotulo: 'Prioridade',        tipo: 'lista',  expr: 't.prioridade', rotulosValor: ROTULOS_PRIORIDADE,
                      opcoes: () => Object.entries(ROTULOS_PRIORIDADE).map(([valor, rotulo]) => ({ valor, rotulo })) },
    pasta:          { rotulo: 'Pasta',             tipo: 'texto', agrupavel: true,  expr: PASTA_EXPR, formato: 'pasta', juncoes: ['pa'] },
    processo:       { rotulo: 'Processo',          tipo: 'texto', agrupavel: true,  expr: 'pr.numProc', formato: 'processo', juncoes: ['pr'] },
    vencimento:     { rotulo: 'Vencimento',        tipo: 'data',   expr: 't.data_vencimento' },
    atribuida_para: { rotulo: 'Atribuída para',    tipo: 'lista',  expr: 'ua.nome', exprFiltro: 't.atribuida_para', juncoes: ['ua'],
                      opcoes: (ctx) => opcoesUsuarios(ctx, 'tarefas') },
    concluida:      { rotulo: 'Concluída',         tipo: 'booleano', expr: 't.concluida' },
    concluida_por:  { rotulo: 'Concluída por',     tipo: 'texto', agrupavel: true,  expr: 'ucl.nome', juncoes: ['ucl'] },
    concluida_em:   { rotulo: 'Concluída em',      tipo: 'datahora', expr: 't.concluida_em' },
    criado_por:     { rotulo: 'Criada por',        tipo: 'texto', agrupavel: true,  expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:      { rotulo: 'Criada em',         tipo: 'datahora', expr: 't.criado_em' },
  },
};
