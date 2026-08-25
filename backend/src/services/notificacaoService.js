// ============================================================
// SERVIÇO DE NOTIFICAÇÕES
// Centraliza criação de notificações na tela e envio de e-mails de prazo
// ============================================================

const { pool }                        = require('../config/database');
const { enviarEmail, enviarEmailColetivo } = require('../utils/email');

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

// Notificação de CONCLUSÃO (prazo OU tarefa) — grava DENTRO da transação da conclusão
// (recebe a conexão `conn`), para ser atômica com o UPDATE que concluiu o item.
// prazo_id e tarefa_id são mutuamente exclusivos: um é o vínculo, o outro fica NULL.
async function notificarConclusao({ conn, usuario_id, prazo_id = null, tarefa_id = null, mensagem }) {
  await conn.execute(
    'INSERT INTO notificacoes (usuario_id, prazo_id, tarefa_id, mensagem) VALUES (?, ?, ?, ?)',
    [usuario_id, prazo_id, tarefa_id, mensagem]
  );
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

// ── E-mail da TAREFA (pedido explícito no formulário) ─────────────────────

// Escapa o que o usuário digitou antes de entrar no HTML do e-mail (título e
// descrição são texto livre; um "&" ou "<" não pode quebrar o layout).
function escaparHtml(txt) {
  return String(txt == null ? '' : txt)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Enviado quando quem cria/edita a tarefa marca "Enviar e-mail para <pessoa>".
// Diferente do prazo (que dispara sozinho ao delegar), aqui o envio é SEMPRE um
// ato deliberado de quem salvou — por isso vale até quando a pessoa é o próprio
// autor da tarefa ou tem o aviso por e-mail desligado no cadastro dela.
// NUNCA lança: a tarefa já está gravada e não pode ser desfeita por causa do
// e-mail. Devolve { ok: true } ou { ok: false, erro } para a tela avisar.
async function emailTarefaAtribuida({ para, nomePara, tarefa, escritorio, edicao = false }) {
  const titulo  = tarefa.titulo || 'Tarefa';
  const assunto = edicao
    ? `Tarefa atualizada — ${titulo}`
    : `Nova tarefa atribuída a você — ${titulo}`;

  const PRIORIDADE = { urgente: '🔴 Urgente', normal: '🟡 Normal', baixa: '🟢 Baixa' };
  const linha = (rotulo, valor) => valor ? `
        <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold;width:35%">${rotulo}</td>
            <td style="padding:8px;background:#f9fafb">${escaparHtml(valor)}</td></tr>` : '';

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#2563eb;padding:20px;text-align:center">
      <h2 style="color:#fff;margin:0">${escaparHtml(escritorio || 'Sistema de Advocacia')}</h2>
    </div>
    <div style="padding:24px">
      <p>Olá, <strong>${escaparHtml(nomePara)}</strong>.</p>
      <p>${edicao ? 'Uma tarefa sua foi atualizada:' : 'Uma nova tarefa foi atribuída a você:'}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${linha('Tarefa', titulo)}
        ${linha('Descrição', tarefa.descricao)}
        ${linha('Prioridade', PRIORIDADE[tarefa.prioridade] || tarefa.prioridade)}
        ${linha('Vencimento', tarefa.venc_fmt)}
        ${linha('Processo', tarefa.processo_numero)}
        ${linha('Pasta', tarefa.pasta_fmt)}
        ${linha(edicao ? 'Alterada por' : 'Criada por', tarefa.autor_nome)}
      </table>
      <p style="color:#555;font-size:13px">Acesse o sistema para mais detalhes.</p>
    </div>
  </div>`;

  try {
    await enviarEmail({ para, assunto, html, destinatarioNome: nomePara });
    return { ok: true };
  } catch (err) {
    console.error('Erro ao enviar e-mail da tarefa:', err.message);
    return { ok: false, erro: err.message };
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

  // Envio coletivo: UMA conexão/login para todos os destinatários (evita throttling do Gmail).
  // Retorna quantos saíram com sucesso.
  return enviarEmailColetivo({ destinatarios, assunto: 'PRAZO PENDENTE HOJE', html });
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

  // Envio coletivo: UMA conexão/login para todos os destinatários (evita throttling do Gmail).
  // Retorna quantos saíram com sucesso.
  return enviarEmailColetivo({ destinatarios, assunto: 'PRAZO ATRASADO', html });
}

module.exports = {
  criarNotificacao,
  notificarConclusao,
  emailPrazoDelegado,
  emailTarefaAtribuida,
  emailPrazosPendentes,
  emailPrazosAtrasados,
};
