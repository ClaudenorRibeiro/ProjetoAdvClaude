// ============================================================
// GRÁFICOS — geometria das COLUNAS (verticais) e BARRAS (horizontais), agrupadas ou empilhadas.
// Função pura: recebe categorias × séries e devolve retângulos prontos para desenhar.
// Regras: barra com no máximo 24px de espessura; todas crescem de UMA linha-base (o zero);
// 2px de espaço entre as fatias de uma pilha; ponta arredondada só no fim do dado.
// ============================================================
import { escalaBonita, proporcao } from './escala';
import { formatarEixo } from './formato';

export const ESPESSURA_MAX = 24;
export const ESPACO = 2;
const CHAR = 6.4;   // largura média de um caractere do texto do eixo (11px)

export const cortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

function extremos(series, empilhado) {
  const n = series[0].valores.length;
  if (!empilhado) {
    const todos = series.flatMap(s => s.valores).filter(v => v !== null);
    return [Math.min(0, ...todos), Math.max(0, ...todos)];
  }
  let min = 0; let max = 0;
  for (let c = 0; c < n; c++) {
    let pos = 0; let neg = 0;
    for (const s of series) { const v = s.valores[c]; if (v === null) continue; if (v >= 0) pos += v; else neg += v; }
    max = Math.max(max, pos); min = Math.min(min, neg);
  }
  return [min, max];
}

// Tamanho de cada barra de um grupo (várias séries lado a lado, ou uma só quando empilhado)
function medidas(banda, nLado, maxBarra) {
  const espessura = Math.min(maxBarra, Math.max(2, (banda * 0.8 - (nLado - 1) * ESPACO) / nLado));
  return { espessura, total: nLado * espessura + (nLado - 1) * ESPACO };
}

// Cada fatia de uma pilha começa onde a anterior terminou (positivas para cima, negativas para baixo)
function fatiasDaCategoria(series, c, empilhado, escala, pos) {
  const saida = []; let acima = 0; let abaixo = 0;
  series.forEach((s, i) => {
    const v = s.valores[c];
    if (v === null) return;
    let de = 0; let ate = v;
    if (empilhado) { if (v >= 0) { de = acima; acima += v; ate = acima; } else { de = abaixo; abaixo += v; ate = abaixo; } }
    saida.push({ s: i, c, valor: v, de, ate, primeira: de === 0 });
  });
  if (empilhado) {   // só a fatia do topo (e a de baixo, se negativa) arredonda a ponta
    const ultimaPos = [...saida].reverse().find(f => f.valor >= 0); const ultimaNeg = [...saida].reverse().find(f => f.valor < 0);
    saida.forEach(f => { f.ponta = f === ultimaPos || f === ultimaNeg; });
  } else saida.forEach(f => { f.ponta = true; });
  return saida.map(f => ({ ...f, p0: pos(f.de), p1: pos(f.ate) }));
}

export function geometriaBarras({ prep, horizontal, empilhado, largura }) {
  const { categorias, series, metrica } = prep;
  const n = categorias.length;
  const empilha = empilhado && series.length > 1;
  const [min, max] = extremos(series, empilha);
  const escala = escalaBonita(min, max, horizontal ? 4 : 5);
  const formatoEixo = { formato: metrica.formato };
  const nLado = empilha ? 1 : series.length;
  const rotulosTexto = categorias.map(c => c.rotulo);
  const maxRotulo = Math.max(...rotulosTexto.map(t => Math.min(t.length, 22)));

  let plot; let banda; let altura;
  if (horizontal) {
    const esq = Math.min(170, Math.max(70, maxRotulo * CHAR + 14));
    banda = Math.max(30, nLado * 20 + 14);
    altura = 12 + n * banda + 32;
    plot = { x: esq, y: 12, w: Math.max(80, largura - esq - 48), h: n * banda };   // folga à direita: o último rótulo do eixo cabe inteiro
  } else {
    const esq = Math.max(44, Math.max(...escala.marcas.map(m => formatarEixo(m, formatoEixo).length)) * CHAR + 14);
    const bandaBruta = (largura - esq - 14) / n;
    const rotacionar = bandaBruta < 58;
    altura = rotacionar ? 360 : 320;
    plot = { x: esq, y: 24, w: Math.max(80, largura - esq - 14), h: altura - 24 - (rotacionar ? 84 : 36) };
    banda = plot.w / n;
  }
  const { espessura, total } = medidas(banda, nLado, horizontal ? 20 : ESPESSURA_MAX);
  const pos = horizontal ? (v) => plot.x + plot.w * proporcao(v, escala) : (v) => plot.y + plot.h * (1 - proporcao(v, escala));
  const zero = pos(0);

  const barras = []; const bandas = [];
  for (let c = 0; c < n; c++) {
    const inicio = (horizontal ? plot.y : plot.x) + c * banda;
    bandas.push(horizontal ? { c, x: plot.x, y: inicio, w: plot.w, h: banda } : { c, x: inicio, y: plot.y, w: banda, h: plot.h });
    const ladoAlado = (banda - total) / 2;
    let ordem = 0;
    for (const f of fatiasDaCategoria(series, c, empilha, escala, pos)) {
      const deslocamento = ladoAlado + (empilha ? 0 : ordem++) * (espessura + ESPACO);
      const folga = empilha && !f.primeira ? ESPACO : 0;                    // espaço de 2px junto da fatia anterior
      const lo = Math.min(f.p0, f.p1); const hi = Math.max(f.p0, f.p1);      // extremos no eixo do valor
      const minimo = hi - lo < 1 ? 1 : 0;                                    // valor minúsculo ainda aparece
      const positivo = f.valor >= 0;
      if (horizontal) {
        // cresce para a direita (positivo) ou esquerda (negativo); a fatia anterior fica do lado do zero
        const x = positivo ? lo + folga : lo;
        const w = Math.max(hi - lo - folga, minimo);
        barras.push({ ...f, x, y: inicio + deslocamento, w, h: espessura, lado: f.ponta ? (positivo ? 'direita' : 'esquerda') : null });
      } else {
        // y cresce para baixo: o positivo sobe do zero; a fatia anterior fica embaixo (positivo) ou em cima (negativo)
        const y = positivo ? lo : lo + folga;
        const h = Math.max(hi - lo - folga, minimo);
        barras.push({ ...f, x: inicio + deslocamento, y, w: espessura, h, lado: f.ponta ? (positivo ? 'cima' : 'baixo') : null });
      }
    }
  }

  // rótulo de valor só na barra mais forte (nunca um número em cada barra)
  let destaque = null;
  if (series.length === 1 && n > 1) {
    const b = barras.reduce((m, x) => (!m || Math.abs(x.valor) > Math.abs(m.valor) ? x : m), null);
    if (b && b.valor !== 0) destaque = { ...b };
  }
  return {
    largura, altura, plot, escala, horizontal, banda, espessura, zero, barras, bandas, destaque,
    marcas: escala.marcas.map(valor => ({ valor, pos: pos(valor), texto: formatarEixo(valor, formatoEixo) })),
    rotacionar: !horizontal && banda < 58,
    rotulos: categorias.map((c, i) => ({ texto: cortar(c.rotulo, horizontal ? 24 : 14), completo: c.rotulo, pos: (horizontal ? plot.y : plot.x) + i * banda + banda / 2 })),
  };
}

// Caminho de uma barra com a ponta (lado) arredondada em 4px e a base reta
export function caminhoBarra({ x, y, w, h, lado }) {
  const r = Math.min(4, w / 2, h);
  if (!lado || r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  switch (lado) {
    case 'cima': return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    case 'baixo': return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    case 'direita': return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    default: return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;   // esquerda
  }
}
