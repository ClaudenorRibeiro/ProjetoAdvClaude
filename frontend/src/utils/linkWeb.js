// Ajuda a digitar LINK (endereço web) nos formulários — a mesma ideia da conferência do servidor (backend/src/utils/linkWeb.js),
// que é quem decide de verdade: aqui só se arruma o que a pessoa vê, para ela conferir o link que será gravado.
// Link nunca tem espaço: ao colar do convite do Zoom/Teams/Meet costuma vir espaço, quebra de linha ou caractere invisível no meio.

// Espaços e caracteres invisíveis (espaço sem quebra, zero-width, marcas de direção, BOM...). Montado por código para o arquivo não
// conter caracteres invisíveis escondidos.
const FAIXAS_INVISIVEIS = [[0xA0, 0xA0], [0x1680, 0x1680], [0x180E, 0x180E], [0x2000, 0x200F], [0x2028, 0x202F], [0x205F, 0x2064], [0x3000, 0x3000], [0xFEFF, 0xFEFF]];
const INVISIVEIS_E_ESPACOS = new RegExp(`[\\s${FAIXAS_INVISIVEIS.map(([a, b]) => String.fromCharCode(a) + (b > a ? `-${String.fromCharCode(b)}` : '')).join('')}]`, 'g');

// Tira espaços e invisíveis (usar a cada tecla/colagem: o espaço nem chega a entrar no campo).
export function limparLinkDigitado(valor) {
  return String(valor ?? '').replace(INVISIVEIS_E_ESPACOS, '');
}

// Ao sair do campo: sem "https://" e com cara de site (tem ponto, não é "algo:" nem começa com "/"), completa com https://.
// Qualquer outra coisa fica como está (o servidor recusa com um aviso claro ao salvar).
export function completarLink(valor) {
  const t = limparLinkDigitado(valor);
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  const hostComPorta = /^[^\/:?#]+:\d+(\/|$|\?|#)/.test(t);
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !hostComPorta) return t;
  if (t.startsWith('/') || !t.includes('.')) return t;
  return `https://${t}`;
}
