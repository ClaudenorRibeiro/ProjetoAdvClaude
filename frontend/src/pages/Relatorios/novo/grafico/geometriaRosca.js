// ============================================================
// GRÁFICO DE ROSCA — fatias (função pura). Só para poucos grupos e valores positivos
// (a decisão de permitir ou não está em dadosGrafico.js).
// ============================================================
const FOLGA = 0.025;   // espaço entre fatias, em radianos (~1,4°)

const ponto = (cx, cy, r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];

function caminhoFatia(cx, cy, R, r, a0, a1) {
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = ponto(cx, cy, R, a0); const [x1, y1] = ponto(cx, cy, R, a1);
  const [x2, y2] = ponto(cx, cy, r, a1); const [x3, y3] = ponto(cx, cy, r, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 ${grande} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r},${r} 0 ${grande} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

export function fatiasRosca(valores, { cx, cy, R, r }) {
  const total = valores.reduce((a, v) => a + v, 0);
  if (!total) return [];
  if (valores.length === 1) {   // círculo inteiro: dois meios arcos (um arco de 360° some no SVG)
    return [{ i: 0, valor: valores[0], fracao: 1, caminho: `${caminhoFatia(cx, cy, R, r, -Math.PI / 2, Math.PI / 2 - 1e-4)}${caminhoFatia(cx, cy, R, r, Math.PI / 2, 1.5 * Math.PI - 1e-4)}` }];
  }
  let ang = -Math.PI / 2;   // começa no topo
  return valores.map((valor, i) => {
    const fracao = valor / total;
    const a0 = ang + FOLGA / 2; const a1 = ang + fracao * 2 * Math.PI - FOLGA / 2;
    ang += fracao * 2 * Math.PI;
    return { i, valor, fracao, caminho: caminhoFatia(cx, cy, R, r, a0, Math.max(a0 + 0.001, a1)) };
  });
}
