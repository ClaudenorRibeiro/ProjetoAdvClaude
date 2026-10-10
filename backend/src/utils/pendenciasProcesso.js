// Trava de ARQUIVAMENTO do processo (regra do usuário, 10/10/2026): processo arquivado = nada mais pendente.
// "Arquivar" é mudar o status do processo para um status marcado "encerra o processo" (tblstatusproc.encerra_processo),
// seja pela edição do processo ou pela etiqueta do escritório ligada a um status. As duas rotas usam ESTA função.
// Conta pelo STATUS de cada item (a data não importa): parcela/multa a receber, repasse que falta, prazo não concluído
// nem cancelado, tarefa não concluída, audiência agendada/adiada e perícia agendada/aguardando data.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Lê só o que falta em aberto. `conn` pode ser a conexão da transação (os números valem para o momento da gravação).
async function pendenciasDoProcesso(conn, processoId) {
  const um = async (sql) => Number((await conn.execute(sql, [processoId]))[0][0].n) || 0;
  const [parcelas, multas, repassesParcela, repassesMulta, prazos, tarefas, audiencias, pericias] = await Promise.all([
    um(`SELECT COUNT(*) AS n FROM acordo_parcela ap JOIN acordo a ON a.id = ap.acordo_id
         WHERE a.processo_id = ? AND a.status <> 'cancelado' AND ap.status = 'pendente'`),
    um(`SELECT COUNT(*) AS n FROM acordo_parcela_multa m JOIN acordo_parcela ap ON ap.id = m.parcela_id JOIN acordo a ON a.id = ap.acordo_id
         WHERE a.processo_id = ? AND a.status <> 'cancelado' AND m.status = 'pendente'`),
    // mesmos critérios da lista "Repasses pendentes" do Financeiro (cliente e parceiro contados separados)
    um(`SELECT COALESCE(SUM((ap.valor_liquido > 0 AND ap.repasse_cliente_em IS NULL)
                          + (ap.parceria_pessoa_id IS NOT NULL AND ap.repasse_parceiro_em IS NULL)), 0) AS n
          FROM acordo_parcela ap JOIN acordo a ON a.id = ap.acordo_id
         WHERE a.processo_id = ? AND ap.status = 'pago'`),
    um(`SELECT COALESCE(SUM((m.repasse_cliente_habilitado = 1 AND m.valor_liquido > 0 AND m.repasse_cliente_em IS NULL)
                          + (m.repasse_parceiro_habilitado = 1 AND m.parceria_pessoa_id IS NOT NULL AND m.repasse_parceiro_em IS NULL)), 0) AS n
          FROM acordo_parcela_multa m JOIN acordo_parcela ap ON ap.id = m.parcela_id JOIN acordo a ON a.id = ap.acordo_id
         WHERE a.processo_id = ? AND m.status = 'pago'`),
    um(`SELECT COUNT(*) AS n FROM prazos_processo WHERE processo_id = ? AND COALESCE(status, 'aberto') NOT IN ('concluido', 'cancelado')`),
    um(`SELECT COUNT(*) AS n FROM tarefas WHERE processo_id = ? AND COALESCE(concluida, 0) = 0`),
    um(`SELECT COUNT(*) AS n FROM audiencia WHERE processo_id = ? AND status IN ('agendada', 'adiada')`),
    um(`SELECT COUNT(*) AS n FROM pericia WHERE processo_id = ? AND status IN ('agendada', 'aguardando_data')`),
  ]);
  const itens = [];
  if (parcelas) itens.push(plural(parcelas, 'parcela a receber', 'parcelas a receber'));
  if (multas) itens.push(plural(multas, 'multa a receber', 'multas a receber'));
  const repasses = repassesParcela + repassesMulta;
  if (repasses) itens.push(plural(repasses, 'repasse a fazer', 'repasses a fazer'));
  if (prazos) itens.push(plural(prazos, 'prazo em aberto', 'prazos em aberto'));
  if (tarefas) itens.push(plural(tarefas, 'tarefa em aberto', 'tarefas em aberto'));
  if (audiencias) itens.push(plural(audiencias, 'audiência em aberto', 'audiências em aberto'));
  if (pericias) itens.push(plural(pericias, 'perícia em aberto', 'perícias em aberto'));
  return itens;
}

async function statusEncerra(conn, statusId) {
  if (!statusId) return false;
  const [r] = await conn.execute('SELECT encerra_processo FROM tblstatusproc WHERE id = ? LIMIT 1', [statusId]);
  return !!(r.length && r[0].encerra_processo);
}

// Devolve o texto do aviso quando a troca de status ARQUIVA o processo (de um status que não encerra para um que encerra)
// e ainda há pendência; senão null. Quem já está encerrado e vai para outro encerrado não é barrado.
async function motivoDeNaoArquivar(conn, processoId, statusAnteriorId, statusNovoId) {
  if (!statusNovoId || Number(statusAnteriorId) === Number(statusNovoId)) return null;
  if (!(await statusEncerra(conn, statusNovoId))) return null;
  if (await statusEncerra(conn, statusAnteriorId)) return null;
  const itens = await pendenciasDoProcesso(conn, processoId);
  if (!itens.length) return null;
  return `Não é possível arquivar: ${itens.join(', ')}.`;
}

module.exports = { pendenciasDoProcesso, motivoDeNaoArquivar };
