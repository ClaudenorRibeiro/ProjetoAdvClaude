// ============================================================
// RELATÓRIOS — valida a imagem PNG do gráfico que a tela envia para entrar no PDF/Word.
// Nada é confiado: só PNG de verdade (assinatura + cabeçalho + fim), com tamanho e dimensões limitados.
// A imagem nunca é guardada: vai do pedido direto para o documento e é descartada.
// ============================================================
const L = require('../limites');
const { ErroRelatorio } = require('../erros');

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIM = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

// Lê e confere um PNG em Buffer. Devolve { buffer, largura, altura } ou null se não for um PNG íntegro.
function lerPng(buffer, { maxBytes = L.IMAGEM_MAX_BYTES, maxLado = L.IMAGEM_MAX_LADO } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 45 || buffer.length > maxBytes) return null;
  if (!buffer.subarray(0, 8).equals(ASSINATURA)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR' || buffer.readUInt32BE(8) !== 13) return null;
  if (!buffer.subarray(buffer.length - 12).equals(FIM)) return null;
  const largura = buffer.readUInt32BE(16);
  const altura = buffer.readUInt32BE(20);
  if (largura < 50 || altura < 50 || largura > maxLado || altura > maxLado) return null;
  return { buffer, largura, altura };
}

// Recebe o texto "data:image/png;base64,...." enviado pela tela
function lerImagemDoGrafico(dataUrl) {
  const invalida = () => new ErroRelatorio('A imagem do gráfico é inválida. Gere o gráfico de novo e tente exportar outra vez.', 422);
  if (typeof dataUrl !== 'string') throw invalida();
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m || m[1].length > Math.ceil(L.IMAGEM_MAX_BYTES * 4 / 3) + 8) throw invalida();
  const png = lerPng(Buffer.from(m[1], 'base64'));
  if (!png) throw invalida();
  return png;
}

module.exports = { lerPng, lerImagemDoGrafico };
