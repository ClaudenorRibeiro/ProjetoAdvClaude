// Avisos aos clientes — quem pode ver e decidir os avisos de cada módulo.
// Permissão: módulo "avisos", sub-módulo = módulo do aviso (pericia | audiencia | parabens), ação "visualizar".
// Administrador (nível 0 e 1) vê todos. Se ninguém mais tiver a permissão, só o administrador vê.
const { pool } = require('../config/database');
const { MODULOS } = require('./constantes');

async function modulosPermitidos(usuario) {
  if (Number(usuario.nivel) <= 1) return [...MODULOS];
  const [rows] = await pool.execute(
    `SELECT submodulo FROM permissoes WHERE usuario_id = ? AND modulo = 'avisos' AND acao = 'visualizar' AND permitido = 1`, [usuario.id]);
  return rows.map(r => r.submodulo).filter(s => MODULOS.includes(s));
}

module.exports = { modulosPermitidos };
