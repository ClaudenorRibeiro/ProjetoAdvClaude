// ============================================================
// RELATÓRIOS AGENDADOS — quando é o próximo envio. Tudo em horário de Brasília, em texto
// "AAAA-MM-DD HH:MM:SS" (é assim que fica gravado, sem depender do fuso do servidor ou do banco).
// ============================================================
const FUSO = 'America/Sao_Paulo';

const dois = n => String(n).padStart(2, '0');

// "Agora" em Brasília, no formato do banco
function agoraBrasilia(data = new Date()) {
  return data.toLocaleString('sv-SE', { timeZone: FUSO });
}

function ultimoDiaDoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }

// ag: { frequencia, dia_semana, dia_mes, hora }.  Devolve o primeiro horário ESTRITAMENTE depois de `agora`.
function proximaExecucao(ag, agora = agoraBrasilia()) {
  const hora = String(ag.hora).slice(0, 8).padEnd(8, ':00').slice(0, 8);
  const [a, m, d] = agora.slice(0, 10).split('-').map(Number);
  for (let i = 0; i <= 62; i++) {
    const dia = new Date(Date.UTC(a, m - 1, d + i));
    const ano = dia.getUTCFullYear(); const mes = dia.getUTCMonth() + 1; const diaMes = dia.getUTCDate();
    let vale = true;
    if (ag.frequencia === 'semanal') vale = dia.getUTCDay() === Number(ag.dia_semana);
    else if (ag.frequencia === 'mensal') vale = diaMes === Math.min(Number(ag.dia_mes), ultimoDiaDoMes(ano, mes));
    if (!vale) continue;
    const candidato = `${ano}-${dois(mes)}-${dois(diaMes)} ${hora}`;
    if (candidato > agora) return candidato;
  }
  return null;
}

module.exports = { agoraBrasilia, proximaExecucao };
