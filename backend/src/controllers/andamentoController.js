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
const datajud = require('../services/datajudService');

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
    const { data, descricao } = req.body;

    if (!descricao) return erro(res, 'A descrição é obrigatória');

    const dataAndamento = data || hojeBrasilia();

    const [result] = await pool.execute(
      `INSERT INTO andamento_processual (processo_id, data, descricao, fonte, criado_por)
       VALUES (?, ?, ?, 'manual', ?)`,
      [processoId, dataAndamento, descricao.trim(), req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Andamento registrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/andamento/:id — Edita andamento (somente MANUAL)
async function editar(req, res) {
  try {
    const { id } = req.params;
    const { data, descricao } = req.body;

    const [antes] = await pool.execute('SELECT * FROM andamento_processual WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Andamento não encontrado');
    if (antes[0].fonte === 'datajud') {
      return erro(res, 'Este andamento veio do CNJ (DataJud) e não pode ser editado.');
    }

    await pool.execute(
      `UPDATE andamento_processual SET data=?, descricao=?, editado_por=?, editado_em=NOW()
       WHERE id = ?`,
      [data || antes[0].data, descricao.trim(), req.usuario.id, id]
    );

    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'editar', id, antes[0]);
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

    await pool.execute('DELETE FROM andamento_processual WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'andamento_processual', 'excluir', id, antes[0]);
    return sucesso(res, null, 'Andamento excluído');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/andamento/:processoId/sincronizar
// Disparado ao ABRIR os andamentos do processo. Sincroniza com o DataJud no
// MÁXIMO 1x por dia por processo (trava em tblproc.datajud_sincronizado_em).
// SEMPRE devolve a lista atual (mesmo quando não sincroniza), com um "aviso"
// amigável quando o DataJud falha — a tela nunca quebra por causa disso.
async function sincronizar(req, res) {
  try {
    const { processoId } = req.params;

    // 1) Integração ativa? (se não, só devolve o que já existe)
    const [cfgRows] = await pool.execute(
      "SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'datajud'"
    );
    const cfgRow = cfgRows[0];
    const ativo  = cfgRow ? !!cfgRow.ativo : false;
    if (!ativo) {
      return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: '',
        datajud: { tipo: 'inativo', mensagem: 'DataJud desativado (ative em Configurações → Integrações).' } });
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
    if (!procRows.length) return naoEncontrado(res, 'Processo não encontrado');
    const proc = procRows[0];

    const hoje = hojeBrasilia();
    if (proc.sync_dia && proc.sync_dia === hoje) {
      return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: '',
        datajud: { tipo: 'ja_hoje', mensagem: `DataJud sincronizado hoje às ${proc.sync_hora}.` } });
    }
    if (!proc.numProc || !String(proc.numProc).trim()) {
      // Sem número CNJ não há como consultar; não trava o dia (pode ser cadastrado depois).
      return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: '',
        datajud: { tipo: 'sem_numero', mensagem: 'Processo sem número CNJ — nada a consultar no DataJud.' } });
    }

    // 3) Consulta o DataJud. Falha de rede NÃO trava o dia (permite nova tentativa).
    let resultado;
    try {
      resultado = await datajud.buscarMovimentos({
        url: cfg.url, apikey: cfg.apikey, numProc: proc.numProc,
      });
    } catch (e) {
      return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: e.message,
        datajud: { tipo: 'erro', mensagem: e.message } });
    }

    const nowBR  = agora().replace('T', ' '); // datetime de Brasília p/ a trava diária
    const horaBR = nowBR.slice(11, 16);        // HH:MM para as mensagens de status

    // Tribunal não coberto por esta versão: marca o dia (é determinístico) e devolve.
    if (!resultado.suportado) {
      await pool.execute('UPDATE tblproc SET datajud_sincronizado_em = ? WHERE id = ?', [nowBR, processoId]);
      return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: '',
        datajud: { tipo: 'nao_suportado', mensagem: 'O tribunal deste processo ainda não é coberto pela sincronização automática.' } });
    }

    // 4) Monta candidatos com a impressão digital (dedup) e ignora vazios.
    const candidatos = [];
    for (const m of resultado.movimentos) {
      if (!m || (m.nome == null && m.codigo == null)) continue;
      const dh = datajud.parseDataHora(m.dataHora);
      candidatos.push({
        hash: datajud.hashMovimento(processoId, m),
        codigo: m.codigo != null ? Number(m.codigo) : null,
        descricao: datajud.descricaoMovimento(m),   // nome + complementos tabelados
        data: dh ? dh.data : hoje,
        dataHora: dh ? dh.dataHora : null,
      });
    }

    // Filtra os que já existem (por hash) e os repetidos dentro do próprio lote.
    let novos = 0;
    if (candidatos.length) {
      const hashes = candidatos.map(c => c.hash);
      const ph = hashes.map(() => '?').join(',');
      const [ex] = await pool.execute(
        `SELECT hash_movimento FROM andamento_processual
         WHERE processo_id = ? AND fonte = 'datajud' AND hash_movimento IN (${ph})`,
        [processoId, ...hashes]
      );
      const existentes = new Set(ex.map(r => r.hash_movimento));
      const vistos = new Set();
      const inserir = [];
      for (const c of candidatos) {
        if (existentes.has(c.hash) || vistos.has(c.hash)) continue;
        vistos.add(c.hash);
        inserir.push(c);
      }

      // 5) Insere os novos em transação (tudo ou nada) + marca a sincronização.
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const c of inserir) {
          // INSERT IGNORE + índice UNIQUE(hash_movimento) = trava dura contra duplicidade.
          await conn.execute(
            `INSERT IGNORE INTO andamento_processual
               (processo_id, data, data_hora, descricao, fonte, codigo_movimento, hash_movimento, criado_por)
             VALUES (?, ?, ?, ?, 'datajud', ?, ?, NULL)`,
            [processoId, c.data, c.dataHora, c.descricao, c.codigo, c.hash]
          );
        }
        await conn.execute('UPDATE tblproc SET datajud_sincronizado_em = ? WHERE id = ?', [nowBR, processoId]);
        await conn.commit();
        novos = inserir.length;
      } catch (e) {
        await conn.rollback();
        return erroInterno(res, e);
      } finally {
        conn.release();
      }
    } else {
      // Sem movimentos: ainda assim marca o dia para não repetir a consulta.
      await pool.execute('UPDATE tblproc SET datajud_sincronizado_em = ? WHERE id = ?', [nowBR, processoId]);
    }

    // Status final: consultou e achou X registros, ou consultou e não achou nada.
    // (nome diferente do serviço 'datajud' para não colidir com ele nesta função)
    const statusDj = candidatos.length
      ? { tipo: 'ok',    mensagem: `Consulta ao DataJud concluída às ${horaBR}.`, novos }
      : { tipo: 'vazio', mensagem: `Consulta concluída às ${horaBR} — nenhum registro encontrado no DataJud.` };
    return sucesso(res, { andamentos: await buscarAndamentos(processoId), aviso: '', datajud: statusDj, novos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listar, criar, editar, excluir, sincronizar };
