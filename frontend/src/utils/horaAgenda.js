// Soma 1 minuto a uma hora 'HH:MM', para o fim do evento curto (2 min) de prazo/tarefa
// com horário sequencial na Agenda (o fim real do evento vem do fim gravado, mas a Agenda
// do sistema usa só o início + 2 min, igual ao evento enviado ao Google).
export function proximoMinuto(horaHHMM, minutos = 2) {
  const [hh, mm] = String(horaHHMM || '00:00').split(':').map(Number);
  const total = ((hh * 60 + mm + minutos) % (24 * 60) + 24 * 60) % (24 * 60);
  const h2 = Math.floor(total / 60);
  const m2 = total % 60;
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
}
