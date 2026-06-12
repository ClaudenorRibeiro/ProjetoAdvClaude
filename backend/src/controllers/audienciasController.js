// ============================================================
// CONTROLLER DE AUDIÊNCIAS
// Inclui comunicado automático, registro de ata, tipos, freelas e testemunhas
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// Verifica permissão granular na tabela `permissoes` para o usuário logado
// Admin e super (nivel <= 1) têm acesso total sem consultar a tabela
// Retorna true se permitido, false se negado
async function temPermissaoBackend(usuarioId, nivel, modulo, acao) {
  if (nivel <= 1) return true; // admin/super: acesso total
  const [rows] = await pool.execute(
    'SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = ? AND submodulo IS NULL AND acao = ?',
    [usuarioId, modulo, acao]
  );
  return rows.length > 0 && rows[0].permitido === 1;
}

// GET /api/audiencias/advogados — Lista advogados (usuários tipo advogado + freelas)
// Usado no select "Responsável pela condução"
async function listarAdvogados(req, res) {
  try {
    const [usuarios] = await pool.execute(
      `SELECT id, nome, 'usuario' AS origem FROM usuarios
       WHERE tipo = 'advogado' AND ativo = 1 ORDER BY nome`
    );
    const [freelas] = await pool.execute(
      `SELECT id, nome, 'freela' AS origem FROM advogados_freela ORDER BY nome`
    );
    return sucesso(res, [...usuarios, ...freelas]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/audiencias — Lista audiências com filtros
async function listar(req, res) {
  try {
    const { processo_id, data_de, data_ate, status, sem_ata, responsavel_id, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (processo_id)    { where += ' AND a.processo_id = ?';   params.push(processo_id); }
    if (data_de)        { where += ' AND a.data >= ?';          params.push(data_de); }
    if (data_ate)       { where += ' AND a.data <= ?';          params.push(data_ate); }
    if (status)         { where += ' AND a.status = ?';         params.push(status); }
    if (responsavel_id) { where += ' AND a.responsavel_id = ?'; params.push(responsavel_id); }

    // Dashboard: audiências agendadas com data passada e sem ata registrada
    if (sem_ata === 'true') {
      where += ' AND a.status = \'agendada\' AND a.data < CURDATE() AND a.ata_impressa = 0 AND NOT EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)';
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT a.id, a.data, a.hora, a.modalidade, a.plataforma_virtual,
              a.link_virtual, a.comunicado_enviado, a.ata_impressa,
              a.status, a.motivo_status,
              ta.nome AS tipo_nome,
              pr.numProc AS processo_numero,
              pr.NomeTituloProc AS pasta_titulo,
              pa.id AS pasta_id,
              LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
              CASE WHEN aa.id IS NOT NULL THEN 1 ELSE 0 END AS tem_ata,
              DATEDIFF(a.data, CURDATE()) AS dias_para_audiencia,
              -- Responsável: usuário do sistema ou advogado freelancer
              COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
              -- Vara e fórum do local da audiência
              vr.nome AS vara_nome, vr.abrev_nome AS vara_abrev_nome,
              fr.nome AS vara_forum_nome
       FROM audiencia a
       LEFT JOIN tipo_audiencia ta    ON a.tipo_audiencia_id    = ta.id
       LEFT JOIN ata_audiencia aa     ON aa.audiencia_id         = a.id
       LEFT JOIN usuarios ur          ON a.responsavel_id        = ur.id
       LEFT JOIN advogados_freela rf  ON a.responsavel_freela_id = rf.id
       LEFT JOIN tblVara vr           ON a.vara_id               = vr.id
       LEFT JOIN tblForum fr          ON vr.forum_id             = fr.id
       JOIN tblProc pr ON a.processo_id = pr.id
       JOIN tblPasta pa ON pr.pasta_id = pa.id
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

// GET /api/audiencias/:id — Busca audiência completa com ata e testemunhas
async function buscar(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT a.*, ta.nome AS tipo_nome, pr.numProc AS processo_numero,
              COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
              vr.nome AS vara_nome, vr.abrev_nome AS vara_abrev_nome, vr.compl_end AS vara_compl_end,
              fr.nome AS vara_forum_nome,
              fr.logradouro AS vara_forum_logradouro, fr.num_end AS vara_forum_num_end,
              fr.bairro AS vara_forum_bairro, fr.cidade AS vara_forum_cidade,
              fr.uf AS vara_forum_uf, fr.cep AS vara_forum_cep
       FROM audiencia a
       LEFT JOIN tipo_audiencia ta   ON a.tipo_audiencia_id     = ta.id
       LEFT JOIN usuarios ur         ON a.responsavel_id         = ur.id
       LEFT JOIN advogados_freela rf ON a.responsavel_freela_id  = rf.id
       LEFT JOIN tblVara vr          ON a.vara_id                = vr.id
       LEFT JOIN tblForum fr         ON vr.forum_id              = fr.id
       JOIN tblProc pr ON a.processo_id = pr.id
       WHERE a.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Audiência não encontrada');

    const [ata] = await pool.execute(
      'SELECT * FROM ata_audiencia WHERE audiencia_id = ?', [id]
    );

    // Busca testemunhas da audiência com polo (autor/réu)
    const [testemunhas] = await pool.execute(
      `SELECT at.id, at.pessoa_id, at.polo, pf.nome, pf.cpf,
              (SELECT t.numero FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.principal = 1 LIMIT 1) AS telefone_principal
       FROM audiencia_testemunhas at
       JOIN pessoas_fisicas pf ON at.pessoa_id = pf.id
       WHERE at.audiencia_id = ?
       ORDER BY at.polo ASC, pf.nome ASC`,
      [id]
    );

    return sucesso(res, { ...rows[0], ata: ata[0] || null, testemunhas });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Extrai tipo e id do responsável a partir do valor composto "usuario:5" ou "freela:3"
function parsarResponsavel(valor) {
  if (!valor) return { responsavel_id: null, responsavel_freela_id: null };
  const [tipo, id] = valor.split(':');
  if (tipo === 'usuario') return { responsavel_id: parseInt(id), responsavel_freela_id: null };
  if (tipo === 'freela')  return { responsavel_id: null, responsavel_freela_id: parseInt(id) };
  return { responsavel_id: null, responsavel_freela_id: null };
}

// ============================================================
// Funções auxiliares para gravar nomes legíveis na auditoria
// Chamadas NO MOMENTO DA ALTERAÇÃO — zero custo na leitura do histórico
// ============================================================

// Resolve tipo_audiencia_id → nome do tipo (ex: "Audiência de Instrução")
async function resolverNomeTipo(id) {
  if (!id) return '';
  const [r] = await pool.execute('SELECT nome FROM tipo_audiencia WHERE id = ?', [id]);
  return r.length ? r[0].nome : String(id);
}

// Resolve vara_id → "Abrev — Fórum" (ex: "2ª Vara Cível — Foro Central")
async function resolverNomeVara(id) {
  if (!id) return '';
  const [r] = await pool.execute(
    `SELECT COALESCE(v.abrev_nome, v.nome) AS nome, f.nome AS forum_nome
     FROM tblVara v LEFT JOIN tblForum f ON v.forum_id = f.id WHERE v.id = ?`, [id]
  );
  return r.length ? `${r[0].nome}${r[0].forum_nome ? ` — ${r[0].forum_nome}` : ''}` : String(id);
}

// Resolve "usuario:X" ou "freela:X" → nome legível (ex: "Dr. João Silva" ou "Maria Souza (freelancer)")
async function resolverNomeResponsavel(valor) {
  if (!valor) return '';
  const [tipo, idStr] = String(valor).split(':');
  const idNum = parseInt(idStr);
  if (!idNum) return '';
  if (tipo === 'usuario') {
    const [r] = await pool.execute('SELECT nome FROM usuarios WHERE id = ?', [idNum]);
    return r.length ? r[0].nome : valor;
  }
  if (tipo === 'freela') {
    const [r] = await pool.execute('SELECT nome FROM advogados_freela WHERE id = ?', [idNum]);
    return r.length ? `${r[0].nome} (freelancer)` : valor;
  }
  return valor;
}

// POST /api/audiencias — Cria nova audiência com advogado e testemunhas
async function criar(req, res) {
  const conn = await pool.getConnection();
  try {
    const {
      processo_id, tipo_audiencia_id, data, hora, modalidade,
      vara_id, plataforma_virtual, link_virtual,
      responsavel_id: responsavelRaw,
      testemunhas = [],
      obs_auditoria
    } = req.body;

    if (!processo_id || !data || !hora) {
      return erro(res, 'Processo, data e hora são obrigatórios');
    }

    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);

    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO audiencia
         (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
          plataforma_virtual, link_virtual,
          responsavel_id, responsavel_freela_id,
          criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        processo_id, tipo_audiencia_id || null, data, hora,
        modalidade || 'presencial', vara_id || null,
        plataforma_virtual || null, link_virtual || null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id
      ]
    );

    const audienciaId = result.insertId;

    // Insere testemunhas — cada item: { pessoa_id, polo }
    // Valida que nenhuma testemunha é parte do processo (autor ou réu)
    if (testemunhas.length > 0) {
      const [autores] = await conn.execute(
        `SELECT pessoa_id FROM tblTituloProcAutor WHERE proc_id = ? AND tipo_pessoa = 'fisica'`, [processo_id]
      );
      const [reus] = await conn.execute(
        `SELECT pessoa_id FROM tblTituloProcReu WHERE proc_id = ? AND tipo_pessoa = 'fisica'`, [processo_id]
      );
      const partesIds = new Set([
        ...autores.map(a => Number(a.pessoa_id)),
        ...reus.map(r => Number(r.pessoa_id)),
      ]);

      for (const t of testemunhas) {
        if (partesIds.has(Number(t.pessoa_id))) {
          throw new Error('Uma ou mais testemunhas fazem parte do processo como autor ou réu');
        }
        await conn.execute(
          'INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, polo, criado_por) VALUES (?, ?, ?, ?)',
          [audienciaId, t.pessoa_id, t.polo || 'autor', req.usuario.id]
        );
      }
    }

    // Sempre registra quem cadastrou a audiência
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'cadastrado', null, 'Audiência cadastrada', ?)`,
      [audienciaId, req.usuario.id]
    );

    // Registra na auditoria se o usuário confirmou data retroativa ou horário incomum
    if (obs_auditoria) {
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'criacao', null, ?, ?)`,
        [audienciaId, obs_auditoria, req.usuario.id]
      );
    }

    await conn.commit();
    await auditoria.registrar(req.usuario.id, 'audiencia', 'criar', audienciaId);
    return sucesso(res, { id: audienciaId }, 'Audiência cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/audiencias/:id — Atualiza audiência com auditoria
async function atualizar(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      tipo_audiencia_id, data, hora, modalidade, vara_id,
      plataforma_virtual, link_virtual, responsavel_id: responsavelRaw,
      testemunhas = []
    } = req.body;

    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);

    // Busca estado anterior para auditoria
    const [antes] = await pool.execute('SELECT * FROM audiencia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (['cancelada','remarcada','realizada','acordo'].includes(antes[0].status)) {
      return erro(res, `Audiência com status "${antes[0].status}" não pode ser editada`);
    }

    await conn.beginTransaction();

    await conn.execute(
      `UPDATE audiencia SET
         tipo_audiencia_id = ?, data = ?, hora = ?, modalidade = ?, vara_id = ?,
         plataforma_virtual = ?, link_virtual = ?,
         responsavel_id = ?, responsavel_freela_id = ?,
         alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [
        tipo_audiencia_id || null, data, hora,
        modalidade || 'presencial', vara_id || null,
        plataforma_virtual || null, link_virtual || null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id, id
      ]
    );

    // ---- Auditoria campo a campo ----
    // Valores já legíveis são comparados e gravados diretamente.
    // Campos com IDs (tipo, vara, responsável) são resolvidos para nomes AGORA,
    // evitando queries extras toda vez que o histórico for consultado.

    // Campos simples — já são textos legíveis, grava direto
    const camposSimples = ['data', 'modalidade', 'plataforma_virtual', 'link_virtual'];
    for (const campo of camposSimples) {
      const vAntes  = String(antes[0][campo] ?? '');
      const vDepois = String(req.body[campo] ?? '');
      if (vAntes !== vDepois) {
        await conn.execute(
          `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
           VALUES (?, ?, ?, ?, ?)`,
          [id, campo, vAntes, vDepois, req.usuario.id]
        );
      }
    }

    // Hora — banco armazena HH:MM:SS, frontend envia HH:MM → normaliza antes de comparar
    const horaAntes  = String(antes[0].hora ?? '').slice(0, 5);
    const horaDepois = String(req.body.hora ?? '').slice(0, 5);
    if (horaAntes !== horaDepois) {
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'hora', ?, ?, ?)`,
        [id, horaAntes, horaDepois, req.usuario.id]
      );
    }

    // Tipo de audiência — resolve ID → nome antes de gravar
    if (String(antes[0].tipo_audiencia_id ?? '') !== String(tipo_audiencia_id ?? '')) {
      const nomeAntes  = await resolverNomeTipo(antes[0].tipo_audiencia_id);
      const nomeDepois = await resolverNomeTipo(tipo_audiencia_id);
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'tipo_audiencia_id', ?, ?, ?)`,
        [id, nomeAntes, nomeDepois, req.usuario.id]
      );
    }

    // Vara — resolve ID → "Abrev — Fórum" antes de gravar
    if (String(antes[0].vara_id ?? '') !== String(vara_id ?? '')) {
      const nomeAntes  = await resolverNomeVara(antes[0].vara_id);
      const nomeDepois = await resolverNomeVara(vara_id);
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'vara_id', ?, ?, ?)`,
        [id, nomeAntes, nomeDepois, req.usuario.id]
      );
    }

    // Responsável — reconstrói "usuario:X"/"freela:X" do banco para comparar com o que veio do frontend,
    // depois resolve ambos para nome legível antes de gravar
    const respAntesBruto = antes[0].responsavel_freela_id
      ? `freela:${antes[0].responsavel_freela_id}`
      : antes[0].responsavel_id ? `usuario:${antes[0].responsavel_id}` : '';
    const respDepoisBruto = String(responsavelRaw ?? '');
    if (respAntesBruto !== respDepoisBruto) {
      const nomeAntes  = await resolverNomeResponsavel(respAntesBruto);
      const nomeDepois = await resolverNomeResponsavel(respDepoisBruto);
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'responsavel_id', ?, ?, ?)`,
        [id, nomeAntes, nomeDepois, req.usuario.id]
      );
    }

    // Atualiza testemunhas — remove todas e reinsere com polo
    // Valida que nenhuma testemunha é parte do processo
    await conn.execute('DELETE FROM audiencia_testemunhas WHERE audiencia_id = ?', [id]);
    if (testemunhas.length > 0) {
      const processoId = antes[0].processo_id;
      const [autores] = await conn.execute(
        `SELECT pessoa_id FROM tblTituloProcAutor WHERE proc_id = ? AND tipo_pessoa = 'fisica'`, [processoId]
      );
      const [reus] = await conn.execute(
        `SELECT pessoa_id FROM tblTituloProcReu WHERE proc_id = ? AND tipo_pessoa = 'fisica'`, [processoId]
      );
      const partesIds = new Set([
        ...autores.map(a => Number(a.pessoa_id)),
        ...reus.map(r => Number(r.pessoa_id)),
      ]);

      for (const t of testemunhas) {
        if (partesIds.has(Number(t.pessoa_id))) {
          throw new Error('Uma ou mais testemunhas fazem parte do processo como autor ou réu');
        }
        await conn.execute(
          'INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, polo, criado_por) VALUES (?, ?, ?, ?)',
          [id, t.pessoa_id, t.polo || 'autor', req.usuario.id]
        );
      }
    }

    await conn.commit();
    return sucesso(res, null, 'Audiência atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/audiencias/:id/cancelar — Cancela audiência com motivo
async function cancelar(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    // Verifica permissão no banco — não confia apenas no frontend
    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'audiencias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para cancelar audiências', 403);

    if (!motivo?.trim()) return erro(res, 'Motivo do cancelamento é obrigatório');

    const [antes] = await pool.execute('SELECT status FROM audiencia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (antes[0].status === 'cancelada') return erro(res, 'Audiência já está cancelada');
    if (antes[0].status !== 'agendada' && antes[0].status !== 'adiada') {
      return erro(res, `Audiência com status "${antes[0].status}" não pode ser cancelada`);
    }

    await pool.execute(
      `UPDATE audiencia SET status = 'cancelada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [motivo.trim(), req.usuario.id, id]
    );

    await pool.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'cancelada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );

    return sucesso(res, null, 'Audiência cancelada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/:id/remarcar — Marca original como remarcada e cria nova audiência com os dados informados
async function remarcar(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { motivo, nova_data, nova_hora, nova_vara_id, nova_modalidade } = req.body;

    // Verifica permissão no banco — não confia apenas no frontend
    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'audiencias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para remarcar audiências', 403);

    if (!motivo?.trim()) return erro(res, 'Motivo da remarcação é obrigatório');
    if (!nova_data)      return erro(res, 'Nova data é obrigatória');
    if (!nova_hora)      return erro(res, 'Nova hora é obrigatória');

    const [antes] = await pool.execute('SELECT * FROM audiencia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (antes[0].status !== 'agendada' && antes[0].status !== 'adiada') {
      return erro(res, `Audiência com status "${antes[0].status}" não pode ser remarcada`);
    }

    await conn.beginTransaction();

    // Marca a audiência original como remarcada
    await conn.execute(
      `UPDATE audiencia SET status = 'remarcada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [motivo.trim(), req.usuario.id, id]
    );

    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'remarcada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );

    // Cria nova audiência aproveitando os dados da original
    const orig = antes[0];
    const [result] = await conn.execute(
      `INSERT INTO audiencia
         (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
          plataforma_virtual, link_virtual, responsavel_id, responsavel_freela_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orig.processo_id,
        orig.tipo_audiencia_id,
        nova_data,
        nova_hora,
        nova_modalidade || orig.modalidade,
        nova_vara_id !== undefined ? (nova_vara_id || null) : orig.vara_id,
        orig.plataforma_virtual,
        orig.link_virtual,
        orig.responsavel_id,
        orig.responsavel_freela_id,
        req.usuario.id
      ]
    );

    const novaId = result.insertId;

    // Registra na auditoria da nova audiência que ela veio de uma remarcação
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'criacao', null, ?, ?)`,
      [novaId, `Criada por remarcação da audiência #${id}`, req.usuario.id]
    );

    await conn.commit();
    return sucesso(res, { nova_audiencia_id: novaId }, 'Audiência remarcada e nova audiência criada com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// POST /api/audiencias/:id/ata — Registra a ata de uma audiência
async function registrarAta(req, res) {
  const { id } = req.params;
  const { resultado, houve_acordo, valor_acordo, parcelas, valor_parcela,
          data_primeiro_pagamento, nova_audiencia, observacoes,
          prazos = [], tarefas = [] } = req.body;

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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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

    const [aud] = await conn.execute('SELECT processo_id FROM audiencia WHERE id = ?', [id]);
    const processoId = aud[0]?.processo_id;

    if (houve_acordo && valor_acordo) {
      const [proc] = await conn.execute(
        'SELECT pasta_id FROM tblProc WHERE id = ?', [processoId]
      );
      if (proc[0]?.pasta_id) {
        await conn.execute(
          `INSERT INTO conta_corrente_pasta (pasta_id, data, descricao, valor, tipo, usuario_id)
           VALUES (?, CURDATE(), 'Acordo em audiência', ?, 'credito', ?)`,
          [proc[0].pasta_id, valor_acordo, req.usuario.id]
        );
      }
    }

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

    // Atualiza status da audiência conforme resultado da ata
    if (resultado) {
      await conn.execute(
        `UPDATE audiencia SET status = ?, alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
        [resultado, req.usuario.id, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', 'agendada', ?, ?)`,
        [id, resultado, req.usuario.id]
      );
    }

    await conn.commit();
    await auditoria.registrar(req.usuario.id, 'ata_audiencia', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Ata registrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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

// ============================================================
// PARTES DO PROCESSO — para filtrar testemunhas inválidas
// GET /api/audiencias/partes-processo?processo_id=X
// Retorna IDs de pessoas físicas que são autores ou réus do processo
// ============================================================
async function buscarPartesProcesso(req, res) {
  try {
    const { processo_id } = req.query;
    if (!processo_id) return erro(res, 'processo_id é obrigatório');

    const [autores] = await pool.execute(
      `SELECT pa.pessoa_id, pf.nome, 'autor' AS polo
       FROM tblTituloProcAutor pa
       JOIN pessoas_fisicas pf ON pf.id = pa.pessoa_id
       WHERE pa.proc_id = ? AND pa.tipo_pessoa = 'fisica'`,
      [processo_id]
    );
    const [reus] = await pool.execute(
      `SELECT pr.pessoa_id, pf.nome, 'reu' AS polo
       FROM tblTituloProcReu pr
       JOIN pessoas_fisicas pf ON pf.id = pr.pessoa_id
       WHERE pr.proc_id = ? AND pr.tipo_pessoa = 'fisica'`,
      [processo_id]
    );
    return sucesso(res, [...autores, ...reus]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// TESTEMUNHAS — CRUD individual (independente do modal da audiência)
// ============================================================

// POST /api/audiencias/:id/testemunhas — Adiciona testemunha à audiência
async function adicionarTestemunha(req, res) {
  try {
    const { id } = req.params;
    const { pessoa_id, polo } = req.body;

    if (!pessoa_id) return erro(res, 'pessoa_id é obrigatório');
    if (!['autor', 'reu'].includes(polo)) return erro(res, 'polo deve ser "autor" ou "reu"');

    // Verifica se a audiência existe
    const [aud] = await pool.execute('SELECT processo_id FROM audiencia WHERE id = ?', [id]);
    if (!aud.length) return naoEncontrado(res, 'Audiência não encontrada');

    // Verifica se a pessoa é parte do processo
    const [autores] = await pool.execute(
      `SELECT pessoa_id FROM tblTituloProcAutor WHERE proc_id = ? AND tipo_pessoa = 'fisica' AND pessoa_id = ?`,
      [aud[0].processo_id, pessoa_id]
    );
    const [reus] = await pool.execute(
      `SELECT pessoa_id FROM tblTituloProcReu WHERE proc_id = ? AND tipo_pessoa = 'fisica' AND pessoa_id = ?`,
      [aud[0].processo_id, pessoa_id]
    );
    if (autores.length || reus.length) {
      return erro(res, 'Esta pessoa é parte do processo e não pode ser testemunha');
    }

    // Verifica duplicata
    const [dup] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE audiencia_id = ? AND pessoa_id = ?', [id, pessoa_id]
    );
    if (dup.length) return erro(res, 'Esta pessoa já é testemunha desta audiência');

    const [result] = await pool.execute(
      'INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, polo, criado_por) VALUES (?, ?, ?, ?)',
      [id, pessoa_id, polo, req.usuario.id]
    );
    return sucesso(res, { id: result.insertId }, 'Testemunha adicionada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/:id/testemunhas/:testId — Edita polo da testemunha
async function editarTestemunha(req, res) {
  try {
    const { id, testId } = req.params;
    const { polo } = req.body;

    if (!['autor', 'reu'].includes(polo)) return erro(res, 'polo deve ser "autor" ou "reu"');

    const [rows] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE id = ? AND audiencia_id = ?', [testId, id]
    );
    if (!rows.length) return naoEncontrado(res, 'Testemunha não encontrada');

    await pool.execute('UPDATE audiencia_testemunhas SET polo = ? WHERE id = ?', [polo, testId]);
    return sucesso(res, null, 'Polo atualizado com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/audiencias/:id/testemunhas/:testId — Remove testemunha da audiência
async function excluirTestemunha(req, res) {
  try {
    const { id, testId } = req.params;

    const [rows] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE id = ? AND audiencia_id = ?', [testId, id]
    );
    if (!rows.length) return naoEncontrado(res, 'Testemunha não encontrada');

    await pool.execute('DELETE FROM audiencia_testemunhas WHERE id = ?', [testId]);
    return sucesso(res, null, 'Testemunha removida com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// TIPOS DE AUDIÊNCIA
// ============================================================

// GET /api/audiencias/tipos
async function buscarTipos(req, res) {
  try {
    const [tipos] = await pool.execute('SELECT * FROM tipo_audiencia WHERE ativo=1 ORDER BY nome');
    return sucesso(res, tipos);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/audiencias/tipos
async function criarTipo(req, res) {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Verifica duplicidade
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_audiencia WHERE nome = ? AND ativo = 1 LIMIT 1',
      [nome.trim()]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    const [r] = await pool.execute('INSERT INTO tipo_audiencia (nome) VALUES (?)', [nome.trim()]);
    return sucesso(res, { id: r.insertId }, 'Tipo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/tipos/:id
async function atualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Verifica duplicidade ignorando o próprio registro
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_audiencia WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1',
      [nome.trim(), id]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    await pool.execute('UPDATE tipo_audiencia SET nome = ? WHERE id = ?', [nome.trim(), id]);
    return sucesso(res, null, 'Tipo atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/audiencias/:id — Exclui audiência
// Regras: cancelada/remarcada nunca; com ata só admin/super; sem ata exige permissão excluir
async function excluir(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    // Verifica permissão de exclusão no banco — não confia apenas no frontend
    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'audiencias', 'excluir');
    if (!permitido) return erro(res, 'Sem permissão para excluir audiências', 403);

    // Busca audiência e verifica existência de ata (evitar alias 'at' que é palavra reservada MySQL)
    const [rows] = await pool.execute(
      'SELECT id, status FROM audiencia WHERE id = ?',
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Audiência não encontrada');

    const aud = rows[0];

    // Cancelada e remarcada: registro histórico — ninguém exclui
    if (aud.status === 'cancelada') return erro(res, 'Audiência cancelada não pode ser excluída — ela faz parte do histórico');
    if (aud.status === 'remarcada') return erro(res, 'Audiência remarcada não pode ser excluída — ela faz parte do histórico');

    // Verifica se existe ata registrada
    const [ataRows] = await pool.execute(
      'SELECT id FROM ata_audiencia WHERE audiencia_id = ? LIMIT 1',
      [id]
    );
    const temAta = ataRows.length > 0;

    // Audiência com ata: somente admin (nivel <= 1) ou superusuário (nivel === 0)
    if (temAta && req.usuario.nivel > 1) {
      return erro(res, 'Audiência com ata registrada só pode ser excluída por um administrador');
    }

    await conn.beginTransaction();

    // Remove testemunhas vinculadas
    await conn.execute('DELETE FROM audiencia_testemunhas WHERE audiencia_id = ?', [id]);

    // Remove ata (se existir e admin confirmou)
    await conn.execute('DELETE FROM ata_audiencia WHERE audiencia_id = ?', [id]);

    // Remove auditoria da audiência
    await conn.execute('DELETE FROM auditoria_audiencia WHERE audiencia_id = ?', [id]);

    // Remove a audiência
    await conn.execute('DELETE FROM audiencia WHERE id = ?', [id]);

    await conn.commit();
    return sucesso(res, null, 'Audiência excluída com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/audiencias/:id/historico — Retorna auditoria campo a campo da audiência
// Os valores já estão gravados com nomes legíveis desde a escrita — sem resolução necessária aqui
async function buscarHistorico(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT aa.id, aa.campo_alterado, aa.valor_anterior, aa.valor_novo,
              aa.alterado_em, u.nome AS usuario_nome
       FROM auditoria_audiencia aa
       LEFT JOIN usuarios u ON aa.usuario_id = u.id
       WHERE aa.audiencia_id = ?
       ORDER BY aa.alterado_em ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/audiencias/tipos/:id
async function excluirTipo(req, res) {
  try {
    const { id } = req.params;
    // Verifica se está em uso
    const [uso] = await pool.execute('SELECT id FROM audiencia WHERE tipo_audiencia_id = ? LIMIT 1', [id]);
    if (uso.length) return erro(res, 'Tipo está em uso e não pode ser excluído');
    await pool.execute('UPDATE tipo_audiencia SET ativo = 0 WHERE id = ?', [id]);
    return sucesso(res, null, 'Tipo removido');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// ADVOGADOS FREELANCER
// ============================================================

// GET /api/audiencias/freelas
async function listarFreelas(req, res) {
  try {
    const { q } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (q) { where += ' AND (nome LIKE ? OR oab LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const [rows] = await pool.execute(
      `SELECT * FROM advogados_freela ${where} ORDER BY nome LIMIT 20`, params
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/audiencias/freelas
async function criarFreela(req, res) {
  try {
    const { nome, oab, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      `INSERT INTO advogados_freela
         (nome, oab, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome.trim(), oab||null, telefone||null, cep||null, logradouro||null,
       numero||null, complemento||null, bairro||null, cidade||null, estado||null, req.usuario.id]
    );
    return sucesso(res, { id: r.insertId }, 'Freelancer cadastrado', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/freelas/:id
async function atualizarFreela(req, res) {
  try {
    const { id } = req.params;
    const { nome, oab, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    await pool.execute(
      `UPDATE advogados_freela
       SET nome=?, oab=?, telefone=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, estado=?
       WHERE id=?`,
      [nome.trim(), oab||null, telefone||null, cep||null, logradouro||null,
       numero||null, complemento||null, bairro||null, cidade||null, estado||null, id]
    );
    return sucesso(res, null, 'Freelancer atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/audiencias/freelas/:id
async function excluirFreela(req, res) {
  try {
    const { id } = req.params;
    const [uso] = await pool.execute('SELECT id FROM audiencia WHERE responsavel_freela_id = ? LIMIT 1', [id]);
    if (uso.length) return erro(res, 'Freelancer está vinculado a audiências e não pode ser excluído');
    await pool.execute('DELETE FROM advogados_freela WHERE id = ?', [id]);
    return sucesso(res, null, 'Freelancer removido');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  listarAdvogados,
  listar, buscar, criar, atualizar, excluir, cancelar, remarcar,
  registrarAta, marcarAtaImpressa,
  buscarHistorico,
  buscarPartesProcesso,
  adicionarTestemunha, editarTestemunha, excluirTestemunha,
  buscarTipos, criarTipo, atualizarTipo, excluirTipo,
  listarFreelas, criarFreela, atualizarFreela, excluirFreela,
};
