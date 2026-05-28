// ============================================================
// CONTROLLER DE PRAZOS
// CRUD, cálculo de vencimento, status e auditoria
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { calcularVencimento } = require('../services/calendarioService');
const auditoria = require('../middleware/auditoria');

// GET /api/prazos — Lista prazos com filtros
async function listar(req, res) {
  try {
    const { processo_id, usuario_id, status, data_de, data_ate, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (processo_id) { where += ' AND pp.processo_id = ?'; params.push(processo_id); }
    if (status)      { where += ' AND pp.status = ?';      params.push(status); }
    if (data_de)     { where += ' AND pp.data_vencimento >= ?'; params.push(data_de); }
    if (data_ate)    { where += ' AND pp.data_vencimento <= ?'; params.push(data_ate); }

    // Filtra por usuário — se não for admin, vê só os seus ou os do escritório
    if (usuario_id) {
      where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
      params.push(usuario_id);
    } else if (req.usuario.nivel > 1 && !req.usuario.ver_todos_processos) {
      where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
      params.push(req.usuario.id);
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT pp.id, pp.descricao, pp.data_inicio, pp.data_vencimento, pp.status,
              pp.quantidade, pp.tipo_dias, pp.delegado_para,
              ps.nome AS subtipo_nome, tp.nome AS tipo_prazo_nome,
              u.nome AS responsavel_nome,
              pr.numProc AS processo_numero,
              pr.NomeTituloProc AS pasta_titulo, LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
              DATEDIFF(pp.data_vencimento, CURDATE()) AS dias_restantes
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
       LEFT JOIN tipo_prazo tp ON ps.tipo_prazo_id = tp.id
       LEFT JOIN usuarios u ON pp.delegado_para = u.id
       JOIN tblProc pr ON pp.processo_id = pr.id
       JOIN tblPasta pa ON pr.pasta_id = pa.id
       ${where}
       ORDER BY pp.data_vencimento ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM prazos_processo pp ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/prazos — Cria novo prazo
async function criar(req, res) {
  try {
    const {
      processo_id, subtipo_id, descricao, data_inicio,
      quantidade, tipo_dias, delegado_para
    } = req.body;

    if (!processo_id || !data_inicio) {
      return erro(res, 'Processo e data de início são obrigatórios');
    }

    // Calcula automaticamente a data de vencimento
    let data_vencimento = null;
    if (quantidade && tipo_dias) {
      data_vencimento = await calcularVencimento(data_inicio, quantidade, tipo_dias);
    }

    const [result] = await pool.execute(
      `INSERT INTO prazos_processo
         (processo_id, subtipo_id, descricao, data_inicio, quantidade, tipo_dias,
          data_vencimento, delegado_para, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        processo_id, subtipo_id || null, descricao || null, data_inicio,
        quantidade || null, tipo_dias || 'uteis', data_vencimento,
        delegado_para || null, req.usuario.id
      ]
    );

    await auditoria.registrar(req.usuario.id, 'prazos_processo', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId, data_vencimento }, 'Prazo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id/status — Muda o status de um prazo
async function mudarStatus(req, res) {
  const { id } = req.params;
  const { status, observacao } = req.body;

  const statusValidos = ['aberto', 'fazendo', 'pendente', 'agendado', 'concluido'];
  if (!statusValidos.includes(status)) {
    return erro(res, 'Status inválido');
  }

  const [antes] = await pool.execute(
    'SELECT status, delegado_para FROM prazos_processo WHERE id = ?', [id]
  );
  if (!antes.length) return naoEncontrado(res, 'Prazo não encontrado');

  // Transação: UPDATE do status + INSERT na auditoria — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const campos = status === 'concluido' ? ', concluido_por = ?, concluido_em = NOW()' : '';
    const extraParams = status === 'concluido' ? [req.usuario.id] : [];

    await conn.execute(
      `UPDATE prazos_processo SET status = ?, status_alterado_por = ?, status_alterado_em = NOW() ${campos}
       WHERE id = ?`,
      [status, req.usuario.id, ...extraParams, id]
    );

    // Registra na auditoria de prazos dentro da mesma transação
    await conn.execute(
      `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [id, antes[0].status, status, req.usuario.id, observacao || null]
    );

    await conn.commit();         // Grava status + auditoria de uma vez
    return sucesso(res, null, `Prazo marcado como "${status}"`);
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// GET /api/prazos/tipos — Retorna tipos e subtipos para selects
async function buscarTipos(req, res) {
  try {
    const [tipos]    = await pool.execute('SELECT * FROM tipo_prazo WHERE ativo=1 ORDER BY nome');
    const [subtipos] = await pool.execute(
      `SELECT ps.*, tp.nome AS tipo_nome FROM prazo_subtipo ps
       JOIN tipo_prazo tp ON ps.tipo_prazo_id = tp.id
       WHERE ps.ativo = 1 ORDER BY tp.nome, ps.nome`
    );
    return sucesso(res, { tipos, subtipos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/prazos/hoje — Prazos que vencem hoje (para o dashboard)
async function vencemHoje(req, res) {
  try {
    const userId = req.usuario.id;
    const [rows] = await pool.execute(
      `SELECT pp.id, pp.descricao, pp.status, pp.data_vencimento,
              ps.nome AS subtipo, pr.numProc AS processo_numero
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
       JOIN tblProc pr ON pp.processo_id = pr.id
       WHERE pp.data_vencimento = CURDATE()
         AND pp.status != 'concluido'
         AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)`,
      [userId]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, mudarStatus, buscarTipos, vencemHoje };
