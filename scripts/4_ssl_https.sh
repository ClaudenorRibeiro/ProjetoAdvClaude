#!/bin/bash
# ============================================================
# SCRIPT 4 — Instala certificado SSL (HTTPS gratuito)
# Sistema de Advocacia
#
# Execute SOMENTE após o DNS do domínio estar apontando
# para o IP desta instância Lightsail. Aguarde pelo menos
# 15-30 minutos após configurar o DNS antes de rodar.
#
# Comando: bash 4_ssl_https.sh
# ============================================================

set -e

# ============================================================
# ⚙️  CONFIGURE AQUI ANTES DE RODAR
# ============================================================
DOMINIO="SEU_DOMINIO_AQUI"          # ← ex: advocaciaantonio.com.br
EMAIL_ADMIN="SEU_EMAIL_AQUI"        # ← ex: claudio@email.com (para avisos de renovação)
# ============================================================

if [ "$DOMINIO" = "SEU_DOMINIO_AQUI" ] || [ "$EMAIL_ADMIN" = "SEU_EMAIL_AQUI" ]; then
  echo "ERRO: Edite DOMINIO e EMAIL_ADMIN no início do script."
  exit 1
fi

echo ""
echo "======================================================"
echo " SSL / HTTPS — $DOMINIO"
echo "======================================================"
echo ""
echo "Verificando se o DNS já está propagado..."

# Verifica se o domínio resolve para este servidor
SERVIDOR_IP=$(curl -s ifconfig.me)
DOMINIO_IP=$(dig +short "$DOMINIO" | tail -1)

echo "IP do servidor: $SERVIDOR_IP"
echo "IP do domínio:  $DOMINIO_IP"

if [ "$SERVIDOR_IP" != "$DOMINIO_IP" ]; then
  echo ""
  echo "⚠️  ATENÇÃO: O domínio ainda não aponta para este servidor!"
  echo "   Configure o DNS e aguarde a propagação (15-60 min)."
  echo "   Depois rode este script novamente."
  read -p "Quer tentar mesmo assim? (s/N): " FORCAR
  if [ "$FORCAR" != "s" ] && [ "$FORCAR" != "S" ]; then
    echo "Cancelado."
    exit 1
  fi
fi

echo ""
echo "Obtendo certificado SSL para $DOMINIO e www.$DOMINIO..."
sudo certbot --nginx \
  -d "$DOMINIO" \
  -d "www.$DOMINIO" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL_ADMIN" \
  --redirect   # ← ativa redirecionamento HTTP → HTTPS automaticamente

echo ""
echo "Testando renovação automática do certificado..."
sudo certbot renew --dry-run

echo ""
echo "======================================================"
echo " SSL CONFIGURADO COM SUCESSO!"
echo "======================================================"
echo ""
echo " Site disponível em: https://${DOMINIO}"
echo " Certificado válido por 90 dias — renovação automática."
echo ""
echo " ✅ Deploy completo! O sistema está no ar."
echo ""
