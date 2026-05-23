// ============================================================
// SEED: SUPERUSUÁRIO
// Cria o superusuário hardcoded (dono do sistema)
// Credenciais definidas no .env — NUNCA expostas na interface
// ============================================================

const bcrypt = require('bcryptjs');

async function seedSuperUsuario(pool) {
  console.log('👑 Criando superusuário...');

  const login = process.env.SUPER_LOGIN || 'superadmin';
  const senha = process.env.SUPER_SENHA || 'Mudar@123456';

  // Verifica se já existe
  const [existente] = await pool.execute(
    'SELECT id FROM usuarios WHERE nivel = 0 LIMIT 1'
  );
  if (existente.length > 0) {
    console.log('   ✓ Superusuário já existe, pulando...');
    return;
  }

  // Criptografa a senha antes de salvar
  const senhaHash = await bcrypt.hash(senha, 12);

  await pool.execute(
    `INSERT INTO usuarios (nome, login, senha_hash, tipo, nivel, ativo)
     VALUES (?, ?, ?, 'administrador', 0, 1)`,
    ['Superusuário', login, senhaHash]
  );

  console.log(`   ✓ Superusuário criado (login: ${login})`);
  console.log('   ⚠️  Altere a senha no .env imediatamente em produção!');
}

module.exports = seedSuperUsuario;
