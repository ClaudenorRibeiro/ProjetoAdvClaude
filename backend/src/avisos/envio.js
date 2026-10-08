// Avisos aos clientes — o envio de verdade, canal por canal, sempre com registro em log_comunicacoes (ligado ao aviso).
// E-mail e SMS saem pelo servidor. WhatsApp nunca sai sozinho: aqui só se REGISTRA que a conversa foi aberta; quem abre é a tela.
const { pool } = require('../config/database');
const { enviarEmail } = require('../utils/email');
const smsService = require('../services/smsService');
const { lerConfigComtele } = require('../utils/configComtele');
const { registrarComunicacao } = require('../utils/logComunicacao');
const { escaparHtml } = require('../services/notificacaoService');
const { COLUNA_REF } = require('./constantes');

function htmlDoAviso(texto, escritorio) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#1a56db;padding:18px;text-align:center"><h2 style="color:#fff;margin:0;font-size:18px">${escaparHtml(escritorio || 'Escritório de Advocacia')}</h2></div>
    <div style="padding:24px;color:#333"><p>${escaparHtml(texto).replace(/\n/g, '<br>')}</p></div>
  </div>`;
}

const registro = (aviso, usuarioId) => ({
  assunto: aviso.assunto, conteudo: aviso.texto, tipo_pessoa: aviso.cliente_tipo, pessoa_id: aviso.cliente_id,
  processo_id: aviso.processo_id, usuario_id: usuarioId || null, aviso_id: aviso.id,
});

// Canais deste aviso que JÁ saíram com sucesso antes (não repetir e-mail/SMS numa nova tentativa).
async function canaisJaEnviados(avisoId) {
  const [rows] = await pool.execute(`SELECT DISTINCT canal FROM log_comunicacoes WHERE aviso_id = ? AND enviado = 1`, [avisoId]);
  return new Set(rows.map(r => r.canal));
}

async function porEmail(aviso, contatos, escritorio, usuarioId) {
  try {
    await enviarEmail({ para: contatos.email, assunto: aviso.assunto, html: htmlDoAviso(aviso.texto, escritorio), destinatarioNome: contatos.nome });
    await registrarComunicacao({ canal: 'email', destinatario: contatos.email, enviado: 1, ...registro(aviso, usuarioId) });
    return { ok: true, destino: contatos.email };
  } catch (err) {
    await registrarComunicacao({ canal: 'email', destinatario: contatos.email, enviado: 0, erro: err.message, ...registro(aviso, usuarioId) });
    return { ok: false, destino: contatos.email, erro: err.message };
  }
}

async function porSms(aviso, contatos, usuarioId) {
  try {
    const { apiKey, route } = await lerConfigComtele();
    await smsService.enviarSMS(apiKey, contatos.sms, aviso.texto, route);
    await registrarComunicacao({ canal: 'sms', destinatario: contatos.sms, enviado: 1, ...registro(aviso, usuarioId) });
    return { ok: true, destino: contatos.sms };
  } catch (err) {
    await registrarComunicacao({ canal: 'sms', destinatario: contatos.sms, enviado: 0, erro: err.message, ...registro(aviso, usuarioId) });
    return { ok: false, destino: contatos.sms, erro: err.message };
  }
}

async function porWhatsapp(aviso, contatos, usuarioId) {
  await registrarComunicacao({ canal: 'whatsapp', destinatario: contatos.whatsapp, enviado: 1, ...registro(aviso, usuarioId) });
  return { ok: true, destino: contatos.whatsapp, texto: aviso.texto };
}

// Manda pelos canais pedidos. Devolve { email?, sms?, whatsapp? }, cada um { ok, destino, erro? }.
async function enviarCanais({ aviso, canais, contatos, escritorio, usuarioId }) {
  const resultado = {};
  if (canais.includes('email')) resultado.email = await porEmail(aviso, contatos, escritorio, usuarioId);
  if (canais.includes('sms')) resultado.sms = await porSms(aviso, contatos, usuarioId);
  if (canais.includes('whatsapp')) resultado.whatsapp = await porWhatsapp(aviso, contatos, usuarioId);
  // Compatibilidade: a lista de Perícias/Audiências mostra "Reenviar comunicado" quando o cliente já foi comunicado.
  const saiu = (resultado.email?.ok || resultado.sms?.ok || resultado.whatsapp?.ok);
  if (saiu && ['agendada', 'remarcada'].includes(aviso.tipo) && aviso.modulo !== 'parabens') {
    const tabela = aviso.modulo === 'pericia' ? 'pericia' : 'audiencia';   // nomes fixos
    await pool.execute(`UPDATE ${tabela} SET comunicado_enviado = 1 WHERE id = ?`, [aviso[COLUNA_REF[aviso.modulo]]]);
  }
  if (aviso.modulo === 'parabens') await registrarParabens(aviso, resultado, usuarioId);
  return resultado;
}

// Parabéns enviado pelo aviso conta como "já parabenizado neste ano" (a lista de aniversariantes e o botão manual enxergam isso).
async function registrarParabens(aviso, resultado, usuarioId) {
  const ano = Number(String(aviso.data_evento).slice(0, 4));
  for (const [canal, r] of Object.entries(resultado)) {
    if (!r.ok) continue;
    const [ja] = await pool.execute('SELECT id FROM parabens_enviados WHERE pessoa_id = ? AND ano = ? AND canal = ? LIMIT 1', [aviso.cliente_id, ano, canal]);
    if (!ja.length) await pool.execute('INSERT INTO parabens_enviados (pessoa_id, ano, canal, usuario_id) VALUES (?, ?, ?, ?)', [aviso.cliente_id, ano, canal, usuarioId || null]);
  }
}

module.exports = { enviarCanais, canaisJaEnviados, htmlDoAviso };
