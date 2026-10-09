// ============================================================
// CONTROLLER DE TAREFAS
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { bloqueiaAgendarPassado, hojeBrasilia, pastaFormatadaSql, paginacao, escaparLike } = require('../utils/helpers');
const { texto, dataIso, inteiroPositivo } = require('../utils/camposTexto');

const PRIORIDADES_TAREFA = ['urgente', 'normal', 'baixa'];
const LIMITE_TITULO_TAREFA = 300;       // tamanho da coluna tarefas.titulo
const LIMITE_DESCRICAO_TAREFA = 2000;

// Id da rota (":id") como número; null quando não é um inteiro positivo (a tarefa "abc" simplesmente não existe).
function lerIdTarefa(req) {
  const r = inteiroPositivo(req.params.id, { rotulo: 'Tarefa' });
  return r.erro ? null : r.valor;
}

// Editar, excluir e ver o histórico: só o responsável pela tarefa, quem a criou ou o administrador.
// (Concluir/reabrir têm regra própria, mais aberta: podeAgirNaTarefa.)
function podeGerirTarefa(req, tarefa) {
  if (Number(req.usuario.nivel) <= 1) return true;
  const eu = Number(req.usuario.id);
  return Number(tarefa.criado_por) === eu || (tarefa.atribuida_para != null && Number(tarefa.atribuida_para) === eu);
}
const MSG_SO_DONO = 'Só o responsável pela tarefa, quem a criou ou o administrador pode fazer isso.';

// Lê e confere os campos do formulário (criar e editar). Devolve { dados } ou { erro, status }.
async function lerCamposTarefa(corpo) {
  const c = corpo || {};
  const titulo = texto(c.titulo, { rotulo: 'O título', max: LIMITE_TITULO_TAREFA, obrigatorio: true });
  if (titulo.erro) return { erro: titulo.erro, status: 400 };
  const descricao = texto(c.descricao, { rotulo: 'A descrição', max: LIMITE_DESCRICAO_TAREFA });
  if (descricao.erro) return { erro: descricao.erro, status: 400 };
  let prioridade = 'normal';
  if (c.prioridade !== undefined && c.prioridade !== null && c.prioridade !== '') {
    if (typeof c.prioridade !== 'string' || !PRIORIDADES_TAREFA.includes(c.prioridade)) return { erro: 'Prioridade inválida', status: 400 };
    prioridade = c.prioridade;
  }
  const data = dataIso(c.data_vencimento, { rotulo: 'Data de vencimento' });
  if (data.erro) return { erro: data.erro, status: 400 };
  const ids = {};
  for (const [chave, rotulo, tabela, extra, msg] of [
    ['processo_id', 'Processo', 'tblproc', ' AND ativo = 1', 'Processo não encontrado'],
    ['pasta_id', 'Pasta', 'tblpasta', '', 'Pasta não encontrada'],
    ['prazo_id', 'Prazo', 'prazos_processo', '', 'Prazo não encontrado'],
    ['atribuida_para', 'Responsável', 'usuarios', '', 'Responsável não encontrado'],
    ['publicacao_id', 'Publicação', null, '', ''],
  ]) {
    const r = inteiroPositivo(c[chave], { rotulo });
    if (r.erro) return { erro: r.erro, status: 400 };
    if (r.valor && tabela) {
      const [achou] = await pool.execute(`SELECT id FROM ${tabela} WHERE id = ?${extra}`, [r.valor]);
      if (!achou.length) return { erro: msg, status: 404 };
    }
    ids[chave] = r.valor;
  }
  return { dados: { titulo: titulo.valor, descricao: descricao.valor, prioridade, venc: data.valor || hojeBrasilia(), ...ids } };
}

// Mesma regra de visibilidade da listagem: admin/super (nível <= 1) OU
// permissão 'tarefas.ver_todos:visualizar'. Usada para barrar ações (concluir/
// reabrir) sobre tarefas que o usuário nem veria na lista — a listagem já filtra,
// mas as rotas de ação recebem o id direto.
async function podeVerTodasTarefas(req) {
  if (Number(req.usuario.nivel) <= 1) return true;
  const [p] = await pool.execute(
    "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'tarefas' AND submodulo = 'ver_todos' AND acao = 'visualizar'",
    [req.usuario.id]
  );
  return Number(p[0]?.permitido) === 1;
}
// Pode agir na tarefa se: é do escritório (sem atribuído), está atribuída a ele, ou ele vê todas.
async function podeAgirNaTarefa(req, atribuidaPara) {
  if (atribuidaPara == null || Number(atribuidaPara) === Number(req.usuario.id)) return true;
  return podeVerTodasTarefas(req);
}
const { notificarConclusao, emailTarefaAtribuida } = require('../services/notificacaoService');
const agendaGoogle = require('../services/agendaGoogleService');

// ===== Integração com o Google Agenda (convite .ics) =====
// A tarefa vai para o Google de quem ela foi ATRIBUÍDA (atribuida_para). Sem
// atribuição (tarefa do escritório) OU sem vencimento → não envia. Evento de DIA
// INTEIRO (data_vencimento). Título = o próprio título da tarefa. Melhor esforço:
// roda em 2º plano e nunca derruba a operação (o serviço já engole erros).

// Monta os dados do evento a partir da tarefa. Retorna null se não existir.
async function dadosTarefaParaGoogle(tarefaId) {
  try {
    const [rows] = await pool.execute(
      'SELECT atribuida_para, titulo, descricao, data_vencimento FROM tarefas WHERE id = ?', [tarefaId]
    );
    const t = rows[0];
    if (!t) return null;
    return {
      atribuida_para: t.atribuida_para,
      resumo: `Tarefa: ${t.titulo || ''}`.trim(),
      descricao: t.descricao || '',
      data: t.data_vencimento, // null = tarefa sem vencimento → o serviço não envia
    };
  } catch (e) {
    console.error('[tarefa->google] falha ao montar dados:', e.message);
    return null;
  }
}

// Envia (ou cancela) o evento no Google do usuário atribuído informado. Ignora
// quando não há atribuído (tarefa do escritório) ou o usuário não ativou o envio.
async function enviarTarefaParaGoogle(usuarioId, tarefaId, dados, cancelar = false, sequence = 0) {
  try {
    if (!usuarioId || !dados) return;
    const [u] = await pool.execute(
      'SELECT nome, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [usuarioId]
    );
    const dono = u[0];
    if (!dono || Number(dono.google_agenda_ativo) !== 1 || !dono.google_agenda_email) return;
    await agendaGoogle.enviarConviteEvento({
      tipo: 'tarefa', id: tarefaId, cancelar, sequence,
      resumo: dados.resumo, descricao: dados.descricao,
      data: dados.data, diaTodo: true,
      destinatarioEmail: dono.google_agenda_email, destinatarioNome: dono.nome,
    });
  } catch (e) {
    console.error('[tarefa->google] falha ao enviar:', e.message);
  }
}

// Conveniência para os casos simples (usa o atribuído ATUAL da tarefa). 2º plano.
function sincronizarTarefaGoogle(tarefaId, { cancelar = false, sequence = 0 } = {}) {
  dadosTarefaParaGoogle(tarefaId).then(dados =>
    enviarTarefaParaGoogle(dados && dados.atribuida_para, tarefaId, dados, cancelar, sequence)
  );
}

// ===== E-mail para o responsável (checkbox do formulário) =====
// Só roda quando quem salvou MARCOU "Enviar e-mail para <pessoa>" e escolheu um
// usuário (tarefa do "Escritório" não tem para quem mandar). Chamado SEMPRE depois
// do commit: a tarefa já está gravada e o e-mail não pode desfazer isso. Nunca
// lança — devolve { ok, erro } para a tela avisar quando o envio não sair.
async function enviarEmailDaTarefa(tarefaId, atribuidaPara, autorNome, edicao) {
  try {
    const [[tarefaRows], [usuarioRows], [escritorioRows]] = await Promise.all([
      pool.execute(
        `SELECT t.titulo, t.descricao, t.prioridade,
                DATE_FORMAT(t.data_vencimento, '%d/%m/%Y') AS venc_fmt,
                pr.numProc AS processo_numero,
                ${pastaFormatadaSql('pa')} AS pasta_fmt
           FROM tarefas t
           LEFT JOIN tblproc  pr ON t.processo_id = pr.id
           LEFT JOIN tblpasta pa ON pr.pasta_id   = pa.id
          WHERE t.id = ?`, [tarefaId]),
      pool.execute('SELECT nome, email FROM usuarios WHERE id = ?', [atribuidaPara]),
      pool.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1'),
    ]);

    const tarefa  = tarefaRows[0];
    const usuario = usuarioRows[0];
    if (!tarefa)  return { ok: false, erro: 'Tarefa não encontrada para o envio.' };
    if (!usuario) return { ok: false, erro: 'Usuário responsável não encontrado.' };
    if (!usuario.email || !usuario.email.trim()) {
      return { ok: false, erro: `${usuario.nome} não tem e-mail cadastrado.` };
    }

    return await emailTarefaAtribuida({
      para:       usuario.email.trim(),
      nomePara:   usuario.nome,
      tarefa:     { ...tarefa, autor_nome: autorNome },
      escritorio: escritorioRows[0] && escritorioRows[0].nome,
      edicao,
    });
  } catch (err) {
    console.error('[tarefa->email] falha:', err.message);
    return { ok: false, erro: err.message };
  }
}

// GET /api/tarefas — Lista tarefas com filtros
async function listar(req, res) {
  try {
    const { usuario_id, concluida, prioridade, processo_id, atrasadas, busca, numero_processo, data_de, data_ate, incluir_sem_data } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    // "Atrasadas": atalho que mostra só as tarefas pendentes (não concluídas) cujo vencimento
    // já passou. Tarefas sem data de vencimento nunca entram aqui (não há como estar atrasada).
    // Quando ativo, ignora o filtro de "concluída" (a regra abaixo já garante concluida = 0).
    const soAtrasadas = atrasadas === '1' || atrasadas === 'true' || atrasadas === true;

    // Vazio ('') significa "sem filtro / todas". Só filtra quando vem um valor real
    // ('0' pendentes, '1' concluídas). Sem o "!== ''", o MySQL leria '' como 0 e
    // mostraria só as pendentes (era o motivo de a concluída "sumir" da aba da pasta).
    if (soAtrasadas) {
      where += ' AND t.concluida = 0 AND t.data_vencimento IS NOT NULL AND t.data_vencimento < CURDATE()';
    } else if (concluida !== undefined && concluida !== '') {
      where += ' AND t.concluida = ?'; params.push(concluida);
    }
    if (prioridade)              { where += ' AND t.prioridade = ?'; params.push(prioridade); }
    // Filtro por processo (aba de Tarefas dentro do processo/pasta). SEM processo_id (tela do menu
    // lateral) mostra TODAS. Tarefas "Rotina Interna" (processo_id NULL) só aparecem no menu lateral.
    if (processo_id)             { where += ' AND t.processo_id = ?'; params.push(processo_id); }

    // Busca geral da tela de Tarefas: procura por "contém" no texto da tarefa e no vínculo
    // (processo, pasta ou Rotina Interna). Mantém numero_processo como compatibilidade com chamadas antigas.
    const termoBusca = String(busca ?? numero_processo ?? '').trim();
    if (termoBusca) {
      const likeBusca = `%${escaparLike(termoBusca)}%`;      // "%" e "_" digitados são procurados como texto
      const digitosBusca = termoBusca.replace(/\D/g, '');
      const likeDigitos = `%${digitosBusca}%`;
      where += ` AND (
        t.titulo LIKE ?
        OR t.descricao LIKE ?
        OR pr.numProc LIKE ?
        OR REPLACE(REPLACE(REPLACE(pr.numProc, '.', ''), '-', ''), ' ', '') LIKE ?
        OR ${pastaFormatadaSql('pa')} LIKE ?
        OR CAST(pa.numPasta AS CHAR) LIKE ?
        OR ${pastaFormatadaSql('pa2')} LIKE ?
        OR CAST(pa2.numPasta AS CHAR) LIKE ?
        OR ('rotina interna' LIKE CONCAT('%', LOWER(?), '%') AND t.processo_id IS NULL AND t.pasta_id IS NULL)
      )`;
      params.push(
        likeBusca, likeBusca,
        likeBusca, digitosBusca ? likeDigitos : likeBusca,
        likeBusca, likeBusca,
        likeBusca, likeBusca,
        escaparLike(termoBusca.toLowerCase())
      );
    }

    // Intervalo de vencimento (de / até).
    // incluir_sem_data='1' (usado pelos botões de período rápido "Hoje/7 dias/30 dias" da tela de Tarefas):
    // além do teto de data, também deixa passar as tarefas SEM vencimento (data_vencimento NULL), para elas
    // aparecerem junto. Os demais consumidores (Relatórios, Pasta, Agenda) não enviam este parâmetro, então
    // mantêm exatamente o filtro estrito de antes.
    const incluirSemData = incluir_sem_data === '1' || incluir_sem_data === 'true' || incluir_sem_data === true;
    if (data_de)  { where += ' AND t.data_vencimento >= ?'; params.push(data_de); }
    if (data_ate) {
      if (incluirSemData) { where += ' AND (t.data_vencimento <= ? OR t.data_vencimento IS NULL)'; params.push(data_ate); }
      else                { where += ' AND t.data_vencimento <= ?'; params.push(data_ate); }
    }

    // Filtra por usuário respeitando a permissão 'tarefas.ver_todos > visualizar'.
    // podeVerTodos: admin/super (nível <= 1) OU usuário comum com a permissão explícita.
    let podeVerTodos = Number(req.usuario.nivel) <= 1;
    if (!podeVerTodos) {
      const [verTodosPerm] = await pool.execute(
        "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'tarefas' AND submodulo = 'ver_todos' AND acao = 'visualizar'",
        [req.usuario.id]
      );
      podeVerTodos = Number(verTodosPerm[0]?.permitido) === 1;
    }

    if (!podeVerTodos) {
      // Sem permissão de ver todos: SEMPRE restrito às próprias tarefas + as do escritório
      // (atribuida_para NULL). Ignora qualquer usuario_id recebido — impede burlar a permissão
      // passando o filtro por outra pessoa direto pela URL.
      where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
      params.push(req.usuario.id);
    } else if (usuario_id) {
      // Pode ver todos e escolheu uma pessoa: as tarefas dela + as do escritório (atribuida_para NULL).
      where += ' AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)';
      params.push(usuario_id);
    }
    // Pode ver todos e não escolheu ninguém (usuario_id vazio = "Todos"): sem filtro por usuário.

    // Filtro por etiqueta PESSOAL do usuário logado.
    const etqSlot = parseInt(req.query.etiqueta);
    if (etqSlot >= 1 && etqSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM tarefas_etiquetas pe WHERE pe.tarefa_id = t.id AND pe.usuario_id = ? AND pe.slot = ?)';
      params.push(req.usuario.id, etqSlot);
    }

    const { limite: limitInt, offset: offsetInt } = paginacao(req.query, { limitePadrao: 30, limiteMax: 100 });

    const [rows] = await pool.execute(
      `SELECT t.id, t.titulo, t.descricao, t.prioridade, t.data_vencimento,
              t.concluida, t.concluida_em, t.criado_em,
              t.pasta_id, t.processo_id, t.publicacao_id,
              t.atribuida_para, t.notificar_conclusao, t.criado_por,
              u.nome  AS atribuida_para_nome,
              uc.nome AS criado_por_nome,
              -- Vínculo: pasta direta
              ${pastaFormatadaSql('pa')} AS pasta_numero_fmt,
              -- Vínculo: processo (e pasta do processo para o link)
              pr.numProc  AS processo_numero,
              pa2.id      AS pasta_do_processo_id,
              ${pastaFormatadaSql('pa2')} AS pasta_do_processo_fmt,
              DATEDIFF(t.data_vencimento, CURDATE()) AS dias_restantes,
              (SELECT pe.slot FROM tarefas_etiquetas pe
                WHERE pe.tarefa_id = t.id AND pe.usuario_id = ?) AS etiqueta_pessoal
       FROM tarefas t
       LEFT JOIN usuarios u   ON t.atribuida_para = u.id
       LEFT JOIN usuarios uc  ON t.criado_por = uc.id
       LEFT JOIN tblpasta pa  ON t.pasta_id = pa.id
       LEFT JOIN tblproc pr   ON t.processo_id = pr.id
       LEFT JOIN tblpasta pa2 ON pr.pasta_id = pa2.id
       ${where}
       ORDER BY t.concluida ASC,
                FIELD(t.prioridade, 'urgente', 'normal', 'baixa'),
                t.data_vencimento ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      [req.usuario.id, ...params]
    );

    // O COUNT usa o MESMO `where` e os mesmos vínculos da listagem, para o total não divergir.
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total
         FROM tarefas t
         LEFT JOIN tblpasta pa  ON t.pasta_id = pa.id
         LEFT JOIN tblproc pr ON t.processo_id = pr.id
         LEFT JOIN tblpasta pa2 ON pr.pasta_id = pa2.id
         ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/tarefas — Cria nova tarefa
// Transação: INSERT da tarefa + registro de auditoria (tudo ou nada)
async function criar(req, res) {
  const { atribuida_para, notificar_conclusao,
          // Checkbox "📧 Enviar e-mail para <pessoa>": NÃO é gravado em lugar nenhum,
          // é só a ordem de disparar o e-mail agora (por isso não há coluna nova).
          enviar_email } = req.body;

  const lido = await lerCamposTarefa(req.body);
  if (lido.erro) return erro(res, lido.erro, lido.status);
  const { titulo, descricao, prioridade, processo_id, pasta_id, prazo_id, publicacao_id, venc } = lido.dados;
  const responsavel = lido.dados.atribuida_para;
  // Toda tarefa tem vencimento: sem data no formulário, assume HOJE (regra do usuário).
  if (bloqueiaAgendarPassado(req.usuario, venc)) {
    return erro(res, 'Apenas o administrador pode agendar tarefa com data anterior a hoje. Escolha uma data a partir de hoje.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO tarefas
         (titulo, descricao, prioridade, processo_id, pasta_id, prazo_id,
          atribuida_para, data_vencimento, criado_por, publicacao_id, notificar_conclusao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo, descricao,
        prioridade,
        processo_id, pasta_id, prazo_id,
        responsavel, venc,
        req.usuario.id, publicacao_id, (notificar_conclusao && responsavel) ? 1 : 0
      ]
    );

    await auditoria.registrar(req.usuario.id, 'tarefas', 'criar', result.insertId, null, null, conn);

    await conn.commit();
    // Nova tarefa → entra na agenda do Google do atribuído (se usuário com Google e com vencimento).
    sincronizarTarefaGoogle(result.insertId, {});
    // E-mail ao responsável (só se marcado no formulário). Depois do commit e sem
    // derrubar nada: se falhar, a tarefa continua salva e a tela mostra o motivo.
    const email = (enviar_email && responsavel)
      ? await enviarEmailDaTarefa(result.insertId, responsavel, req.usuario.nome, false)
      : null;
    return sucesso(res, { id: result.insertId, email }, 'Tarefa criada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id/concluir — Marca tarefa como concluída
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function concluir(req, res) {
  const id = lerIdTarefa(req);
  if (!id) return naoEncontrado(res, 'Tarefa não encontrada');
  const [exists] = await pool.execute(
    'SELECT id, titulo, processo_id, criado_por, notificar_conclusao, atribuida_para FROM tarefas WHERE id = ?', [id]
  );
  if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');
  const tarefa = exists[0];

  if (!(await podeAgirNaTarefa(req, tarefa.atribuida_para))) {
    return erro(res, 'Você só pode concluir tarefas atribuídas a você ou do escritório.', 403);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // "AND concluida = 0": se outra tela já concluiu esta tarefa, nada é feito de novo (senão o andamento sairia duplicado).
    const [upd] = await conn.execute(
      'UPDATE tarefas SET concluida = 1, concluida_por = ?, concluida_em = NOW() WHERE id = ? AND COALESCE(concluida, 0) = 0',
      [req.usuario.id, id]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return erro(res, 'Esta tarefa já foi concluída. Atualize a tela.', 409);
    }
    // Limpa a etiqueta PESSOAL de quem concluiu (não deixa sujeira). Só a dele;
    // etiquetas de outros usuários nesta tarefa permanecem (cada um só vê a sua).
    await conn.execute(
      'DELETE FROM tarefas_etiquetas WHERE tarefa_id = ? AND usuario_id = ?',
      [id, req.usuario.id]
    );
    await auditoria.registrar(req.usuario.id, 'tarefas', 'concluir', id, null, null, conn);

    // Tarefa vinculada a um processo: registra a conclusão como andamento do processo
    // (mesma tabela/regras da aba "Andamentos" — fonte='manual', editável/excluível como
    // qualquer lançamento manual). Guarda o id gerado em tarefas.andamento_id para,
    // se a tarefa for reaberta depois, apagar essa linha automaticamente.
    if (tarefa.processo_id) {
      const [andResult] = await conn.execute(
        `INSERT INTO andamento_processual (processo_id, data, descricao, fonte, criado_por)
         VALUES (?, ?, ?, 'manual', ?)`,
        [tarefa.processo_id, hojeBrasilia(), `Tarefa concluída: ${tarefa.titulo}`, req.usuario.id]
      );
      await conn.execute('UPDATE tarefas SET andamento_id = ? WHERE id = ?', [andResult.insertId, id]);
      await auditoria.registrar(req.usuario.id, 'andamento_processual', 'criar', andResult.insertId, null, null, conn);
    }

    // Aviso no sino ao criador (só se ele pediu ao criar e não foi ele mesmo quem concluiu)
    if (tarefa.notificar_conclusao && tarefa.criado_por !== req.usuario.id) {
      await notificarConclusao({
        conn,
        usuario_id: tarefa.criado_por,
        tarefa_id:  Number(id),
        mensagem:   `A tarefa "${tarefa.titulo}" foi concluída por ${req.usuario.nome}`,
      });
    }

    await conn.commit();
    // Concluída → sai da agenda do Google do atribuído.
    sincronizarTarefaGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Tarefa concluída');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id/reabrir — Reabre uma tarefa concluída
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function reabrir(req, res) {
  const id = lerIdTarefa(req);
  if (!id) return naoEncontrado(res, 'Tarefa não encontrada');

  const [exists] = await pool.execute(
    'SELECT id, atribuida_para, andamento_id FROM tarefas WHERE id = ?', [id]
  );
  if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');
  if (!(await podeAgirNaTarefa(req, exists[0].atribuida_para))) {
    return erro(res, 'Você só pode reabrir tarefas atribuídas a você ou do escritório.', 403);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [upd] = await conn.execute(
      'UPDATE tarefas SET concluida = 0, concluida_por = NULL, concluida_em = NULL, andamento_id = NULL WHERE id = ? AND concluida = 1',
      [id]
    );
    if (!upd.affectedRows) {
      await conn.rollback();
      return erro(res, 'Esta tarefa já está aberta. Atualize a tela.', 409);
    }
    // Desfaz o andamento lançado automaticamente quando a tarefa foi concluída.
    if (exists[0].andamento_id) {
      await conn.execute('DELETE FROM andamento_processual WHERE id = ?', [exists[0].andamento_id]);
      await auditoria.registrar(req.usuario.id, 'andamento_processual', 'excluir', exists[0].andamento_id, null, null, conn);
    }
    await auditoria.registrar(req.usuario.id, 'tarefas', 'reabrir', id, null, null, conn);

    await conn.commit();
    // Reaberta → volta para a agenda do Google do atribuído.
    sincronizarTarefaGoogle(id, { sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Tarefa reaberta');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/tarefas/:id/historico — Histórico completo de uma tarefa
// Combina: dados da tarefa (criação, conclusão) + log de auditoria (ações)
async function buscarHistorico(req, res) {
  try {
    const id = lerIdTarefa(req);
    if (!id) return naoEncontrado(res, 'Tarefa não encontrada');

    const [rows] = await pool.execute(
      `SELECT t.id, t.titulo, t.criado_em, t.concluida_em, t.criado_por, t.atribuida_para,
              uc.nome AS criado_por_nome,
              uf.nome AS concluida_por_nome
       FROM tarefas t
       LEFT JOIN usuarios uc ON t.criado_por    = uc.id
       LEFT JOIN usuarios uf ON t.concluida_por = uf.id
       WHERE t.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Tarefa não encontrada');
    const tarefa = rows[0];
    if (!podeGerirTarefa(req, tarefa)) return erro(res, MSG_SO_DONO, 403);

    // Ações registradas na auditoria (concluir, reabrir, alterar, excluir)
    const [logs] = await pool.execute(
      `SELECT la.acao, la.criado_em, u.nome AS usuario_nome
       FROM logs_auditoria la
       LEFT JOIN usuarios u ON la.usuario_id = u.id
       WHERE la.tabela = 'tarefas' AND la.registro_id = ?
       ORDER BY la.criado_em ASC`,
      [id]
    );

    const iconeAcao = {
      criar:    { icone: '📋', desc: 'Tarefa cadastrada' },
      concluir: { icone: '✅', desc: 'Tarefa concluída' },
      reabrir:  { icone: '🔄', desc: 'Tarefa reaberta' },
      alterar:  { icone: '✏️', desc: 'Tarefa editada' },
      excluir:  { icone: '🗑️', desc: 'Tarefa excluída' },
    };

    // Evento de criação (da tabela tarefas)
    const eventos = [{
      icone:    '📋',
      descricao: 'Tarefa cadastrada',
      usuario:  tarefa.criado_por_nome || '—',
      data:     tarefa.criado_em,
    }];

    // Demais eventos da auditoria (pulamos o 'criar' pois já incluímos acima)
    logs.forEach(log => {
      if (log.acao === 'criar') return;
      const mapa = iconeAcao[log.acao] || { icone: '🔔', desc: log.acao };
      eventos.push({
        icone:    mapa.icone,
        descricao: mapa.desc,
        usuario:  log.usuario_nome || '—',
        data:     log.criado_em,
      });
    });

    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    return sucesso(res, { tarefa_titulo: tarefa.titulo, eventos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/tarefas/:id — Exclui tarefa
// Transação: DELETE da tarefa + registro de auditoria (tudo ou nada)
async function excluir(req, res) {
  const id = lerIdTarefa(req);
  if (!id) return naoEncontrado(res, 'Tarefa não encontrada');
  const [exists] = await pool.execute('SELECT id, criado_por, atribuida_para FROM tarefas WHERE id = ?', [id]);
  if (!exists.length) return naoEncontrado(res, 'Tarefa não encontrada');
  if (!podeGerirTarefa(req, exists[0])) return erro(res, MSG_SO_DONO, 403);

  // Dados para o cancelamento no Google — capturados ANTES do DELETE (depois a linha some).
  const dadosGoogleExcluir = await dadosTarefaParaGoogle(id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Se esta tarefa nasceu de um Alvará/Desistência/Tarefa registrado numa Ata de audiência,
    // desvincula o item da Ata (mantém o histórico, só remove a referência a um
    // registro que vai deixar de existir).
    await conn.execute(
      "UPDATE ata_audiencia_itens SET registro_id = NULL WHERE tipo IN ('tarefa_alvara', 'tarefa_desistencia', 'tarefa') AND registro_id = ?",
      [id]
    );

    await conn.execute('DELETE FROM tarefas WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'tarefas', 'excluir', id, null, null, conn);

    await conn.commit();
    // Excluída → sai da agenda do Google do atribuído (casa pelo mesmo UID).
    enviarTarefaParaGoogle(dadosGoogleExcluir && dadosGoogleExcluir.atribuida_para, id,
      dadosGoogleExcluir, true, Math.floor(Date.now() / 1000));
    return sucesso(res, null, 'Tarefa excluída');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/tarefas/:id — Atualiza tarefa
// Transação: UPDATE da tarefa + registro de auditoria (tudo ou nada)
async function atualizar(req, res) {
  const id = lerIdTarefa(req);
  if (!id) return naoEncontrado(res, 'Tarefa não encontrada');
  const { notificar_conclusao,
          enviar_email } = req.body;   // ver comentário em criar

  // Atribuído ANTES da edição (para migrar de agenda se ele mudar).
  const [antes] = await pool.execute('SELECT atribuida_para, criado_por FROM tarefas WHERE id = ?', [id]);
  if (!antes.length) return naoEncontrado(res, 'Tarefa não encontrada');
  if (!podeGerirTarefa(req, antes[0])) return erro(res, MSG_SO_DONO, 403);

  const lido = await lerCamposTarefa(req.body);
  if (lido.erro) return erro(res, lido.erro, lido.status);
  const { titulo, descricao, prioridade, processo_id, pasta_id, venc } = lido.dados;
  const atribuida_para = lido.dados.atribuida_para;
  // Sem data no formulário → HOJE (toda tarefa tem vencimento).
  if (bloqueiaAgendarPassado(req.usuario, venc)) {
    return erro(res, 'Apenas o administrador pode agendar tarefa com data anterior a hoje. Escolha uma data a partir de hoje.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE tarefas SET titulo=?, descricao=?, prioridade=?,
       atribuida_para=?, data_vencimento=?, pasta_id=?, processo_id=?, notificar_conclusao=?
       WHERE id = ?`,
      [titulo, descricao, prioridade,
       atribuida_para, venc,
       pasta_id, processo_id,
       (notificar_conclusao && atribuida_para) ? 1 : 0, id]
    );
    await auditoria.registrar(req.usuario.id, 'tarefas', 'alterar', id, null, null, conn);

    await conn.commit();
    // Reflete no Google. Se o atribuído mudou, migra (cancela no antigo, cria no novo);
    // sem atribuído (escritório) = id nulo e o envio é ignorado.
    const seq = Math.floor(Date.now() / 1000);
    const donoAntigo = antes[0] ? antes[0].atribuida_para : null;
    const donoNovo   = atribuida_para || null;
    dadosTarefaParaGoogle(id).then(dados => {
      if (donoAntigo === donoNovo) {
        enviarTarefaParaGoogle(donoNovo, id, dados, false, seq);
      } else {
        enviarTarefaParaGoogle(donoAntigo, id, dados, true,  seq); // some da agenda do antigo
        enviarTarefaParaGoogle(donoNovo,   id, dados, false, seq); // entra na do novo
      }
    });
    // E-mail ao responsável (só se marcado no formulário). Trocou de responsável na
    // edição? Vai para o NOVO, que é o que ficou gravado.
    const email = (enviar_email && atribuida_para)
      ? await enviarEmailDaTarefa(id, atribuida_para, req.usuario.nome, true)
      : null;
    return sucesso(res, { email }, 'Tarefa atualizada');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = { listar, criar, concluir, reabrir, atualizar, excluir, buscarHistorico };
