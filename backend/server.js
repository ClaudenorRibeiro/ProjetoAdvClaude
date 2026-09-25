// ============================================================
// SERVIDOR PRINCIPAL — Sistema de Advocacia
// Inicializa Express, banco de dados e todos os serviços
// ============================================================

// override: true faz o .env SEMPRE prevalecer sobre variáveis já presentes no
// process.env (ex.: valores antigos que o PM2 injeta a partir do dump.pm2).
// Sem isso, uma senha SMTP velha guardada pelo PM2 sobrepunha a do .env e
// causava "BadCredentials" mesmo com o .env correto.
require('dotenv').config({ override: true }); // Carrega variáveis do .env (sobrescrevendo o ambiente)

const { testarConexao } = require('./src/config/database');
const { iniciarAlertas } = require('./src/services/alertasService');
const { criarApp }       = require('./src/app');

const app  = criarApp();
const PORT = process.env.PORT || 3001;

// ---- INICIALIZAÇÃO ----
async function iniciar() {
  // Testa a conexão com o banco antes de iniciar
  await testarConexao();

  // Inicia o servidor HTTP
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
  });

  // Inicia os jobs de alerta automático (cron jobs)
  iniciarAlertas();
}

iniciar().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
