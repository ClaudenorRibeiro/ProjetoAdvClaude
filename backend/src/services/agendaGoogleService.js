// ============================================================
// GOOGLE AGENDA — envio de eventos por CONVITE DE CALENDÁRIO (.ics)
// ------------------------------------------------------------
// Caminho escolhido: em vez de integrar via OAuth/API do Google, o sistema
// manda um CONVITE (arquivo .ics, method=REQUEST) para o e-mail do Google do
// usuário. O Google Agenda reconhece convites e adiciona o evento na agenda
// dele. Editar/excluir usam o MESMO UID (REQUEST com SEQUENCE maior / CANCEL).
//
// Núcleo genérico (serve a compromisso, tarefa, prazo, audiência, perícia):
// quem chama resolve o DONO do evento (e a config google dele) e passa os
// dados já prontos. Envio é "melhor esforço": qualquer erro é logado e
// engolido — NUNCA lança, para não quebrar o salvamento do evento.
// Fuso fixo America/Sao_Paulo (Brasil sem horário de verão desde 2019).
// ============================================================

const { enviarEmail } = require('../utils/email');

const TZID = 'America/Sao_Paulo';

// Domínio estável para compor o UID de cada evento (parte após o @). Só precisa
// ser constante entre criação/edição/cancelamento — deriva do EMAIL_FROM/SMTP_USER.
function dominioUid() {
  const bruto = process.env.EMAIL_FROM || process.env.SMTP_USER || 'sistema.local';
  const m = String(bruto).match(/@([\w.-]+)/);
  return (m && m[1]) || 'sistema.local';
}

// UID determinístico por tipo+id (ex.: compromisso-42@dominio). O mesmo evento
// sempre gera o mesmo UID → atualização/cancelamento caem no evento certo.
function uidEvento(tipo, id) {
  return `${tipo}-${id}@${dominioUid()}`;
}

// E-mail "puro" do organizador (escritório), extraído do EMAIL_FROM ("Nome <a@b>") ou do SMTP_USER.
function emailOrganizador() {
  const bruto = process.env.EMAIL_FROM || process.env.SMTP_USER || '';
  const m = String(bruto).match(/<([^>]+)>/);
  return (m ? m[1] : String(bruto)).trim() || 'noreply@sistema.local';
}

const pad = n => String(n).padStart(2, '0');

// Escapa texto para os campos do .ics (RFC 5545).
function esc(t) {
  return String(t || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// 'YYYY-MM-DD' (ou Date) → 'YYYYMMDD'
function soData(data) {
  if (data instanceof Date) return `${data.getFullYear()}${pad(data.getMonth() + 1)}${pad(data.getDate())}`;
  return String(data).slice(0, 10).replace(/-/g, '');
}

// Dia seguinte em 'YYYYMMDD' (DTEND de evento de dia inteiro é EXCLUSIVO).
function diaSeguinte(data) {
  const base = data instanceof Date ? new Date(data) : new Date(`${String(data).slice(0, 10)}T00:00:00`);
  base.setDate(base.getDate() + 1);
  return `${base.getFullYear()}${pad(base.getMonth() + 1)}${pad(base.getDate())}`;
}

// 'HH:MM' ou 'HH:MM:SS' → 'HHMMSS'
function soHora(h) {
  const [hh = '0', mm = '0', ss = '0'] = String(h || '').split(':');
  return `${pad(+hh)}${pad(+mm)}${pad(+ss)}`;
}

// hora_fim padrão = hora_inicio + 1h (quando não veio fim no evento com horário).
function maisUmaHora(h) {
  const [hh = '0', mm = '0'] = String(h || '00:00').split(':');
  return `${pad((+hh + 1) % 24)}:${pad(+mm)}:00`;
}

// Carimbo de data/hora atual em UTC (DTSTAMP).
function agoraUtc() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// VTIMEZONE mínimo (UTC-3 fixo) para os eventos com horário.
const BLOCO_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// Monta o texto do .ics. method = 'REQUEST' (criar/editar) ou 'CANCEL' (excluir).
function montarIcs({ uid, sequence, method, resumo, descricao, data, diaTodo,
                     horaInicio, horaFim, destinatarioEmail, destinatarioNome }) {
  const org = emailOrganizador();
  let linhasData;
  if (diaTodo) {
    linhasData = [`DTSTART;VALUE=DATE:${soData(data)}`, `DTEND;VALUE=DATE:${diaSeguinte(data)}`];
  } else {
    const ini = soHora(horaInicio || '00:00:00');
    const fim = soHora(horaFim || maisUmaHora(horaInicio || '00:00:00'));
    linhasData = [
      `DTSTART;TZID=${TZID}:${soData(data)}T${ini}`,
      `DTEND;TZID=${TZID}:${soData(data)}T${fim}`,
    ];
  }
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NovoJud//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    ...(diaTodo ? [] : BLOCO_VTIMEZONE),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${Number(sequence) || 0}`,
    `DTSTAMP:${agoraUtc()}`,
    ...linhasData,
    `SUMMARY:${esc(resumo)}`,
    ...(descricao ? [`DESCRIPTION:${esc(descricao)}`] : []),
    `ORGANIZER;CN=${esc('Agenda do Escritório')}:mailto:${org}`,
    `ATTENDEE;CN=${esc(destinatarioNome || destinatarioEmail)};RSVP=TRUE:mailto:${destinatarioEmail}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return linhas.join('\r\n');
}

// Data em 'YYYY-MM-DD' aceitando string OU Date (DATE do MySQL vem como Date).
function isoData(data) {
  if (data instanceof Date) return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
  return String(data).slice(0, 10);
}

// Corpo (HTML) simples do e-mail que acompanha o convite.
function corpoHtml({ resumo, cancelar, data, diaTodo, horaInicio }) {
  const dataBr = isoData(data).split('-').reverse().join('/');
  const quando = diaTodo ? `${dataBr} (dia inteiro)` : `${dataBr} às ${String(horaInicio || '').slice(0, 5)}`;
  const seguro = String(resumo || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  if (cancelar) {
    return `<p>O evento abaixo foi <strong>cancelado</strong> e será removido da sua agenda do Google:</p>
            <p><strong>${seguro}</strong><br>${quando}</p>`;
  }
  return `<p>Novo evento na sua agenda. Ele deve aparecer automaticamente no seu Google Agenda:</p>
          <p><strong>${seguro}</strong><br>${quando}</p>
          <p style="color:#6b7280;font-size:12px">Se não aparecer sozinho, confira no seu Gmail o convite e clique em "Sim".</p>`;
}

// Envia (ou cancela) o convite de um evento para o Google do destinatário.
// NUNCA lança: em erro, apenas registra no console. Quem chama pode ignorar o retorno.
async function enviarConviteEvento({ tipo, id, sequence = 0, cancelar = false,
  resumo, descricao, data, diaTodo = false, horaInicio, horaFim,
  destinatarioEmail, destinatarioNome }) {
  try {
    if (!destinatarioEmail || !data) return;
    const method = cancelar ? 'CANCEL' : 'REQUEST';
    const ics = montarIcs({
      uid: uidEvento(tipo, id), sequence, method, resumo, descricao,
      data, diaTodo, horaInicio, horaFim, destinatarioEmail, destinatarioNome,
    });
    await enviarEmail({
      para: destinatarioEmail,
      assunto: `${cancelar ? 'Cancelamento' : 'Agenda'}: ${resumo}`,
      html: corpoHtml({ resumo, cancelar, data, diaTodo, horaInicio }),
      destinatarioNome,
      icalEvent: { method, content: ics },
    });
  } catch (err) {
    console.error('[agendaGoogle] falha ao enviar convite:', err.message);
  }
}

module.exports = { enviarConviteEvento, uidEvento, montarIcs };
