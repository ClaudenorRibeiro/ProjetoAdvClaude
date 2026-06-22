// ============================================================
// CONTROLLER DE PERÍCIAS
// Agendamento de perícias técnicas vinculadas a processos.
// Fluxo espelhado na audiência: status (agendada/realizada/cancelada/remarcada),
// cancelar, remarcar e histórico (auditoria_pericia). NÃO tem "registrar ata".
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { enviarComunicadoPericia } = require('../services/comunicadoService');

// Verifica permissão granular na tabela `permissoes` (admin/super: acesso total)
async function temPermissaoBackend(usuarioId, nivel, modulo, acao) {
  if (nivel <= 1) return true; // admin/super: acesso total
  const [rows] = await pool.execute(
    'SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = ? AND submodulo IS NULL AND acao = ?',
    [usuarioId, modulo, acao]
  );
  return rows.length > 0 && rows[0].permitido === 1;
}

// "usuario:X" ou "freela:X" → { responsavel_id, responsavel_freela_id }
function parsarResponsavel(valor) {
  if (!valor) return { responsavel_id: null, responsavel_freela_id: null };
  const [tipo, id] = String(valor).split(':');
  if (tipo === 'usuario') return { responsavel_id: parseInt(id), responsavel_freela_id: null };
  if (tipo === 'freela')  return { responsavel_id: null, responsavel_freela_id: parseInt(id) };
  return { responsavel_id: null, responsavel_freela_id: null };
}

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
        pe.id, pe.processo_id, pe.data, pe.hora, pe.local, pe.status,
        pe.perito_tipo, pe.perito_id, pe.assistente_tecnico_id,
        pe.responsavel_id, pe.responsavel_freela_id,
        pe.comunicado_enviado, pe.criado_em,
        tp.nome  AS tipo_nome,
        CASE
          WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
          WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social
          ELSE NULL
        END AS perito_nome,
        u.nome   AS assistente_nome,
        -- Responsável pode ser usuário do sistema OU freelancer
        COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
        u2.nome  AS criado_por_nome,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo,
        pa.id     AS pasta_id,
        pa.numPasta AS pasta_numero,
        -- Existe modelo de documento para o tipo desta perícia? (controla o botão "Gerar Doc")
        EXISTS(
          SELECT 1 FROM modelo_documento md
          WHERE md.ativo = 1 AND md.destino = 'pericia' AND md.tipo_pericia_id <=> pe.tipo_pericia_id
        ) AS tem_modelo_doc
      FROM pericia pe
      LEFT JOIN tipo_pericia      tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas   pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id   = u.id
      LEFT JOIN usuarios ur ON pe.responsavel_id          = ur.id
      LEFT JOIN advogados_freela rf ON pe.responsavel_freela_id = rf.id
      LEFT JOIN usuarios u2 ON pe.criado_por = u2.id
      LEFT JOIN tblproc pr ON pe.processo_id = pr.id
      LEFT JOIN tblpasta pa ON pr.pasta_id   = pa.id
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

// GET /api/pericias/:id — Busca perícia por ID (inclui endereço e responsável para edição)
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
        COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
        -- Valor pronto para o select de responsável no formulário de edição
        CASE
          WHEN pe.responsavel_id IS NOT NULL        THEN CONCAT('usuario:', pe.responsavel_id)
          WHEN pe.responsavel_freela_id IS NOT NULL THEN CONCAT('freela:', pe.responsavel_freela_id)
          ELSE NULL
        END AS responsavel_valor,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo
      FROM pericia pe
      LEFT JOIN tipo_pericia      tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas   pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id   = u.id
      LEFT JOIN usuarios ur ON pe.responsavel_id          = ur.id
      LEFT JOIN advogados_freela rf ON pe.responsavel_freela_id = rf.id
      LEFT JOIN tblproc pr ON pe.processo_id = pr.id
      WHERE pe.id = ?
    `, [req.params.id]);

    if (!rows.length) return naoEncontrado(res, 'Perícia não encontrada');
    return sucesso(res, rows[0]);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/peritos-processo?processo_id=X — Peritos vinculados ao processo
// Usado para popular o seletor de perito da perícia (escopo: só peritos do processo)
async function peritosDoProcesso(req, res) {
  try {
    const { processo_id } = req.query;
    if (!processo_id) return erro(res, 'processo_id é obrigatório');
    const [rows] = await pool.execute(
      `SELECT pp.tipo_pessoa, pp.pessoa_id,
              CASE pp.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = pp.pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = pp.pessoa_id)
              END AS nome
       FROM processo_perito pp
       WHERE pp.proc_id = ?
       ORDER BY nome`,
      [processo_id]
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias — Cria perícia
// Transação: INSERT + auditoria_pericia + log geral (tudo ou nada)
async function criar(req, res) {
  const {
    processo_id, tipo_pericia_id, data, hora,
    local, cep, logradouro, numero, complemento, bairro, cidade, estado,
    perito_tipo, perito_id, assistente_tecnico_id,
    responsavel_id: responsavelRaw,
    obs_auditoria   // texto enviado quando o usuário confirma data/dia incomum com senha
  } = req.body;

  if (!processo_id) return erro(res, 'Processo é obrigatório');
  if (!data)        return erro(res, 'Data é obrigatória');

  const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.execute(
      `INSERT INTO pericia
        (processo_id, tipo_pericia_id, data, hora,
         local, cep, logradouro, numero, complemento, bairro, cidade, estado,
         perito_tipo, perito_id, assistente_tecnico_id,
         responsavel_id, responsavel_freela_id,
         status, criado_por)
       VALUES (?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?, ?,?, 'agendada', ?)`,
      [
        processo_id, tipo_pericia_id || null, data, hora || null,
        local || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        perito_tipo || null, perito_id || null, assistente_tecnico_id || null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id
      ]
    );
    const periciaId = r.insertId;

    // Histórico: registra o cadastro
    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'cadastrado', null, 'Perícia cadastrada', ?)`,
      [periciaId, req.usuario.id]
    );
    // Registra confirmação de data/dia incomum (com senha), se houver
    if (obs_auditoria) {
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'criacao', null, ?, ?)`,
        [periciaId, obs_auditoria, req.usuario.id]
      );
    }

    await auditoria.registrar(req.usuario.id, 'pericia', 'criar', periciaId, null, null, conn);

    await conn.commit();

    // Comunicado automático ao cliente — best-effort (não derruba o cadastro se o e-mail falhar)
    try { await enviarComunicadoPericia(periciaId, 'agendada', req.usuario.id); }
    catch (err) { console.error('Falha ao enviar comunicado da perícia:', err.message); }

    return sucesso(res, { id: periciaId }, 'Perícia criada com sucesso', 201);
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pericias/:id — Atualiza perícia
// Transação: UPDATE + auditoria_pericia + log geral (tudo ou nada)
async function atualizar(req, res) {
  const {
    tipo_pericia_id, data, hora,
    local, cep, logradouro, numero, complemento, bairro, cidade, estado,
    perito_tipo, perito_id, assistente_tecnico_id,
    responsavel_id: responsavelRaw
  } = req.body;

  if (!data) return erro(res, 'Data é obrigatória');

  const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existe] = await conn.execute('SELECT id FROM pericia WHERE id = ?', [req.params.id]);
    if (!existe.length) {
      await conn.rollback();
      return naoEncontrado(res, 'Perícia não encontrada');
    }

    await conn.execute(
      `UPDATE pericia SET
        tipo_pericia_id=?, data=?, hora=?,
        local=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, estado=?,
        perito_tipo=?, perito_id=?, assistente_tecnico_id=?,
        responsavel_id=?, responsavel_freela_id=?,
        alterado_por=?, alterado_em=NOW()
       WHERE id=?`,
      [
        tipo_pericia_id || null, data, hora || null,
        local || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        perito_tipo || null, perito_id || null, assistente_tecnico_id || null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id, req.params.id
      ]
    );

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

// PUT /api/pericias/:id/realizada — Marca a perícia como realizada (sem ata)
async function marcarRealizada(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser marcada como realizada`);
    }

    await pool.execute(
      `UPDATE pericia SET status = 'realizada', alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [req.usuario.id, id]
    );
    await pool.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'realizada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );
    return sucesso(res, null, 'Perícia marcada como realizada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pericias/:id/cancelar — Cancela a perícia (registro histórico)
async function cancelar(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para cancelar perícias', 403);

    if (!motivo?.trim()) return erro(res, 'Motivo do cancelamento é obrigatório');

    const [antes] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status === 'cancelada') return erro(res, 'Perícia já está cancelada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser cancelada`);
    }

    await pool.execute(
      `UPDATE pericia SET status = 'cancelada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [motivo.trim(), req.usuario.id, id]
    );
    await pool.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'cancelada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );

    // Avisa o cliente do cancelamento — best-effort
    try { await enviarComunicadoPericia(id, 'cancelada', req.usuario.id); }
    catch (err) { console.error('Falha ao enviar comunicado de cancelamento:', err.message); }

    return sucesso(res, null, 'Perícia cancelada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pericias/:id/remarcar — Marca original como remarcada e cria nova perícia
async function remarcar(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { motivo, nova_data, nova_hora } = req.body;

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para remarcar perícias', 403);

    if (!motivo?.trim()) return erro(res, 'Motivo da remarcação é obrigatório');
    if (!nova_data)      return erro(res, 'Nova data é obrigatória');

    const [antes] = await pool.execute('SELECT * FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser remarcada`);
    }

    await conn.beginTransaction();

    // Marca a original como remarcada
    await conn.execute(
      `UPDATE pericia SET status = 'remarcada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [motivo.trim(), req.usuario.id, id]
    );
    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'remarcada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );

    // Cria nova perícia aproveitando os dados da original (endereço, perito, responsável, etc.)
    const o = antes[0];
    const [result] = await conn.execute(
      `INSERT INTO pericia
        (processo_id, tipo_pericia_id, data, hora,
         local, cep, logradouro, numero, complemento, bairro, cidade, estado,
         perito_tipo, perito_id, assistente_tecnico_id,
         responsavel_id, responsavel_freela_id,
         status, criado_por)
       VALUES (?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?, ?,?, 'agendada', ?)`,
      [
        o.processo_id, o.tipo_pericia_id, nova_data, nova_hora || o.hora,
        o.local, o.cep, o.logradouro, o.numero, o.complemento, o.bairro, o.cidade, o.estado,
        o.perito_tipo, o.perito_id, o.assistente_tecnico_id,
        o.responsavel_id, o.responsavel_freela_id,
        req.usuario.id
      ]
    );
    const novaId = result.insertId;

    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'criacao', null, ?, ?)`,
      [novaId, `Criada por remarcação da perícia #${id}`, req.usuario.id]
    );

    await conn.commit();

    // Reenvia o comunicado ao cliente com a nova data — best-effort
    try { await enviarComunicadoPericia(novaId, 'remarcada', req.usuario.id); }
    catch (err) { console.error('Falha ao enviar comunicado de remarcação:', err.message); }

    return sucesso(res, { nova_pericia_id: novaId }, 'Perícia remarcada e nova perícia criada com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/pericias/:id — Exclui perícia (canceladas/remarcadas são histórico e não podem)
async function excluir(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'excluir');
    if (!permitido) return erro(res, 'Sem permissão para excluir perícias', 403);

    const [rows] = await pool.execute('SELECT id, status FROM pericia WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (rows[0].status === 'cancelada') return erro(res, 'Perícia cancelada não pode ser excluída — ela faz parte do histórico');
    if (rows[0].status === 'remarcada') return erro(res, 'Perícia remarcada não pode ser excluída — ela faz parte do histórico');

    await conn.beginTransaction();
    await conn.execute('DELETE FROM auditoria_pericia WHERE pericia_id = ?', [id]);
    await conn.execute('DELETE FROM pericia WHERE id = ?', [id]);
    await conn.commit();
    return sucesso(res, null, 'Perícia excluída com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/pericias/:id/historico — Auditoria campo a campo da perícia
async function buscarHistorico(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.campo_alterado, ap.valor_anterior, ap.valor_novo,
              ap.alterado_em, u.nome AS usuario_nome
       FROM auditoria_pericia ap
       LEFT JOIN usuarios u ON ap.usuario_id = u.id
       WHERE ap.pericia_id = ?
       ORDER BY ap.alterado_em ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
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

// POST /api/pericias/tipos — Cria um novo tipo de perícia (gerenciamento pelo "...")
// Operação de escrita única (INSERT) — a consulta anterior é só validação de duplicidade.
async function criarTipo(req, res) {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Evita nome duplicado entre os tipos ativos
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_pericia WHERE nome = ? AND ativo = 1 LIMIT 1',
      [nome.trim()]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    // ativo tem DEFAULT 1 no banco — o tipo já nasce ativo
    const [r] = await pool.execute('INSERT INTO tipo_pericia (nome) VALUES (?)', [nome.trim()]);
    return sucesso(res, { id: r.insertId }, 'Tipo criado com sucesso', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/pericias/tipos/:id — Renomeia um tipo de perícia
async function atualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Duplicidade ignorando o próprio registro
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_pericia WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1',
      [nome.trim(), id]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    await pool.execute('UPDATE tipo_pericia SET nome = ? WHERE id = ?', [nome.trim(), id]);
    return sucesso(res, null, 'Tipo atualizado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/pericias/tipos/:id — Remove um tipo de perícia (soft-delete: ativo = 0)
// Bloqueia se algum registro de perícia ainda usa o tipo (preserva integridade do histórico).
async function excluirTipo(req, res) {
  try {
    const { id } = req.params;
    const [uso] = await pool.execute('SELECT id FROM pericia WHERE tipo_pericia_id = ? LIMIT 1', [id]);
    if (uso.length) return erro(res, 'Tipo está em uso e não pode ser excluído');
    await pool.execute('UPDATE tipo_pericia SET ativo = 0 WHERE id = ?', [id]);
    return sucesso(res, null, 'Tipo removido');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias/:id/comunicado — Envia (ou reenvia) o comunicado ao cliente
async function enviarComunicado(req, res) {
  try {
    const { id } = req.params;
    const [pe] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!pe.length) return naoEncontrado(res, 'Perícia não encontrada');

    // O texto do comunicado reflete o status atual da perícia
    const tipoEvento = pe[0].status === 'cancelada' ? 'cancelada'
                     : pe[0].status === 'remarcada' ? 'remarcada'
                     : 'agendada';

    const r = await enviarComunicadoPericia(id, tipoEvento, req.usuario.id);
    if (r.semCliente) {
      return erro(res, 'Defina no cadastro do processo qual parte é o cliente (autor ou réu) para enviar o comunicado');
    }
    if (r.enviados === 0) {
      return erro(res, r.semEmail
        ? 'O cliente não possui e-mail cadastrado'
        : 'Não foi possível enviar o comunicado (verifique o servidor de e-mail)');
    }
    return sucesso(res, null, `Comunicado enviado ao cliente (${r.enviados} e-mail(s))`);
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = {
  listar, buscar, criar, atualizar, tipos,
  criarTipo, atualizarTipo, excluirTipo,
  peritosDoProcesso, marcarRealizada, cancelar, remarcar, excluir,
  buscarHistorico, enviarComunicado,
};
