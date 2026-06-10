// ============================================================
// SERVIÇO DE PDF — Geração de documentos e comunicados em PDF
// Usa PDFKit para gerar arquivos em memória (não salva no disco)
// ============================================================

const PDFDocument = require('pdfkit');

// Substitui variáveis {{nome_variavel}} no texto do modelo pelos valores reais
function substituirVariaveis(texto, variaveis) {
  if (!texto) return '';
  let resultado = texto;
  for (const [chave, valor] of Object.entries(variaveis)) {
    // Substitui todas as ocorrências da variável
    resultado = resultado.replace(new RegExp(`{{${chave}}}`, 'g'), valor || '');
  }
  return resultado;
}

// Gera um PDF a partir de um modelo de texto e variáveis
// Retorna um Buffer com o conteúdo do PDF
function gerarPDF(conteudo, titulo = 'Documento') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    // Coleta os chunks do PDF na memória
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Configuração da fonte e tamanho
    doc.font('Helvetica');

    // Título do documento
    doc.fontSize(14).font('Helvetica-Bold').text(titulo, { align: 'center' });
    doc.moveDown();

    // Conteúdo do documento
    doc.fontSize(11).font('Helvetica').text(conteudo, {
      align: 'justify',
      lineGap: 4,
    });

    doc.end();
  });
}

// Gera um comunicado de audiência em PDF
async function gerarComunicadoAudiencia(dadosAudiencia, dadosCliente, dadosEscritorio, modeloTexto) {
  const variaveis = {
    nome_cliente:        dadosCliente.nome,
    cpf_cliente:         dadosCliente.cpf || '',
    numero_processo:     dadosAudiencia.numero_processo || '',
    data_audiencia:      new Date(dadosAudiencia.data).toLocaleDateString('pt-BR'),
    hora_audiencia:      dadosAudiencia.hora,
    local_audiencia:     dadosAudiencia.local || '',
    tipo_audiencia:      dadosAudiencia.tipo_nome || '',
    nome_escritorio:     dadosEscritorio.nome,
    data_hoje:           new Date().toLocaleDateString('pt-BR'),
  };

  const conteudo = substituirVariaveis(modeloTexto, variaveis);
  return gerarPDF(conteudo, 'Comunicado de Audiência');
}

// Gera recibo financeiro em PDF
async function gerarReciboFinanceiro(dadosPasta, dadosCliente, lancamentos, dadosEscritorio) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));

  const pdfBuffer = await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabeçalho do escritório
    doc.fontSize(14).font('Helvetica-Bold')
      .text(dadosEscritorio.nome, { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text(`CNPJ/CPF: ${dadosEscritorio.cnpj_cpf || ''}`, { align: 'center' });
    doc.moveDown();

    // Título
    doc.fontSize(12).font('Helvetica-Bold')
      .text('DEMONSTRATIVO FINANCEIRO', { align: 'center' });
    doc.moveDown();

    // Dados do cliente e pasta
    doc.fontSize(10).font('Helvetica');
    doc.text(`Cliente: ${dadosCliente.nome}`);
    doc.text(`Pasta Nº: ${String(dadosPasta.numero).padStart(4, '0')} — ${dadosPasta.titulo}`);
    doc.moveDown();

    // Tabela de lançamentos
    doc.font('Helvetica-Bold').text('Data', 50, doc.y, { continued: true, width: 80 });
    doc.text('Descrição', 130, doc.y, { continued: true, width: 200 });
    doc.text('Tipo', 330, doc.y, { continued: true, width: 70 });
    doc.text('Valor', 400, doc.y, { align: 'right' });
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    let saldo = 0;
    doc.font('Helvetica');
    lancamentos.forEach(l => {
      const valor = parseFloat(l.valor);
      if (l.tipo === 'credito') saldo += valor;
      else saldo -= valor;

      doc.text(new Date(l.data).toLocaleDateString('pt-BR'), 50, doc.y, { continued: true, width: 80 });
      doc.text(l.descricao, 130, doc.y, { continued: true, width: 200 });
      doc.text(l.tipo === 'credito' ? 'Crédito' : 'Débito', 330, doc.y, { continued: true, width: 70 });
      doc.text(`R$ ${valor.toFixed(2).replace('.', ',')}`, 400, doc.y, { align: 'right' });
    });

    // Saldo final
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.font('Helvetica-Bold')
      .text(`Saldo: R$ ${saldo.toFixed(2).replace('.', ',')}`, { align: 'right' });

    doc.end();
  });

  return pdfBuffer;
}

module.exports = { gerarPDF, substituirVariaveis, gerarComunicadoAudiencia, gerarReciboFinanceiro };
