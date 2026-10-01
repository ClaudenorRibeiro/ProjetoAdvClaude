// ============================================================
// RELATÓRIOS — valores como TEXTO legível para PDF e Word (datas dd/mm/aaaa, R$, Sim/Não, números pt-BR).
// Mesmas regras de leitura da tela; o Excel mantém os valores como número/data de verdade.
// ============================================================
const MAX_TEXTO_CELULA = 200;
const VAZIO = '—';

const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso); };
const horaBR = (iso) => { const m = /[ T](\d{2}):(\d{2})/.exec(String(iso)); return m ? ` ${m[1]}:${m[2]}` : ''; };
const moeda = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Texto de uma célula de dados (coluna descrita pelo catálogo)
function textoDaCelula(coluna, v) {
  if (v === null || v === undefined || v === '') return VAZIO;
  if (coluna.tipo === 'booleano') return v ? 'Sim' : 'Não';
  if (coluna.tipo === 'data') return dataBR(v);
  if (coluna.tipo === 'datahora') return `${dataBR(v)}${horaBR(v)}`;
  if (coluna.tipo === 'numero') {
    const n = Number(v);
    if (!Number.isFinite(n)) return VAZIO;
    return coluna.formato === 'moeda' ? moeda(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
  return limparTexto(v);
}

// Valor de um TOTAL (quantidade, soma, média, mínimo, máximo)
function textoDaMetrica(m, v) {
  if (v === null || v === undefined) return VAZIO;
  if (m.tipo === 'data') return dataBR(v);
  if (m.tipo === 'datahora') return `${dataBR(v)}${horaBR(v)}`;
  const n = Number(v);
  if (m.formato === 'moeda') return moeda(n);
  return m.funcao === 'media' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toLocaleString('pt-BR');
}

// Sem quebras de linha/controles e com tamanho limitado (um campo de observações não pode ocupar a página)
function limparTexto(v) {
  const t = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return t.length > MAX_TEXTO_CELULA ? `${t.slice(0, MAX_TEXTO_CELULA - 1)}…` : t;
}

module.exports = { textoDaCelula, textoDaMetrica, limparTexto, dataBR, VAZIO, MAX_TEXTO_CELULA };
