@echo off
:: ============================================================
:: Atualizar este PC com o RASCUNHO do GitHub
:: Baixa (puxa) para esta pasta tudo que estiver na branch
:: "rascunho" no GitHub - por exemplo, correcoes que o Claude
:: enviou por la. Este script NUNCA envia nada para o GitHub,
:: so recebe/atualiza sua pasta local.
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

:: So atualiza se a pasta estiver "limpa". Se voce tiver alguma alteracao
:: sua ainda nao salva, o script para aqui - assim nada seu se perde ou
:: se mistura sem querer com o que vem do GitHub.
git diff --quiet
set TEM_ALTERACAO_1=%errorlevel%
git diff --cached --quiet
set TEM_ALTERACAO_2=%errorlevel%
if not %TEM_ALTERACAO_1%==0 goto :tem_alteracao
if not %TEM_ALTERACAO_2%==0 goto :tem_alteracao
goto :pode_atualizar

:tem_alteracao
echo.
echo ============================================================
echo  Voce tem alteracoes nesta pasta que ainda NAO foram salvas.
echo  Para nao perder nada, primeiro rode o script de salvar
echo  RASCUNHO ^(ou o script normal, se quiser oficializar^), e
echo  so depois rode este aqui de novo.
echo ============================================================
echo.
pause
exit /b

:pode_atualizar
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

git merge --no-edit origin/%BRANCH_RASCUNHO%
set MERGE_OK=%errorlevel%

if not %MERGE_OK%==0 (
    echo.
    echo ============================================================
    echo  Deu conflito ao atualizar. Nada foi perdido, mas a pasta
    echo  ficou parada no meio da atualizacao. Peca ajuda ao Claude
    echo  para resolver isso antes de tentar de novo.
    echo ============================================================
    git merge --abort >nul 2>&1
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
