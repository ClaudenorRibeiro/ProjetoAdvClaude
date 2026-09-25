// ============================================================
// APLICAÇÃO EXPRESS
// Separada da inicialização do servidor para permitir testes HTTP reais
// sem abrir uma porta, iniciar cron jobs ou conectar a serviços externos.
// ============================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const rotas = require('./routes/index');

function criarApp() {
  const app = express();

  app.use(helmet());
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api', rotas);

  if (process.env.NODE_ENV === 'production') {
    const pastaBuild = path.join(__dirname, '../../frontend/build');
    app.use(express.static(pastaBuild));
    app.get('*', (req, res) => {
      res.sendFile(path.join(pastaBuild, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ ok: false, mensagem: 'Rota não encontrada' });
  });

  app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({
        ok: false,
        mensagem: 'O conteúdo enviado excede o limite permitido de 10 MB.',
      });
    }
    res.status(500).json({ ok: false, mensagem: 'Erro interno no servidor' });
  });

  return app;
}

module.exports = { criarApp };
