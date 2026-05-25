// ============================================================
// CONTROLLER DE CONFIGURAÇÕES
// Escritório, feriados, integrações, usuários e setup inicial
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const bcrypt = require('bcryptjs');
const auditoria = require('../middleware/auditoria');

// GET /api/configuracoes/escritorio — Busca dados do escritório
async function buscarEscritorio(req, res) {
  try {
    const [rows] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
    return sucesso(res, rows[0] || {});
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/escritorio — Atualiza dados do escritório
async function atualizarEscritorio(req, res) {
  try {
    const {
      nome, cnpj_cpf, email, telefone, endereco,
      cor_principal, horario_alerta_prazos,
      dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao
    } = req.body;

    if (!nome) return erro(res, 'Nome do escritório é obrigatório');

    await pool.execute(
      `UPDATE configuracoes_escritorio SET
         nome=?, cnpj_cpf=?, email=?, telefone=?, endereco=?,
         cor_principal=?, horario_alerta_prazos=?,
         dias_alerta_audiencia=?, dias_alerta_pericia=?, dias_sem_movimentacao=?,
         setup_concluido = 1`,
      [
        nome, cnpj_cpf || null, email || null, telefone || null, endereco || null,
        cor_principal || '#1a56db', horario_alerta_prazos || '18:00',
        dias_alerta_audiencia || 3, dias_alerta_pericia || 2, dias_sem_movimentacao || 30
      ]
    );

    return sucesso(res, null, 'Configurações atualizadas com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/setup-concluido — Marca setup como concluído
async function marcarSetupConcluido(req, res) {
  try {
    // Verifica os requisitos mínimos antes de liberar o sistema
    const [config] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
    const cfg = config[0];

    if (!cfg.nome)     return erro(res, 'Nome do escritório é obrigatório');
    if (!cfg.cnpj_cpf) return erro(res, 'CNPJ/CPF é obrigatório');
    if (!cfg.email)    return erro(res, 'E-mail é obrigatório');

    // Verifica se tem pelo menos 1 usuário admin
    const [admin] = await pool.execute('SELECT id FROM usuarios WHERE nivel = 1 LIMIT 1');
    if (!admin.length) return erro(res, 'Crie pelo menos 1 usuário administrador antes de concluir o setup');

    // Verifica se tem pelo menos 1 advogado com OAB
    const [advogado] = await pool.execute(
      "SELECT id FROM usuarios WHERE tipo = 'advogado' AND oab IS NOT NULL AND oab != '' LIMIT 1"
    );
    if (!advogado.length) {
      return erro(res, 'Cadastre pelo menos 1 advogado com número de OAB antes de concluir o setup');
    }

    await pool.execute('UPDATE configuracoes_escritorio SET setup_concluido = 1');
    return sucesso(res, null, 'Setup concluído! Sistema liberado para uso.');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ---- FERIADOS ----

// GET /api/configuracoes/feriados — Lista feriados cadastrados
async function listarFeriados(req, res) {
  try {
    const { ano } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (ano) { where += ' AND YEAR(f.data) = ?'; params.push(ano); }

    const [rows] = await pool.execute(
      `SELECT f.*, u.nome AS criado_por_nome FROM feriados f
       LEFT JOIN usuarios u ON f.criado_por = u.id
       ${where} ORDER BY f.data ASC`,
      params
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/configuracoes/feriados — Cadastra feriado e atualiza calendário
async function criarFeriado(req, res) {
  const { data, descricao, tipo } = req.body;
  if (!data || !descricao) return erro(res, 'Data e descrição são obrigatórias');

  // Transação: INSERT no feriado + UPDATE no calendário — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'INSERT INTO feriados (data, descricao, tipo, criado_por) VALUES (?, ?, ?, ?)',
      [data, descricao.trim(), tipo || 'nacional', req.usuario.id]
    );

    // Marca o dia como não útil no calendário dentro da mesma transação
    await conn.execute(
      'UPDATE calendario SET dia_util = 0 WHERE data = ?', [data]
    );

    await conn.commit();         // Grava feriado + calendário de uma vez
    return sucesso(res, null, 'Feriado cadastrado e calendário atualizado', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// DELETE /api/configuracoes/feriados/:id — Remove feriado
async function excluirFeriado(req, res) {
  const { id } = req.params;
  const [fer] = await pool.execute('SELECT data FROM feriados WHERE id = ?', [id]);
  if (!fer.length) return naoEncontrado(res, 'Feriado não encontrado');

  // Transação: DELETE do feriado + UPDATE no calendário — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM feriados WHERE id = ?', [id]);

    // Se o dia não é fim de semana, volta a ser útil no calendário
    const diaSemana = new Date(fer[0].data + 'T12:00:00').getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      await conn.execute('UPDATE calendario SET dia_util = 1 WHERE data = ?', [fer[0].data]);
    }

    await conn.commit();         // Remove feriado + restaura calendário de uma vez
    return sucesso(res, null, 'Feriado removido');
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// ---- USUÁRIOS ----

// GET /api/configuracoes/usuarios — Lista usuários (exceto superusuário)
async function listarUsuarios(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nome, u.login, u.email, u.oab, u.tipo, u.nivel,
              u.ativo, u.ver_todos_processos, u.ultimo_acesso,
              uc.nome AS criado_por_nome
       FROM usuarios u
       LEFT JOIN usuarios uc ON u.criado_por = uc.id
       WHERE u.nivel > 0   -- Nunca mostra o superusuário
       ORDER BY u.nivel ASC, u.nome ASC`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/configuracoes/usuarios — Cria usuário
async function criarUsuario(req, res) {
  try {
    const { nome, login, senha, email, oab, tipo, nivel, ver_todos_processos } = req.body;
    if (!nome || !login || !senha) return erro(res, 'Nome, login e senha são obrigatórios');

    const [dup] = await pool.execute('SELECT id FROM usuarios WHERE login = ?', [login]);
    if (dup.length) return erro(res, 'Login já está em uso');

    const senhaHash = await bcrypt.hash(senha, 12);

    const [result] = await pool.execute(
      `INSERT INTO usuarios (nome, login, senha_hash, email, oab, tipo, nivel,
        ver_todos_processos, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome.trim(), login.trim(), senhaHash, email || null, oab || null,
       tipo || 'advogado', nivel || 2, ver_todos_processos ? 1 : 0, req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'usuarios', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Usuário criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/usuarios/:id — Atualiza usuário
async function atualizarUsuario(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, oab, tipo, nivel, ativo, ver_todos_processos, senha } = req.body;

    // Não permite alterar o superusuário
    const [usuario] = await pool.execute('SELECT nivel FROM usuarios WHERE id = ?', [id]);
    if (!usuario.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (usuario[0].nivel === 0) return erro(res, 'Não é possível alterar o superusuário por aqui', 403);

    // Se foi enviada nova senha, atualiza o hash
    if (senha) {
      const novoHash = await bcrypt.hash(senha, 12);
      await pool.execute(
        'UPDATE usuarios SET senha_hash = ? WHERE id = ?', [novoHash, id]
      );
    }

    await pool.execute(
      `UPDATE usuarios SET nome=?, email=?, oab=?, tipo=?, nivel=?, ativo=?, ver_todos_processos=?
       WHERE id = ?`,
      [nome, email || null, oab || null, tipo, nivel || 2,
       ativo !== undefined ? ativo : 1, ver_todos_processos ? 1 : 0, id]
    );

    await auditoria.registrar(req.usuario.id, 'usuarios', 'editar', id);
    return sucesso(res, null, 'Usuário atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET/PUT /api/configuracoes/permissoes/:usuarioId — Gerencia permissões
async function buscarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const [rows] = await pool.execute(
      'SELECT modulo, acao, permitido FROM permissoes WHERE usuario_id = ?', [usuarioId]
    );
    // Transforma em objeto aninhado
    const permissoes = {};
    rows.forEach(r => {
      if (!permissoes[r.modulo]) permissoes[r.modulo] = {};
      permissoes[r.modulo][r.acao] = r.permitido === 1;
    });
    return sucesso(res, permissoes);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function salvarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const { permissoes } = req.body; // { pessoas: { visualizar: true, cadastrar: false }, ... }

    // Deleta e recria todas as permissões
    await pool.execute('DELETE FROM permissoes WHERE usuario_id = ?', [usuarioId]);

    for (const [modulo, acoes] of Object.entries(permissoes)) {
      for (const [acao, permitido] of Object.entries(acoes)) {
        await pool.execute(
          'INSERT INTO permissoes (usuario_id, modulo, acao, permitido) VALUES (?, ?, ?, ?)',
          [usuarioId, modulo, acao, permitido ? 1 : 0]
        );
      }
    }

    return sucesso(res, null, 'Permissões salvas com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET/PUT /api/configuracoes/integracoes — Gerencia integrações externas
async function buscarIntegracoes(req, res) {
  try {
    const [rows] = await pool.execute('SELECT modulo, ativo, configuracoes FROM configuracoes_integracoes');
    // Remove dados sensíveis (tokens) da listagem
    const resultado = rows.map(r => ({
      modulo: r.modulo,
      ativo: r.ativo,
      configurado: !!r.configuracoes,
    }));
    return sucesso(res, resultado);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function salvarIntegracao(req, res) {
  try {
    const { modulo } = req.params;
    const { ativo, configuracoes } = req.body;

    await pool.execute(
      `UPDATE configuracoes_integracoes SET ativo=?, configuracoes=?, atualizado_em=NOW()
       WHERE modulo=?`,
      [ativo ? 1 : 0, configuracoes ? JSON.stringify(configuracoes) : null, modulo]
    );

    return sucesso(res, null, 'Integração atualizada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  buscarEscritorio, atualizarEscritorio, marcarSetupConcluido,
  listarFeriados, criarFeriado, excluirFeriado,
  listarUsuarios, criarUsuario, atualizarUsuario,
  buscarPermissoes, salvarPermissoes,
  buscarIntegracoes, salvarIntegracao,
};
