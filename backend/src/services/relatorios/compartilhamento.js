// ============================================================
// RELATÓRIOS — compartilhar um relatório pessoal com colegas.
// Regras: só o DONO compartilha; só com colega ATIVO que tenha acesso a Relatórios e ao assunto do relatório
// (senão ele receberia algo que não consegue abrir). Quem recebe pode abrir, exportar e duplicar; não altera.
// O colega vê SEMPRE com as permissões dele (o motor confere a cada execução). Nada de dados é compartilhado,
// só a receita.
// ============================================================
const { pool } = require('../../config/database');
const auditoria = require('../../middleware/auditoria');
const { buscarPermissoesUsuario } = require('../../middleware/permissoes');
const { hojeBrasilia } = require('../../utils/helpers');
const { ErroRelatorio } = require('./erros');
const { pode } = require('./visibilidade');
const { obterAssunto, assuntoPermitido } = require('./catalogo');
const modelos = require('./modelos');

const MAX_COLEGAS = 50;

async function contextoDe(u) {
  const ehAdmin = Number(u.nivel) <= 1;
  return { id: u.id, ehAdmin, permissoes: ehAdmin ? {} : await buscarPermissoesUsuario(u.id), hoje: hojeBrasilia() };
}

// Colegas ativos (menos eu) com o motivo, quando não dá para compartilhar
async function candidatos(db, usuario, modelo) {
  const [rows] = await db.execute('SELECT id, nome, nivel FROM usuarios WHERE ativo = 1 AND id <> ? ORDER BY nome', [usuario.id]);
  const assunto = obterAssunto(modelo.assunto);
  const saida = [];
  for (const u of rows) {
    const ctx = await contextoDe(u);
    let motivo = null;
    if (!pode(ctx, 'relatorios', 'visualizar')) motivo = 'não tem acesso a Relatórios';
    else if (!assunto || !assuntoPermitido(ctx, assunto)) motivo = `não tem acesso a ${assunto ? assunto.rotulo : 'este assunto'}`;
    saida.push({ id: u.id, nome: u.nome, pode: !motivo, motivo });
  }
  return saida;
}

async function exigirDono(db, usuario, id) {
  const m = await modelos.obterOuErro(db, id, usuario.id);
  if (m.escopo !== 'pessoal') throw new ErroRelatorio('Os relatórios do sistema já são de todos: não precisam ser compartilhados.', 422);
  if (m.dono_id !== usuario.id) throw new ErroRelatorio('Só quem criou o relatório pode compartilhá-lo.', 403);
  return m;
}

// Quem já recebeu (inclusive colegas hoje inativos, para o dono poder retirar)
async function atuais(db, id) {
  const [rows] = await db.execute(
    `SELECT u.id, u.nome, u.ativo FROM relatorio_modelo_usuario mu JOIN usuarios u ON u.id = mu.usuario_id
      WHERE mu.modelo_id = ? AND mu.origem = ? ORDER BY u.nome`, [id, modelos.ORIGEM_COLEGA]);
  return rows.map(r => ({ id: r.id, nome: r.nome, ativo: !!r.ativo }));
}

async function consultar(usuario, id) {
  const m = await exigirDono(pool, usuario, id);
  return { compartilhados: await atuais(pool, id), candidatos: await candidatos(pool, usuario, m) };
}

// Define EXATAMENTE a lista de colegas (quem sai da lista perde o acesso)
async function definir(usuario, id, bruto) {
  if (!Array.isArray(bruto) || bruto.length > MAX_COLEGAS) throw new ErroRelatorio(`Escolha no máximo ${MAX_COLEGAS} colegas.`, 422);
  const ids = [...new Set(bruto.map(Number))];
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw new ErroRelatorio('Lista de colegas inválida.', 422);

  return modelos.transacao(async (conn) => {
    await conn.execute('SELECT id FROM relatorio_modelo WHERE id = ? FOR UPDATE', [id]);   // 2 pessoas mexendo ao mesmo tempo não se atropelam
    const m = await exigirDono(conn, usuario, id);
    const elegiveis = new Map((await candidatos(conn, usuario, m)).map(c => [c.id, c]));
    const recusados = ids.filter(n => !elegiveis.get(n) || !elegiveis.get(n).pode);
    if (recusados.length) {
      const nomes = recusados.map(n => elegiveis.get(n)?.nome || `#${n} (não é um colega ativo)`);
      throw new ErroRelatorio(`Só dá para compartilhar com colegas ativos que tenham acesso a Relatórios e a este assunto. Não foi possível: ${nomes.join(', ')}.`, 422);
    }
    const antes = new Set((await atuais(conn, id)).map(c => c.id));
    for (const n of antes) if (!ids.includes(n)) await conn.execute('DELETE FROM relatorio_modelo_usuario WHERE modelo_id = ? AND usuario_id = ? AND origem = ?', [id, n, modelos.ORIGEM_COLEGA]);
    for (const n of ids) if (!antes.has(n)) await conn.execute('INSERT INTO relatorio_modelo_usuario (modelo_id, usuario_id, origem) VALUES (?, ?, ?)', [id, n, modelos.ORIGEM_COLEGA]);
    await auditoria.registrar(usuario.id, 'relatorio_modelo', 'compartilhar', id, null, { com: ids.map(n => elegiveis.get(n).nome) }, conn);
    return { compartilhados: await atuais(conn, id) };
  });
}

// O colega tira da própria lista um relatório que recebeu (o relatório do dono não muda)
async function sair(usuario, id) {
  const [r] = await pool.execute('DELETE FROM relatorio_modelo_usuario WHERE modelo_id = ? AND usuario_id = ? AND origem = ?', [id, usuario.id, modelos.ORIGEM_COLEGA]);
  if (!r.affectedRows) throw new ErroRelatorio('Relatório não encontrado entre os compartilhados com você.', 404);
  await auditoria.registrar(usuario.id, 'relatorio_modelo', 'descompartilhar', id);
}

module.exports = { consultar, definir, sair, MAX_COLEGAS };
