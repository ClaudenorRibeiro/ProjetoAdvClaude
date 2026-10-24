// ============================================================
// CONTROLLER DE ANDAMENTO PROCESSUAL
// ------------------------------------------------------------
// Andamentos MANUAIS (lançados pelo usuário) convivem com andamentos
// AUTOMÁTICOS vindos do DataJud (fonte='datajud', sem criado_por). Os
// automáticos são SOMENTE LEITURA — não podem ser editados nem excluídos.
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { hojeBrasilia, agora } = require('../utils/helpers');
const auditoria = require('../middleware/auditoria');
const { texto, dataIso } = require('../utils/camposTexto');
const datajud = require('../services/datajudService');
const { aplicarRespostaDoProcesso, marcarNaoEncontrado } = require('../andamentosDatajud/aplicar');

// SELECT único da listagem — usa LEFT JOIN em criado_por para que os andamentos
// AUTOMÁTICOS (sem usuário) também apareçam. Ordena pela data/hora quando existe.
async function buscarAndamentos(processoId) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.data, a.data_hora, a.descricao, a.fonte, a.codigo_movimento,
            a.criado_em, a.editado_em,
            u.nome  AS criado_por_nome,
            ue.nome AS editado_por_nome
     FROM andamento_processual a
     LEFT JOIN usuarios u  ON a.criado_por  = u.id
     LEFT JOIN usuarios ue ON a.editado_por = ue.id
     WHERE a.processo_id = ?
     ORDER BY COALESCE(a.data_hora, a.data) DESC, a.id DESC`,
    [processoId]
  );
  return rows;
}

// Descrição do andamento: texto obrigatório (sem ficar só em espaços), até 1.000 caracteres.
const LIMITE_DESCRICAO = 1000;
function lerDescricao(bruto) {
  const r = texto(bruto, { rotulo: 'A descrição', max: LIMITE_DESCRICAO, obrigatorio: true });
  if (r.erro) r.erro = r.erro.replace('é obrigatório', 'é obrigatória').replace('muito longo', 'muito longa');
  return r;
}

const lerData = (bruto) => dataIso(bruto, { rotulo: 'Data' });

// GET /api/andamento/:processoId — Lista andamentos do processo
async function listar(req, res) {
  try {
    const rows = await buscarAndamentos(req.params.processoId);
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/andamento/:processoId — Registra novo andamento MANUAL
async function criar(req, res) {
  try {
    const { processoId } = req.params;
    if (!/^\d+$/.test(String(processoId))) return naoEncontrado(res, 'Processo não encontrado');
    const desc = lerDescricao((req.body || {}).descricao);
    if (desc.erro) return erro(res, desc.erro);
    const dt = lerData((req.body || {}).data);
    if (dt.erro) return erro(res, dt.erro);
    const [proc] = await pool.execute('SELECT id FROM tblproc WHERE id = ? AND ativo = 1', [processoId]);
    if (!proc.length) return naoEncontrado(res, 'Processo não encontrado');

    const dataAndamento = dt.valor || hojeBrasilia();

    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      [result] = await conn.execute(
        `INSERT INTO andamento_processual (processo_id, data, descricao, fonte, criado_por)
         VALUES (?, ?, ?, 'manual', ?)`,
        [processoId, dataAndamento, desc.valor, req.usuario.id]
      );
      await auditoria.registrar(req.usuario.id, 'andamento_processual', 'criar', result.insertId, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { id: result.insertId }, 'Andamento registrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/andamento/:id — Edita andamento (somente MANUAL)
async function editar(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT * FROM andamento_processual WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Andamento não encontrado');
    if (antes[0].fonte === 'datajud') {
      return erro(res, 'Este andamento veio do CNJ (DataJud) e não pode ser editado.');
    }
    const desc = lerDescricao((req.body || {}).descricao);
    if (desc.erro) return erro(res, desc.erro);
    const dt = lerData((req.body || {}).data);
    if (dt.erro) return erro(res, dt.erro);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE andamento_processual SET data=?, descricao=?, editado_por=?, editado_em=NOW()
         WHERE id = ?`,
        [dt.valor || antes[0].data, desc.valor, req.usuario.id, id]
      );
      await auditoria.registrar(req.usuario.id, 'andamento_processual', 'editar', id, antes[0], null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Andamento atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/andamento/:id — Exclui andamento (somente MANUAL)
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT * FROM andamento_processual WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Andamento não encontrado');
    if (antes[0].fonte === 'datajud') {
      return erro(res, 'Este andamento veio do CNJ (DataJud) e não pode ser excluído.');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM andamento_processual WHERE id = ?', [id]);
      await auditoria.registrar(req.usuario.id, 'andamento_processual', 'excluir', id, antes[0], null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Andamento excluído');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Sincronização de UM processo com o DataJud. Sincroniza no MÁXIMO 1x por dia por processo (trava em
// tblproc.datajud_sincronizado_em), a não ser que `forcar` (botão "Atualizar DataJud"). SEMPRE devolve a lista
// atual (mesmo quando não sincroniza), com um "aviso" amigável quando o DataJud falha — a tela nunca quebra por
// causa disso. Devolve o conteúdo da resposta (ou { naoEncontrado: true }); erro inesperado é lançado.
async function executarSincronizacao(processoId, forcar) {
  // 1) Integração ativa? (se não, só devolve o que já existe)
  const [cfgRows] = await pool.execute(
    "SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'datajud'"
  );
  const cfgRow = cfgRows[0];
  const ativo  = cfgRow ? !!cfgRow.ativo : false;
  if (!ativo) {
    return { andamentos: await buscarAndamentos(processoId), aviso: '',
      datajud: { tipo: 'inativo', mensagem: 'DataJud desativado (ative em Configurações → Integrações).' } };
  }
  const cfg = cfgRow && cfgRow.configuracoes
    ? (typeof cfgRow.configuracoes === 'string' ? JSON.parse(cfgRow.configuracoes) : cfgRow.configuracoes)
    : {};

  // 2) Processo + trava "1x por dia" (data em fuso de Brasília via DATE_FORMAT).
  const [procRows] = await pool.execute(
    `SELECT id, numProc,
            DATE_FORMAT(datajud_sincronizado_em, '%Y-%m-%d') AS sync_dia,
            DATE_FORMAT(datajud_sincronizado_em, '%H:%i')    AS sync_hora
     FROM tblproc WHERE id = ?`,
    [processoId]
  );
  if (!procRows.length) return { naoEncontrado: true };
  const proc = procRows[0];

  const hoje = hojeBrasilia();
  if (!forcar && proc.sync_dia && proc.sync_dia === hoje) {
    return { andamentos: await buscarAndamentos(processoId), aviso: '',
      datajud: { tipo: 'ja_hoje', mensagem: `DataJud sincronizado hoje às ${proc.sync_hora}.` } };
  }
  if (!proc.numProc || !String(proc.numProc).trim()) {
    // Sem número CNJ não há como consultar; não trava o dia (pode ser cadastrado depois).
    return { andamentos: await buscarAndamentos(processoId), aviso: '',
      datajud: { tipo: 'sem_numero', mensagem: 'Processo sem número CNJ — nada a consultar no DataJud.' } };
  }

  // 3) Consulta o DataJud. Falha de rede NÃO trava o dia (permite nova tentativa).
  let resultado;
  try {
    resultado = await datajud.buscarMovimentos({
      url: cfg.url, apikey: cfg.apikey, numProc: proc.numProc,
    });
  } catch (e) {
    return { andamentos: await buscarAndamentos(processoId), aviso: e.message,
      datajud: { tipo: 'erro', mensagem: e.message } };
  }

  const nowBR  = agora().replace('T', ' '); // datetime de Brasília p/ a trava diária
  const horaBR = nowBR.slice(11, 16);        // HH:MM para as mensagens de status

  // Tribunal não coberto por esta versão: marca o dia (é determinístico) e devolve.
  if (!resultado.suportado) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE tblproc SET datajud_sincronizado_em = ? WHERE id = ?', [nowBR, processoId]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return { andamentos: await buscarAndamentos(processoId), aviso: '',
      datajud: { tipo: 'nao_suportado', mensagem: 'O tribunal deste processo ainda não é coberto pela sincronização automática.' } };
  }

  // 4) Grava pelo caminho ÚNICO (o mesmo da consulta noturna): só os últimos 6 meses, sem repetir andamento, e o que entra
  //    depois da primeira leitura do processo fica marcado como novidade para o resumo da manhã. O CNJ não ter o processo
  //    marca o dia (a noite só tenta de novo em uma semana).
  let novos = 0;
  if (resultado.achou) {
    novos = (await aplicarRespostaDoProcesso(processoId, { movimentos: resultado.movimentos, atualizado: resultado.atualizado }, hoje)).inseridos;
  } else {
    await marcarNaoEncontrado(processoId);
  }

  // Status final: consultou e achou X registros, ou consultou e não achou nada.
  // (nome diferente do serviço 'datajud' para não colidir com ele nesta função)
  const statusDj = resultado.movimentos.length
    ? { tipo: 'ok',    mensagem: `Consulta ao DataJud concluída às ${horaBR}.`, novos }
    : { tipo: 'vazio', mensagem: `Consulta concluída às ${horaBR} — nenhum registro encontrado no DataJud.` };
  return { andamentos: await buscarAndamentos(processoId), aviso: '', datajud: statusDj, novos };
}

// Uma consulta por vez por processo: se mais de um usuário (ou o botão "Atualizar DataJud") pedir o mesmo processo enquanto
// a consulta está em andamento, todos recebem o resultado da MESMA consulta (nunca duas idas ao DataJud ao mesmo tempo).
const sincronizacoesEmAndamento = new Map();
function sincronizarUmaVez(processoId, forcar) {
  const chave = String(processoId);
  if (!sincronizacoesEmAndamento.has(chave)) {
    const consulta = executarSincronizacao(processoId, forcar).finally(() => sincronizacoesEmAndamento.delete(chave));
    sincronizacoesEmAndamento.set(chave, consulta);
  }
  return sincronizacoesEmAndamento.get(chave);
}

// POST /api/andamento/:processoId/sincronizar   (corpo opcional: { forcar: true } ignora o limite de 1x por dia)
// Disparado pela tela ao abrir os andamentos do processo (em segundo plano) e pelo botão "Atualizar DataJud".
async function sincronizar(req, res) {
  try {
    const resultado = await sincronizarUmaVez(req.params.processoId, req.body?.forcar === true);
    if (resultado.naoEncontrado) return naoEncontrado(res, 'Processo não encontrado');
    return sucesso(res, resultado);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, editar, excluir, sincronizar };
