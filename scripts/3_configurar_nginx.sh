#!/bin/bash
# ============================================================
# SCRIPT 3 — Configura Nginx como proxy reverso
# Sistema de Advocacia
#
# Execute após o script 2_deploy_app.sh.
# Comando: bash 3_configurar_nginx.sh
#
# ANTES de rodar: edite o DOMINIO abaixo.
# ============================================================

set -e

# ============================================================
# ⚙️  CONFIGURE AQUI ANTES DE RODAR
# ============================================================
DOMINIO="SEU_DOMINIO_AQUI"      # ← ex: advocaciaantonio.com.br
APP_DIR="/var/www/advocacia"
# ============================================================

if [ "$DOMINIO" = "SEU_DOMINIO_AQUI" ]; then
  echo "ERRO: Edite a variável DOMINIO no início do script."
  exit 1
fi

echo ""
echo "======================================================"
echo " CONFIGURAR NGINX — $DOMINIO"
echo "======================================================"
echo ""

# Cria o arquivo de configuração do Nginx
sudo tee /etc/nginx/sites-available/advocacia > /dev/null <<NGINXCONF
# ============================================================
# Nginx — Sistema de Advocacia
# Domínio: ${DOMINIO}
# ============================================================

server {
    listen 80;
    server_name ${DOMINIO} www.${DOMINIO};

    # Redireciona HTTP → HTTPS (será ativado pelo Certbot)
    # Por ora, serve direto em HTTP para validação do certificado

    # Frontend — arquivos estáticos do React
    root ${APP_DIR}/frontend/dist;
    index index.html;

    # Roteamento do React (SPA — todas as rotas caem no index.html)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API — proxy para o backend Node.js
    location /api {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 30s;
    }

    # Segurança: esconde versão do Nginx
    server_tokens off;
}
NGINXCONF

# Ativa o site (cria symlink)
sudo ln -sf /etc/nginx/sites-available/advocacia \
            /etc/nginx/sites-enabled/advocacia

# Remove o site padrão se existir
sudo rm -f /etc/nginx/sites-enabled/default

# Testa a configuração
echo "Testando configuração do Nginx..."
sudo nginx -t

# Recarrega o Nginx
sudo systemctl reload nginx

echo ""
echo "======================================================"
echo " NGINX CONFIGURADO!"
echo "======================================================"
echo ""
echo " Site disponível em: http://${DOMINIO}"
echo " (aguarde o DNS propagar antes de testar)"
echo ""
echo " Próximo passo: execute o script 4_ssl_https.sh"
echo " (somente após o DNS estar apontando para este servidor)"
echo ""
