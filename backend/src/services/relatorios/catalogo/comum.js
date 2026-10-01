// ============================================================
// CATÁLOGO — peças compartilhadas entre os assuntos (não duplicar lógica)
// ============================================================
const { pool } = require('../../../config/database');

// Pasta com no mínimo 4 dígitos (0042). LPAD sozinho CORTA números maiores (99001 viraria 9900),
// por isso só completa com zeros quando o número tem menos de 4 dígitos.
const PASTA_EXPR = "IF(pa.numPasta >= 1000, CAST(pa.numPasta AS CHAR), LPAD(pa.numPasta, 4, '0'))";

// Responsável que pode ser usuário do sistema OU advogado freelancer (audiências e perícias).
// A chave mistura os dois ('u5' / 'f2') porque os números das duas tabelas se repetem.
const responsavelMisto = (alias, usuario, freela) => ({
  expr: `COALESCE(${usuario}.nome, CONCAT(${freela}.nome, ' (freelancer)'))`,
  chave: `CASE WHEN ${alias}.responsavel_id IS NOT NULL THEN CONCAT('u', ${alias}.responsavel_id) WHEN ${alias}.responsavel_freela_id IS NOT NULL THEN CONCAT('f', ${alias}.responsavel_freela_id) END`,
});

// Opções do filtro "responsável" para os assuntos acima (todos os usuários + freelancers)
async function opcoesResponsaveisMistos() {
  const [usuarios] = await pool.execute('SELECT id, nome, ativo FROM usuarios ORDER BY nome');
  const [freelas] = await pool.execute('SELECT id, nome FROM advogados_freela ORDER BY nome');
  return [
    ...usuarios.map(u => ({ valor: `u${u.id}`, rotulo: u.ativo ? u.nome : `${u.nome} (inativo)` })),
    ...freelas.map(f => ({ valor: `f${f.id}`, rotulo: `${f.nome} (freelancer)` })),
  ];
}

const opcoesLista = (rotulos) => () => Object.entries(rotulos).map(([valor, rotulo]) => ({ valor, rotulo }));

module.exports = { PASTA_EXPR, responsavelMisto, opcoesResponsaveisMistos, opcoesLista };
