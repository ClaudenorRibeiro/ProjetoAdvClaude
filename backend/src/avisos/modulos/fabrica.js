// Avisos aos clientes — o que Perícia e Audiência têm em comum: carregar um registro pelo número e achar os que ainda vão acontecer.
// Cada módulo (pericia.js, audiencia.js) só informa a consulta, os status que valem, como escrever o texto e o que não gera aviso (ignorar).
const { pool } = require('../../config/database');

function criarModuloDeEvento({ modulo, tabela, sqlItens, statusValidos, texto, ignorar = () => false }) {
  const lista = statusValidos.map(s => `'${s}'`).join(', ');   // lista fixa do código, nunca vem do usuário
  return {
    modulo, tabela, statusValidos, texto,
    // O registro (com nomes legíveis) ou null.
    async carregar(id, exec = pool) {
      const [rows] = await exec.execute(`${sqlItens} WHERE x.id = ?`, [id]);
      return rows[0] && !ignorar(rows[0]) ? rows[0] : null;
    },
    // Registros ainda válidos (status certo, com data) que acontecem de hoje em diante.
    async futuros(hoje, exec = pool) {
      const [rows] = await exec.execute(`${sqlItens} WHERE x.status IN (${lista}) AND x.data IS NOT NULL AND x.data >= ?`, [hoje]);
      return rows.filter(r => !ignorar(r));
    },
  };
}

module.exports = { criarModuloDeEvento };
