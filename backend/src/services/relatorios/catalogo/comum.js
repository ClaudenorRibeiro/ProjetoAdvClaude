// ============================================================
// CATÁLOGO — peças compartilhadas entre os assuntos (não duplicar lógica)
// ============================================================
const { pool } = require('../../../config/database');
const { pastaFormatadaSql } = require('../../../utils/helpers');

// Pasta com no mínimo 4 dígitos (0042), sem cortar números maiores — regra única em utils/helpers.
const PASTA_EXPR = pastaFormatadaSql('pa');

// Responsável que pode ser usuário do sistema OU advogado freelancer (audiências e perícias).
// A chave mistura os dois ('u5' / 'f2') porque os números das duas tabelas se repetem.
const responsavelMisto = (alias, usuario, freela) => ({
  expr: `COALESCE(${usuario}.nome, CONCAT(${freela}.nome, ' (freelancer)'))`,
  chave: `CASE WHEN ${alias}.responsavel_id IS NOT NULL THEN CONCAT('u', ${alias}.responsavel_id) WHEN ${alias}.responsavel_freela_id IS NOT NULL THEN CONCAT('f', ${alias}.responsavel_freela_id) END`,
});

// Todos os usuários (ativos e inativos, estes marcados) — para assuntos sem a regra "ver todos"
async function opcoesTodosUsuarios() {
  const [usuarios] = await pool.execute('SELECT id, nome, ativo FROM usuarios ORDER BY nome');
  return usuarios.map(u => ({ valor: String(u.id), rotulo: u.ativo ? u.nome : `${u.nome} (inativo)` }));
}

// Opções do filtro "responsável" para os assuntos acima (todos os usuários + freelancers)
async function opcoesResponsaveisMistos() {
  const [usuarios] = await pool.execute('SELECT id, nome, ativo FROM usuarios ORDER BY nome');
  const [freelas] = await pool.execute('SELECT id, nome FROM advogados_freela ORDER BY nome');
  return [
    ...usuarios.map(u => ({ valor: `u${u.id}`, rotulo: u.ativo ? u.nome : `${u.nome} (inativo)` })),
    ...freelas.map(f => ({ valor: `f${f.id}`, rotulo: `${f.nome} (freelancer)` })),
  ];
}

// Rótulo do tipo de acordo e "Acordo 2" / "Alvará 1" (número na ordem de criação dentro do processo — igual à tela)
const ORIGEM_ACORDO_EXPR = "CONCAT(CASE a.tipo WHEN 'alvara' THEN 'Alvará ' ELSE 'Acordo ' END, (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id))";

const opcoesLista = (rotulos) => () => Object.entries(rotulos).map(([valor, rotulo]) => ({ valor, rotulo }));

module.exports = { PASTA_EXPR, responsavelMisto, opcoesResponsaveisMistos, opcoesTodosUsuarios, opcoesLista, ORIGEM_ACORDO_EXPR };
