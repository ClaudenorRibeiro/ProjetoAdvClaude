// ============================================================
// RELATÓRIOS — EXPORTADOR Excel (.xlsx), em fluxo (streaming).
// Escreve direto na resposta, em lotes: nada é guardado no servidor e a memória fica sob controle.
// Aba 1 = os dados (cabeçalho fixo, filtro automático, datas e números de verdade).
// Aba 2 = "Informações" (quem gerou, quando, filtros usados).
// ============================================================
const ExcelJS = require('exceljs');
const L = require('../limites');
const { lerLinhas, descreverColunas } = require('../executor');
const { descreverFiltros } = require('../descricao');

const FORMATO_DATA = 'dd/mm/yyyy';
const FORMATO_DATAHORA = 'dd/mm/yyyy hh:mm';

function nomeAba(nome) { return (String(nome || 'Relatório').replace(/[\\/?*[\]:]/g, ' ').trim() || 'Relatório').slice(0, 31); }

// 'YYYY-MM-DD[ HH:MM:SS]' -> Date em UTC com os MESMOS números (sem deslocar por fuso)
function paraData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(texto));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : texto;
}

function converterCelula(coluna, v) {
  if (v === null || v === undefined) return null;
  if (coluna.tipo === 'data' || coluna.tipo === 'datahora') return paraData(v);
  if (coluna.tipo === 'booleano') return v ? 'Sim' : 'Não';
  return v;
}

function larguraDaColuna(coluna) {
  if (coluna.tipo === 'data') return 13;
  if (coluna.tipo === 'datahora') return 18;
  if (coluna.tipo === 'booleano' || coluna.tipo === 'numero') return 12;
  if (coluna.formato === 'processo') return 30;
  if (coluna.formato === 'pasta') return 9;
  return 28;
}

function formatoNumerico(coluna) {
  return coluna.tipo === 'data' ? FORMATO_DATA : coluna.tipo === 'datahora' ? FORMATO_DATAHORA : null;
}

function criarLivro(res) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  wb.creator = 'Sistema de Advocacia';
  return wb;
}

function estilizarCabecalho(linha) {
  linha.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  linha.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  linha.alignment = { vertical: 'middle' };
}

// Aba com as linhas de dados (uma por registro), lidas do banco em lotes
async function escreverAbaDados(wb, { assunto, receita, ctx, nome, total }) {
  const colunas = descreverColunas(assunto, receita);
  const ws = wb.addWorksheet(nomeAba(nome), { views: [{ state: 'frozen', ySplit: 1 }] });
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = larguraDaColuna(c);
    const fmt = formatoNumerico(c);
    if (fmt) col.numFmt = fmt;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  const cab = ws.addRow(colunas.map(c => c.rotulo));
  estilizarCabecalho(cab);
  cab.commit();

  for (let offset = 0; offset < total; offset += L.LOTE_EXPORTACAO) {
    const linhas = await lerLinhas(assunto, receita, ctx, { limite: L.LOTE_EXPORTACAO, offset });
    if (!linhas.length) break;
    for (const linha of linhas) ws.addRow(colunas.map(c => converterCelula(c, linha[c.chave]))).commit();
  }
  ws.commit();
}

// Aba "Informações": quem gerou, quando, quantas linhas, filtros (e o que mais o chamador acrescentar)
async function escreverAbaInformacoes(wb, { assunto, receita, ctx, nomeRelatorio, linhasInfo }) {
  const info = wb.addWorksheet('Informações');
  info.getColumn(1).width = 22; info.getColumn(2).width = 90;
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const filtros = await descreverFiltros(assunto, receita, ctx);
  [['Relatório', nomeRelatorio || '(sem nome)'], ['Assunto', assunto.rotulo], ['Gerado em', agora],
   ['Gerado por', ctx.usuario.nome || ''], ...linhasInfo, ['Filtros', filtros.join('\n')]]
    .forEach(([k, v]) => {
      const r = info.addRow([k, v]);
      r.getCell(1).font = { bold: true };
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      r.commit();
    });
  info.commit();
}

async function exportarXlsx({ res, assunto, receita, ctx, nomeRelatorio, total }) {
  const wb = criarLivro(res);
  await escreverAbaDados(wb, { assunto, receita, ctx, nome: nomeRelatorio, total });
  await escreverAbaInformacoes(wb, { assunto, receita, ctx, nomeRelatorio, linhasInfo: [['Total de linhas', total]] });
  await wb.commit();
}

module.exports = { exportarXlsx, criarLivro, escreverAbaDados, escreverAbaInformacoes, estilizarCabecalho, nomeAba, paraData };
