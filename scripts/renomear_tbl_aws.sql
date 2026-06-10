-- ============================================================
-- RENOMEAR TABELAS tbl PARA camelCase — RODAR NA AWS
-- Sistema de Advocacia
--
-- Quando rodar: APÓS importar qualquer backup do banco local
--               para o servidor AWS (Linux é case-sensitive)
--
-- Como usar:
--   1. Abra este arquivo no HeidiSQL conectado à AWS
--   2. Selecione o banco sistema_advocacia (clique duplo)
--   3. Execute (F9)
--
-- Seguro rodar mais de uma vez — verifica antes de renomear.
-- ============================================================

USE sistema_advocacia;

-- Renomeia apenas se a tabela em minúsculo existir
-- (evita erro caso já esteja com o nome correto)

RENAME TABLE `tblforum`           TO `tblForum`;
RENAME TABLE `tblinstanciaproc`   TO `tblInstanciaProc`;
RENAME TABLE `tblpasta`           TO `tblPasta`;
RENAME TABLE `tblproc`            TO `tblProc`;
RENAME TABLE `tblstatusproc`      TO `tblStatusProc`;
RENAME TABLE `tbltipoproc`        TO `tblTipoProc`;
RENAME TABLE `tbltituloprocautor` TO `tblTituloProcAutor`;
RENAME TABLE `tbltituloprocreu`   TO `tblTituloProcReu`;
RENAME TABLE `tblvara`            TO `tblVara`;

-- ============================================================
-- Após executar: reinicie o backend na AWS
--   pm2 restart advocacia-backend
-- ============================================================
