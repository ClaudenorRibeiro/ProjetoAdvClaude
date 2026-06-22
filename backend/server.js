// ============================================================
// SERVIDOR PRINCIPAL — Sistema de Advocacia
// Inicializa Express, banco de dados e todos os serviços
// ============================================================

// override: true faz o .env SEMPRE prevalecer sobre variáveis já presentes no
// process.env (ex.: valores antigos que o PM2 injeta a partir do dump.pm2).
// Sem isso, uma senha SMTP velha guardada pelo PM2 sobrepunha a do .env e
// causava "BadCredentials" mesmo com o .env correto.
require('dotenv').config({ override: true }); // Carrega variáveis do .env (sobrescrevendo o ambiente)

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const path       = require('path');

const { testarConexao } = require('./src/config/database');
const rotas             = require('./src/routes/index');
const { iniciarAlertas } = require('./src/services/alertasService');

const app  = express();
const PORT = process.env.PORT || 3001;

// ---- SEGURANÇA ----
// Helmet adiciona headers HTTP de segurança automaticamente
app.use(helmet());

// Em produção o app fica atrás do nginx → confia em 1 hop de proxy para enxergar o IP real
// (logs e eventuais regras por IP). Em dev (sem proxy) fica false para não emitir aviso.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// OBS.: NÃO há rate limit GLOBAL na API — de propósito. Um teto por IP estrangularia o uso
// normal (o SPA dispara várias chamadas por tela) e, pior, bloquearia um escritório inteiro
// que compartilha o mesmo IP (NAT). A proteção contra força bruta fica SÓ no login, por
// usuário (ver loginLimiter em src/routes/index.js). As rotas internas são protegidas por JWT.

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
