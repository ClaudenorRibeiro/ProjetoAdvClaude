// ============================================================
// APLICAR NO PROCESSO O QUE O DATAJUD DEVOLVEU (o botão "Atualizar DataJud" e a consulta noturna usam o MESMO caminho).
// - Primeira leitura do processo (ainda não se sabia nada dele): os movimentos entram só como base, sem aviso.
// - Leituras seguintes: se a data de atualização do CNJ e a quantidade de movimentos são as mesmas, nada é regravado;
//   se mudaram, entram só os movimentos novos (dos últimos 6 meses) e eles ficam marcados como novidade.
// Tudo numa transação só, com o processo travado (o botão e a noite não se atropelam).
// ============================================================
const { pool } = require('../config/database');
const { corteDosSeisMeses, resumirMovimentos, gravarMovimentosNovos } = require('./gravar');

// Grava o resultado de uma consulta que ACHOU o processo. resposta = { movimentos, atualizado }.
// Devolve { inseridos, novidades } (quantos andamentos entraram e quantos deles são novidade).
async function aplicarRespostaDoProcesso(processoId, resposta, hoje) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const corte = await corteDosSeisMeses(conn);
    const { quantidade, ultimaData } = resumirMovimentos(resposta.movimentos);
    const [procs] = await conn.execute(
      `SELECT datajud_atualizado_cnj, datajud_qtd_movimentos,
              DATE_FORMAT(datajud_ultima_movimentacao, '%Y-%m-%d') AS ultima
         FROM tblproc WHERE id = ? FOR UPDATE`,
      [processoId]
    );
    if (!procs.length) { await conn.rollback(); return { inseridos: 0, novidades: 0 }; }
    const proc = procs[0];
    const primeiraLeitura = proc.datajud_qtd_movimentos === null;
    const semMudanca = !primeiraLeitura && resposta.atualizado !== null
      && proc.datajud_atualizado_cnj === resposta.atualizado && proc.datajud_qtd_movimentos === quantidade;
    const inseridos = semMudanca
      ? 0
      : await gravarMovimentosNovos(conn, processoId, resposta.movimentos, { hoje, corte, novidade: !primeiraLeitura });
    const maisRecente = ultimaData !== null && (proc.ultima === null || ultimaData > proc.ultima) ? ultimaData : proc.ultima;
    await conn.execute(
      `UPDATE tblproc SET datajud_atualizado_cnj = ?, datajud_qtd_movimentos = ?, datajud_ultima_movimentacao = ?,
              datajud_nao_encontrado_em = NULL, datajud_sincronizado_em = NOW()
        WHERE id = ?`,
      [resposta.atualizado, quantidade, maisRecente, processoId]
    );
    await conn.commit();
    return { inseridos, novidades: primeiraLeitura ? 0 : inseridos };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// O CNJ respondeu mas não achou o processo (sigilo ou tribunal sem dados): marca o dia; a noite tenta de novo em uma semana.
async function marcarNaoEncontrado(processoId) {
  await pool.execute(
    'UPDATE tblproc SET datajud_nao_encontrado_em = CURDATE(), datajud_sincronizado_em = NOW() WHERE id = ?',
    [processoId]
  );
}

module.exports = { aplicarRespostaDoProcesso, marcarNaoEncontrado };
