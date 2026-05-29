@echo off
title Sistema de Advocacia

echo ============================================
echo   Iniciando Sistema de Advocacia...
echo ============================================
echo.

echo [1/2] Iniciando Backend (porta 3001)...
start "Backend - Sistema Advocacia" cmd /k "cd /d C:\Users\Claudio\Downloads\ProjetoAdvClaude\backend && npm run dev"

timeout /t 3 /nobreak > nul

echo [2/2] Iniciando Frontend (porta 3000)...
start "Frontend - Sistema Advocacia" cmd /k "cd /d C:\Users\Claudio\Downloads\ProjetoAdvClaude\frontend && npm start"

echo.
echo ============================================
echo   Aguarde o navegador abrir sozinho...
echo   (pode demorar uns 30 segundos)
echo ============================================
echo.
pause
