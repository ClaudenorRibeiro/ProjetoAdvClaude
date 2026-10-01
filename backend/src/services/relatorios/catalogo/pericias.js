// ============================================================
// CATÁLOGO — assunto PERÍCIAS (tabela pericia)
// A tela de Perícias não tem "ver todos": quem tem permissão no módulo vê todas.
// O relatório segue a mesma regra (visibilidade nula).
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, responsavelMisto, opcoesResponsaveisMistos, opcoesLista } = require('./comum');

const ROTULOS_STATUS = { aguardando_data: 'Aguardando data', agendada: 'Agendada', realizada: 'Realizada', remarcada: 'Remarcada', cancelada: 'Cancelada' };
const resp = responsavelMisto('pe', 'ur', 'rf');

module.exports = {
  chave: 'pericias',
  rotulo: 'Perícias',
  permissao: { chave: 'pericias', acao: 'visualizar' },
  from: 'pericia pe',
  pk: 'pe.id',
  juncoes: [
    { id: 'pr',  obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = pe.processo_id' },
    { id: 'pa',  obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'tp',  sql: 'LEFT JOIN tipo_pericia tp ON tp.id = pe.tipo_pericia_id' },
    { id: 'pf',  sql: "LEFT JOIN pessoas_fisicas pf ON pe.perito_tipo = 'fisica' AND pf.id = pe.perito_id" },
    { id: 'pj',  sql: "LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pj.id = pe.perito_id" },
    { id: 'ua',  sql: 'LEFT JOIN usuarios ua ON ua.id = pe.assistente_tecnico_id' },
    { id: 'af',  sql: 'LEFT JOIN advogados_freela af ON af.id = pe.assistente_tecnico_freela_id' },
    { id: 'ur',  sql: 'LEFT JOIN usuarios ur ON ur.id = pe.responsavel_id' },
    { id: 'rf',  sql: 'LEFT JOIN advogados_freela rf ON rf.id = pe.responsavel_freela_id' },
    { id: 'uc',  sql: 'LEFT JOIN usuarios uc ON uc.id = pe.criado_por' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'tipo', 'data', 'hora', 'status', 'perito', 'responsavel'],
  ordemPadrao: [{ campo: 'data', direcao: 'asc' }],
  visibilidade: () => null,
  campos: {
    pasta:            { rotulo: 'Pasta',              tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',           tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo', tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    tipo:             { rotulo: 'Tipo de perícia',    tipo: 'lista', expr: 'tp.nome', exprFiltro: 'tp.id', juncoes: ['tp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tipo_pericia WHERE ativo = 1 ORDER BY nome') },
    data:             { rotulo: 'Data',                tipo: 'data',  expr: 'pe.data' },
    hora:             { rotulo: 'Hora',                tipo: 'texto', agrupavel: true, expr: "TIME_FORMAT(pe.hora, '%H:%i')" },
    status:           { rotulo: 'Status',              tipo: 'lista', expr: 'pe.status', rotulosValor: ROTULOS_STATUS, opcoes: opcoesLista(ROTULOS_STATUS) },
    motivo_status:    { rotulo: 'Motivo do status',    tipo: 'texto', expr: 'pe.motivo_status' },
    perito:           { rotulo: 'Perito',              tipo: 'texto', agrupavel: true, expr: 'COALESCE(pf.nome, pj.razao_social)', juncoes: ['pf', 'pj'] },
    assistente:       { rotulo: 'Assistente técnico',  tipo: 'texto', agrupavel: true, expr: "COALESCE(ua.nome, CONCAT(af.nome, ' (freelancer)'))", juncoes: ['ua', 'af'] },
    responsavel:      { rotulo: 'Responsável',         tipo: 'lista', expr: resp.expr, exprFiltro: resp.chave, juncoes: ['ur', 'rf'], opcoes: opcoesResponsaveisMistos },
    local:            { rotulo: 'Local',               tipo: 'texto', expr: 'pe.local' },
    cidade:           { rotulo: 'Cidade',              tipo: 'texto', agrupavel: true, expr: 'pe.cidade' },
    estado:           { rotulo: 'Estado (UF)',         tipo: 'texto', agrupavel: true, expr: 'pe.estado' },
    comunicado:       { rotulo: 'Comunicado enviado',  tipo: 'booleano', expr: 'pe.comunicado_enviado' },
    email_perito:     { rotulo: 'E-mail ao perito enviado', tipo: 'booleano', expr: 'pe.email_perito_enviado' },
    criado_por:       { rotulo: 'Criada por',          tipo: 'texto', agrupavel: true, expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Criada em',           tipo: 'datahora', expr: 'pe.criado_em' },
  },
};
