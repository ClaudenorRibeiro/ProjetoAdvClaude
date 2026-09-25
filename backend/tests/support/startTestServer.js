const { carregarAmbienteTeste } = require('./testEnvironment');
const { recriarBancoTeste } = require('./testDatabase');

async function iniciar() {
  carregarAmbienteTeste();
  await recriarBancoTeste();

  const { criarApp } = require('../../src/app');
  const { pool } = require('../../src/config/database');
  const porta = Number(process.env.TEST_BACKEND_PORT || 3001);
  const servidor = criarApp().listen(porta, '127.0.0.1', () => {
    console.log(`Servidor isolado de testes em http://127.0.0.1:${porta}`);
  });

  async function encerrar() {
    servidor.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

iniciar().catch(err => {
  console.error(err.message);
  process.exit(1);
});
