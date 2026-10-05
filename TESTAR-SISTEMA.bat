@echo off
rem IMPORTANTE - NAO APAGAR. Roda a bateria de testes: rapida (sem argumento) ou "completo" / "profundo" como argumento.
rem Ao terminar, a janela NAO fecha sozinha nem com tecla: so no X. O resultado tambem fica em quality\test-results\ultima-bateria.txt
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
echo O resultado completo tambem foi salvo em: quality\test-results\ultima-bateria.txt
echo.
echo ESTA JANELA FICA ABERTA. Para fechar, clique no X da janela. ^(Nenhuma tecla fecha esta janela.^)
echo.
cmd /k
exit /b %CODIGO%
