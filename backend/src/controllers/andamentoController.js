// ============================================================
// CONTROLLER DE ANDAMENTO PROCESSUAL
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/andamento/:processoId — Lista andamentos do processo
async function listar(req, res) {
  try {
    const { processoId } = req.params;

    const [rows] = await pool.execute(
      `SELECT a.id, a.data, a.descricao, a.criado_em, a.editado_em,
              u.nome AS criado_por_nome,
              ue.nome AS editado_por_nome
       FROM andamento_processual a
       JOIN usuarios u ON a.criado_por = u.id
       LEFT JOIN usuarios ue ON a.editado_por = ue.id
       WHERE a.processo_id = ?
       ORDER BY a.data DESC, a.id DESC`,
      [processoId]
    );

    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/andamento/:processoId — Registra novo andamento
async function criar(req, res) {
  try {
    const { processoId } = req.params;
    const { data, descricao } = req.body;

    if (!descricao) return erro(res, 'A descrição é obrigatória');

    const dataAndamento = data || new Date().toISOString().split('T')[0];

    const [result] = await pool.execute(
      `INSERT INTO andamento_processual (processo_id, data, descricao, criado_por)
       VALUES (?, ?, ?, ?)`,
      [processoId, dataAndamento, descricao.trim(), req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Andamento registrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/andamento/:id — Edita andamento
async function editar(req, res) {
  try {
    const { id } = req.params;
    const { data, descricao } = req.body;

    const [antes] = await pool.execute('SELECT * FROM andamento_processual WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Andamento não encontrado');

    await pool.execute(
      `UPDATE andamento_processual SET data=?, descricao=?, editado_por=?, editado_em=NOW()
       WHERE id = ?`,
      [data || antes[0].data, descricao.trim(), req.usuario.id, id]
    );

    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'editar', id, antes[0]);
    return sucesso(res, null, 'Andamento atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/andamento/:id — Exclui andamento
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT * FROM andamento_processual WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Andamento não encontrado');

    await pool.execute('DELETE FROM andamento_processual WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'excluir', id, antes[0]);
    return sucesso(res, null, 'Andamento excluído');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, editar, excluir };
