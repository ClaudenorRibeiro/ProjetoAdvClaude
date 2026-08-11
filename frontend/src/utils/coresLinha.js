// ============================================================
// COR DE DESTAQUE DA LINHA (hover do mouse nas tabelas) — fonte única.
// Usado pelo Layout (aplica a variável CSS) e pelo modal "Aparência".
// Cada usuário pode sobrescrever (usuarios.cor_linha); vazio = padrão do sistema.
// ============================================================

// Cor PADRÃO da linha SOB O MOUSE — EXATAMENTE a atual (.tabela tr:hover no Layout.css).
// Se o usuário não personalizar, nada muda (o Layout.css usa esse mesmo valor como fallback).
export const COR_LINHA_PADRAO = '#aec6e4';

// Cor PADRÃO da linha de PUBLICAÇÃO JÁ LIDA (verde-claro). Aplicada por padrão a quem não
// personalizar (o front usa este valor como fallback em Publicações).
export const COR_LINHA_LIDA_PADRAO = '#cdebd6';

// Valida a cor: hex #rgb ou #rrggbb.
export function corLinhaValida(cor) {
  return typeof cor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cor);
}

// Monta a VARIÁVEL CSS da linha sob o mouse a partir da cor do usuário.
// Retorna {} quando o usuário NÃO personalizou → o Layout.css usa o padrão (idêntico ao atual).
export function variaveisLinha(cor) {
  if (!corLinhaValida(cor)) return {};
  return { '--linha-hover': cor };
}

// Monta a VARIÁVEL CSS da linha de "publicação já lida" a partir da cor do usuário.
// Retorna {} quando o usuário NÃO personalizou → usa o padrão (fallback em Publicações).
export function variaveisLinhaLida(cor) {
  if (!corLinhaValida(cor)) return {};
  return { '--linha-lida': cor };
}
