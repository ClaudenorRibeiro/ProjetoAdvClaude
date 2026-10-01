// ============================================================
// GRÁFICOS — formatação de valores (tooltip completo e rótulos compactos do eixo)
// ============================================================
const pt = (n, min = 0, max = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

// Valor completo (tooltip, legenda, tabela): R$ 1.234,56 ou 1.234 (média com 2 casas)
export function formatarValor(v, { formato, funcao } = {}) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (formato === 'moeda') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return funcao === 'media' ? pt(n, 2, 2) : pt(n, 0, 2);
}

// Rótulo curto do eixo: 1,2 mil / 3 mi (e R$ na frente quando for dinheiro)
export function formatarEixo(v, { formato } = {}) {
  const n = Number(v);
  const abs = Math.abs(n);
  const prefixo = formato === 'moeda' ? 'R$ ' : '';
  if (abs >= 1e9) return `${prefixo}${pt(n / 1e9, 0, 1)} bi`;
  if (abs >= 1e6) return `${prefixo}${pt(n / 1e6, 0, 1)} mi`;
  if (abs >= 1e4) return `${prefixo}${pt(n / 1e3, 0, 0)} mil`;
  return `${prefixo}${pt(n, 0, abs < 10 && !Number.isInteger(n) ? 2 : 0)}`;
}

export const percentual = (parte, total) => (total ? `${pt((parte / total) * 100, 0, 1)}%` : '—');
