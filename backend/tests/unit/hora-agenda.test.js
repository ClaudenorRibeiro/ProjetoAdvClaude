// Peça única do horário sequencial de prazo/tarefa na Agenda e no Google (backend/src/utils/horaAgenda.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { proximoHorarioDisponivel, horaFimCurta, DURACAO_MINUTOS } = require('../../src/utils/horaAgenda');

// Conexão falsa: devolve as horas já ocupadas que o teste combinar para prazos/tarefas.
function connFalsa({ prazos = [], tarefas = [] } = {}) {
  return {
    async execute(sql) {
      if (sql.includes('FROM prazos_processo')) return [prazos.map(h => ({ hora_agenda: h }))];
      return [tarefas.map(h => ({ hora_agenda: h }))];
    },
  };
}

test('proximoHorarioDisponivel: sem nada ocupado, começa em 08:00:00', async () => {
  const h = await proximoHorarioDisponivel(connFalsa(), { usuarioId: 5, data: '2026-11-04' });
  assert.equal(h, '08:00:00');
});

test('proximoHorarioDisponivel: pula os pares já ocupados (de prazo OU de tarefa) antes de usar ímpar', async () => {
  const h = await proximoHorarioDisponivel(connFalsa({ prazos: ['08:00:00'], tarefas: ['08:02:00'] }), { usuarioId: 5, data: '2026-11-04' });
  assert.equal(h, '08:04:00');
});

test('proximoHorarioDisponivel: esgotados os pares (300), a 2ª volta começa em 08:01:00 (ímpar)', async () => {
  const pares = [];
  for (let m = 480; m < 1080; m += 2) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    pares.push(`${hh}:${mm}:00`);
  }
  const h = await proximoHorarioDisponivel(connFalsa({ prazos: pares }), { usuarioId: 5, data: '2026-11-04' });
  assert.equal(h, '08:01:00');
});

test('proximoHorarioDisponivel: fila cheia (600 horários) devolve null, sem erro', async () => {
  const todos = [];
  for (let m = 480; m + DURACAO_MINUTOS <= 1080; m++) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    todos.push(`${hh}:${mm}:00`);
  }
  const h = await proximoHorarioDisponivel(connFalsa({ prazos: todos }), { usuarioId: 5, data: '2026-11-04' });
  assert.equal(h, null);
});

test('proximoHorarioDisponivel: filas de pessoas diferentes (ou do escritório, usuarioId null) não se misturam', async () => {
  // A conexão falsa não distingue usuarioId no SQL (é parâmetro), então aqui confirmamos
  // só que a chamada funciona igual com usuarioId null (prazo/tarefa "do escritório").
  const h = await proximoHorarioDisponivel(connFalsa(), { usuarioId: null, data: '2026-11-04' });
  assert.equal(h, '08:00:00');
});

test('proximoHorarioDisponivel: conexão com erro devolve null em vez de lançar', async () => {
  const connComErro = { async execute() { throw new Error('banco fora'); } };
  const h = await proximoHorarioDisponivel(connComErro, { usuarioId: 1, data: '2026-11-04' });
  assert.equal(h, null);
});

test('horaFimCurta: soma a duração curta (2 minutos) sem passar da hora', () => {
  assert.equal(horaFimCurta('08:00:00'), '08:02:00');
  assert.equal(horaFimCurta('17:59:00'), '18:01:00');
});
