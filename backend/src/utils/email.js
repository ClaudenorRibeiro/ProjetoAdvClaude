// ============================================================
// UTILITÁRIO DE E-MAIL — Nodemailer com SMTP configurável
// Usado para envio de link de redefinição de senha e futuros alertas.
// Se SMTP_HOST não estiver configurado (ou for placeholder), o sistema
// entra em modo DEV: loga o link no console do servidor ao invés de falhar.
// ============================================================

const nodemailer   = require('nodemailer');
const { pool }     = require('../config/database');

// Hosts que indicam SMTP ainda não configurado (placeholders)
const HOSTS_INVALIDOS = ['smtp.example.com', 'example.com', '', undefined, null];

// Pausa (em ms) entre o envio de cada e-mail no disparo coletivo. Espaça os
// envios para não disparar o anti-abuso do Gmail em rajadas. Ajuste aqui se quiser.
const PAUSA_ENTRE_EMAILS_MS = 5000; // 5 segundos
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function smtpConfigurado() {
  return !HOSTS_INVALIDOS.includes(process.env.SMTP_HOST?.trim());
}

// Cria o transporte SMTP. `extra` permite mesclar opções adicionais
// (ex.: { pool: true, maxConnections: 1 } no envio coletivo).
function criarTransporte(extra = {}) {
  if (!smtpConfigurado()) {
    throw new Error('SMTP_NAO_CONFIGURADO');
  }
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    ...extra,
  });
}

// Grava o resultado do envio na tabela log_emails (nunca lança exceção)
async function registrarLog(para, assunto, status, erro) {
  try {
    await pool.execute(
      'INSERT INTO log_emails (para, assunto, status, erro) VALUES (?, ?, ?, ?)',
      [para, assunto, status, erro || null]
    );
  } catch (e) {
    console.error('Erro ao gravar log_emails:', e.message);
  }
}

// Envia um e-mail genérico.
// Parâmetros: { para, assunto, html, linkDev? }
// Em desenvolvimento sem SMTP, imprime o link no console e retorna sem erro.
async function enviarEmail({ para, assunto, html, linkDev }) {
  if (!smtpConfigurado()) {
    if (process.env.NODE_ENV === 'production') {
      const msg = 'Servidor de e-mail não configurado. Configure SMTP_HOST no arquivo .env';
      await registrarLog(para, assunto, 'falha', msg);
      throw new Error(msg);
    }
    // Modo desenvolvimento: exibe o link no console para teste
    console.log('\n========================================');
    console.log('📧  E-MAIL (modo dev — SMTP não configurado)');
    console.log(`Para:    ${para}`);
    console.log(`Assunto: ${assunto}`);
    if (linkDev) console.log(`Link:    ${linkDev}`);
    console.log('========================================\n');
    return;
  }
  const transporte = criarTransporte();
  try {
    await transporte.sendMail({
      from:    process.env.EMAIL_FROM || 'Sistema Advocacia <noreply@advocacia.com>',
      to:      para,
      subject: assunto,
      html,
    });
    await registrarLog(para, assunto, 'sucesso', null);
  } catch (err) {
    await registrarLog(para, assunto, 'falha', err.message);
    throw err; // repropaga para o chamador tratar normalmente
  }
}

// Envia o MESMO conteúdo para vários destinatários reutilizando UMA ÚNICA
// conexão/login SMTP (pool com maxConnections: 1). Isso evita o bloqueio
// anti-abuso do Gmail, que recusa autenticações quando recebe muitos logins
// em sequência — o que acontecia quando cada destinatário abria sua própria
// conexão. Cada destinatário continua recebendo um e-mail individual e
// gerando sua própria linha em log_emails. Retorna quantos saíram com sucesso.
async function enviarEmailColetivo({ destinatarios, assunto, html }) {
  const lista = (destinatarios || []).map(e => String(e).trim()).filter(Boolean);
  if (!lista.length) return 0;

  // SMTP não configurado: mesmo tratamento do enviarEmail
  if (!smtpConfigurado()) {
    if (process.env.NODE_ENV === 'production') {
      const msg = 'Servidor de e-mail não configurado. Configure SMTP_HOST no arquivo .env';
      for (const para of lista) await registrarLog(para, assunto, 'falha', msg);
      throw new Error(msg);
    }
    // Modo desenvolvimento: apenas loga no console
    console.log(`\n📧  E-MAIL COLETIVO (modo dev — SMTP não configurado)`);
    console.log(`Assunto: ${assunto}`);
    console.log(`Para:    ${lista.join(', ')}\n`);
    return 0;
  }

  // UM transporte com pool de UMA conexão = UM login reaproveitado em todos os envios
  const transporte = criarTransporte({ pool: true, maxConnections: 1 });
  let enviados = 0;
  try {
    for (let i = 0; i < lista.length; i++) {
      const para = lista[i];
      try {
        await transporte.sendMail({
          from:    process.env.EMAIL_FROM || 'Sistema Advocacia <noreply@advocacia.com>',
          to:      para,
          subject: assunto,
          html,
        });
        await registrarLog(para, assunto, 'sucesso', null);
        enviados++;
      } catch (err) {
        await registrarLog(para, assunto, 'falha', err.message);
        console.error(`Erro ao enviar e-mail para ${para}:`, err.message);
      }
      // Pausa antes do próximo e-mail (não espera após o último)
      if (i < lista.length - 1) await sleep(PAUSA_ENTRE_EMAILS_MS);
    }
  } finally {
    transporte.close(); // fecha o pool e libera a conexão — nada pendurado em memória
  }
  return enviados;
}

// Template HTML para o e-mail de redefinição de senha
function templateResetSenha({ nome, link, escritorio }) {
  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
    <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <div style="background: #2d6be4; padding: 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 20px;">${escritorio || 'Sistema de Advocacia'}</h1>
      </div>
      <div style="padding: 32px 24px;">
        <p style="margin: 0 0 12px; color: #333;">Olá, <strong>${nome}</strong>.</p>
        <p style="margin: 0 0 24px; color: #555;">
          Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${link}" style="
            display: inline-block; background: #2d6be4; color: #fff;
            padding: 12px 32px; border-radius: 6px; text-decoration: none;
            font-weight: bold; font-size: 15px;">
            Redefinir Senha
          </a>
        </div>
        <p style="margin: 0 0 8px; color: #888; font-size: 12px;">
          Este link é válido por <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.
        </p>
        <p style="margin: 0; color: #bbb; font-size: 11px; word-break: break-all;">
          Ou copie e cole este endereço no navegador:<br>${link}
        </p>
      </div>
    </div>
  </body>
  </html>`;
}

module.exports = { enviarEmail, enviarEmailColetivo, templateResetSenha };
