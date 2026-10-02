// Servidor SMTP FALSO para testes: fala o protocolo de verdade (EHLO, AUTH, MAIL, RCPT, DATA),
// guarda o que recebeu e não envia nada para fora. Assim o Nodemailer REAL é exercitado
// (os outros testes trocam o transporte por um boneco e não pegariam um problema da biblioteca).
const net = require('node:net');

function iniciarSmtpFalso({ aceitarSenha = () => true } = {}) {
  const registro = { conexoes: 0, autenticacoes: [], mensagens: [] };
  const servidor = net.createServer((socket) => {
    registro.conexoes++;
    let buffer = '';
    let atual = null;          // mensagem em recebimento
    let emDados = false;
    const responder = (texto) => socket.write(texto + '\r\n');
    socket.on('error', () => {});
    responder('220 smtp-falso ESMTP pronto');
    socket.on('data', (pedaco) => {
      buffer += pedaco.toString('binary');
      for (;;) {
        if (emDados) {
          const fim = buffer.indexOf('\r\n.\r\n');
          if (fim < 0) return;
          atual.dados = Buffer.from(buffer.slice(0, fim), 'binary').toString('utf8');
          buffer = buffer.slice(fim + 5);
          registro.mensagens.push(atual);
          atual = null; emDados = false;
          responder('250 2.0.0 recebido');
          continue;
        }
        const quebra = buffer.indexOf('\r\n');
        if (quebra < 0) return;
        const linha = buffer.slice(0, quebra);
        buffer = buffer.slice(quebra + 2);
        const comando = linha.toUpperCase();
        if (comando.startsWith('EHLO') || comando.startsWith('HELO')) {
          socket.write('250-smtp-falso\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
        } else if (comando.startsWith('AUTH PLAIN')) {
          const [, usuario, senha] = Buffer.from(linha.split(' ')[2], 'base64').toString('utf8').split('\0');
          registro.autenticacoes.push({ usuario, senha });
          if (aceitarSenha(usuario, senha)) responder('235 2.7.0 autenticado');
          else responder('535 5.7.8 credenciais recusadas');
        } else if (comando.startsWith('MAIL FROM')) {
          atual = { de: linha.slice(10).replace(/[<>]/g, '').split(' ')[0], para: [], dados: '' };
          responder('250 ok');
        } else if (comando.startsWith('RCPT TO')) {
          atual.para.push(linha.slice(8).replace(/[<>]/g, '').split(' ')[0]);
          responder('250 ok');
        } else if (comando === 'DATA') {
          emDados = true; responder('354 pode mandar');
        } else if (comando === 'RSET' || comando === 'NOOP') {
          responder('250 ok');
        } else if (comando === 'QUIT') {
          responder('221 tchau'); socket.end();
        } else {
          responder('502 comando nao suportado');
        }
      }
    });
  });
  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => resolver({
      porta: servidor.address().port,
      registro,
      parar: () => new Promise((fim) => { servidor.close(() => fim()); servidor.closeAllConnections?.(); }),
    }));
  });
}

module.exports = { iniciarSmtpFalso };
