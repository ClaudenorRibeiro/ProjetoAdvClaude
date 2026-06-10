@echo off
:: ============================================================
:: GERAR DADOS INICIAIS — Sistema de Advocacia
:: Exporta apenas as tabelas de referência (fixas em qualquer
:: instalação) para o arquivo scripts/dados_iniciais.sql
::
:: Como usar: duplo clique neste arquivo
:: Requisito: MySQL instalado localmente (mysqldump disponível)
:: ============================================================

echo.
echo =====================================================
echo  Gerando dados_iniciais.sql...
echo =====================================================
echo.

:: Caminho do mysqldump — ajuste se necessário
set MYSQLDUMP="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"

:: Configurações do banco local
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_NAME=sistema_advocacia
set DB_USER=root

:: Arquivo de saída (pasta scripts/ dentro do projeto)
set OUTPUT=%~dp0scripts\dados_iniciais.sql

:: Tabelas que sempre levam dados no deploy
set TABELAS=calendario estado_civil genero profissao tblforum tblvara tblinstanciaproc tblstatusproc tbltipoproc tipo_audiencia tipo_pericia tipo_prazo prazo_subtipo configuracoes_integracoes modelo_documento

echo Banco: %DB_NAME%
echo Saida: %OUTPUT%
echo.
echo Digite a senha do MySQL (usuario: %DB_USER%):

%MYSQLDUMP% -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p ^
  --no-tablespaces ^
  --no-create-info ^
  --insert-ignore ^
  --skip-triggers ^
  --single-transaction ^
  %DB_NAME% %TABELAS% > "%OUTPUT%"

if %ERRORLEVEL% == 0 (
  echo.
  echo =====================================================
  echo  SUCESSO! Arquivo gerado em:
  echo  %OUTPUT%
  echo =====================================================
) else (
  echo.
  echo =====================================================
  echo  ERRO ao gerar o arquivo. Verifique:
  echo  - Senha do MySQL digitada corretamente
  echo  - MySQL Server esta rodando
  echo  - Caminho do mysqldump esta correto
  echo    Atual: %MYSQLDUMP%
  echo =====================================================
)

echo.
pause
