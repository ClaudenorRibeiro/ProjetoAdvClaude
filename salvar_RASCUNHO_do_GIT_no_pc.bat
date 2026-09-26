@echo off
:: ============================================================
:: Atualizar este PC com o RASCUNHO do GitHub
:: Baixa (puxa) para esta pasta tudo que estiver na branch
:: "rascunho" no GitHub - por exemplo, correcoes que o Claude
:: enviou por la. Este script NUNCA envia nada para o GitHub,
:: so recebe/atualiza sua pasta local.
:: Sempre deixa a pasta IDENTICA ao que esta no rascunho: qualquer
:: arquivo do sistema que estiver diferente ou faltando localmente
:: e substituido/reposto automaticamente, sem avisar. Arquivos que
:: nao fazem parte do sistema (nao rastreados pelo Git) nunca sao
:: tocados.
:: Funciona em qualquer PC, desde que este arquivo esteja
:: dentro da pasta do sistema.
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

echo.
echo Buscando as atualizacoes do rascunho no GitHub...
git fetch origin %BRANCH_RASCUNHO%
if not %errorlevel%==0 (
    echo.
    echo ============================================================
    echo  ERRO ao buscar o rascunho no GitHub. Verifique sua conexao
    echo  e tente novamente.
    echo ============================================================
    echo.
    pause
    exit /b
)

git reset --hard origin/%BRANCH_RASCUNHO%
if not %errorlevel%==0 (
    echo.
    echo ============================================================
    echo  ERRO ao atualizar a pasta local. Peca ajuda ao Claude antes
    echo  de tentar de novo.
    echo ============================================================
    echo.
    pause
    exit /b
)

echo.
echo ============================================================
echo  Pasta atualizada com o que estava no rascunho do GitHub!
echo  Se o Claude tiver mexido em dependencias (arquivos
echo  package.json), rode "npm install" na pasta backend e na
echo  pasta frontend antes de testar.
echo ============================================================
echo.
pause
