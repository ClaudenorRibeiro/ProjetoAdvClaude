// ============================================================
// RELATÓRIOS — EXPORTADOR Excel do resultado AGRUPADO.
// Aba "Resumo" (grupos, subtotais em destaque e total geral), aba "Detalhes" opcional
// (todas as linhas do relatório) e aba "Informações". Em fluxo: nada fica guardado.
// ============================================================
const { criarLivro, escreverAbaDados, escreverAbaInformacoes, estilizarCabecalho, paraData } = require('./xlsx');
const { descreverAgrupamento } = require('../descricao');

const CINZA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const AZUL_CLARO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

function formatoDaMetrica(m) {
  if (m.formato === 'moeda') return '"R$" #,##0.00';
  if (m.tipo === 'data') return 'dd/mm/yyyy';
  if (m.tipo === 'datahora') return 'dd/mm/yyyy hh:mm';
  return m.funcao === 'media' ? '#,##0.00' : '#,##0';
}

function valorDaCelula(m, v) {
  if (v === null || v === undefined) return null;
  return (m.tipo === 'data' || m.tipo === 'datahora') ? paraData(v) : v;
}

async function escreverAbaResumo(wb, resultado) {
  const { grupos, metricas } = resultado.colunas;
  const ws = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 1 }] });
  grupos.forEach((_, i) => { ws.getColumn(i + 1).width = 32; });
  metricas.forEach((m, i) => { const c = ws.getColumn(grupos.length + i + 1); c.width = 20; c.numFmt = formatoDaMetrica(m); });
  const cab = ws.addRow([...grupos.map(g => g.rotulo), ...metricas.map(m => m.rotulo)]);
  estilizarCabecalho(cab);
  cab.commit();

  for (const linha of resultado.linhas) {
    const rotulos = grupos.map((_, i) => linha.rotulos[i] ?? '');
    if (linha.tipo === 'subtotal') { rotulos[0] = linha.rotulos[0]; rotulos[1] = `Subtotal de ${linha.rotulos[0]}`; }
    if (linha.tipo === 'total') rotulos[0] = 'TOTAL GERAL';
    const r = ws.addRow([...rotulos, ...metricas.map((m, i) => valorDaCelula(m, linha.valores[i]))]);
    if (linha.tipo !== 'grupo') { r.font = { bold: true }; r.fill = linha.tipo === 'total' ? AZUL_CLARO : CINZA; }
    r.commit();
  }
  ws.commit();
}

// detalhes: { receitaDetalhe, total } ou null
async function exportarXlsxAgrupado({ res, assunto, receita, ctx, nomeRelatorio, resultado, detalhes }) {
  const wb = criarLivro(res);
  await escreverAbaResumo(wb, resultado);
  if (detalhes) await escreverAbaDados(wb, { assunto, receita: detalhes.receita, ctx, nome: 'Detalhes', total: detalhes.total });
  const { agrupadoPor, totais } = descreverAgrupamento(assunto, receita);
  await escreverAbaInformacoes(wb, {
    assunto, receita, ctx, nomeRelatorio,
    linhasInfo: [['Agrupado por', agrupadoPor], ['Totais', totais], ['Grupos', resultado.totalGrupos], ['Detalhes na planilha', detalhes ? `Sim (${detalhes.total} linhas)` : 'Não']],
  });
  await wb.commit();
}

module.exports = { exportarXlsxAgrupado };
