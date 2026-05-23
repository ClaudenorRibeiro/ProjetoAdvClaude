// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO — Verifica o token JWT
// Todo acesso às rotas protegidas passa por aqui primeiro
// ============================================================

const jwt = require('jsonwebtoken');
const { naoAutorizado } = require('../utils/response');

// Verifica se o token JWT enviado no header Authorization é válido
function autenticar(req, res, next) {
  // O token deve vir no header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Pega só a parte depois de "Bearer"

  if (!token) {
    return naoAutorizado(res, 'Token de acesso não informado');
  }

  try {
    // Decodifica o token e extrai os dados do usuário
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = dados; // Disponibiliza os dados do usuário para a rota
    next(); // Passa para o próximo middleware ou controller
  } catch (err) {
    return naoAutorizado(res, 'Token inválido ou expirado. Faça login novamente.');
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
