// ============================================================
// CONFIGURAÇÃO DA CONEXÃO COM O BANCO DE DADOS MySQL
// Usa pool de conexões para melhor performance
// ============================================================

const mysql = require('mysql2/promise');
const { criarDetectorSobrecarga } = require('./sobrecargaPool');

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

// ============================================================
// HORÁRIO DO BANCO = HORÁRIO DE BRASÍLIA
// O MySQL calcula CURDATE(), NOW() e os carimbos automáticos (criado_em etc.) no fuso do
// SERVIDOR onde ele roda — que pode ser UTC (comum em nuvem) e então "hoje" mudaria 3 horas
// cedo demais (a partir das 21h de Brasília). Para o sistema inteiro concordar com o relógio
// do escritório, toda conexão do pool fixa o fuso da sessão em -03:00 (o Brasil não tem horário
// de verão desde 2019). Os comandos de uma conexão rodam em fila, então o ajuste vale
// antes de qualquer consulta que a use.
// ============================================================
const FUSO_BRASILIA = '-03:00';
pool.on('connection', (conexao) => {
  conexao.query(`SET time_zone = '${FUSO_BRASILIA}'`, (err) => {
    if (err) console.error('Não foi possível ajustar o fuso horário da sessão do banco:', err.message);
  });
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
// Regra e motivo em ./sobrecargaPool.js. Aqui só ligamos o detector à fila real do pool
// (o mysql2 guarda os pedidos que esperam conexão em pool.pool._connectionQueue).
// Se uma versão futura do mysql2 mudar isso, o teste "fila do pool é legível" avisa na bateria.
// ============================================================
function lerFilaDoPool() {
  const fila = pool.pool && pool.pool._connectionQueue;
  return fila && typeof fila.length === 'number' ? fila.length : null;
}
const detector = criarDetectorSobrecarga({ lerFila: () => lerFilaDoPool() ?? 0 });
if (lerFilaDoPool() === null) {
  console.error('Aviso de capacidade desativado: não foi possível ler a fila do pool de conexões (mysql2 mudou?).');
} else {
  detector.iniciar();
}

// Retorna true se o pool ficou realmente saturado (fila contínua) nos últimos minutos.
// Usado pelo endpoint de notificações para acender o aviso de capacidade no topo da tela.
function sistemaSobrecarregado() {
  return detector.sobrecarregado();
}

module.exports = { pool, testarConexao, sistemaSobrecarregado, lerFilaDoPool, FUSO_BRASILIA };
