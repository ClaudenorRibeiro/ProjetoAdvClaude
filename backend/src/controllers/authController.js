// ============================================================
// CONTROLLER DE AUTENTICAÇÃO
// Login, logout e criação do primeiro admin
// ============================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { sucesso, erro, erroInterno, naoAutorizado } = require('../utils/response');
const { buscarPermissoesUsuario } = require('../middleware/permissoes');

// POST /api/auth/login
// Autentica o usuário e retorna o token JWT
async function login(req, res) {
  try {
    const { login: loginUsuario, senha } = req.body;

    if (!loginUsuario || !senha) {
      return erro(res, 'Login e senha são obrigatórios');
    }

    // Busca o usuário pelo login (inclui superusuário de nível 0)
    const [rows] = await pool.execute(
      'SELECT * FROM usuarios WHERE login = ? AND ativo = 1',
      [loginUsuario.trim()]
    );

    if (!rows.length) {
      return naoAutorizado(res, 'Login ou senha incorretos');
    }

    const usuario = rows[0];

    // Verifica se a senha confere com o hash salvo
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorreta) {
      return naoAutorizado(res, 'Login ou senha incorretos');
    }

    // Verifica se o setup do sistema foi concluído (exceto para superusuário)
    if (usuario.nivel > 0) {
      const [config] = await pool.execute(
        'SELECT setup_concluido FROM configuracoes_escritorio LIMIT 1'
      );
      if (!config[0]?.setup_concluido) {
        return erro(res, 'O sistema ainda não foi configurado. Acesse como administrador para concluir o setup.', 403);
      }
    }

    // Atualiza o último acesso
    await pool.execute(
      'UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?',
      [usuario.id]
    );

    // Busca permissões do usuário (para montar o menu no frontend)
    const permissoes = await buscarPermissoesUsuario(usuario.id);

    // Gera o token JWT com dados básicos do usuário
    const token = jwt.sign(
      {
        id:    usuario.id,
        nome:  usuario.nome,
        login: usuario.login,
        nivel: usuario.nivel,
        tipo:  usuario.tipo,
        ver_todos_processos: usuario.ver_todos_processos,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return sucesso(res, {
      token,
      usuario: {
        id:    usuario.id,
        nome:  usuario.nome,
        login: usuario.login,
        nivel: usuario.nivel,
        tipo:  usuario.tipo,
        oab:   usuario.oab,
        ver_todos_processos: usuario.ver_todos_processos,
      },
      permissoes,
    }, 'Login realizado com sucesso');

  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/auth/criar-admin
// Cria o primeiro usuário administrador (só funciona antes do setup concluído)
async function criarPrimeiroAdmin(req, res) {
  try {
    // Verifica se já existe um admin (nível 1)
    const [admins] = await pool.execute(
      'SELECT id FROM usuarios WHERE nivel = 1 LIMIT 1'
    );
    if (admins.length > 0) {
      return erro(res, 'Administrador já cadastrado. Use a tela de usuários para criar novos.');
    }

    const { nome, login: loginAdmin, senha, email } = req.body;
    if (!nome || !loginAdmin || !senha) {
      return erro(res, 'Nome, login e senha são obrigatórios');
    }
    if (senha.length < 6) {
      return erro(res, 'A senha deve ter no mínimo 6 caracteres');
    }

    // Verifica se o login já existe
    const [existente] = await pool.execute(
      'SELECT id FROM usuarios WHERE login = ?', [loginAdmin]
    );
    if (existente.length > 0) {
      return erro(res, 'Este login já está em uso');
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const [result] = await pool.execute(
      `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo)
       VALUES (?, ?, ?, ?, 'administrador', 1, 1)`,
      [nome.trim(), loginAdmin.trim(), senhaHash, email || null]
    );

    return sucesso(res, { id: result.insertId }, 'Administrador criado com sucesso', 201);

  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/auth/verificar
// Verifica se o token ainda é válido (usado pelo frontend ao recarregar a página)
async function verificarToken(req, res) {
  try {
    const permissoes = await buscarPermissoesUsuario(req.usuario.id);
    return sucesso(res, { usuario: req.usuario, permissoes });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { login, criarPrimeiroAdmin, verificarToken };
