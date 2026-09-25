@echo off
:: ============================================================
:: Salvar e enviar para o GitHub - Sistema de Advocacia
:: Duplo clique para rodar
:: ============================================================

cd /d "%~dp0"

:: Verifica se sobrou uma trava antiga do Git (index.lock) de uma execucao
:: anterior que foi interrompida no meio do caminho. So remove se NAO houver
:: nenhum processo git.exe rodando de verdade agora (senao, so avisa e para).
if exist ".git\index.lock" (
    tasklist /FI "IMAGENAME eq git.exe" 2>nul | find /I "git.exe" >nul
    if errorlevel 1 (
        del /f /q ".git\index.lock" >nul 2>&1
        echo.
        echo Aviso: uma trava antiga do Git foi encontrada e removida
        echo automaticamente ^(nao havia nenhum processo do Git em andamento^).
    ) else (
        echo.
        echo ============================================================
        echo  Existe um processo do Git rodando agora nesta pasta.
        echo  Aguarde ele terminar e rode o script novamente.
        echo ============================================================
        echo.
        pause
        exit /b
    )
)

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

:: Commit e push FORCADO para o GitHub.
:: --force faz a SUA PASTA LOCAL SEMPRE PREVALECER: sobrescreve o GitHub com o que
:: esta aqui, mesmo que o outro computador tenha enviado algo diferente. Combina com
:: a regra de estes scripts NUNCA baixarem nada do Git (sem pull/fetch).
git commit -m "%PREFIXO% - %DESCRICAO%"
git push --force origin main
set PUSH_OK=%errorlevel%

:: Marca esta versao com uma etiqueta (tag), para poder voltar a ela se precisar.
:: Depois, mantem so as 10 etiquetas mais recentes, apagando as mais antigas
:: (local e no GitHub) - assim voce sempre tem as ultimas 10 versoes salvas.
if %PUSH_OK%==0 (
    git tag "v-%PREFIXO%"
    git push origin "v-%PREFIXO%" >nul 2>&1

    for /f "skip=10" %%t in ('git tag --list "v-*" --sort=-creatordate') do (
        git tag -d %%t >nul 2>&1
        git push origin :refs/tags/%%t >nul 2>&1
    )
)

if %PUSH_OK%==0 (
    echo.
    echo ============================================================
    echo  Salvo e enviado para o GitHub com sucesso!
    echo  Commit: %PREFIXO% -- %DESCRICAO%
    echo  Versao marcada: v-%PREFIXO% ^(guardada entre as 10 mais recentes^)
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
