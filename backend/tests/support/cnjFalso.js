// CNJ/DataJud FALSO local para os testes do aviso diário de andamentos: guarda cada pedido recebido e responde com o que o
// teste cadastrou. Nenhum teste fala com o CNJ de verdade.
const http = require('node:http');

// Número CNJ de 20 dígitos só com algarismos: sequencial + dígito + ano + J (segmento) + TR (tribunal) + origem.
const numeroCnj = (n, j = '8', tr = '26') => `${String(n).padStart(7, '0')}00${'2026'}${j}${tr}0100`;
// O mesmo número com a máscara que o sistema grava: NNNNNNN-DD.AAAA.J.TR.OOOO
const comMascara = (d) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const movimento = (codigo, nome, dia, hora = '14:30:00') => ({ codigo, nome, dataHora: `${dia}T${hora}.000Z` });

async function iniciarCnjFalso() {
  const estado = {
    chamadas: [],
    processos: new Map(),   // numero (20 dígitos) -> { movimentos, atualizado }
    status: () => 200,      // (chamada) => código HTTP
    grandeSeMaisDe: null,   // número de processos acima do qual a resposta passa do limite de tamanho
  };
  const servidor = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => {
      const corpo = JSON.parse(Buffer.concat(partes).toString() || '{}');
      // lote (terms) ou consulta de um processo só (match, o botão "Atualizar DataJud")
      const numeros = (corpo.query && corpo.query.terms && corpo.query.terms.numeroProcesso)
        || (corpo.query && corpo.query.match && [corpo.query.match.numeroProcesso]) || [];
      const chamada = { alias: req.url.split('/')[1], numeros, auth: req.headers.authorization };
      estado.chamadas.push(chamada);
      const codigo = estado.status(chamada);
      res.setHeader('Content-Type', 'application/json');
      if (codigo !== 200) { res.statusCode = codigo; res.end('{}'); return; }
      if (estado.grandeSeMaisDe !== null && numeros.length > estado.grandeSeMaisDe) {
        res.end(JSON.stringify({ hits: { hits: [{ _source: { numeroProcesso: numeros[0], movimentos: [{ nome: 'x'.repeat(6 * 1024 * 1024) }] } }] } }));
        return;
      }
      const hits = numeros.filter((n) => estado.processos.has(n)).map((n) => ({
        _source: { numeroProcesso: n, movimentos: estado.processos.get(n).movimentos, dataHoraUltimaAtualizacao: estado.processos.get(n).atualizado },
      }));
      res.end(JSON.stringify({ hits: { hits } }));
    });
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  return {
    estado,
    url: `http://127.0.0.1:${servidor.address().port}`,
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}

// Esperas que não esperam: guarda os tempos pedidos.
function esperaFalsa() {
  const f = async (ms) => { f.pedidos.push(ms); };
  f.pedidos = [];
  return f;
}

module.exports = { iniciarCnjFalso, numeroCnj, comMascara, diasAtras, movimento, esperaFalsa };
