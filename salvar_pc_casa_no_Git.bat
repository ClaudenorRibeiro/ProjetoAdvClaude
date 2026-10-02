@echo off
rem IMPORTANTE - NAO APAGAR. ENVIA esta pasta para o main (PRODUCAO) no GitHub. Uso exclusivo do usuario, no PC de CASA.
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

:: Verifica se tem alteracoes para salvar: arquivo mudado nesta pasta OU a HEAD
:: local ja diferente da main que esta hoje no GitHub. Esse segundo caso acontece,
:: por exemplo, depois de puxar o rascunho por cima desta pasta com o script
:: "salvar_RASCUNHO_do_GIT_no_pc.bat": a pasta fica com o rascunho e sem nada
:: "pendente" pra commitar, mas a main no GitHub ainda esta na versao antiga - e
:: mesmo assim precisa enviar. O "fetch" abaixo e so LEITURA (busca so a
:: informacao pra comparar); nao altera nada nesta pasta, entao continua valendo
:: a regra de este script nunca dar pull.
git add -A
set HOUVE_ALTERACAO_ARQUIVO=1
git diff --cached --quiet
if %errorlevel%==0 set HOUVE_ALTERACAO_ARQUIVO=0

git fetch origin main >nul 2>&1
for /f "delims=" %%h in ('git rev-parse HEAD') do set HASH_LOCAL=%%h
set HASH_MAIN_GITHUB=
for /f "delims=" %%h in ('git rev-parse origin/main 2^>nul') do set HASH_MAIN_GITHUB=%%h

if %HOUVE_ALTERACAO_ARQUIVO%==0 if "%HASH_LOCAL%"=="%HASH_MAIN_GITHUB%" (
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

:: Pede descricao do que foi feito (so e usada se realmente houver commit novo)
echo.
set /p DESCRICAO="Descreva o que foi feito: "
if "%DESCRICAO%"=="" set DESCRICAO=atualizacao

:: So cria um commit novo se a pasta realmente tiver arquivo alterado. Se a pasta
:: ja estava limpa (ex.: acabou de puxar e testar o rascunho, sem mexer em nada),
:: nao ha nada pra commitar - so envia pra main o que ja esta commitado aqui
:: (o proprio rascunho testado).
if %HOUVE_ALTERACAO_ARQUIVO%==1 git commit -m "%PREFIXO% - %DESCRICAO%"

:: Push FORCADO para o GitHub.
:: --force faz a SUA PASTA LOCAL SEMPRE PREVALECER: sobrescreve o GitHub com o que
:: esta aqui, mesmo que o outro computador tenha enviado algo diferente. O fetch
:: feito acima foi so de LEITURA (pra comparar) - continua a regra de este script
:: nunca aplicar nada vindo do GitHub sozinho.
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
