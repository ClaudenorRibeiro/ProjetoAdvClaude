// ============================================================
// LEITURA SEGURA DE LINK (endereço web) VINDO DA TELA
// Link nunca tem espaço: ao colar do convite do Zoom/Teams/Meet costuma vir espaço, quebra de linha ou caractere invisível no
// meio, e o link quebra no WhatsApp, no SMS, no e-mail e no botão da tela. Aqui tudo isso é removido; falta de "https://" é
// completada; só endereço http/https com site é aceito (nada de "javascript:" nem texto solto).
// Devolve { valor } (link limpo; null quando vazio) ou { erro } com a mensagem para o usuário.
// ============================================================
// Espaços e caracteres invisíveis (espaço sem quebra, zero-width, marcas de direção, BOM...). Montado por código para o arquivo não
// conter caracteres invisíveis escondidos.
const FAIXAS_INVISIVEIS = [[0xA0, 0xA0], [0x1680, 0x1680], [0x180E, 0x180E], [0x2000, 0x200F], [0x2028, 0x202F], [0x205F, 0x2064], [0x3000, 0x3000], [0xFEFF, 0xFEFF]];
const INVISIVEIS_E_ESPACOS = new RegExp(`[\\s${FAIXAS_INVISIVEIS.map(([a, b]) => String.fromCharCode(a) + (b > a ? `-${String.fromCharCode(b)}` : '')).join('')}]`, 'g');

function lerLink(bruto, { rotulo = 'O link', max = 500 } = {}) {
  if (bruto === undefined || bruto === null) return { valor: null };
  if (typeof bruto !== 'string') return { erro: `${rotulo} inválido` };
  let t = bruto.replace(INVISIVEIS_E_ESPACOS, '');
  if (t === '') return { valor: null };
  const invalido = { erro: `${rotulo} não é um endereço válido (use um endereço como https://zoom.us/j/123456789)` };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    // "zoom.us:443/j/1" é site com porta (sem https://); qualquer outro "algo:" sem "//" (javascript:, mailto:, "Link:https://...") é recusado
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^\/:?#]+:\d+(\/|$|\?|#)/.test(t)) return invalido;
    if (t.startsWith('/')) return invalido;        // "//site/x" ou caminho solto: não é endereço completo
    t = `https://${t}`;
  }
  let url;
  try { url = new URL(t); } catch { return invalido; }
  if (!['http:', 'https:'].includes(url.protocol)) return invalido;
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return invalido;
  if (max && t.length > max) return { erro: `${rotulo} muito longo (máximo ${max} caracteres)` };
  return { valor: t };
}

module.exports = { lerLink };
