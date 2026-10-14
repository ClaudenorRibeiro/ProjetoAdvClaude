// PROCESSO APENSO (pedido do usuário, 14/10/2026).
// Apenso = processo de OUTRA pessoa (falência, recuperação judicial, inventário...) que o escritório "pendura" nos processos
// dos clientes que têm crédito contra o réu. Cada apenso é uma linha própria (tblproc.apenso_de_id) DENTRO da pasta do cliente,
// ligada a UM processo comum da MESMA pasta. O mesmo número pode estar em várias pastas (uma vez por pasta) — é o ÚNICO caso em
// que o número de processo repete; nunca é igual ao de um processo comum.
// Tem prazos, tarefas, andamentos manuais e financeiro como qualquer processo; NÃO tem audiência nem perícia.
// Este arquivo concentra as regras para não espalhar a lógica pelos controllers:
//   - achar/conferir o processo principal;
//   - números e protocolos repetidos (comum × apenso);
//   - ARQUIVAR o principal arquiva os apensos abertos junto (com aviso e confirmação; pendência de apenso BLOQUEIA);
//   - EXCLUIR o principal exclui os apensos junto (só se nenhum tiver ligação com outros cadastros, e após confirmação).
// Respostas de aviso: { status, mensagem, detalhes? }; quem chama devolve com erro(res, mensagem, status, detalhes).
// Confirmação em dois passos: 409 com detalhes.codigo = CONFIRMAR_ARQUIVAMENTO_DE_APENSOS / CONFIRMAR_EXCLUSAO_DE_APENSOS e
// detalhes.apensos = [{ id, numProc }]; a tela reenvia com confirmar_apensos (true no corpo ao arquivar; ?confirmar_apensos=1 ao excluir).

const auditoria = require('../middleware/auditoria');
const { motivoDeNaoArquivar, arquivaAgora, statusEncerra } = require('./pendenciasProcesso');

const rotuloDoApenso = (a) => a.numProc || `#${a.id}`;
const listaDe = (apensos) => apensos.map(a => ({ id: a.id, numProc: a.numProc }));

// O processo ao qual o apenso será ligado: existe, está ativo e é COMUM (apenso de apenso não existe).
// Devolve { principal: { id, pasta_id } } ou { aviso: { status, mensagem } }.
async function lerPrincipalDoApenso(conn, principalId) {
  const id = Number(principalId);
  if (!Number.isInteger(id) || id <= 0) return { aviso: { status: 400, mensagem: 'O processo principal é inválido' } };
  const [rows] = await conn.execute(
    'SELECT id, pasta_id, apenso_de_id FROM tblproc WHERE id = ? AND ativo = 1 FOR SHARE', [id]
  );
  if (!rows.length) return { aviso: { status: 404, mensagem: 'Processo principal não encontrado' } };
  if (rows[0].apenso_de_id !== null) {
    return { aviso: { status: 400, mensagem: 'Um apenso não pode ser o processo principal de outro apenso' } };
  }
  return { principal: { id: rows[0].id, pasta_id: rows[0].pasta_id } };
}

// Os apensos ATIVOS de um processo principal (trava as linhas: ninguém muda no meio da operação).
async function apensosAtivosDe(conn, principalId) {
  const [rows] = await conn.execute(
    'SELECT id, numProc, NomeTituloProc, status_id FROM tblproc WHERE apenso_de_id = ? AND ativo = 1 ORDER BY id FOR UPDATE',
    [principalId]
  );
  return rows;
}

// Número e protocolo repetidos. Processo COMUM: único entre os comuns ativos E não pode ser número de apenso. APENSO: só não
// repete dentro da MESMA pasta e nunca é igual ao de um comum. O banco antigo não tem índice único nesses campos: a conferência
// é feita aqui (quem cria apenso trava a linha da pasta antes, ver criarProcesso). Devolve a mensagem ou null.
async function conferirRepetidos(conn, numProc, protocolo, { ignorarId = null, ficha, apensoNaPasta = null }) {
  const final = ficha === 'novo' ? 'no sistema' : 'em outro processo';
  const ehApenso = apensoNaPasta !== null;
  const ignorar = ignorarId !== null ? ' AND id <> ?' : '';
  const extra = ignorarId !== null ? [ignorarId] : [];
  if (numProc) {
    const [comum] = await conn.execute(
      `SELECT id FROM tblproc WHERE numProc = ? AND ativo = 1 AND apenso_de_id IS NULL${ignorar} LIMIT 1`, [numProc, ...extra]
    );
    if (comum.length) return `O número de processo "${numProc}" já está cadastrado ${final}`;
    const [apenso] = await conn.execute(
      `SELECT id FROM tblproc WHERE numProc = ? AND ativo = 1 AND apenso_de_id IS NOT NULL${ehApenso ? ' AND pasta_id = ?' : ''}${ignorar} LIMIT 1`,
      [numProc, ...(ehApenso ? [apensoNaPasta] : []), ...extra]
    );
    if (apenso.length) {
      return ehApenso
        ? `O apenso "${numProc}" já está cadastrado nesta pasta`
        : `O número "${numProc}" já está cadastrado como apenso em outra pasta`;
    }
  }
  if (protocolo) {
    const [dup] = await conn.execute(
      `SELECT id FROM tblproc WHERE protocolo = ? AND ativo = 1 AND apenso_de_id IS ${ehApenso ? 'NOT NULL AND pasta_id = ?' : 'NULL'}${ignorar} LIMIT 1`,
      [protocolo, ...(ehApenso ? [apensoNaPasta] : []), ...extra]
    );
    if (dup.length) return ehApenso ? `O protocolo "${protocolo}" já está cadastrado nesta pasta` : `O protocolo "${protocolo}" já está cadastrado ${final}`;
  }
  return null;
}

// Confere se o principal pode ser arquivado COM os apensos. Roda ANTES de gravar o novo status. Só age quando a troca ARQUIVA
// agora e há apenso ainda aberto: pendência de apenso bloqueia (422); sem confirmação, avisa (409). Devolve { status, mensagem, detalhes? } ou null.
async function conferirArquivamentoComApensos(conn, principalId, statusAnteriorId, statusNovoId, confirmado) {
  if (!(await arquivaAgora(conn, statusAnteriorId, statusNovoId))) return null;
  const abertos = [];
  for (const a of await apensosAtivosDe(conn, principalId)) {
    if (!(await statusEncerra(conn, a.status_id))) abertos.push(a);
  }
  if (!abertos.length) return null;
  const pendentes = [];
  for (const a of abertos) {
    const motivo = await motivoDeNaoArquivar(conn, a.id, a.status_id, statusNovoId);
    if (motivo) pendentes.push(`o apenso ${rotuloDoApenso(a)} — ${motivo.replace('Não é possível arquivar: ', '')}`);
  }
  if (pendentes.length) return { status: 422, mensagem: `Não é possível arquivar: ${pendentes.join('; ')}` };
  if (confirmado !== true) {
    return {
      status: 409,
      mensagem: `Este processo tem ${abertos.length} apenso(s): ${abertos.map(rotuloDoApenso).join(', ')}. Ao arquivar, o(s) apenso(s) também será(ão) arquivado(s).`,
      detalhes: { codigo: 'CONFIRMAR_ARQUIVAMENTO_DE_APENSOS', apensos: listaDe(abertos) },
    };
  }
  return null;
}

// Arquiva os apensos abertos do principal com o MESMO status (depois de o principal ter sido arquivado). Apenso já arquivado
// não é tocado. O histórico do apenso guarda a origem 'arquivamento_do_principal'. Devolve os ids arquivados.
async function arquivarApensosJunto(conn, principalId, statusAnteriorId, statusNovoId, usuarioId, motivo) {
  if (!(await arquivaAgora(conn, statusAnteriorId, statusNovoId))) return [];
  const [nomeRows] = await conn.execute(
    `SELECT id, nome FROM tblstatusproc WHERE id IN (${[statusAnteriorId, statusNovoId].filter(Boolean).map(() => '?').join(',') || 'NULL'})`,
    [statusAnteriorId, statusNovoId].filter(Boolean)
  );
  const nomes = Object.fromEntries(nomeRows.map(r => [Number(r.id), r.nome]));
  const arquivados = [];
  for (const a of await apensosAtivosDe(conn, principalId)) {
    if (await statusEncerra(conn, a.status_id)) continue;   // já estava arquivado: continua como está
    await conn.execute(
      'UPDATE tblproc SET status_id = ?, alterado_por = ?, alterado_em = NOW() WHERE id = ?', [statusNovoId, usuarioId, a.id]
    );
    const anterior = a.status_id ? Number(a.status_id) : null;
    await auditoria.registrar(usuarioId, 'tblproc', 'status', a.id, null, {
      campo: 'status_id',
      status_anterior_id: anterior,
      status_anterior: anterior ? (nomes[anterior] || null) : null,
      status_novo_id: statusNovoId,
      status_novo: nomes[Number(statusNovoId)] || null,
      motivo: (motivo && String(motivo).trim()) || null,
      origem: 'arquivamento_do_principal',
    }, conn);
    arquivados.push(a.id);
  }
  return arquivados;
}

// O que impede apagar o processo: qualquer trabalho ou dinheiro pendurado nele. conta_corrente e acordo estão aqui por um motivo
// crítico: a FK das duas é ON DELETE CASCADE, então sem estas checagens o DELETE apagaria o financeiro em silêncio.
const VERIFICACOES_EXCLUSAO = [
  { tabela: 'andamento_processual', coluna: 'processo_id', label: 'andamento(s) processual(is)' },
  { tabela: 'audiencia',            coluna: 'processo_id', label: 'audiência(s)'                 },
  { tabela: 'pericia',              coluna: 'processo_id', label: 'perícia(s)'                   },
  { tabela: 'prazos_processo',      coluna: 'processo_id', label: 'prazo(s)'                     },
  { tabela: 'tarefas',              coluna: 'processo_id', label: 'tarefa(s)'                    },
  { tabela: 'acordo',               coluna: 'processo_id', label: 'acordo(s)/alvará(s) no financeiro' },
  { tabela: 'conta_corrente',       coluna: 'processo_id', label: 'lançamento(s) na conta corrente' },
  { tabela: 'log_comunicacoes',     coluna: 'processo_id', label: 'comunicação(ões) registrada(s)' },
];
async function dependenciasDoProcesso(conn, processoId) {
  const bloqueios = [];
  for (const v of VERIFICACOES_EXCLUSAO) {
    const [[{ total }]] = await conn.execute(`SELECT COUNT(*) AS total FROM ${v.tabela} WHERE ${v.coluna} = ?`, [processoId]);
    if (total > 0) bloqueios.push(`${total} ${v.label}`);
  }
  return bloqueios;
}

// Prepara a exclusão do principal: os apensos só saem junto se nenhum tiver ligação com outros cadastros (409 com o que pende)
// e depois de o usuário confirmar (409 com o código). Devolve { apensos } (a apagar) ou { aviso }.
async function conferirExclusaoComApensos(conn, principalId, confirmado) {
  const apensos = await apensosAtivosDe(conn, principalId);
  if (!apensos.length) return { apensos: [] };
  const bloqueios = [];
  for (const a of apensos) {
    const dep = await dependenciasDoProcesso(conn, a.id);
    if (dep.length) bloqueios.push(`o apenso ${rotuloDoApenso(a)} possui: ${dep.join(', ')}`);
  }
  if (bloqueios.length) {
    return { aviso: { status: 400, mensagem: `Não é possível excluir este processo — ${bloqueios.join('; ')}. Remova esses registros antes de excluir.` } };
  }
  if (confirmado !== true) {
    return { aviso: {
      status: 409,
      mensagem: `Este processo tem ${apensos.length} apenso(s): ${apensos.map(rotuloDoApenso).join(', ')}. Ao excluir, o(s) apenso(s) também será(ão) excluído(s).`,
      detalhes: { codigo: 'CONFIRMAR_EXCLUSAO_DE_APENSOS', apensos: listaDe(apensos) },
    } };
  }
  return { apensos };
}

// Apaga o processo e o que é só dele (partes, peritos, assuntos, OABs). O que está pendurado nele já foi conferido antes.
// As PESSOAS continuam no cadastro (as tabelas de partes não têm FK para pessoas). Auditoria na MESMA transação, guardando o número.
async function apagarProcessoEFilhos(conn, id, usuarioId, antes) {
  await conn.execute('DELETE FROM tbltituloprocautor WHERE proc_id = ?', [id]);
  await conn.execute('DELETE FROM tbltituloprocreu   WHERE proc_id = ?', [id]);
  await conn.execute('DELETE FROM processo_perito    WHERE proc_id = ?', [id]);
  await conn.execute('DELETE FROM processo_assunto   WHERE processo_id = ?', [id]);
  await conn.execute('DELETE FROM processo_oabs      WHERE processo_id = ?', [id]);
  await conn.execute('DELETE FROM tblproc WHERE id = ?', [id]);
  await auditoria.registrar(usuarioId, 'tblproc', 'excluir', Number(id),
    { numProc: antes.numProc, titulo: antes.NomeTituloProc }, null, conn);
}

module.exports = {
  lerPrincipalDoApenso, apensosAtivosDe, conferirRepetidos,
  conferirArquivamentoComApensos, arquivarApensosJunto,
  dependenciasDoProcesso, conferirExclusaoComApensos, apagarProcessoEFilhos,
};
