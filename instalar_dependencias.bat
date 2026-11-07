@echo off
rem IMPORTANTE - NAO APAGAR. PC NOVO: instala o que o ProjetoAdvClaude precisa neste Windows
rem (Node LTS, Git, HeidiSQL se faltarem, e as bibliotecas npm do backend e do frontend).
rem NAO instala o MySQL nem importa o banco (isso continua no HeidiSQL, com a senha que VOCE escolheu).
rem NAO sobe o sistema (use iniciar_pc_casa.bat ou iniciar_pc_escrit.bat depois).
rem Rode na pasta do projeto, pelo cmd.exe, ou de um duplo clique. Internet obrigatorio.
rem Quem instala programa (Node/Git/HeidiSQL) pode pedir para "Executar como administrador".
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo   Instalar dependencias - ProjetoAdvClaude
echo ============================================
echo.
echo Pasta do projeto: %CD%
echo.

if not exist "backend\package.json" goto pasta_errada
if not exist "frontend\package.json" goto pasta_errada

where winget >nul 2>&1
if errorlevel 1 (
  echo AVISO: o winget nao esta neste Windows.
  echo Sem ele, este script NAO consegue instalar Node, Git nem HeidiSQL sozinho.
  echo Instale o "Instalador de Aplicativos" na Microsoft Store, ou instale
  echo Node.js LTS, Git e HeidiSQL pelos sites oficiais, e rode este .bat de novo
  echo so para as bibliotecas npm.
  echo.
) else (
  call :garantir_app node "OpenJS.NodeJS.LTS" "Node.js LTS"
  call :garantir_app git "Git.Git" "Git"
  call :garantir_heidisql
  call :atualizar_path
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
  if exist "%LocalAppData%\Programs\Git\cmd\git.exe" set "PATH=%LocalAppData%\Programs\Git\cmd;%PATH%"
  if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERRO: o Node.js ainda nao esta neste PC.
  echo Instale o Node.js 24 LTS (ou a LTS atual) em https://nodejs.org
  echo Depois rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERRO: o npm nao foi encontrado (vem junto com o Node.js).
  echo Feche este Prompt, abra um cmd NOVO e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo Node:
node -v
echo npm:
call npm -v
echo.

if not exist "backend\.env" (
  copy /Y "backend\.env.example" "backend\.env" >nul
  echo Foi criado backend\.env a partir do exemplo.
  echo ABRA esse arquivo e coloque a senha do MySQL deste PC (DB_PASSWORD)
  echo e o nome do banco (DB_NAME). Sem isso o sistema nao liga.
  echo Se voce tem o .env do PC antigo, copie ELE por cima deste.
  echo.
)

echo [1/2] Bibliotecas do backend (npm install)...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 goto falha_npm
echo Backend: ok.
echo.

echo [2/2] Bibliotecas do frontend (npm install)...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 goto falha_npm
echo Frontend: ok.
echo.

cd /d "%~dp0"

echo ============================================
echo   Bibliotecas do projeto instaladas.
echo ============================================
echo.
echo AINDA FALTA (nao e este .bat):
echo  1. MySQL 8 neste PC (nao use MariaDB).
echo  2. No HeidiSQL: criar o banco e restaurar o backup do PC antigo
echo     (ou me avise se o banco for nascer vazio).
echo  3. Conferir backend\.env (senha do MySQL deste PC).
echo  4. Ligar com iniciar_pc_casa.bat ou iniciar_pc_escrit.bat.
echo     Esses atalhos usam um caminho FIXO de pasta. Se neste PC a pasta
echo     estiver em outro lugar, me avise para ajustar o atalho.
echo.
pause
exit /b 0

:pasta_errada
echo.
echo ERRO: rode este arquivo DENTRO da pasta do ProjetoAdvClaude
echo (a pasta que tem backend e frontend).
echo.
pause
exit /b 1

:falha_npm
cd /d "%~dp0"
echo.
echo ERRO no npm install. Confira a internet e rode este arquivo de novo.
echo.
pause
exit /b 1

:garantir_app
where %~1 >nul 2>&1
if not errorlevel 1 (
  echo Ja tem %~3 neste PC.
  goto :eof
)
echo.
echo Instalando %~3 ...
winget install -e --id %~2 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo Nao consegui instalar %~3 automaticamente. Instale pelo site oficial e continue.
)
goto :eof

:garantir_heidisql
if exist "%ProgramFiles%\HeidiSQL\heidisql.exe" (
  echo Ja tem HeidiSQL neste PC.
  goto :eof
)
if exist "%ProgramFiles(x86)%\HeidiSQL\heidisql.exe" (
  echo Ja tem HeidiSQL neste PC.
  goto :eof
)
echo.
echo Instalando HeidiSQL ...
winget install -e --id HeidiSQL.HeidiSQL --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo Nao consegui instalar HeidiSQL automaticamente. Instale pelo site heidisql.com e continue.
)
goto :eof

:atualizar_path
for /f "skip=2 tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%B"
for /f "skip=2 tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USRPATH=%%B"
if defined SYSPATH set "PATH=%SYSPATH%;%USRPATH%;%PATH%"
goto :eof
