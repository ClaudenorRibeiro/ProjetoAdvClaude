// ============================================================
// CATÁLOGO — assunto PROCESSOS (uma linha por processo ativo; tabela tblproc)
// A tela de Processos lista pastas que têm ao menos um processo ativo; aqui a linha é o
// processo. Sem "ver todos": quem tem permissão no módulo vê todos (mesma regra da tela).
// "Última movimentação" e "Dias parado" reaproveitam a regra de Processos parados
// (a mesma do Dashboard) — nada de copiar lógica.
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { PASTA_EXPR, opcoesTodosUsuarios, opcoesLista } = require('./comum');
const { JOIN_ULTIMA_ACAO } = require('../../../controllers/processosController');

const ROTULOS_POLO = { autor: 'Cliente é autor', reu: 'Cliente é réu' };
const ULTIMA_EXPR = 'DATE(COALESCE(ult.ultima, pr.criado_em))';

module.exports = {
  chave: 'processos',
  rotulo: 'Processos',
  permissao: { chave: 'processos', acao: 'visualizar' },
  from: 'tblproc pr',
  pk: 'pr.id',
  juncoes: [
    { id: 'pa',  obrigatoria: true, sql: 'JOIN tblpasta pa ON pa.id = pr.pasta_id' },
    { id: 'tp',  sql: 'LEFT JOIN tbltipoproc tp ON tp.id = pr.tipo_id' },
    { id: 'sp',  sql: 'LEFT JOIN tblstatusproc sp ON sp.id = pr.status_id' },
    { id: 'ins', sql: 'LEFT JOIN tblinstanciaproc ins ON ins.id = pr.instancia_id' },
    { id: 'vr',  sql: 'LEFT JOIN tblvara vr ON vr.id = pr.vara_id' },
    { id: 'fr',  sql: 'LEFT JOIN tblforum fr ON fr.id = vr.forum_id', depende: ['vr'] },
    { id: 'ur',  sql: 'LEFT JOIN usuarios ur ON ur.id = pr.responsavel_id' },
    { id: 'uc',  sql: 'LEFT JOIN usuarios uc ON uc.id = pr.criado_por' },
    { id: 'ult', sql: JOIN_ULTIMA_ACAO.trim() },   // mantém as quebras de linha: o fragmento tem comentários "--"
  ],
  linkPasta: { expr: 'pa.id', juncoes: ['pa'] },
  colunasPadrao: ['pasta', 'processo', 'titulo', 'tipo', 'status', 'responsavel'],
  ordemPadrao: [{ campo: 'pasta', direcao: 'desc' }],
  // a tela só mostra processos ativos: o relatório também
  visibilidade: () => ({ sql: 'pr.ativo = 1', params: [], juncoes: [] }),
  campos: {
    pasta:            { rotulo: 'Pasta',               tipo: 'texto', agrupavel: true, expr: PASTA_EXPR, formato: 'pasta' },
    processo:         { rotulo: 'Processo',            tipo: 'texto', agrupavel: true, expr: 'pr.numProc', formato: 'processo' },
    protocolo:        { rotulo: 'Protocolo',           tipo: 'texto', expr: 'pr.protocolo' },
    titulo:           { rotulo: 'Título',              tipo: 'texto', agrupavel: true, expr: 'pr.NomeTituloProc' },
    polo:             { rotulo: 'Polo do cliente',     tipo: 'lista', expr: 'pr.cliente_polo', rotulosValor: ROTULOS_POLO, opcoes: opcoesLista(ROTULOS_POLO) },
    tipo:             { rotulo: 'Tipo',                tipo: 'lista', expr: 'tp.nome', exprFiltro: 'tp.id', juncoes: ['tp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tbltipoproc WHERE ativo = 1 ORDER BY nome') },
    status:           { rotulo: 'Status',              tipo: 'lista', expr: 'sp.nome', exprFiltro: 'sp.id', juncoes: ['sp'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tblstatusproc WHERE ativo = 1 ORDER BY nome') },
    encerrado:        { rotulo: 'Status encerra o processo', tipo: 'booleano', expr: 'COALESCE(sp.encerra_processo, 0)', juncoes: ['sp'] },
    instancia:        { rotulo: 'Instância',           tipo: 'lista', expr: 'ins.nome', exprFiltro: 'ins.id', juncoes: ['ins'],
                        opcoes: () => opcoesTabela('SELECT id, nome FROM tblinstanciaproc WHERE ativo = 1 ORDER BY nome') },
    vara:             { rotulo: 'Vara',                tipo: 'texto', agrupavel: true, expr: 'vr.nome', juncoes: ['vr'] },
    forum:            { rotulo: 'Fórum',               tipo: 'texto', agrupavel: true, expr: 'fr.nome', juncoes: ['fr'] },
    data_distribuicao:{ rotulo: 'Data de distribuição', tipo: 'data',  expr: 'pr.data_distribuicao' },
    responsavel:      { rotulo: 'Responsável',         tipo: 'lista', expr: 'ur.nome', exprFiltro: 'pr.responsavel_id', juncoes: ['ur'], opcoes: opcoesTodosUsuarios },
    oab:              { rotulo: 'OAB do processo',     tipo: 'texto', agrupavel: true, expr: 'pr.oab_processo' },
    observacoes:      { rotulo: 'Observações',         tipo: 'texto', expr: 'pr.observacoes' },
    ultima_movimentacao: { rotulo: 'Última movimentação', tipo: 'data', expr: ULTIMA_EXPR, juncoes: ['ult'] },
    dias_parado:      { rotulo: 'Dias sem movimentação', tipo: 'numero', expr: `DATEDIFF(CURDATE(), ${ULTIMA_EXPR})`, juncoes: ['ult'] },
    sincronizado_em:  { rotulo: 'Sincronizado com o DataJud em', tipo: 'datahora', expr: 'pr.datajud_sincronizado_em' },
    criado_por:       { rotulo: 'Criado por',          tipo: 'texto', agrupavel: true, expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Criado em',           tipo: 'datahora', expr: 'pr.criado_em' },
    alterado_em:      { rotulo: 'Alterado em',         tipo: 'datahora', expr: 'pr.alterado_em' },
  },
};
