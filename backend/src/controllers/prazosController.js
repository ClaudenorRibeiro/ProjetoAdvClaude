// ============================================================
// CONTROLLER DE PRAZOS
// CRUD, cálculo de vencimento, status, auditoria e controle "Fazendo"
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { calcularVencimento } = require('../services/calendarioService');
const { criarNotificacao, emailPrazoDelegado } = require('../services/notificacaoService');
const auditoria = require('../middleware/auditoria');

// Libera prazos com "Fazendo" expirado pelo timeout configurado — exportada para uso no cron
async function liberarFazendoExpirados() {
  try {
    const [cfg] = await pool.execute('SELECT prazo_fazendo_timeout FROM configuracoes_escritorio LIMIT 1');
    const timeout = cfg[0]?.prazo_fazendo_timeout || 60;
    const [result] = await pool.execute(
      `UPDATE prazos_processo
         SET fazendo_por = NULL, fazendo_desde = NULL, status_antes_fazendo = NULL
       WHERE fazendo_por IS NOT NULL
         AND TIMESTAMPDIFF(MINUTE, fazendo_desde, NOW()) >= ?`,
      [timeout]
    );
    if (result.affectedRows > 0) {
      console.log(`⏰ ${result.affectedRows} prazo(s) "Fazendo" expirado(s) liberado(s)`);
    }
  } catch (err) {
    console.error('Erro ao liberar prazos expirados:', err.message);
  }
}

// GET /api/prazos — Lista prazos com filtros
// Status é calculado dinamicamente pela data (concluido/cancelado são armazenados)
async function listar(req, res) {
  try {
    const { processo_id, usuario_id, status, data_de, data_ate, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (processo_id) { where += ' AND pp.processo_id = ?'; params.push(processo_id); }

    // Filtro de status calculado dinamicamente
    if (status) {
      if (status === 'concluido' || status === 'cancelado') {
        where += ' AND pp.status = ?'; params.push(status);
      } else if (status === 'agendado') {
        where += " AND pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento > CURDATE()";
      } else if (status === 'pendente') {
        where += " AND pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento = CURDATE()";
      } else if (status === 'atrasado') {
        where += " AND pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento < CURDATE()";
      } else if (status === 'fazendo') {
        where += " AND pp.status NOT IN ('concluido','cancelado') AND pp.fazendo_por IS NOT NULL";
      }
    }

    if (data_de)  { where += ' AND pp.data_vencimento >= ?'; params.push(data_de); }
    if (data_ate) { where += ' AND pp.data_vencimento <= ?'; params.push(data_ate); }

    // Filtra por usuário respeitando a permissão 'prazos.ver_todos > visualizar'
    if (usuario_id) {
      where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
      params.push(usuario_id);
    } else if (req.usuario.nivel > 1) {
      const [verTodosPerm] = await pool.execute(
        "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'prazos' AND submodulo = 'ver_todos' AND acao = 'visualizar'",
        [req.usuario.id]
      );
      if (!verTodosPerm[0]?.permitido) {
        where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
        params.push(req.usuario.id);
      }
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT pp.id, pp.descricao, pp.data_inicio, pp.data_vencimento,
              pp.quantidade, pp.tipo_dias, pp.delegado_para,
              pp.subtipo_id, tp.id AS tipo_prazo_id,
              pp.motivo_cancelamento,
              pp.criado_por, uc.nome AS criado_por_nome, pp.criado_em,
              pp.fazendo_por, pp.fazendo_desde, uf.nome AS fazendo_por_nome,
              ps.nome AS subtipo_nome, tp.nome AS tipo_prazo_nome,
              u.nome AS responsavel_nome,
              pr.numProc AS processo_numero,
              pr.NomeTituloProc AS pasta_titulo, LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
              DATEDIFF(pp.data_vencimento, CURDATE()) AS dias_restantes,
              CASE
                WHEN pp.status = 'concluido' THEN 'concluido'
                WHEN pp.status = 'cancelado' THEN 'cancelado'
                WHEN pp.data_vencimento < CURDATE() THEN 'atrasado'
                WHEN pp.data_vencimento = CURDATE() THEN 'pendente'
                ELSE 'agendado'
              END AS status
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
       LEFT JOIN tipo_prazo tp    ON ps.tipo_prazo_id = tp.id
       LEFT JOIN usuarios u       ON pp.delegado_para = u.id
       LEFT JOIN usuarios uc      ON pp.criado_por = uc.id
       LEFT JOIN usuarios uf      ON pp.fazendo_por = uf.id
       JOIN tblProc pr            ON pp.processo_id = pr.id
       JOIN tblPasta pa           ON pr.pasta_id = pa.id
       ${where}
       ORDER BY
         pp.data_vencimento ASC,
         CASE
           WHEN pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento < CURDATE()  THEN 1
           WHEN pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento = CURDATE()  THEN 2
           WHEN pp.fazendo_por IS NOT NULL                                                     THEN 3
           WHEN pp.status NOT IN ('concluido','cancelado') AND pp.data_vencimento > CURDATE()  THEN 4
           WHEN pp.status = 'concluido'                                                        THEN 5
           ELSE 6
         END ASC
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

    // Notifica o usuário delegado imediatamente (se for diferente de quem criou)
    if (delegado_para && parseInt(delegado_para) !== req.usuario.id) {
      const prazoId = result.insertId;
      const [[usuario], [escritorio], [subtipoRow]] = await Promise.all([
        pool.execute('SELECT nome, email, notif_tela, notif_email FROM usuarios WHERE id = ?', [delegado_para]),
        pool.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1'),
        pool.execute('SELECT nome FROM prazo_subtipo WHERE id = ?', [subtipo_id || 0]),
      ]);

      const subtipo_nome  = subtipoRow[0]?.nome || descricao || 'Prazo';
      const prazoParaNotif = { subtipo_nome, data_vencimento };

      // Notificação na tela
      if (usuario[0]?.notif_tela !== 0) {
        await criarNotificacao(
          delegado_para, prazoId,
          `Novo prazo atribuído a você: ${subtipo_nome} — vence em ${data_vencimento}`
        );
      }
      // E-mail imediato
      if (usuario[0]?.notif_email !== 0 && usuario[0]?.email) {
        await emailPrazoDelegado({
          para:       usuario[0].email,
          nomePara:   usuario[0].nome,
          prazo:      prazoParaNotif,
          escritorio: escritorio[0]?.nome,
        });
      }
    }

    return sucesso(res, { id: result.insertId, data_vencimento }, 'Prazo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id/status — Conclui ou cancela um prazo
// Apenas 'concluido' e 'cancelado' são aceitos — os demais são calculados pela data
async function mudarStatus(req, res) {
  const { id } = req.params;
  const { status, observacao, motivo_cancelamento } = req.body;

  if (!['concluido', 'cancelado'].includes(status)) {
    return erro(res, 'Ação inválida. Use "concluido" ou "cancelado".');
  }
  if (status === 'cancelado' && !motivo_cancelamento?.trim()) {
    return erro(res, 'Motivo do cancelamento é obrigatório.');
  }

  const [antes] = await pool.execute(
    'SELECT status, fazendo_por FROM prazos_processo WHERE id = ?', [id]
  );
  if (!antes.length) return naoEncontrado(res, 'Prazo não encontrado');
  if (['concluido', 'cancelado'].includes(antes[0].status)) {
    return erro(res, 'Prazo já finalizado — não pode ser alterado.');
  }
  // Bloqueia se outro usuário está fazendo e quem chama não é admin
  if (antes[0].fazendo_por && antes[0].fazendo_por !== req.usuario.id && req.usuario.nivel > 1) {
    return erro(res, 'Este prazo está sendo feito por outro usuário. Apenas o administrador pode alterá-lo.', 403);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (status === 'concluido') {
      await conn.execute(
        `UPDATE prazos_processo
            SET status = 'concluido', concluido_por = ?, concluido_em = NOW(),
                status_alterado_por = ?, status_alterado_em = NOW(),
                fazendo_por = NULL, fazendo_desde = NULL, status_antes_fazendo = NULL
          WHERE id = ?`,
        [req.usuario.id, req.usuario.id, id]
      );
    } else {
      await conn.execute(
        `UPDATE prazos_processo
            SET status = 'cancelado', motivo_cancelamento = ?,
                status_alterado_por = ?, status_alterado_em = NOW(),
                fazendo_por = NULL, fazendo_desde = NULL, status_antes_fazendo = NULL
          WHERE id = ?`,
        [motivo_cancelamento.trim(), req.usuario.id, id]
      );
    }

    // Registra na auditoria com quem fez, quando e qual era o status anterior
    await conn.execute(
      `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [id, antes[0].status, status, req.usuario.id,
       status === 'cancelado' ? motivo_cancelamento.trim() : (observacao || null)]
    );

    await conn.commit();
    return sucesso(res, null, `Prazo marcado como "${status}"`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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
         AND pp.status NOT IN ('concluido','cancelado')
         AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)`,
      [userId]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/prazos/calcular?data_inicio=YYYY-MM-DD&quantidade=N&tipo_dias=uteis|corridos
async function calcularDataFinal(req, res) {
  try {
    const { data_inicio, quantidade, tipo_dias } = req.query;
    if (!data_inicio || !quantidade || !tipo_dias) {
      return erro(res, 'Parâmetros obrigatórios: data_inicio, quantidade, tipo_dias', 400);
    }
    const dataFinal = await calcularVencimento(data_inicio, parseInt(quantidade), tipo_dias);
    return sucesso(res, { data_final: dataFinal });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id — Edita um prazo existente
async function editar(req, res) {
  try {
    const { id } = req.params;
    const { subtipo_id, descricao, data_inicio, quantidade, tipo_dias, delegado_para } = req.body;

    if (!data_inicio) return erro(res, 'Data de início é obrigatória');

    const [existe] = await pool.execute('SELECT id, fazendo_por FROM prazos_processo WHERE id = ?', [id]);
    if (!existe.length) return naoEncontrado(res, 'Prazo não encontrado');
    if (existe[0].fazendo_por && existe[0].fazendo_por !== req.usuario.id && req.usuario.nivel > 1) {
      return erro(res, 'Este prazo está sendo feito por outro usuário. Apenas o administrador pode editá-lo.', 403);
    }

    let data_vencimento = null;
    if (quantidade && tipo_dias) {
      data_vencimento = await calcularVencimento(data_inicio, quantidade, tipo_dias);
    }

    await pool.execute(
      `UPDATE prazos_processo
         SET subtipo_id = ?, descricao = ?, data_inicio = ?, quantidade = ?,
             tipo_dias = ?, data_vencimento = ?, delegado_para = ?
       WHERE id = ?`,
      [subtipo_id || null, descricao || null, data_inicio,
       quantidade || null, tipo_dias || 'uteis', data_vencimento,
       delegado_para || null, id]
    );

    await auditoria.registrar(req.usuario.id, 'prazos_processo', 'editar', id);
    return sucesso(res, { data_vencimento }, 'Prazo atualizado com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/prazos/:id — Exclui um prazo
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [existe] = await pool.execute('SELECT id, status, fazendo_por FROM prazos_processo WHERE id = ?', [id]);
    if (!existe.length) return naoEncontrado(res, 'Prazo não encontrado');
    if (['concluido', 'cancelado'].includes(existe[0].status)) {
      return erro(res, 'Não é permitido excluir prazos já concluídos ou cancelados.');
    }
    if (existe[0].fazendo_por && existe[0].fazendo_por !== req.usuario.id && req.usuario.nivel > 1) {
      return erro(res, 'Este prazo está sendo feito por outro usuário. Apenas o administrador pode excluí-lo.', 403);
    }
    await pool.execute('DELETE FROM prazos_processo WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'prazos_processo', 'excluir', id);
    return sucesso(res, null, 'Prazo excluído com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id/fazendo — Marca prazo como "Fazendo" pelo usuário logado
async function marcarFazendo(req, res) {
  const { id } = req.params;
  try {
    // Libera locks expirados antes de verificar disponibilidade
    await liberarFazendoExpirados();

    const [rows] = await pool.execute(
      'SELECT id, fazendo_por, status, data_vencimento FROM prazos_processo WHERE id = ?', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Prazo não encontrado');

    const prazo = rows[0];
    if (['concluido', 'cancelado'].includes(prazo.status)) {
      return erro(res, 'Prazo já finalizado — não pode ser marcado como Fazendo');
    }
    if (prazo.fazendo_por && prazo.fazendo_por !== req.usuario.id) {
      return erro(res, 'Este prazo já está sendo feito por outro usuário');
    }
    if (prazo.fazendo_por === req.usuario.id) {
      return sucesso(res, null, 'Você já está fazendo este prazo');
    }

    // Determina o status atual para restaurar caso o timeout expire
    const hoje = new Date().toISOString().split('T')[0];
    const venc = String(prazo.data_vencimento).split('T')[0];
    const statusAtual = venc < hoje ? 'atrasado' : venc === hoje ? 'pendente' : 'agendado';

    await pool.execute(
      'UPDATE prazos_processo SET fazendo_por = ?, fazendo_desde = NOW(), status_antes_fazendo = ? WHERE id = ?',
      [req.usuario.id, statusAtual, id]
    );

    await pool.execute(
      `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id) VALUES (?, ?, 'fazendo', ?)`,
      [id, statusAtual, req.usuario.id]
    );

    return sucesso(res, null, 'Prazo marcado como "Fazendo"');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id/liberar-fazendo — Libera prazo travado em "Fazendo"
// Usuário libera o próprio; admin libera qualquer um
async function liberarFazendo(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT fazendo_por, status_antes_fazendo FROM prazos_processo WHERE id = ?', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Prazo não encontrado');

    const fazendoPor        = rows[0].fazendo_por;
    const statusAntesFazendo = rows[0].status_antes_fazendo || 'aberto';
    if (!fazendoPor) return sucesso(res, null, 'Prazo não está sendo feito por ninguém');

    if (req.usuario.nivel > 1 && fazendoPor !== req.usuario.id) {
      return erro(res, 'Apenas o administrador pode liberar o prazo de outro usuário', 403);
    }

    await pool.execute(
      'UPDATE prazos_processo SET fazendo_por = NULL, fazendo_desde = NULL, status_antes_fazendo = NULL WHERE id = ?',
      [id]
    );

    await pool.execute(
      `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id) VALUES (?, 'fazendo', ?, ?)`,
      [id, statusAntesFazendo, req.usuario.id]
    );

    return sucesso(res, null, 'Prazo liberado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// GET /prazos/:id/historico — Histórico completo de um prazo
// Combina: criação (prazos_processo) + mudanças de status (auditoria_prazo)
// ============================================================
async function buscarHistorico(req, res) {
  try {
    const { id } = req.params;

    // Verifica se o prazo existe
    const [prazo] = await pool.execute(
      `SELECT pp.id, pp.criado_em, pp.criado_por,
              pp.concluido_por, pp.concluido_em,
              pp.motivo_cancelamento,
              ps.nome AS subtipo_nome, pp.descricao,
              uc.nome AS criado_por_nome
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
       LEFT JOIN usuarios uc      ON pp.criado_por  = uc.id
       WHERE pp.id = ?`,
      [id]
    );
    if (!prazo.length) return naoEncontrado(res, 'Prazo não encontrado');

    // Todos os eventos de mudança de status registrados na auditoria
    const [auditorias] = await pool.execute(
      `SELECT ap.status_anterior, ap.status_novo, ap.alterado_em,
              ap.observacao, u.nome AS usuario_nome
       FROM auditoria_prazo ap
       LEFT JOIN usuarios u ON ap.usuario_id = u.id
       WHERE ap.prazo_id = ?
       ORDER BY ap.alterado_em ASC`,
      [id]
    );

    // Monta linha do tempo ordenada cronologicamente
    const eventos = [];

    // Evento 1 — Criação
    eventos.push({
      tipo:      'criacao',
      icone:     '📋',
      descricao: 'Prazo cadastrado',
      usuario:   prazo[0].criado_por_nome || '—',
      data:      prazo[0].criado_em,
    });

    // Eventos de mudança de status (da auditoria)
    auditorias.forEach(a => {
      let icone = '🔄';
      let descricao = `Status alterado de "${labelStatus(a.status_anterior)}" para "${labelStatus(a.status_novo)}"`;

      if (a.status_novo === 'concluido') { icone = '✅'; descricao = 'Prazo concluído'; }
      if (a.status_novo === 'cancelado') { icone = '❌'; descricao = 'Prazo cancelado'; }
      if (a.status_novo === 'fazendo')   { icone = '▶️'; descricao = `Iniciado por ${a.usuario_nome}`; }
      if (a.status_anterior === 'fazendo' && a.status_novo !== 'concluido' && a.status_novo !== 'cancelado') {
        icone = '⏸️'; descricao = 'Prazo liberado (deixou de fazer)';
      }

      eventos.push({
        tipo:      'status',
        icone,
        descricao,
        usuario:   a.usuario_nome || '—',
        data:      a.alterado_em,
        observacao: a.observacao || null,
      });
    });

    // Ordena tudo por data crescente (mais antigo primeiro)
    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    return sucesso(res, {
      prazo_titulo: prazo[0].subtipo_nome || prazo[0].descricao || `Prazo #${id}`,
      eventos,
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Converte código de status para label legível (usado internamente)
function labelStatus(s) {
  const map = {
    aberto: 'Aberto', fazendo: 'Fazendo', pendente: 'Pendente',
    agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado',
  };
  return map[s] || s || '—';
}

module.exports = { listar, criar, editar, excluir, mudarStatus, buscarTipos, vencemHoje, calcularDataFinal, marcarFazendo, liberarFazendo, liberarFazendoExpirados, buscarHistorico };
