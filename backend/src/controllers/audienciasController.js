// ============================================================
// CONTROLLER DE AUDIÊNCIAS
// Inclui comunicado automático, registro de ata, tipos, freelas e testemunhas
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const agendaGoogle = require('../services/agendaGoogleService');
const { enviarComunicadoPericia, enviarEmailPeritoPericia } = require('../services/comunicadoService');

const MODALIDADES_AUDIENCIA = new Set(['presencial', 'virtual', 'sem_comparecimento']);

function normalizarModalidadeAudiencia(modalidade) {
  return modalidade || 'presencial';
}

function modalidadeAudienciaValida(modalidade) {
  return MODALIDADES_AUDIENCIA.has(normalizarModalidadeAudiencia(modalidade));
}

function semComparecimento(modalidade) {
  return normalizarModalidadeAudiencia(modalidade) === 'sem_comparecimento';
}

function audienciaJaPassou(data, hora) {
  const dataAudiencia = String(data || '').slice(0, 10);
  const horaAudiencia = String(hora || '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAudiencia) || !/^\d{2}:\d{2}$/.test(horaAudiencia)) return false;

  const agora = new Date();
  const dataAgora = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const horaAgora = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour12: false }).slice(0, 5);
  return `${dataAudiencia} ${horaAudiencia}` < `${dataAgora} ${horaAgora}`;
}

// ===== Integração com o Google Agenda (convite .ics) =====
// O evento vai para o Google do RESPONSÁVEL, mas SÓ quando ele for um USUÁRIO do
// sistema (freelancer não tem login/Google). Título "Audiência: <nº do processo>".
// Tudo é "melhor esforço": roda em 2º plano e nunca derruba a operação.

// Monta os dados do evento a partir da audiência (uma query com os nomes legíveis).
// Retorna null se a audiência não existir. `responsavel_id` volta junto para o chamador.
async function dadosAudienciaParaGoogle(audienciaId) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.responsavel_id, a.data, a.hora, a.modalidade, a.link_virtual, a.plataforma_virtual,
              pr.numProc AS num_processo,
              ta.nome AS tipo_nome,
              COALESCE(vr.abrev_nome, vr.nome) AS vara_nome, fr.nome AS forum_nome
         FROM audiencia a
         JOIN tblproc pr ON a.processo_id = pr.id
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         LEFT JOIN tblvara vr        ON a.vara_id            = vr.id
         LEFT JOIN tblforum fr       ON vr.forum_id          = fr.id
        WHERE a.id = ?`, [audienciaId]
    );
    const a = rows[0];
    if (!a) return null;
    const partes = [];
    if (a.tipo_nome)   partes.push(`Tipo: ${a.tipo_nome}`);
    if (a.vara_nome)   partes.push(`Vara: ${a.vara_nome}${a.forum_nome ? ` — ${a.forum_nome}` : ''}`);
    if (a.modalidade)  partes.push(`Modalidade: ${a.modalidade === 'sem_comparecimento' ? 'Sem comparecimento' : a.modalidade}`);
    if (a.modalidade === 'virtual' && (a.plataforma_virtual || a.link_virtual)) {
      partes.push(`Link: ${a.plataforma_virtual ? a.plataforma_virtual + ' — ' : ''}${a.link_virtual || ''}`);
    }
    return {
      responsavel_id: a.responsavel_id,
      resumo: `${semComparecimento(a.modalidade) ? 'Acompanhamento de ato processual' : 'Audiência'}: ${a.num_processo || ''}`.trim(),
      descricao: partes.join('\n'),
      data: a.data,
      hora: a.hora,
    };
  } catch (e) {
    console.error('[audiencia->google] falha ao montar dados:', e.message);
    return null;
  }
}

// Envia (ou cancela) o evento no Google do usuário responsável informado.
// Ignora silenciosamente quando não há usuário (freelancer/sem responsável) ou
// quando o usuário não ativou o envio. `dados` = retorno de dadosAudienciaParaGoogle.
async function enviarAudienciaParaGoogle(usuarioId, audienciaId, dados, cancelar = false, sequence = 0) {
  try {
    if (!usuarioId || !dados) return;
    const [u] = await pool.execute(
      'SELECT nome, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [usuarioId]
    );
    const dono = u[0];
    if (!dono || Number(dono.google_agenda_ativo) !== 1 || !dono.google_agenda_email) return;
    await agendaGoogle.enviarConviteEvento({
      tipo: 'audiencia', id: audienciaId, cancelar, sequence,
      resumo: dados.resumo, descricao: dados.descricao,
      data: dados.data, diaTodo: false, horaInicio: dados.hora, horaFim: null,
      destinatarioEmail: dono.google_agenda_email, destinatarioNome: dono.nome,
    });
  } catch (e) {
    console.error('[audiencia->google] falha ao enviar:', e.message);
  }
}

// Conveniência para os casos simples (usa o responsável ATUAL da audiência).
// 2º plano: não aguarda, não derruba a resposta.
function sincronizarAudienciaGoogle(audienciaId, { cancelar = false, sequence = 0 } = {}) {
  dadosAudienciaParaGoogle(audienciaId).then(dados =>
    enviarAudienciaParaGoogle(dados && dados.responsavel_id, audienciaId, dados, cancelar, sequence)
  );
}

// Integração exclusiva das perícias criadas pela ATA. A rotina normal do menu
// Perícias continua independente; falhas aqui nunca desfazem uma ata já gravada.
function sincronizarPericiaDaAtaGoogle(periciaId) {
  (async () => {
    try {
      const [rows] = await pool.execute(
        `SELECT pe.responsavel_id, pe.data, pe.hora, pe.local, pr.numProc AS processo_numero
           FROM pericia pe JOIN tblproc pr ON pr.id = pe.processo_id WHERE pe.id = ?`, [periciaId]
      );
      const pericia = rows[0];
      if (!pericia?.responsavel_id || !pericia.data) return;
      const [usuarios] = await pool.execute(
        'SELECT nome, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [pericia.responsavel_id]
      );
      const usuario = usuarios[0];
      if (!usuario || Number(usuario.google_agenda_ativo) !== 1 || !usuario.google_agenda_email) return;
      await agendaGoogle.enviarConviteEvento({
        tipo: 'pericia', id: periciaId, resumo: `Perícia: ${pericia.processo_numero || ''}`.trim(),
        descricao: pericia.local ? `Local: ${pericia.local}` : '', data: pericia.data,
        diaTodo: !pericia.hora, horaInicio: pericia.hora, horaFim: null,
        destinatarioEmail: usuario.google_agenda_email, destinatarioNome: usuario.nome,
      });
    } catch (err) { console.error('[ata->pericia google] falha ao enviar:', err.message); }
  })();
}

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
      `SELECT id, nome, oab, 'usuario' AS origem FROM usuarios
       WHERE tipo = 'advogado' AND ativo = 1 ORDER BY nome`
    );
    const [freelas] = await pool.execute(
      `SELECT id, nome, oab, 'freela' AS origem FROM advogados_freela ORDER BY nome`
    );
    return sucesso(res, [...usuarios, ...freelas]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/audiencias — Lista audiências com filtros
async function listar(req, res) {
  try {
    const { processo_id, data_de, data_ate, status, sem_ata, responsavel_id, pagina = 1, limite = 30, ordenar, direcao } = req.query;
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

    // Filtro por etiqueta PESSOAL do usuário logado.
    const etqSlot = parseInt(req.query.etiqueta);
    if (etqSlot >= 1 && etqSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM audiencias_etiquetas pe WHERE pe.audiencia_id = a.id AND pe.usuario_id = ? AND pe.slot = ?)';
      params.push(req.usuario.id, etqSlot);
    }

    const limitInt  = Math.min(parseInt(limite) || 30, 100);
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const ordenacoes = {
      processo: 'pr.numProc', pasta: 'pa.numPasta', titulo: 'pr.NomeTituloProc', tipo: 'ta.nome',
      data_hora: null, modalidade: 'a.modalidade', responsavel: 'responsavel_nome', status: 'a.status',
    };
    const ordemPadrao = "(a.status = 'agendada') DESC, a.data ASC, a.hora ASC";
    const ordem = ordenar === 'data_hora' && (direcao === 'ASC' || direcao === 'DESC')
      ? `a.data ${direcao}, a.hora ${direcao}`
      : ordenacoes[ordenar] && (direcao === 'ASC' || direcao === 'DESC')
      ? `${ordenacoes[ordenar]} ${direcao}`
      : ordemPadrao;

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
              EXISTS (SELECT 1 FROM audiencia_testemunhas att WHERE att.audiencia_id = a.id) AS tem_testemunha,
              DATEDIFF(a.data, CURDATE()) AS dias_para_audiencia,
              -- Responsável: usuário do sistema ou advogado freelancer
              COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
              -- Vara e fórum do local da audiência
              vr.nome AS vara_nome, vr.abrev_nome AS vara_abrev_nome,
              fr.nome AS vara_forum_nome,
              (SELECT pe.slot FROM audiencias_etiquetas pe
                WHERE pe.audiencia_id = a.id AND pe.usuario_id = ?) AS etiqueta_pessoal
       FROM audiencia a
       LEFT JOIN tipo_audiencia ta    ON a.tipo_audiencia_id    = ta.id
       LEFT JOIN ata_audiencia aa     ON aa.audiencia_id         = a.id
       LEFT JOIN usuarios ur          ON a.responsavel_id        = ur.id
       LEFT JOIN advogados_freela rf  ON a.responsavel_freela_id = rf.id
       LEFT JOIN tblvara vr           ON a.vara_id               = vr.id
       LEFT JOIN tblforum fr          ON vr.forum_id             = fr.id
       JOIN tblproc pr ON a.processo_id = pr.id
       JOIN tblpasta pa ON pr.pasta_id = pa.id
       ${where}
        ORDER BY ${ordem}
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      [req.usuario.id, ...params]
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
              pr.NomeTituloProc AS processo_titulo, pa.numPasta AS pasta_numero,
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
       LEFT JOIN tblvara vr          ON a.vara_id                = vr.id
       LEFT JOIN tblforum fr         ON vr.forum_id              = fr.id
        JOIN tblproc pr ON a.processo_id = pr.id
        JOIN tblpasta pa ON pr.pasta_id = pa.id
       WHERE a.id = ?`,
      [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Audiência não encontrada');

    const [ata] = await pool.execute(
      'SELECT * FROM ata_audiencia WHERE audiencia_id = ?', [id]
    );

    // Busca testemunhas da audiência com polo (autor/réu)
    const [testemunhas] = await pool.execute(
      `SELECT at.id, at.pessoa_id, at.parte_pessoa_id, at.polo, pf.nome, pf.cpf, parte.nome AS parte_nome,
              (SELECT t.numero FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.principal = 1 LIMIT 1) AS telefone_principal
       FROM audiencia_testemunhas at
       JOIN pessoas_fisicas pf ON at.pessoa_id = pf.id
       LEFT JOIN pessoas_fisicas parte ON parte.id = at.parte_pessoa_id
       WHERE at.audiencia_id = ?
       ORDER BY at.polo ASC, pf.nome ASC`,
      [id]
    );

    const responsaveis = await tabelaResponsaveisDisponivel(pool)
      ? (await pool.execute(
          `SELECT ar.responsavel_id, ar.responsavel_freela_id,
                  COALESCE(u.nome, CONCAT(f.nome, ' (freelancer)')) AS nome
           FROM audiencia_responsaveis ar
           LEFT JOIN usuarios u ON u.id = ar.responsavel_id
           LEFT JOIN advogados_freela f ON f.id = ar.responsavel_freela_id
           WHERE ar.audiencia_id = ? ORDER BY ar.id`,
          [id]
        ))[0]
      : (rows[0].responsavel_id || rows[0].responsavel_freela_id
          ? [{ responsavel_id: rows[0].responsavel_id, responsavel_freela_id: rows[0].responsavel_freela_id, nome: rows[0].responsavel_nome }]
          : []);
    return sucesso(res, { ...rows[0], ata: ata[0] || null, testemunhas, responsaveis });
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

// A atualização que permite vários responsáveis é aplicada manualmente via SQL.
// Enquanto ela não existir em uma instância, as rotinas continuam operando com o
// responsável antigo, sem derrubar detalhes, edição ou remarcação.
async function tabelaResponsaveisDisponivel(executor) {
  const [rows] = await executor.execute("SHOW TABLES LIKE 'audiencia_responsaveis'");
  return rows.length > 0;
}

function normalizarResponsaveis(responsaveis, responsavelLegado) {
  const valores = Array.isArray(responsaveis) ? responsaveis : (responsavelLegado ? [responsavelLegado] : []);
  return [...new Set(valores.filter(v => /^(usuario|freela):\d+$/.test(String(v))))];
}

async function validarResponsaveis(executor, valores) {
  for (const valor of valores) {
    const [tipo, id] = String(valor).split(':');
    const [rows] = await executor.execute(
      tipo === 'usuario'
        ? "SELECT id FROM usuarios WHERE id = ? AND tipo = 'advogado' AND ativo = 1"
        : 'SELECT id FROM advogados_freela WHERE id = ?',
      [id]
    );
    if (!rows.length) return false;
  }
  return true;
}

async function gravarResponsaveis(executor, audienciaId, valores, usuarioId) {
  await executor.execute('DELETE FROM audiencia_responsaveis WHERE audiencia_id = ?', [audienciaId]);
  for (const valor of valores) {
    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(valor);
    await executor.execute(
      `INSERT INTO audiencia_responsaveis (audiencia_id, responsavel_id, responsavel_freela_id, criado_por)
       VALUES (?, ?, ?, ?)`,
      [audienciaId, responsavel_id, responsavel_freela_id, usuarioId]
    );
  }
}

// Uma audiência ocupa um único horário ativo dentro do processo. Registros históricos
// (cancelada, remarcada, realizada etc.) não impedem um novo agendamento.
async function localizarAudienciaAtivaNoHorario(executor, processoId, data, hora, ignorarId = null) {
  let sql = `SELECT a.id, pr.numProc AS processo_numero
               FROM audiencia a
               JOIN tblproc pr ON pr.id = a.processo_id
              WHERE a.processo_id = ? AND a.data = ? AND a.hora = ?
                AND a.status IN ('agendada', 'adiada')`;
  const params = [processoId, data, hora];
  if (ignorarId) {
    sql += ' AND a.id <> ?';
    params.push(ignorarId);
  }
  sql += ' LIMIT 1';
  const [rows] = await executor.execute(sql, params);
  return rows[0] || null;
}

async function tipoAudienciaAtivo(executor, id) {
  const tipoId = Number(id);
  if (!Number.isInteger(tipoId) || tipoId <= 0) return false;
  const [rows] = await executor.execute(
    'SELECT id FROM tipo_audiencia WHERE id = ? AND ativo = 1 LIMIT 1',
    [tipoId]
  );
  return rows.length > 0;
}

function mensagemHorarioOcupado(duplicada, data, hora) {
  const dataBr = String(data || '').split('-').reverse().join('/');
  return `Já existe uma audiência ativa para o processo ${duplicada.processo_numero || ''} em ${dataBr} às ${String(hora || '').slice(0, 5)}.`;
}

function erroDeHorarioDuplicado(err) {
  return err?.code === 'ER_DUP_ENTRY' && String(err?.message || '').includes('uq_audiencia_horario_ativo');
}

function erroValidacaoTestemunha(mensagem) {
  const err = new Error(mensagem);
  err.codigoValidacaoTestemunha = true;
  return err;
}

// A identidade da testemunha e da parte é sempre conferida pelo CPF. O vínculo
// específico impede a inversão testemunha/parte em processos cujo réu tenha o
// mesmo CNPJ, sem inferir dados em registros antigos (parte_pessoa_id nulo).
async function validarVinculoTestemunha(executor, processoId, pessoaId, partePessoaId, ignorarAudienciaId = null) {
  if (!pessoaId || !partePessoaId) throw erroValidacaoTestemunha('Informe a pessoa para quem esta testemunha prestará depoimento');
  if (Number(pessoaId) === Number(partePessoaId)) throw erroValidacaoTestemunha('A testemunha não pode prestar depoimento para si mesma');
  const [pessoas] = await executor.execute(
    'SELECT id, nome, cpf FROM pessoas_fisicas WHERE id IN (?, ?)', [pessoaId, partePessoaId]
  );
  const testemunha = pessoas.find(p => Number(p.id) === Number(pessoaId));
  const parte = pessoas.find(p => Number(p.id) === Number(partePessoaId));
  if (!testemunha || !parte) throw erroValidacaoTestemunha('Testemunha ou parte não encontrada');
  if (!testemunha.cpf || !parte.cpf) throw erroValidacaoTestemunha('A testemunha e a pessoa para quem ela depõe precisam ter CPF cadastrado');

  const [partes] = await executor.execute(
    `SELECT pessoa_id, 'autor' AS polo FROM tbltituloprocautor WHERE proc_id=? AND tipo_pessoa='fisica'
     UNION ALL
     SELECT pessoa_id, 'reu' AS polo FROM tbltituloprocreu WHERE proc_id=? AND tipo_pessoa='fisica'`,
    [processoId, processoId]
  );
  if (partes.some(p => Number(p.pessoa_id) === Number(pessoaId))) {
    throw erroValidacaoTestemunha('Esta pessoa é parte do processo e não pode ser testemunha');
  }
  const parteAtual = partes.find(p => Number(p.pessoa_id) === Number(partePessoaId));
  if (!parteAtual) throw erroValidacaoTestemunha('Selecione uma pessoa física que seja parte deste processo');

  const [cnpjs] = await executor.execute(
    `SELECT DISTINCT pj.cnpj FROM tbltituloprocreu tr
       JOIN pessoas_juridicas pj ON pj.id=tr.pessoa_id
      WHERE tr.proc_id=? AND tr.tipo_pessoa='juridica' AND pj.cnpj IS NOT NULL AND pj.cnpj<>''`, [processoId]
  );
  if (!cnpjs.length) return { polo: parteAtual.polo };
  const marcas = cnpjs.map(() => '?').join(',');
  let sql = `SELECT pr.numProc, pfw.nome AS testemunha_anterior, pfp.nome AS parte_anterior
               FROM audiencia_testemunhas at
               JOIN audiencia a ON a.id=at.audiencia_id
               JOIN tblproc pr ON pr.id=a.processo_id
               JOIN tbltituloprocreu tr ON tr.proc_id=a.processo_id AND tr.tipo_pessoa='juridica'
               JOIN pessoas_juridicas pj ON pj.id=tr.pessoa_id
               JOIN pessoas_fisicas pfw ON pfw.id=at.pessoa_id
               JOIN pessoas_fisicas pfp ON pfp.id=at.parte_pessoa_id
              WHERE at.pessoa_id=? AND at.parte_pessoa_id=? AND pj.cnpj IN (${marcas})`;
  const params = [partePessoaId, pessoaId, ...cnpjs.map(r => r.cnpj)];
  if (ignorarAudienciaId) { sql += ' AND at.audiencia_id<>?'; params.push(ignorarAudienciaId); }
  sql += ' LIMIT 1';
  const [conflitos] = await executor.execute(sql, params);
  if (conflitos.length) {
    const c = conflitos[0];
    throw erroValidacaoTestemunha(`Impedimento: ${c.testemunha_anterior} já foi testemunha de ${c.parte_anterior} no processo ${c.numProc}, que possui réu com o mesmo CNPJ deste processo.`);
  }
  return { polo: parteAtual.polo };
}

async function inserirTestemunha(executor, audienciaId, processoId, dados, usuarioId, ignorarAudienciaId = null) {
  const vinculo = await validarVinculoTestemunha(executor, processoId, dados.pessoa_id, dados.parte_pessoa_id, ignorarAudienciaId);
  await executor.execute(
    'INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, parte_pessoa_id, polo, criado_por) VALUES (?, ?, ?, ?, ?)',
    [audienciaId, dados.pessoa_id, dados.parte_pessoa_id, vinculo.polo, usuarioId]
  );
  return vinculo;
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
     FROM tblvara v LEFT JOIN tblforum f ON v.forum_id = f.id WHERE v.id = ?`, [id]
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
      vara_id, plataforma_virtual, link_virtual, observacoes,
       responsavel_id: responsavelRaw, responsaveis,
      testemunhas = [],
      obs_auditoria,
      publicacao_id,
    } = req.body;

    if (!processo_id || !tipo_audiencia_id || !data || !hora) {
      return erro(res, 'Processo, tipo de audiência, data e hora são obrigatórios');
    }
    const modalidadeNormalizada = normalizarModalidadeAudiencia(modalidade);
    if (!modalidadeAudienciaValida(modalidadeNormalizada)) {
      return erro(res, 'Selecione uma modalidade de audiência válida');
    }
    if (semComparecimento(modalidadeNormalizada) && testemunhas.length > 0) {
      return erro(res, 'Eventos sem comparecimento não podem ter testemunhas vinculadas');
    }
    if (!(await tipoAudienciaAtivo(conn, tipo_audiencia_id))) {
      return erro(res, 'Selecione um tipo de audiência válido e ativo');
    }
    const duplicada = await localizarAudienciaAtivaNoHorario(conn, processo_id, data, hora);
    if (duplicada) return erro(res, mensagemHorarioOcupado(duplicada, data, hora), 409);

    const responsaveisNormalizados = normalizarResponsaveis(responsaveis, responsavelRaw);
    if (!(await validarResponsaveis(conn, responsaveisNormalizados))) {
      return erro(res, 'Selecione apenas advogados ativos cadastrados ou freelancers cadastrados');
    }
    const suportaMultiplos = await tabelaResponsaveisDisponivel(conn);
    if (!suportaMultiplos && responsaveisNormalizados.length > 1) {
      return erro(res, 'Para selecionar mais de um responsável, execute primeiro o script SQL de atualização.');
    }
    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsaveisNormalizados[0]);

    await conn.beginTransaction();

    // publicacao_id: vínculo de origem, opcional (audiência da pasta do processo não tem;
    // audiência criada a partir de uma SUGESTÃO de publicação tem — auditoria 02/09, item 6).
    const [result] = await conn.execute(
      `INSERT INTO audiencia
         (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
          plataforma_virtual, link_virtual, observacoes,
          responsavel_id, responsavel_freela_id,
          criado_por, publicacao_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        processo_id, tipo_audiencia_id, data, hora,
        modalidadeNormalizada, semComparecimento(modalidadeNormalizada) ? null : vara_id || null,
        modalidadeNormalizada === 'virtual' ? plataforma_virtual || null : null,
        modalidadeNormalizada === 'virtual' ? link_virtual || null : null,
        (observacoes && observacoes.trim()) ? observacoes.trim() : null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id, publicacao_id || null
      ]
    );

    const audienciaId = result.insertId;
    if (suportaMultiplos) await gravarResponsaveis(conn, audienciaId, responsaveisNormalizados, req.usuario.id);

    // Insere testemunhas com a parte específica; a validação recíproca é centralizada.
    if (testemunhas.length > 0) {
      for (const t of testemunhas) {
        await inserirTestemunha(conn, audienciaId, processo_id, t, req.usuario.id);
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

    // Auditoria na MESMA transação (tudo ou nada): antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'audiencia', 'criar', audienciaId, null, null, conn);
    await conn.commit();
    // Nova audiência (agendada) → entra na agenda do Google do responsável (se usuário).
    sincronizarAudienciaGoogle(audienciaId, {});
    return sucesso(res, { id: audienciaId }, 'Audiência cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoTestemunha) return erro(res, err.message, 422);
    if (erroDeHorarioDuplicado(err)) {
      return erro(res, 'Já existe uma audiência ativa neste processo, na mesma data e horário.', 409);
    }
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
       plataforma_virtual, link_virtual, observacoes, responsavel_id: responsavelRaw, responsaveis,
      testemunhas = []
    } = req.body;

    const responsaveisNormalizados = normalizarResponsaveis(responsaveis, responsavelRaw);
    if (!(await validarResponsaveis(conn, responsaveisNormalizados))) {
      return erro(res, 'Selecione apenas advogados ativos cadastrados ou freelancers cadastrados');
    }
    const suportaMultiplos = await tabelaResponsaveisDisponivel(conn);
    if (!suportaMultiplos && responsaveisNormalizados.length > 1) {
      return erro(res, 'Para selecionar mais de um responsável, execute primeiro o script SQL de atualização.');
    }
    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsaveisNormalizados[0]);

    if (!tipo_audiencia_id || !data || !hora) {
      return erro(res, 'Tipo de audiência, data e hora são obrigatórios');
    }
    const modalidadeNormalizada = normalizarModalidadeAudiencia(modalidade);
    if (!modalidadeAudienciaValida(modalidadeNormalizada)) {
      return erro(res, 'Selecione uma modalidade de audiência válida');
    }
    if (semComparecimento(modalidadeNormalizada) && testemunhas.length > 0) {
      return erro(res, 'Eventos sem comparecimento não podem ter testemunhas vinculadas');
    }
    if (!(await tipoAudienciaAtivo(conn, tipo_audiencia_id))) {
      return erro(res, 'Selecione um tipo de audiência válido e ativo');
    }

    // Busca estado anterior para auditoria
    const [antes] = await pool.execute('SELECT * FROM audiencia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (['cancelada','remarcada','realizada','acordo'].includes(antes[0].status)) {
      return erro(res, `Audiência com status "${antes[0].status}" não pode ser editada`);
    }
    if (semComparecimento(modalidadeNormalizada)) {
      const [testemunhasExistentes] = await conn.execute(
        'SELECT id FROM audiencia_testemunhas WHERE audiencia_id = ? LIMIT 1', [id]
      );
      if (testemunhasExistentes.length) {
        return erro(res, 'Não é possível alterar esta audiência para sem comparecimento porque ela possui testemunhas vinculadas. Remova as testemunhas antes de alterar a modalidade.');
      }
    }

    const duplicada = await localizarAudienciaAtivaNoHorario(
      conn, antes[0].processo_id, data, hora, id
    );
    if (duplicada) return erro(res, mensagemHorarioOcupado(duplicada, data, hora), 409);

    const responsaveisAntes = suportaMultiplos
      ? (await conn.execute(
          `SELECT responsavel_id, responsavel_freela_id FROM audiencia_responsaveis
           WHERE audiencia_id = ? ORDER BY id`, [id]
        ))[0]
      : (antes[0].responsavel_id || antes[0].responsavel_freela_id
          ? [{ responsavel_id: antes[0].responsavel_id, responsavel_freela_id: antes[0].responsavel_freela_id }]
          : []);

    await conn.beginTransaction();

    await conn.execute(
      `UPDATE audiencia SET
         tipo_audiencia_id = ?, data = ?, hora = ?, modalidade = ?, vara_id = ?,
         plataforma_virtual = ?, link_virtual = ?, observacoes = ?,
         responsavel_id = ?, responsavel_freela_id = ?,
         alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [
        tipo_audiencia_id, data, hora,
        modalidadeNormalizada, semComparecimento(modalidadeNormalizada) ? null : vara_id || null,
        modalidadeNormalizada === 'virtual' ? plataforma_virtual || null : null,
        modalidadeNormalizada === 'virtual' ? link_virtual || null : null,
        (observacoes && observacoes.trim()) ? observacoes.trim() : null,
        responsavel_id, responsavel_freela_id,
        req.usuario.id, id
      ]
    );
    if (suportaMultiplos) await gravarResponsaveis(conn, id, responsaveisNormalizados, req.usuario.id);

    // ---- Auditoria campo a campo ----
    // Valores já legíveis são comparados e gravados diretamente.
    // Campos com IDs (tipo, vara, responsável) são resolvidos para nomes AGORA,
    // evitando queries extras toda vez que o histórico for consultado.

    // Campos simples — já são textos legíveis, grava direto
    const camposSimples = ['data', 'modalidade', 'plataforma_virtual', 'link_virtual', 'observacoes'];
    for (const campo of camposSimples) {
      const vAntes  = String(antes[0][campo] ?? '');
      const vDepois = String(campo === 'modalidade' ? modalidadeNormalizada : req.body[campo] ?? '');
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
    const respAntesBrutos = responsaveisAntes.map(r => r.responsavel_id ? `usuario:${r.responsavel_id}` : `freela:${r.responsavel_freela_id}`);
    if (respAntesBrutos.join('|') !== responsaveisNormalizados.join('|')) {
      const nomeAntes  = (await Promise.all(respAntesBrutos.map(resolverNomeResponsavel))).filter(Boolean).join(', ');
      const nomeDepois = (await Promise.all(responsaveisNormalizados.map(resolverNomeResponsavel))).filter(Boolean).join(', ');
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'responsavel_id', ?, ?, ?)`,
        [id, nomeAntes, nomeDepois, req.usuario.id]
      );
    }

    // Registros antigos sem parte específica são preservados sem qualquer inferência.
    await conn.execute('DELETE FROM audiencia_testemunhas WHERE audiencia_id = ?', [id]);
    if (testemunhas.length > 0) {
      for (const t of testemunhas) {
        if (t.parte_pessoa_id) await inserirTestemunha(conn, id, antes[0].processo_id, t, req.usuario.id, id);
        else await conn.execute('INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, parte_pessoa_id, polo, criado_por) VALUES (?, ?, NULL, ?, ?)',
          [id, t.pessoa_id, t.polo || 'autor', req.usuario.id]);
      }
    }

    await conn.commit();
    // Reflete no Google. Se o responsável (usuário) mudou, migra: cancela no antigo e
    // cria no novo. Freelancer/sem responsável = ids nulos e o envio é ignorado.
    const seq = Math.floor(Date.now() / 1000);
    const oldResp = antes[0].responsavel_id;
    const newResp = responsavel_id;
    dadosAudienciaParaGoogle(id).then(dados => {
      if (oldResp === newResp) {
        enviarAudienciaParaGoogle(newResp, id, dados, false, seq);
      } else {
        enviarAudienciaParaGoogle(oldResp, id, dados, true,  seq); // some da agenda do antigo
        enviarAudienciaParaGoogle(newResp, id, dados, false, seq); // entra na do novo
      }
    });
    return sucesso(res, null, 'Audiência atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoTestemunha) return erro(res, err.message, 422);
    if (erroDeHorarioDuplicado(err)) {
      return erro(res, 'Já existe uma audiência ativa neste processo, na mesma data e horário.', 409);
    }
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/audiencias/:id/cancelar — Cancela audiência com motivo
async function cancelar(req, res) {
  try {
    const { id } = req.params;
    const { motivo, processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id, plataforma_virtual, link_virtual, observacoes, responsavel_id: responsavelRaw } = req.body;

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

    // Transação: mudar o status E registrar na auditoria são um bloco só —
    // sem isso, uma falha no INSERT deixava a audiência cancelada sem o histórico.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE audiencia SET status = 'cancelada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
         WHERE id = ?`,
        [motivo.trim(), req.usuario.id, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', ?, 'cancelada', ?)`,
        [id, antes[0].status, req.usuario.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Cancelada → sai da agenda do Google do responsável. Depois do commit, best-effort.
    sincronizarAudienciaGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Audiência cancelada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/:id/remarcar — Cria a nova audiência e marca a anterior
// como remarcada na mesma transação.
async function remarcar(req, res) {
  const conn = await pool.getConnection();
  let transacaoAberta = false;
  try {
    const { id } = req.params;
    const {
      motivo, processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
      plataforma_virtual, link_virtual, observacoes, responsavel_id: responsavelRaw,
      responsaveis, testemunhas = [], obs_auditoria,
    } = req.body;

    // Verifica permissão no banco — não confia apenas no frontend
    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'audiencias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para remarcar audiências', 403);

    if (!motivo?.trim()) return erro(res, 'Motivo da remarcação é obrigatório');
    if (!processo_id || !tipo_audiencia_id || !data || !hora) return erro(res, 'Processo, tipo de audiência, data e hora são obrigatórios');
    const modalidadeNormalizada = normalizarModalidadeAudiencia(modalidade);
    if (!modalidadeAudienciaValida(modalidadeNormalizada)) return erro(res, 'Selecione uma modalidade de audiência válida');
    if (semComparecimento(modalidadeNormalizada) && testemunhas.length > 0) {
      return erro(res, 'Eventos sem comparecimento não podem ter testemunhas vinculadas');
    }
    if (!(await tipoAudienciaAtivo(conn, tipo_audiencia_id))) return erro(res, 'Selecione um tipo de audiência válido e ativo');
    const responsaveisNormalizados = normalizarResponsaveis(responsaveis, responsavelRaw);
    if (!(await validarResponsaveis(conn, responsaveisNormalizados))) {
      return erro(res, 'Selecione apenas advogados ativos cadastrados ou freelancers cadastrados');
    }
    const suportaMultiplos = await tabelaResponsaveisDisponivel(conn);
    if (!suportaMultiplos && responsaveisNormalizados.length > 1) {
      return erro(res, 'Para selecionar mais de um responsável, execute primeiro o script SQL de atualização.');
    }

    const [antes] = await conn.execute('SELECT * FROM audiencia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (antes[0].status !== 'agendada' && antes[0].status !== 'adiada') {
      return erro(res, `Audiência com status "${antes[0].status}" não pode ser remarcada`);
    }

    const duplicada = await localizarAudienciaAtivaNoHorario(conn, processo_id, data, hora, id);
    if (duplicada) return erro(res, mensagemHorarioOcupado(duplicada, data, hora), 409);
    const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsaveisNormalizados[0]);

    await conn.beginTransaction();
    transacaoAberta = true;

    const [nova] = await conn.execute(
      `INSERT INTO audiencia
         (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
          plataforma_virtual, link_virtual, observacoes, responsavel_id,
          responsavel_freela_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [processo_id, tipo_audiencia_id, data, hora, modalidadeNormalizada, semComparecimento(modalidadeNormalizada) ? null : vara_id || null,
       modalidadeNormalizada === 'virtual' ? plataforma_virtual || null : null, modalidadeNormalizada === 'virtual' ? link_virtual || null : null, (observacoes || '').trim() || null,
       responsavel_id, responsavel_freela_id, req.usuario.id]
    );
    const novaAudienciaId = nova.insertId;
    if (suportaMultiplos) await gravarResponsaveis(conn, novaAudienciaId, responsaveisNormalizados, req.usuario.id);

    for (const testemunha of testemunhas) await inserirTestemunha(conn, novaAudienciaId, processo_id, testemunha, req.usuario.id);

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
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'motivo_status', ?, ?, ?)`,
      [id, antes[0].motivo_status || '', motivo.trim(), req.usuario.id]
    );
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'cadastrado', null, 'Audiência criada por remarcação', ?)`,
      [novaAudienciaId, req.usuario.id]
    );
    if (obs_auditoria) {
      await conn.execute(
        `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'criacao', null, ?, ?)`,
        [novaAudienciaId, obs_auditoria, req.usuario.id]
      );
    }
    await auditoria.registrar(req.usuario.id, 'audiencia', 'criar', novaAudienciaId, null, null, conn);

    await conn.commit();
    transacaoAberta = false;
    sincronizarAudienciaGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    sincronizarAudienciaGoogle(novaAudienciaId, {});
    return sucesso(res, { id: novaAudienciaId }, 'Audiência remarcada com sucesso');
  } catch (err) {
    if (transacaoAberta) await conn.rollback();
    if (err.codigoValidacaoTestemunha) return erro(res, err.message, 422);
    if (erroDeHorarioDuplicado(err)) {
      return erro(res, 'Já existe uma audiência ativa neste processo, na mesma data e horário.', 409);
    }
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

function erroDaAta(mensagem, status = 400) {
  const erroValidacao = new Error(mensagem);
  erroValidacao.erroDaAta = true;
  erroValidacao.status = status;
  return erroValidacao;
}

// Cria a audiência que nasceu da ATA usando a conexão transacional já aberta.
// O processo vem exclusivamente da audiência original: o cliente não pode trocá-lo.
async function criarAudienciaDaAta(conn, dados, processoId, usuarioId) {
  const {
    tipo_audiencia_id, data, hora, modalidade, vara_id,
    plataforma_virtual, link_virtual, observacoes,
    responsavel_id: responsavelRaw, responsaveis, testemunhas = [], obs_auditoria,
  } = dados || {};

  if (!tipo_audiencia_id || !data || !hora) {
    throw erroDaAta('Dados da nova audiência incompletos. Informe tipo, data e horário.');
  }
  const modalidadeNormalizada = normalizarModalidadeAudiencia(modalidade);
  if (!modalidadeAudienciaValida(modalidadeNormalizada)) {
    throw erroDaAta('Selecione uma modalidade de audiência válida para a nova audiência.');
  }
  if (semComparecimento(modalidadeNormalizada) && testemunhas.length > 0) {
    throw erroDaAta('Eventos sem comparecimento não podem ter testemunhas vinculadas.');
  }
  if (!(await tipoAudienciaAtivo(conn, tipo_audiencia_id))) {
    throw erroDaAta('Selecione um tipo de audiência válido e ativo para a nova audiência.');
  }
  const duplicada = await localizarAudienciaAtivaNoHorario(conn, processoId, data, hora);
  if (duplicada) throw erroDaAta(mensagemHorarioOcupado(duplicada, data, hora), 409);

  const responsaveisNormalizados = normalizarResponsaveis(responsaveis, responsavelRaw);
  if (!(await validarResponsaveis(conn, responsaveisNormalizados))) {
    throw erroDaAta('Selecione apenas advogados ativos cadastrados ou freelancers cadastrados.');
  }
  const suportaMultiplos = await tabelaResponsaveisDisponivel(conn);
  if (!suportaMultiplos && responsaveisNormalizados.length > 1) {
    throw erroDaAta('Para selecionar mais de um responsável, execute primeiro o script SQL de atualização.');
  }
  const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsaveisNormalizados[0]);
  const [result] = await conn.execute(
    `INSERT INTO audiencia
       (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id,
        plataforma_virtual, link_virtual, observacoes, responsavel_id,
        responsavel_freela_id, criado_por, publicacao_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)`,
    [processoId, tipo_audiencia_id, data, hora, modalidadeNormalizada, semComparecimento(modalidadeNormalizada) ? null : vara_id || null,
      modalidadeNormalizada === 'virtual' ? plataforma_virtual || null : null, modalidadeNormalizada === 'virtual' ? link_virtual || null : null,
      (observacoes && observacoes.trim()) ? observacoes.trim() : null,
      responsavel_id, responsavel_freela_id, usuarioId]
  );
  const audienciaId = result.insertId;
  if (suportaMultiplos) await gravarResponsaveis(conn, audienciaId, responsaveisNormalizados, usuarioId);

  if (testemunhas.length > 0) {
    for (const t of testemunhas) {
      try { await inserirTestemunha(conn, audienciaId, processoId, t, usuarioId); }
      catch (err) { throw erroDaAta(err.message); }
    }
  }
  await conn.execute(
    `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, 'cadastrado', null, 'Audiência cadastrada a partir de ata', ?)`, [audienciaId, usuarioId]
  );
  if (obs_auditoria) {
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'criacao', null, ?, ?)`, [audienciaId, obs_auditoria, usuarioId]
    );
  }
  await auditoria.registrar(usuarioId, 'audiencia', 'criar', audienciaId, null, null, conn);
  return audienciaId;
}

async function criarPericiaDaAta(conn, dados, processoId, usuarioId) {
  const aguardandoData = dados.status === 'aguardando_data' || !dados.data;
  if (!dados.tipo_pericia_id) throw erroDaAta('Informe o tipo de cada perícia da ata.');
  if (!aguardandoData && !dados.data) throw erroDaAta('Informe a data da perícia ou marque que ela está aguardando data.');
  const locaisReus = Array.isArray(dados.locais_reus) ? dados.locais_reus : [];
  const temLocalManual = [dados.local, dados.cep, dados.logradouro, dados.numero, dados.bairro, dados.cidade, dados.estado]
    .some(valor => valor && String(valor).trim());
  if (!aguardandoData && !temLocalManual && locaisReus.length === 0) {
    throw erroDaAta('Informe pelo menos um local para a perícia que já possui data.');
  }
  const [result] = await conn.execute(
    `INSERT INTO pericia
      (processo_id, tipo_pericia_id, data, hora, local, cep, logradouro, numero, complemento, bairro, cidade, estado,
       perito_tipo, perito_id, assistente_tecnico_id, responsavel_id, responsavel_freela_id, status, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      processoId, dados.tipo_pericia_id, aguardandoData ? null : dados.data, aguardandoData ? null : (dados.hora || null),
      aguardandoData ? null : (dados.local || null), aguardandoData ? null : (dados.cep || null),
      aguardandoData ? null : (dados.logradouro || null), aguardandoData ? null : (dados.numero || null),
      aguardandoData ? null : (dados.complemento || null), aguardandoData ? null : (dados.bairro || null),
      aguardandoData ? null : (dados.cidade || null), aguardandoData ? null : (dados.estado || null),
      dados.perito_id ? 'fisica' : null, dados.perito_id || null, dados.assistente_tecnico_id || null,
      dados.responsavel_id || null, dados.responsavel_freela_id || null,
      aguardandoData ? 'aguardando_data' : 'agendada', usuarioId,
    ]
  );
  for (const local of locaisReus) {
    if (local?.tipo_pessoa && local?.pessoa_id) {
      await conn.execute('INSERT INTO pericia_local_reu (pericia_id, tipo_pessoa, pessoa_id) VALUES (?, ?, ?)',
        [result.insertId, local.tipo_pessoa, local.pessoa_id]);
    }
  }
  await conn.execute(
    `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, 'cadastrado', NULL, ?, ?)`,
    [result.insertId, aguardandoData ? 'Perícia cadastrada aguardando data pela ata' : 'Perícia cadastrada pela ata', usuarioId]
  );
  await auditoria.registrar(usuarioId, 'pericia', 'criar', result.insertId, null, null, conn);
  return { id: result.insertId, agendada: !aguardandoData, enviarEmailPerito: !!dados.enviar_email_perito, modeloEmailPeritoId: dados.modelo_email_perito_id || null };
}

// POST /api/audiencias/:id/ata — Registra a ata de uma audiência
async function registrarAta(req, res) {
  const { id } = req.params;
  const { houve_acordo, valor_acordo, parcelas, valor_parcela,
          data_primeiro_pagamento, nova_audiencia, observacoes, resultado_texto,
          teve_prazo, teve_pericia, teve_alvara, teve_desistencia, teve_retorno_autos,
          advogado_acompanhante, nova_audiencia_dados,
          prazos = [], pericias = [], tarefas = [],
            motivo_desistencia, comentario_retorno_autos, testemunhas = [], teve_testemunha } = req.body;

  // A ATA só pode ser registrada depois do horário agendado. Esta checagem no
  // servidor impede o registro antecipado mesmo por uma chamada direta à API.
  let audiencia;
  try {
    const [audiencias] = await pool.execute('SELECT data, hora, modalidade FROM audiencia WHERE id = ?', [id]);
    if (!audiencias.length) return naoEncontrado(res, 'Audiência não encontrada');
    audiencia = audiencias[0];
    if (!audienciaJaPassou(audiencia.data, audiencia.hora)) {
      return erro(res, 'A ata só pode ser registrada após a data e o horário da audiência.');
    }
  } catch (err) {
    return erroInterno(res, err);
  }

  // A ATA precisa registrar ao menos um fato da audiência. A validação também
  // fica no servidor para impedir que uma chamada fora da tela gere uma ATA vazia.
  // Testemunhas complementam a ata, mas sozinhas não caracterizam um resultado.
  // Por isso não entram na regra do item mínimo obrigatório.
  const ehSemComparecimento = semComparecimento(audiencia.modalidade);
  const resultadoTexto = String(resultado_texto || '').trim();
  const temItemSelecionado = [teve_prazo, teve_pericia, houve_acordo, nova_audiencia,
    teve_alvara, teve_desistencia, teve_retorno_autos]
    .some(valor => valor === true || Number(valor) === 1);
  if (ehSemComparecimento && !resultadoTexto) {
    return erro(res, 'Descreva o que aconteceu no ato processual antes de registrar o resultado.');
  }
  if (!ehSemComparecimento && !temItemSelecionado) {
    return erro(res, 'Selecione ao menos um item que ocorreu na audiência antes de registrar a ata.');
  }
  if (teve_desistencia && !String(motivo_desistencia || '').trim()) {
    return erro(res, 'Informe o motivo da desistência da ação.');
  }
  if (teve_testemunha && !Array.isArray(testemunhas)) return erro(res, 'Informe as testemunhas da ata corretamente.');
  if (teve_testemunha && testemunhas.length === 0) return erro(res, 'Cadastre ao menos uma testemunha ou desmarque essa opção.');
  if (comentario_retorno_autos != null && !String(comentario_retorno_autos).trim()) {
    return erro(res, 'Informe o comentário sobre o retorno aos autos ou escolha não registrá-lo.');
  }

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

  // A ATA exige uma escolha explícita. "ninguem" é válido quando a parte compareceu sozinha.
  if (!advogado_acompanhante) {
    return erro(res, ehSemComparecimento
      ? 'Informe o responsável pelo acompanhamento (ou selecione "Não informado").'
      : 'Informe o advogado que acompanhou a audiência (ou selecione "Ninguém").');
  }

  // Advogado acompanhante: "usuario:X" | "freela:X" | "ninguem" | vazio (não informado).
  let advogado_id = null, advogado_freela_id = null, sem_advogado = 0;
  if (advogado_acompanhante === 'ninguem') {
    sem_advogado = 1;
  } else if (advogado_acompanhante) {
    const r = parsarResponsavel(advogado_acompanhante);
    advogado_id = r.responsavel_id;
    advogado_freela_id = r.responsavel_freela_id;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // "Registrar Ata" pressupõe que a audiência ACONTECEU → status sempre Realizada.
    // (Cancelar/Remarcar são ações à parte; "Adiada" e "Acordo" foram aposentados como status da
    // audiência — o acordo, quando há, é registrado no Financeiro pelo modal próprio. O flag
    // houve_acordo fica guardado na ata só como registro de que aquela audiência teve acordo.)
    const statusFinal = 'realizada';

    const [result] = await conn.execute(
      `INSERT INTO ata_audiencia
         (audiencia_id, resultado, houve_acordo, valor_acordo, parcelas,
          valor_parcela, data_primeiro_pagamento, nova_audiencia, observacoes,
          teve_prazo, teve_pericia, teve_alvara, teve_desistencia, teve_retorno_autos,
          advogado_id, advogado_freela_id, sem_advogado, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, resultadoTexto || null,
        houve_acordo ? 1 : 0,
        valor_acordo || null, parcelas || null, valor_parcela || null,
        data_primeiro_pagamento || null, nova_audiencia ? 1 : 0,
        observacoes || null,
        teve_prazo ? 1 : 0, teve_pericia ? 1 : 0, teve_alvara ? 1 : 0,
        teve_desistencia ? 1 : 0, teve_retorno_autos ? 1 : 0,
        advogado_id, advogado_freela_id, sem_advogado,
        req.usuario.id
      ]
    );

    // Registro próprio dos efeitos desta ATA. Ele guarda o vínculo e uma descrição
    // legível sem alterar as rotinas compartilhadas de prazo, perícia ou tarefa.
    const registrarItemAta = async (tipo, registroId, titulo, descricao = null, dataReferencia = null) => {
      await conn.execute(
        `INSERT INTO ata_audiencia_itens
           (ata_audiencia_id, tipo, registro_id, titulo, descricao, data_referencia)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [result.insertId, tipo, registroId || null, titulo, descricao || null, dataReferencia || null]
      );
    };

    const [aud] = await conn.execute('SELECT * FROM audiencia WHERE id = ?', [id]);
    if (!aud.length) throw erroDaAta('Audiência não encontrada.', 404);
    const orig = aud[0] || {};
    const processoId = orig.processo_id;
    const [processo] = await conn.execute('SELECT pasta_id FROM tblproc WHERE id = ?', [processoId]);
    if (!processo.length) throw erroDaAta('Processo da audiência não encontrado.', 404);
    const pastaId = processo[0].pasta_id || null;

    for (const testemunha of testemunhas) {
      try {
        await inserirTestemunha(conn, id, processoId, testemunha, req.usuario.id, id);
        const [pessoas] = await conn.execute('SELECT nome FROM pessoas_fisicas WHERE id IN (?, ?)', [testemunha.pessoa_id, testemunha.parte_pessoa_id]);
        const nomeTestemunha = pessoas.find(p => Number(p.id) === Number(testemunha.pessoa_id))?.nome || 'Testemunha';
        const nomeParte = pessoas.find(p => Number(p.id) === Number(testemunha.parte_pessoa_id))?.nome || 'Parte';
        await registrarItemAta('testemunha', null, `${nomeTestemunha} — testemunha de ${nomeParte}`);
      } catch (err) { throw erroDaAta(err.message); }
    }

    // (O acordo, quando há, é criado pelo modal completo do Financeiro — parcelas/honorário/parceria.
    //  Por isso NÃO lançamos mais nada na conta corrente aqui, para não duplicar o Financeiro.)

    for (const p of prazos) {
      const dataFinalInformada = p.data_final || p.data_vencimento;
      if (!p.data_inicio || !p.subtipo_id || (!p.quantidade && !dataFinalInformada)) {
        throw erroDaAta('Cada prazo da ata precisa de data inicial, tipo, subtipo e data final ou quantidade de dias.');
      }
      const { calcularVencimento } = require('../services/calendarioService');
      const vencimento = p.quantidade
        ? await calcularVencimento(p.data_inicio, p.quantidade, p.tipo_dias || 'uteis')
        : dataFinalInformada;
      const [prazoResult] = await conn.execute(
        `INSERT INTO prazos_processo (processo_id, subtipo_id, descricao, data_inicio,
          quantidade, tipo_dias, data_vencimento, delegado_para, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [processoId, p.subtipo_id, p.descricao || null, p.data_inicio,
         p.quantidade || null, p.tipo_dias || 'uteis', vencimento,
         p.delegado_para || null, req.usuario.id]
      );
      await auditoria.registrar(req.usuario.id, 'prazos_processo', 'criar', prazoResult.insertId, null, null, conn);
      await registrarItemAta('prazo', prazoResult.insertId, p.descricao || 'Prazo', null, vencimento);
    }

    // A nova audiência é só um rascunho no navegador até este momento. Ao salvar a ata,
    // ela nasce no mesmo commit e sempre fica vinculada ao processo da audiência original.
    let novaAudienciaId = null;
    if (nova_audiencia && !nova_audiencia_dados) {
      throw erroDaAta('Cadastre os dados da nova audiência antes de registrar a ata.');
    }
    if (nova_audiencia_dados) {
      novaAudienciaId = await criarAudienciaDaAta(conn, nova_audiencia_dados, processoId, req.usuario.id);
      await registrarItemAta('nova_audiencia', novaAudienciaId, 'Nova audiência', null, nova_audiencia_dados.data || null);
    }

    const periciasCriadas = [];
    for (const pericia of pericias) {
      const periciaCriada = await criarPericiaDaAta(conn, pericia, processoId, req.usuario.id);
      periciasCriadas.push(periciaCriada);
      await registrarItemAta('pericia', periciaCriada.id, pericia.tipo_pericia_nome || 'Perícia', pericia.perito_nome || null, pericia.data || null);
    }

    if (tarefas.length && !(await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'tarefas', 'cadastrar'))) {
      throw erroDaAta('Você não possui permissão para cadastrar tarefas. Remova a tarefa da ata ou solicite essa permissão.');
    }
    for (const t of tarefas) {
      if (!t?.titulo?.trim()) throw erroDaAta('Informe o título de cada tarefa da ata.');
      if (!t.data_vencimento) throw erroDaAta('Informe o vencimento de cada tarefa da ata.');
      const [tarefaResult] = await conn.execute(
        `INSERT INTO tarefas
           (titulo, descricao, prioridade, processo_id, pasta_id, prazo_id,
            atribuida_para, data_vencimento, criado_por, publicacao_id, notificar_conclusao)
         VALUES (?, ?, ?, ?, ?, null, ?, ?, ?, null, ?)`,
        [t.titulo.trim(), t.descricao || null, t.prioridade || 'normal', processoId, pastaId,
          t.atribuida_para || null, t.data_vencimento, req.usuario.id,
          t.notificar_conclusao && t.atribuida_para ? 1 : 0]
      );
      await auditoria.registrar(req.usuario.id, 'tarefas', 'criar', tarefaResult.insertId, null, null, conn);
      await registrarItemAta(t.origem_ata === 'desistencia' ? 'tarefa_desistencia' : 'tarefa_alvara',
        tarefaResult.insertId, t.titulo.trim(), t.descricao || null, t.data_vencimento);
    }

    if (houve_acordo) {
      await registrarItemAta('acordo', null, 'Acordo registrado no Financeiro');
    }
    if (teve_desistencia) {
      await registrarItemAta('desistencia', null, 'Desistência da ação', String(motivo_desistencia).trim());
    }
    if (teve_retorno_autos) {
      await registrarItemAta('retorno_autos', null, 'Retorno aos autos',
        comentario_retorno_autos != null ? String(comentario_retorno_autos).trim() : null);
    }

    // Atualiza o status da audiência (a ata sempre conclui a audiência: Realizada ou Acordo).
    await conn.execute(
      `UPDATE audiencia SET status = ?, alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [statusFinal, req.usuario.id, id]
    );
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, ?, ?)`,
      [id, orig.status || 'agendada', statusFinal, req.usuario.id]
    );

    // Auditoria na MESMA transação (tudo ou nada): antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'ata_audiencia', 'criar', result.insertId, null, null, conn);
    await conn.commit();
    if (novaAudienciaId) sincronizarAudienciaGoogle(novaAudienciaId, {});
    // Comunicação externa é feita somente após o commit: nenhuma falha de SMTP pode deixar a ATA parcialmente salva.
    for (const pericia of periciasCriadas) {
      if (pericia.enviarEmailPerito && pericia.modeloEmailPeritoId) {
        enviarEmailPeritoPericia(pericia.id, pericia.modeloEmailPeritoId, req.usuario.id)
          .catch(err => console.error('Falha ao enviar e-mail ao perito da ATA:', err.message));
      }
      if (pericia.agendada) {
        sincronizarPericiaDaAtaGoogle(pericia.id);
        enviarComunicadoPericia(pericia.id, 'agendada', req.usuario.id)
          .catch(err => console.error('Falha ao enviar comunicado ao cliente da perícia:', err.message));
      }
    }
    return sucesso(res, { id: result.insertId }, 'Ata registrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    if (err.erroDaAta) return erro(res, err.message, err.status || 400);
    if (err.code === 'ER_NO_SUCH_TABLE' && String(err.message || '').includes('ata_audiencia_itens')) {
      return erro(res, 'A atualização de detalhes da ATA ainda não foi aplicada no banco. Execute o script 2026-09-13_itens_detalhes_ata.sql antes de registrar uma nova ATA.', 409);
    }
    if (err.code === 'CALENDARIO_INSUFICIENTE' || err.code === 'CALENDARIO_QUANTIDADE_INVALIDA') {
      return erro(res, err.message, 422);
    }
    if (erroDeHorarioDuplicado(err)) return erro(res, 'Já existe uma audiência ativa neste processo, na mesma data e horário.', 409);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/audiencias/:id/ata-impressa — Marca audiência como "ata já impressa"
async function marcarAtaImpressa(req, res) {
  try {
    const { id } = req.params;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE audiencia SET ata_impressa = 1 WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
       FROM tbltituloprocautor pa
       JOIN pessoas_fisicas pf ON pf.id = pa.pessoa_id
       WHERE pa.proc_id = ? AND pa.tipo_pessoa = 'fisica'`,
      [processo_id]
    );
    const [reus] = await pool.execute(
      `SELECT pr.pessoa_id, pf.nome, 'reu' AS polo
       FROM tbltituloprocreu pr
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
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { pessoa_id, parte_pessoa_id } = req.body;

    if (!pessoa_id) return erro(res, 'pessoa_id é obrigatório');
    if (!parte_pessoa_id) return erro(res, 'Informe a pessoa para quem a testemunha prestará depoimento');

    // Verifica se a audiência existe
    const [aud] = await pool.execute('SELECT processo_id, modalidade FROM audiencia WHERE id = ?', [id]);
    if (!aud.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (semComparecimento(aud[0].modalidade)) {
      return erro(res, 'Eventos sem comparecimento não permitem cadastrar testemunhas');
    }

    // Verifica duplicata
    const [dup] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE audiencia_id = ? AND pessoa_id = ?', [id, pessoa_id]
    );
    if (dup.length) return erro(res, 'Esta pessoa já é testemunha desta audiência');

    await conn.beginTransaction();
    await inserirTestemunha(conn, id, aud[0].processo_id, { pessoa_id, parte_pessoa_id }, req.usuario.id, id);
    const [result] = await conn.execute('SELECT LAST_INSERT_ID() AS id');
    await conn.commit();
    return sucesso(res, { id: result[0].id }, 'Testemunha adicionada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoTestemunha) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/audiencias/:id/testemunhas/:testId — Edita polo da testemunha
async function editarTestemunha(req, res) {
  try {
    const { id, testId } = req.params;
    const { parte_pessoa_id } = req.body;

    const [rows] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE id = ? AND audiencia_id = ?', [testId, id]
    );
    if (!rows.length) return naoEncontrado(res, 'Testemunha não encontrada');

    if (!parte_pessoa_id) return erro(res, 'Informe a pessoa para quem a testemunha prestará depoimento');
    const [dados] = await pool.execute(`SELECT at.pessoa_id, a.processo_id, a.modalidade FROM audiencia_testemunhas at JOIN audiencia a ON a.id=at.audiencia_id WHERE at.id=?`, [testId]);
    if (semComparecimento(dados[0].modalidade)) return erro(res, 'Eventos sem comparecimento não permitem editar testemunhas');
    const vinculo = await validarVinculoTestemunha(pool, dados[0].processo_id, dados[0].pessoa_id, parte_pessoa_id, id);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE audiencia_testemunhas SET parte_pessoa_id = ?, polo = ? WHERE id = ?', [parte_pessoa_id, vinculo.polo, testId]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Vínculo da testemunha atualizado com sucesso');
  } catch (err) {
    if (err.codigoValidacaoTestemunha) return erro(res, err.message, 422);
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

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM audiencia_testemunhas WHERE id = ?', [testId]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
    const conn = await pool.getConnection();
    let r;
    try {
      await conn.beginTransaction();
      [r] = await conn.execute('INSERT INTO tipo_audiencia (nome) VALUES (?)', [nome.trim()]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE tipo_audiencia SET nome = ? WHERE id = ?', [nome.trim(), id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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

    // Dados para o cancelamento no Google — capturados ANTES do DELETE (depois a linha some).
    const dadosGoogleExcluir = await dadosAudienciaParaGoogle(id);

    // Amarrações que importam: ata registrada e testemunhas vinculadas.
    // (A auditoria_audiencia é o histórico da PRÓPRIA audiência — sai junto, não conta como amarração.)
    const [ataRows] = await pool.execute(
      'SELECT id FROM ata_audiencia WHERE audiencia_id = ? LIMIT 1', [id]
    );
    const temAta = ataRows.length > 0;
    const [testRows] = await pool.execute(
      'SELECT id FROM audiencia_testemunhas WHERE audiencia_id = ? LIMIT 1', [id]
    );
    const temTestemunha = testRows.length > 0;

    // Cancelada e remarcada fazem parte do histórico. Agora o ADMIN pode excluí-las,
    // PORÉM só quando NÃO houver nenhuma amarração (nem ata, nem testemunha).
    if (aud.status === 'cancelada' || aud.status === 'remarcada') {
      if (req.usuario.nivel > 1) {
        return erro(res, 'Audiência cancelada ou remarcada só pode ser excluída por um administrador');
      }
      if (temAta || temTestemunha) {
        return erro(res, 'Esta audiência tem ata ou testemunha vinculada e não pode ser excluída (ela faz parte do histórico).');
      }
    } else {
      // Demais status (regra de hoje): audiência com ata só pode ser excluída por admin.
      if (temAta && req.usuario.nivel > 1) {
        return erro(res, 'Audiência com ata registrada só pode ser excluída por um administrador');
      }
    }

    await conn.beginTransaction();

    // Se esta audiência nasceu como "nova audiência" a partir da Ata de OUTRA
    // audiência, desvincula o item daquela Ata (mantém o histórico, só remove a
    // referência a um registro que vai deixar de existir). A ata_audiencia_itens da
    // PRÓPRIA audiência (se ela tiver ata) já sai junto no DELETE de ata_audiencia
    // abaixo, por ON DELETE CASCADE.
    await conn.execute(
      "UPDATE ata_audiencia_itens SET registro_id = NULL WHERE tipo = 'nova_audiencia' AND registro_id = ?",
      [id]
    );

    // Remove testemunhas vinculadas
    await conn.execute('DELETE FROM audiencia_testemunhas WHERE audiencia_id = ?', [id]);

    // Remove ata (se existir e admin confirmou)
    await conn.execute('DELETE FROM ata_audiencia WHERE audiencia_id = ?', [id]);

    // Remove auditoria da audiência
    await conn.execute('DELETE FROM auditoria_audiencia WHERE audiencia_id = ?', [id]);

    // Remove a audiência
    await conn.execute('DELETE FROM audiencia WHERE id = ?', [id]);

    await conn.commit();
    // Excluída → sai da agenda do Google do responsável (casa pelo mesmo UID).
    enviarAudienciaParaGoogle(dadosGoogleExcluir && dadosGoogleExcluir.responsavel_id, id,
      dadosGoogleExcluir, true, Math.floor(Date.now() / 1000));
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

// GET /api/audiencias/:id/detalhes-ata — consulta operacional da ATA, separada do histórico técnico.
async function buscarDetalhesAta(req, res) {
  try {
    const { id } = req.params;
    const [atas] = await pool.execute(
      `SELECT aa.id, aa.resultado, aa.observacoes, aa.criado_em,
              aa.houve_acordo, aa.nova_audiencia, aa.teve_prazo, aa.teve_pericia,
              aa.teve_alvara, aa.teve_desistencia, aa.teve_retorno_autos,
              u.nome AS criado_por_nome,
              COALESCE(ua.nome, af.nome, CASE WHEN aa.sem_advogado = 1 THEN 'Ninguém (a parte compareceu sozinha)' END) AS advogado_nome,
              a.data AS audiencia_data, a.hora AS audiencia_hora,
              pr.numProc AS processo_numero, pa.numPasta AS pasta_numero
         FROM ata_audiencia aa
         JOIN audiencia a ON a.id = aa.audiencia_id
         JOIN tblproc pr ON pr.id = a.processo_id
         JOIN tblpasta pa ON pa.id = pr.pasta_id
         LEFT JOIN usuarios u ON u.id = aa.criado_por
         LEFT JOIN usuarios ua ON ua.id = aa.advogado_id
         LEFT JOIN advogados_freela af ON af.id = aa.advogado_freela_id
        WHERE aa.audiencia_id = ?`,
      [id]
    );
    if (!atas.length) return naoEncontrado(res, 'Esta audiência ainda não possui ata registrada.');
    const [itens] = await pool.execute(
      `SELECT id, tipo, registro_id, titulo, descricao, data_referencia, criado_em
         FROM ata_audiencia_itens
        WHERE ata_audiencia_id = ?
        ORDER BY id`, [atas[0].id]
    );
    return sucesso(res, { ata: atas[0], itens });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' && String(err.message || '').includes('ata_audiencia_itens')) {
      return erro(res, 'A atualização de detalhes da ATA ainda não foi aplicada no banco. Execute o script 2026-09-13_itens_detalhes_ata.sql.', 409);
    }
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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE tipo_audiencia SET ativo = 0 WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
    const { nome, oab, profissao_id, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;
    if (!nome?.trim())  return erro(res, 'Nome é obrigatório');
    if (!email?.trim()) return erro(res, 'E-mail é obrigatório');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return erro(res, 'Informe um e-mail válido');
    const conn = await pool.getConnection();
    let r;
    try {
      await conn.beginTransaction();
      [r] = await conn.execute(
        `INSERT INTO advogados_freela
           (nome, oab, profissao_id, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome.trim(), oab||null, profissao_id || null, email.trim().toLowerCase(), telefone||null, cep||null, logradouro||null,
         numero||null, complemento||null, bairro||null, cidade||null, estado||null, req.usuario.id]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { id: r.insertId }, 'Freelancer cadastrado', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/freelas/:id
async function atualizarFreela(req, res) {
  try {
    const { id } = req.params;
    const { nome, oab, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;
    if (!nome?.trim())  return erro(res, 'Nome é obrigatório');
    if (!email?.trim()) return erro(res, 'E-mail é obrigatório');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return erro(res, 'Informe um e-mail válido');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE advogados_freela
         SET nome=?, oab=?, email=?, telefone=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, estado=?
         WHERE id=?`,
        [nome.trim(), oab||null, email.trim().toLowerCase(), telefone||null, cep||null, logradouro||null,
         numero||null, complemento||null, bairro||null, cidade||null, estado||null, id]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Freelancer atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/audiencias/freelas/:id
async function excluirFreela(req, res) {
  try {
    const { id } = req.params;

    // Regra nº1 do sistema: não excluir registro em uso em lugar nenhum, mesmo o uso mais
    // simples. Confere TODOS os pontos onde o freelancer pode estar referenciado.
    const [[audienciaResp], [ataAdvogado], [audienciaRespon], [periciaResp], [periciaAssist]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM audiencia WHERE responsavel_freela_id = ?', [id]),
      pool.execute('SELECT COUNT(*) AS total FROM ata_audiencia WHERE advogado_freela_id = ?', [id]),
      pool.execute('SELECT COUNT(*) AS total FROM audiencia_responsaveis WHERE responsavel_freela_id = ?', [id]),
      pool.execute('SELECT COUNT(*) AS total FROM pericia WHERE responsavel_freela_id = ?', [id]),
      pool.execute('SELECT COUNT(*) AS total FROM pericia WHERE assistente_tecnico_freela_id = ?', [id]),
    ]);

    const vinculos = [];
    if (audienciaResp[0].total > 0)  vinculos.push(`${audienciaResp[0].total} audiência(s) como responsável`);
    if (ataAdvogado[0].total > 0)    vinculos.push(`${ataAdvogado[0].total} ata(s) de audiência como advogado acompanhante`);
    if (audienciaRespon[0].total > 0) vinculos.push(`${audienciaRespon[0].total} audiência(s) na lista de responsáveis`);
    if (periciaResp[0].total > 0)    vinculos.push(`${periciaResp[0].total} perícia(s) como responsável`);
    if (periciaAssist[0].total > 0)  vinculos.push(`${periciaAssist[0].total} perícia(s) como assistente técnico`);

    if (vinculos.length > 0) {
      return erro(res, `Freelancer não pode ser excluído pois está vinculado a: ${vinculos.join(', ')}`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM advogados_freela WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Freelancer removido');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/audiencias/:id/reverter — ADMIN reverte uma audiência "Realizada" de volta para "Agendada".
// Apaga a ATA registrada (para poder retrabalhar) e zera o flag de ata impressa. Os prazos/tarefas/
// acordo criados pela ata NÃO são apagados (são registros independentes — o admin trata manualmente).
// A ata_audiencia é tabela folha (nada aponta para ela), então apagá-la não deixa órfão.
// Exige motivo (fica no motivo_status e embutido no histórico).
async function reverterStatus(req, res) {
  const { id } = req.params;
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) return erro(res, 'Informe o motivo da reversão');

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT status FROM audiencia WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Audiência não encontrada');
    if (rows[0].status !== 'realizada') {
      return erro(res, 'Só é possível reverter audiências com status "Realizada"');
    }

    await conn.beginTransaction();

    // Apaga a ata registrada (tabela folha — sem dependentes; mesmo DELETE usado em excluirAudiencia)
    await conn.execute('DELETE FROM ata_audiencia WHERE audiencia_id = ?', [id]);

    // Volta para Agendada, grava o motivo e zera o flag de ata impressa (coerência)
    await conn.execute(
      `UPDATE audiencia SET status = 'agendada', motivo_status = ?, ata_impressa = 0,
              alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [motivo.trim(), req.usuario.id, id]
    );

    // Histórico (com o motivo embutido, para ficar visível no "Histórico")
    await conn.execute(
      `INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', 'realizada', ?, ?)`,
      [id, `agendada — motivo: ${motivo.trim()}`, req.usuario.id]
    );

    await conn.commit();
    // Voltou para agendada → reenvia para a agenda do Google do responsável.
    sincronizarAudienciaGoogle(id, { sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Status revertido para Agendada. A ata foi removida.');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = {
  listarAdvogados,
  listar, buscar, criar, atualizar, excluir, cancelar, remarcar,
  registrarAta, marcarAtaImpressa, reverterStatus,
  buscarHistorico, buscarDetalhesAta,
  buscarPartesProcesso,
  adicionarTestemunha, editarTestemunha, excluirTestemunha,
  buscarTipos, criarTipo, atualizarTipo, excluirTipo,
  listarFreelas, criarFreela, atualizarFreela, excluirFreela,
};
