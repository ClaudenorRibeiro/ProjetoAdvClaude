#!/bin/bash
# ============================================================
# SCRIPT 1 — Setup inicial do servidor AWS Lightsail
# Sistema de Advocacia
#
# Execute UMA VEZ após criar a instância.
# Usuário: ubuntu
# Comando: bash 1_setup_servidor.sh
# ============================================================

set -e  # Para tudo se qualquer comando falhar

echo ""
echo "======================================================"
echo " SETUP SERVIDOR — Sistema de Advocacia"
echo "======================================================"
echo ""

# --------------------------------------------------------------
# 1. Atualiza o sistema
# --------------------------------------------------------------
echo "[1/8] Atualizando pacotes do sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y

# --------------------------------------------------------------
# 2. Cria arquivo de SWAP (2GB) — essencial para 1GB RAM
#    Evita que MySQL ou Node.js sejam mortos por falta de memória
# --------------------------------------------------------------
echo "[2/8] Criando swap de 2GB..."
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  # Persiste após reboot
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap criada com sucesso."
else
  echo "Swap já existe, pulando."
fi

# --------------------------------------------------------------
# 3. Instala Node.js 20 LTS
# --------------------------------------------------------------
echo "[3/8] Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
echo "Node.js $(node -v) instalado."
echo "npm $(npm -v) instalado."

# --------------------------------------------------------------
# 4. Instala PM2 (gerenciador de processos Node.js)
# --------------------------------------------------------------
echo "[4/8] Instalando PM2..."
sudo npm install -g pm2
pm2 --version
# PM2 inicia automaticamente no boot
sudo pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || \
  pm2 startup systemd -u ubuntu --hp /home/ubuntu

# --------------------------------------------------------------
# 5. Instala MySQL 8.0
# --------------------------------------------------------------
echo "[5/8] Instalando MySQL 8.0..."
sudo apt-get install -y mysql-server

# Configura MySQL para consumir menos memória (importante no 1GB RAM)
sudo tee /etc/mysql/mysql.conf.d/advocacia.cnf > /dev/null <<'MYSQLCONF'
[mysqld]
# Reduz uso de memória para instâncias com pouca RAM
innodb_buffer_pool_size     = 128M
innodb_log_buffer_size      = 8M
max_connections             = 50
thread_cache_size           = 4
query_cache_type            = 0
performance_schema          = OFF
MYSQLCONF

sudo systemctl restart mysql
sudo systemctl enable mysql
echo "MySQL instalado e configurado."

# --------------------------------------------------------------
# 6. Instala Nginx (servidor web / proxy reverso)
# --------------------------------------------------------------
echo "[6/8] Instalando Nginx..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
echo "Nginx instalado."

# --------------------------------------------------------------
# 7. Instala Certbot (certificado SSL gratuito Let's Encrypt)
# --------------------------------------------------------------
echo "[7/8] Instalando Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx
echo "Certbot instalado."

# --------------------------------------------------------------
# 8. Instala Git e utilitários
# --------------------------------------------------------------
echo "[8/8] Instalando Git e utilitários..."
sudo apt-get install -y git curl unzip
echo "Git $(git --version) instalado."

# --------------------------------------------------------------
# Cria pasta de destino da aplicação
# --------------------------------------------------------------
sudo mkdir -p /var/www/advocacia
sudo chown ubuntu:ubuntu /var/www/advocacia

echo ""
echo "======================================================"
echo " SETUP CONCLUÍDO!"
echo "======================================================"
echo ""
echo " Próximo passo: execute o script 2_deploy_app.sh"
echo ""
