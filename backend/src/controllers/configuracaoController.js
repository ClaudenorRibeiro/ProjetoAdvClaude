// ============================================================
// CONTROLLER DE CONFIGURAÇÕES
// Escritório, feriados, integrações, usuários e setup inicial
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const bcrypt = require('bcryptjs');
const auditoria = require('../middleware/auditoria');

// GET /api/public/info — Retorna nome, logo e título da aba (sem autenticação)
// Usado na tela de login e para definir document.title no frontend
async function infoPublica(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT nome, logo_path, titulo_aba FROM configuracoes_escritorio LIMIT 1'
    );
    return sucesso(res, rows[0] || { nome: 'Sistema de Advocacia', logo_path: null, titulo_aba: null });
  } catch (err) {
    return erroInterno(res, err);
  }
}

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
      nome, cnpj_cpf, email, telefone,
      cep, logradouro, numero, bairro, cidade, estado,
      cor_principal, horario_alerta_prazos,
      alerta_atrasado_ativo, alerta_emails,
      dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao,
      prazo_fazendo_timeout, dias_audiencia_sem_adv,
      titulo_aba
    } = req.body;

    if (!nome) return erro(res, 'Nome do escritório é obrigatório');

    // INSERT se não existir registro, UPDATE se já existir (id=1 fixo)
    // Garante funcionamento mesmo em instalações novas sem registro inicial
    await pool.execute(
      `INSERT INTO configuracoes_escritorio
         (id, nome, cnpj_cpf, email, telefone,
          cep, logradouro, numero, bairro, cidade, estado,
          cor_principal, horario_alerta_prazos,
          alerta_atrasado_ativo, alerta_emails,
          dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao,
          prazo_fazendo_timeout, dias_audiencia_sem_adv, titulo_aba, setup_concluido)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nome=VALUES(nome), cnpj_cpf=VALUES(cnpj_cpf), email=VALUES(email), telefone=VALUES(telefone),
         cep=VALUES(cep), logradouro=VALUES(logradouro), numero=VALUES(numero),
         bairro=VALUES(bairro), cidade=VALUES(cidade), estado=VALUES(estado),
         cor_principal=VALUES(cor_principal), horario_alerta_prazos=VALUES(horario_alerta_prazos),
         alerta_atrasado_ativo=VALUES(alerta_atrasado_ativo), alerta_emails=VALUES(alerta_emails),
         dias_alerta_audiencia=VALUES(dias_alerta_audiencia), dias_alerta_pericia=VALUES(dias_alerta_pericia),
         dias_sem_movimentacao=VALUES(dias_sem_movimentacao), prazo_fazendo_timeout=VALUES(prazo_fazendo_timeout),
         dias_audiencia_sem_adv=VALUES(dias_audiencia_sem_adv), titulo_aba=VALUES(titulo_aba),
         setup_concluido=1`,
      [
        nome, cnpj_cpf || null, email || null, telefone || null,
        cep || null, logradouro || null, numero || null, bairro || null, cidade || null, estado || null,
        cor_principal || '#1a56db', horario_alerta_prazos || '18:00:00',
        alerta_atrasado_ativo ? 1 : 0, alerta_emails || null,
        dias_alerta_audiencia || 3, dias_alerta_pericia || 2, dias_sem_movimentacao || 30,
        parseInt(prazo_fazendo_timeout) || 60, parseInt(dias_audiencia_sem_adv) || 7,
        titulo_aba || null
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

// Valida requisitos de senha — retorna mensagem de erro ou null se válida
function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

// POST /api/configuracoes/usuarios — Cria usuário
async function criarUsuario(req, res) {
  try {
    const { nome, login, senha, email, oab, tipo, nivel, ver_todos_processos } = req.body;
    if (!nome || !login || !senha) return erro(res, 'Nome, login e senha são obrigatórios');

    const errSenha = validarSenha(senha);
    if (errSenha) return erro(res, errSenha);

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

    // Se foi enviada nova senha, valida e atualiza o hash
    if (senha) {
      const errSenha = validarSenha(senha);
      if (errSenha) return erro(res, errSenha);
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

// GET /api/configuracoes/permissoes/:usuarioId — Busca permissões do usuário
// Retorna objeto com chave composta para sub-módulos: 'processos.andamentos'
async function buscarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const [rows] = await pool.execute(
      'SELECT modulo, submodulo, acao, permitido FROM permissoes WHERE usuario_id = ?',
      [usuarioId]
    );
    const permissoes = {};
    rows.forEach(r => {
      // Sub-módulos usam chave composta: 'processos.andamentos'
      const chave = r.submodulo ? `${r.modulo}.${r.submodulo}` : r.modulo;
      if (!permissoes[chave]) permissoes[chave] = {};
      permissoes[chave][r.acao] = r.permitido === 1;
    });
    return sucesso(res, permissoes);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/permissoes/:usuarioId — Salva permissões do usuário
// Recebe: { 'pessoas': { visualizar: true }, 'processos.andamentos': { cadastrar: false }, ... }
async function salvarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const { permissoes } = req.body;

    // Deleta e recria todas as permissões do usuário
    await pool.execute('DELETE FROM permissoes WHERE usuario_id = ?', [usuarioId]);

    for (const [chave, acoes] of Object.entries(permissoes)) {
      // Separa 'processos.andamentos' em modulo='processos', submodulo='andamentos'
      const pontoDot   = chave.indexOf('.');
      const modulo    = pontoDot >= 0 ? chave.slice(0, pontoDot)  : chave;
      const submodulo = pontoDot >= 0 ? chave.slice(pontoDot + 1) : null;

      for (const [acao, permitido] of Object.entries(acoes)) {
        await pool.execute(
          'INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, ?)',
          [usuarioId, modulo, submodulo, acao, permitido ? 1 : 0]
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

// PUT /api/configuracoes/usuarios/:id/senha — Admin redefine a senha de um usuário
async function redefinirSenhaAdmin(req, res) {
  try {
    const { id } = req.params;
    const { senha } = req.body;
    if (!senha) return erro(res, 'A senha é obrigatória');
    const errSenha = validarSenha(senha);
    if (errSenha) return erro(res, errSenha);

    const [rows] = await pool.execute('SELECT id FROM usuarios WHERE id = ? AND ativo = 1', [id]);
    if (!rows.length) return naoEncontrado(res, 'Usuário não encontrado');

    const hash = await bcrypt.hash(senha, 12);
    await pool.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, id]);

    // Invalida eventuais tokens de reset pendentes deste usuário
    await pool.execute('UPDATE reset_tokens SET usado = 1 WHERE usuario_id = ?', [id]);

    return sucesso(res, null, 'Senha redefinida com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Retorna a data/hora atual do servidor e o fuso horário configurado
function horaServidor(req, res) {
  const agora    = new Date();
  const fusoHora = Intl.DateTimeFormat('pt-BR', { timeZoneName: 'short' })
                       .formatToParts(agora)
                       .find(p => p.type === 'timeZoneName')?.value || '';

  return sucesso(res, {
    iso:          agora.toISOString(),       // ex: "2026-06-10T16:54:23.000Z"
    fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone, // ex: "America/Sao_Paulo"
    fuso_abrev:   fusoHora,                  // ex: "BRT"
  });
}

// DELETE /api/configuracoes/usuarios/:id — Exclui usuário
async function excluirUsuario(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT nivel, nome FROM usuarios WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (rows[0].nivel === 0) return erro(res, 'Não é possível excluir o superusuário', 403);
    if (parseInt(id) === req.usuario.id) return erro(res, 'Você não pode excluir seu próprio usuário', 403);

    await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
    return sucesso(res, null, `Usuário "${rows[0].nome}" excluído com sucesso`);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return erro(res, 'Este usuário não pode ser excluído pois possui registros vinculados no sistema');
    }
    return erroInterno(res, err);
  }
}

// GET /api/configuracoes/usuarios/:id/historico — Histórico de ações do usuário
async function historicoUsuario(req, res) {
  try {
    const { id } = req.params;
    const { data_de, data_ate } = req.query;

    const [usuario] = await pool.execute('SELECT nome FROM usuarios WHERE id = ?', [id]);
    if (!usuario.length) return naoEncontrado(res, 'Usuário não encontrado');

    let sql = `
      SELECT id, tabela, acao, registro_id, criado_em
      FROM logs_auditoria
      WHERE usuario_id = ?`;
    const params = [id];

    if (data_de) { sql += ' AND DATE(criado_em) >= ?'; params.push(data_de); }
    if (data_ate) { sql += ' AND DATE(criado_em) <= ?'; params.push(data_ate); }
    sql += ' ORDER BY criado_em DESC LIMIT 500';

    const [rows] = await pool.execute(sql, params);
    return sucesso(res, { usuario: usuario[0].nome, registros: rows });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  infoPublica,
  buscarEscritorio, atualizarEscritorio, marcarSetupConcluido,
  listarFeriados, criarFeriado, excluirFeriado,
  listarUsuarios, criarUsuario, atualizarUsuario, redefinirSenhaAdmin, excluirUsuario, historicoUsuario,
  buscarPermissoes, salvarPermissoes,
  buscarIntegracoes, salvarIntegracao,
  horaServidor,
};
