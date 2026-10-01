// ============================================================
// GRÁFICOS — cores. Paleta categórica de 8 posições em ORDEM FIXA (validada para daltonismo contra o
// fundo branco do cartão). Uma série só = sempre a posição 1. A cor segue a SÉRIE, nunca o ranking.
// A 9ª série nunca ganha cor nova: o excedente vira "Outros" (cinza).
// ============================================================
export const CORES_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const COR_OUTROS = '#898781';
export const MAX_SERIES = CORES_SERIES.length;

// Tinta do gráfico (texto nunca usa a cor da série)
export const TINTA = { primaria: '#0b0b0b', secundaria: '#52514e', grade: '#e1e0d9', eixo: '#c3c2b7', fundo: '#ffffff' };

export const corDaSerie = (indice, ehOutros = false) => (ehOutros ? COR_OUTROS : CORES_SERIES[indice % MAX_SERIES]);
