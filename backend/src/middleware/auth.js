// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO — Verifica o token JWT
// Todo acesso às rotas protegidas passa por aqui primeiro
// ============================================================

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { naoAutorizado, erroInterno } = require('../utils/response');

// Verifica se o token JWT é válido E reconfere o cadastro atual do usuário no banco
// (nível + se segue ativo). Reconferir no banco garante que rebaixar ou desativar um
// usuário valha IMEDIATAMENTE, sem esperar o token (crachá) expirar — fecha a brecha
// do usuário demitido/rebaixado que continuava com acesso por horas.
async function autenticar(req, res, next) {
  // O token deve vir no header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Pega só a parte depois de "Bearer"

  if (!token) {
    return naoAutorizado(res, 'Token de acesso não informado');
  }

  // 1) Valida a assinatura e a validade do token
  let dados;
  try {
    dados = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return naoAutorizado(res, 'Token inválido ou expirado. Faça login novamente.');
  }

  // 2) Reconfere o cadastro ATUAL no banco (o token guarda os dados do momento do login)
  try {
    const [rows] = await pool.execute(
      'SELECT nivel, tipo, ver_todos_processos FROM usuarios WHERE id = ? AND ativo = 1',
      [dados.id]
    );
    // Sem linha = usuário desativado, excluído ou inexistente → desloga (precisa entrar de novo)
    if (!rows.length) {
      return naoAutorizado(res, 'Sua sessão não é mais válida. Faça login novamente.');
    }
    // Sincroniza os dados de acesso com o valor ATUAL do banco (sobrepõe os do token)
    req.usuario = {
      ...dados,
      nivel:               rows[0].nivel,
      tipo:                rows[0].tipo,
      ver_todos_processos: rows[0].ver_todos_processos,
    };
    next(); // Passa para o próximo middleware ou controller
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Middleware especial: verifica se é o superusuário
function apenasSuper(req, res, next) {
  if (!req.usuario || req.usuario.nivel !== 0) {
    return naoAutorizado(res, 'Acesso restrito ao superusuário');
  }
  next();
}

// Middleware: verifica se é admin (nível 1) ou superusuário (nível 0)
function apenasAdmin(req, res, next) {
  if (!req.usuario || req.usuario.nivel > 1) {
    return naoAutorizado(res, 'Acesso restrito a administradores');
  }
  next();
}

module.exports = { autenticar, apenasSuper, apenasAdmin };
