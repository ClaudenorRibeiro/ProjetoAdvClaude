// ============================================================
// CONFIGURAÇÃO DA CONEXÃO COM O BANCO DE DADOS MySQL
// Usa pool de conexões para melhor performance
// ============================================================

const mysql = require('mysql2/promise');

// Cria um pool de conexões — o sistema reutiliza conexões abertas
// em vez de abrir uma nova a cada requisição (muito mais rápido)
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'sistema_advocacia',
  waitForConnections: true,   // Aguarda uma conexão livre em vez de lançar erro
  connectionLimit: 10,        // Máximo de 10 conexões simultâneas
  queueLimit: 0,              // Sem limite na fila de espera
  charset: 'utf8mb4',         // Suporta emojis e caracteres especiais
  timezone: '-03:00',         // Fuso horário de Brasília
  dateStrings: true,          // Retorna DATE/DATETIME como string (YYYY-MM-DD) em vez de objeto Date JS
});

// Testa a conexão ao iniciar — lança erro se o banco não estiver acessível
async function testarConexao() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Banco de dados conectado com sucesso!');
    conn.release(); // Devolve a conexão para o pool
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    process.exit(1); // Para o servidor se não conseguir conectar
  }
}

module.exports = { pool, testarConexao };
