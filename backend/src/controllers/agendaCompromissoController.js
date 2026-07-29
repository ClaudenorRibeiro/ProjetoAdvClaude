// ============================================================
// CONTROLLER DE COMPROMISSOS DA AGENDA (eventos pessoais/avulsos)
// ------------------------------------------------------------
// Compromissos NÃO ligados a processo — reuniões, lembretes, etc.
// Cada usuário gerencia os SEUS; pode marcar como "do escritório"
// (escritorio=1) para aparecer no modo Escritório da agenda.
// Pode ainda DELEGAR o compromisso para outro usuário (delegado_para):
// nesse caso ele aparece só na agenda de quem recebeu. O admin (nível
// <=1) vê a de todos e pode filtrar por usuário.
// Operações de um passo só → não exigem transação (regra do projeto).
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { bloqueiaAgendarPassado } = require('../utils/helpers');

// Quem pode editar/excluir/dar baixa: o criador, o delegado (quem recebeu)
// ou o admin/super (nível <= 1). Recebe a linha (usuario_id, delegado_para).
function podeMexer(row, usuario) {
  return row.usuario_id === usuario.id
      || row.delegado_para === usuario.id
      || Number(usuario.nivel) <= 1;
}

// GET /api/agenda/compromissos?de=YYYY-MM-DD&ate=YYYY-MM-DD&escritorio=0|1&usuario_id=
// Modo escritório: só os compartilhados (escritorio=1).
// Modo usuário: o "responsável" pelo compromisso = o delegado; se não houver
// delegado, o próprio criador (COALESCE). Usuário comum só vê os seus; admin
// pode filtrar por usuario_id ou, sem ele, ver de todos.
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
      const podeVerTodos = Number(req.usuario.nivel) <= 1;    // admin/super
      if (!podeVerTodos) {
        // Comum: só os compromissos de que ele é o responsável (ignora usuario_id recebido → não burla)
        cond.push('COALESCE(c.delegado_para, c.usuario_id) = ?'); params.push(req.usuario.id);
      } else if (req.query.usuario_id) {
        // Admin escolheu um usuário: a agenda daquela pessoa
        cond.push('COALESCE(c.delegado_para, c.usuario_id) = ?'); params.push(req.query.usuario_id);
      }
      // Admin sem usuario_id = "Todos": sem filtro por usuário
    }

    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const [rows] = await pool.execute(
      `SELECT c.id, c.usuario_id, c.delegado_para, c.titulo, c.descricao, c.data,
              c.hora_inicio, c.hora_fim, c.dia_todo, c.escritorio,
              c.concluido, c.concluido_por, c.concluido_em, c.criado_em,
              u.nome  AS usuario_nome,
              ud.nome AS delegado_nome,
              ub.nome AS concluido_nome
       FROM agenda_compromisso c
       LEFT JOIN usuarios u  ON c.usuario_id    = u.id
       LEFT JOIN usuarios ud ON c.delegado_para = ud.id
       LEFT JOIN usuarios ub ON c.concluido_por = ub.id
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
    // Delegado: para quem é o compromisso. Vazio/0 → null (compromisso do próprio criador).
    delegado_para: body.delegado_para ? Number(body.delegado_para) : null,
  };
}

// POST /api/agenda/compromissos — cria um compromisso (do usuário logado; pode já delegar)
async function criar(req, res) {
  try {
    const d = dadosDoCorpo(req.body);
    if (!d.titulo) return erro(res, 'Informe o título do compromisso');
    if (!d.data)   return erro(res, 'Informe a data');
    if (bloqueiaAgendarPassado(req.usuario, d.data)) {
      return erro(res, 'Apenas o administrador pode agendar compromisso com data anterior a hoje. Escolha uma data a partir de hoje.');
    }
    const [r] = await pool.execute(
      `INSERT INTO agenda_compromisso
         (usuario_id, delegado_para, titulo, descricao, data, hora_inicio, hora_fim, dia_todo, escritorio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.usuario.id, d.delegado_para, d.titulo, d.descricao, d.data, d.hora_inicio, d.hora_fim, d.dia_todo, d.escritorio]
    );
    return sucesso(res, { id: r.insertId }, 'Compromisso criado', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/agenda/compromissos/:id — edita (criador, delegado ou admin)
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT usuario_id, delegado_para FROM agenda_compromisso WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Compromisso não encontrado');
    if (!podeMexer(rows[0], req.usuario)) return erro(res, 'Você não tem permissão para editar este compromisso');

    const d = dadosDoCorpo(req.body);
    if (!d.titulo) return erro(res, 'Informe o título do compromisso');
    if (!d.data)   return erro(res, 'Informe a data');
    if (bloqueiaAgendarPassado(req.usuario, d.data)) {
      return erro(res, 'Apenas o administrador pode agendar compromisso com data anterior a hoje. Escolha uma data a partir de hoje.');
    }
    await pool.execute(
      `UPDATE agenda_compromisso
         SET titulo=?, descricao=?, data=?, hora_inicio=?, hora_fim=?, dia_todo=?, escritorio=?, delegado_para=?, alterado_em=NOW()
       WHERE id=?`,
      [d.titulo, d.descricao, d.data, d.hora_inicio, d.hora_fim, d.dia_todo, d.escritorio, d.delegado_para, id]
    );
    return sucesso(res, null, 'Compromisso atualizado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/agenda/compromissos/:id — exclui (criador, delegado ou admin)
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT usuario_id, delegado_para FROM agenda_compromisso WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Compromisso não encontrado');
    if (!podeMexer(rows[0], req.usuario)) return erro(res, 'Você não tem permissão para excluir este compromisso');
    await pool.execute('DELETE FROM agenda_compromisso WHERE id = ?', [id]);
    return sucesso(res, null, 'Compromisso excluído');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/agenda/compromissos/:id/baixa — dá baixa (conclui) ou reabre (criador, delegado ou admin).
// É um alternador: se estava em aberto, conclui (grava quem/quando); se estava concluído, reabre.
async function darBaixa(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT usuario_id, delegado_para, concluido FROM agenda_compromisso WHERE id = ?', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Compromisso não encontrado');
    if (!podeMexer(rows[0], req.usuario)) return erro(res, 'Você não tem permissão para dar baixa neste compromisso');

    if (Number(rows[0].concluido) === 1) {
      await pool.execute(
        'UPDATE agenda_compromisso SET concluido=0, concluido_por=NULL, concluido_em=NULL WHERE id=?', [id]
      );
      return sucesso(res, null, 'Compromisso reaberto');
    }
    await pool.execute(
      'UPDATE agenda_compromisso SET concluido=1, concluido_por=?, concluido_em=NOW() WHERE id=?',
      [req.usuario.id, id]
    );
    return sucesso(res, null, 'Compromisso concluído');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/agenda/usuarios — usuários ATIVOS (para o seletor "Delegar para" e o filtro do admin).
// Acessível a qualquer usuário logado (só id e nome — nada sensível).
async function listarUsuariosAtivos(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome ASC'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, criar, atualizar, excluir, darBaixa, listarUsuariosAtivos };
