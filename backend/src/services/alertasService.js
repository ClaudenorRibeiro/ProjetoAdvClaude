// ============================================================
// SERVIÇO DE ALERTAS — Cron jobs automáticos
// Roda em background e dispara alertas no horário configurado
// ============================================================

const cron = require('node-cron');
const { pool } = require('../config/database');
const { diasUteisAntes } = require('./calendarioService');

// Inicia todos os cron jobs do sistema
function iniciarAlertas() {
  // Verifica prazos pendentes todo dia às 18h (horário configurável)
  // Formato cron: minuto hora * * * (todo dia)
  cron.schedule('0 18 * * *', async () => {
    console.log('⏰ Cron: verificando prazos pendentes...');
    await verificarPrazosPendentes();
  });

  // Verifica audiências para alertar clientes (roda todo dia às 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de audiências...');
    await verificarAlertasAudiencias();
  });

  // Verifica perícias para alertar clientes (roda todo dia às 8h)
  cron.schedule('5 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de perícias...');
    await verificarAlertasPericias();
  });

  console.log('✅ Serviço de alertas iniciado');
}

// Busca prazos que vencem hoje e notifica os admins
async function verificarPrazosPendentes() {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const [prazos] = await pool.execute(
      `SELECT p.id, p.descricao, p.data_vencimento, u.nome as responsavel
       FROM prazos_processo p
       LEFT JOIN usuarios u ON p.delegado_para = u.id
       WHERE p.data_vencimento = ?
         AND p.status NOT IN ('concluido')`,
      [hoje]
    );

    if (prazos.length === 0) return;

    // Aqui entraria o envio de e-mail/WhatsApp para os admins
    // (depende das integrações ativas)
    console.log(`📋 ${prazos.length} prazo(s) vencem hoje — notificação pendente`);

  } catch (err) {
    console.error('Erro ao verificar prazos:', err.message);
  }
}

// Verifica audiências que precisam de alerta ao cliente
async function verificarAlertasAudiencias() {
  try {
    // Busca configuração de quantos dias úteis antes avisar
    const [config] = await pool.execute(
      'SELECT dias_alerta_audiencia FROM configuracoes_escritorio LIMIT 1'
    );
    const diasAlerta = config[0]?.dias_alerta_audiencia || 3;

    const hoje = new Date().toISOString().split('T')[0];

    // Busca audiências futuras que ainda não tiveram comunicado enviado
    const [audiencias] = await pool.execute(
      `SELECT a.id, a.data, a.hora, a.processo_id
       FROM audiencia a
       WHERE a.comunicado_enviado = 0
         AND a.data > ?
       ORDER BY a.data ASC`,
      [hoje]
    );

    for (const audiencia of audiencias) {
      const dataAudiencia = audiencia.data.toISOString().split('T')[0];
      const dataAlerta = await diasUteisAntes(dataAudiencia, diasAlerta);

      if (dataAlerta === hoje) {
        // É hoje que deve enviar o alerta — registrar para envio
        console.log(`📅 Alerta: audiência ${audiencia.id} em ${dataAudiencia} — enviar agora`);
        // Aqui entraria o envio real via WhatsApp/e-mail
      }
    }
  } catch (err) {
    console.error('Erro ao verificar alertas de audiências:', err.message);
  }
}

// Verifica perícias que precisam de alerta ao cliente
async function verificarAlertasPericias() {
  try {
    const [config] = await pool.execute(
      'SELECT dias_alerta_pericia FROM configuracoes_escritorio LIMIT 1'
    );
    const diasAlerta = config[0]?.dias_alerta_pericia || 2;
    const hoje = new Date().toISOString().split('T')[0];

    const [pericias] = await pool.execute(
      `SELECT p.id, p.data, p.processo_id
       FROM pericia p
       WHERE p.comunicado_enviado = 0
         AND p.data > ?`,
      [hoje]
    );

    for (const pericia of pericias) {
      const dataPericia = pericia.data.toISOString().split('T')[0];
      const dataAlerta = await diasUteisAntes(dataPericia, diasAlerta);

      if (dataAlerta === hoje) {
        console.log(`🔬 Alerta: perícia ${pericia.id} em ${dataPericia} — enviar agora`);
      }
    }
  } catch (err) {
    console.error('Erro ao verificar alertas de perícias:', err.message);
  }
}

module.exports = { iniciarAlertas };
