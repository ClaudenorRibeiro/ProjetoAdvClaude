@echo off
title Sistema de Advocacia

echo ============================================
echo   Iniciando Sistema de Advocacia...
echo ============================================
echo.

echo [1/2] Iniciando Backend (porta 3001)...
start "Backend - Sistema Advocacia" cmd /k "cd /d C:\Users\Claudio\Downloads\ProjetoAdvClaude\backend && npm run dev"

echo Aguardando o backend e o banco de dados ficarem prontos...
set tentativas=0

:aguardar_api
set /a tentativas+=1
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/api/public/info' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {} exit 1" >nul 2>&1
if not errorlevel 1 goto iniciar_frontend
if %tentativas% GEQ 60 goto falha_backend
timeout /t 1 /nobreak >nul
goto aguardar_api

:iniciar_frontend
echo [2/2] Iniciando Frontend (porta 3000)...
start "Frontend - Sistema Advocacia" cmd /k "cd /d C:\Users\Claudio\Downloads\ProjetoAdvClaude\frontend && npm start"

echo.
echo ============================================
echo   Aguarde o navegador abrir sozinho...
echo   (pode demorar uns 30 segundos)
echo ============================================
echo.
pause
exit /b 0

:falha_backend
echo.
echo ============================================
echo   O backend nao respondeu em 60 segundos.
echo   Confira a janela "Backend - Sistema Advocacia".
echo ============================================
echo.
pause
exit /b 1
