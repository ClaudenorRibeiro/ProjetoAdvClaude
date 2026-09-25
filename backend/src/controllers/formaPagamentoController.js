// ============================================================
// CONTROLLER DE FORMAS DE PAGAMENTO
// ------------------------------------------------------------
// Cadastro simples (menu Controle, admin) das formas de pagamento
// usadas no financeiro: recebimento do réu e, nas próximas etapas,
// repasses ao cliente/parceiro (PIX, TED, depósito, dinheiro,
// cartão/maquininha, cheque...).
//
// Soft-delete (ativo = 0): uma forma removida some dos selects, mas a
// linha PERMANECE no banco — assim lançamentos e recibos antigos continuam
// resolvendo o nome dela. Por isso "excluir" não precisa bloquear se em uso.
//
// Operações de um passo só → não exigem transação (regra do projeto).
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, erroInterno } = require('../utils/response');
const usosPermitidos = new Set(['financeira', 'especie', 'ambos']);

function usoValido(uso) {
  return usosPermitidos.has(uso) ? uso : null;
}

// GET /api/financeiro/formas-pagamento — lista as formas ativas (selects + gestão)
async function listar(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome, uso_permitido FROM forma_pagamento WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/financeiro/formas-pagamento — cria uma forma de pagamento
async function criar(req, res) {
  try {
    const { nome, uso_permitido } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    const uso = usoValido(uso_permitido);
    if (!uso) return erro(res, 'Informe onde esta forma pode ser usada.');
    // Confere ANTES de gravar, só para dar a mensagem cedo (evita a viagem ao banco
    // no caso comum). A trava que garante isso de verdade — mesmo com duas gravações
    // simultâneas — é o índice único (nome, ativo) no banco; ver catch abaixo.
    const [existe] = await pool.execute(
      'SELECT id FROM forma_pagamento WHERE nome = ? AND ativo = 1 LIMIT 1', [nome.trim()]
    );
    if (existe.length) return erro(res, 'Já existe uma forma de pagamento com esse nome');
    const conn = await pool.getConnection();
    let r;
    try {
      await conn.beginTransaction();
      [r] = await conn.execute('INSERT INTO forma_pagamento (nome, uso_permitido) VALUES (?, ?)', [nome.trim(), uso]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { id: r.insertId }, 'Forma de pagamento criada', 201);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe uma forma de pagamento com esse nome');
    return erroInterno(res, e);
  }
}

// PUT /api/financeiro/formas-pagamento/:id — renomeia uma forma de pagamento
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, uso_permitido } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    const uso = usoValido(uso_permitido);
    if (!uso) return erro(res, 'Informe onde esta forma pode ser usada.');
    // Duplicidade ignorando o próprio registro (mesma observação do criar acima)
    const [existe] = await pool.execute(
      'SELECT id FROM forma_pagamento WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1', [nome.trim(), id]
    );
    if (existe.length) return erro(res, 'Já existe uma forma de pagamento com esse nome');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE forma_pagamento SET nome = ?, uso_permitido = ? WHERE id = ?', [nome.trim(), uso, id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Forma de pagamento atualizada');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe uma forma de pagamento com esse nome');
    return erroInterno(res, e);
  }
}

// DELETE /api/financeiro/formas-pagamento/:id — soft-delete (ativo = 0).
// Não bloqueia em uso: a linha continua existindo e resolvendo o nome no histórico.
async function excluir(req, res) {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE forma_pagamento SET ativo = 0 WHERE id = ?', [req.params.id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Forma de pagamento desativada');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, criar, atualizar, excluir };
