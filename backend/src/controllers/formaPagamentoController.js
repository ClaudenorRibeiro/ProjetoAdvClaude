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

// GET /api/financeiro/formas-pagamento — lista as formas ativas (selects + gestão)
async function listar(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM forma_pagamento WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/financeiro/formas-pagamento — cria uma forma de pagamento
async function criar(req, res) {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Evita nome duplicado entre as formas ATIVAS (regra de negócio fica no app, não no banco)
    const [existe] = await pool.execute(
      'SELECT id FROM forma_pagamento WHERE nome = ? AND ativo = 1 LIMIT 1', [nome.trim()]
    );
    if (existe.length) return erro(res, 'Já existe uma forma de pagamento com esse nome');
    const [r] = await pool.execute('INSERT INTO forma_pagamento (nome) VALUES (?)', [nome.trim()]);
    return sucesso(res, { id: r.insertId }, 'Forma de pagamento criada', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/financeiro/formas-pagamento/:id — renomeia uma forma de pagamento
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    // Duplicidade ignorando o próprio registro
    const [existe] = await pool.execute(
      'SELECT id FROM forma_pagamento WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1', [nome.trim(), id]
    );
    if (existe.length) return erro(res, 'Já existe uma forma de pagamento com esse nome');
    await pool.execute('UPDATE forma_pagamento SET nome = ? WHERE id = ?', [nome.trim(), id]);
    return sucesso(res, null, 'Forma de pagamento atualizada');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/financeiro/formas-pagamento/:id — soft-delete (ativo = 0).
// Não bloqueia em uso: a linha continua existindo e resolvendo o nome no histórico.
async function excluir(req, res) {
  try {
    await pool.execute('UPDATE forma_pagamento SET ativo = 0 WHERE id = ?', [req.params.id]);
    return sucesso(res, null, 'Forma de pagamento removida');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, criar, atualizar, excluir };
