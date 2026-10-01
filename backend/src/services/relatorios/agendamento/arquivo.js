// ============================================================
// RELATÓRIOS AGENDADOS — gera o arquivo em memória (PDF, Word ou Excel) para anexar ao e-mail.
// Mesmos limites e mesmos exportadores da tela: nada é guardado no servidor.
// ============================================================
const { Writable } = require('stream');
const L = require('../limites');
const { ErroRelatorio } = require('../erros');
const { contar } = require('../executor');
const { executarAgrupado } = require('../executorAgrupado');
const { temAgrupamento } = require('../parametros');
const { exportarXlsx } = require('../exportadores/xlsx');
const { exportarXlsxAgrupado } = require('../exportadores/xlsxAgrupado');
const { exportarDocumento } = require('../exportadores/exportarDocumento');

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function coletor() {
  const partes = [];
  const fluxo = new Writable({ write(chunk, _enc, cb) { partes.push(Buffer.from(chunk)); cb(); } });
  return { fluxo, buffer: () => Buffer.concat(partes) };
}

async function gerarXlsx({ assunto, receita, ctx, nomeRelatorio }) {
  const { fluxo, buffer } = coletor();
  if (temAgrupamento(receita)) {
    const resultado = await executarAgrupado(assunto, receita, ctx);
    await exportarXlsxAgrupado({ res: fluxo, assunto, receita, ctx, nomeRelatorio, resultado, detalhes: null });
  } else {
    const total = await contar(assunto, receita, ctx);
    if (total > L.LIMITE_EXCEL) throw new ErroRelatorio(`O relatório tem ${total} linhas e o máximo para Excel é ${L.LIMITE_EXCEL}.`, 413);
    await exportarXlsx({ res: fluxo, assunto, receita, ctx, nomeRelatorio, total });
  }
  await new Promise(ok => (fluxo.writableFinished ? ok() : fluxo.once('finish', ok)));
  return { buffer: buffer(), tipo: TIPO_XLSX, extensao: 'xlsx' };
}

async function gerarArquivo({ formato, assunto, receita, ctx, nomeRelatorio }) {
  if (formato === 'xlsx') return gerarXlsx({ assunto, receita, ctx, nomeRelatorio });
  return exportarDocumento({ formato, assunto, receita, ctx, nomeRelatorio, incluirDetalhes: false });
}

module.exports = { gerarArquivo };
