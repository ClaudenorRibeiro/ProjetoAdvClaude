// ============================================================
// CONTROLLER DE TAREFAS
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/tarefas — Lista tarefas com filtros
async function listar(req, res) {
  try {
    const { usuario_id, concluida, prioridade, processo_id, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (concluida !== undefined) { where += ' AND t.concluida = ?'; params.push(concluida); }
    if (prioridade)              { where += ' AND t.prioridade = ?'; params.push(prioridade); }
    // Filtro por processo (aba de Tarefas dentro do processo/pasta). SEM processo_id (tela do menu
    // lateral) mostra TODAS. Tarefas "Rotina Interna" (processo_id NULL) só aparecem no menu lateral.
    if (processo_id)             { where += ' AND t.processo_id = ?'; params.push(processo_id); }

    // Filtra por usuário respeitando a permissão 'tarefas.ver_todos > visualizar'
    if (usuario_id) {
      where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
      params.push(usuario_id);
    } else if (req.usuario.nivel > 1) {
      const [verTodosPerm] = await pool.execute(
        "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'tarefas' AND submodulo = 'ver_todos' AND acao = 'visualizar'",
        [req.usuario.id]
      );
      if (!verTodosPerm[0]?.permitido) {
        where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
        params.push(req.usuario.id);
      }
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT t.id, t.titulo, t.descricao, t.prioridade, t.data_vencimento,
              t.concluida, t.concluida_em, t.criado_em,
              t.pasta_id, t.processo_id,
              u.nome  AS atribuida_para_nome,
              uc.nome AS criado_por_nome,
              -- Vínculo: pasta direta
              LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
              -- Vínculo: processo (e pasta do processo para o link)
              pr.numProc  AS processo_numero,
              pa2.id      AS pasta_do_processo_id,
              LPAD(pa2.numPasta, 4, '0') AS pasta_do_processo_fmt,
              DATEDIFF(t.data_vencimento, CURDATE()) AS dias_restantes
       FROM tarefas t
       LEFT JOIN usuarios u   ON t.atribuida_para = u.id
       LEFT JOIN usuarios uc  ON t.criado_por = uc.id
       LEFT JOIN tblpasta pa  ON t.pasta_id = pa.id
       LEFT JOIN tblproc pr   ON t.processo_id = pr.id
       LEFT JOIN tblpasta pa2 ON pr.pasta_id = pa2.id
       ${where}
       ORDER BY t.concluida ASC,
                FIELD(t.prioridade, 'urgente', 'normal', 'baixa'),
                t.data_vencimento ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM tarefas t ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/tarefas — Cria nova tarefa
// Transação: INSERT da tarefa + registro de auditoria (tudo ou nada)
async function criar(req, res) {
  const { titulo, descricao, prioridade, processo_id, pasta_id, prazo_id,
          atribuida_para, data_vencimento } = req.body;

  if (!titulo) return erro(res, 'O título é obrigatório');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO tarefas
         (titulo, descricao, prioridade, processo_id, pasta_id, prazo_id,
          atribuida_para, data_vencimento, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo.trim(), descricao || null,
        prioridade || 'normal',
        processo_id || null, pasta_id || null, prazo_id || null,
        atribuida_para || null, data_vencimento || null,
        req.usuario.id
      ]
    );

    await auditoria.registrar(req.usuario.id, 'tarefas', 'criar', result.insertId, null, null, conn);

    await conn.commit();
    return sucesso(res, { id: result.insertId }, 'Tarefa criada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id/concluir — Marca tarefa como concluída
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function concluir(req, res) {
  const { id } = req.params;
  const [exists] = await pool.execute('SELECT id FROM tarefas WHERE id = ?', [id]);
  if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE tarefas SET concluida = 1, concluida_por = ?, concluida_em = NOW() WHERE id = ?',
      [req.usuario.id, id]
    );
    await auditoria.registrar(req.usuario.id, 'tarefas', 'concluir', id, null, null, conn);

    await conn.commit();
    return sucesso(res, null, 'Tarefa concluída');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id/reabrir — Reabre uma tarefa concluída
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function reabrir(req, res) {
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE tarefas SET concluida = 0, concluida_por = NULL, concluida_em = NULL WHERE id = ?',
      [id]
    );
    await auditoria.registrar(req.usuario.id, 'tarefas', 'reabrir', id, null, null, conn);

    await conn.commit();
    return sucesso(res, null, 'Tarefa reaberta');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/tarefas/:id/historico — Histórico completo de uma tarefa
// Combina: dados da tarefa (criação, conclusão) + log de auditoria (ações)
async function buscarHistorico(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT t.id, t.titulo, t.criado_em, t.concluida_em,
              uc.nome AS criado_por_nome,
              uf.nome AS concluida_por_nome
       FROM tarefas t
       LEFT JOIN usuarios uc ON t.criado_por    = uc.id
       LEFT JOIN usuarios uf ON t.concluida_por = uf.id
       WHERE t.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Tarefa não encontrada');
    const tarefa = rows[0];

    // Ações registradas na auditoria (concluir, reabrir, alterar, excluir)
    const [logs] = await pool.execute(
      `SELECT la.acao, la.criado_em, u.nome AS usuario_nome
       FROM logs_auditoria la
       LEFT JOIN usuarios u ON la.usuario_id = u.id
       WHERE la.tabela = 'tarefas' AND la.registro_id = ?
       ORDER BY la.criado_em ASC`,
      [id]
    );

    const iconeAcao = {
      criar:    { icone: '📋', desc: 'Tarefa cadastrada' },
      concluir: { icone: '✅', desc: 'Tarefa concluída' },
      reabrir:  { icone: '🔄', desc: 'Tarefa reaberta' },
      alterar:  { icone: '✏️', desc: 'Tarefa editada' },
      excluir:  { icone: '🗑️', desc: 'Tarefa excluída' },
    };

    // Evento de criação (da tabela tarefas)
    const eventos = [{
      icone:    '📋',
      descricao: 'Tarefa cadastrada',
      usuario:  tarefa.criado_por_nome || '—',
      data:     tarefa.criado_em,
    }];

    // Demais eventos da auditoria (pulamos o 'criar' pois já incluímos acima)
    logs.forEach(log => {
      if (log.acao === 'criar') return;
      const mapa = iconeAcao[log.acao] || { icone: '🔔', desc: log.acao };
      eventos.push({
        icone:    mapa.icone,
        descricao: mapa.desc,
        usuario:  log.usuario_nome || '—',
        data:     log.criado_em,
      });
    });

    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    return sucesso(res, { tarefa_titulo: tarefa.titulo, eventos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/tarefas/:id — Exclui tarefa
// Transação: DELETE da tarefa + registro de auditoria (tudo ou nada)
async function excluir(req, res) {
  const { id } = req.params;
  const [exists] = await pool.execute('SELECT id FROM tarefas WHERE id = ?', [id]);
  if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM tarefas WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'tarefas', 'excluir', id, null, null, conn);

    await conn.commit();
    return sucesso(res, null, 'Tarefa excluída');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id — Atualiza tarefa
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function atualizar(req, res) {
  const { id } = req.params;
  const { titulo, descricao, prioridade, atribuida_para, data_vencimento,
          pasta_id, processo_id } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE tarefas SET titulo=?, descricao=?, prioridade=?,
       atribuida_para=?, data_vencimento=?, pasta_id=?, processo_id=?
       WHERE id = ?`,
      [titulo, descricao || null, prioridade || 'normal',
       atribuida_para || null, data_vencimento || null,
       pasta_id || null, processo_id || null, id]
    );
    await auditoria.registrar(req.usuario.id, 'tarefas', 'alterar', id, null, null, conn);

    await conn.commit();
    return sucesso(res, null, 'Tarefa atualizada');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = { listar, criar, concluir, reabrir, atualizar, excluir, buscarHistorico };
