// ============================================================
// VIGILÂNCIA DO PROCESSO (pedido do usuário, 05/11/2026; porte do NovoJud-saas; redesenhada em 06/11/2026).
// Lembrete SEM DATA que fica de olho num processo (ex.: "Recurso adesivo": o escritório não quer recorrer da sentença,
// mas precisa ser avisado se a OUTRA parte recorrer). Enquanto está "aguardando": trava arquivar e excluir o processo
// (ver utils/pendenciasProcesso.js e utils/apensoProcesso.js). O aviso NÃO depende mais de "quem foi marcado" nem de
// adivinhar pelo texto: aparece direto pra quem tem permissão de ver Vigilâncias — selo na pasta (PastaDetalhe.js),
// 👁 + mensagem nas Publicações (ver utils/vigilanciasConsulta.js) e a pergunta ao cadastrar prazo/tarefa no processo
// (ver utils/vigilanciasCiclo.js, prazosController.js e tarefasController.js).
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { texto, inteiroPositivo } = require('../utils/camposTexto');
const { comIdNumerico } = require('../utils/rotasSeguras');
const { encerrarVigilancia } = require('../utils/vigilanciasCiclo');
const auditoria = require('../middleware/auditoria');

// ---- tipos de vigilância ("Recurso adesivo"...) -----------------------------------------------------------------

// GET /api/vigilancias/tipos — lista aberta a qualquer usuário logado
async function listarTipos(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM vigilancia_tipo WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function criarTipo(req, res) {
  try {
    const lido = texto(req.body?.nome, { rotulo: 'Nome', max: 100, obrigatorio: true });
    if (lido.erro) return erro(res, lido.erro);
    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute('INSERT INTO vigilancia_tipo (nome) VALUES (?)', [lido.valor]);
      id = r.insertId;
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { id }, 'Tipo de vigilância criado com sucesso', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe um tipo de vigilância com esse nome', 409);
    return erroInterno(res, err);
  }
}

async function editarTipo(req, res) {
  const { id } = req.params;
  try {
    const lido = texto(req.body?.nome, { rotulo: 'Nome', max: 100, obrigatorio: true });
    if (lido.erro) return erro(res, lido.erro);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [atual] = await conn.execute(
        'SELECT id FROM vigilancia_tipo WHERE id = ? AND ativo = 1 FOR UPDATE', [id]
      );
      if (!atual.length) { await conn.rollback(); return naoEncontrado(res, 'Tipo de vigilância não encontrado'); }
      await conn.execute('UPDATE vigilancia_tipo SET nome = ? WHERE id = ?', [lido.valor, id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Tipo atualizado');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe um tipo de vigilância com esse nome', 409);
    return erroInterno(res, err);
  }
}

async function excluirTipo(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [atual] = await conn.execute(
      'SELECT id FROM vigilancia_tipo WHERE id = ? AND ativo = 1 FOR UPDATE', [id]
    );
    if (!atual.length) { await conn.rollback(); return naoEncontrado(res, 'Tipo de vigilância não encontrado'); }
    const [uso] = await conn.execute('SELECT id FROM vigilancia WHERE tipo_id = ? LIMIT 1', [id]);
    if (uso.length) { await conn.rollback(); return erro(res, 'Tipo está em uso e não pode ser excluído', 409); }
    await conn.execute('UPDATE vigilancia_tipo SET ativo = 0 WHERE id = ?', [id]);
    await conn.commit();
    return sucesso(res, null, 'Tipo removido');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ---- vigilâncias --------------------------------------------------------------------------------------------------

// GET /api/vigilancias?pasta_id=&todas=1 — vigilâncias de UMA pasta (todos os processos dela, apensos inclusive).
async function listar(req, res) {
  const pastaId = inteiroPositivo(req.query.pasta_id, { rotulo: 'Pasta' }).valor;
  if (!pastaId) return erro(res, 'Informe a pasta.');
  const incluirEncerradas = req.query.todas === '1' || req.query.todas === 'true';
  try {
    let sql = `SELECT v.id, v.processo_id, pr.numProc AS processo_numero, (pr.apenso_de_id IS NOT NULL) AS apenso,
                      v.tipo_id, t.nome AS tipo_nome, v.observacao, v.situacao,
                      u.nome AS criado_por_nome,
                      DATE_FORMAT(v.criado_em, '%Y-%m-%d %H:%i:%s') AS criado_em,
                      DATE_FORMAT(v.encerrada_em, '%Y-%m-%d %H:%i:%s') AS encerrada_em,
                      v.motivo_encerramento
                 FROM vigilancia v
                 JOIN tblproc pr ON pr.id = v.processo_id
                 JOIN vigilancia_tipo t ON t.id = v.tipo_id
                 LEFT JOIN usuarios u ON u.id = v.criado_por
                WHERE pr.pasta_id = ?`;
    const params = [pastaId];
    if (!incluirEncerradas) sql += " AND v.situacao <> 'encerrada'";
    sql += ' ORDER BY v.id DESC';
    const [linhas] = await pool.execute(sql, params);
    const dados = linhas.map((l) => ({ ...l, apenso: !!l.apenso }));
    return sucesso(res, dados);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/vigilancias — nova vigilância
async function criar(req, res) {
  const processoId = inteiroPositivo(req.body?.processo_id, { rotulo: 'Processo' }).valor;
  const tipoId = inteiroPositivo(req.body?.tipo_id, { rotulo: 'Tipo' }).valor;
  if (!processoId) return erro(res, 'Escolha o processo.');
  if (!tipoId) return erro(res, 'Escolha o tipo de vigilância.');
  const obsLida = texto(req.body?.observacao, { rotulo: 'Observação', max: 1000, feminino: true });
  if (obsLida.erro) return erro(res, obsLida.erro);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [processo] = await conn.execute(
      'SELECT id FROM tblproc WHERE id = ? AND ativo = 1 FOR SHARE', [processoId]
    );
    if (!processo.length) { await conn.rollback(); return naoEncontrado(res, 'Processo não encontrado'); }
    const [tipo] = await conn.execute(
      'SELECT id FROM vigilancia_tipo WHERE id = ? AND ativo = 1 FOR SHARE', [tipoId]
    );
    if (!tipo.length) { await conn.rollback(); return naoEncontrado(res, 'Tipo de vigilância não encontrado'); }
    const [repetida] = await conn.execute(
      `SELECT id FROM vigilancia WHERE processo_id = ? AND tipo_id = ? AND situacao = 'aguardando' FOR UPDATE`,
      [processoId, tipoId]
    );
    if (repetida.length) { await conn.rollback(); return erro(res, 'Este processo já tem uma vigilância deste tipo em andamento.', 409); }
    const [criada] = await conn.execute(
      'INSERT INTO vigilancia (processo_id, tipo_id, observacao, criado_por) VALUES (?, ?, ?, ?)',
      [processoId, tipoId, obsLida.valor, req.usuario.id]
    );
    const id = criada.insertId;
    await auditoria.registrar(req.usuario.id, 'vigilancia', 'criar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, { id }, 'Vigilância criada com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/vigilancias/:id — observação (só enquanto aguardando)
async function editar(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [atual] = await conn.execute('SELECT id, situacao FROM vigilancia WHERE id = ? FOR UPDATE', [id]);
    if (!atual.length) { await conn.rollback(); return naoEncontrado(res, 'Vigilância não encontrada'); }
    if (atual[0].situacao === 'encerrada') { await conn.rollback(); return erro(res, 'Esta vigilância já foi encerrada e não pode ser alterada.', 409); }
    if (req.body?.observacao !== undefined) {
      const obsLida = texto(req.body.observacao, { rotulo: 'Observação', max: 1000, feminino: true });
      if (obsLida.erro) { await conn.rollback(); return erro(res, obsLida.erro); }
      await conn.execute('UPDATE vigilancia SET observacao = ? WHERE id = ?', [obsLida.valor, id]);
    }
    await auditoria.registrar(req.usuario.id, 'vigilancia', 'editar', Number(id), null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Vigilância atualizada');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/vigilancias/:id/encerrar — o usuário tira a vigilância manualmente (fora do cadastro de prazo)
async function encerrar(req, res) {
  const { id } = req.params;
  const motivoLido = texto(req.body?.motivo, { rotulo: 'Motivo', max: 300 });
  if (motivoLido.erro) return erro(res, motivoLido.erro);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await encerrarVigilancia(conn, { vigilanciaId: Number(id), usuarioId: req.usuario.id, motivo: motivoLido.valor });
    if (r.naoEncontrada) { await conn.rollback(); return naoEncontrado(res, 'Vigilância não encontrada'); }
    if (r.jaEncerrada) { await conn.rollback(); return erro(res, 'Esta vigilância já foi encerrada.', 409); }
    await conn.commit();
    return sucesso(res, null, 'Vigilância encerrada');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = {
  listarTipos,
  criarTipo,
  editarTipo: comIdNumerico(editarTipo, 'Tipo de vigilância não encontrado'),
  excluirTipo: comIdNumerico(excluirTipo, 'Tipo de vigilância não encontrado'),
  listar,
  criar,
  editar: comIdNumerico(editar, 'Vigilância não encontrada'),
  encerrar: comIdNumerico(encerrar, 'Vigilância não encontrada'),
};
