@echo off
setlocal
cd /d "%~dp0"

if /I "%1"=="completo" (
  node quality\run.mjs --completo
) else if /I "%1"=="profundo" (
  node quality\run.mjs --profundo
) else (
  node quality\run.mjs --rapido
)

set CODIGO=%ERRORLEVEL%
echo.
if %CODIGO% EQU 0 (
  echo Bateria concluida sem falhas.
) else (
  echo A bateria encontrou uma falha. Nao publique antes de analisar o resumo acima.
)
echo.
pause
exit /b %CODIGO%
