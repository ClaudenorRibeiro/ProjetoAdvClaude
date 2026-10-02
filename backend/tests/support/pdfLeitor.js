// Lê um PDF dentro do próprio teste (biblioteca pdfjs-dist, instalada pelo npm).
// Substitui o pdftotext/pdfinfo do Poppler, que obrigava a instalar um programa no PC
// e deixava a conferência do PDF "pulada" quando faltava.
// Devolve o texto de cada página (itens da mesma linha separados por espaço), a contagem
// de páginas e o tamanho (largura x altura em pontos) da primeira página.
async function lerPdf(buffer) {
  // A biblioteca tenta carregar recursos de DESENHO (que não usamos para ler texto) e avisa se faltarem; estes marcadores calam o aviso.
  globalThis.DOMMatrix ??= class {};
  globalThis.Path2D ??= class {};
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, verbosity: 0 }).promise;
  const textos = [];
  let tamanho = null;
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    if (!tamanho) { const [, , largura, altura] = pagina.view; tamanho = { largura: Math.round(largura), altura: Math.round(altura) }; }
    const conteudo = await pagina.getTextContent();
    let texto = '';
    let yAnterior = null;
    for (const item of conteudo.items) {
      const y = item.transform[5];
      if (texto) texto += yAnterior !== null && Math.abs(y - yAnterior) > 2 ? '\n' : ' ';
      texto += item.str;
      yAnterior = y;
    }
    textos.push(texto);
  }
  await doc.destroy();
  return { paginas: doc.numPages, textos, texto: textos.join('\n'), tamanho };
}

module.exports = { lerPdf };
