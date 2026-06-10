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
    // Dias corridos: data início = dia 1, então soma quantidade - 1
    const data = new Date(dataInicio + 'T12:00:00');
    data.setDate(data.getDate() + quantidade - 1);
    return data.toISOString().split('T')[0];
  }

  // Dias úteis: usa >= para incluir a data início se ela for dia útil (dia 1 da contagem)
  // Se a data início for feriado/fim de semana, ela não será contada (dia_util = 0)
  // Nota: LIMIT com parâmetro bound (?) não funciona corretamente no mysql2 —
  //       por isso embutimos o inteiro diretamente na query (sem risco: já é parseInt)
  const qtd = parseInt(quantidade);
  const [rows] = await pool.execute(
    `SELECT data FROM calendario
     WHERE data >= ? AND dia_util = 1
     ORDER BY data ASC
     LIMIT ${qtd}`,
    [dataInicio]
  );

  if (rows.length < quantidade) {
    // Se não encontrou dias suficientes no banco (improvável com 30 anos)
    throw new Error('Datas insuficientes no calendário para calcular o prazo');
  }

  // dateStrings: true na config do pool faz o MySQL2 retornar DATE já como string 'YYYY-MM-DD'
  return rows[rows.length - 1].data;
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
  const qtd = parseInt(quantidade);
  const [rows] = await pool.execute(
    `SELECT data FROM calendario
     WHERE data < ? AND dia_util = 1
     ORDER BY data DESC
     LIMIT ${qtd}`,
    [data]
  );

  if (rows.length < quantidade) return null;
  // dateStrings: true → data já vem como string 'YYYY-MM-DD'
  return rows[rows.length - 1].data;
}

module.exports = { calcularVencimento, contarDiasUteis, ehDiaUtil, diasUteisAntes };
