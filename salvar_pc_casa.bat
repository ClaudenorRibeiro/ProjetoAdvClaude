@echo off
:: ============================================================
:: Script de versionamento do Sistema de Advocacia
:: Execute este arquivo sempre que quiser salvar uma versao
:: Duplo clique no arquivo para rodar
:: ============================================================

cd /d "%~dp0"

:: Pede uma descricao do que foi feito
set /p mensagem="Descreva o que foi feito (ex: Cadastro de pessoas concluido): "

if "%mensagem%"=="" (
    set mensagem=Atualizacao sem descricao
)

:: Adiciona todos os arquivos novos e modificados
git add -A

:: Verifica se tem algo para commitar
git diff --cached --quiet
if %errorlevel%==0 (
    echo.
    echo Nenhuma alteracao encontrada. Nada foi salvo.
    echo.
    pause
    exit /b
)

:: Faz o commit com a mensagem informada
git commit -m "%mensagem%"

echo.
echo ============================================================
echo Versao salva com sucesso!
echo Mensagem: %mensagem%
echo ============================================================
echo.

:: Pergunta se quer enviar para o GitHub tambem
set /p enviar="Deseja enviar para o GitHub agora? (s/n): "
if /i "%enviar%"=="s" (
    git push
    echo.
    echo Enviado para o GitHub com sucesso!
    echo.
)

pause
