// ============================================================
// GRÁFICOS — baixar o gráfico como imagem PNG (feito no navegador; nada vai para o servidor).
// A imagem leva título, o gráfico e a legenda (a legenda do tela é HTML, então é redesenhada aqui).
// ============================================================
const FONTE = 'Arial, Helvetica, sans-serif';
const MARGEM = 16;

export const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Monta o SVG final (título + gráfico + legenda). Função pura: testável sem navegador.
export function montarSvgImagem({ svgTexto, largura, altura, titulo, subtitulo, legenda = [] }) {
  const W = largura + MARGEM * 2;
  const topo = subtitulo ? 62 : 44;
  let x = MARGEM; let y = topo + altura + 14; let linhas = 0;
  const itens = legenda.map((it) => {
    const w = 18 + String(it.rotulo).length * 6.6 + 18;
    if (x + w > W - MARGEM && x > MARGEM) { x = MARGEM; y += 20; linhas += 1; }
    const marca = `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${esc(it.cor)}"/>`;
    const rotulo = `<text x="${x + 16}" y="${y}" font-family="${FONTE}" font-size="12" fill="#0b0b0b">${esc(it.rotulo)}</text>`;
    x += w;
    return marca + rotulo;
  });
  const H = topo + altura + (legenda.length ? 14 + (linhas + 1) * 20 : 0) + MARGEM;
  const texto = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#ffffff"/>`
    + `<text x="${MARGEM}" y="26" font-family="${FONTE}" font-size="16" font-weight="700" fill="#0b0b0b">${esc(titulo)}</text>`
    + (subtitulo ? `<text x="${MARGEM}" y="46" font-family="${FONTE}" font-size="12" fill="#52514e">${esc(subtitulo)}</text>` : '')
    + `<g transform="translate(${MARGEM} ${topo})">${svgTexto}</g>${itens.join('')}</svg>`;
  return { texto, largura: W, altura: H };
}

const nomeSeguro = (t) => String(t || 'grafico').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'grafico';

// Desenha o SVG num canvas (2× para ficar nítido) e baixa o PNG
export async function baixarPng(imagem, nomeBase) {
  const url = URL.createObjectURL(new Blob([imagem.texto], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((ok, falha) => { img.onload = ok; img.onerror = () => falha(new Error('Não foi possível gerar a imagem')); img.src = url; });
    const escala = 2;
    const canvas = document.createElement('canvas');
    canvas.width = imagem.largura * escala; canvas.height = imagem.altura * escala;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('Não foi possível gerar a imagem');
    const link = document.createElement('a');
    const data = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob); link.download = `${nomeSeguro(nomeBase)} - ${data}.png`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally { URL.revokeObjectURL(url); }
}

// Efeitos de "passar o mouse" (faixa cinza, linha vertical) NÃO vão para a imagem: marcados com data-efeito
export function serializarSvg(svgEl) {
  const copia = svgEl.cloneNode(true);
  copia.querySelectorAll('[data-efeito]').forEach(n => n.remove());
  return new XMLSerializer().serializeToString(copia);
}
