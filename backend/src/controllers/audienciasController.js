// ============================================================
// CONTROLLER DE AUDIÊNCIAS
// Inclui comunicado automático e registro de ata
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/audiencias — Lista audiências com filtros
async function listar(req, res) {
  try {
    const { processo_id, data_de, data_ate, sem_ata, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (processo_id) { where += ' AND a.processo_id = ?'; params.push(processo_id); }
    if (data_de)     { where += ' AND a.data >= ?'; params.push(data_de); }
    if (data_ate)    { where += ' AND a.data <= ?'; params.push(data_ate); }

    // Mostra só audiências sem ata (para o dashboard)
    if (sem_ata === 'true') {
      where += ' AND a.data < CURDATE() AND a.ata_impressa = 0 AND NOT EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)';
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT a.id, a.data, a.hora, a.modalidade, a.local, a.plataforma_virtual,
              a.link_virtual, a.comunicado_enviado, a.ata_impressa,
              ta.nome AS tipo_nome,
              pr.numero AS processo_numero,
              pa.titulo AS pasta_titulo, LPAD(pa.numero, 4, '0') AS pasta_numero_fmt,
              CASE WHEN aa.id IS NOT NULL THEN 1 ELSE 0 END AS tem_ata,
              DATEDIFF(a.data, CURDATE()) AS dias_para_audiencia
       FROM audiencia a
       LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
       LEFT JOIN ata_audiencia aa ON aa.audiencia_id = a.id
       JOIN processo pr ON a.processo_id = pr.id
       JOIN pasta pa ON pr.pasta_id = pa.id
       ${where}
       ORDER BY a.data ASC, a.hora ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM audiencia a ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/audiencias/:id — Busca audiência completa com ata
async function buscar(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT a.*, ta.nome AS tipo_nome, pr.numero AS processo_numero
       FROM audiencia a
       LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
       JOIN processo pr ON a.processo_id = pr.id
       WHERE a.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Audiência não encontrada');

    const [ata] = await pool.execute(
      'SELECT * FROM ata_audiencia WHERE audiencia_id = ?', [id]
    );

    return sucesso(res, { ...rows[0], ata: ata[0] || null });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/audiencias — Cria nova audiência
async function criar(req, res) {
  try {
    const { processo_id, tipo_audiencia_id, data, hora, modalidade,
            local, plataforma_virtual, link_virtual } = req.body;

    if (!processo_id || !data || !hora) {
      return erro(res, 'Processo, data e hora são obrigatórios');
    }

    // Busca o local padrão (endereço da vara) se não informado
    let localFinal = local;
    if (!localFinal) {
      const [vara] = await pool.execute(
        `SELECT CONCAT(v.nome, ' - ', f.nome) as local_padrao
         FROM processo pr
         JOIN vara v ON pr.vara_id = v.id
         JOIN forum f ON v.forum_id = f.id
         WHERE pr.id = ? LIMIT 1`,
        [processo_id]
      );
      localFinal = vara[0]?.local_padrao || '';
    }

    const [result] = await pool.execute(
      `INSERT INTO audiencia
         (processo_id, tipo_audiencia_id, data, hora, modalidade, local,
          plataforma_virtual, link_virtual, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        processo_id, tipo_audiencia_id || null, data, hora,
        modalidade || 'presencial', localFinal || null,
        plataforma_virtual || null, link_virtual || null, req.usuario.id
      ]
    );

    await auditoria.registrar(req.usuario.id, 'audiencia', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Audiência cadastrada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/audiencias/:id/ata — Registra a ata de uma audiência
async function registrarAta(req, res) {
  const { id } = req.params;
  const { resultado, houve_acordo, valor_acordo, parcelas, valor_parcela,
          data_primeiro_pagamento, nova_audiencia, observacoes,
          // Prazos e tarefas opcionais gerados pela ata
          prazos = [], tarefas = [] } = req.body;

  // Verifica se já tem ata antes de iniciar a transação (leitura simples)
  try {
    const [ataExistente] = await pool.execute(
      'SELECT id FROM ata_audiencia WHERE audiencia_id = ?', [id]
    );
    if (ataExistente.length > 0) {
      return erro(res, 'Esta audiência já possui ata registrada');
    }
  } catch (err) {
    return erroInterno(res, err);
  }

  // Transação: ata + lançamento financeiro + prazos + tarefas — tudo ou nada
  // Se qualquer passo falhar, nenhum dado fica pela metade no banco
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Cria a ata da audiência
    const [result] = await conn.execute(
      `INSERT INTO ata_audiencia
         (audiencia_id, resultado, houve_acordo, valor_acordo, parcelas,
          valor_parcela, data_primeiro_pagamento, nova_audiencia, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, resultado || null,
        houve_acordo ? 1 : 0,
        valor_acordo || null, parcelas || null, valor_parcela || null,
        data_primeiro_pagamento || null, nova_audiencia ? 1 : 0,
        observacoes || null, req.usuario.id
      ]
    );

    // Busca o processo_id da audiência para vincular prazos/tarefas
    const [aud] = await conn.execute('SELECT processo_id FROM audiencia WHERE id = ?', [id]);
    const processoId = aud[0]?.processo_id;

    // 2. Se houve acordo, lança automaticamente no financeiro da pasta
    if (houve_acordo && valor_acordo) {
      const [proc] = await conn.execute(
        'SELECT pasta_id FROM processo WHERE id = ?', [processoId]
      );
      if (proc[0]?.pasta_id) {
        await conn.execute(
          `INSERT INTO conta_corrente_pasta (pasta_id, data, descricao, valor, tipo, usuario_id)
           VALUES (?, CURDATE(), 'Acordo em audiência', ?, 'credito', ?)`,
          [proc[0].pasta_id, valor_acordo, req.usuario.id]
        );
      }
    }

    // 3. Cria os prazos gerados pela ata
    for (const p of prazos) {
      if (p.descricao && p.data_inicio) {
        const { calcularVencimento } = require('../services/calendarioService');
        const vencimento = p.quantidade
          ? await calcularVencimento(p.data_inicio, p.quantidade, p.tipo_dias || 'uteis')
          : p.data_vencimento;

        await conn.execute(
          `INSERT INTO prazos_processo (processo_id, subtipo_id, descricao, data_inicio,
            quantidade, tipo_dias, data_vencimento, delegado_para, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [processoId, p.subtipo_id || null, p.descricao, p.data_inicio,
           p.quantidade || null, p.tipo_dias || 'uteis', vencimento,
           p.delegado_para || null, req.usuario.id]
        );
      }
    }

    // 4. Cria as tarefas geradas pela ata
    for (const t of tarefas) {
      if (t.titulo) {
        await conn.execute(
          `INSERT INTO tarefas (titulo, descricao, prioridade, processo_id, atribuida_para,
            data_vencimento, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.titulo, t.descricao || null, t.prioridade || 'normal',
           processoId, t.atribuida_para || null, t.data_vencimento || null, req.usuario.id]
        );
      }
    }

    await conn.commit();         // Grava ata + financeiro + prazos + tarefas de uma vez
    await auditoria.registrar(req.usuario.id, 'ata_audiencia', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Ata registrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer passo falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// PUT /api/audiencias/:id/ata-impressa — Marca audiência como "ata já impressa"
async function marcarAtaImpressa(req, res) {
  try {
    const { id } = req.params;
    await pool.execute('UPDATE audiencia SET ata_impressa = 1 WHERE id = ?', [id]);
    return sucesso(res, null, 'Audiência marcada como ata impressa');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/audiencias/tipos — Lista tipos de audiência
async function buscarTipos(req, res) {
  try {
    const [tipos] = await pool.execute('SELECT * FROM tipo_audiencia WHERE ativo=1 ORDER BY nome');
    return sucesso(res, tipos);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, buscar, criar, registrarAta, marcarAtaImpressa, buscarTipos };
