// ============================================================
// RELATÓRIOS — limite "x" de relatórios por usuário (tela do administrador)
// Padrão do escritório (configuracoes_escritorio) + exceção por usuário (usuarios.max_relatorios).
// ============================================================
const { pool } = require('../../config/database');
const auditoria = require('../../middleware/auditoria');
const L = require('./limites');
const { ErroRelatorio } = require('./erros');

const MAX_PERMITIDO = 500;

function inteiroValido(v) { return Number.isInteger(v) && v >= 0 && v <= MAX_PERMITIDO; }

async function obterLimites() {
  const [cfg] = await pool.execute('SELECT max_relatorios_por_usuario FROM configuracoes_escritorio LIMIT 1');
  const padrao = cfg.length ? Number(cfg[0].max_relatorios_por_usuario) : L.LIMITE_PADRAO_MODELOS;
  const [usuarios] = await pool.execute(
    `SELECT u.id, u.nome, u.login, u.max_relatorios,
            (SELECT COUNT(*) FROM relatorio_modelo m WHERE m.dono_id = u.id AND m.escopo = 'pessoal') AS criados
       FROM usuarios u WHERE u.ativo = 1 ORDER BY u.nome`);
  return {
    padrao, maximoPermitido: MAX_PERMITIDO,
    usuarios: usuarios.map(u => ({
      id: u.id, nome: u.nome, login: u.login,
      max_relatorios: u.max_relatorios === null ? null : Number(u.max_relatorios), criados: Number(u.criados),
    })),
  };
}

// dados: { padrao?: number, usuarios?: { [id]: number | null } }  (null = volta a usar o padrão)
async function salvarLimites(admin, dados) {
  const padrao = dados?.padrao;
  const porUsuario = dados?.usuarios && typeof dados.usuarios === 'object' ? dados.usuarios : {};
  if (padrao !== undefined && !inteiroValido(padrao)) throw new ErroRelatorio(`O limite padrão deve ser um número de 0 a ${MAX_PERMITIDO}.`);
  for (const [id, v] of Object.entries(porUsuario)) {
    if (!/^\d+$/.test(id) || (v !== null && !inteiroValido(v))) throw new ErroRelatorio(`Os limites individuais devem ser números de 0 a ${MAX_PERMITIDO} (ou vazio para usar o padrão).`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (padrao !== undefined) {
      await conn.execute('UPDATE configuracoes_escritorio SET max_relatorios_por_usuario = ? LIMIT 1', [padrao]);
      await auditoria.registrar(admin.id, 'configuracoes_escritorio', 'editar', 1, null, null, conn);
    }
    for (const [id, v] of Object.entries(porUsuario)) {
      const [r] = await conn.execute('UPDATE usuarios SET max_relatorios = ? WHERE id = ?', [v, Number(id)]);
      if (r.affectedRows) await auditoria.registrar(admin.id, 'usuarios', 'editar', Number(id), null, null, conn);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return obterLimites();
}

module.exports = { obterLimites, salvarLimites };
