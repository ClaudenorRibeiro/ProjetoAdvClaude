@echo off
title Instalando Dependencias - Sistema de Advocacia

echo ============================================
echo   Instalando dependencias do sistema...
echo ============================================
echo.

echo [1/2] Instalando dependencias do Backend...
cd /d "%~dp0backend"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERRO ao instalar dependencias do backend!
    pause
    exit /b
)
echo Backend OK!
echo.

echo [2/2] Instalando dependencias do Frontend...
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERRO ao instalar dependencias do frontend!
    pause
    exit /b
)
echo Frontend OK!
echo.

echo ============================================
echo   Dependencias instaladas com sucesso!
echo   Agora use o iniciar.bat para rodar.
echo ============================================
echo.
pause
