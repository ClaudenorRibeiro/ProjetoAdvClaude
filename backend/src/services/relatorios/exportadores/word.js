// ============================================================
// RELATÓRIOS — gerador de Word (.docx), pela biblioteca "docx". Desenha o MODELO do documento (documento.js).
// Papel A4 (paisagem se houver mais de 5 colunas); tabela editável com cabeçalho repetido a cada página;
// rodapé "Página X de Y". Unicode completo (acentos e símbolos).
// ============================================================
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, ShadingType,
  PageOrientation, Footer, PageNumber, BorderStyle, TableLayoutType, TabStopType,
} = require('docx');

const FUNDOS = { subtotal: 'E5E7EB', total: 'DBEAFE' };
const ALINHA = { esq: AlignmentType.LEFT, dir: AlignmentType.RIGHT, centro: AlignmentType.CENTER };
const sem = (hex) => String(hex || '#1F3864').replace('#', '').toUpperCase();

// Caracteres de controle quebram o XML do Word: saem antes de escrever
const limpo = (t) => String(t ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ' ');
const run = (texto, opcoes = {}) => new TextRun({ text: limpo(texto), font: 'Calibri', ...opcoes });

function cabecalho(m) {
  const corpo = [];
  const { nome, logo, cor } = m.escritorio;
  if (logo) {
    const escala = Math.min(150 / logo.largura, 52 / logo.altura, 1);
    corpo.push(new Paragraph({ spacing: { after: 60 }, children: [new ImageRun({ data: logo.buffer, transformation: { width: Math.round(logo.largura * escala), height: Math.round(logo.altura * escala) } })] }));
  }
  if (nome) corpo.push(new Paragraph({ spacing: { after: 40 }, children: [run(nome, { bold: true, size: 20, color: sem(cor) })] }));
  corpo.push(new Paragraph({
    spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: sem(cor), space: 4 } },
    children: [run(m.titulo, { bold: true, size: 34 })],
  }));
  return corpo;
}

function blocoInfo(m) {
  const linhas = m.info.map(([k, v]) => new Paragraph({ spacing: { after: 20 }, children: [run(`${k}: `, { bold: true, size: 18, color: '52514E' }), run(v, { size: 18 })] }));
  m.filtros.forEach((f, i) => {
    const recuo = (f.length - f.trimStart().length) * 100;
    linhas.push(new Paragraph({ spacing: { after: 20 }, indent: { left: recuo }, children: i === 0
      ? [run('Filtros: ', { bold: true, size: 18, color: '52514E' }), run(f.trim(), { size: 18 })] : [run(f.trim(), { size: 18 })] }));
  });
  return [...linhas, new Paragraph({ spacing: { after: 120 }, children: [] })];
}

function imagemDoGrafico(grafico, larguraMaxPx) {
  const escala = Math.min(larguraMaxPx / grafico.largura, 380 / grafico.altura);
  return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new ImageRun({
    data: grafico.buffer, transformation: { width: Math.round(grafico.largura * escala), height: Math.round(grafico.altura * escala) },
    altText: { title: 'Gráfico do relatório', description: 'Gráfico do relatório', name: 'grafico' },
  })] })];
}

function tabela(secao, cor, larguraTotal) {
  const soma = secao.colunas.reduce((a, c) => a + c.peso, 0);
  const larguras = secao.colunas.map(c => Math.floor((c.peso / soma) * larguraTotal));
  const tamanho = secao.colunas.length > 8 ? 14 : (secao.colunas.length > 5 ? 16 : 18);
  const celula = (texto, i, { negrito = false, fundo = null, cor: corTexto = '0B0B0B', alinhar = 'esq' } = {}) => new TableCell({
    width: { size: larguras[i], type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: fundo ? { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } : undefined,
    borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E1E0D9' } },
    children: [new Paragraph({ alignment: ALINHA[alinhar], children: [run(texto, { bold: negrito, size: tamanho, color: corTexto })] })],
  });
  const cab = new TableRow({ tableHeader: true, cantSplit: true, children: secao.colunas.map((c, i) => celula(c.rotulo, i, { negrito: true, fundo: sem(cor), cor: 'FFFFFF', alinhar: c.alinhar })) });
  const corpo = secao.linhas.map((l, n) => new TableRow({ cantSplit: true, children: l.celulas.map((t, i) => celula(t, i, {
    negrito: l.estilo !== 'normal', alinhar: secao.colunas[i].alinhar, fundo: FUNDOS[l.estilo] || (n % 2 ? 'F3F4F6' : null),
  })) }));
  return [
    new Paragraph({ spacing: { before: 120, after: 80 }, keepNext: true, children: [run(secao.titulo, { bold: true, size: 24 })] }),
    ...(secao.linhas.length
      ? [new Table({ width: { size: larguraTotal, type: WidthType.DXA }, columnWidths: larguras, layout: TableLayoutType.FIXED, rows: [cab, ...corpo] })]
      : [new Paragraph({ children: [run('Nenhum registro encontrado com esses filtros.', { size: 18, color: '52514E' })] })]),
  ];
}

async function gerarDocx(modelo) {
  const paisagem = modelo.paisagem;
  const MARGEM = 720;                                              // 0,5 polegada
  const larguraTotal = (paisagem ? 16838 : 11906) - 2 * MARGEM;     // A4 em twips
  const rodape = new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: larguraTotal }],
    children: [run(`${modelo.titulo}  ·  Gerado por ${modelo.geradoPor} em ${modelo.geradoEm}`, { size: 15, color: '6B7280' }),
      // cada campo de página em seu próprio trecho, para herdar o tamanho e a cor do rodapé
      ...[['\tPágina '], [PageNumber.CURRENT], [' de '], [PageNumber.TOTAL_PAGES]].map(c => new TextRun({ font: 'Calibri', size: 15, color: '6B7280', children: c }))],
  })] });
  const filhos = [
    ...cabecalho(modelo), ...blocoInfo(modelo),
    ...(modelo.grafico ? imagemDoGrafico(modelo.grafico, Math.floor(larguraTotal / 15)) : []),   // twips -> pixels (96 dpi)
    ...modelo.secoes.flatMap(s => tabela(s, modelo.escritorio.cor, larguraTotal)),
  ];
  const doc = new Document({
    creator: 'Sistema de Advocacia', title: limpo(modelo.titulo),
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: { page: { size: { orientation: paisagem ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } } },
      footers: { default: rodape }, children: filhos,
    }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { gerarDocx };
