@echo off
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
echo   Sistema encerrado com sucesso!
echo ============================================
echo.
pause
