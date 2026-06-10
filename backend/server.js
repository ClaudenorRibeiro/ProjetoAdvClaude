// ============================================================
// SERVIDOR PRINCIPAL — Sistema de Advocacia
// Inicializa Express, banco de dados e todos os serviços
// ============================================================

require('dotenv').config(); // Carrega variáveis do arquivo .env

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { testarConexao } = require('./src/config/database');
const rotas             = require('./src/routes/index');
const { iniciarAlertas } = require('./src/services/alertasService');

const app  = express();
const PORT = process.env.PORT || 3001;

// ---- SEGURANÇA ----
// Helmet adiciona headers HTTP de segurança automaticamente
app.use(helmet());

// Informa ao Express que está atrás de um proxy local (evita aviso do express-rate-limit)
app.set('trust proxy', false);

// Limita requisições para prevenir ataques de força bruta
// Máximo de 200 requisições por IP a cada 15 minutos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { ok: false, mensagem: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api/', limiter);

// ---- CORS — Permite requisições do frontend ----
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---- PARSERS E COMPRESSÃO ----
app.use(compression()); // Comprime respostas para reduzir tráfego
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- ROTAS DA API ----
app.use('/api', rotas);

// ---- ROTA PADRÃO ----
// Quando em produção, serve o build do React
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// ---- TRATAMENTO DE ROTA NÃO ENCONTRADA ----
app.use((req, res) => {
  res.status(404).json({ ok: false, mensagem: 'Rota não encontrada' });
});

// ---- TRATAMENTO DE ERROS GLOBAIS ----
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ ok: false, mensagem: 'Erro interno no servidor' });
});

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
