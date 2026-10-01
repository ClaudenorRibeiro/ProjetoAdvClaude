// ============================================================
// RELATÓRIOS — MODELO DO DOCUMENTO (neutro): o que vai no PDF e no Word, antes de virar arquivo.
// Cabeçalho do escritório, título, quem gerou, filtros, gráfico (opcional) e as tabelas já em texto.
// PDF e Word só desenham este modelo; as regras de conteúdo ficam aqui, num lugar só.
// ============================================================
const { pool } = require('../../../config/database');
const L = require('../limites');
const { lerLinhas, descreverColunas } = require('../executor');
const { descreverFiltros, descreverAgrupamento } = require('../descricao');
const { textoDaCelula, textoDaMetrica } = require('./formatoTexto');
const { lerPng } = require('./png');

const COR_PADRAO = '#1F3864';

// Largura relativa de cada coluna (a soma é redistribuída pela largura da página)
function pesoDaColuna(c) {
  if (c.formato === 'processo') return 26;
  if (c.formato === 'pasta') return 8;
  if (c.formato === 'moeda') return 15;
  if (c.tipo === 'data') return 11;
  if (c.tipo === 'datahora') return 15;
  if (c.tipo === 'booleano') return 9;
  if (c.tipo === 'numero') return 12;
  if (c.tipo === 'lista') return 18;
  return 28;
}
const alinhamento = (c) => (c.tipo === 'numero' ? 'dir' : (c.tipo === 'booleano' ? 'centro' : 'esq'));

// Nome, logo (só PNG íntegro) e cor do escritório. Qualquer falha cai no padrão: o relatório nunca deixa de sair.
async function dadosDoEscritorio() {
  const padrao = { nome: '', logo: null, cor: COR_PADRAO };
  try {
    const [rows] = await pool.execute('SELECT nome, logo_base64, cor_principal FROM configuracoes_escritorio LIMIT 1');
    if (!rows.length) return padrao;
    const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(rows[0].logo_base64 || ''));
    const logo = m ? lerPng(Buffer.from(m[1], 'base64'), { maxBytes: 1024 * 1024, maxLado: 2000 }) : null;
    const cor = /^#[0-9a-fA-F]{6}$/.test(rows[0].cor_principal || '') ? rows[0].cor_principal : COR_PADRAO;
    return { nome: String(rows[0].nome || ''), logo, cor };
  } catch (err) { return padrao; }
}

async function secaoDeItens(assunto, receita, ctx, total, titulo) {
  const colunas = descreverColunas(assunto, receita);
  const linhas = total ? await lerLinhas(assunto, receita, ctx, { limite: Math.min(total, L.LIMITE_DOCUMENTO), offset: 0 }) : [];
  return {
    titulo,
    colunas: colunas.map(c => ({ rotulo: c.rotulo, alinhar: alinhamento(c), peso: pesoDaColuna(c) })),
    linhas: linhas.map(l => ({ estilo: 'normal', celulas: colunas.map(c => textoDaCelula(c, l[c.chave])) })),
  };
}

function secaoDeResumo(resultado) {
  const { grupos, metricas } = resultado.colunas;
  const colunas = [
    ...grupos.map(g => ({ rotulo: g.rotulo, alinhar: 'esq', peso: 24 })),
    ...metricas.map(m => ({ rotulo: m.rotulo, alinhar: 'dir', peso: m.formato === 'moeda' ? 17 : 14 })),
  ];
  const linhas = resultado.linhas.map(l => {
    const rotulos = grupos.map((_, i) => l.rotulos[i] ?? '');
    if (l.tipo === 'subtotal') { rotulos[0] = l.rotulos[0]; if (grupos.length > 1) rotulos[1] = `Subtotal de ${l.rotulos[0]}`; }
    if (l.tipo === 'total') rotulos[0] = 'TOTAL GERAL';
    return { estilo: l.tipo === 'grupo' ? 'normal' : l.tipo, celulas: [...rotulos, ...metricas.map((m, i) => textoDaMetrica(m, l.valores[i]))] };
  });
  return { titulo: 'Resumo', colunas, linhas };
}

// resultado: saída do executarAgrupado (ou null); detalhes: { receita, total } ou null; total: nº de linhas (lista simples)
async function montarDocumento({ assunto, receita, ctx, nomeRelatorio, resultado, detalhes, total, grafico }) {
  const escritorio = await dadosDoEscritorio();
  const agrupado = !!resultado;
  const secoes = [];
  if (agrupado) {
    secoes.push(secaoDeResumo(resultado));
    if (detalhes) secoes.push(await secaoDeItens(assunto, detalhes.receita, ctx, detalhes.total, 'Itens'));
  } else {
    secoes.push(await secaoDeItens(assunto, receita, ctx, total, 'Resultado'));
  }
  const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const info = [['Assunto', assunto.rotulo], ['Gerado em', geradoEm], ['Gerado por', ctx.usuario.nome || '']];
  if (agrupado) {
    const { agrupadoPor, totais } = descreverAgrupamento(assunto, receita);
    info.push(['Agrupado por', agrupadoPor], ['Totais', totais], ['Grupos', resultado.totalGrupos.toLocaleString('pt-BR')]);
    if (detalhes) info.push(['Itens listados', detalhes.total.toLocaleString('pt-BR')]);
  } else {
    info.push(['Total de linhas', total.toLocaleString('pt-BR')]);
  }
  return {
    titulo: nomeRelatorio || `Relatório de ${assunto.rotulo}`,
    escritorio,
    info,
    filtros: await descreverFiltros(assunto, receita, ctx),
    grafico: grafico || null,
    secoes,
    geradoEm,
    geradoPor: ctx.usuario.nome || '',
    paisagem: secoes.some(s => s.colunas.length > 5),
  };
}

module.exports = { montarDocumento, COR_PADRAO };
