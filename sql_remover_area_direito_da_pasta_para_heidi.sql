-- IMPORTANTE — NÃO APAGAR. Remove a coluna antiga "area_direito" da tabela tblpasta (decisão do usuário, 04/10/2026: a área é do PROCESSO, pelo campo "Tipo"; a pasta só organiza).
-- Nenhuma tela do sistema gravava nessa coluna. O sistema novo (a versão que vem junto com este script) também não lê mais.
-- ORDEM OBRIGATÓRIA em cada instância (local, AWS-Antônio, AWS-Erick): 1º) atualizar o sistema com a versão nova e reiniciar; 2º) rodar este script.
-- Rodar ANTES de atualizar o sistema faz a versão antiga quebrar (ela ainda lê essa coluna).
-- Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, executando TUDO (F9).
-- ATENÇÃO: apagar coluna não tem volta. Antes, faça um backup (Exportar banco como SQL). No Antônio há ~6.000 pastas antigas com texto nessa coluna (o "Tipo" do processo já guarda a mesma informação).
-- Seguro para rodar mais de uma vez: se a coluna já não existe, não faz nada. Não altera nenhum outro dado.
-- Depois de rodar: o resultado deve mostrar 0 (coluna não existe mais).
-- ============================================================================================================
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblpasta' AND COLUMN_NAME = 'area_direito');
SET @cmd := IF(@existe > 0, 'ALTER TABLE `tblpasta` DROP COLUMN `area_direito`', 'DO 0');
PREPARE stmt FROM @cmd;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS coluna_area_direito_ainda_existe
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tblpasta' AND COLUMN_NAME = 'area_direito';
