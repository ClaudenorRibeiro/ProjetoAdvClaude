// ============================================================
// CONTROLLER DE COMPROMISSOS DA AGENDA (eventos pessoais/avulsos)
// ------------------------------------------------------------
// Compromissos NÃO ligados a processo — reuniões, lembretes, etc.
// Cada usuário gerencia os SEUS; pode marcar como "do escritório"
// (escritorio=1) para aparecer no modo Escritório da agenda.
// Operações de um passo só → não exigem transação (regra do projeto).
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');

// GET /api/agenda/compromissos?de=YYYY-MM-DD&ate=YYYY-MM-DD&escritorio=0|1
// Modo usuário: só os do próprio usuário. Modo escritório: só os compartilhados (escritorio=1).
async function listar(req, res) {
  try {
    const { de, ate } = req.query;
    const cond = [];
    const params = [];
    if (de)  { cond.push('c.data >= ?'); params.push(de); }
    if (ate) { cond.push('c.data <= ?'); params.push(ate); }
    if (req.query.escritorio === '1') {
      cond.push('c.escritorio = 1');                          // compartilhados de qualquer usuário
    } else {
      cond.push('c.usuario_id = ?'); params.push(req.usuario.id); // só os meus
    }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const [rows] = await pool.execute(
      `SELECT c.id, c.usuario_id, c.titulo, c.descricao, c.data, c.hora_inicio, c.hora_fim, c.dia_todo, c.escritorio,
              u.nome AS usuario_nome
       FROM agenda_compromisso c
       LEFT JOIN usuarios u ON c.usuario_id = u.id
       ${where}
       ORDER BY c.data ASC, c.hora_inicio ASC`,
      params
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// Normaliza os campos do corpo (hora só quando NÃO for dia todo).
function dadosDoCorpo(body) {
  const diaTodo = body.dia_todo ? 1 : 0;
  return {
    titulo: (body.titulo || '').trim(),
    descricao: body.descricao && body.descricao.trim() ? body.descricao.trim() : null,
    data: body.data || null,
    dia_todo: diaTodo,
    hora_inicio: diaTodo ? null : (body.hora_inicio || null),
    hora_fim: diaTodo ? null : (body.hora_fim || null),
    escritorio: body.escritorio ? 1 : 0,
  };
}

// POST /api/agenda/compromissos — cria um compromisso do usuário logado
async function criar(req, res) {
  try {
    const d = dadosDoCorpo(req.body);
    if (!d.titulo) return erro(res, 'Informe o título do compromisso');
    if (!d.data)   return erro(res, 'Informe a data');
    const [r] = await pool.execute(
      `INSERT INTO agenda_compromisso (usuario_id, titulo, descricao, data, hora_inicio, hora_fim, dia_todo, escritorio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.usuario.id, d.titulo, d.descricao, d.data, d.hora_inicio, d.hora_fim, d.dia_todo, d.escritorio]
    );
    return sucesso(res, { id: r.insertId }, 'Compromisso criado', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/agenda/compromissos/:id — edita (somente o dono)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT usuario_id FROM agenda_compromisso WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Compromisso não encontrado');
    if (rows[0].usuario_id !== req.usuario.id) return erro(res, 'Você só pode editar os seus próprios compromissos');

    const d = dadosDoCorpo(req.body);
    if (!d.titulo) return erro(res, 'Informe o título do compromisso');
    if (!d.data)   return erro(res, 'Informe a data');
    await pool.execute(
      `UPDATE agenda_compromisso
         SET titulo=?, descricao=?, data=?, hora_inicio=?, hora_fim=?, dia_todo=?, escritorio=?, alterado_em=NOW()
       WHERE id=?`,
      [d.titulo, d.descricao, d.data, d.hora_inicio, d.hora_fim, d.dia_todo, d.escritorio, id]
    );
    return sucesso(res, null, 'Compromisso atualizado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/agenda/compromissos/:id — exclui (somente o dono)
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT usuario_id FROM agenda_compromisso WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Compromisso não encontrado');
    if (rows[0].usuario_id !== req.usuario.id) return erro(res, 'Você só pode excluir os seus próprios compromissos');
    await pool.execute('DELETE FROM agenda_compromisso WHERE id = ?', [id]);
    return sucesso(res, null, 'Compromisso excluído');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, criar, atualizar, excluir };
