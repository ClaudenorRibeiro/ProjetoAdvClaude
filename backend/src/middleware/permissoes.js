// ============================================================
// MIDDLEWARE DE PERMISSÕES GRANULARES
// Verifica se o usuário tem permissão específica para a ação
// ============================================================

const { pool } = require('../config/database');
const { proibido, erroInterno } = require('../utils/response');

// Retorna um middleware que verifica se o usuário tem a permissão solicitada
//
// Assinaturas aceitas:
//   verificarPermissao('pessoas', 'cadastrar')
//   verificarPermissao('processos', 'andamentos', 'cadastrar')  ← com sub-módulo
//
// modulo:    nome do módulo  (ex: 'pessoas', 'processos')
// submodulo: sub-módulo opcional (ex: 'andamentos', 'prazos') — passar null se não houver
// acao:      ação solicitada ('visualizar', 'cadastrar', 'alterar', 'excluir')
function verificarPermissao(modulo, submoduloOuAcao, acaoOpcional) {
  // Suporte à assinatura antiga: verificarPermissao(modulo, acao)
  const submodulo = acaoOpcional ? submoduloOuAcao : null;
  const acao      = acaoOpcional ? acaoOpcional    : submoduloOuAcao;

  return async (req, res, next) => {
    try {
      if (await temPermissao(req.usuario, modulo, submodulo, acao)) return next();
      const alvo = submodulo ? `${modulo}/${submodulo}` : modulo;
      return proibido(res, `Sem permissão para ${acao} em ${alvo}`);
    } catch (err) {
      return erroInterno(res, err);
    }
  };
}

// Mesma regra do middleware acima, mas como função direta (sem req/res) — para telas que precisam saber,
// DENTRO de outra rota, se o usuário enxergaria um recurso (ex.: Publicações mostrando aviso de Vigilância
// só para quem tem "vigilancias/visualizar"). `submodulo` pode ser null.
async function temPermissao(usuario, modulo, submodulo, acao) {
  // Superusuário (nível 0) e Admin (nível 1) têm acesso irrestrito.
  // Number() garante que string "1" (improvável mas possível em tokens antigos) também passe.
  if (Number(usuario.nivel) <= 1) return true;

  let query, params;
  if (submodulo) {
    query  = `SELECT permitido FROM permissoes
              WHERE usuario_id = ? AND modulo = ? AND submodulo = ? AND acao = ?`;
    params = [usuario.id, modulo, submodulo, acao];
  } else {
    query  = `SELECT permitido FROM permissoes
              WHERE usuario_id = ? AND modulo = ? AND submodulo IS NULL AND acao = ?`;
    params = [usuario.id, modulo, acao];
  }
  const [rows] = await pool.execute(query, params);
  // Number() garante que TINYINT(1) retornado como boolean true/false pelo MySQL2
  // também seja comparado corretamente (true !== 1 seria verdadeiro com ===)
  return rows.length > 0 && Number(rows[0].permitido) === 1;
}

// Busca todas as permissões de um usuário (usado no login para montar o menu)
// Retorna objeto com chave composta para sub-módulos: 'processos.andamentos'
// Exemplo: { pessoas: { visualizar: true }, 'processos.andamentos': { cadastrar: false } }
async function buscarPermissoesUsuario(usuarioId) {
  const [rows] = await pool.execute(
    'SELECT modulo, submodulo, acao, permitido FROM permissoes WHERE usuario_id = ?',
    [usuarioId]
  );
  const permissoes = {};
  rows.forEach(r => {
    // Módulos com sub-módulo usam chave 'modulo.submodulo' (ex: 'processos.andamentos')
    const chave = r.submodulo ? `${r.modulo}.${r.submodulo}` : r.modulo;
    if (!permissoes[chave]) permissoes[chave] = {};
    permissoes[chave][r.acao] = r.permitido === 1;
  });
  return permissoes;
}

module.exports = { verificarPermissao, buscarPermissoesUsuario, temPermissao };
