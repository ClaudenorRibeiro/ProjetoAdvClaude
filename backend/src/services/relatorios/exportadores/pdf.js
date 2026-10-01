// ============================================================
// RELATÓRIOS — gerador de PDF (pdfkit). Desenha o MODELO do documento (documento.js).
// Página A4 (paisagem se houver mais de 5 colunas); tabela com cabeçalho repetido a cada página;
// rodapé "Página X de Y". Fonte padrão do PDF (Helvetica): caracteres fora do alfabeto ocidental viram "?".
// ============================================================
const PDFDocument = require('pdfkit');

const MARGEM = 36;
const RODAPE = 24;
const NORMAL = 'Helvetica';
const NEGRITO = 'Helvetica-Bold';
const WINANSI_EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const FUNDOS = { subtotal: '#E5E7EB', total: '#DBEAFE' };
const ALINHA = { esq: 'left', dir: 'right', centro: 'center' };

// Helvetica do PDF só tem o alfabeto ocidental (WinAnsi): o resto vira "?" em vez de lixo
function seguro(texto) {
  let saida = '';
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0);
    saida += (c >= 32 && c < 256) || WINANSI_EXTRAS.has(ch) ? ch : (c === 0x2212 ? '-' : (c < 32 ? ' ' : '?'));
  }
  return saida;
}

const larguraUtil = (pdf) => pdf.page.width - 2 * MARGEM;
const limiteInferior = (pdf) => pdf.page.height - pdf.page.margins.bottom;

function cabecalho(pdf, m) {
  let y = MARGEM;
  const { nome, logo, cor } = m.escritorio;
  if (logo) pdf.image(logo.buffer, MARGEM, y, { fit: [110, 40] });
  const xTexto = MARGEM + (logo ? 120 : 0);
  if (nome) { pdf.font(NEGRITO).fontSize(10).fillColor(cor).text(seguro(nome), xTexto, y + 2, { width: larguraUtil(pdf) - (xTexto - MARGEM) }); }
  y = Math.max(logo ? y + 46 : y, nome ? pdf.y + 4 : y);
  pdf.font(NEGRITO).fontSize(17).fillColor('#0b0b0b').text(seguro(m.titulo), MARGEM, y, { width: larguraUtil(pdf) });
  y = pdf.y + 4;
  pdf.moveTo(MARGEM, y).lineTo(MARGEM + larguraUtil(pdf), y).lineWidth(1.5).strokeColor(cor).stroke();
  return y + 8;
}

// Linhas "Rótulo: valor" (quem gerou, quando, filtros...)
function blocoInfo(pdf, m, yInicial) {
  let y = yInicial;
  const larg = larguraUtil(pdf);
  const x2 = MARGEM + 92;
  const linha = (rotulo, valor, recuo = 0) => {
    pdf.font(NORMAL).fontSize(8.5);
    const h = pdf.heightOfString(seguro(valor), { width: larg - 92 - recuo });
    if (y + h > limiteInferior(pdf)) { pdf.addPage(); y = MARGEM; }
    if (rotulo) pdf.font(NEGRITO).fillColor('#52514e').text(`${seguro(rotulo)}:`, MARGEM, y, { width: 88, lineBreak: false });
    pdf.font(NORMAL).fillColor('#0b0b0b').text(seguro(valor), x2 + recuo, y, { width: larg - 92 - recuo });
    y += h + 2;
  };
  m.info.forEach(([k, v]) => linha(k, v));
  m.filtros.forEach((f, i) => linha(i === 0 ? 'Filtros' : '', f.trim(), (f.length - f.trimStart().length) * 4));
  return y + 6;
}

function imagemDoGrafico(pdf, grafico, yInicial) {
  const larg = larguraUtil(pdf);
  const maxAltura = (limiteInferior(pdf) - MARGEM) * 0.55;
  const escala = Math.min(larg / grafico.largura, maxAltura / grafico.altura);
  const w = grafico.largura * escala; const h = grafico.altura * escala;
  let y = yInicial;
  if (y + h > limiteInferior(pdf)) { pdf.addPage(); y = MARGEM; }
  pdf.image(grafico.buffer, MARGEM + (larg - w) / 2, y, { width: w, height: h });
  return y + h + 10;
}

function tabela(pdf, secao, cor, yInicial) {
  let y = yInicial;
  const larg = larguraUtil(pdf);
  const soma = secao.colunas.reduce((a, c) => a + c.peso, 0);
  const larguras = secao.colunas.map(c => (c.peso / soma) * larg);
  const fonte = secao.colunas.length > 8 ? 7 : (secao.colunas.length > 5 ? 8 : 9);
  const PAD = 3;
  const alturaDe = (celulas, negrito) => {
    pdf.font(negrito ? NEGRITO : NORMAL).fontSize(fonte);
    return Math.max(14, ...celulas.map((t, i) => pdf.heightOfString(seguro(t), { width: larguras[i] - 2 * PAD }) + 2 * PAD));
  };
  const cabecalhoTabela = () => {
    const h = alturaDe(secao.colunas.map(c => c.rotulo), true);
    pdf.rect(MARGEM, y, larg, h).fill(cor);
    let x = MARGEM;
    secao.colunas.forEach((c, i) => {
      pdf.font(NEGRITO).fontSize(fonte).fillColor('#ffffff').text(seguro(c.rotulo), x + PAD, y + PAD, { width: larguras[i] - 2 * PAD, align: ALINHA[c.alinhar] });
      x += larguras[i];
    });
    y += h;
  };

  if (y + 40 > limiteInferior(pdf)) { pdf.addPage(); y = MARGEM; }
  pdf.font(NEGRITO).fontSize(11).fillColor('#0b0b0b').text(seguro(secao.titulo), MARGEM, y);
  y = pdf.y + 4;
  if (!secao.linhas.length) { pdf.font(NORMAL).fontSize(9).fillColor('#52514e').text('Nenhum registro encontrado com esses filtros.', MARGEM, y); return pdf.y + 10; }
  cabecalhoTabela();
  secao.linhas.forEach((linha, n) => {
    const negrito = linha.estilo !== 'normal';
    const h = alturaDe(linha.celulas, negrito);
    if (y + h > limiteInferior(pdf)) { pdf.addPage(); y = MARGEM; cabecalhoTabela(); }
    const fundo = FUNDOS[linha.estilo] || (n % 2 ? '#F3F4F6' : null);
    if (fundo) pdf.rect(MARGEM, y, larg, h).fill(fundo);
    let x = MARGEM;
    linha.celulas.forEach((t, i) => {
      pdf.font(negrito ? NEGRITO : NORMAL).fontSize(fonte).fillColor('#0b0b0b')
        .text(seguro(t), x + PAD, y + PAD, { width: larguras[i] - 2 * PAD, align: ALINHA[secao.colunas[i].alinhar] });
      x += larguras[i];
    });
    pdf.moveTo(MARGEM, y + h).lineTo(MARGEM + larg, y + h).lineWidth(0.4).strokeColor('#E1E0D9').stroke();
    y += h;
  });
  return y + 12;
}

function rodape(pdf, m) {
  const { start, count } = pdf.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    pdf.switchToPage(start + i);
    const margemAntes = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;                       // permite escrever na faixa do rodapé sem criar página nova
    const larg = larguraUtil(pdf);
    const y = pdf.page.height - MARGEM - 6;
    pdf.moveTo(MARGEM, y - 6).lineTo(MARGEM + larg, y - 6).lineWidth(0.4).strokeColor('#C3C2B7').stroke();
    pdf.font(NORMAL).fontSize(7.5).fillColor('#6b7280');
    pdf.text(seguro(`${m.titulo}  ·  Gerado por ${m.geradoPor} em ${m.geradoEm}`), MARGEM, y, { width: larg - 90, lineBreak: false, ellipsis: true });
    pdf.text(`Página ${i + 1} de ${count}`, MARGEM + larg - 88, y, { width: 88, align: 'right', lineBreak: false });
    pdf.page.margins.bottom = margemAntes;
  }
}

// comprimir=false só para testes (o texto do PDF fica legível nos bytes)
function gerarPdf(modelo, { comprimir = true } = {}) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4', layout: modelo.paisagem ? 'landscape' : 'portrait', bufferPages: true, compress: comprimir,
      margins: { top: MARGEM, bottom: MARGEM + RODAPE, left: MARGEM, right: MARGEM },
      info: { Title: seguro(modelo.titulo), Author: seguro(modelo.geradoPor), Creator: 'Sistema de Advocacia' },
    });
    const partes = [];
    pdf.on('data', (c) => partes.push(c));
    pdf.on('end', () => resolve(Buffer.concat(partes)));
    pdf.on('error', reject);
    try {
      let y = blocoInfo(pdf, modelo, cabecalho(pdf, modelo));
      if (modelo.grafico) y = imagemDoGrafico(pdf, modelo.grafico, y);
      for (const secao of modelo.secoes) y = tabela(pdf, secao, modelo.escritorio.cor, y);
      rodape(pdf, modelo);
      pdf.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { gerarPdf, seguro };
