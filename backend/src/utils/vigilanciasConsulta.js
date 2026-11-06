// CONSULTA DE VIGILÂNCIAS ATIVAS POR PROCESSO (pedido do usuário, 06/11/2026): usada para mostrar o aviso de
// vigilância em qualquer tela que precise saber, de um ou mais processos, se algum deles tem vigilância
// "aguardando" — hoje usado por Publicações (👁 na lista + aviso ao abrir). Não grava nada.

// Devolve um Map processo_id -> [nome do tipo, ...] (só processos com ao menos uma vigilância "aguardando").
// `execPoolOuConn`: `pool` ou uma conexão de transação já aberta.
async function vigilanciasAtivasPorProcessos(execPoolOuConn, processoIds) {
  const ids = [...new Set((processoIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return new Map();
  const [linhas] = await execPoolOuConn.query(
    `SELECT v.processo_id, t.nome AS tipo_nome
       FROM vigilancia v JOIN vigilancia_tipo t ON t.id = v.tipo_id
      WHERE v.situacao = 'aguardando' AND v.processo_id IN (?)`,
    [ids]
  );
  const mapa = new Map();
  for (const l of linhas) {
    if (!mapa.has(l.processo_id)) mapa.set(l.processo_id, []);
    mapa.get(l.processo_id).push(l.tipo_nome);
  }
  return mapa;
}

module.exports = { vigilanciasAtivasPorProcessos };
