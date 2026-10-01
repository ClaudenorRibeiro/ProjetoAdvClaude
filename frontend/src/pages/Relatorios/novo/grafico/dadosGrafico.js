// ============================================================
// GRÁFICOS — transforma o resultado AGRUPADO em categorias × séries.
// 1 nível de grupo  -> uma série (cada grupo é uma categoria).
// 2 níveis          -> o 1º nível vira categoria; o 2º vira as séries (cada uma com sua cor).
// Limites para o gráfico continuar legível: 30 categorias; 8 séries (o excedente vira "Outros").
// Função pura: nada de tela aqui, para poder ser testada com números.
// ============================================================
import { corDaSerie, MAX_SERIES } from './cores';

export const MAX_CATEGORIAS = 30;
export const MAX_FATIAS = 6;
const SOMAVEIS = ['contagem', 'soma'];   // só estas podem ser somadas em "Outros" sem mentir

export const TIPOS = [
  { valor: 'colunas', rotulo: 'Colunas' },
  { valor: 'barras', rotulo: 'Barras (horizontais)' },
  { valor: 'linhas', rotulo: 'Linhas' },
  { valor: 'rosca', rotulo: 'Rosca' },
];

// Totais que podem virar gráfico (os de data não têm eixo numérico)
export function metricasGraficaveis(dados) {
  return dados.colunas.metricas.map((m, indice) => ({ ...m, indice })).filter(m => m.tipo === 'numero');
}

export const tipoPadrao = (dados) => (dados.colunas.grupos[0]?.passo ? 'linhas' : 'colunas');

const numero = (v) => (v === null || v === undefined ? null : Number(v));
const chaveDe = (v) => (v === null || v === undefined ? '∅' : String(v));

function agrupar2Niveis(folhas, m) {
  const categorias = []; const series = []; const catIdx = new Map(); const serIdx = new Map();
  for (const l of folhas) {
    const kc = chaveDe(l.chaves[0]); const ks = chaveDe(l.chaves[1]);
    if (!catIdx.has(kc)) { catIdx.set(kc, categorias.length); categorias.push({ chave: l.chaves[0], rotulo: l.rotulos[0] }); }
    if (!serIdx.has(ks)) { serIdx.set(ks, series.length); series.push({ chave: l.chaves[1], rotulo: l.rotulos[1], valores: [], pontos: [] }); }
  }
  for (const s of series) { s.valores = categorias.map(() => null); s.pontos = categorias.map(() => null); }
  for (const l of folhas) {
    const c = catIdx.get(chaveDe(l.chaves[0])); const s = series[serIdx.get(chaveDe(l.chaves[1]))];
    s.valores[c] = numero(l.valores[m.indice]);
    s.pontos[c] = { chaves: l.chaves, rotulos: l.rotulos };
  }
  return { categorias, series };
}

function agrupar1Nivel(folhas, m) {
  return {
    categorias: folhas.map(l => ({ chave: l.chaves[0], rotulo: l.rotulos[0] })),
    series: [{ chave: 's1', rotulo: m.rotulo, valores: folhas.map(l => numero(l.valores[m.indice])),
      pontos: folhas.map(l => ({ chaves: l.chaves, rotulos: l.rotulos })) }],
  };
}

// Excedente de séries: soma em "Outros" (só contagem/soma); nos demais totais, mostra só as 8 primeiras
function limitarSeries(series, m, avisos) {
  if (series.length <= MAX_SERIES) return series;
  const resto = series.length - MAX_SERIES;
  if (!SOMAVEIS.includes(m.funcao)) {
    avisos.push(`Mostrando as ${MAX_SERIES} primeiras de ${series.length} séries (este total não pode ser somado em "Outros").`);
    return series.slice(0, MAX_SERIES);
  }
  const cauda = series.slice(MAX_SERIES);
  const outros = {
    chave: 'outros', rotulo: `Outros (${resto})`, ehOutros: true,
    valores: series[0].valores.map((_, c) => {
      const vs = cauda.map(s => s.valores[c]).filter(v => v !== null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
    }),
    pontos: series[0].valores.map(() => null),
  };
  avisos.push(`As ${resto} séries além da ${MAX_SERIES}ª foram somadas em "Outros".`);
  return [...series.slice(0, MAX_SERIES), outros];
}

function avaliarRosca(niveis, categorias, series) {
  if (niveis !== 1) return { ok: false, motivo: 'A rosca mostra um nível de grupo só.' };
  if (categorias.length < 2) return { ok: false, motivo: 'A rosca precisa de pelo menos 2 grupos.' };
  if (categorias.length > MAX_FATIAS) return { ok: false, motivo: `A rosca só é clara com até ${MAX_FATIAS} grupos; use colunas ou barras.` };
  if (series[0].valores.some(v => v === null || v <= 0)) return { ok: false, motivo: 'A rosca só mostra valores maiores que zero.' };
  return { ok: true, motivo: null };
}

export function prepararGrafico(dados, { metrica } = {}) {
  const graficaveis = metricasGraficaveis(dados);
  const niveis = dados.colunas.grupos.length;
  const folhas = dados.linhas.filter(l => l.tipo === 'grupo');
  if (!niveis || !graficaveis.length || !folhas.length) {
    return { vazio: true, motivo: !niveis ? 'Escolha pelo menos um grupo em "Agrupar e totalizar" para ver o gráfico.'
      : !graficaveis.length ? 'Não há total numérico para mostrar no gráfico.' : 'Nenhum grupo encontrado com esses filtros.' };
  }
  const m = graficaveis.find(x => x.chave === metrica) || graficaveis[0];
  const avisos = [];
  let { categorias, series } = niveis >= 2 ? agrupar2Niveis(folhas, m) : agrupar1Nivel(folhas, m);

  const totalCategorias = categorias.length;
  if (totalCategorias > MAX_CATEGORIAS) {
    categorias = categorias.slice(0, MAX_CATEGORIAS);
    series = series.map(s => ({ ...s, valores: s.valores.slice(0, MAX_CATEGORIAS), pontos: s.pontos.slice(0, MAX_CATEGORIAS) }));
    avisos.push(`Mostrando os primeiros ${MAX_CATEGORIAS} de ${totalCategorias} grupos. Ordene os grupos pelo total (do maior para o menor) para ver os maiores.`);
  }
  series = limitarSeries(series, m, avisos).map((s, i) => ({ ...s, cor: corDaSerie(i, !!s.ehOutros) }));
  return { vazio: false, metrica: m, niveis, categorias, series, avisos, totalCategorias, rosca: avaliarRosca(niveis, categorias, series) };
}

// Valor total da série (para a legenda da rosca e percentuais) — só faz sentido para totais somáveis
export const somaDaSerie = (s) => s.valores.reduce((a, v) => a + (v || 0), 0);
