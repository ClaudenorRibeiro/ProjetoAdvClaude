@echo off
:: ============================================================
:: ATUALIZAR SISTEMA — AWS Lightsail
:: Conecta ao servidor, puxa o ultimo codigo do Git e executa
:: o script de atualizacao (rebuild frontend + restart PM2
:: + dados de referencia).
::
:: Como usar: duplo clique
:: Requisito: OpenSSH instalado (ja incluso no Windows 10/11)
:: ============================================================

:: ── Configure aqui ─────────────────────────────────────────
set SSH_KEY=C:\Users\Claudio\.ssh\lightsail-adv.pem
set SERVER=98.86.50.188
set SSH_USER=ubuntu
set APP_DIR=/var/www/advocacia
:: ───────────────────────────────────────────────────────────

echo.
echo =====================================================
echo  ATUALIZANDO SISTEMA AWS
echo  Servidor: %SERVER%
echo  %date% %time%
echo =====================================================
echo.
echo Conectando ao servidor...
echo.

:: 1. Puxa o codigo mais recente do Git
:: 2. Executa o script remoto (que acabou de ser atualizado pelo git pull)
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %SSH_USER%@%SERVER% "cd %APP_DIR% && git pull origin main && bash scripts/atualizar_aws_remote.sh"

if %ERRORLEVEL% == 0 (
    echo.
    echo =====================================================
    echo  SUCESSO! Sistema atualizado em %SERVER%
    echo  Acesse: http://%SERVER%
    echo =====================================================
) else (
    echo.
    echo =====================================================
    echo  ERRO na atualizacao. Verifique as mensagens acima.
    echo =====================================================
)

echo.
pause
