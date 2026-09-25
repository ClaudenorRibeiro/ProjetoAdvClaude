// ============================================================
// CONTROLLER DE INSTITUIÇÕES FINANCEIRAS (bancos)
// ------------------------------------------------------------
// Cadastro simples (menu Controle, admin) do catálogo de bancos usado nas
// contas bancárias de Pessoas (Financeiro → Pessoas) e, nas próximas etapas,
// no Financeiro (conta_financeira, recebimento/repasse de parcela).
//
// Mesmo padrão de formaPagamentoController.js — e pela MESMA razão: a tabela
// já nasceu com a coluna "ativo" (script S2, 17/09/2026), não com verificação
// de uso como profissão. Soft-delete (ativo = 0): um banco removido some dos
// selects, mas a linha PERMANECE no banco — contas e lançamentos antigos
// continuam resolvendo o nome dele. Por isso "excluir" não precisa bloquear
// se em uso.
//
// Operações de um passo só → não exigem transação (regra do projeto).
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// GET /api/financeiro/instituicoes-financeiras — lista os bancos ativos (selects + gestão)
async function listar(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM instituicao_financeira WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// Regra única de criação de banco no catálogo — usada tanto pela tela dedicada
// (Controle → Instituições financeiras) quanto pelo atalho "+ novo banco" dentro do
// cadastro de conta bancária da Pessoa (pessoasController.criarAuxiliar). Preserva a
// grafia digitada (não força maiúscula/minúscula) e só compara contra bancos ATIVOS,
// para permitir recriar um nome que já foi desativado (auditoria 23/09: os dois
// caminhos tinham regra de duplicidade e capitalização diferentes entre si).
async function criarBancoNoCatalogo(nome, usuarioId) {
  const nomeTrim = String(nome || '').trim();
  if (!nomeTrim) {
    const e = new Error('Nome é obrigatório');
    e.codigoValidacaoAuxiliar = true;
    throw e;
  }
  const [existe] = await pool.execute(
    'SELECT id FROM instituicao_financeira WHERE nome = ? AND ativo = 1 LIMIT 1', [nomeTrim]
  );
  if (existe.length) {
    const e = new Error('Já existe um banco com esse nome');
    e.codigoValidacaoAuxiliar = true;
    throw e;
  }
  const conn = await pool.getConnection();
  let r;
  try {
    await conn.beginTransaction();
    [r] = await conn.execute('INSERT INTO instituicao_financeira (nome) VALUES (?)', [nomeTrim]);
    await auditoria.registrar(usuarioId, 'instituicao_financeira', 'criar', r.insertId, null, null, conn);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
  return { id: r.insertId, nome: nomeTrim };
}

// POST /api/financeiro/instituicoes-financeiras — cria um banco
async function criar(req, res) {
  try {
    const banco = await criarBancoNoCatalogo(req.body.nome, req.usuario.id);
    return sucesso(res, { id: banco.id }, 'Banco criado', 201);
  } catch (e) {
    if (e.codigoValidacaoAuxiliar) return erro(res, e.message);
    if (e.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe um banco com esse nome');
    return erroInterno(res, e);
  }
}

// PUT /api/financeiro/instituicoes-financeiras/:id — renomeia um banco
async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    const [antes] = await pool.execute('SELECT * FROM instituicao_financeira WHERE id = ?', [id]);
    const [existe] = await pool.execute(
      'SELECT id FROM instituicao_financeira WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1', [nome.trim(), id]
    );
    if (existe.length) return erro(res, 'Já existe um banco com esse nome');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE instituicao_financeira SET nome = ? WHERE id = ?', [nome.trim(), id]);
      await auditoria.registrar(req.usuario.id, 'instituicao_financeira', 'editar', id, antes[0], null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Banco atualizado');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe um banco com esse nome');
    return erroInterno(res, e);
  }
}

// DELETE /api/financeiro/instituicoes-financeiras/:id — soft-delete (ativo = 0).
// Não bloqueia em uso: a linha continua existindo e resolvendo o nome no histórico.
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [antes] = await pool.execute('SELECT * FROM instituicao_financeira WHERE id = ?', [id]);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE instituicao_financeira SET ativo = 0 WHERE id = ?', [id]);
      await auditoria.registrar(req.usuario.id, 'instituicao_financeira', 'excluir', id, antes[0], null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Banco removido');
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = { listar, criar, atualizar, excluir, criarBancoNoCatalogo };
