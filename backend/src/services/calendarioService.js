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

// Calcula a QUANTIDADE de dias a partir de uma data final (o inverso de calcularVencimento).
// Usado quando o usuário digita a data final direto e o sistema preenche o campo "dias".
// dataInicio / dataFinal: strings 'YYYY-MM-DD'
// tipoDias: 'uteis' ou 'corridos'
// Retorna: número inteiro de dias (contagem INCLUSIVA de início e fim, casando com calcularVencimento),
//          ou null se faltar dado ou a data final for anterior à de início.
async function calcularQuantidade(dataInicio, dataFinal, tipoDias) {
  if (!dataInicio || !dataFinal) return null;
  // Datas em ISO ('YYYY-MM-DD') comparam corretamente como texto → final não pode ser antes do início
  if (dataFinal < dataInicio) return null;

  if (tipoDias === 'corridos') {
    // Dias corridos: conta todos os dias do calendário, incluindo os dois extremos
    const ini = new Date(dataInicio + 'T12:00:00');
    const fim = new Date(dataFinal  + 'T12:00:00');
    const dias = Math.round((fim - ini) / 86400000) + 1; // +1 = inclui a data de início
    return dias;
  }

  // Dias úteis: conta quantos dias úteis existem entre início e final, inclusive os dois extremos
  // (mesmo critério do cálculo direto: a data início conta como dia 1 se for dia útil).
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as total FROM calendario
     WHERE data >= ? AND data <= ? AND dia_util = 1`,
    [dataInicio, dataFinal]
  );
  return rows[0].total;
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

// Retorna o PRÓXIMO dia útil em/depois de uma data (para vencimentos de parcelas de acordo).
// Se a própria data já é dia útil, retorna ela mesma. Fallback: a própria data.
async function proximoDiaUtil(data) {
  // Se a data está FORA da faixa do calendário (ex.: anterior ao início dos 30 anos cadastrados),
  // não há como saber o próximo dia útil → devolve a própria data (evita "colar" no 1º dia do calendário).
  const [existe] = await pool.execute('SELECT 1 FROM calendario WHERE data = ? LIMIT 1', [data]);
  if (!existe.length) return data;

  const [rows] = await pool.execute(
    `SELECT data FROM calendario
     WHERE data >= ? AND dia_util = 1
     ORDER BY data ASC
     LIMIT 1`,
    [data]
  );
  // dateStrings: true → data já vem como string 'YYYY-MM-DD'
  return rows.length ? rows[0].data : data;
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

module.exports = { calcularVencimento, calcularQuantidade, contarDiasUteis, ehDiaUtil, diasUteisAntes, proximoDiaUtil };
