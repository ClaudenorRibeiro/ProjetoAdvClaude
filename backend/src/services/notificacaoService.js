// ============================================================
// SERVIÇO DE NOTIFICAÇÕES
// Centraliza criação de notificações na tela e envio de e-mails de prazo
// ============================================================

const { pool }        = require('../config/database');
const { enviarEmail } = require('../utils/email');

// ── Notificação na tela ────────────────────────────────────────────────────

// Grava uma notificação não lida para o usuário (aparece no badge/sino do header)
async function criarNotificacao(usuario_id, prazo_id, mensagem) {
  try {
    await pool.execute(
      'INSERT INTO notificacoes (usuario_id, prazo_id, mensagem) VALUES (?, ?, ?)',
      [usuario_id, prazo_id, mensagem]
    );
  } catch (err) {
    console.error('Erro ao criar notificação:', err.message);
  }
}

// ── E-mail imediato ao ser delegado ───────────────────────────────────────

// Enviado assim que um prazo é atribuído a alguém
async function emailPrazoDelegado({ para, nomePara, prazo, escritorio }) {
  const subtipo    = prazo.subtipo_nome || prazo.descricao || 'Prazo';
  const vencimento = prazo.data_vencimento;
  const assunto    = `Novo prazo atribuído a você — ${subtipo}`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#2563eb;padding:20px;text-align:center">
      <h2 style="color:#fff;margin:0">${escritorio || 'Sistema de Advocacia'}</h2>
    </div>
    <div style="padding:24px">
      <p>Olá, <strong>${nomePara}</strong>.</p>
      <p>Um novo prazo foi atribuído a você:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold;width:40%">Prazo</td>
            <td style="padding:8px;background:#f9fafb">${subtipo}</td></tr>
        <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Vencimento</td>
            <td style="padding:8px;background:#f9fafb">${vencimento}</td></tr>
      </table>
      <p style="color:#555;font-size:13px">Acesse o sistema para mais detalhes.</p>
    </div>
  </div>`;

  try {
    await enviarEmail({ para, assunto, html });
  } catch (err) {
    console.error('Erro ao enviar e-mail de prazo delegado:', err.message);
  }
}

// ── E-mails coletivos (chamados pelo job diário) ──────────────────────────

// E-mail "PRAZO PENDENTE HOJE" — lista de prazos que vencem hoje
// Retorna o número de e-mails enviados com SUCESSO — o chamador usa esse
// retorno para só marcar "enviado hoje" quando houve envio real (falha de
// SMTP não pode silenciar os alertas até o dia seguinte)
async function emailPrazosPendentes({ destinatarios, prazos, escritorio }) {
  if (!destinatarios?.length || !prazos?.length) return 0;

  const linhas = prazos.map(p => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.processo_numero || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.subtipo_nome || p.descricao || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.responsavel_nome || 'Escritório'}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#f59e0b;padding:20px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">⚠️ PRAZO PENDENTE HOJE</h1>
      <p style="color:#fff;margin:8px 0 0;font-size:14px">${escritorio || 'Sistema de Advocacia'}</p>
    </div>
    <div style="padding:24px">
      <p>Os seguintes prazos <strong>vencem hoje</strong> e ainda não foram concluídos:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px;text-align:left">Processo</th>
            <th style="padding:10px;text-align:left">Prazo</th>
            <th style="padding:10px;text-align:left">Responsável</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  </div>`;

  // Envia para cada destinatário individualmente e conta os sucessos
  let enviados = 0;
  for (const email of destinatarios) {
    try {
      await enviarEmail({ para: email.trim(), assunto: 'PRAZO PENDENTE HOJE', html });
      enviados++;
    } catch (err) {
      console.error(`Erro ao enviar e-mail para ${email}:`, err.message);
    }
  }
  return enviados;
}

// E-mail "PRAZO ATRASADO" — lista de prazos com vencimento passado e não concluídos
// Retorna o número de e-mails enviados com SUCESSO (mesma lógica do pendentes)
async function emailPrazosAtrasados({ destinatarios, prazos, escritorio }) {
  if (!destinatarios?.length || !prazos?.length) return 0;

  const linhas = prazos.map(p => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.processo_numero || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.subtipo_nome || p.descricao || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.data_vencimento}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${Math.abs(p.dias_restantes)}d</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${p.responsavel_nome || 'Escritório'}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#dc2626;padding:20px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">🚨 PRAZO ATRASADO</h1>
      <p style="color:#fff;margin:8px 0 0;font-size:14px">${escritorio || 'Sistema de Advocacia'}</p>
    </div>
    <div style="padding:24px">
      <p>Os seguintes prazos estão <strong>em atraso</strong> e não foram concluídos:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px;text-align:left">Processo</th>
            <th style="padding:10px;text-align:left">Prazo</th>
            <th style="padding:10px;text-align:left">Venceu em</th>
            <th style="padding:10px;text-align:left">Atraso</th>
            <th style="padding:10px;text-align:left">Responsável</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  </div>`;

  // Envia para cada destinatário individualmente e conta os sucessos
  let enviados = 0;
  for (const email of destinatarios) {
    try {
      await enviarEmail({ para: email.trim(), assunto: 'PRAZO ATRASADO', html });
      enviados++;
    } catch (err) {
      console.error(`Erro ao enviar e-mail para ${email}:`, err.message);
    }
  }
  return enviados;
}

module.exports = {
  criarNotificacao,
  emailPrazoDelegado,
  emailPrazosPendentes,
  emailPrazosAtrasados,
};
