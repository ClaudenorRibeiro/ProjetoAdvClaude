// ============================================================
// CATÁLOGO — assunto PESSOAS JURÍDICAS (tabela pessoas_juridicas)
// A tela de Pessoas mostra só as ativas e não tem "ver todos": o relatório segue a mesma regra.
// ============================================================
const PRINCIPAL = (tabela, coluna) => `(SELECT x.${coluna} FROM ${tabela} x WHERE x.pessoa_id = pj.id AND x.ativo = 1 ORDER BY x.principal DESC, x.id ASC LIMIT 1)`;

module.exports = {
  chave: 'pessoas_juridicas',
  rotulo: 'Pessoas jurídicas',
  permissao: { chave: 'pessoas', acao: 'visualizar' },
  from: 'pessoas_juridicas pj',
  pk: 'pj.id',
  juncoes: [
    { id: 'uc', sql: 'LEFT JOIN usuarios uc ON uc.id = pj.criado_por' },
  ],
  colunasPadrao: ['razao_social', 'nome_fantasia', 'cnpj', 'telefone', 'email', 'cidade'],
  ordemPadrao: [{ campo: 'razao_social', direcao: 'asc' }],
  visibilidade: () => ({ sql: 'pj.ativo = 1', params: [], juncoes: [] }),
  campos: {
    razao_social:     { rotulo: 'Razão social',        tipo: 'texto', expr: 'pj.razao_social' },
    nome_fantasia:    { rotulo: 'Nome fantasia',       tipo: 'texto', expr: 'pj.nome_fantasia' },
    cnpj:             { rotulo: 'CNPJ',                tipo: 'texto', expr: 'pj.cnpj' },
    recuperacao:      { rotulo: 'Em recuperação judicial', tipo: 'booleano', expr: 'pj.em_recuperacao_judicial' },
    inscricao:        { rotulo: 'Inscrição estadual',  tipo: 'texto', expr: 'pj.inscricao_estadual' },
    cidade:           { rotulo: 'Cidade',              tipo: 'texto', agrupavel: true, expr: 'pj.cidade' },
    estado:           { rotulo: 'Estado (UF)',         tipo: 'texto', agrupavel: true, expr: 'pj.estado' },
    bairro:           { rotulo: 'Bairro',              tipo: 'texto', agrupavel: true, expr: 'pj.bairro' },
    cep:              { rotulo: 'CEP',                 tipo: 'texto', expr: 'pj.cep' },
    telefone:         { rotulo: 'Telefone principal',  tipo: 'texto', expr: PRINCIPAL('telefones_pj', 'numero') },
    email:            { rotulo: 'E-mail principal',    tipo: 'texto', expr: PRINCIPAL('emails_pj', 'email') },
    qtde_processos:   { rotulo: 'Quantidade de processos', tipo: 'numero', expr: "(SELECT COUNT(*) FROM (SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id UNION SELECT proc_id FROM tbltituloprocreu WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id) t)" },
    observacoes:      { rotulo: 'Observações',         tipo: 'texto', expr: 'pj.observacoes' },
    criado_por:       { rotulo: 'Cadastrada por',      tipo: 'texto', agrupavel: true, expr: 'uc.nome', juncoes: ['uc'] },
    criado_em:        { rotulo: 'Cadastrada em',       tipo: 'datahora', expr: 'pj.criado_em' },
  },
};
