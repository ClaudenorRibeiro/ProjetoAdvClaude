// ============================================================
// EXECUTOR DE SEEDS — Roda todos os seeds na ordem certa
// Execute: node database/seeds/run.js
// ============================================================

require('dotenv').config({ path: '../../.env' });
const { pool } = require('../../src/config/database');
const seedCalendario = require('./001_calendario');
const seedSuperUsuario = require('./002_superusuario');

async function rodarSeeds() {
  console.log('🚀 Iniciando seeds do banco de dados...\n');

  try {
    await seedCalendario(pool);
    await seedSuperUsuario(pool);

    console.log('\n✅ Todos os seeds executados com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erro ao executar seeds:', err.message);
    process.exit(1);
  }
}

rodarSeeds();
