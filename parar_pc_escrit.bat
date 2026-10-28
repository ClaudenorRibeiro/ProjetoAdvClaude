@echo off
rem IMPORTANTE - NAO APAGAR. Desliga o sistema no PC do ESCRITORIO. Fecha SO as janelas deste sistema (nao fecha outros Prompts de Comando, nem o NovoJud SaaS ou uma bateria rodando).
title Parando Sistema de Advocacia

echo ============================================
echo   Parando Sistema de Advocacia...
echo ============================================
echo.

echo Encerrando processos nas portas 3000 e 3001...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /F /PID %%a 2>nul

echo.
echo ============================================
echo   Sistema encerrado! Fechando janelas...
echo ============================================
echo.

:: Fecha SO as janelas deste sistema (pelo titulo exato que o iniciar_pc_*.bat deu a elas). Antes fechava TODOS os Prompts de Comando,
:: o que derrubava junto o NovoJud SaaS e qualquer bateria de testes aberta ao mesmo tempo.
taskkill /F /T /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq Backend - Sistema Advocacia" 2>nul
taskkill /F /T /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq Frontend - Sistema Advocacia" 2>nul
taskkill /F /T /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq Sistema de Advocacia" 2>nul
timeout /t 3 /nobreak >nul
exit
