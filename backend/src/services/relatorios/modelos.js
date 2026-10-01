// ============================================================
// RELATÓRIOS — RECEITAS salvas (tabelas relatorio_modelo e relatorio_modelo_usuario).
// Guarda só as ESCOLHAS (assunto, colunas, filtros, ordem) — nunca dados de clientes/processos.
// Fase 1: cada usuário vê e mexe só nos seus relatórios pessoais (o resto vem nas fases seguintes).
// ============================================================
const { pool } = require('../../config/database');
const auditoria = require('../../middleware/auditoria');
const L = require('./limites');
const { ErroRelatorio } = require('./erros');

const { validarPreferencias, mesclar, LINHAS_POR_PAGINA_VALIDAS } = require('./preferencias');

function lerJson(v) { return typeof v === 'string' ? JSON.parse(v) : v; }
// No banco, o vínculo tem origem 'proprio' | 'colega' | 'liberado' (a coluna tem só 12 letras: "compartilhado" não cabe).
// Para a tela: 'sistema' = do escritório (todos veem); 'compartilhado' = de um colega; 'proprio' = meu.
const ORIGEM_COLEGA = 'colega';
function origemDe(r) {
  if (r.escopo === 'sistema') return 'sistema';
  return r.origem === ORIGEM_COLEGA ? 'compartilhado' : 'proprio';
}

const ehAdmin = (usuario) => Number(usuario.nivel) <= 1;

function paraModelo(r) {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao, assunto: r.assunto, escopo: r.escopo, origem: origemDe(r),
    dono_nome: r.dono_nome || null, compartilhado_com: Number(r.compartilhado_com || 0),
    receita: lerJson(r.definicao), preferencias: r.preferencias ? lerJson(r.preferencias) : {},
    criado_em: r.criado_em, alterado_em: r.alterado_em,
  };
}

// Quem enxerga o relatório: os que têm vínculo (próprio/compartilhado) E, no caso dos do sistema, todos.
const COLUNAS = `m.id, m.nome, m.descricao, m.assunto, m.definicao, m.escopo, m.dono_id, m.criado_em, m.alterado_em,
       mu.preferencias, mu.origem, ud.nome AS dono_nome,
       (SELECT COUNT(*) FROM relatorio_modelo_usuario x WHERE x.modelo_id = m.id AND x.origem = '${ORIGEM_COLEGA}') AS compartilhado_com`;
const JUNCOES = `FROM relatorio_modelo m
       LEFT JOIN relatorio_modelo_usuario mu ON mu.modelo_id = m.id AND mu.usuario_id = ?
       JOIN usuarios ud ON ud.id = m.dono_id`;
const VISIVEL = "(mu.usuario_id IS NOT NULL OR m.escopo = 'sistema')";

function validarNome(nome, descricao) {
  const n = typeof nome === 'string' ? nome.trim() : '';
  if (!n) throw new ErroRelatorio('Dê um nome ao relatório.');
  if (n.length > 100) throw new ErroRelatorio('O nome do relatório pode ter no máximo 100 letras.');
  const d = typeof descricao === 'string' ? descricao.trim().slice(0, 300) : '';
  return { nome: n, descricao: d || null };
}

// Limite de relatórios pessoais: exceção do usuário > padrão do escritório > padrão do sistema
async function limiteDoUsuario(db, usuarioId) {
  const [u] = await db.execute('SELECT max_relatorios FROM usuarios WHERE id = ?', [usuarioId]);
  if (u.length && u[0].max_relatorios !== null && u[0].max_relatorios !== undefined) return Number(u[0].max_relatorios);
  const [cfg] = await db.execute('SELECT max_relatorios_por_usuario FROM configuracoes_escritorio LIMIT 1');
  return cfg.length ? Number(cfg[0].max_relatorios_por_usuario) : L.LIMITE_PADRAO_MODELOS;
}

async function contarPessoais(db, usuarioId) {
  const [rows] = await db.execute("SELECT COUNT(*) AS total FROM relatorio_modelo WHERE dono_id = ? AND escopo = 'pessoal'", [usuarioId]);
  return Number(rows[0].total);
}

async function listarMeus(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT ${COLUNAS} ${JUNCOES} WHERE ${VISIVEL} ORDER BY m.nome`, [usuarioId]);
  const limite = await limiteDoUsuario(pool, usuarioId);
  const criados = await contarPessoais(pool, usuarioId);
  return { modelos: rows.map(paraModelo), limite, criados };
}

async function obter(db, id, usuarioId) {
  const [rows] = await db.execute(
    `SELECT ${COLUNAS} ${JUNCOES} WHERE m.id = ? AND ${VISIVEL}`, [usuarioId, id]);
  return rows.length ? { ...paraModelo(rows[0]), dono_id: rows[0].dono_id } : null;
}

async function obterOuErro(db, id, usuarioId) {
  const m = await obter(db, id, usuarioId);
  if (!m) throw new ErroRelatorio('Relatório não encontrado.', 404);
  return m;
}

// Pessoal: só o dono altera/exclui. Do sistema: só o administrador. Compartilhado: ninguém além do dono.
function exigirEdicao(modelo, usuario) {
  if (modelo.escopo === 'sistema') {
    if (!ehAdmin(usuario)) throw new ErroRelatorio('Os relatórios do sistema só podem ser alterados pelo administrador.', 403);
    return;
  }
  if (modelo.dono_id !== usuario.id) throw new ErroRelatorio('Você só pode alterar os seus próprios relatórios.', 403);
}

// Nome único entre os relatórios do sistema (o índice do banco só garante por dono)
async function exigirNomeDoSistemaLivre(db, nome, ignorarId = null) {
  const [ja] = await db.execute("SELECT id FROM relatorio_modelo WHERE escopo = 'sistema' AND nome = ? AND id <> ?", [nome, ignorarId || 0]);
  if (ja.length) throw new ErroRelatorio('Já existe um relatório do sistema com esse nome.', 409);
}

function traduzirDuplicidade(err) {
  if (err && err.code === 'ER_DUP_ENTRY') throw new ErroRelatorio('Você já tem um relatório com esse nome.', 409);
  throw err;
}

// Cria dentro de UMA transação: trava o usuário, confere o limite (só pessoais), grava a receita e o vínculo
async function criarComConexao(conn, usuario, { nome, descricao, receita, escopo = 'pessoal' }) {
  await conn.execute('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [usuario.id]); // evita 2 criações simultâneas furarem o limite
  if (escopo === 'sistema') {
    if (!ehAdmin(usuario)) throw new ErroRelatorio('Só o administrador cria relatórios do sistema.', 403);
    await exigirNomeDoSistemaLivre(conn, nome);
  } else {
    const limite = await limiteDoUsuario(conn, usuario.id);
    const total = await contarPessoais(conn, usuario.id);
    if (total >= limite) {
      throw new ErroRelatorio(`Você já tem ${total} de ${limite} relatórios permitidos. Exclua um para criar outro ou peça ao administrador para aumentar o seu limite.`, 409);
    }
  }
  const [r] = await conn.execute(
    'INSERT INTO relatorio_modelo (nome, descricao, assunto, definicao, escopo, dono_id) VALUES (?, ?, ?, ?, ?, ?)',
    [nome, descricao, receita.assunto, JSON.stringify(receita), escopo, usuario.id]);
  await conn.execute("INSERT INTO relatorio_modelo_usuario (modelo_id, usuario_id, origem) VALUES (?, ?, 'proprio')", [r.insertId, usuario.id]);
  await auditoria.registrar(usuario.id, 'relatorio_modelo', 'criar', r.insertId, null, null, conn);
  return r.insertId;
}

async function transacao(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    return traduzirDuplicidade(err);
  } finally {
    conn.release();
  }
}

// receita: já validada pelo validador
async function criar(usuario, dados, receita) {
  const { nome, descricao } = validarNome(dados.nome, dados.descricao);
  const escopo = dados.escopo === 'sistema' ? 'sistema' : 'pessoal';
  const id = await transacao(conn => criarComConexao(conn, usuario, { nome, descricao, receita, escopo }));
  return obter(pool, id, usuario.id);
}

async function atualizar(usuario, id, dados, receitaNova) {
  await transacao(async conn => {
    const m = await obterOuErro(conn, id, usuario.id);
    exigirEdicao(m, usuario);
    const { nome, descricao } = validarNome(dados.nome ?? m.nome, dados.descricao !== undefined ? dados.descricao : m.descricao);
    if (m.escopo === 'sistema') await exigirNomeDoSistemaLivre(conn, nome, id);
    const receita = receitaNova || m.receita;
    await conn.execute(
      'UPDATE relatorio_modelo SET nome = ?, descricao = ?, assunto = ?, definicao = ?, alterado_em = NOW(), alterado_por = ? WHERE id = ?',
      [nome, descricao, receita.assunto, JSON.stringify(receita), usuario.id, id]);
    await auditoria.registrar(usuario.id, 'relatorio_modelo', 'editar', id, null, null, conn);
  });
  return obter(pool, id, usuario.id);
}

async function excluir(usuario, id) {
  await transacao(async conn => {
    const m = await obterOuErro(conn, id, usuario.id);
    exigirEdicao(m, usuario);
    // registra ANTES de apagar, guardando o nome para o histórico continuar legível
    await auditoria.registrar(usuario.id, 'relatorio_modelo', 'excluir', id, { nome: m.nome }, null, conn);
    await conn.execute('DELETE FROM relatorio_modelo WHERE id = ?', [id]); // o vínculo sai junto (ON DELETE CASCADE)
  });
}

async function duplicar(usuario, id) {
  const novoId = await transacao(async conn => {
    const m = await obterOuErro(conn, id, usuario.id);
    let nome = `Cópia de ${m.nome}`.slice(0, 100);
    for (let n = 2; n < 100; n++) {
      const [ja] = await conn.execute('SELECT id FROM relatorio_modelo WHERE dono_id = ? AND nome = ?', [usuario.id, nome]);
      if (!ja.length) break;
      nome = `${`Cópia de ${m.nome}`.slice(0, 94)} (${n})`;
    }
    return criarComConexao(conn, usuario, { nome, descricao: m.descricao, receita: m.receita });
  });
  return obter(pool, novoId, usuario.id);
}

// Mescla com o que já estava guardado: mudar só o tipo de gráfico não apaga as linhas por página
async function salvarPreferencias(usuario, id, prefs) {
  const atual = await obterOuErro(pool, id, usuario.id);
  const novas = mesclar(atual.preferencias, validarPreferencias(prefs));
  await pool.execute(
    `INSERT INTO relatorio_modelo_usuario (modelo_id, usuario_id, origem, preferencias) VALUES (?, ?, 'liberado', ?)
     ON DUPLICATE KEY UPDATE preferencias = VALUES(preferencias)`,
    [id, usuario.id, JSON.stringify(novas)]);
  return novas;
}

module.exports = { ORIGEM_COLEGA, listarMeus, obter, obterOuErro, criar, atualizar, excluir, duplicar, salvarPreferencias, limiteDoUsuario, ehAdmin, transacao, LINHAS_POR_PAGINA_VALIDAS };
