// ============================================================
// CATÁLOGO — assunto PESSOAS FÍSICAS (tabela pessoas_fisicas)
// A tela de Pessoas mostra só as ativas e não tem "ver todos": o relatório segue a mesma regra.
// "É cliente" e "Próximo aniversário" reaproveitam as regras de Aniversariantes (nada copiado).
// ============================================================
const { opcoesTabela } = require('../visibilidade');
const { opcoesLista } = require('./comum');
const { SUB_CLIENTES_PF, PROX_ANIV } = require('../../../controllers/pessoasController');

const MESES = { 1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro' };
const PRINCIPAL = (tabela, coluna) => `(SELECT x.${coluna} FROM ${tabela} x WHERE x.pessoa_id = pf.id AND x.ativo = 1 ORDER BY x.principal DESC, x.id ASC LIMIT 1)`;
const PROX = PROX_ANIV.replace(/\s+/g, ' ').trim();
const lookup = (tabela) => () => opcoesTabela(`SELECT id, nome FROM ${tabela} ORDER BY nome`);

module.exports = {
  chave: 'pessoas_fisicas',
  rotulo: 'Pessoas físicas',
  permissao: { chave: 'pessoas', acao: 'visualizar' },
  from: 'pessoas_fisicas pf',
  pk: 'pf.id',
  juncoes: [
    { id: 'ec',  sql: 'LEFT JOIN estado_civil ec ON ec.id = pf.estado_civil_id' },
    { id: 'ge',  sql: 'LEFT JOIN genero ge ON ge.id = pf.genero_id' },
    { id: 'pro', sql: 'LEFT JOIN profissao pro ON pro.id = pf.profissao_id' },
    { id: 'na',  sql: 'LEFT JOIN nacionalidade na ON na.id = pf.nacionalidade_id' },
    { id: 'uc',  sql: 'LEFT JOIN usuarios uc ON uc.id = pf.criado_por' },
  ],
  // ações por linha (menu ⋮ do resultado): só aparecem para quem pode alterar Pessoas
  acoes: [{ chave: 'parabenizar', permissao: { chave: 'pessoas', acao: 'alterar' } }],
  colunasPadrao: ['nome', 'cpf', 'data_nascimento', 'telefone', 'email', 'cidade'],
  ordemPadrao: [{ campo: 'nome', direcao: 'asc' }],
  visibilidade: () => ({ sql: 'pf.ativo = 1', params: [], juncoes: [] }),
  campos: {
    nome:             { rotulo: 'Nome',                tipo: 'texto', expr: 'pf.nome' },
    cpf:              { rotulo: 'CPF',                 tipo: 'texto', expr: 'pf.cpf' },
    rg:               { rotulo: 'RG',                  tipo: 'texto', expr: 'pf.rg' },
    data_nascimento:  { rotulo: 'Data de nascimento',  tipo: 'data',  expr: 'pf.data_nascimento' },
    idade:            { rotulo: 'Idade (anos)',        tipo: 'numero', expr: 'TIMESTAMPDIFF(YEAR, pf.data_nascimento, CURDATE())' },
    mes_aniversario:  { rotulo: 'Mês do aniversário',  tipo: 'lista', expr: 'MONTH(pf.data_nascimento)', rotulosValor: MESES,
                        opcoes: opcoesLista(Object.fromEntries(Object.entries(MESES).map(([n, m]) => [String(n), m]))) },
    aniversario:      { rotulo: 'Dia/mês do aniversário', tipo: 'texto', agrupavel: true, expr: "DATE_FORMAT(pf.data_nascimento, '%d/%m')" },
    proximo_aniversario: { rotulo: 'Próximo aniversário', tipo: 'data', expr: `IF(pf.data_nascimento IS NULL, NULL, ${PROX})` },
    idade_completa:   { rotulo: 'Idade que completa', tipo: 'numero', expr: `(YEAR(${PROX}) - YEAR(pf.data_nascimento))` },
    parabenizado:     { rotulo: 'Já parabenizado neste aniversário', tipo: 'booleano', expr: `EXISTS (SELECT 1 FROM parabens_enviados pb WHERE pb.pessoa_id = pf.id AND pb.ano = YEAR(${PROX}))` },
    estado_civil:     { rotulo: 'Estado civil',        tipo: 'lista', expr: 'ec.nome', exprFiltro: 'ec.id', juncoes: ['ec'], opcoes: lookup('estado_civil') },
    genero:           { rotulo: 'Gênero',              tipo: 'lista', expr: 'ge.nome', exprFiltro: 'ge.id', juncoes: ['ge'], opcoes: lookup('genero') },
    profissao:        { rotulo: 'Profissão',           tipo: 'lista', expr: 'pro.nome', exprFiltro: 'pro.id', juncoes: ['pro'], opcoes: lookup('profissao') },
    nacionalidade:    { rotulo: 'Nacionalidade',       tipo: 'lista', expr: 'na.nome', exprFiltro: 'na.id', juncoes: ['na'], opcoes: lookup('nacionalidade') },
    cidade:           { rotulo: 'Cidade',              tipo: 'texto', agrupavel: true, expr: 'pf.cidade' },
    estado:           { rotulo: 'Estado (UF)',         tipo: 'texto', agrupavel: true, expr: 'pf.estado' },
    bairro:           { rotulo: 'Bairro',              tipo: 'texto', agrupavel: true, expr: 'pf.bairro' },
    cep:              { rotulo: 'CEP',                 tipo: 'texto', expr: 'pf.cep' },
    telefone:         { rotulo: 'Telefone principal',  tipo: 'texto', expr: PRINCIPAL('telefones_pf', 'numero') },
    email:            { rotulo: 'E-mail principal',    tipo: 'texto', expr: PRINCIPAL('emails_pf', 'email') },
    cliente:          { rotulo: 'É cliente (parte do cliente em processo ativo)', tipo: 'booleano', expr: `(pf.id IN (${SUB_CLIENTES_PF}))` },
    qtde_processos:   { rotulo: 'Quantidade de processos', tipo: 'numero', expr: "(SELECT COUNT(*) FROM (SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id UNION SELECT proc_id FROM tbltituloprocreu WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id) t)" },
    observacoes:      { rotulo: 'Observações',         tipo: 'texto', expr: 'pf.observacoes' },
    criado_por:       { rotulo: 'Cadastrada por',      tipo: 'texto', agrupavel: true, expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Cadastrada em',       tipo: 'datahora', expr: 'pf.criado_em' },
  },
};
