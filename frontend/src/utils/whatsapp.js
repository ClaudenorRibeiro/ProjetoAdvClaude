// ============================================================
// LINK DO WHATSAPP (click-to-chat OFICIAL do WhatsApp — wa.me).
// Ponto ÚNICO de montagem do link: se um dia o endereço mudar, troca-se só aqui.
// NÃO usa Z-API (é o WhatsApp comum, grátis) — abre a conversa já com a mensagem
// escrita; quem envia é o próprio usuário (Web ou app desktop).
// ============================================================

// Monta o link do WhatsApp com o número e a mensagem pré-preenchida.
// Retorna null se não houver número. Adiciona o 55 (Brasil) quando o número
// vem sem o código do país (10 ou 11 dígitos = DDD + telefone).
export function linkWhatsApp(numero, texto) {
  let d = String(numero || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d; // sem código do país → assume Brasil
  const msg = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${d}${msg}`;
}
