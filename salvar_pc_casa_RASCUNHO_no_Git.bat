@echo off
:: ============================================================
:: Salvar RASCUNHO no Git (branch de desenvolvimento)
:: Use isto quando NAO quiser mandar suas alteracoes para a
:: versao oficial (main) ainda. Fica guardado numa branch
:: separada, so para revisao/teste com o Claude.
:: A versao oficial (main) SO muda quando voce roda o script
:: normal: salvar_pc_casa_no_Git.bat
:: Duplo clique para rodar
:: ============================================================

set BRANCH_RASCUNHO=rascunho

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
git rm -r --cached --ignore-unmatch memory >nul 2>&1

:: Verifica se tem alteracoes para salvar
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
set /p DESCRICAO="Descreva o que foi feito (rascunho): "
if "%DESCRICAO%"=="" set DESCRICAO=atualizacao

:: Comita as alteracoes na sua branch local de sempre (main).
:: Isso NAO envia nada para a main oficial no GitHub - so fica
:: gravado no seu computador, como sempre aconteceu antes.
git commit -m "%PREFIXO% - %DESCRICAO% (rascunho)"

:: Descobre em qual branch local voce esta (normalmente "main"),
:: para voltar pra ela no final, sem deixar nada diferente.
for /f "tokens=* delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH_ATUAL=%%b

:: Usa uma branch temporaria so para levar seu commit ate a
:: branch de rascunho do GitHub, juntando com o que ja estiver
:: la (por exemplo, alteracoes feitas pelo Claude), sem misturar
:: isso com o historico da sua main local.
git branch -f rascunho_tmp HEAD
git checkout -q rascunho_tmp
git fetch -q origin %BRANCH_RASCUNHO%
git merge --no-edit origin/%BRANCH_RASCUNHO%
set MERGE_OK=%errorlevel%

if not %MERGE_OK%==0 (
    echo.
    echo ============================================================
    echo  Deu conflito ao juntar com o que ja estava no rascunho do
    echo  GitHub. NADA foi enviado. Peca ajuda ao Claude para
    echo  resolver isso antes de tentar de novo.
    echo ============================================================
    git merge --abort >nul 2>&1
    git checkout -q %BRANCH_ATUAL%
    git branch -D rascunho_tmp >nul 2>&1
    echo.
    pause
    exit /b
)

git push origin rascunho_tmp:%BRANCH_RASCUNHO%
set PUSH_OK=%errorlevel%

git checkout -q %BRANCH_ATUAL%
git branch -D rascunho_tmp >nul 2>&1

if %PUSH_OK%==0 (
    echo.
    echo ============================================================
    echo  Rascunho salvo na branch de desenvolvimento com sucesso!
    echo  A versao oficial (main) NAO foi alterada.
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo  ERRO ao enviar o rascunho. Verifique sua conexao e tente
    echo  novamente.
    echo ============================================================
)

echo.
pause
