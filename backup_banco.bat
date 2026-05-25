@echo off
:: ============================================================
:: BACKUP DO BANCO DE DADOS — sistema_advocacia
:: Le as credenciais do backend\.env automaticamente
:: Salva o arquivo em backups\backup_YYYY-MM-DD_HH-MM.sql
:: ============================================================

:: Garante que o script roda sempre a partir da pasta do projeto
cd /d "%~dp0"

:: Verifica se o arquivo .env existe
if not exist "backend\.env" (
    echo ERRO: Arquivo backend\.env nao encontrado.
    pause
    exit /b 1
)

:: Le as credenciais do .env — sem senha hardcoded no .bat
for /f "usebackq tokens=1,* delims==" %%a in ("backend\.env") do (
    if "%%a"=="DB_HOST"     set DB_HOST=%%b
    if "%%a"=="DB_PORT"     set DB_PORT=%%b
    if "%%a"=="DB_USER"     set DB_USER=%%b
    if "%%a"=="DB_PASSWORD" set DB_PASSWORD=%%b
    if "%%a"=="DB_NAME"     set DB_NAME=%%b
)

:: Gera o timestamp no formato YYYY-MM-DD_HH-MM (via PowerShell)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd_HH-mm'"') do set TIMESTAMP=%%i

set ARQUIVO=backups\backup_%TIMESTAMP%.sql

echo.
echo ================================================
echo   BACKUP - SISTEMA ADVOCACIA
echo ================================================
echo   Banco   : %DB_NAME%
echo   Arquivo : %ARQUIVO%
echo ================================================
echo.
echo Gerando backup, aguarde...

:: Executa o dump completo (estrutura + dados + triggers + rotinas)
mysqldump -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASSWORD% ^
    --single-transaction ^
    --routines ^
    --triggers ^
    %DB_NAME% > "%ARQUIVO%" 2>nul

if %ERRORLEVEL% == 0 (
    echo.
    echo   Backup concluido com sucesso!
    for %%F in ("%ARQUIVO%") do echo   Tamanho : %%~zF bytes
    echo.
) else (
    echo.
    echo   ERRO ao gerar o backup.
    echo   Verifique se o MySQL esta rodando.
    echo.
    if exist "%ARQUIVO%" del "%ARQUIVO%"
)

pause
