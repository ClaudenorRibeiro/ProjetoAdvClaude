// ============================================================
// REGRAS DE STATUS DA AGENDA (calendário)
// - Perícias e audiências REMARCADAS ou CANCELADAS não aparecem no calendário
//   (a remarcação gera um novo registro; manter os dois duplicaria a data).
// - Perícias REALIZADAS e audiências REALIZADAS/ACORDO continuam aparecendo,
//   mas esmaecidas e riscadas (registro do que já aconteceu).
// Prazos e tarefas já são filtrados no servidor/na busca e não passam por aqui.
// ============================================================

const OCULTOS   = { pericia: ['remarcada', 'cancelada'], audiencia: ['remarcada', 'cancelada'] };
const ENCERRADO = { pericia: ['realizada'],              audiencia: ['realizada', 'acordo'] };

// true = o item deve aparecer no calendário
export function apareceNaAgenda(tipo, status) {
  return !(OCULTOS[tipo] || []).includes(status);
}

// true = o item aparece, porém esmaecido e riscado (já aconteceu)
export function esmaecidoNaAgenda(tipo, status) {
  return (ENCERRADO[tipo] || []).includes(status);
}
