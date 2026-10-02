// E-mail de verdade pela biblioteca Nodemailer, contra um servidor SMTP falso local:
// confere login, destinatário, assunto, anexo e convite de calendário, e o registro em log_emails.
// (Os testes de relatórios trocam o transporte por um boneco; este garante a biblioteca real.)
const test = require('node:test');
const assert = require('node:assert/strict');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { iniciarSmtpFalso } = require('../support/smtpFalso');

carregarAmbienteTeste();
const { pool } = require('../../src/config/database');
const { enviarEmail, enviarEmailColetivo } = require('../../src/utils/email');

let smtp;
const SENHA_CERTA = 'senha-smtp-teste';
async function logs() {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute('SELECT para, assunto, status, erro FROM log_emails ORDER BY id'))[0]; } finally { await conn.end(); }
}
function configurar(porta) {
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(porta);
  process.env.SMTP_USER = 'usuario-smtp'; process.env.SMTP_PASS = SENHA_CERTA;
  process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
}

test.before(async () => {
  await recriarBancoTeste();
  smtp = await iniciarSmtpFalso({ aceitarSenha: (u, s) => u === 'usuario-smtp' && s === SENHA_CERTA });
  configurar(smtp.porta);
});
test.after(async () => { await smtp.parar(); await pool.end(); });

test('e-mail com anexo e convite de calendário chega inteiro e fica registrado como sucesso', async () => {
  const pdf = Buffer.from('%PDF-1.4 conteudo de teste do anexo');
  await enviarEmail({
    para: 'cliente@example.invalid', assunto: 'Relatório semanal — Ação', html: '<p>Olá <b>mundo</b></p>',
    anexos: [{ filename: 'relatorio.pdf', content: pdf, contentType: 'application/pdf' }],
    icalEvent: { method: 'REQUEST', content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR' },
  });
  const m = smtp.registro.mensagens.at(-1);
  assert.deepEqual(smtp.registro.autenticacoes.at(-1), { usuario: 'usuario-smtp', senha: SENHA_CERTA });
  assert.equal(m.de, 'envio@example.invalid');
  assert.deepEqual(m.para, ['cliente@example.invalid']);
  assert.match(m.dados, /Subject: =\?UTF-8\?[QB]\?/i);                 // assunto com acento vai codificado
  assert.match(m.dados, /filename="?relatorio\.pdf"?/i);
  assert.ok(m.dados.includes(pdf.toString('base64')), 'o anexo precisa chegar byte a byte (base64)');
  assert.match(m.dados, /text\/calendar/i);
  assert.match(m.dados, /BEGIN:VCALENDAR/);
  const ultimo = (await logs()).at(-1);
  assert.deepEqual([ultimo.para, ultimo.status, ultimo.erro], ['cliente@example.invalid', 'sucesso', null]);
});

test('envio coletivo usa UM login e entrega um e-mail individual para cada destinatário', async () => {
  const antes = { conexoes: smtp.registro.conexoes, logins: smtp.registro.autenticacoes.length, msgs: smtp.registro.mensagens.length };
  const enviados = await enviarEmailColetivo({ destinatarios: ['a@example.invalid', 'b@example.invalid'], assunto: 'Aviso', html: '<p>oi</p>' });
  assert.equal(enviados, 2);
  assert.equal(smtp.registro.conexoes - antes.conexoes, 1, 'uma única conexão');
  assert.equal(smtp.registro.autenticacoes.length - antes.logins, 1, 'um único login');
  const novas = smtp.registro.mensagens.slice(antes.msgs);
  assert.deepEqual(novas.map(m => m.para), [['a@example.invalid'], ['b@example.invalid']]);
});

test('senha recusada pelo servidor: o erro volta para quem chamou e fica registrado como falha', async () => {
  process.env.SMTP_PASS = 'senha-errada';
  try {
    await assert.rejects(() => enviarEmail({ para: 'x@example.invalid', assunto: 'Não deve sair', html: '<p>x</p>' }));
  } finally { process.env.SMTP_PASS = SENHA_CERTA; }
  const ultimo = (await logs()).at(-1);
  assert.deepEqual([ultimo.para, ultimo.status], ['x@example.invalid', 'falha']);
  assert.ok(ultimo.erro && ultimo.erro.length > 0);
  assert.ok(!smtp.registro.mensagens.some(m => m.para.includes('x@example.invalid')), 'nada pode ter sido entregue');
});
