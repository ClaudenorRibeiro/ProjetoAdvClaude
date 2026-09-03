-- ============================================================
-- UNIQUE em configuracoes_integracoes.modulo
-- Script reaplicável para MySQL 8 / HeidiSQL.
-- ------------------------------------------------------------
-- Não apaga duplicatas automaticamente. Se houver duplicata, informa BLOQUEADO
-- para o Claudio escolher conscientemente qual configuração deve permanecer.
-- DDL no MySQL faz COMMIT implícito; não há BEGIN/ROLLBACK em volta do ALTER.
-- ============================================================

SET @modulos_duplicados := (
  SELECT COUNT(*)
    FROM (
      SELECT modulo
        FROM configuracoes_integracoes
       GROUP BY modulo
      HAVING COUNT(*) > 1
    ) duplicados
);
SET @unique_correto := (
  SELECT COUNT(*)
    FROM (
      SELECT INDEX_NAME
        FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'configuracoes_integracoes'
         AND NON_UNIQUE = 0
       GROUP BY INDEX_NAME
      HAVING COUNT(*) = 1
         AND MAX(COLUMN_NAME) = 'modulo'
    ) indices
);
SET @nome_unique_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracoes_integracoes'
     AND INDEX_NAME = 'uq_configuracoes_integracoes_modulo'
);
SET @sql_unique := CASE
  WHEN @unique_correto > 0 THEN
    'SELECT ''OK: UNIQUE de configuracoes_integracoes.modulo já existe'' AS resultado'
  WHEN @modulos_duplicados > 0 THEN
    'SELECT ''BLOQUEADO: existem módulos duplicados; escolha qual registro manter antes do UNIQUE'' AS resultado'
  WHEN @nome_unique_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: o nome uq_configuracoes_integracoes_modulo já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `configuracoes_integracoes` ADD CONSTRAINT `uq_configuracoes_integracoes_modulo` UNIQUE (`modulo`)'
END;
PREPARE stmt_unique FROM @sql_unique;
EXECUTE stmt_unique;
DEALLOCATE PREPARE stmt_unique;

-- ------------------------------------------------------------
-- ROLLBACK (se precisar desfazer):
-- ALTER TABLE `configuracoes_integracoes` DROP INDEX `uq_configuracoes_integracoes_modulo`;
-- ------------------------------------------------------------
