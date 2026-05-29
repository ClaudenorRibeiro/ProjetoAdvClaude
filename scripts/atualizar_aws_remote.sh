#!/bin/bash
# ============================================================
# SCRIPT REMOTO DE ATUALIZAÇÃO — Sistema de Advocacia
# Executado automaticamente pelo atualizar-sistema-aws.bat
# NÃO execute manualmente — use o .bat no Windows.
# ============================================================

set -euo pipefail

APP_DIR="/var/www/advocacia"
DB_USER="advocacia_user"
DB_PASS="Adv@2026:)"
DB_NAME="sistema_advocacia"

log() { echo -e "\n\033[1;34m━━ $1\033[0m"; }
ok()  { echo -e "\033[1;32m   ✓ $1\033[0m"; }

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ATUALIZANDO — Sistema de Advocacia            ║"
echo "║    $(date '+%d/%m/%Y %H:%M')                             ║"
echo "╚══════════════════════════════════════════════════╝"

# ----------------------------------------------------------
# 1. Dependências do backend (só instala se algo mudou)
# ----------------------------------------------------------
log "[1/4] Dependências do backend..."
cd "$APP_DIR/backend"
npm install --omit=dev --quiet
ok "Backend: dependências ok"

# ----------------------------------------------------------
# 2. Build do frontend
# ----------------------------------------------------------
log "[2/4] Compilando frontend..."
cd "$APP_DIR/frontend"
npm install --quiet
NODE_OPTIONS="--max-old-space-size=400" npm run build
ok "Frontend: build concluído"

# ----------------------------------------------------------
# 3. Dados de referência (INSERT IGNORE — sempre seguro)
#    Aplica novos itens adicionados em: varas, fóruns, tipos,
#    calendário, modelos, etc. Linhas existentes são ignoradas.
# ----------------------------------------------------------
log "[3/4] Dados de referência..."
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  < "$APP_DIR/scripts/dados_iniciais.sql"
ok "Dados de referência aplicados"

# ----------------------------------------------------------
# 4. Reinicia o backend via PM2
# ----------------------------------------------------------
log "[4/4] Reiniciando backend..."
pm2 restart advocacia-backend
ok "Backend reiniciado"

# ----------------------------------------------------------
# Resumo
# ----------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ✅  ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!        ║"
echo "║    $(date '+%d/%m/%Y %H:%M')                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
pm2 status
echo ""
