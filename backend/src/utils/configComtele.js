// Lê a configuração da Comtele (SMS): configuracoes_integracoes, modulo='comtele'.
// Usado pelo envio avulso de SMS (Pessoas) e pelos avisos automáticos aos clientes.
const { pool } = require('../config/database');

// Lê a config da Comtele (configuracoes_integracoes, modulo='comtele'). Retorna
// { apiKey, route } — apiKey vazio quando a integração não está ativa/configurada.
async function lerConfigComtele() {
  const [rows] = await pool.execute(
    "SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'comtele' LIMIT 1"
  );
  if (!rows.length || !rows[0].ativo) return { apiKey: '', route: '' };
  const cfg = rows[0].configuracoes
    ? (typeof rows[0].configuracoes === 'string' ? JSON.parse(rows[0].configuracoes) : rows[0].configuracoes)
    : {};
  return { apiKey: cfg.api_key || '', route: cfg.route || '' };
}

module.exports = { lerConfigComtele };
