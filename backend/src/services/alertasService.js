// ============================================================
// SERVIÇO DE ALERTAS — Cron jobs automáticos
// Roda em background e dispara alertas no horário configurado
// ============================================================

const cron = require('node-cron');
const { pool } = require('../config/database');
const { diasUteisAntes } = require('./calendarioService');
const { emailPrazosPendentes, emailPrazosAtrasados } = require('./notificacaoService');
const { liberarFazendoExpirados } = require('../controllers/prazosController');

// Controle em memória para não enviar dois e-mails no mesmo dia
const enviadoHoje = { pendentes: null, atrasados: null };

// ── Inicia todos os cron jobs do sistema ──────────────────────────────────

function iniciarAlertas() {
  // Roda a cada minuto e verifica se chegou o horário configurado para alertas de prazo
  cron.schedule('* * * * *', async () => {
    await verificarHorarioAlertas();
  });

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

// ── Alertas de prazos ─────────────────────────────────────────────────────

async function verificarHorarioAlertas() {
  try {
    const [config] = await pool.execute(
      'SELECT horario_alerta_prazos, alerta_atrasado_ativo, alerta_emails, nome FROM configuracoes_escritorio LIMIT 1'
    );
    if (!config.length || !config[0].horario_alerta_prazos || !config[0].alerta_emails) return;

    const agora     = new Date();
    const hh        = String(agora.getHours()).padStart(2, '0');
    const mm        = String(agora.getMinutes()).padStart(2, '0');
    const horaAtual = `${hh}:${mm}:00`;
    const hoje      = agora.toISOString().split('T')[0];

    if (horaAtual !== config[0].horario_alerta_prazos) return;

    const destinatarios = config[0].alerta_emails.split(',').map(e => e.trim()).filter(Boolean);
    const escritorio    = config[0].nome;

    if (enviadoHoje.pendentes !== hoje) {
      await enviarAlertaPendentes(destinatarios, escritorio);
      enviadoHoje.pendentes = hoje;
    }
    if (config[0].alerta_atrasado_ativo && enviadoHoje.atrasados !== hoje) {
      await enviarAlertaAtrasados(destinatarios, escritorio);
      enviadoHoje.atrasados = hoje;
    }
  } catch (err) {
    console.error('Erro ao verificar horário de alertas:', err.message);
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
      const dataA     = typeof a.data === 'string' ? a.data.split('T')[0] : a.data.toISOString().split('T')[0];
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
      const dataP     = typeof p.data === 'string' ? p.data.split('T')[0] : p.data.toISOString().split('T')[0];
      const dataAlerta = await diasUteisAntes(dataP, diasAlerta);
      if (dataAlerta === hoje) console.log(`🔬 Alerta perícia ${p.id} em ${dataP}`);
    }
  } catch (err) { console.error('Erro alertas perícias:', err.message); }
}

module.exports = { iniciarAlertas };
