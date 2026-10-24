// ============================================================
// QUAIS PROCESSOS A CONSULTA NOTURNA PEDE AO DATAJUD: ativos, com status que não encerra (arquivado não entra), com
// número CNJ de tribunal coberto, ainda não consultados hoje (o botão "Atualizar DataJud" pode ter consultado) e, se o
// CNJ não os achou, só depois de uma semana. O mesmo número em várias pastas (apenso) é pedido UMA vez e vale para todas
// as linhas.
// ============================================================
const { pool } = require('../config/database');
const { aliasDoTribunal } = require('../services/datajudService');

// Devolve [{ alias, numeros: Map(numeroSoDigitos -> [idsDosProcessos]) }]
async function processosParaConsultar(exec = pool) {
  const [linhas] = await exec.execute(
    `SELECT pr.id, pr.numProc
       FROM tblproc pr
       LEFT JOIN tblstatusproc sp ON sp.id = pr.status_id
      WHERE pr.ativo = 1
        AND pr.numProc IS NOT NULL AND pr.numProc <> ''
        AND COALESCE(sp.encerra_processo, 0) = 0
        AND (pr.datajud_sincronizado_em IS NULL OR DATE(pr.datajud_sincronizado_em) < CURDATE())
        AND (pr.datajud_nao_encontrado_em IS NULL OR pr.datajud_nao_encontrado_em <= DATE_SUB(CURDATE(), INTERVAL 7 DAY))
      ORDER BY pr.id`
  );
  const porTribunal = new Map();
  for (const l of linhas) {
    const numero = String(l.numProc || '').replace(/\D/g, '');
    const alias = aliasDoTribunal(numero);
    if (alias === null) continue;
    const doTribunal = porTribunal.get(alias) || new Map();
    doTribunal.set(numero, [...(doTribunal.get(numero) || []), l.id]);
    porTribunal.set(alias, doTribunal);
  }
  return [...porTribunal].map(([alias, numeros]) => ({ alias, numeros }));
}

module.exports = { processosParaConsultar };
