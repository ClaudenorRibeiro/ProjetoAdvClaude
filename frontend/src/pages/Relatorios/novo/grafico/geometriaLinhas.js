// ============================================================
// GRÁFICOS — geometria do gráfico de LINHAS (função pura).
// Uma linha por série; valor nulo QUEBRA a linha (não vira zero). Pontos igualmente espaçados.
// ============================================================
import { escalaBonita, proporcao } from './escala';
import { formatarEixo } from './formato';
import { cortar } from './geometriaBarras';

const CHAR = 6.4;

export function geometriaLinhas({ prep, largura }) {
  const { categorias, series, metrica } = prep;
  const n = categorias.length;
  const todos = series.flatMap(s => s.valores).filter(v => v !== null);
  const escala = escalaBonita(Math.min(0, ...todos), Math.max(0, ...todos), 5);
  const formatoEixo = { formato: metrica.formato };
  const marcas0 = escala.marcas.map(valor => ({ valor, texto: formatarEixo(valor, formatoEixo) }));
  const esq = Math.max(44, Math.max(...marcas0.map(m => m.texto.length)) * CHAR + 14);
  const plot = { x: esq, y: 20, w: Math.max(80, largura - esq - 16), h: 240 };
  const banda = plot.w / n;
  const altura = plot.y + plot.h + 40;
  const y = (v) => plot.y + plot.h * (1 - proporcao(v, escala));
  const x = (i) => plot.x + (i + 0.5) * banda;

  const maxRotulo = Math.max(...categorias.map(c => Math.min(c.rotulo.length, 12)));
  const passo = Math.max(1, Math.ceil((maxRotulo * CHAR + 10) / banda));          // mostra 1 rótulo a cada "passo" para não sobrepor

  const linhas = series.map((s, i) => {
    const segmentos = []; let atual = [];
    s.valores.forEach((v, c) => {
      if (v === null) { if (atual.length) segmentos.push(atual); atual = []; return; }
      atual.push({ c, x: x(c), y: y(v), valor: v });
    });
    if (atual.length) segmentos.push(atual);
    return { s: i, segmentos, pontos: segmentos.flat() };
  });
  return {
    largura, altura, plot, escala, banda, passo, linhas,
    xs: categorias.map((_, i) => x(i)),
    zero: y(0),
    marcas: marcas0.map(m => ({ ...m, pos: y(m.valor) })),
    rotulos: categorias.map((c, i) => ({ texto: cortar(c.rotulo, 12), completo: c.rotulo, x: x(i), mostrar: i % passo === 0 })),
  };
}

export const caminhoLinha = (pontos) => pontos.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
export const caminhoArea = (pontos, zero) => (pontos.length
  ? `${caminhoLinha(pontos)}L${pontos.at(-1).x.toFixed(1)},${zero.toFixed(1)}L${pontos[0].x.toFixed(1)},${zero.toFixed(1)}Z` : '');
