-- ============================================================================
-- ETIQUETA DO ESCRITÓRIO -> STATUS DO PROCESSO  (vínculo opcional)
-- Banco: usar o banco já selecionado no HeidiSQL | MySQL 8 | rodar pelo HeidiSQL
-- ----------------------------------------------------------------------------
-- Acrescenta 1 coluna opcional ao catálogo das etiquetas do escritório:
--   etiquetas_escritorio_catalogo.status_id  ->  tblstatusproc.id
--
-- Só faz sentido para as linhas com modulo = 'processos'. Quando uma etiqueta
-- que tem status_id preenchido é APLICADA a um processo, o sistema passa o
-- status desse processo para o status vinculado (o back cuida disso).
--
-- SEGURANÇA:
--   - Reaplicável: cada passo confere no information_schema antes de executar.
--     Rodar de novo na mesma instância não altera nada e não gera erro.
--   - Nenhum dado existente é lido, apagado ou alterado (a coluna nasce NULL).
--   - ALTER TABLE faz COMMIT implícito no MySQL — por isso não há
--     BEGIN/ROLLBACK; cada passo é independente.
--   - ON DELETE SET NULL: se um status for excluído, o vínculo apenas some.
--   - Rodar 1x em cada instância (local -> testar -> as 2 AWS).
--
-- ROLLBACK (se precisar desfazer):
--   ALTER TABLE `etiquetas_escritorio_catalogo` DROP FOREIGN KEY `fk_etqesc_status`;
--   ALTER TABLE `etiquetas_escritorio_catalogo` DROP COLUMN `status_id`;
-- ============================================================================

SELECT CONCAT('Banco selecionado: ', DATABASE()) AS resultado;
SET @db := DATABASE();

-- ----------------------------------------------------------------------------
-- 1) Coluna status_id (só cria se ainda não existir)
-- ----------------------------------------------------------------------------
SET @col_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME   = 'etiquetas_escritorio_catalogo'
    AND COLUMN_NAME  = 'status_id'
);
SET @sql := IF(@col_existe = 0,
  'ALTER TABLE `etiquetas_escritorio_catalogo` ADD COLUMN `status_id` INT NULL DEFAULT NULL AFTER `significado`',
  'SELECT ''coluna status_id ja existe — nada a fazer'' AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 2) Chave estrangeira p/ tblstatusproc (só cria se ainda não existir)
--    ON DELETE SET NULL — excluir um status apenas desfaz o vínculo.
-- ----------------------------------------------------------------------------
SET @fk_existe := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA    = @db
    AND TABLE_NAME      = 'etiquetas_escritorio_catalogo'
    AND CONSTRAINT_NAME = 'fk_etqesc_status'
);
SET @sql := IF(@fk_existe = 0,
  'ALTER TABLE `etiquetas_escritorio_catalogo` ADD CONSTRAINT `fk_etqesc_status` FOREIGN KEY (`status_id`) REFERENCES `tblstatusproc` (`id`) ON DELETE SET NULL',
  'SELECT ''FK fk_etqesc_status ja existe — nada a fazer'' AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 3) Conferência final
-- ----------------------------------------------------------------------------
SELECT
  COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME   = 'etiquetas_escritorio_catalogo'
ORDER BY ORDINAL_POSITION;
