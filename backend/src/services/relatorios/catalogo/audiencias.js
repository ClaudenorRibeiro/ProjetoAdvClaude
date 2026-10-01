// ============================================================
// CATÁLOGO — assunto AUDIÊNCIAS (tabela audiencia)
// A tela de Audiências não tem "ver todos": quem tem permissão no módulo vê todas.
// O relatório segue a mesma regra (visibilidade nula).
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, responsavelMisto, opcoesResponsaveisMistos, opcoesLista } = require('./comum');

const ROTULOS_STATUS = { agendada: 'Agendada', realizada: 'Realizada', remarcada: 'Remarcada', cancelada: 'Cancelada', adiada: 'Adiada', acordo: 'Acordo' };
const STATUS_ATIVOS = { agendada: 'Agendada', realizada: 'Realizada', remarcada: 'Remarcada', cancelada: 'Cancelada' }; // "adiada"/"acordo" foram aposentados na tela
const ROTULOS_MODALIDADE = { presencial: 'Presencial', virtual: 'Virtual', sem_comparecimento: 'Sem comparecimento' };
const resp = responsavelMisto('a', 'ur', 'rf');

module.exports = {
  chave: 'audiencias',
  rotulo: 'Audiências',
  permissao: { chave: 'audiencias', acao: 'visualizar' },
  from: 'audiencia a',
  pk: 'a.id',
  juncoes: [
    { id: 'pr', obrigatoria: true, sql: 'JOIN tblproc pr ON pr.id = a.processo_id' },
    { id: 'pa', obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id', depende: ['pr'] },
    { id: 'ta', sql: 'LEFT JOIN tipo_audiencia ta ON ta.id = a.tipo_audiencia_id' },
    { id: 'ur', sql: 'LEFT JOIN usuarios ur ON ur.id = a.responsavel_id' },
    { id: 'rf', sql: 'LEFT JOIN advogados_freela rf ON rf.id = a.responsavel_freela_id' },
    { id: 'vr', sql: 'LEFT JOIN tblvara vr ON vr.id = a.vara_id' },
    { id: 'fr', sql: 'LEFT JOIN tblforum fr ON fr.id = vr.forum_id', depende: ['vr'] },
    { id: 'uc', sql: 'LEFT JOIN usuarios uc ON uc.id = a.criado_por' },
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'tipo', 'data', 'hora', 'modalidade', 'status', 'responsavel'],
  ordemPadrao: [{ campo: 'data', direcao: 'asc' }, { campo: 'hora', direcao: 'asc' }],
  visibilidade: () => null,
  campos: {
    pasta:            { rotulo: 'Pasta',              tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',           tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    titulo_processo:  { rotulo: 'Título do processo', tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    tipo:             { rotulo: 'Tipo de audiência',  tipo: 'lista', expr: 'ta.nome', exprFiltro: 'ta.id', juncoes: ['ta'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tipo_audiencia WHERE ativo = 1 ORDER BY nome') },
    data:             { rotulo: 'Data',                tipo: 'data',  expr: 'a.data' },
    hora:             { rotulo: 'Hora',                tipo: 'texto', agrupavel: true, expr: "TIME_FORMAT(a.hora, '%H:%i')" },
    modalidade:       { rotulo: 'Modalidade',          tipo: 'lista', expr: 'a.modalidade', rotulosValor: ROTULOS_MODALIDADE, opcoes: opcoesLista(ROTULOS_MODALIDADE) },
    status:           { rotulo: 'Status',              tipo: 'lista', expr: 'a.status', rotulosValor: ROTULOS_STATUS, opcoes: opcoesLista(STATUS_ATIVOS) },
    motivo_status:    { rotulo: 'Motivo do status',    tipo: 'texto', expr: 'a.motivo_status' },
    responsavel:      { rotulo: 'Responsável',         tipo: 'lista', expr: resp.expr, exprFiltro: resp.chave, juncoes: ['ur', 'rf'], opcoes: opcoesResponsaveisMistos },
    vara:             { rotulo: 'Vara',                tipo: 'texto', agrupavel: true, expr: 'vr.nome', juncoes: ['vr'] },
    forum:            { rotulo: 'Fórum',               tipo: 'texto', agrupavel: true, expr: 'fr.nome', juncoes: ['fr'] },
    local:            { rotulo: 'Local',               tipo: 'texto', expr: 'a.local' },
    plataforma:       { rotulo: 'Plataforma virtual',  tipo: 'texto', agrupavel: true, expr: 'a.plataforma_virtual' },
    observacoes:      { rotulo: 'Observações',         tipo: 'texto', expr: 'a.observacoes' },
    comunicado:       { rotulo: 'Comunicado enviado',  tipo: 'booleano', expr: 'a.comunicado_enviado' },
    ata_impressa:     { rotulo: 'Ata impressa',        tipo: 'booleano', expr: 'a.ata_impressa' },
    tem_ata:          { rotulo: 'Tem ata registrada',  tipo: 'booleano', expr: 'EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)' },
    tem_testemunha:   { rotulo: 'Tem testemunha',      tipo: 'booleano', expr: 'EXISTS (SELECT 1 FROM audiencia_testemunhas att WHERE att.audiencia_id = a.id)' },
    houve_acordo:     { rotulo: 'Houve acordo (ata)',  tipo: 'booleano', expr: 'EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id AND aa.houve_acordo = 1)' },
    valor_acordo:     { rotulo: 'Valor do acordo (ata)', tipo: 'numero', expr: '(SELECT SUM(aa.valor_acordo) FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)' },
    criado_por:       { rotulo: 'Criada por',          tipo: 'texto', agrupavel: true, expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Criada em',           tipo: 'datahora', expr: 'a.criado_em' },
  },
};
