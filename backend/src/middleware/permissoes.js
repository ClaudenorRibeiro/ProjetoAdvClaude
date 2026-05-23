// ============================================================
// MIDDLEWARE DE PERMISSÕES GRANULARES
// Verifica se o usuário tem permissão específica para a ação
// ============================================================

const { pool } = require('../config/database');
const { proibido, erroInterno } = require('../utils/response');

// Retorna um middleware que verifica se o usuário tem a permissão solicitada
// Uso: router.post('/pessoas', autenticar, verificarPermissao('pessoas', 'cadastrar'), controller)
//
// modulo: nome do módulo (ex: 'pessoas', 'processos', 'prazos')
// acao:   ação solicitada ('visualizar', 'cadastrar', 'alterar', 'excluir')
function verificarPermissao(modulo, acao) {
  return async (req, res, next) => {
    try {
      // Superusuário (nível 0) tem acesso irrestrito a tudo
      if (req.usuario.nivel === 0) return next();

      // Admin (nível 1) tem acesso a tudo exceto ações de superusuário
      if (req.usuario.nivel === 1) return next();

      // Para demais usuários, consulta a tabela de permissões
      const [rows] = await pool.execute(
        `SELECT permitido FROM permissoes
         WHERE usuario_id = ? AND modulo = ? AND acao = ?`,
        [req.usuario.id, modulo, acao]
      );

      // Se não encontrou a permissão ou ela está bloqueada
      if (!rows.length || rows[0].permitido !== 1) {
        return proibido(res, `Sem permissão para ${acao} em ${modulo}`);
      }

      next();
    } catch (err) {
      return erroInterno(res, err);
    }
  };
}

// Busca todas as permissões de um usuário (usado no login para montar o menu)
async function buscarPermissoesUsuario(usuarioId) {
  const [rows] = await pool.execute(
    'SELECT modulo, acao, permitido FROM permissoes WHERE usuario_id = ?',
    [usuarioId]
  );
  // Transforma em objeto: { pessoas: { visualizar: true, cadastrar: false, ... }, ... }
  const permissoes = {};
  rows.forEach(r => {
    if (!permissoes[r.modulo]) permissoes[r.modulo] = {};
    permissoes[r.modulo][r.acao] = r.permitido === 1;
  });
  return permissoes;
}

module.exports = { verificarPermissao, buscarPermissoesUsuario };
