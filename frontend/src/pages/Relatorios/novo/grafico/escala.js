// ============================================================
// GRÁFICOS — escala "bonita": limites e marcas redondos (0 / 1.000 / 2.000), sempre incluindo o zero
// (barras crescem de uma linha-base única).
// ============================================================
function passoBonito(bruto) {
  const exp = Math.floor(Math.log10(bruto));
  const f = bruto / 10 ** exp;
  const base = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return base * 10 ** exp;
}

export function escalaBonita(menor, maior, alvo = 5) {
  let min = Math.min(0, menor);
  let max = Math.max(0, maior);
  if (min === max) max = min + 1;                       // tudo zero: ainda desenha uma escala
  const passo = passoBonito((max - min) / alvo);
  min = Math.floor(min / passo + 1e-9) * passo;
  max = Math.ceil(max / passo - 1e-9) * passo;
  const marcas = [];
  for (let v = min; v <= max + passo / 2; v += passo) marcas.push(Math.round(v / passo) * passo);
  return { min, max, passo, marcas };
}

// Posição (0..1) de um valor dentro da escala
export const proporcao = (v, { min, max }) => (v - min) / (max - min);
