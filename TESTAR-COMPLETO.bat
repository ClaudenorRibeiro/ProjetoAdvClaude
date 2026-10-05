@echo off
rem IMPORTANTE - NAO APAGAR. Roda a bateria COMPLETA de testes (de 10 a 60 min, conforme o PC): unidade, banco de teste e navegador. Nao publique antes de rodar.
rem Ao terminar, a janela NAO fecha sozinha nem com tecla: so no X. O resultado tambem fica em quality\test-results\ultima-bateria.txt
setlocal
cd /d "%~dp0"
title Teste COMPLETO do sistema

echo ============================================================
echo   TESTE COMPLETO DO SISTEMA (demora de 10 a 60 minutos, conforme o PC)
echo   Roda: testes rapidos + banco de teste + navegador
echo ============================================================
echo.

rem --- 1) arquivo de configuracao do banco de teste
if not exist "backend\.env.test" (
  if exist "backend\.env.test.example" (
    echo Criando backend\.env.test a partir do modelo...
    copy "backend\.env.test.example" "backend\.env.test" >nul
  ) else (
    echo ERRO: nao achei backend\.env.test.example. Baixe o rascunho de novo.
    goto :fim
  )
)

rem --- 2) servidor de desenvolvimento aberto atrapalha o teste de navegador (porta 3001)
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
  echo ATENCAO: o sistema parece estar aberto agora ^(porta 3001 em uso^).
  echo O teste de navegador precisa dessa porta livre.
  echo.
  echo Feche a janela preta do servidor ^(a que mostra "Servidor rodando na porta 3001"^)
  echo e depois aperte uma tecla aqui para continuar.
  echo.
  pause
  netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul
  if %ERRORLEVEL% EQU 0 (
    echo.
    echo A porta 3001 continua em uso. Feche o servidor e rode este arquivo de novo.
    goto :fim
  )
)

rem --- 3) roda a bateria completa (ela mesma instala as dependencias e o navegador de teste se faltarem)
node quality\run.mjs --completo
set CODIGO=%ERRORLEVEL%

echo.
echo ============================================================
if %CODIGO% EQU 0 (
  echo   RESULTADO: TUDO PASSOU. Bateria concluida sem falhas.
) else (
  echo   RESULTADO: A BATERIA ENCONTROU FALHA. Nao publique antes de analisar.
  echo   Mande o "RESUMO DA BATERIA" acima para o Claude.
)
echo ============================================================

:fim
echo.
echo   O resultado completo tambem foi salvo em: quality\test-results\ultima-bateria.txt
echo.
echo   ESTA JANELA FICA ABERTA. Para fechar, clique no X da janela.
echo   ^(Nenhuma tecla fecha esta janela.^)
echo.
cmd /k
exit /b %CODIGO%
