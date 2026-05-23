// ============================================================
// CONTROLLER DE PASTAS E PROCESSOS
// Gerencia a estrutura PESSOA → PASTA → PROCESSO
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// ---- PASTAS ----

// GET /api/processos/pastas — Lista pastas do usuário
async function listarPastas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20 } = req.query;
    const offset = (pagina - 1) * limite;
    const params = [];
    let where = 'WHERE p.ativa = 1';

    // Se usuário não pode ver todos, mostra só as suas
    if (!req.usuario.ver_todos_processos && req.usuario.nivel > 1) {
      where += ` AND EXISTS (
        SELECT 1 FROM processo pr
        JOIN processo_responsaveis prr ON prr.processo_id = pr.id
        WHERE pr.pasta_id = p.id AND prr.usuario_id = ?
      )`;
      params.push(req.usuario.id);
    }

    if (busca) {
      where += ' AND (p.titulo LIKE ? OR LPAD(p.numero, 4, "0") LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`);
    }

    const [rows] = await pool.execute(
      `SELECT p.id, LPAD(p.numero, 4, '0') AS numero_fmt, p.numero, p.titulo, p.area_direito,
              p.tipo_pessoa, p.cliente_id,
              CASE p.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = p.cliente_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = p.cliente_id)
              END AS cliente_nome,
              (SELECT COUNT(*) FROM processo pr WHERE pr.pasta_id = p.id) AS total_processos
       FROM pasta p
       ${where}
       ORDER BY p.numero DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limite), parseInt(offset)]
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM pasta p ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/processos/pastas/:id — Busca pasta completa com seus processos
async function buscarPasta(req, res) {
  try {
    const { id } = req.params;

    const [pastas] = await pool.execute(
      `SELECT p.*,
              CASE p.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = p.cliente_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = p.cliente_id)
              END AS cliente_nome
       FROM pasta p WHERE p.id = ?`,
      [id]
    );
    if (!pastas.length) return naoEncontrado(res, 'Pasta não encontrada');

    // Busca processos da pasta
    const [processos] = await pool.execute(
      `SELECT pr.*, v.nome AS vara_nome, f.nome AS forum_nome, sp.nome AS status_nome
       FROM processo pr
       LEFT JOIN vara v ON pr.vara_id = v.id
       LEFT JOIN forum f ON v.forum_id = f.id
       LEFT JOIN status_processo sp ON pr.status_id = sp.id
       WHERE pr.pasta_id = ?
       ORDER BY pr.id DESC`,
      [id]
    );

    // Busca honorários
    const [honorarios] = await pool.execute(
      'SELECT * FROM honorarios WHERE pasta_id = ?', [id]
    );

    return sucesso(res, { ...pastas[0], processos, honorarios: honorarios[0] || null });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/pastas — Cria nova pasta
async function criarPasta(req, res) {
  try {
    const { titulo, area_direito, tipo_pessoa, cliente_id } = req.body;

    if (!titulo || !area_direito || !tipo_pessoa || !cliente_id) {
      return erro(res, 'Título, área do direito, tipo de pessoa e cliente são obrigatórios');
    }

    // Gera próximo número de pasta
    const [ultimo] = await pool.execute('SELECT MAX(numero) as ultimo FROM pasta');
    const proximoNumero = (ultimo[0].ultimo || 0) + 1;

    const [result] = await pool.execute(
      `INSERT INTO pasta (numero, titulo, area_direito, tipo_pessoa, cliente_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [proximoNumero, titulo.trim(), area_direito, tipo_pessoa, cliente_id, req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'pasta', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId, numero: proximoNumero }, 'Pasta criada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ---- PROCESSOS ----

// GET /api/processos/:id — Busca processo completo
async function buscarProcesso(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT pr.*, v.nome AS vara_nome, f.nome AS forum_nome, f.id AS forum_id,
              sp.nome AS status_nome, p.titulo AS pasta_titulo,
              LPAD(p.numero, 4, '0') AS pasta_numero_fmt
       FROM processo pr
       LEFT JOIN vara v ON pr.vara_id = v.id
       LEFT JOIN forum f ON v.forum_id = f.id
       LEFT JOIN status_processo sp ON pr.status_id = sp.id
       JOIN pasta p ON pr.pasta_id = p.id
       WHERE pr.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Processo não encontrado');

    // Busca partes do processo
    const [partes] = await pool.execute(
      `SELECT pp.polo, pp.tipo_pessoa, pp.pessoa_id,
              CASE pp.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = pp.pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = pp.pessoa_id)
              END AS nome
       FROM partes_processo pp WHERE pp.processo_id = ?`,
      [id]
    );

    // Busca responsáveis
    const [responsaveis] = await pool.execute(
      `SELECT u.id, u.nome FROM processo_responsaveis pr
       JOIN usuarios u ON pr.usuario_id = u.id
       WHERE pr.processo_id = ?`,
      [id]
    );

    return sucesso(res, { ...rows[0], partes, responsaveis });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos — Cria novo processo vinculado a uma pasta
async function criarProcesso(req, res) {
  try {
    const { pasta_id, numero, vara_id, status_id, data_inicio, observacoes,
            partes = [], responsaveis = [] } = req.body;

    if (!pasta_id) return erro(res, 'Pasta é obrigatória');

    const [result] = await pool.execute(
      `INSERT INTO processo (pasta_id, numero, vara_id, status_id, data_inicio, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pasta_id, numero || null, vara_id || null, status_id || null,
       data_inicio || null, observacoes || null, req.usuario.id]
    );

    const processoId = result.insertId;

    // Insere partes do processo
    for (const parte of partes) {
      await pool.execute(
        `INSERT INTO partes_processo (processo_id, tipo_pessoa, pessoa_id, polo)
         VALUES (?, ?, ?, ?)`,
        [processoId, parte.tipo_pessoa, parte.pessoa_id, parte.polo]
      );
    }

    // Insere responsáveis
    for (const usuarioId of responsaveis) {
      await pool.execute(
        'INSERT INTO processo_responsaveis (processo_id, usuario_id) VALUES (?, ?)',
        [processoId, usuarioId]
      );
    }

    await auditoria.registrar(req.usuario.id, 'processo', 'criar', processoId);
    return sucesso(res, { id: processoId }, 'Processo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/processos/:id — Atualiza processo
async function atualizarProcesso(req, res) {
  try {
    const { id } = req.params;
    const { numero, vara_id, status_id, data_inicio, observacoes } = req.body;

    const [antes] = await pool.execute('SELECT * FROM processo WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Processo não encontrado');

    await pool.execute(
      `UPDATE processo SET numero=?, vara_id=?, status_id=?, data_inicio=?, observacoes=?
       WHERE id = ?`,
      [numero || null, vara_id || null, status_id || null, data_inicio || null, observacoes || null, id]
    );

    await auditoria.registrar(req.usuario.id, 'processo', 'editar', id, antes[0]);
    return sucesso(res, null, 'Processo atualizado com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/processos/auxiliares — Fóruns, varas, status para selects
async function buscarAuxiliares(req, res) {
  try {
    const [foruns]  = await pool.execute('SELECT * FROM forum WHERE ativo=1 ORDER BY nome');
    const [varas]   = await pool.execute(
      'SELECT v.*, f.nome AS forum_nome FROM vara v JOIN forum f ON v.forum_id = f.id WHERE v.ativo=1 ORDER BY f.nome, v.nome'
    );
    const [status]  = await pool.execute('SELECT * FROM status_processo WHERE ativo=1 ORDER BY nome');
    const [usuarios] = await pool.execute(
      'SELECT id, nome, tipo FROM usuarios WHERE ativo=1 AND nivel > 0 ORDER BY nome'
    );

    return sucesso(res, { foruns, varas, status, usuarios });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listarPastas, buscarPasta, criarPasta, buscarProcesso, criarProcesso, atualizarProcesso, buscarAuxiliares };
