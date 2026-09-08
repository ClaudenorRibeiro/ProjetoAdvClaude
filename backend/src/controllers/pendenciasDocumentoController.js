// ============================================================
// CONTROLLER DE PENDÊNCIAS DE DOCUMENTOS
// Controla clientes (PF ou PJ) que fizeram o cadastro mas ainda DEVEM
// documentos, deixando a abertura do processo suspensa. A pendência mora
// no cliente — não depende de existir processo ou pasta.
//
// Regras de visibilidade (decisão do escritório):
//   - Quem tem `pendencias/visualizar` vê as pendências de TODOS os clientes.
//   - Cadastrar / alterar / excluir seguem as ações da permissão `pendencias`.
//   - O catálogo de tipos usa o submódulo `pendencias/tipos`.
//
// Ao marcar o ÚLTIMO documento como recebido, a pendência é resolvida
// automaticamente. Se um documento recebido for desmarcado depois, ela reabre.
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { enviarEmail } = require('../utils/email');

// Expressão SQL que resolve o nome do cliente (PF ou PJ) a partir de tipo_pessoa/pessoa_id.
// `alias` é o alias da tabela pendencia_documento na consulta.
const nomeClienteSQL = (alias = 'pd') => `
  CASE ${alias}.tipo_pessoa
    WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ${alias}.pessoa_id)
    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ${alias}.pessoa_id)
  END`;

// Sanitiza a lista de tipos de documento vinda do front → array de inteiros > 0, sem repetição.
function normalizarTipos(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  const saida = [];
  for (const item of valor) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0 && !vistos.has(id)) {
      vistos.add(id);
      saida.push(id);
    }
  }
  return saida;
}

// Confere se a pessoa (PF/PJ) existe e está ativa.
async function pessoaExiste(tipo_pessoa, pessoa_id, conn = pool) {
  const tabela = tipo_pessoa === 'juridica' ? 'pessoas_juridicas' : 'pessoas_fisicas';
  const [rows] = await conn.execute(
    `SELECT id FROM ${tabela} WHERE id = ? AND ativo = 1`,
    [pessoa_id]
  );
  return rows.length > 0;
}

// Recalcula o status da pendência a partir dos itens (usado após criar/editar/marcar).
// - Todos os itens recebidos  → 'resolvida' (grava resolvido_em/por se ainda não estava)
// - Nem todos + estava 'resolvida' → volta para 'aberta'
// Nunca mexe em pendência 'cancelada'.
async function recalcularStatus(conn, pendenciaId, usuarioId) {
  const [[atual]] = await conn.execute(
    'SELECT status FROM pendencia_documento WHERE id = ?', [pendenciaId]
  );
  if (!atual || atual.status === 'cancelada') return atual ? atual.status : null;

  const [[cont]] = await conn.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN recebido = 1 THEN 1 ELSE 0 END) AS recebidos
       FROM pendencia_documento_item WHERE pendencia_id = ?`,
    [pendenciaId]
  );
  const total     = Number(cont.total) || 0;
  const recebidos = Number(cont.recebidos) || 0;
  const tudoRecebido = total > 0 && recebidos === total;

  if (tudoRecebido && atual.status !== 'resolvida') {
    await conn.execute(
      `UPDATE pendencia_documento
          SET status = 'resolvida', resolvido_em = NOW(), resolvido_por = ?
        WHERE id = ?`,
      [usuarioId, pendenciaId]
    );
    return 'resolvida';
  }
  if (!tudoRecebido && atual.status === 'resolvida') {
    await conn.execute(
      `UPDATE pendencia_documento
          SET status = 'aberta', resolvido_em = NULL, resolvido_por = NULL
        WHERE id = ?`,
      [pendenciaId]
    );
    return 'aberta';
  }
  return atual.status;
}

// ============================================================
// LISTA CENTRAL
// ============================================================

// GET /api/pendencias-documento?status=&responsavel_id=&busca=&aviso=
// status: 'aberta' (padrão) | 'resolvida' | 'cancelada' | 'todas'
// aviso:  'vencido' → só as abertas com data_aviso <= hoje
async function listar(req, res) {
  try {
    const { status = 'aberta', responsavel_id, busca, aviso } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (status && status !== 'todas') {
      where += ' AND pd.status = ?';
      params.push(status);
    }
    if (responsavel_id) {
      where += ' AND pd.responsavel_id = ?';
      params.push(Number(responsavel_id) || 0);
    }
    if (aviso === 'vencido') {
      where += " AND pd.status = 'aberta' AND pd.data_aviso IS NOT NULL AND pd.data_aviso <= CURDATE()";
    }
    if (busca && busca.trim()) {
      where += ` AND (${nomeClienteSQL('pd')}) LIKE ?`;
      params.push(`%${busca.trim()}%`);
    }

    const [rows] = await pool.execute(
      `SELECT pd.id, pd.tipo_pessoa, pd.pessoa_id, pd.responsavel_id,
              pd.avisar_sino, pd.avisar_email, pd.data_aviso, pd.avisado_em,
              pd.observacao, pd.status, pd.criado_em,
              ${nomeClienteSQL('pd')} AS cliente_nome,
              u.nome AS responsavel_nome,
              DATEDIFF(CURDATE(), DATE(pd.criado_em)) AS dias_aberta,
              (SELECT COUNT(*) FROM pendencia_documento_item i WHERE i.pendencia_id = pd.id) AS total_itens,
              (SELECT COUNT(*) FROM pendencia_documento_item i WHERE i.pendencia_id = pd.id AND i.recebido = 1) AS itens_recebidos,
              (SELECT GROUP_CONCAT(t.nome ORDER BY t.nome SEPARATOR ' | ')
                 FROM pendencia_documento_item i
                 JOIN tipo_documento_pendencia t ON i.tipo_documento_id = t.id
                WHERE i.pendencia_id = pd.id AND i.recebido = 0) AS documentos_pendentes
         FROM pendencia_documento pd
         JOIN usuarios u ON pd.responsavel_id = u.id
         ${where}
        ORDER BY (pd.data_aviso IS NULL), pd.data_aviso ASC, pd.criado_em DESC`,
      params
    );

    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pendencias-documento/:id — cabeçalho + itens
async function buscar(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT pd.*, ${nomeClienteSQL('pd')} AS cliente_nome,
              u.nome AS responsavel_nome,
              ur.nome AS resolvido_por_nome
         FROM pendencia_documento pd
         JOIN usuarios u  ON pd.responsavel_id = u.id
         LEFT JOIN usuarios ur ON pd.resolvido_por = ur.id
        WHERE pd.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return naoEncontrado(res, 'Pendência não encontrada');

    const [itens] = await pool.execute(
      `SELECT i.id, i.tipo_documento_id, t.nome AS tipo_nome,
              i.recebido, i.data_recebimento, i.recebido_por,
              ur.nome AS recebido_por_nome
         FROM pendencia_documento_item i
         JOIN tipo_documento_pendencia t ON i.tipo_documento_id = t.id
         LEFT JOIN usuarios ur ON i.recebido_por = ur.id
        WHERE i.pendencia_id = ?
        ORDER BY t.nome`,
      [req.params.id]
    );

    return sucesso(res, { ...rows[0], itens });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pendencias-documento — cria a pendência com seus documentos
async function criar(req, res) {
  const {
    tipo_pessoa, pessoa_id, responsavel_id,
    avisar_sino, avisar_email, data_aviso, observacao,
    tipos: tiposRaw,
  } = req.body;

  const tp = tipo_pessoa === 'juridica' ? 'juridica' : (tipo_pessoa === 'fisica' ? 'fisica' : null);
  if (!tp)                        return erro(res, 'Informe se o cliente é Pessoa Física ou Jurídica');
  if (!Number(pessoa_id))         return erro(res, 'Selecione o cliente');
  if (!Number(responsavel_id))    return erro(res, 'Selecione o usuário responsável pela cobrança');

  const tipos = normalizarTipos(tiposRaw);
  if (!tipos.length)              return erro(res, 'Selecione pelo menos um documento pendente');

  const obs = (observacao || '').trim().slice(0, 1000) || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!(await pessoaExiste(tp, pessoa_id, conn))) {
      await conn.rollback();
      return erro(res, 'Cliente não encontrado ou inativo');
    }

    // Todos os tipos precisam existir e estar ativos
    const [tiposOk] = await conn.execute(
      `SELECT id FROM tipo_documento_pendencia WHERE ativo = 1 AND id IN (${tipos.map(() => '?').join(',')})`,
      tipos
    );
    if (tiposOk.length !== tipos.length) {
      await conn.rollback();
      return erro(res, 'Um dos documentos selecionados não existe mais na lista');
    }

    const [r] = await conn.execute(
      `INSERT INTO pendencia_documento
        (tipo_pessoa, pessoa_id, responsavel_id, avisar_sino, avisar_email,
         data_aviso, observacao, status, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`,
      [
        tp, Number(pessoa_id), Number(responsavel_id),
        avisar_sino ? 1 : 0, avisar_email ? 1 : 0,
        data_aviso || null, obs, req.usuario.id,
      ]
    );
    const pendenciaId = r.insertId;

    for (const tipoId of tipos) {
      await conn.execute(
        'INSERT INTO pendencia_documento_item (pendencia_id, tipo_documento_id) VALUES (?, ?)',
        [pendenciaId, tipoId]
      );
    }

    await auditoria.registrar(req.usuario.id, 'pendencia_documento', 'criar', pendenciaId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: pendenciaId }, 'Pendência registrada com sucesso', 201);
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pendencias-documento/:id — edita responsável/aviso/observação e a lista de documentos.
// O cliente (PF/PJ) NÃO muda aqui — para outro cliente, abre-se uma nova pendência.
// A marca de "recebido" dos documentos que continuam na lista é preservada.
async function atualizar(req, res) {
  const {
    responsavel_id, avisar_sino, avisar_email, data_aviso, observacao,
    tipos: tiposRaw,
  } = req.body;

  if (!Number(responsavel_id)) return erro(res, 'Selecione o usuário responsável pela cobrança');
  const tipos = normalizarTipos(tiposRaw);
  if (!tipos.length)           return erro(res, 'Selecione pelo menos um documento pendente');
  const obs = (observacao || '').trim().slice(0, 1000) || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[atual]] = await conn.execute(
      'SELECT id, status, data_aviso FROM pendencia_documento WHERE id = ?', [req.params.id]
    );
    if (!atual) {
      await conn.rollback();
      return naoEncontrado(res, 'Pendência não encontrada');
    }
    if (atual.status === 'cancelada') {
      await conn.rollback();
      return erro(res, 'Pendência cancelada não pode ser editada');
    }

    const [tiposOk] = await conn.execute(
      `SELECT id FROM tipo_documento_pendencia WHERE ativo = 1 AND id IN (${tipos.map(() => '?').join(',')})`,
      tipos
    );
    if (tiposOk.length !== tipos.length) {
      await conn.rollback();
      return erro(res, 'Um dos documentos selecionados não existe mais na lista');
    }

    // Mudou a data de aviso para o futuro → volta a avisar (zera avisado_em).
    // Normaliza ambos para 'YYYY-MM-DD' antes de comparar (o banco devolve Date).
    const soData = v => (v == null ? '' : (v instanceof Date
      ? v.toLocaleDateString('sv-SE')            // 'sv-SE' => YYYY-MM-DD
      : String(v).slice(0, 10)));
    const dataAvisoNova   = data_aviso || null;
    const dataAvisoNovaFmt = soData(dataAvisoNova);
    const hojeFmt = new Date().toLocaleDateString('sv-SE');
    const avisoMudouParaFuturo =
      dataAvisoNovaFmt &&
      dataAvisoNovaFmt !== soData(atual.data_aviso) &&
      dataAvisoNovaFmt > hojeFmt;

    await conn.execute(
      `UPDATE pendencia_documento SET
         responsavel_id = ?, avisar_sino = ?, avisar_email = ?,
         data_aviso = ?, observacao = ?,
         ${avisoMudouParaFuturo ? 'avisado_em = NULL,' : ''}
         alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [
        Number(responsavel_id), avisar_sino ? 1 : 0, avisar_email ? 1 : 0,
        dataAvisoNova, obs, req.usuario.id, req.params.id,
      ]
    );

    // Reconcilia os itens: remove os que saíram, adiciona os novos, mantém o resto (com o "recebido").
    const [itensAtuais] = await conn.execute(
      'SELECT tipo_documento_id FROM pendencia_documento_item WHERE pendencia_id = ?', [req.params.id]
    );
    const atuaisSet = new Set(itensAtuais.map(i => i.tipo_documento_id));
    const novosSet  = new Set(tipos);

    const remover = [...atuaisSet].filter(id => !novosSet.has(id));
    const incluir = [...novosSet].filter(id => !atuaisSet.has(id));

    if (remover.length) {
      await conn.execute(
        `DELETE FROM pendencia_documento_item
          WHERE pendencia_id = ? AND tipo_documento_id IN (${remover.map(() => '?').join(',')})`,
        [req.params.id, ...remover]
      );
    }
    for (const tipoId of incluir) {
      await conn.execute(
        'INSERT INTO pendencia_documento_item (pendencia_id, tipo_documento_id) VALUES (?, ?)',
        [req.params.id, tipoId]
      );
    }

    // Mudou a lista → o status pode ter virado "resolvida" (todos já recebidos) ou reaberto.
    await recalcularStatus(conn, req.params.id, req.usuario.id);

    await auditoria.registrar(req.usuario.id, 'pendencia_documento', 'atualizar', req.params.id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pendência atualizada com sucesso');
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pendencias-documento/:id/itens/:itemId — marca/desmarca um documento como recebido.
// Resolve a pendência automaticamente quando o último documento é recebido.
async function marcarItem(req, res) {
  const { id, itemId } = req.params;
  const recebido = !!req.body.recebido;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[pend]] = await conn.execute(
      'SELECT id, status FROM pendencia_documento WHERE id = ?', [id]
    );
    if (!pend) {
      await conn.rollback();
      return naoEncontrado(res, 'Pendência não encontrada');
    }
    if (pend.status === 'cancelada') {
      await conn.rollback();
      return erro(res, 'Pendência cancelada não pode ser alterada');
    }

    const [[item]] = await conn.execute(
      'SELECT id FROM pendencia_documento_item WHERE id = ? AND pendencia_id = ?', [itemId, id]
    );
    if (!item) {
      await conn.rollback();
      return naoEncontrado(res, 'Documento não encontrado nesta pendência');
    }

    await conn.execute(
      `UPDATE pendencia_documento_item
          SET recebido = ?,
              data_recebimento = ${recebido ? 'CURDATE()' : 'NULL'},
              recebido_por = ${recebido ? '?' : 'NULL'}
        WHERE id = ?`,
      recebido ? [1, req.usuario.id, itemId] : [0, itemId]
    );

    const novoStatus = await recalcularStatus(conn, id, req.usuario.id);

    await auditoria.registrar(req.usuario.id, 'pendencia_documento', 'atualizar', id, null, null, conn);
    await conn.commit();

    const [[cont]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN recebido = 1 THEN 1 ELSE 0 END) AS recebidos
         FROM pendencia_documento_item WHERE pendencia_id = ?`,
      [id]
    );
    return sucesso(res, {
      status: novoStatus,
      total: Number(cont.total) || 0,
      recebidos: Number(cont.recebidos) || 0,
    }, novoStatus === 'resolvida' ? 'Todos os documentos foram recebidos — pendência resolvida' : 'Documento atualizado');
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pendencias-documento/:id/cancelar — encerra a pendência sem exclusão (fica no histórico)
async function cancelar(req, res) {
  try {
    const [[pend]] = await pool.execute(
      'SELECT id, status FROM pendencia_documento WHERE id = ?', [req.params.id]
    );
    if (!pend) return naoEncontrado(res, 'Pendência não encontrada');
    if (pend.status === 'cancelada') return erro(res, 'Pendência já está cancelada');

    await pool.execute(
      `UPDATE pendencia_documento
          SET status = 'cancelada', alterado_por = ?, alterado_em = NOW()
        WHERE id = ?`,
      [req.usuario.id, req.params.id]
    );
    await auditoria.registrar(req.usuario.id, 'pendencia_documento', 'atualizar', req.params.id);
    return sucesso(res, null, 'Pendência cancelada');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/pendencias-documento/:id — remove a pendência e seus itens (cascade no banco)
async function excluir(req, res) {
  const conn = await pool.getConnection();
  try {
    const [[pend]] = await conn.execute(
      'SELECT id FROM pendencia_documento WHERE id = ?', [req.params.id]
    );
    if (!pend) return naoEncontrado(res, 'Pendência não encontrada');

    await conn.beginTransaction();
    await conn.execute('DELETE FROM pendencia_documento WHERE id = ?', [req.params.id]);
    await auditoria.registrar(req.usuario.id, 'pendencia_documento', 'excluir', req.params.id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pendência excluída');
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// ============================================================
// APOIO — usuários responsáveis e busca de clientes
// ============================================================

// GET /api/pendencias-documento/usuarios — lista para o campo "Responsável" e para o filtro.
// Superusuário (nivel 0) fica de fora — regra "invisível para todos".
async function listarUsuarios(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM usuarios WHERE ativo = 1 AND nivel > 0 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pendencias-documento/clientes?busca= — PF + PJ ativos, para o seletor de cliente do modal.
// Existe aqui (e não em /pessoas) para não exigir a permissão de Pessoas de quem só cuida das pendências.
async function buscarClientes(req, res) {
  try {
    const termo = String(req.query.busca || '').trim();
    if (termo.length < 2) return sucesso(res, []);
    const like = `%${termo}%`;
    const inicio = `${termo}%`;
    const digitos = termo.replace(/\D/g, '');        // só entra na busca se o usuário digitou números
    const likeDig = digitos ? `%${digitos}%` : null;

    const [fisicas] = await pool.execute(
      `SELECT 'fisica' AS tipo_pessoa, id AS pessoa_id, nome, cpf AS documento
         FROM pessoas_fisicas
        WHERE ativo = 1 AND (
              nome LIKE ?
              ${likeDig ? "OR REPLACE(REPLACE(cpf,'.',''),'-','') LIKE ?" : ''}
        )
        ORDER BY (nome LIKE ?) DESC, nome ASC
        LIMIT 15`,
      likeDig ? [like, likeDig, inicio] : [like, inicio]
    );
    const [juridicas] = await pool.execute(
      `SELECT 'juridica' AS tipo_pessoa, id AS pessoa_id, razao_social AS nome, cnpj AS documento
         FROM pessoas_juridicas
        WHERE ativo = 1 AND (
              razao_social LIKE ? OR nome_fantasia LIKE ?
              ${likeDig ? "OR REPLACE(REPLACE(REPLACE(cnpj,'.',''),'-',''),'/','') LIKE ?" : ''}
        )
        ORDER BY (razao_social LIKE ?) DESC, razao_social ASC
        LIMIT 15`,
      likeDig ? [like, like, likeDig, inicio] : [like, like, inicio]
    );

    return sucesso(res, [...fisicas, ...juridicas]);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// ============================================================
// CATÁLOGO DE TIPOS DE DOCUMENTO  (submódulo `pendencias/tipos`)
// ============================================================

// GET /api/pendencias-documento/tipos — lista os tipos ativos (para os selects)
async function listarTipos(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM tipo_documento_pendencia WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pendencias-documento/tipos — cadastra um tipo novo (reaproveitável nos próximos casos)
async function criarTipo(req, res) {
  try {
    const nome = (req.body.nome || '').trim();
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [existe] = await pool.execute(
      'SELECT id, ativo FROM tipo_documento_pendencia WHERE nome = ? LIMIT 1', [nome]
    );
    if (existe.length && existe[0].ativo === 1) return erro(res, 'Já existe um documento com esse nome');
    if (existe.length && existe[0].ativo === 0) {
      // Reativa um que havia sido desativado, em vez de barrar pelo UNIQUE.
      await pool.execute(
        'UPDATE tipo_documento_pendencia SET ativo = 1, alterado_por = ?, alterado_em = NOW() WHERE id = ?',
        [req.usuario.id, existe[0].id]
      );
      return sucesso(res, { id: existe[0].id }, 'Documento reativado', 201);
    }
    const [r] = await pool.execute(
      'INSERT INTO tipo_documento_pendencia (nome, criado_por) VALUES (?, ?)',
      [nome, req.usuario.id]
    );
    return sucesso(res, { id: r.insertId }, 'Documento cadastrado', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/pendencias-documento/tipos/:id — renomeia um tipo
async function atualizarTipo(req, res) {
  try {
    const nome = (req.body.nome || '').trim();
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_documento_pendencia WHERE nome = ? AND id <> ? LIMIT 1',
      [nome, req.params.id]
    );
    if (existe.length) return erro(res, 'Já existe um documento com esse nome');
    await pool.execute(
      'UPDATE tipo_documento_pendencia SET nome = ?, alterado_por = ?, alterado_em = NOW() WHERE id = ?',
      [nome, req.usuario.id, req.params.id]
    );
    return sucesso(res, null, 'Documento atualizado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/pendencias-documento/tipos/:id — soft-delete (ativo = 0).
// Bloqueia se o tipo estiver em uso em alguma pendência (preserva o histórico).
async function excluirTipo(req, res) {
  try {
    const [uso] = await pool.execute(
      'SELECT id FROM pendencia_documento_item WHERE tipo_documento_id = ? LIMIT 1',
      [req.params.id]
    );
    if (uso.length) {
      return erro(res, 'Este documento está em uso em uma ou mais pendências e não pode ser excluído. Use "Desativar" para tirá-lo da lista sem perder o histórico.');
    }
    await pool.execute(
      'UPDATE tipo_documento_pendencia SET ativo = 0, alterado_por = ?, alterado_em = NOW() WHERE id = ?',
      [req.usuario.id, req.params.id]
    );
    return sucesso(res, null, 'Documento removido da lista');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = {
  listar, buscar, criar, atualizar, marcarItem, cancelar, excluir,
  listarUsuarios, buscarClientes,
  listarTipos, criarTipo, atualizarTipo, excluirTipo,
};
