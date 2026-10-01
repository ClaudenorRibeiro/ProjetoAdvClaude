// ============================================================
// RELATÓRIOS — como mostrar o valor de um TOTAL (quantidade, soma, média, datas, R$)
// ============================================================
import { formatarData, formatarDataHora, formatarMoeda } from '../../../utils/formatters';

export function formatarTotal(metrica, v) {
  if (v === null || v === undefined) return '—';
  if (metrica.tipo === 'data') return formatarData(v);
  if (metrica.tipo === 'datahora') return formatarDataHora(v);
  if (metrica.formato === 'moeda') return formatarMoeda(v);
  return metrica.funcao === 'media' ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(v).toLocaleString('pt-BR');
}
