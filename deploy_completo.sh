#!/bin/bash
# ==============================================================
# DEPLOY COMPLETO — Sistema de Advocacia
# Versão: 28052026
#
# Configura um servidor Ubuntu 22.04 do ZERO e sobe a aplicação
# completa sem nenhuma pergunta interativa.
#
# ► Como usar:
#   1. Edite as variáveis na seção "CONFIGURE AQUI"
#   2. bash deploy_completo.sh
#
# ► Tempo estimado: 10–15 minutos
# ==============================================================

set -e
export DEBIAN_FRONTEND=noninteractive

# ==============================================================
# ⚙️  CONFIGURE AQUI — edite antes de rodar
# ==============================================================
REPO_URL="https://github.com/ClaudenorRibeiro/ProjetoAdvClaude.git"
APP_DIR="/var/www/advocacia"

DB_NAME="sistema_advocacia"
DB_USER="advocacia_user"
DB_PASS="Adv@2026:)"               # ← Senha do banco MySQL

SUPER_LOGIN="superadmin"            # ← Login do superusuário (invisível na UI)
SUPER_SENHA="Adv@2026:)"            # ← Senha do superusuário

DOMINIO="98.85.19.2"              # ← IP do servidor ou domínio (sem http://)

SMTP_USER="antonioadv.sistema@gmail.com"
SMTP_PASS="tztl vqua xztz dyml"       # ← Senha de app do Gmail (pode configurar depois, colocando 2 etapas ativada e indo no link https://myaccount.google.com/apppasswords
EMAIL_FROM_NOME="Advocacia Dr Antonio Ferreira da Costa"
# ==============================================================

# Gera JWT_SECRET aleatório e seguro (nunca reutilize entre servidores)
JWT_SECRET=$(openssl rand -hex 64)

# --- Funções de log colorido ---
log() { echo -e "\n\033[1;34m━━ $1\033[0m"; }
ok()  { echo -e "\033[1;32m   ✓ $1\033[0m"; }
info(){ echo -e "\033[0;37m   · $1\033[0m"; }

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    DEPLOY COMPLETO — Sistema de Advocacia        ║"
echo "║    $(date '+%d/%m/%Y %H:%M')                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ==============================================================
# 0. SWAP — evita falta de memória em VMs com 512 MB RAM
# ==============================================================
log "Verificando swap..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    ok "Swap de 1 GB criado"
else
    ok "Swap já existe"
fi

# ==============================================================
# 1. ATUALIZA O SISTEMA E INSTALA DEPENDÊNCIAS BASE
# ==============================================================
log "[1/9] Atualizando sistema..."
sudo apt-get update -y -q
sudo apt-get upgrade -y -q \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold"
sudo apt-get install -y -q \
    curl wget git build-essential \
    software-properties-common ca-certificates
ok "Sistema atualizado"

# ==============================================================
# 2. NODE.JS 20
# ==============================================================
log "[2/9] Instalando Node.js 20..."
if ! node --version 2>/dev/null | grep -q "^v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null
    sudo apt-get install -y -q nodejs
fi
ok "Node.js $(node --version) | npm $(npm --version)"

# ==============================================================
# 3. MYSQL 8
# ==============================================================
log "[3/9] Instalando MySQL 8..."
if ! command -v mysql &>/dev/null; then
    sudo apt-get install -y -q mysql-server
fi
sudo systemctl start mysql
sudo systemctl enable mysql > /dev/null 2>&1
ok "MySQL instalado e rodando"

# ==============================================================
# 4. PM2 E NGINX
# ==============================================================
log "[4/9] Instalando PM2 e Nginx..."
if ! command -v pm2 &>/dev/null; then
    sudo npm install -g pm2 --quiet
fi
if ! command -v nginx &>/dev/null; then
    sudo apt-get install -y -q nginx
fi
sudo systemctl start nginx
sudo systemctl enable nginx > /dev/null 2>&1
ok "PM2 $(pm2 --version) | Nginx instalados"

# ==============================================================
# 5. CÓDIGO-FONTE
# ==============================================================
log "[5/9] Obtendo código do GitHub..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
    info "Repositório já existe — atualizando..."
    cd "$APP_DIR" && git pull origin main
    ok "Código atualizado"
else
    git clone "$REPO_URL" "$APP_DIR"
    ok "Repositório clonado"
fi

# Corrige trust proxy para funcionar atrás do Nginx
# (express-rate-limit exige trust proxy = 1 quando há proxy reverso)
if grep -q "trust proxy', false" "$APP_DIR/backend/server.js"; then
    sed -i "s/app.set('trust proxy', false)/app.set('trust proxy', 1)/" \
        "$APP_DIR/backend/server.js"
    ok "Trust proxy corrigido (server.js)"
else
    ok "Trust proxy já está correto"
fi

# ==============================================================
# 6. DEPENDÊNCIAS E BUILD
# ==============================================================
log "[6/9] Instalando dependências e compilando..."

# Backend — apenas dependências de produção
cd "$APP_DIR/backend"
npm install --omit=dev --quiet
ok "Backend: dependências instaladas"

# Frontend — precisa das devDeps para fazer o build
cd "$APP_DIR/frontend"
npm install --quiet
# NODE_OPTIONS limita RAM para não estourar em VMs pequenas
NODE_OPTIONS="--max-old-space-size=400" npm run build
ok "Frontend: build concluído"

# Detecta pasta de saída do Vite (projeto usa 'build', padrão é 'dist')
if   [ -d "$APP_DIR/frontend/build" ]; then BUILD_DIR="build"
elif [ -d "$APP_DIR/frontend/dist"  ]; then BUILD_DIR="dist"
else echo "ERRO: pasta de build não encontrada!"; exit 1
fi
ok "Build em: frontend/$BUILD_DIR/"

# ==============================================================
# 7. BANCO DE DADOS, .ENV E ESTRUTURA
# ==============================================================
log "[7/9] Configurando banco, .env e estrutura..."

# Cria database e usuário MySQL
sudo mysql -u root <<SQLEOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost'
  IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
ok "Banco '$DB_NAME' e usuário '$DB_USER' prontos"

# Cria o arquivo .env de produção
cat > "$APP_DIR/backend/.env" <<ENVEOF
# ============================================================
# Produção — Sistema de Advocacia
# Gerado pelo deploy_completo.sh em $(date '+%d/%m/%Y %H:%M')
# ============================================================

PORT=3001
NODE_ENV=production

# Banco de dados
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h

# Superusuário interno (nível 0 — invisível na interface)
SUPER_LOGIN=${SUPER_LOGIN}
SUPER_SENHA=${SUPER_SENHA}

# SMTP Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
EMAIL_FROM="${EMAIL_FROM_NOME} <${SMTP_USER}>"

# URL pública
FRONTEND_URL=http://${DOMINIO}
ENVEOF
ok ".env criado em $APP_DIR/backend/.env"

# Cria a estrutura do banco (46 tabelas — sem dados)
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$APP_DIR/estrutura_banco.sql"
ok "Estrutura do banco criada (46 tabelas)"

# Popula tabelas de referência (varas, fóruns, tipos, calendário, etc.)
DADOS_FILE="$APP_DIR/scripts/dados_iniciais.sql"
if [ -f "$DADOS_FILE" ]; then
    mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$DADOS_FILE"
    ok "Dados iniciais carregados (tabelas de referência)"
else
    info "⚠️  ATENÇÃO: scripts/dados_iniciais.sql não encontrado!"
    info "   Rode gerar_dados_iniciais.bat no Windows e faça commit."
fi

# Executa seeds: calendário (idempotente) + superusuário
cd "$APP_DIR/backend"
if node database/seeds/run.js; then
    ok "Seeds executados (calendário + superusuário)"
else
    info "⚠️  Seeds com erro — rode manualmente depois: node database/seeds/run.js"
fi

# Popula feriados nacionais 2024-2030
FERIADOS_FILE="$APP_DIR/scripts/popular_feriados.sql"
if [ -f "$FERIADOS_FILE" ]; then
    mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$FERIADOS_FILE" 2>/dev/null || true
    ok "Feriados 2024-2030 carregados"
else
    info "⚠️  popular_feriados.sql não encontrado"
fi

# ==============================================================
# 8. PM2 — GERENCIADOR DE PROCESSO
# ==============================================================
log "[8/9] Configurando PM2..."

cat > "$APP_DIR/ecosystem.config.js" <<'PM2EOF'
module.exports = {
  apps: [{
    name:               'advocacia-backend',
    script:             'server.js',
    cwd:                '/var/www/advocacia/backend',
    instances:          1,
    autorestart:        true,
    watch:              false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
PM2EOF

cd "$APP_DIR"
# Para o processo anterior (se existir) antes de reiniciar
pm2 delete advocacia-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save --force

# Configura PM2 para reiniciar automaticamente no boot do servidor
sudo env PATH="$PATH:/usr/bin" "$(which pm2)" startup systemd \
    -u "$USER" --hp "$HOME" > /dev/null 2>&1 || true
ok "PM2 rodando e configurado para autostart"

# ==============================================================
# 9. NGINX — PROXY REVERSO
# ==============================================================
log "[9/9] Configurando Nginx..."

sudo tee /etc/nginx/sites-available/advocacia > /dev/null <<NGINXEOF
server {
    listen 80;
    server_name ${DOMINIO};

    # Arquivos estáticos do frontend (React/Vite build)
    root ${APP_DIR}/frontend/${BUILD_DIR};
    index index.html;

    # Proxy da API para o Node.js na porta 3001
    location /api {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade        \$http_upgrade;
        proxy_set_header   Connection     'upgrade';
        proxy_set_header   Host           \$host;
        proxy_set_header   X-Real-IP      \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }

    # SPA — redireciona todas as rotas para o index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Bloqueia acesso a arquivos ocultos (.htaccess, .env, etc.)
    location ~ /\\.  {
        deny all;
    }
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/advocacia /etc/nginx/sites-enabled/advocacia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
ok "Nginx configurado e recarregado"

# ==============================================================
# RESUMO FINAL
# ==============================================================
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ✅  DEPLOY CONCLUÍDO COM SUCESSO!             ║"
echo "║    $(date '+%d/%m/%Y %H:%M')                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  🌐 Acesse:    http://${DOMINIO}"
echo "  👤 Login:     ${SUPER_LOGIN}"
echo "  🔑 Senha:     ${SUPER_SENHA}"
echo ""
pm2 status
echo ""
echo "  ─────────────────────────────────────────────"
echo "  ⚠️  Próximos passos:"
echo "  1. Acesse o sistema e faça o SETUP INICIAL"
echo "  2. Crie o usuário administrador (Dr. Antônio)"
echo "  3. No Registro.br: aponte o domínio → ${DOMINIO}"
echo "  4. Após DNS propagado, rode para ativar HTTPS:"
echo "     sudo apt install certbot python3-certbot-nginx -y"
echo "     sudo certbot --nginx -d seu.dominio.com.br"
echo "  ─────────────────────────────────────────────"
echo ""
