// ============================================================
// CONTROLLER DE PRAZOS
// CRUD, cálculo de vencimento, status, auditoria e controle "Fazendo"
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { calcularVencimento, calcularQuantidade } = require('../services/calendarioService');
const { criarNotificacao, notificarConclusao, emailPrazoDelegado } = require('../services/notificacaoService');
const { hojeBrasilia } = require('../utils/helpers');
const auditoria = require('../middleware/auditoria');
const agendaGoogle = require('../services/agendaGoogleService');

// ===== Integração com o Google Agenda (convite .ics) =====
// O prazo vai para o Google do DELEGADO (responsável). Se não houver delegado
// (prazo "do escritório"), não há dono pessoal → não envia. Evento de DIA INTEIRO
// (data_vencimento). Título "Prazo: <nº do processo>". Tudo "melhor esforço":
// roda em 2º plano e nunca derruba a operação (o serviço já engole erros).

// Monta os dados do evento a partir do prazo. Retorna null se não existir.
async function dadosPrazoParaGoogle(prazoId) {
  try {
    const [rows] = await pool.execute(
      `SELECT pp.delegado_para, pp.data_vencimento, pp.descricao,
              ps.nome AS subtipo_nome, pr.numProc AS num_processo
         FROM prazos_processo pp
         LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
         JOIN tblproc pr ON pp.processo_id = pr.id
        WHERE pp.id = ?`, [prazoId]
    );
    const p = rows[0];
    if (!p) return null;
    const partes = [];
    if (p.subtipo_nome) partes.push(`Tipo: ${p.subtipo_nome}`);
    if (p.descricao)    partes.push(p.descricao);
    return {
      delegado_para: p.delegado_para,
      resumo: `Prazo: ${p.num_processo || ''}`.trim(),
      descricao: partes.join('\n'),
      data: p.data_vencimento,
    };
  } catch (e) {
    console.error('[prazo->google] falha ao montar dados:', e.message);
    return null;
  }
}

// Envia (ou cancela) o evento no Google do delegado informado. Ignora quando não há
// delegado (prazo do escritório) ou quando o usuário não ativou o envio.
async function enviarPrazoParaGoogle(usuarioId, prazoId, dados, cancelar = false, sequence = 0) {
  try {
    if (!usuarioId || !dados) return;
    const [u] = await pool.execute(
      'SELECT nome, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [usuarioId]
    );
    const dono = u[0];
    if (!dono || Number(dono.google_agenda_ativo) !== 1 || !dono.google_agenda_email) return;
    await agendaGoogle.enviarConviteEvento({
      tipo: 'prazo', id: prazoId, cancelar, sequence,
      resumo: dados.resumo, descricao: dados.descricao,
      data: dados.data, diaTodo: true,
      destinatarioEmail: dono.google_agenda_email, destinatarioNome: dono.nome,
    });
  } catch (e) {
    console.error('[prazo->google] falha ao enviar:', e.message);
  }
}

// Conveniência para os casos simples (usa o delegado ATUAL do prazo). 2º plano.
function sincronizarPrazoGoogle(prazoId, { cancelar = false, sequence = 0 } = {}) {
  dadosPrazoParaGoogle(prazoId).then(dados =>
    enviarPrazoParaGoogle(dados && dados.delegado_para, prazoId, dados, cancelar, sequence)
  );
}

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
    const { processo_id, usuario_id, status, data_de, data_ate, mostrar_encerrados, numero_processo, pagina = 1, limite = 30 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    // Query chega como string ('true'/'false'); qualquer coisa != 'true' esconde os encerrados.
    const mostrarEncerrados = mostrar_encerrados === 'true' || mostrar_encerrados === true;

    if (processo_id) { where += ' AND pp.processo_id = ?'; params.push(processo_id); }

    // Filtro por TRECHO do número do processo (digitado na tela de Prazos). Só entra em ação
    // a partir de 3 dígitos. Ignora a pontuação dos dois lados (o numProc é gravado com máscara,
    // ex.: 0000000-00.0000.0.00.0000): removemos '.', '-' e espaço da coluna e comparamos só dígitos.
    // Referencia pr.numProc → a query do COUNT também faz JOIN em tblproc (abaixo).
    if (numero_processo) {
      const digitos = String(numero_processo).replace(/\D/g, '');
      if (digitos.length >= 3) {
        where += " AND REPLACE(REPLACE(REPLACE(pr.numProc, '.', ''), '-', ''), ' ', '') LIKE ?";
        params.push(`%${digitos}%`);
      }
    }

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
    } else if (!mostrarEncerrados) {
      // "Todos" com o checkbox desmarcado: esconde concluídos e cancelados (só prazos em aberto).
      // Se o usuário escolher "Concluído"/"Cancelado" no dropdown, cai no if acima e eles aparecem.
      where += " AND pp.status NOT IN ('concluido','cancelado')";
    }

    if (data_de)  { where += ' AND pp.data_vencimento >= ?'; params.push(data_de); }
    if (data_ate) { where += ' AND pp.data_vencimento <= ?'; params.push(data_ate); }

    // Filtra por usuário respeitando a permissão 'prazos.ver_todos > visualizar'.
    // podeVerTodos: admin/super (nível <= 1) OU usuário comum com a permissão explícita.
    let podeVerTodos = Number(req.usuario.nivel) <= 1;
    if (!podeVerTodos) {
      const [verTodosPerm] = await pool.execute(
        "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'prazos' AND submodulo = 'ver_todos' AND acao = 'visualizar'",
        [req.usuario.id]
      );
      podeVerTodos = Number(verTodosPerm[0]?.permitido) === 1;
    }

    if (!podeVerTodos) {
      // Sem permissão de ver todos: sempre restrito aos próprios prazos + os do escritório
      // (delegado_para NULL). Ignora qualquer usuario_id recebido — impede burlar a permissão.
      where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
      params.push(req.usuario.id);
    } else if (usuario_id) {
      // Pode ver todos e escolheu uma pessoa: os prazos dela + os do escritório (delegado_para NULL).
      where += ' AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)';
      params.push(usuario_id);
    }
    // Pode ver todos e não escolheu ninguém (usuario_id vazio = "Todos"): sem filtro por usuário.

    // Filtro por etiqueta PESSOAL do usuário logado.
    const etqSlot = parseInt(req.query.etiqueta);
    if (etqSlot >= 1 && etqSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM prazos_etiquetas pe WHERE pe.prazo_id = pp.id AND pe.usuario_id = ? AND pe.slot = ?)';
      params.push(req.usuario.id, etqSlot);
    }

    const limitInt  = parseInt(limite) || 30;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT pp.id, pp.descricao, pp.data_inicio, pp.data_vencimento,
              pp.quantidade, pp.tipo_dias, pp.delegado_para, pp.publicacao_id,
              pp.notificar_conclusao,
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
              END AS status,
              (SELECT pe.slot FROM prazos_etiquetas pe
                WHERE pe.prazo_id = pp.id AND pe.usuario_id = ?) AS etiqueta_pessoal
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
       LEFT JOIN tipo_prazo tp    ON ps.tipo_prazo_id = tp.id
       LEFT JOIN usuarios u       ON pp.delegado_para = u.id
       LEFT JOIN usuarios uc      ON pp.criado_por = uc.id
       LEFT JOIN usuarios uf      ON pp.fazendo_por = uf.id
       JOIN tblproc pr            ON pp.processo_id = pr.id
       JOIN tblpasta pa           ON pr.pasta_id = pa.id
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
      [req.usuario.id, ...params]
    );

    // O COUNT usa o MESMO `where` da listagem. Como o filtro de número referencia pr.numProc,
    // fazemos o mesmo JOIN em tblproc aqui (é 1:1 — todo prazo tem um processo válido, igual à
    // listagem que já usa JOIN tblproc), então a contagem continua batendo com a lista.
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total
         FROM prazos_processo pp
         JOIN tblproc pr ON pp.processo_id = pr.id
         ${where}`, params
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
      quantidade, tipo_dias, data_final, delegado_para, publicacao_id, notificar_conclusao
    } = req.body;

    if (!processo_id || !data_inicio) {
      return erro(res, 'Processo e data de início são obrigatórios');
    }

    // Define a data de vencimento:
    // - a data final digitada na tela é a que MANDA (é ela que vira o vencimento);
    // - se não vier data final (ex.: só a quantidade), calcula a partir de quantidade + tipo de dias.
    let data_vencimento = data_final || null;
    if (!data_vencimento && quantidade && tipo_dias) {
      data_vencimento = await calcularVencimento(data_inicio, quantidade, tipo_dias);
    }
    // Todo prazo precisa de uma data final (regra do usuário)
    if (!data_vencimento) {
      return erro(res, 'A data final é obrigatória. Informe a data final ou a quantidade de dias.');
    }

    const [result] = await pool.execute(
      `INSERT INTO prazos_processo
         (processo_id, subtipo_id, descricao, data_inicio, quantidade, tipo_dias,
          data_vencimento, delegado_para, criado_por, publicacao_id, notificar_conclusao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        processo_id, subtipo_id || null, descricao || null, data_inicio,
        quantidade || null, tipo_dias || 'uteis', data_vencimento,
        delegado_para || null, req.usuario.id, publicacao_id || null, notificar_conclusao ? 1 : 0
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

    // Novo prazo → entra na agenda do Google do delegado (se usuário com Google ativo).
    sincronizarPrazoGoogle(result.insertId, {});
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
    `SELECT pp.status, pp.fazendo_por, pp.notificar_conclusao, pp.criado_por,
            COALESCE(ps.nome, pp.descricao, 'Prazo') AS rotulo
       FROM prazos_processo pp
       LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
      WHERE pp.id = ?`, [id]
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

    // Concluído ou cancelado: limpa a etiqueta PESSOAL de quem finalizou (não deixa
    // sujeira). Só a dele; etiquetas de outros usuários neste prazo permanecem.
    await conn.execute(
      'DELETE FROM prazos_etiquetas WHERE prazo_id = ? AND usuario_id = ?',
      [id, req.usuario.id]
    );

    // Registra na auditoria com quem fez, quando e qual era o status anterior
    await conn.execute(
      `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id, observacao)
       VALUES (?, ?, ?, ?, ?)`,
      [id, antes[0].status, status, req.usuario.id,
       status === 'cancelado' ? motivo_cancelamento.trim() : (observacao || null)]
    );

    // Aviso no sino ao criador quando CONCLUÍDO (só se ele pediu ao criar e não foi ele mesmo)
    if (status === 'concluido' && antes[0].notificar_conclusao && antes[0].criado_por !== req.usuario.id) {
      await notificarConclusao({
        conn,
        usuario_id: antes[0].criado_por,
        prazo_id:   Number(id),
        mensagem:   `O prazo "${antes[0].rotulo}" foi concluído por ${req.usuario.nome}`,
      });
    }

    await conn.commit();
    // Concluído OU cancelado → sai da agenda do Google do delegado.
    sincronizarPrazoGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
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

// POST /api/prazos/tipos — Cadastra um novo TIPO de prazo (botão "…" da tela)
// Só insere (a tabela já existe); dedup pelo nome (case-insensitive).
async function criarTipo(req, res) {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome do tipo é obrigatório');

    // Mantém o texto digitado, apenas garante a 1ª letra maiúscula
    const nomeTrimmed     = nome.trim();
    const nomeNormalizado = nomeTrimmed.charAt(0).toUpperCase() + nomeTrimmed.slice(1);

    const [dup] = await pool.execute(
      'SELECT id FROM tipo_prazo WHERE LOWER(nome) = LOWER(?)', [nomeNormalizado]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrado como tipo de prazo`);

    const [result] = await pool.execute(
      'INSERT INTO tipo_prazo (nome) VALUES (?)', [nomeNormalizado]
    );
    return sucesso(res, { id: result.insertId, nome: nomeNormalizado }, 'Tipo de prazo cadastrado', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/prazos/subtipos — Cadastra um novo SUBTIPO (botão "…" da tela)
// O subtipo pertence sempre a um tipo (FK obrigatória tipo_prazo_id).
// A duplicata é conferida DENTRO do mesmo tipo (o mesmo nome pode existir em outro tipo).
async function criarSubtipo(req, res) {
  try {
    const { nome, tipo_prazo_id } = req.body;
    if (!nome?.trim())   return erro(res, 'Nome do subtipo é obrigatório');
    if (!tipo_prazo_id)  return erro(res, 'Selecione o tipo de prazo antes de cadastrar o subtipo');

    // Confere que o tipo informado existe (a FK exige um tipo_prazo_id válido)
    const [tipoRow] = await pool.execute('SELECT id FROM tipo_prazo WHERE id = ?', [tipo_prazo_id]);
    if (!tipoRow.length) return erro(res, 'Tipo de prazo informado não existe');

    const nomeTrimmed     = nome.trim();
    const nomeNormalizado = nomeTrimmed.charAt(0).toUpperCase() + nomeTrimmed.slice(1);

    const [dup] = await pool.execute(
      'SELECT id FROM prazo_subtipo WHERE tipo_prazo_id = ? AND LOWER(nome) = LOWER(?)',
      [tipo_prazo_id, nomeNormalizado]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrado neste tipo`);

    const [result] = await pool.execute(
      'INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, ?)',
      [tipo_prazo_id, nomeNormalizado]
    );
    return sucesso(res,
      { id: result.insertId, nome: nomeNormalizado, tipo_prazo_id: Number(tipo_prazo_id) },
      'Subtipo cadastrado', 201);
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
       JOIN tblproc pr ON pp.processo_id = pr.id
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

// GET /api/prazos/calcular-dias?data_inicio=YYYY-MM-DD&data_final=YYYY-MM-DD&tipo_dias=uteis|corridos
// Cálculo INVERSO: recebe a data final e devolve a quantidade de dias (respeitando feriados nos dias úteis).
// Usado quando o usuário digita a data final direto e a tela preenche o campo "Quantidade de dias".
async function calcularDias(req, res) {
  try {
    const { data_inicio, data_final, tipo_dias } = req.query;
    if (!data_inicio || !data_final || !tipo_dias) {
      return erro(res, 'Parâmetros obrigatórios: data_inicio, data_final, tipo_dias', 400);
    }
    const quantidade = await calcularQuantidade(data_inicio, data_final, tipo_dias);
    return sucesso(res, { quantidade });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/prazos/:id — Edita um prazo existente
async function editar(req, res) {
  try {
    const { id } = req.params;
    const { subtipo_id, descricao, data_inicio, quantidade, tipo_dias, data_final, delegado_para, notificar_conclusao } = req.body;

    if (!data_inicio) return erro(res, 'Data de início é obrigatória');

    const [existe] = await pool.execute('SELECT id, fazendo_por, delegado_para FROM prazos_processo WHERE id = ?', [id]);
    if (!existe.length) return naoEncontrado(res, 'Prazo não encontrado');
    if (existe[0].fazendo_por && existe[0].fazendo_por !== req.usuario.id && req.usuario.nivel > 1) {
      return erro(res, 'Este prazo está sendo feito por outro usuário. Apenas o administrador pode editá-lo.', 403);
    }

    // Mesma regra do criar: a data final digitada é a que MANDA; sem ela, calcula pela quantidade.
    let data_vencimento = data_final || null;
    if (!data_vencimento && quantidade && tipo_dias) {
      data_vencimento = await calcularVencimento(data_inicio, quantidade, tipo_dias);
    }
    if (!data_vencimento) {
      return erro(res, 'A data final é obrigatória. Informe a data final ou a quantidade de dias.');
    }

    await pool.execute(
      `UPDATE prazos_processo
         SET subtipo_id = ?, descricao = ?, data_inicio = ?, quantidade = ?,
             tipo_dias = ?, data_vencimento = ?, delegado_para = ?, notificar_conclusao = ?
       WHERE id = ?`,
      [subtipo_id || null, descricao || null, data_inicio,
       quantidade || null, tipo_dias || 'uteis', data_vencimento,
       delegado_para || null, (notificar_conclusao && delegado_para) ? 1 : 0, id]
    );

    await auditoria.registrar(req.usuario.id, 'prazos_processo', 'editar', id);
    // Reflete no Google. Se o delegado mudou, migra (cancela no antigo, cria no novo);
    // vazio/escritório = id nulo e o envio é ignorado.
    const seq = Math.floor(Date.now() / 1000);
    const donoAntigo = existe[0].delegado_para || null;
    const donoNovo   = delegado_para ? parseInt(delegado_para) : null;
    dadosPrazoParaGoogle(id).then(dados => {
      if (donoAntigo === donoNovo) {
        enviarPrazoParaGoogle(donoNovo, id, dados, false, seq);
      } else {
        enviarPrazoParaGoogle(donoAntigo, id, dados, true,  seq); // some da agenda do antigo
        enviarPrazoParaGoogle(donoNovo,   id, dados, false, seq); // entra na do novo
      }
    });
    return sucesso(res, { data_vencimento }, 'Prazo atualizado com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/prazos/:id — Exclui um prazo (tratando as tabelas-filhas em transação)
async function excluir(req, res) {
  const { id } = req.params;

  // Confere a existência e as regras de negócio ANTES de abrir a transação
  const [existe] = await pool.execute('SELECT id, status, fazendo_por FROM prazos_processo WHERE id = ?', [id]);
  if (!existe.length) return naoEncontrado(res, 'Prazo não encontrado');
  if (['concluido', 'cancelado'].includes(existe[0].status)) {
    return erro(res, 'Não é permitido excluir prazos já concluídos ou cancelados.');
  }
  if (existe[0].fazendo_por && existe[0].fazendo_por !== req.usuario.id && req.usuario.nivel > 1) {
    return erro(res, 'Este prazo está sendo feito por outro usuário. Apenas o administrador pode excluí-lo.', 403);
  }

  // Dados para o cancelamento no Google — capturados ANTES do DELETE (depois a linha some).
  const dadosGoogleExcluir = await dadosPrazoParaGoogle(id);

  // Três tabelas apontam para prazos_processo (sem ON DELETE CASCADE no banco):
  // auditoria_prazo (histórico), notificacoes (alertas) e tarefas (vínculo).
  // Um DELETE direto no prazo seria barrado pela FK quando houvesse filhas (ex.: histórico).
  // Por isso tratamos cada filha na ordem correta, tudo dentro de UMA transação (tudo ou nada).
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Tarefa tem vida própria: apenas DESVINCULA do prazo (não apaga a tarefa)
    await conn.execute('UPDATE tarefas SET prazo_id = NULL WHERE prazo_id = ?', [id]);
    // 2) Notificações daquele prazo deixam de fazer sentido — removidas
    await conn.execute('DELETE FROM notificacoes WHERE prazo_id = ?', [id]);
    // 3) Histórico do prazo é removido junto com ele
    await conn.execute('DELETE FROM auditoria_prazo WHERE prazo_id = ?', [id]);
    // 4) Por fim, o próprio prazo
    await conn.execute('DELETE FROM prazos_processo WHERE id = ?', [id]);
    // 5) Auditoria geral participa da MESMA transação (falha aqui faz rollback de tudo)
    await auditoria.registrar(req.usuario.id, 'prazos_processo', 'excluir', id, null, null, conn);

    await conn.commit();
    // Excluído → sai da agenda do Google do delegado (casa pelo mesmo UID).
    enviarPrazoParaGoogle(dadosGoogleExcluir && dadosGoogleExcluir.delegado_para, id,
      dadosGoogleExcluir, true, Math.floor(Date.now() / 1000));
    return sucesso(res, null, 'Prazo excluído com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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
    const hoje = hojeBrasilia();
    const venc = String(prazo.data_vencimento).split('T')[0];
    const statusAtual = venc < hoje ? 'atrasado' : venc === hoje ? 'pendente' : 'agendado';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE prazos_processo SET fazendo_por = ?, fazendo_desde = NOW(), status_antes_fazendo = ? WHERE id = ?',
        [req.usuario.id, statusAtual, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id) VALUES (?, ?, 'fazendo', ?)`,
        [id, statusAtual, req.usuario.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

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

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE prazos_processo SET fazendo_por = NULL, fazendo_desde = NULL, status_antes_fazendo = NULL WHERE id = ?',
        [id]
      );
      await conn.execute(
        `INSERT INTO auditoria_prazo (prazo_id, status_anterior, status_novo, usuario_id) VALUES (?, 'fazendo', ?, ?)`,
        [id, statusAntesFazendo, req.usuario.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

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

// GET /api/prazos/usuarios — Lista os usuários ativos para o filtro "Responsável".
// Protegida pela permissão prazos.ver_todos (admin passa automático no middleware).
async function listarUsuariosFiltro(req, res) {
  try {
    const [usuarios] = await pool.execute(
      'SELECT id, nome FROM usuarios WHERE ativo = 1 AND nivel > 0 ORDER BY nome' // nivel > 0: nunca lista o superusuário
    );
    return sucesso(res, usuarios);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, editar, excluir, mudarStatus, buscarTipos, criarTipo, criarSubtipo, vencemHoje, calcularDataFinal, calcularDias, marcarFazendo, liberarFazendo, liberarFazendoExpirados, buscarHistorico, listarUsuariosFiltro };
