// ============================================================
// HORÁRIO SEQUENCIAL para prazos/tarefas NOVOS na Agenda e no Google
// ------------------------------------------------------------
// Prazo e tarefa continuam valendo pelo DIA (a hora é só de organização visual,
// para o Google e a agenda do sistema não empilharem tudo numa faixa só de
// "dia inteiro"). A fila é por PESSOA + DIA (delegado_para/atribuida_para); sem
// responsável (prazo/tarefa "do escritório") usa uma fila própria, só dela.
// 1ª volta: minutos pares (08:00, 08:02, ...); 2ª volta: ímpares (08:01, 08:03,
// ...); até 17:58/17:59. Esgotada a fila (muito raro: ~600 por pessoa/dia),
// devolve null — o evento fica sem hora (dia inteiro), sem erro nenhum.
// Só é chamado na CRIAÇÃO (prazo/tarefa editado não recalcula; os já existentes
// no Google continuam como estão).
// ============================================================

const INICIO_MIN = 8 * 60;  // 08:00
const FIM_MIN = 18 * 60;    // 18:00 (exclusivo)
const DURACAO_MINUTOS = 2;

const pad = n => String(n).padStart(2, '0');
function minutoParaHora(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`;
}

// Lista ordenada de candidatos: pares (1ª volta) e depois ímpares (2ª volta).
function candidatos() {
  const pares = [];
  const impares = [];
  for (let m = INICIO_MIN; m + DURACAO_MINUTOS <= FIM_MIN; m++) {
    (m % 2 === 0 ? pares : impares).push(minutoParaHora(m));
  }
  return [...pares, ...impares];
}
const CANDIDATOS = candidatos();

// Próximo horário livre na fila de (usuarioId ou null="escritório") + data (dentro
// da mesma transação/conexão da criação). Devolve 'HH:MM:00' ou null (sem vaga).
async function proximoHorarioDisponivel(conn, { usuarioId, data }) {
  try {
    const [p] = await conn.execute(
      `SELECT hora_agenda FROM prazos_processo
        WHERE data_vencimento = ? AND hora_agenda IS NOT NULL AND delegado_para <=> ?`,
      [data, usuarioId || null]
    );
    const [t] = await conn.execute(
      `SELECT hora_agenda FROM tarefas
        WHERE data_vencimento = ? AND hora_agenda IS NOT NULL AND atribuida_para <=> ?`,
      [data, usuarioId || null]
    );
    const ocupados = new Set([...p, ...t].map(r => String(r.hora_agenda)));
    return CANDIDATOS.find(h => !ocupados.has(h)) || null;
  } catch (e) {
    console.error('[horaAgenda] falha ao calcular horário:', e.message);
    return null;
  }
}

// 'HH:MM:SS' + DURACAO_MINUTOS → 'HH:MM:SS' (fim do evento curto no Google).
function horaFimCurta(horaInicio) {
  const [hh, mm] = String(horaInicio).split(':').map(Number);
  const total = hh * 60 + mm + DURACAO_MINUTOS;
  return minutoParaHora(total);
}

module.exports = { proximoHorarioDisponivel, horaFimCurta, DURACAO_MINUTOS };
