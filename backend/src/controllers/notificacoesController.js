// ============================================================
// CONTROLLER DE NOTIFICAÇÕES
// Notificações na tela para o usuário logado
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erroInterno } = require('../utils/response');

// GET /api/notificacoes — Notificações não lidas do usuário logado
async function listar(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT n.id, n.mensagem, n.criado_em,
              pp.data_vencimento,
              ps.nome AS subtipo_nome,
              pr.numProc AS processo_numero
       FROM notificacoes n
       LEFT JOIN prazos_processo pp ON n.prazo_id = pp.id
       LEFT JOIN prazo_subtipo ps   ON pp.subtipo_id = ps.id
       LEFT JOIN tblproc pr         ON pp.processo_id = pr.id
       WHERE n.usuario_id = ? AND n.lida = 0
       ORDER BY n.criado_em DESC
       LIMIT 20`,
      [req.usuario.id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/notificacoes/contagem — Só o número de não lidas (para o badge)
async function contagem(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id = ? AND lida = 0',
      [req.usuario.id]
    );
    return sucesso(res, { total: rows[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/notificacoes/marcar-lidas — Marca todas como lidas
async function marcarLidas(req, res) {
  try {
    await pool.execute(
      'UPDATE notificacoes SET lida = 1 WHERE usuario_id = ?',
      [req.usuario.id]
    );
    return sucesso(res, null, 'Notificações lidas');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, contagem, marcarLidas };
