@echo off
title Exportando Banco de Dados

echo ============================================
echo   Exportando banco de dados MySQL...
echo ============================================
echo.

set ARQUIVO=backup_sistema_advocacia_%date:~6,4%%date:~3,2%%date:~0,2%.sql

"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -pHR5k6nb8*** sistema_advocacia > "%~dp0%ARQUIVO%" 2>nul

if %errorlevel%==0 (
  echo ✅ Banco exportado com sucesso!
  echo.
  echo Arquivo salvo: %ARQUIVO%
  echo.
  echo Copie esse arquivo .sql junto com a pasta do projeto.
) else (
  echo ❌ Erro ao exportar. Verifique se o MySQL está rodando.
)

echo.
pause
