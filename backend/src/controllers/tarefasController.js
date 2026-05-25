// ============================================================
// CONTROLLER DE TAREFAS
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/tarefas — Lista tarefas com filtros
async function listar(req, res) {
  try {
    const { usuario_id, concluida, prioridade, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (concluida !== undefined) { where += ' AND t.concluida = ?'; params.push(concluida); }
    if (prioridade)              { where += ' AND t.prioridade = ?'; params.push(prioridade); }

    // Filtra por usuário logado se não for admin
    if (usuario_id) {
      where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
      params.push(usuario_id);
    } else if (req.usuario.nivel > 1) {
      where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
      params.push(req.usuario.id);
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT t.id, t.titulo, t.descricao, t.prioridade, t.data_vencimento,
              t.concluida, t.concluida_em, t.criado_em,
              u.nome AS atribuida_para_nome,
              uc.nome AS criado_por_nome,
              pr.numero AS processo_numero,
              DATEDIFF(t.data_vencimento, CURDATE()) AS dias_restantes
       FROM tarefas t
       LEFT JOIN usuarios u ON t.atribuida_para = u.id
       LEFT JOIN usuarios uc ON t.criado_por = uc.id
       LEFT JOIN processo pr ON t.processo_id = pr.id
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
async function criar(req, res) {
  try {
    const { titulo, descricao, prioridade, processo_id, pasta_id, prazo_id,
            atribuida_para, data_vencimento } = req.body;

    if (!titulo) return erro(res, 'O título é obrigatório');

    const [result] = await pool.execute(
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

    await auditoria.registrar(req.usuario.id, 'tarefas', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Tarefa criada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/tarefas/:id/concluir — Marca tarefa como concluída
async function concluir(req, res) {
  try {
    const { id } = req.params;
    const [exists] = await pool.execute('SELECT id FROM tarefas WHERE id = ?', [id]);
    if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');

    await pool.execute(
      'UPDATE tarefas SET concluida = 1, concluida_por = ?, concluida_em = NOW() WHERE id = ?',
      [req.usuario.id, id]
    );

    return sucesso(res, null, 'Tarefa concluída');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/tarefas/:id/reabrir — Reabre uma tarefa concluída
async function reabrir(req, res) {
  try {
    const { id } = req.params;
    await pool.execute(
      'UPDATE tarefas SET concluida = 0, concluida_por = NULL, concluida_em = NULL WHERE id = ?',
      [id]
    );
    return sucesso(res, null, 'Tarefa reaberta');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/tarefas/:id — Atualiza tarefa
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { titulo, descricao, prioridade, atribuida_para, data_vencimento } = req.body;

    await pool.execute(
      `UPDATE tarefas SET titulo=?, descricao=?, prioridade=?,
       atribuida_para=?, data_vencimento=? WHERE id = ?`,
      [titulo, descricao || null, prioridade || 'normal',
       atribuida_para || null, data_vencimento || null, id]
    );

    return sucesso(res, null, 'Tarefa atualizada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, concluir, reabrir, atualizar };
