// ============================================================
// SERVIÇO DE ALERTAS — Cron jobs automáticos
// Roda em background e dispara alertas no horário configurado
// ============================================================

const cron = require('node-cron');
const { pool } = require('../config/database');
const { diasUteisAntes } = require('./calendarioService');
const { emailPrazosPendentes, emailPrazosAtrasados } = require('./notificacaoService');
const { liberarFazendoExpirados } = require('../controllers/prazosController');
const { hojeBrasilia } = require('../utils/helpers');

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

  // Verifica audiências para alertar clientes (todo dia às 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de audiências...');
    await verificarAlertasAudiencias();
  }, OPCOES_CRON);

  // Verifica perícias para alertar clientes (todo dia às 8h05)
  cron.schedule('5 8 * * *', async () => {
    console.log('⏰ Cron: verificando alertas de perícias...');
    await verificarAlertasPericias();
  }, OPCOES_CRON);

  // Avisos de idade dos representados (todo dia às 8h10)
  cron.schedule('10 8 * * *', async () => {
    console.log('⏰ Cron: verificando avisos de idade...');
    await verificarAvisosIdade();
  }, OPCOES_CRON);

  // Limpeza diária: remove tokens de redefinição de senha já usados ou expirados (3h)
  // Sem isso a tabela reset_tokens cresce indefinidamente
  cron.schedule('0 3 * * *', async () => {
    try {
      const [r] = await pool.execute(
        'DELETE FROM reset_tokens WHERE usado = 1 OR expires_at < NOW()'
      );
      if (r.affectedRows) console.log(`🧹 reset_tokens: ${r.affectedRows} token(s) antigo(s) removido(s)`);
    } catch (err) {
      console.error('Erro na limpeza de reset_tokens:', err.message);
    }
  }, OPCOES_CRON);

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

// ── Alertas de audiências ─────────────────────────────────────────────────

async function verificarAlertasAudiencias() {
  try {
    const [config] = await pool.execute('SELECT dias_alerta_audiencia FROM configuracoes_escritorio LIMIT 1');
    const diasAlerta = config[0]?.dias_alerta_audiencia || 3;
    const hoje = hojeBrasilia();
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
    const hoje = hojeBrasilia();
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

module.exports = { iniciarAlertas, reagendarCronPrazos, verificarAvisosIdade };
