// ============================================================
// CONTROLLER DE AUTENTICAÇÃO
// Login, logout e criação do primeiro admin
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { pool } = require('../config/database');
const { sucesso, erro, erroInterno, naoAutorizado } = require('../utils/response');
const { buscarPermissoesUsuario } = require('../middleware/permissoes');
const { enviarEmail, templateResetSenha } = require('../utils/email');

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

// POST /api/auth/esqueci-senha
// Recebe login ou e-mail, gera token e envia link por e-mail.
// Responde sempre com sucesso genérico (não revela se o usuário existe).
async function esqueciSenha(req, res) {
  try {
    const { loginOuEmail } = req.body;
    if (!loginOuEmail?.trim()) return erro(res, 'Informe o login ou e-mail cadastrado');

    // Busca o usuário pelo login OU e-mail
    const [rows] = await pool.execute(
      'SELECT id, nome, email FROM usuarios WHERE (login = ? OR email = ?) AND ativo = 1 LIMIT 1',
      [loginOuEmail.trim(), loginOuEmail.trim()]
    );

    // Resposta genérica — não informa se o usuário existe (segurança)
    const MSG_GENERICA = 'Se o login ou e-mail estiver cadastrado, você receberá um e-mail com o link de redefinição.';

    if (!rows.length) return sucesso(res, null, MSG_GENERICA);

    const usuario = rows[0];
    if (!usuario.email) {
      return erro(res, 'Este usuário não possui e-mail cadastrado. Solicite ao administrador para redefinir sua senha.');
    }

    // Invalida tokens anteriores deste usuário
    await pool.execute('UPDATE reset_tokens SET usado = 1 WHERE usuario_id = ?', [usuario.id]);

    // Gera token seguro (32 bytes = 64 hex chars)
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.execute(
      'INSERT INTO reset_tokens (usuario_id, token, expires_at) VALUES (?, ?, ?)',
      [usuario.id, token, expiresAt]
    );

    // Busca nome do escritório para o e-mail
    const [conf] = await pool.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1');
    const escritorio = conf[0]?.nome || 'Sistema de Advocacia';

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/redefinir-senha?token=${token}`;

    await enviarEmail({
      para:    usuario.email,
      assunto: `${escritorio} — Redefinição de senha`,
      html:    templateResetSenha({ nome: usuario.nome, link, escritorio }),
      linkDev: link, // usado somente em modo dev sem SMTP
    });

    return sucesso(res, null, MSG_GENERICA);
  } catch (err) {
    console.error('Erro ao enviar e-mail de redefinição:', err.message);
    return erro(res, 'Erro ao enviar e-mail. Solicite ao administrador para redefinir sua senha.');
  }
}

// GET /api/auth/validar-token/:token
// Verifica se um token de redefinição é válido e não expirou.
async function validarToken(req, res) {
  try {
    const { token } = req.params;
    const [rows] = await pool.execute(
      `SELECT rt.id, u.nome FROM reset_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token = ? AND rt.usado = 0 AND rt.expires_at > NOW()`,
      [token]
    );
    if (!rows.length) return erro(res, 'Link inválido ou expirado. Solicite um novo link.');
    return sucesso(res, { nome: rows[0].nome }, 'Token válido');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/auth/redefinir-senha
// Recebe token + nova senha, atualiza o hash e invalida o token.
async function redefinirSenha(req, res) {
  try {
    const { token, senha } = req.body;
    if (!token || !senha) return erro(res, 'Token e nova senha são obrigatórios');
    if (senha.length < 6)  return erro(res, 'A senha deve ter no mínimo 6 caracteres');

    const [rows] = await pool.execute(
      `SELECT rt.id, rt.usuario_id FROM reset_tokens rt
       WHERE rt.token = ? AND rt.usado = 0 AND rt.expires_at > NOW()`,
      [token]
    );
    if (!rows.length) return erro(res, 'Link inválido ou expirado. Solicite um novo link.');

    const { id: tokenId, usuario_id } = rows[0];
    const novoHash = await bcrypt.hash(senha, 12);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [novoHash, usuario_id]);
      await conn.execute('UPDATE reset_tokens SET usado = 1 WHERE id = ?',  [tokenId]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return sucesso(res, null, 'Senha redefinida com sucesso! Você já pode fazer login.');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/trocar-senha — Usuário troca a própria senha (exige senha atual)
async function trocarSenha(req, res) {
  try {
    const { senha_atual, nova_senha, confirmar_senha } = req.body;

    if (!senha_atual || !nova_senha || !confirmar_senha) {
      return erro(res, 'Preencha todos os campos');
    }
    if (nova_senha.length < 6) {
      return erro(res, 'A nova senha deve ter no mínimo 6 caracteres');
    }
    if (nova_senha !== confirmar_senha) {
      return erro(res, 'A nova senha e a confirmação não coincidem');
    }

    // Busca o hash atual do usuário logado
    const [rows] = await pool.execute(
      'SELECT senha_hash FROM usuarios WHERE id = ?',
      [req.usuario.id]
    );
    if (!rows.length) return erro(res, 'Usuário não encontrado');

    // Verifica se a senha atual está correta
    const senhaCorreta = await bcrypt.compare(senha_atual, rows[0].senha_hash);
    if (!senhaCorreta) return erro(res, 'Senha atual incorreta');

    const novoHash = await bcrypt.hash(nova_senha, 12);
    await pool.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [novoHash, req.usuario.id]);

    return sucesso(res, null, 'Senha alterada com sucesso!');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { login, criarPrimeiroAdmin, verificarToken, esqueciSenha, validarToken, redefinirSenha, trocarSenha };
