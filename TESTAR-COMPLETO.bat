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

rem --- 2) o teste de navegador usa portas PROPRIAS (3201 e 4173): o sistema aberto (3001/3000) e o NovoJud SaaS NAO atrapalham.
rem     So atrapalha outra bateria deste sistema rodando ao mesmo tempo, ou algo que use essas portas.
netstat -ano | findstr /R /C:":3201 " /C:":4173 " | findstr "LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
  echo ATENCAO: as portas do teste de navegador ^(3201 ou 4173^) estao em uso agora.
  echo Provavelmente outra bateria deste sistema esta rodando.
  echo Espere ela terminar ^(ou feche a janela dela^) e depois aperte uma tecla aqui para continuar.
  echo.
  pause
  netstat -ano | findstr /R /C:":3201 " /C:":4173 " | findstr "LISTENING" >nul
  if %ERRORLEVEL% EQU 0 (
    echo.
    echo As portas 3201/4173 continuam em uso. Termine a outra bateria e rode este arquivo de novo.
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
