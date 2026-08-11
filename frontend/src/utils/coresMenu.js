// ============================================================
// CORES DO MENU LATERAL — fonte única (padrões + rótulos + variáveis de tema)
// Usado pelo Layout (aplica as variáveis CSS na raiz) e pelo modal "Aparência".
// Cada usuário pode sobrescrever essas cores (usuarios.cores_menu); vazio = padrão.
// ============================================================

// Cores PADRÃO — EXATAMENTE as atuais do menu no Layout.css. Se o usuário não
// personalizar, nada muda (o Layout.css usa esses mesmos valores como fallback).
export const CORES_MENU_PADRAO = {
  fundo:    '#2a4146', // fundo do menu lateral
  destaque: '#7eb8f7', // item ativo / hover (texto, barra à direita e realce)
};

// Rótulos amigáveis (para o modal de personalização).
export const CORES_MENU_LABELS = {
  fundo:    'Fundo do menu',
  destaque: 'Cor de destaque',
};

// Junta as cores do usuário sobre o padrão (o que ele não mexeu continua padrão).
export function coresMenuEfetivas(coresUsuario) {
  return { ...CORES_MENU_PADRAO, ...(coresUsuario || {}) };
}

// Valida um mapa de cores do menu: só as chaves conhecidas + hex #rgb ou #rrggbb.
export function coresMenuValidas(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const chaves = Object.keys(CORES_MENU_PADRAO);
  return Object.entries(obj).every(([k, v]) =>
    chaves.includes(k) && typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)
  );
}

// Converte hex (#rgb ou #rrggbb) em {r,g,b}. Retorna null se inválido.
function hexParaRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return { r, g, b };
}

// Monta "rgba(r,g,b,alfa)" a partir de um hex. Fallback = destaque padrão se vier inválido.
export function hexParaRgba(hex, alfa) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return `rgba(126, 184, 247, ${alfa})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alfa})`;
}

// O fundo escolhido é "escuro"? (brilho YIQ). Decide se o texto do menu fica claro
// ou escuro, para nunca ficar ilegível — independentemente da cor que o usuário escolher.
function fundoEscuro(hex) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return true; // na dúvida, trata como escuro (texto claro)
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return yiq < 150;
}

// Monta as VARIÁVEIS CSS do menu a partir das cores do usuário.
// Retorna {} quando o usuário NÃO personalizou → o Layout.css usa os padrões
// (menu idêntico ao atual, pixel a pixel).
export function variaveisMenu(coresUsuario) {
  if (!coresUsuario) return {};
  const { fundo, destaque } = coresMenuEfetivas(coresUsuario);
  const escuro = fundoEscuro(fundo);
  return {
    '--menu-bg':           fundo,
    '--menu-accent':       destaque,
    '--menu-accent-soft':  hexParaRgba(destaque, 0.15), // fundo do item ativo/hover
    '--menu-accent-soft2': hexParaRgba(destaque, 0.10), // fundo do subitem ativo
    '--menu-text':         escuro ? 'rgba(255,255,255,0.80)' : 'rgba(17,24,39,0.78)',
    '--menu-text-strong':  escuro ? '#ffffff'                : '#111827',
    '--menu-text-muted':   escuro ? 'rgba(255,255,255,0.62)' : 'rgba(17,24,39,0.55)',
  };
}
