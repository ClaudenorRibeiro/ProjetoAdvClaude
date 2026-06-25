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
  connectionLimit: 15,        // Máx. de operações SIMULTÂNEAS no banco (não é "usuários logados"; ver memória). Dimensionado p/ servidor 512MB/2vCPU
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

// ============================================================
// DETECÇÃO DE SOBRECARGA DO POOL (aviso de capacidade na tela, p/ admin)
// O pool emite o evento 'enqueue' quando TODAS as conexões (connectionLimit)
// estão ocupadas e um novo pedido precisa esperar na fila. Guardamos em memória
// o instante da última vez que isso aconteceu — sem banco, sem custo relevante.
// ============================================================
let ultimaSobrecargaEm = 0;                     // timestamp (ms) da última saturação; 0 = nunca houve
const JANELA_SOBRECARGA_MS = 3 * 60 * 1000;     // considera "sobrecarregado" se ocorreu nos últimos 3 minutos

pool.on('enqueue', () => {
  ultimaSobrecargaEm = Date.now();
});

// Retorna true se o pool ficou saturado nos últimos minutos.
// Usado pelo endpoint de notificações para acender o aviso de capacidade no topo da tela.
function sistemaSobrecarregado() {
  return ultimaSobrecargaEm > 0 && (Date.now() - ultimaSobrecargaEm) < JANELA_SOBRECARGA_MS;
}

module.exports = { pool, testarConexao, sistemaSobrecarregado };
