#!/bin/bash
# ============================================================
# SCRIPT 5 — Atualizar o sistema em produção
# Sistema de Advocacia
#
# Use sempre que fizer um novo deploy após commits no Git.
# Comando: bash 5_atualizar.sh
# ============================================================

set -e

APP_DIR="/var/www/advocacia"

echo ""
echo "======================================================"
echo " ATUALIZAÇÃO — Sistema de Advocacia"
echo "======================================================"
echo ""

# --------------------------------------------------------------
# 1. Baixa código atualizado do GitHub
# --------------------------------------------------------------
echo "[1/4] Baixando atualizações do GitHub..."
cd "$APP_DIR"
git pull origin main
echo "Código atualizado."

# --------------------------------------------------------------
# 2. Atualiza dependências do backend (se package.json mudou)
# --------------------------------------------------------------
echo "[2/4] Verificando dependências do backend..."
cd "$APP_DIR/backend"
npm install --omit=dev
echo "Backend: dependências OK."

# --------------------------------------------------------------
# 3. Rebuild do frontend
# --------------------------------------------------------------
echo "[3/4] Gerando novo build do frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build
echo "Frontend: build atualizado."

# --------------------------------------------------------------
# 4. Reinicia o backend via PM2
# --------------------------------------------------------------
echo "[4/4] Reiniciando backend..."
pm2 restart advocacia-backend
pm2 status

echo ""
echo "======================================================"
echo " ATUALIZAÇÃO CONCLUÍDA!"
echo "======================================================"
echo ""
echo " O sistema está rodando com a versão mais recente."
echo " Verifique o log se houver problemas: pm2 logs advocacia-backend"
echo ""
