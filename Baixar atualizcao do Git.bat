@echo off
echo ============================================
echo   Atualizando projeto do GitHub...
echo ============================================
echo.

cd /d "C:\Users\Claudio\Downloads\ProjetoAdvClaude"

echo [1/3] Baixando atualizacoes do GitHub...
git pull origin main
echo.

echo [2/3] Atualizando arquivos de memoria do Claude...
xcopy /E /I /Y "C:\Users\Claudio\Downloads\ProjetoAdvClaude\memory" "%USERPROFILE%\.claude\projects\C--Users-Claudio-Downloads-ProjetoAdvClaude\memory"
echo.

echo [3/3] Concluido!
echo ============================================
echo   Projeto atualizado com sucesso!
echo ============================================
echo.
pause
