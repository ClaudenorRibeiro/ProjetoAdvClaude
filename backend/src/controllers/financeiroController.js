// ============================================================
// CONTROLLER FINANCEIRO
// Conta corrente por pasta, honorários, parcerias e relatórios
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { gerarReciboFinanceiro } = require('../services/pdfService');
const auditoria = require('../middleware/auditoria');

// GET /api/financeiro/pasta/:pastaId — Busca lançamentos da pasta com saldo
async function buscarContaCorrente(req, res) {
  try {
    const { pastaId } = req.params;
    const { data_de, data_ate } = req.query;
    const params = [pastaId];
    let where = 'WHERE ccp.pasta_id = ?';

    if (data_de) { where += ' AND ccp.data >= ?'; params.push(data_de); }
    if (data_ate) { where += ' AND ccp.data <= ?'; params.push(data_ate); }

    const [lancamentos] = await pool.execute(
      `SELECT ccp.*, u.nome AS usuario_nome
       FROM conta_corrente_pasta ccp
       JOIN usuarios u ON ccp.usuario_id = u.id
       ${where}
       ORDER BY ccp.data ASC, ccp.id ASC`,
      params
    );

    // Calcula saldo acumulado
    let saldo = 0;
    const comSaldo = lancamentos.map(l => {
      if (l.tipo === 'credito') saldo += parseFloat(l.valor);
      else saldo -= parseFloat(l.valor);
      return { ...l, saldo_acumulado: saldo.toFixed(2) };
    });

    // Busca honorários da pasta
    const [honorarios] = await pool.execute(
      'SELECT * FROM honorarios WHERE pasta_id = ?', [pastaId]
    );

    // Busca parcerias
    const [parcerias] = await pool.execute(
      `SELECT p.*, pr.numero AS processo_numero
       FROM parcerias p
       JOIN processo pr ON p.processo_id = pr.id
       JOIN pasta pa ON pr.pasta_id = pa.id
       WHERE pa.id = ?`,
      [pastaId]
    );

    return sucesso(res, {
      lancamentos: comSaldo,
      saldo_total: saldo.toFixed(2),
      honorarios: honorarios[0] || null,
      parcerias,
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/pasta/:pastaId/lancamento — Registra lançamento
async function lancar(req, res) {
  try {
    const { pastaId } = req.params;
    const { data, descricao, valor, tipo } = req.body;

    if (!descricao || !valor || !tipo) {
      return erro(res, 'Descrição, valor e tipo são obrigatórios');
    }
    if (!['debito', 'credito'].includes(tipo)) {
      return erro(res, 'Tipo deve ser "debito" ou "credito"');
    }

    const [result] = await pool.execute(
      `INSERT INTO conta_corrente_pasta (pasta_id, data, descricao, valor, tipo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pastaId, data || new Date().toISOString().split('T')[0],
       descricao.trim(), valor, tipo, req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'conta_corrente_pasta', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Lançamento registrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/financeiro/lancamento/:id — Remove lançamento
async function excluirLancamento(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT * FROM conta_corrente_pasta WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Lançamento não encontrado');

    await pool.execute('DELETE FROM conta_corrente_pasta WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'conta_corrente_pasta', 'excluir', id, antes[0]);
    return sucesso(res, null, 'Lançamento removido com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/pasta/:pastaId/honorarios — Salva/atualiza honorários
async function salvarHonorarios(req, res) {
  try {
    const { pastaId } = req.params;
    const { tipo, percentual, valor_fixo, observacoes } = req.body;

    // Upsert: atualiza se existir, insere se não existir
    await pool.execute(
      `INSERT INTO honorarios (pasta_id, tipo, percentual, valor_fixo, observacoes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo=VALUES(tipo), percentual=VALUES(percentual),
         valor_fixo=VALUES(valor_fixo), observacoes=VALUES(observacoes)`,
      [pastaId, tipo || 'sem_honorarios', percentual || null, valor_fixo || null, observacoes || null]
    );

    return sucesso(res, null, 'Honorários salvos com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/pasta/:pastaId/recibo — Gera recibo em PDF
async function gerarRecibo(req, res) {
  try {
    const { pastaId } = req.params;

    // Busca dados da pasta e cliente
    const [pasta] = await pool.execute(
      `SELECT p.*, CASE p.tipo_pessoa
         WHEN 'fisica' THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = p.cliente_id)
         WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = p.cliente_id)
       END AS cliente_nome
       FROM pasta p WHERE p.id = ?`,
      [pastaId]
    );
    if (!pasta.length) return naoEncontrado(res, 'Pasta não encontrada');

    const [lancamentos] = await pool.execute(
      'SELECT * FROM conta_corrente_pasta WHERE pasta_id = ? ORDER BY data ASC, id ASC',
      [pastaId]
    );

    const [escritorio] = await pool.execute(
      'SELECT * FROM configuracoes_escritorio LIMIT 1'
    );

    const pdfBuffer = await gerarReciboFinanceiro(
      pasta[0],
      { nome: pasta[0].cliente_nome },
      lancamentos,
      escritorio[0]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="recibo_pasta_${pastaId}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/relatorio — Relatório financeiro por período
async function relatorio(req, res) {
  try {
    const { data_de, data_ate } = req.query;
    if (!data_de || !data_ate) return erro(res, 'Período obrigatório (data_de e data_ate)');

    const [resumo] = await pool.execute(
      `SELECT
         COUNT(DISTINCT ccp.pasta_id) AS total_pastas,
         SUM(CASE WHEN ccp.tipo = 'credito' THEN ccp.valor ELSE 0 END) AS total_entradas,
         SUM(CASE WHEN ccp.tipo = 'debito'  THEN ccp.valor ELSE 0 END) AS total_despesas,
         SUM(CASE WHEN ccp.tipo = 'credito' THEN ccp.valor ELSE -ccp.valor END) AS saldo_periodo
       FROM conta_corrente_pasta ccp
       WHERE ccp.data BETWEEN ? AND ?`,
      [data_de, data_ate]
    );

    const [detalhe] = await pool.execute(
      `SELECT ccp.data, ccp.descricao, ccp.valor, ccp.tipo,
              p.titulo AS pasta, LPAD(p.numero, 4, '0') AS pasta_numero,
              u.nome AS usuario
       FROM conta_corrente_pasta ccp
       JOIN pasta p ON ccp.pasta_id = p.id
       JOIN usuarios u ON ccp.usuario_id = u.id
       WHERE ccp.data BETWEEN ? AND ?
       ORDER BY ccp.data ASC`,
      [data_de, data_ate]
    );

    return sucesso(res, { resumo: resumo[0], detalhe });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { buscarContaCorrente, lancar, excluirLancamento, salvarHonorarios, gerarRecibo, relatorio };
