// ============================================================
// SERVIÇO DE ALERTAS — Cron jobs automáticos
// Roda em background e dispara alertas no horário configurado
// ============================================================

const cron = require('node-cron');
const { pool } = require('../config/database');
const { emailPrazosPendentes, emailPrazosAtrasados, escaparHtml } = require('./notificacaoService');
const { enviarEmail } = require('../utils/email');
const { liberarFazendoExpirados } = require('../controllers/prazosController');
const { hojeBrasilia } = require('../utils/helpers');
const { gerarAvisos } = require('../avisos');
const { executarVencidos: enviarRelatoriosAgendados } = require('./relatorios/agendamento/envio');

// Fuso horário de todos os crons — sem isso, no servidor (Ubuntu/UTC) o cron
// dispararia 3 horas mais cedo que o horário configurado pelo escritório
const OPCOES_CRON = { timezone: 'America/Sao_Paulo' };

// Referências dos crons de prazos — uma por horário configurado (1 ou 2).
// Guardadas para poder destruir e recriar quando os horários mudarem.
let cronsPrazos = [];

// ── Inicia todos os cron jobs do sistema ──────────────────────────────────

async function iniciarAlertas() {
  // Lê o horário configurado no banco e agenda o cron de prazos
  await reagendarCronPrazos();

  // Libera prazos "Fazendo" expirados — roda a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    await liberarFazendoExpirados();
  }, OPCOES_CRON);

  // Relatórios agendados por e-mail — confere a cada minuto o que venceu
  cron.schedule('* * * * *', async () => {
    await enviarRelatoriosAgendados();
  }, OPCOES_CRON);

  // Avisos aos clientes (Perícia, Audiência e Parabéns): lembretes e aniversários que já valem; envia sozinho o que não passa pela tela (todo dia às 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Cron: gerando avisos aos clientes...');
    await rodarAvisosAosClientes();
  }, OPCOES_CRON);

  // Avisos de idade dos representados (todo dia às 8h10)
  cron.schedule('10 8 * * *', async () => {
    console.log('⏰ Cron: verificando avisos de idade...');
    await verificarAvisosIdade();
  }, OPCOES_CRON);

  // Pendências de documentos com aviso agendado para hoje ou antes (todo dia às 8h15)
  cron.schedule('15 8 * * *', async () => {
    console.log('⏰ Cron: verificando avisos de pendências de documentos...');
    await verificarAvisosPendenciaDocumento();
  }, OPCOES_CRON);

  // Limpeza diária: remove tokens de redefinição de senha já usados ou expirados (3h)
  // Sem isso a tabela reset_tokens cresce indefinidamente
  cron.schedule('0 3 * * *', async () => {
    try {
      const conn = await pool.getConnection();
      let r;
      try {
        await conn.beginTransaction();
        [r] = await conn.execute(
          'DELETE FROM reset_tokens WHERE usado = 1 OR expires_at < NOW()'
        );
        await conn.commit();
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
      if (r.affectedRows) console.log(`🧹 reset_tokens: ${r.affectedRows} token(s) antigo(s) removido(s)`);
    } catch (err) {
      console.error('Erro na limpeza de reset_tokens:', err.message);
    }
  }, OPCOES_CRON);

  setTimeout(rodarAvisosAosClientes, 30000);   // recuperação depois de servidor parado

  console.log('✅ Serviço de alertas iniciado');
}

// ── Reagendamento do cron de prazos ──────────────────────────────────────
// Chamado na inicialização e sempre que o admin salvar um novo horário

async function reagendarCronPrazos() {
  try {
    const [config] = await pool.execute(
      'SELECT horario_alerta_prazos, horario_alerta_prazos_2 FROM configuracoes_escritorio LIMIT 1'
    );

    // Destroi TODOS os crons de prazos anteriores antes de recriar
    cronsPrazos.forEach(c => c.stop());
    cronsPrazos = [];

    // Agenda um cron para cada horário preenchido (o 2º é opcional).
    // Ambos disparam os mesmos alertas (pendentes + atrasados).
    agendarUmCronPrazos(config[0]?.horario_alerta_prazos);    // formato HH:MM:00
    agendarUmCronPrazos(config[0]?.horario_alerta_prazos_2);  // opcional — null se não usado
  } catch (err) {
    console.error('Erro ao reagendar cron de prazos:', err.message);
  }
}

// Agenda um único cron de prazos para o horário "HH:MM:00".
// Ignora silenciosamente se vier vazio (horário não configurado) ou inválido.
function agendarUmCronPrazos(horario) {
  if (!horario) return;

  // Converte "HH:MM:00" para expressão cron "MM HH * * *"
  const partes = horario.split(':');
  const hh = parseInt(partes[0], 10);
  const mm = parseInt(partes[1], 10);

  if (isNaN(hh) || isNaN(mm)) {
    console.error(`⚠️ Horário de alerta inválido no banco: "${horario}"`);
    return;
  }

  const expressao = `${mm} ${hh} * * *`;
  const tarefa = cron.schedule(expressao, async () => {
    console.log(`⏰ Cron prazos: disparando às ${horario}...`);
    await executarAlertasPrazos();
  }, OPCOES_CRON);

  cronsPrazos.push(tarefa);
  console.log(`⏰ Cron de prazos agendado para ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} todos os dias`);
}

// ── Alertas de prazos ─────────────────────────────────────────────────────

async function executarAlertasPrazos() {
  try {
    const [config] = await pool.execute(
      'SELECT alerta_atrasado_ativo, alerta_emails, nome FROM configuracoes_escritorio LIMIT 1'
    );
    if (!config.length || !config[0].alerta_emails) return;

    const destinatarios = config[0].alerta_emails.split(',').map(e => e.trim()).filter(Boolean);
    const escritorio    = config[0].nome;

    // SEM trava diária (regra de negócio 12/06): TODO disparo do cron envia.
    // Se o admin mudar o horário no mesmo dia, o alerta é reenviado no novo
    // horário. Cada tentativa fica registrada na tabela log_emails.
    await enviarAlertaPendentes(destinatarios, escritorio);
    if (config[0].alerta_atrasado_ativo) {
      await enviarAlertaAtrasados(destinatarios, escritorio);
    }
  } catch (err) {
    console.error('Erro ao executar alertas de prazos:', err.message);
  }
}

async function enviarAlertaPendentes(destinatarios, escritorio) {
  const hoje = hojeBrasilia();
  const [prazos] = await pool.execute(
    `SELECT pp.descricao, pp.data_vencimento,
            ps.nome AS subtipo_nome,
            pr.numProc AS processo_numero,
            u.nome AS responsavel_nome
     FROM prazos_processo pp
     LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
     LEFT JOIN usuarios u       ON pp.delegado_para = u.id
     JOIN tblproc pr            ON pp.processo_id = pr.id
     WHERE pp.data_vencimento = ?
       AND pp.status NOT IN ('concluido','cancelado')
     ORDER BY pr.numProc`,
    [hoje]
  );
  if (!prazos.length) { console.log('📋 Nenhum prazo pendente hoje'); return 0; }
  console.log(`📋 Enviando alerta de ${prazos.length} prazo(s) pendente(s)...`);
  // Retorna quantos e-mails saíram com sucesso — usado para marcar a trava do dia
  const enviados = await emailPrazosPendentes({ destinatarios, prazos, escritorio });
  if (!enviados) console.error('⚠️ Alerta de pendentes: NENHUM e-mail saiu (verificar SMTP/destinatários) — será tentado no próximo disparo');
  return enviados;
}

async function enviarAlertaAtrasados(destinatarios, escritorio) {
  const [prazos] = await pool.execute(
    `SELECT pp.descricao, pp.data_vencimento,
            DATEDIFF(CURDATE(), pp.data_vencimento) AS dias_restantes,
            ps.nome AS subtipo_nome,
            pr.numProc AS processo_numero,
            u.nome AS responsavel_nome
     FROM prazos_processo pp
     LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
     LEFT JOIN usuarios u       ON pp.delegado_para = u.id
     JOIN tblproc pr            ON pp.processo_id = pr.id
     WHERE pp.data_vencimento < CURDATE()
       AND pp.status NOT IN ('concluido','cancelado')
     ORDER BY pp.data_vencimento ASC`
  );
  if (!prazos.length) { console.log('✅ Nenhum prazo atrasado'); return 0; }
  console.log(`🚨 Enviando alerta de ${prazos.length} prazo(s) atrasado(s)...`);
  // Retorna quantos e-mails saíram com sucesso — usado para marcar a trava do dia
  const enviados = await emailPrazosAtrasados({ destinatarios, prazos, escritorio });
  if (!enviados) console.error('⚠️ Alerta de atrasados: NENHUM e-mail saiu (verificar SMTP/destinatários) — será tentado no próximo disparo');
  return enviados;
}

// ── Avisos aos clientes ───────────────────────────────────────────────────
// Roda às 8h e também ao ligar o sistema (recupera o que ficou para trás se o servidor ficou parado).
async function rodarAvisosAosClientes() {
  try {
    const r = await gerarAvisos();
    console.log(`📣 Avisos aos clientes: ${r.lembretes} lembrete(s), ${r.aniversarios} aniversário(s), ${r.enviadosSozinhos} enviado(s) sozinho(s)`);
  } catch (err) { console.error('Erro ao gerar avisos aos clientes:', err.message); }
}

// ── AVISOS DE IDADE ───────────────────────────────────────────────────────
// "Me avise quando fulano completar X anos" (configurado no cadastro da pessoa).
// Roda 1x por dia e avisa os ADMINISTRADORES no sino. Só AVISA e registra que
// avisou — não altera nem apaga nada, por decisão do escritório.
//
// Usa >= em vez de = de propósito: se o sistema estiver fora do ar no dia exato,
// o aviso sai no primeiro dia em que voltar, em vez de se perder para sempre.
// O "avisado_em" garante que cada idade avisa UMA única vez.
async function verificarAvisosIdade() {
  try {
    const [pendentes] = await pool.execute(
      `SELECT a.id, a.idade, p.id AS pessoa_id, p.nome
         FROM pessoas_avisos_idade a
         JOIN pessoas_fisicas p ON a.pessoa_id = p.id
        WHERE a.avisado_em IS NULL
          AND p.ativo = 1
          AND p.data_nascimento IS NOT NULL
          AND TIMESTAMPDIFF(YEAR, p.data_nascimento, CURDATE()) >= a.idade
        ORDER BY p.nome`
    );
    if (!pendentes.length) return;

    // Administradores: nível 0 (super) e 1 (admin)
    const [admins] = await pool.execute(
      'SELECT id FROM usuarios WHERE ativo = 1 AND nivel <= 1'
    );
    if (!admins.length) {
      console.log('⚠️ Avisos de idade: nenhum administrador ativo para receber');
      return;
    }

    for (const av of pendentes) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const mensagem = `${av.nome} completou ${av.idade} anos — confira a representação legal nos processos.`.slice(0, 300);
        for (const adm of admins) {
          await conn.execute(
            'INSERT INTO notificacoes (usuario_id, pessoa_id, mensagem) VALUES (?, ?, ?)',
            [adm.id, av.pessoa_id, mensagem]
          );
        }
        // Marca DENTRO da mesma transação: ou o aviso sai para todos e fica
        // registrado, ou não sai para ninguém e tenta de novo amanhã
        await conn.execute(
          'UPDATE pessoas_avisos_idade SET avisado_em = NOW() WHERE id = ?', [av.id]
        );
        await conn.commit();
        console.log(`🔔 Aviso de idade: ${av.nome} (${av.idade} anos) enviado a ${admins.length} administrador(es)`);
      } catch (err) {
        await conn.rollback();
        console.error('Erro no aviso de idade de', av.nome + ':', err.message);
      } finally {
        conn.release();
      }
    }
  } catch (err) {
    console.error('Erro ao verificar avisos de idade:', err.message);
  }
}

// ── AVISOS DE PENDÊNCIA DE DOCUMENTOS ────────────────────────────────────
// "Me avise nesta data" — cada usuário RESPONSÁVEL pela cobrança tem a SUA
// data de aviso e os SEUS canais (sino e/ou e-mail). Roda 1x/dia e cada
// responsável é avisado UMA única vez (avisado_em na linha dele).
//
// Usa <= CURDATE() (não =) de propósito: se o sistema ficar fora do ar no dia
// exato, o aviso sai no primeiro dia em que voltar, em vez de se perder.
// Envia o e-mail de cobrança de pendência ao responsável. Retorna true se saiu, false se falhou.
async function enviarEmailPendencia(p) {
  try {
    await enviarEmail({
      para: p.resp_email,
      assunto: `Pendência de documentos — ${p.cliente_nome || 'cliente'}`,
      destinatarioNome: p.resp_nome,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#b45309;padding:20px;text-align:center">
            <h2 style="color:#fff;margin:0">Pendência de documentos</h2>
          </div>
          <div style="padding:24px">
            <p>Olá, <strong>${escaparHtml(p.resp_nome)}</strong>.</p>
            <p>Chegou a data que você agendou para cobrar os documentos do cliente
               <strong>${escaparHtml(p.cliente_nome || 'cliente')}</strong>.</p>
            <p><strong>${p.pendentes_qtd}</strong> documento(s) ainda não foram entregues — o processo
               segue aguardando.</p>
            <p style="color:#555;font-size:13px">Acesse o sistema, em <strong>Pendências de Documentos</strong>, para ver a lista completa.</p>
          </div>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('Falha ao enviar e-mail de pendência #' + p.pendencia_id + ':', err.message);
    return false;
  }
}

async function verificarAvisosPendenciaDocumento() {
  try {
    const [pendentes] = await pool.execute(
      `SELECT r.id AS resp_row_id, r.avisar_sino, r.avisar_email,
              pd.id AS pendencia_id, pd.tipo_pessoa, pd.pessoa_id,
              CASE pd.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = pd.pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = pd.pessoa_id)
              END AS cliente_nome,
              (SELECT COUNT(*) FROM pendencia_documento_item i
                WHERE i.pendencia_id = pd.id AND i.recebido = 0) AS pendentes_qtd,
              u.id AS resp_id, u.nome AS resp_nome, u.email AS resp_email
         FROM pendencia_documento_responsavel r
         JOIN pendencia_documento pd ON r.pendencia_id = pd.id
         JOIN usuarios u ON r.usuario_id = u.id AND u.ativo = 1
        WHERE pd.status = 'aberta'
          AND r.data_aviso IS NOT NULL
          AND r.data_aviso <= CURDATE()
          AND r.avisado_em IS NULL
        ORDER BY r.data_aviso ASC`
    );
    if (!pendentes.length) return;

    for (const p of pendentes) {
      const temEmail = Number(p.avisar_email) === 1 && !!p.resp_email;
      // Sem e-mail utilizável, o sino é o canal que sobra: nunca dar o aviso como enviado sem ninguém ter recebido nada.
      const temSino  = Number(p.avisar_sino) === 1 || !temEmail;

      // Caso "SÓ e-mail": o aviso só vale se o e-mail SAIR. Envia ANTES de marcar;
      // se falhar, deixa avisado_em nulo e o cron tenta de novo amanhã.
      if (!temSino && temEmail) {
        const ok = await enviarEmailPendencia(p);
        if (!ok) { console.error(`Aviso de pendência #${p.pendencia_id}: e-mail falhou, será tentado amanhã`); continue; }
      }

      // Registra o aviso: o sino (se houver) + o carimbo avisado_em, na mesma transação.
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (temSino) {
          // pessoa_id só referencia pessoas_fisicas — para PJ fica null (o texto já traz o nome).
          const mensagem = `Documentos pendentes de ${p.cliente_nome || 'cliente'} — ${p.pendentes_qtd} documento(s) ainda não entregue(s). Processo aguardando.`.slice(0, 300);
          await conn.execute(
            'INSERT INTO notificacoes (usuario_id, pessoa_id, mensagem) VALUES (?, ?, ?)',
            [p.resp_id, p.tipo_pessoa === 'fisica' ? p.pessoa_id : null, mensagem]
          );
        }
        await conn.execute(
          'UPDATE pendencia_documento_responsavel SET avisado_em = NOW() WHERE id = ?', [p.resp_row_id]
        );
        await conn.commit();
        console.log(`🔔 Aviso de pendência #${p.pendencia_id} (${p.cliente_nome}) → ${p.resp_nome}`);
      } catch (err) {
        await conn.rollback();
        console.error('Erro no aviso de pendência de documentos #' + p.pendencia_id + ':', err.message);
        conn.release();
        continue;
      }
      conn.release();

      // Caso "sino + e-mail": o e-mail é um EXTRA, best-effort depois (o sino já avisou).
      if (temSino && temEmail) await enviarEmailPendencia(p);
    }
  } catch (err) {
    console.error('Erro ao verificar avisos de pendências de documentos:', err.message);
  }
}

module.exports = { iniciarAlertas, reagendarCronPrazos, executarAlertasPrazos, verificarAvisosIdade, verificarAvisosPendenciaDocumento };
