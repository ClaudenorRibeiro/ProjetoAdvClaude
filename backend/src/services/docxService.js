// ============================================================
// SERVIÇO DE WORD (.docx) — Geração de documentos editáveis
// Usa a biblioteca 'docx' para gerar arquivos Word em memória
// ============================================================

const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = require('docx');
const { substituirVariaveis } = require('./pdfService');

// Gera um documento Word (.docx) a partir de um modelo de texto
// conteudo: texto com variáveis já substituídas
// titulo: título do documento
// Retorna um Buffer com o conteúdo do arquivo
async function gerarDocx(conteudo, titulo = 'Documento') {
  // Divide o texto em parágrafos
  const paragrafos = conteudo.split('\n').map(linha =>
    new Paragraph({
      children: [new TextRun({ text: linha, size: 24, font: 'Times New Roman' })],
      spacing: { after: 200 },
      alignment: AlignmentType.JUSTIFIED,
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } // Margens ABNT
        }
      },
      children: [
        // Título do documento
        new Paragraph({
          children: [new TextRun({ text: titulo, bold: true, size: 28, font: 'Times New Roman' })],
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        // Conteúdo
        ...paragrafos,
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// Gera documento a partir de modelo com variáveis
async function gerarDocumentoDoModelo(modeloTexto, variaveis, titulo) {
  const conteudo = substituirVariaveis(modeloTexto, variaveis);
  return gerarDocx(conteudo, titulo);
}

module.exports = { gerarDocx, gerarDocumentoDoModelo };
