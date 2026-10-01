// ============================================================
// TABELA CRUZADA (dinâmica) — resultado com 2 níveis de grupo em formato de matriz:
// o 1º grupo nas linhas, o 2º nas colunas e o total escolhido no cruzamento.
// Função pura. Total da linha = subtotal que o servidor já calculou; total da coluna só aparece quando o
// total é somável (quantidade/soma) — média, mínimo e máximo não se somam.
// ============================================================
export const MAX_COLUNAS_CRUZADA = 40;
const SOMAVEIS = ['contagem', 'soma'];
const chaveDe = (v) => (v === null || v === undefined ? '∅' : String(v));
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function montarCruzada(dados, chaveMetrica) {
  if (dados.colunas.grupos.length < 2) return { vazio: true, motivo: 'A tabela cruzada precisa de 2 níveis em "Agrupar e totalizar".' };
  const metricas = dados.colunas.metricas.map((m, indice) => ({ ...m, indice })).filter(m => m.tipo === 'numero');
  if (!metricas.length) return { vazio: true, motivo: 'Não há total numérico para cruzar.' };
  const m = metricas.find(x => x.chave === chaveMetrica) || metricas[0];

  const folhas = dados.linhas.filter(l => l.tipo === 'grupo');
  const colunas = []; const colIdx = new Map(); const linhas = []; const linIdx = new Map();
  for (const l of folhas) {
    const kl = chaveDe(l.chaves[0]); const kc = chaveDe(l.chaves[1]);
    if (!linIdx.has(kl)) { linIdx.set(kl, linhas.length); linhas.push({ chave: l.chaves[0], rotulo: l.rotulos[0], celulas: new Map(), total: null }); }
    if (!colIdx.has(kc)) { colIdx.set(kc, colunas.length); colunas.push({ chave: l.chaves[1], rotulo: l.rotulos[1], k: kc }); }
    linhas[linIdx.get(kl)].celulas.set(kc, { valor: num(l.valores[m.indice]), chaves: l.chaves, rotulos: l.rotulos });
  }
  for (const s of dados.linhas.filter(l => l.tipo === 'subtotal')) {
    const i = linIdx.get(chaveDe(s.chaves[0]));
    if (i !== undefined) linhas[i].total = num(s.valores[m.indice]);
  }
  const somavel = SOMAVEIS.includes(m.funcao);
  const totalGeral = num(dados.linhas.find(l => l.tipo === 'total')?.valores[m.indice]);
  const visiveis = colunas.slice(0, MAX_COLUNAS_CRUZADA);
  const totaisColuna = somavel
    ? visiveis.map(c => linhas.reduce((a, l) => a + (l.celulas.get(c.k)?.valor || 0), 0)) : null;
  return {
    vazio: false, metrica: m, metricas, colunas: visiveis, totalColunas: colunas.length, somavel, totalGeral, totaisColuna,
    cabecalhos: dados.colunas.grupos.map(g => g.rotulo),
    linhas: linhas.map(l => ({ chave: l.chave, rotulo: l.rotulo, total: l.total,
      celulas: visiveis.map(c => l.celulas.get(c.k) || null) })),
  };
}
