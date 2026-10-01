// ============================================================
// RELATÓRIOS — exportar em PDF ou Word: confere TUDO antes de gerar (limites, imagem do gráfico),
// monta o modelo do documento e entrega o arquivo em memória. Nada é guardado no servidor.
// ============================================================
const L = require('../limites');
const { ErroRelatorio } = require('../erros');
const { contar } = require('../executor');
const { executarAgrupado } = require('../executorAgrupado');
const { receitaDoDetalhe, temAgrupamento } = require('../parametros');
const { montarDocumento } = require('./documento');
const { lerImagemDoGrafico } = require('./png');
const { gerarPdf } = require('./pdf');
const { gerarDocx } = require('./word');

const FORMATOS = {
  pdf: { tipo: 'application/pdf', extensao: 'pdf', gerar: gerarPdf },
  docx: { tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensao: 'docx', gerar: gerarDocx },
};

function recusarExcesso(linhas, o_que) {
  throw new ErroRelatorio(
    `${o_que} tem ${linhas.toLocaleString('pt-BR')} linhas e o máximo para PDF/Word é ${L.LIMITE_DOCUMENTO.toLocaleString('pt-BR')}. `
    + `Use o Excel (até ${L.LIMITE_EXCEL.toLocaleString('pt-BR')} linhas) ou refine os filtros.`, 413);
}

async function exportarDocumento({ formato, assunto, receita, ctx, nomeRelatorio, incluirDetalhes, grafico }) {
  const f = FORMATOS[formato];
  let resultado = null; let detalhes = null; let total = 0; let imagem = null;

  if (temAgrupamento(receita)) {
    resultado = await executarAgrupado(assunto, receita, ctx);
    if (resultado.linhas.length > L.LIMITE_DOCUMENTO) recusarExcesso(resultado.linhas.length, 'O resumo deste relatório');
    if (incluirDetalhes === true) {
      const receitaItens = receitaDoDetalhe(receita, []);
      const totalItens = await contar(assunto, receitaItens, ctx);
      if (totalItens > L.LIMITE_DOCUMENTO) recusarExcesso(totalItens, 'A lista de itens deste relatório');
      detalhes = { receita: receitaItens, total: totalItens };
    }
    if (grafico !== undefined && grafico !== null) imagem = lerImagemDoGrafico(grafico);   // só faz sentido com agrupamento
  } else {
    total = await contar(assunto, receita, ctx);
    if (total > L.LIMITE_DOCUMENTO) recusarExcesso(total, 'Este relatório');
  }

  const modelo = await montarDocumento({ assunto, receita, ctx, nomeRelatorio, resultado, detalhes, total, grafico: imagem });
  try {
    return { buffer: await f.gerar(modelo), tipo: f.tipo, extensao: f.extensao };
  } catch (err) {
    if (!modelo.grafico) throw err;
    console.error('Erro ao gerar documento com gráfico; tentando sem a imagem:', err);   // uma imagem estranha não pode derrubar o relatório
    return { buffer: await f.gerar({ ...modelo, grafico: null }), tipo: f.tipo, extensao: f.extensao };
  }
}

module.exports = { exportarDocumento, FORMATOS };
