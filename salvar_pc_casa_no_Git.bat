@echo off
:: ============================================================
:: Salvar e enviar para o GitHub - Sistema de Advocacia
:: Duplo clique para rodar
:: ============================================================

cd /d "%~dp0"

:: Garante que a pasta de memorias NUNCA va para o GitHub.
:: "git rm --cached" tira a pasta do controle do git, mas MANTEM os arquivos no seu PC.
:: --ignore-unmatch evita erro quando a pasta ja esta fora do git. Roda sempre, sem risco.
git rm -r --cached --ignore-unmatch memory >nul 2>&1

:: Verifica se tem alterações para salvar
git add -A
git diff --cached --quiet
if %errorlevel%==0 (
    echo.
    echo Nenhuma alteracao encontrada. Nada foi salvo.
    echo.
    pause
    exit /b
)

:: Gera prefixo de data/hora automatico (formato DDMMYY-HHMM)
for /f "tokens=1-3 delims=/" %%a in ("%date%") do (
    set DIA=%%a
    set MES=%%b
    set ANO=%%c
)
for /f "tokens=1-2 delims=:" %%a in ("%time: =0%") do (
    set HORA=%%a
    set MIN=%%b
)
set PREFIXO=%DIA%%MES%%ANO:~2,2%-%HORA%%MIN%

:: Pede descricao do que foi feito
echo.
set /p DESCRICAO="Descreva o que foi feito: "
if "%DESCRICAO%"=="" set DESCRICAO=atualizacao

:: Commit e push para o GitHub
git commit -m "%PREFIXO% - %DESCRICAO%"
git push origin main

if %errorlevel%==0 (
    echo.
    echo ============================================================
    echo  Salvo e enviado para o GitHub com sucesso!
    echo  Commit: %PREFIXO% -- %DESCRICAO%
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo  ERRO ao enviar para o GitHub.
    echo  Verifique sua conexao e tente novamente.
    echo ============================================================
)

echo.
pause
