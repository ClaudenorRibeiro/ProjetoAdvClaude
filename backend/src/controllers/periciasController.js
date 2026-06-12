// ============================================================
// CONTROLLER DE PERÍCIAS
// Agendamento de perícias técnicas vinculadas a processos
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/pericias — Lista perícias com filtros
async function listar(req, res) {
  try {
    const { processo_id, data_de, data_ate, assistente_id, pagina = 1, limite = 30 } = req.query;
    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE 1=1';

    if (processo_id)   { where += ' AND pe.processo_id = ?';           params.push(processo_id); }
    if (data_de)       { where += ' AND pe.data >= ?';                  params.push(data_de); }
    if (data_ate)      { where += ' AND pe.data <= ?';                  params.push(data_ate); }
    if (assistente_id) { where += ' AND pe.assistente_tecnico_id = ?';  params.push(assistente_id); }

    const [registros] = await pool.execute(`
      SELECT
        pe.id, pe.processo_id, pe.data, pe.hora, pe.local,
        pe.perito_tipo, pe.perito_id, pe.assistente_tecnico_id,
        pe.comunicado_enviado, pe.email_perito_enviado, pe.criado_em,
        tp.nome  AS tipo_nome,
        CASE
          WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
          WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social
          ELSE NULL
        END AS perito_nome,
        u.nome   AS assistente_nome,
        u2.nome  AS criado_por_nome,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo,
        pa.id     AS pasta_id,
        CASE WHEN pe.data < CURDATE() THEN 'realizada' ELSE 'agendada' END AS status
      FROM pericia pe
      LEFT JOIN tipo_pericia     tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas  pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id = u.id
      LEFT JOIN usuarios u2 ON pe.criado_por = u2.id
      LEFT JOIN tblProc pr ON pe.processo_id = pr.id
      LEFT JOIN tblPasta pa ON pr.pasta_id   = pa.id
      ${where}
      ORDER BY pe.data DESC
      LIMIT ${limitInt} OFFSET ${offsetInt}
    `, params);

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM pericia pe ${where}`,
      params
    );

    return sucesso(res, { registros, total: Number(total) });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/:id — Busca perícia por ID
async function buscar(req, res) {
  try {
    const [rows] = await pool.execute(`
      SELECT pe.*,
        tp.nome AS tipo_nome,
        CASE
          WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
          WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social
          ELSE NULL
        END AS perito_nome,
        u.nome  AS assistente_nome,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo
      FROM pericia pe
      LEFT JOIN tipo_pericia     tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas  pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id = u.id
      LEFT JOIN tblProc pr ON pe.processo_id = pr.id
      LEFT JOIN tblPasta pa ON pr.pasta_id   = pa.id
      WHERE pe.id = ?
    `, [req.params.id]);

    if (!rows.length) return naoEncontrado(res, 'Perícia não encontrada');
    return sucesso(res, rows[0]);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias — Cria perícia
// Transação: INSERT da perícia + registro de auditoria (tudo ou nada)
async function criar(req, res) {
  const {
    processo_id, tipo_pericia_id, data, hora,
    local, perito_tipo, perito_id, assistente_tecnico_id
  } = req.body;

  if (!processo_id) return erro(res, 'Processo é obrigatório');
  if (!data)        return erro(res, 'Data é obrigatória');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.execute(
      `INSERT INTO pericia
        (processo_id, tipo_pericia_id, data, hora, local, perito_tipo, perito_id, assistente_tecnico_id, criado_por)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        processo_id,
        tipo_pericia_id || null,
        data,
        hora || null,
        local || null,
        perito_tipo || null,
        perito_id || null,
        assistente_tecnico_id || null,
        req.usuario.id
      ]
    );
    await auditoria.registrar(req.usuario.id, 'pericia', 'criar', r.insertId, null, null, conn);

    await conn.commit();
    return sucesso(res, { id: r.insertId }, 'Perícia criada com sucesso', 201);
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pericias/:id — Atualiza perícia
// Transação: UPDATE da perícia + registro de auditoria (tudo ou nada)
async function atualizar(req, res) {
  const {
    tipo_pericia_id, data, hora,
    local, perito_tipo, perito_id, assistente_tecnico_id
  } = req.body;

  if (!data) return erro(res, 'Data é obrigatória');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.execute(
      `UPDATE pericia SET
        tipo_pericia_id=?, data=?, hora=?, local=?,
        perito_tipo=?, perito_id=?, assistente_tecnico_id=?
       WHERE id=?`,
      [
        tipo_pericia_id || null,
        data,
        hora || null,
        local || null,
        perito_tipo || null,
        perito_id || null,
        assistente_tecnico_id || null,
        req.params.id
      ]
    );

    if (!r.affectedRows) {
      await conn.rollback();
      return naoEncontrado(res, 'Perícia não encontrada');
    }
    await auditoria.registrar(req.usuario.id, 'pericia', 'atualizar', req.params.id, null, null, conn);

    await conn.commit();
    return sucesso(res, null, 'Perícia atualizada com sucesso');
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// GET /api/pericias/tipos — Lista tipos de perícia para selects
async function tipos(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM tipo_pericia WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/pericias/:id/email-perito — Marca e-mail ao perito como enviado
async function marcarEmailPerito(req, res) {
  try {
    const [r] = await pool.execute(
      'UPDATE pericia SET email_perito_enviado = 1 WHERE id = ?',
      [req.params.id]
    );
    if (!r.affectedRows) return naoEncontrado(res, 'Perícia não encontrada');
    return sucesso(res, null, 'E-mail ao perito registrado como enviado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/pericias/:id/comunicado — Marca comunicado ao cliente como enviado
async function marcarComunicado(req, res) {
  try {
    await pool.execute(
      'UPDATE pericia SET comunicado_enviado = 1 WHERE id = ?',
      [req.params.id]
    );
    return sucesso(res, null, 'Comunicado registrado como enviado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, buscar, criar, atualizar, tipos, marcarEmailPerito, marcarComunicado };
