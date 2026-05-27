// ============================================================
// UTILITÁRIO DE E-MAIL — Nodemailer com SMTP configurável
// Usado para envio de link de redefinição de senha e futuros alertas.
// Se SMTP_HOST não estiver configurado (ou for placeholder), o sistema
// entra em modo DEV: loga o link no console do servidor ao invés de falhar.
// ============================================================

const nodemailer = require('nodemailer');

// Hosts que indicam SMTP ainda não configurado (placeholders)
const HOSTS_INVALIDOS = ['smtp.example.com', 'example.com', '', undefined, null];

function smtpConfigurado() {
  return !HOSTS_INVALIDOS.includes(process.env.SMTP_HOST?.trim());
}

function criarTransporte() {
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
  });
}

// Envia um e-mail genérico.
// Parâmetros: { para, assunto, html, linkDev? }
// Em desenvolvimento sem SMTP, imprime o link no console e retorna sem erro.
async function enviarEmail({ para, assunto, html, linkDev }) {
  if (!smtpConfigurado()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Servidor de e-mail não configurado. Configure SMTP_HOST no arquivo .env');
    }
    // Modo desenvolvimento: exibe o link no console para teste
    console.log('\n========================================');
    console.log('📧  E-MAIL (modo dev — SMTP não configurado)');
    console.log(`Para:    ${para}`);
    console.log(`Assunto: ${assunto}`);
    if (linkDev) console.log(`Link:    ${linkDev}`);
    console.log('========================================\n');
    return; // simula envio sem erros
  }
  const transporte = criarTransporte();
  await transporte.sendMail({
    from:    process.env.EMAIL_FROM || 'Sistema Advocacia <noreply@advocacia.com>',
    to:      para,
    subject: assunto,
    html,
  });
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

module.exports = { enviarEmail, templateResetSenha };
