// ============================================================
// RELATÓRIOS — permissões e regras de visibilidade
// REGRA DE OURO: o relatório nunca mostra mais do que o usuário já vê nas telas normais.
// Admin/super (nível <= 1) passam em tudo, como no resto do sistema.
// ============================================================
const { pool } = require('../../config/database');
const { buscarPermissoesUsuario } = require('../../middleware/permissoes');
const { hojeBrasilia } = require('../../utils/helpers');

// Contexto do usuário para uma requisição (permissões lidas UMA vez)
async function criarContexto(usuario) {
  const ehAdmin = Number(usuario.nivel) <= 1;
  const permissoes = ehAdmin ? {} : await buscarPermissoesUsuario(usuario.id);
  return { usuario, id: usuario.id, ehAdmin, permissoes, hoje: hojeBrasilia() };
}

// chave: 'prazos' ou 'prazos.ver_todos' (mesmo formato do buscarPermissoesUsuario)
function pode(ctx, chave, acao) {
  return ctx.ehAdmin || ctx.permissoes[chave]?.[acao] === true;
}

// "Ver todos": sem a permissão, só os itens do próprio usuário + os do escritório (sem responsável).
// Mesma regra das telas de Prazos e Tarefas. Devolve null quando não há restrição.
function restringirPorResponsavel(ctx, modulo, coluna) {
  if (pode(ctx, `${modulo}.ver_todos`, 'visualizar')) return null;
  return { sql: `(${coluna} = ? OR ${coluna} IS NULL)`, params: [ctx.id], juncoes: [] };
}

// Opções do filtro "responsável": todos os ativos para quem vê tudo; só o próprio usuário para os demais
async function opcoesUsuarios(ctx, modulo) {
  if (!pode(ctx, `${modulo}.ver_todos`, 'visualizar')) {
    return [{ valor: String(ctx.id), rotulo: ctx.usuario.nome || 'Eu' }];
  }
  const [rows] = await pool.execute('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome');
  return rows.map(r => ({ valor: String(r.id), rotulo: r.nome }));
}

async function opcoesTabela(sql) {
  const [rows] = await pool.execute(sql);
  return rows.map(r => ({ valor: String(r.id), rotulo: r.nome }));
}

module.exports = { criarContexto, pode, restringirPorResponsavel, opcoesUsuarios, opcoesTabela };
