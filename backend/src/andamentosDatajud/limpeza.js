// ============================================================
// A LIMPEZA DOS 6 MESES: o banco nunca guarda andamento do DataJud com mais de 6 meses (a aba Andamentos também só
// mostra esse período). Só apaga o que veio do DataJud; andamento manual e os criados por prazo ou tarefa nunca são
// apagados. O dia do último movimento fica guardado no processo (datajud_ultima_movimentacao), então "processos parados"
// não é afetado. Apaga em pedaços de 2.000 (para não segurar o banco). Devolve quantos foram apagados.
// ============================================================
const { pool } = require('../config/database');

const PEDACO = 2000;

async function apagarAndamentosAntigosDoDataJud() {
  let total = 0;
  for (;;) {
    const [r] = await pool.execute(
      `DELETE FROM andamento_processual WHERE fonte = 'datajud' AND data < DATE_SUB(CURDATE(), INTERVAL 6 MONTH) LIMIT ${PEDACO}`
    );
    total += r.affectedRows;
    if (r.affectedRows < PEDACO) return total;
  }
}

module.exports = { apagarAndamentosAntigosDoDataJud };
