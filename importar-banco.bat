@echo off
title Importando Banco de Dados

echo ============================================
echo   Importando banco de dados MySQL...
echo ============================================
echo.

echo Procurando arquivo de backup...
set ARQUIVO=
for %%f in ("%~dp0backup_sistema_advocacia_*.sql") do set ARQUIVO=%%f

if "%ARQUIVO%"=="" (
  echo ❌ Nenhum arquivo backup_sistema_advocacia_*.sql encontrado!
  echo    Certifique-se que o arquivo .sql está na mesma pasta.
  pause
  exit /b
)

echo Arquivo encontrado: %ARQUIVO%
echo.
echo Importando para o MySQL...

"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -pHR5k6nb8*** < "%ARQUIVO%" 2>nul

if %errorlevel%==0 (
  echo.
  echo ✅ Banco importado com sucesso!
  echo    Agora pode usar o iniciar.bat para subir o sistema.
) else (
  echo.
  echo ❌ Erro ao importar. Verifique se o MySQL está instalado e rodando.
)

echo.
pause
