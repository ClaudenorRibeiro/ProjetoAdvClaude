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

// Cores da agenda por usuário (guardadas como JSON em usuarios.cores_agenda).
// Lê/valida com tolerância: só as 6 chaves conhecidas + hex válido; vazio/ inválido → null (padrão).
const CHAVES_CORES = ['prazo', 'audiencia', 'pericia', 'tarefa', 'compromisso', 'feriado'];
function parseCoresAgenda(valor) {
  if (!valor) return null;
  try {
    const obj = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (!obj || typeof obj !== 'object') return null;
    const limpo = {};
    for (const k of CHAVES_CORES) {
      if (typeof obj[k] === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(obj[k])) limpo[k] = obj[k];
    }
    return Object.keys(limpo).length ? limpo : null;
  } catch (e) {
    return null;
  }
}

// Cor de destaque da linha (hover das tabelas) por usuário — guardada em usuarios.cor_linha.
// É uma única cor: hex válido → devolve a cor; vazio/inválido → null (padrão do sistema).
function parseCorLinha(valor) {
  if (!valor || typeof valor !== 'string') return null;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(valor) ? valor : null;
}

// Cores do menu lateral por usuário (guardadas como JSON em usuarios.cores_menu).
// Mesma lógica tolerante: só as chaves conhecidas + hex válido; vazio/inválido → null (padrão).
const CHAVES_CORES_MENU = ['fundo', 'destaque'];
function parseCoresMenu(valor) {
  if (!valor) return null;
  try {
    const obj = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (!obj || typeof obj !== 'object') return null;
    const limpo = {};
    for (const k of CHAVES_CORES_MENU) {
      if (typeof obj[k] === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(obj[k])) limpo[k] = obj[k];
    }
    return Object.keys(limpo).length ? limpo : null;
  } catch (e) {
    return null;
  }
}

function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

// Lê o tempo de inatividade (em minutos) configurado pelo escritório.
// Piso de 15 min (regra do sistema) e TOLERANTE: se a coluna ainda não existir
// num banco, ou vier inválida, assume 15 e não quebra o login/verificação.
async function lerTempoInatividade() {
  try {
    const [rows] = await pool.execute('SELECT tempo_inatividade_min FROM configuracoes_escritorio LIMIT 1');
    const v = parseInt(rows[0] && rows[0].tempo_inatividade_min, 10);
    return Number.isFinite(v) && v >= 15 ? v : 15;
  } catch (e) {
    return 15;
  }
}

// POST /api/auth/login
// Autentica o usuário e retorna o token JWT
async function login(req, res) {
  try {
    const { login: loginUsuario, senha, sessao: sessaoEnviada } = req.body;

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

    // Sessão única por usuário. "Chave da sessão ativa" = identidade do NAVEGADOR:
    // - se o navegador se apresenta com a MESMA chave já ativa (abas do mesmo navegador
    //   logando de novo), mantém a chave → não derruba as abas irmãs;
    // - caso contrário (outro navegador/máquina, ou 1º login), gera uma chave NOVA e
    //   sobrescreve a ativa → o dispositivo antigo cai na próxima requisição.
    const novaSessao = (sessaoEnviada && sessaoEnviada === usuario.sessao_atual)
      ? usuario.sessao_atual
      : crypto.randomBytes(24).toString('hex');

    // Atualiza o último acesso e grava a chave da sessão ativa (mesmo UPDATE — sem custo extra)
    await pool.execute(
      'UPDATE usuarios SET ultimo_acesso = NOW(), sessao_atual = ? WHERE id = ?',
      [novaSessao, usuario.id]
    );

    // Registra o LOGIN no histórico de auditoria (aparece no "Histórico do usuário").
    // Blindado: se a gravação falhar por qualquer motivo, o login NÃO é interrompido.
    try {
      await pool.execute(
        "INSERT INTO logs_auditoria (usuario_id, tabela, acao, registro_id, descricao, criado_em) VALUES (?, 'acesso', 'login', NULL, 'Login no sistema', NOW())",
        [usuario.id]
      );
    } catch (e) { /* auditoria nunca derruba o login */ }

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
        sessao: novaSessao, // chave da sessão ativa (validada no middleware a cada requisição)
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return sucesso(res, {
      token,
      sessao: novaSessao, // o frontend guarda no localStorage como identidade do navegador
      usuario: {
        id:    usuario.id,
        nome:  usuario.nome,
        login: usuario.login,
        nivel: usuario.nivel,
        tipo:  usuario.tipo,
        oab:   usuario.oab,
        ver_todos_processos: usuario.ver_todos_processos,
        cores_agenda: parseCoresAgenda(usuario.cores_agenda), // cores personalizadas da Agenda (null = padrão)
        cores_menu:   parseCoresMenu(usuario.cores_menu),     // cores personalizadas do menu lateral (null = padrão)
        cor_linha:    parseCorLinha(usuario.cor_linha),       // cor de destaque da linha/hover (null = padrão)
        cor_linha_lida: parseCorLinha(usuario.cor_linha_lida), // cor da linha de publicação já lida (null = padrão)
        google_agenda_ativo: Number(usuario.google_agenda_ativo) === 1 ? 1 : 0, // envia eventos ao Google Agenda?
        google_agenda_email: usuario.google_agenda_email || null,               // e-mail do Google do usuário
      },
      permissoes,
      // Tempo de inatividade (min) do escritório — o frontend usa para o logout automático.
      tempo_inatividade_min: await lerTempoInatividade(),
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
    const errSenha1 = validarSenha(senha);
    if (errSenha1) return erro(res, errSenha1);

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
    // Rede de segurança da trava de unicidade do login.
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Este login já está em uso');
    return erroInterno(res, err);
  }
}

// GET /api/auth/verificar
// Verifica se o token ainda é válido (usado pelo frontend ao recarregar a página)
async function verificarToken(req, res) {
  try {
    const permissoes = await buscarPermissoesUsuario(req.usuario.id);
    // Tempo de inatividade (min) do escritório — para o frontend rearmar o logout automático ao recarregar.
    const tempo_inatividade_min = await lerTempoInatividade();
    // Cores personalizadas da Agenda (1 SELECT leve, só ao recarregar o app — não é por requisição).
    const [cfgCores] = await pool.execute('SELECT cores_agenda, cores_menu, cor_linha, cor_linha_lida, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [req.usuario.id]);
    const usuario = { ...req.usuario,
      cores_agenda: parseCoresAgenda(cfgCores[0]?.cores_agenda),
      cores_menu:   parseCoresMenu(cfgCores[0]?.cores_menu),
      cor_linha:    parseCorLinha(cfgCores[0]?.cor_linha),
      cor_linha_lida: parseCorLinha(cfgCores[0]?.cor_linha_lida),
      google_agenda_ativo: Number(cfgCores[0]?.google_agenda_ativo) === 1 ? 1 : 0,
      google_agenda_email: cfgCores[0]?.google_agenda_email || null };
    return sucesso(res, { usuario, permissoes, tempo_inatividade_min });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/cores-agenda — salva as cores da Agenda do usuário logado.
// Body: { cores: {prazo:'#..', ...} }. Envie null/vazio para RESTAURAR O PADRÃO (limpa a coluna).
async function salvarCoresAgenda(req, res) {
  try {
    const cores = parseCoresAgenda(req.body?.cores);
    await pool.execute(
      'UPDATE usuarios SET cores_agenda = ? WHERE id = ?',
      [cores ? JSON.stringify(cores) : null, req.usuario.id]
    );
    return sucesso(res, { cores_agenda: cores }, cores ? 'Cores salvas' : 'Cores restauradas para o padrão');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/cores-menu — salva as cores do menu lateral do usuário logado.
// Body: { cores: {fundo:'#..', destaque:'#..'} }. Envie null/vazio para RESTAURAR O PADRÃO (limpa a coluna).
async function salvarCoresMenu(req, res) {
  try {
    const cores = parseCoresMenu(req.body?.cores);
    await pool.execute(
      'UPDATE usuarios SET cores_menu = ? WHERE id = ?',
      [cores ? JSON.stringify(cores) : null, req.usuario.id]
    );
    return sucesso(res, { cores_menu: cores }, cores ? 'Cores salvas' : 'Cores restauradas para o padrão');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/cor-linha — salva a cor de destaque da linha (hover) do usuário logado.
// Body: { cor: '#..' }. Envie null/vazio para RESTAURAR O PADRÃO (limpa a coluna).
async function salvarCorLinha(req, res) {
  try {
    const cor = parseCorLinha(req.body?.cor);
    await pool.execute(
      'UPDATE usuarios SET cor_linha = ? WHERE id = ?',
      [cor, req.usuario.id]
    );
    return sucesso(res, { cor_linha: cor }, cor ? 'Cor salva' : 'Cor restaurada para o padrão');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/cor-linha-lida — salva a cor da linha de "publicação já lida" do usuário logado.
// Body: { cor: '#..' }. Envie null/vazio para RESTAURAR O PADRÃO (limpa a coluna).
async function salvarCorLinhaLida(req, res) {
  try {
    const cor = parseCorLinha(req.body?.cor);
    await pool.execute(
      'UPDATE usuarios SET cor_linha_lida = ? WHERE id = ?',
      [cor, req.usuario.id]
    );
    return sucesso(res, { cor_linha_lida: cor }, cor ? 'Cor salva' : 'Cor restaurada para o padrão');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/auth/google-agenda — o usuário liga/desliga o envio dos seus eventos
// para o Google Agenda e informa o e-mail do Google. Body: { ativo, email }.
// Só o próprio usuário logado altera o seu (self-service). E-mail guardado em minúsculas.
async function salvarGoogleAgenda(req, res) {
  try {
    const ativo = req.body?.ativo ? 1 : 0;
    const email = String(req.body?.email || '').trim().toLowerCase();
    // Para ATIVAR é obrigatório um e-mail válido (senão não há para onde enviar).
    if (ativo && !email) {
      return erro(res, 'Informe o e-mail do seu Google para ativar o envio para a agenda.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return erro(res, 'E-mail do Google inválido. Confira o endereço digitado.');
    }
    await pool.execute(
      'UPDATE usuarios SET google_agenda_ativo = ?, google_agenda_email = ? WHERE id = ?',
      [ativo, email || null, req.usuario.id]
    );
    return sucesso(res, { google_agenda_ativo: ativo, google_agenda_email: email || null },
      ativo ? 'Envio para o Google Agenda ativado' : 'Envio para o Google Agenda desativado');
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
    const errSenha2 = validarSenha(senha);
    if (errSenha2) return erro(res, errSenha2);

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
    const errSenha3 = validarSenha(nova_senha);
    if (errSenha3) return erro(res, errSenha3);
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

// POST /api/auth/verificar-senha — Confirma a senha do usuário logado
async function verificarSenha(req, res) {
  try {
    const { senha } = req.body;
    if (!senha) return erro(res, 'Senha é obrigatória');
    const [rows] = await pool.execute('SELECT senha_hash FROM usuarios WHERE id = ? AND ativo = 1', [req.usuario.id]);
    if (!rows.length) return erro(res, 'Usuário não encontrado');
    const correta = await bcrypt.compare(senha, rows[0].senha_hash);
    if (!correta) return erro(res, 'Senha incorreta', 401);
    return sucesso(res, null, 'Senha confirmada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/auth/logout
// Registra o LOGOUT no histórico de auditoria. Exige token (rota autenticada) para saber QUEM saiu.
// O logout de fato acontece no frontend (limpa o token); aqui só gravamos o evento.
// `motivo` (opcional, vindo do frontend): 'inatividade' distingue o logout automático do manual.
async function logout(req, res) {
  const descricao = req.body?.motivo === 'inatividade' ? 'Logout por inatividade' : 'Logout do sistema';
  try {
    await pool.execute(
      "INSERT INTO logs_auditoria (usuario_id, tabela, acao, registro_id, descricao, criado_em) VALUES (?, 'acesso', 'logout', NULL, ?, NOW())",
      [req.usuario.id, descricao]
    );
  } catch (e) { /* não impede o logout do frontend */ }
  return sucesso(res, null, 'Logout registrado');
}

module.exports = { login, logout, criarPrimeiroAdmin, verificarToken, esqueciSenha, validarToken, redefinirSenha, trocarSenha, verificarSenha, salvarCoresAgenda, salvarCoresMenu, salvarCorLinha, salvarCorLinhaLida, salvarGoogleAgenda };
