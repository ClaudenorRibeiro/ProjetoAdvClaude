#!/bin/bash
# ============================================================
# SCRIPT 2 — Deploy da aplicação
# Sistema de Advocacia
#
# Execute após o script 1_setup_servidor.sh.
# Comando: bash 2_deploy_app.sh
#
# ANTES de rodar: edite as variáveis abaixo.
# ============================================================

set -e

# ============================================================
# ⚙️  CONFIGURE AQUI ANTES DE RODAR
# ============================================================
REPO_URL="https://github.com/ClaudenorRibeiro/ProjetoAdvClaude.git"
APP_DIR="/var/www/advocacia"
DB_NAME="sistema_advocacia"
DB_USER="advocacia_user"
DB_PASS=""          # ← DEFINA UMA SENHA FORTE para o banco
# ============================================================

if [ -z "$DB_PASS" ]; then
  echo "ERRO: Defina DB_PASS no início do script antes de rodar."
  exit 1
fi

echo ""
echo "======================================================"
echo " DEPLOY APP — Sistema de Advocacia"
echo "======================================================"
echo ""

# --------------------------------------------------------------
# 1. Clona ou atualiza o repositório
# --------------------------------------------------------------
echo "[1/7] Obtendo código do GitHub..."
if [ -d "$APP_DIR/.git" ]; then
  echo "Repositório já existe — atualizando..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# --------------------------------------------------------------
# 2. Instala dependências do backend
# --------------------------------------------------------------
echo "[2/7] Instalando dependências do backend..."
cd "$APP_DIR/backend"
npm install --omit=dev
echo "Backend: dependências instaladas."

# --------------------------------------------------------------
# 3. Instala dependências e faz build do frontend
# --------------------------------------------------------------
echo "[3/7] Instalando dependências e gerando build do frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build
echo "Frontend: build gerado em frontend/dist/"

# --------------------------------------------------------------
# 4. Cria banco de dados e usuário MySQL
# --------------------------------------------------------------
echo "[4/7] Configurando banco de dados..."
sudo mysql -u root <<SQLEOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost'
  IDENTIFIED BY '${DB_PASS}';

GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
echo "Banco '$DB_NAME' e usuário '$DB_USER' configurados."

# --------------------------------------------------------------
# 5. Cria o arquivo .env de produção
#    Se já existir, não sobrescreve — só avisa.
# --------------------------------------------------------------
echo "[5/7] Verificando arquivo .env..."
ENV_FILE="$APP_DIR/backend/.env"
if [ -f "$ENV_FILE" ]; then
  echo "⚠️  Arquivo .env já existe — NÃO foi sobrescrito."
  echo "    Verifique se as configurações estão corretas."
else
  cat > "$ENV_FILE" <<ENVEOF
# ============================================================
# Produção — Sistema de Advocacia
# Gerado automaticamente pelo script 2_deploy_app.sh
# EDITE os valores marcados com ← antes de iniciar
# ============================================================

PORT=3001
NODE_ENV=production

# Banco de dados
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}

# JWT — TROQUE por uma string longa e aleatória!
JWT_SECRET=TROQUE_POR_CHAVE_ALEATORIA_LONGA_AQUI   ←

# Superusuário interno
SUPER_LOGIN=superadmin
SUPER_SENHA=TROQUE_POR_SENHA_FORTE   ←

# SMTP Gmail (se usar "Esqueci minha senha")
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=antonioadv.sistema@gmail.com
SMTP_PASS=SENHA_DE_APP_GMAIL   ←
EMAIL_FROM=Advocacia Dr Antonio Ferreira da Costa <antonioadv.sistema@gmail.com>

# URL pública do sistema (com seu domínio)
FRONTEND_URL=https://SEU_DOMINIO_AQUI   ←
ENVEOF
  echo "Arquivo .env criado em $ENV_FILE"
  echo ""
  echo "⚠️  IMPORTANTE: edite o .env antes de continuar!"
  echo "    nano $ENV_FILE"
  echo ""
  read -p "Pressione ENTER após editar o .env para continuar..."
fi

# --------------------------------------------------------------
# 6. Executa as migrations na ordem
# --------------------------------------------------------------
echo "[6/7] Executando migrations..."
MIGRATIONS_DIR="$APP_DIR/backend/database/migrations"

# Carrega variáveis do .env para usar na conexão
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

run_migration() {
  local file="$1"
  if [ -f "$MIGRATIONS_DIR/$file" ]; then
    echo "  → Executando $file..."
    mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$MIGRATIONS_DIR/$file"
    echo "     ✓ $file concluída"
  else
    echo "  ⚠ $file não encontrada — pulando"
  fi
}

run_migration "001_criar_banco.sql"
run_migration "002_novo_modelo_processos.sql"
run_migration "003_expandir_forum_vara.sql"
run_migration "004_reset_tokens.sql"
run_migration "005_popular_forum_varas_ruy_barbosa.sql"
run_migration "005b_codVaraNoProc_ruy_barbosa.sql"
run_migration "006_codTipoProc_tbltipoproc.sql"
echo "Migrations concluídas."

# --------------------------------------------------------------
# 7. Cria o arquivo de configuração do PM2 e inicia o backend
# --------------------------------------------------------------
echo "[7/7] Configurando PM2..."
cat > "$APP_DIR/ecosystem.config.js" <<'PM2CONF'
module.exports = {
  apps: [{
    name:             'advocacia-backend',
    script:           'src/server.js',
    cwd:              '/var/www/advocacia/backend',
    instances:        1,
    autorestart:      true,
    watch:            false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
PM2CONF

cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save   # salva para reiniciar no boot
echo "PM2 iniciado."

echo ""
echo "======================================================"
echo " DEPLOY CONCLUÍDO!"
echo "======================================================"
echo ""
echo " Backend rodando na porta 3001 (PM2)"
echo " Frontend buildado em: $APP_DIR/frontend/dist/"
echo ""
echo " Próximo passo: execute o script 3_configurar_nginx.sh"
echo ""
