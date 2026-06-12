// ============================================================
// SERVIÇO DE ALERTAS — Cron jobs automáticos
// Roda em background e dispara alertas no horário configurado
// ============================================================

const cron = require('node-cron');
const { pool } = require('../config/database');
const { diasUteisAntes } = require('./calendarioService');
const { emailPrazosPendentes, emailPrazosAtrasados } = require('./notificacaoService');
const { liberarFazendoExpirados } = require('../controllers/prazosController');

// Referência do cron de prazos — guardada para poder destruir e recriar quando o horário mudar
let cronPrazos = null;

// ── Inicia todos os cron jobs do sistema ──────────────────────────────────

async function iniciarAlertas() {
  // Lê o horário configurado no banco e agenda o cron de prazos
  await reagendarCronPrazos();

  // Libera prazos "Fazendo" expirados — roda a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    await liberarFazendoExpirados();
  });

  // Verifica audiências para alertar clientes (todo dia às 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de audiências...');
    await verificarAlertasAudiencias();
  });

  // Verifica perícias para alertar clientes (todo dia às 8h05)
  cron.schedule('5 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de perícias...');
    await verificarAlertasPericias();
  });

  console.log('✅ Serviço de alertas iniciado');
}

// ── Reagendamento do cron de prazos ──────────────────────────────────────
// Chamado na inicialização e sempre que o admin salvar um novo horário

async function reagendarCronPrazos() {
  try {
    const [config] = await pool.execute(
      'SELECT horario_alerta_prazos FROM configuracoes_escritorio LIMIT 1'
    );
    const horario = config[0]?.horario_alerta_prazos; // formato HH:MM:00

    // Destroi o cron anterior se existir
    if (cronPrazos) {
      cronPrazos.stop();
      cronPrazos = null;
    }

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
    cronPrazos = cron.schedule(expressao, async () => {
      console.log(`⏰ Cron prazos: disparando às ${horario}...`);
      await executarAlertasPrazos();
    });

    console.log(`⏰ Cron de prazos agendado para ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} todos os dias`);
  } catch (err) {
    console.error('Erro ao reagendar cron de prazos:', err.message);
  }
}

// ── Alertas de prazos ─────────────────────────────────────────────────────

async function executarAlertasPrazos() {
  try {
    const [config] = await pool.execute(
      'SELECT alerta_atrasado_ativo, alerta_emails, nome, alerta_pendentes_enviado, alerta_atrasados_enviado FROM configuracoes_escritorio LIMIT 1'
    );
    if (!config.length || !config[0].alerta_emails) return;

    const hoje          = new Date().toISOString().split('T')[0];
    const destinatarios = config[0].alerta_emails.split(',').map(e => e.trim()).filter(Boolean);
    const escritorio    = config[0].nome;

    const toStr = v => v ? (v instanceof Date ? v.toISOString().slice(0,10) : String(v).slice(0,10)) : null;
    const jaEnviouPendentes = toStr(config[0].alerta_pendentes_enviado) === hoje;
    const jaEnviouAtrasados = toStr(config[0].alerta_atrasados_enviado) === hoje;

    if (!jaEnviouPendentes) {
      await enviarAlertaPendentes(destinatarios, escritorio);
      await pool.execute(
        'UPDATE configuracoes_escritorio SET alerta_pendentes_enviado = ? WHERE id = 1', [hoje]
      );
    }
    if (config[0].alerta_atrasado_ativo && !jaEnviouAtrasados) {
      await enviarAlertaAtrasados(destinatarios, escritorio);
      await pool.execute(
        'UPDATE configuracoes_escritorio SET alerta_atrasados_enviado = ? WHERE id = 1', [hoje]
      );
    }
  } catch (err) {
    console.error('Erro ao executar alertas de prazos:', err.message);
  }
}

async function enviarAlertaPendentes(destinatarios, escritorio) {
  const hoje = new Date().toISOString().split('T')[0];
  const [prazos] = await pool.execute(
    `SELECT pp.descricao, pp.data_vencimento,
            ps.nome AS subtipo_nome,
            pr.numProc AS processo_numero,
            u.nome AS responsavel_nome
     FROM prazos_processo pp
     LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
     LEFT JOIN usuarios u       ON pp.delegado_para = u.id
     JOIN tblProc pr            ON pp.processo_id = pr.id
     WHERE pp.data_vencimento = ?
       AND pp.status NOT IN ('concluido','cancelado')
     ORDER BY pr.numProc`,
    [hoje]
  );
  if (!prazos.length) { console.log('📋 Nenhum prazo pendente hoje'); return; }
  console.log(`📋 Enviando alerta de ${prazos.length} prazo(s) pendente(s)...`);
  await emailPrazosPendentes({ destinatarios, prazos, escritorio });
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
     JOIN tblProc pr            ON pp.processo_id = pr.id
     WHERE pp.data_vencimento < CURDATE()
       AND pp.status NOT IN ('concluido','cancelado')
     ORDER BY pp.data_vencimento ASC`
  );
  if (!prazos.length) { console.log('✅ Nenhum prazo atrasado'); return; }
  console.log(`🚨 Enviando alerta de ${prazos.length} prazo(s) atrasado(s)...`);
  await emailPrazosAtrasados({ destinatarios, prazos, escritorio });
}

// ── Alertas de audiências ─────────────────────────────────────────────────

async function verificarAlertasAudiencias() {
  try {
    const [config] = await pool.execute('SELECT dias_alerta_audiencia FROM configuracoes_escritorio LIMIT 1');
    const diasAlerta = config[0]?.dias_alerta_audiencia || 3;
    const hoje = new Date().toISOString().split('T')[0];
    const [audiencias] = await pool.execute(
      `SELECT a.id, a.data FROM audiencia a WHERE a.comunicado_enviado = 0 AND a.data > ? ORDER BY a.data ASC`,
      [hoje]
    );
    for (const a of audiencias) {
      const dataA      = typeof a.data === 'string' ? a.data.split('T')[0] : a.data.toISOString().split('T')[0];
      const dataAlerta = await diasUteisAntes(dataA, diasAlerta);
      if (dataAlerta === hoje) console.log(`📅 Alerta audiência ${a.id} em ${dataA}`);
    }
  } catch (err) { console.error('Erro alertas audiências:', err.message); }
}

// ── Alertas de perícias ───────────────────────────────────────────────────

async function verificarAlertasPericias() {
  try {
    const [config] = await pool.execute('SELECT dias_alerta_pericia FROM configuracoes_escritorio LIMIT 1');
    const diasAlerta = config[0]?.dias_alerta_pericia || 2;
    const hoje = new Date().toISOString().split('T')[0];
    const [pericias] = await pool.execute(
      `SELECT p.id, p.data FROM pericia p WHERE p.comunicado_enviado = 0 AND p.data > ?`,
      [hoje]
    );
    for (const p of pericias) {
      const dataP      = typeof p.data === 'string' ? p.data.split('T')[0] : p.data.toISOString().split('T')[0];
      const dataAlerta = await diasUteisAntes(dataP, diasAlerta);
      if (dataAlerta === hoje) console.log(`🔬 Alerta perícia ${p.id} em ${dataP}`);
    }
  } catch (err) { console.error('Erro alertas perícias:', err.message); }
}

module.exports = { iniciarAlertas, reagendarCronPrazos };
