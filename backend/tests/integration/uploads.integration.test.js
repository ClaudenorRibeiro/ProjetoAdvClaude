// Envio de arquivos (multer) pelas 3 rotas que recebem upload, contra MySQL real:
//  - POST /pessoas/enviar-email   (anexos de e-mail; sai por SMTP — aqui, um servidor SMTP falso)
//  - POST /configuracoes/logo     (imagem do escritório, guardada no banco)
//  - POST /documentos/modelos     (modelo .docx; aqui só até a leitura do arquivo, sem S3)
// Conferimos o arquivo chegando inteiro e cada recusa (tamanho, quantidade, tipo, campo errado).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { iniciarSmtpFalso } = require('../support/smtpFalso');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let smtp; let admin;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const MB = 1024 * 1024;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const post = (rota) => request(app).post(rota).set('Authorization', `Bearer ${admin}`);
const campos = (r) => r.field('para', 'cliente@example.invalid').field('assunto', 'Documentos').field('mensagem', 'Seguem os arquivos.');

test.before(async () => {
  await recriarBancoTeste();
  smtp = await iniciarSmtpFalso();
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
  await sql("UPDATE usuarios SET sessao_atual = 'sessao-admin' WHERE id = 1");
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
});
test.after(async () => { await smtp.parar(); await pool.end(); });

test('e-mail com anexos: os dois arquivos chegam inteiros no servidor de e-mail', async () => {
  const pdf = Buffer.from('%PDF-1.4 anexo de teste ' + 'x'.repeat(500));
  const r = await campos(post('/api/pessoas/enviar-email'))
    .attach('anexos', pdf, { filename: 'contrato.pdf', contentType: 'application/pdf' })
    .attach('anexos', PNG, { filename: 'foto.png', contentType: 'image/png' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = smtp.registro.mensagens.at(-1);
  assert.deepEqual(m.para, ['cliente@example.invalid']);
  assert.match(m.dados, /filename="?contrato\.pdf"?/i);
  assert.match(m.dados, /filename="?foto\.png"?/i);
  const corpo = m.dados.replace(/\r?\n/g, '');                      // o e-mail quebra o anexo em linhas de 76 letras
  assert.ok(corpo.includes(pdf.toString('base64')), 'o PDF precisa chegar com o mesmo conteúdo');
  assert.ok(corpo.includes(PNG.toString('base64')), 'a imagem precisa chegar com o mesmo conteúdo');
});

test('e-mail: tipo de arquivo não permitido, mais de 20 arquivos e arquivo acima de 20 MB são recusados com a mensagem certa', async () => {
  const enviadosAntes = smtp.registro.mensagens.length;
  let r = await campos(post('/api/pessoas/enviar-email')).attach('anexos', Buffer.from('MZ'), { filename: 'virus.exe' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /Tipo de arquivo não permitido/);

  r = campos(post('/api/pessoas/enviar-email'));
  for (let i = 0; i < 21; i++) r = r.attach('anexos', Buffer.from('a'), { filename: `a${i}.pdf` });
  r = await r;
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /Máximo de 20 arquivos/);

  r = await campos(post('/api/pessoas/enviar-email')).attach('anexos', Buffer.alloc(21 * MB, 1), { filename: 'enorme.pdf' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /no máximo 20 MB/);
  assert.equal(smtp.registro.mensagens.length, enviadosAntes, 'nada pode ter saído');
});

test('logo: imagem válida é guardada no banco; acima de 512 KB e arquivo que não é imagem são recusados', async () => {
  let r = await post('/api/configuracoes/logo').attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const [{ logo_base64: guardado }] = await sql('SELECT logo_base64 FROM configuracoes_escritorio LIMIT 1');
  assert.equal(guardado, `data:image/png;base64,${PNG.toString('base64')}`);

  r = await post('/api/configuracoes/logo').attach('logo', Buffer.alloc(513 * 1024, 1), { filename: 'grande.png', contentType: 'image/png' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /512 KB/);

  r = await post('/api/configuracoes/logo').attach('logo', Buffer.from('isto nao e imagem, e texto comum'), { filename: 'falso.png', contentType: 'image/png' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /Arquivo inválido/);

  r = await post('/api/configuracoes/logo').attach('outro_campo', PNG, { filename: 'logo.png' });
  assert.equal(r.status, 400); assert.ok(r.body.mensagem && r.body.mensagem.length > 0, 'campo com nome errado tem mensagem de erro');
});

test('modelo .docx: arquivo chega ao sistema (que o lê e recusa o que não é .docx); acima de 5 MB é recusado antes', async () => {
  let r = await post('/api/documentos/modelos').field('nome', 'Modelo X')
    .attach('arquivo', Buffer.from('nao e um docx'), { filename: 'm.docx' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /documento \.docx válido/, 'o arquivo foi lido pelo servidor');

  r = await post('/api/documentos/modelos').field('nome', 'Modelo X').attach('arquivo', Buffer.alloc(5 * MB + 1024, 1), { filename: 'g.docx' });
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /limite de 5 MB/);

  r = await post('/api/documentos/modelos').field('nome', 'Modelo X');
  assert.equal(r.status, 400); assert.match(r.body.mensagem, /Envie o arquivo/);
});
