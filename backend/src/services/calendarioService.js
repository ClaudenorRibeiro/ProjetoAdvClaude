// ============================================================
// SERVIÇO DE CALENDÁRIO — Cálculo de dias úteis e vencimentos
// Usado por prazos, audiências e perícias
// ============================================================

const { pool } = require('../config/database');

// Calcula a data de vencimento somando dias úteis ou corridos
// dataInicio: string 'YYYY-MM-DD'
// quantidade: número de dias a somar
// tipoDias: 'uteis' ou 'corridos'
// Retorna: string 'YYYY-MM-DD'
async function calcularVencimento(dataInicio, quantidade, tipoDias) {
  if (!dataInicio || !quantidade) return null;

  if (tipoDias === 'corridos') {
    // Dias corridos: soma direto na data
    const data = new Date(dataInicio + 'T12:00:00');
    data.setDate(data.getDate() + quantidade);
    return data.toISOString().split('T')[0];
  }

  // Dias úteis: consulta o calendário para pular fins de semana e feriados
  const [rows] = await pool.execute(
    `SELECT data FROM calendario
     WHERE data > ? AND dia_util = 1
     ORDER BY data ASC
     LIMIT ?`,
    [dataInicio, quantidade]
  );

  if (rows.length < quantidade) {
    // Se não encontrou dias suficientes no banco (improvável com 30 anos)
    throw new Error('Datas insuficientes no calendário para calcular o prazo');
  }

  // O último dia da lista é a data de vencimento
  return rows[rows.length - 1].data.toISOString().split('T')[0];
}

// Conta quantos dias úteis existem entre duas datas (inclusive início, exclusive fim)
async function contarDiasUteis(dataInicio, dataFim) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as total FROM calendario
     WHERE data >= ? AND data < ? AND dia_util = 1`,
    [dataInicio, dataFim]
  );
  return rows[0].total;
}

// Verifica se uma data específica é dia útil
async function ehDiaUtil(data) {
  const [rows] = await pool.execute(
    'SELECT dia_util FROM calendario WHERE data = ?',
    [data]
  );
  return rows.length > 0 && rows[0].dia_util === 1;
}

// Retorna a data útil N dias antes de uma data (para alertas de audiência/perícia)
// Usado para: "avisar cliente 3 dias úteis antes da audiência"
async function diasUteisAntes(data, quantidade) {
  const [rows] = await pool.execute(
    `SELECT data FROM calendario
     WHERE data < ? AND dia_util = 1
     ORDER BY data DESC
     LIMIT ?`,
    [data, quantidade]
  );

  if (rows.length < quantidade) return null;
  // O último da lista (mais antigo) é a data de alerta
  return rows[rows.length - 1].data.toISOString().split('T')[0];
}

module.exports = { calcularVencimento, contarDiasUteis, ehDiaUtil, diasUteisAntes };
