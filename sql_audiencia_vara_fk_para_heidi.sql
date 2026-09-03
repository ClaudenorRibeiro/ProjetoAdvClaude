-- ============================================================
-- FK audiencia.vara_id -> tblvara.id
-- Script reaplicável para MySQL 8 / HeidiSQL.
-- ------------------------------------------------------------
-- Não altera dados inconsistentes automaticamente. Se houver vara inexistente,
-- informa BLOQUEADO para o Claudio decidir o cadastro correto no HeidiSQL.
-- DDL no MySQL faz COMMIT implícito; não há BEGIN/ROLLBACK em volta do ALTER.
-- ============================================================

SET @varas_orfas := (
  SELECT COUNT(*)
    FROM audiencia a
    LEFT JOIN tblvara v ON v.id = a.vara_id
   WHERE a.vara_id IS NOT NULL
     AND v.id IS NULL
);
SET @fk_correta := (
  SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
     AND r.TABLE_NAME = k.TABLE_NAME
     AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
   WHERE k.CONSTRAINT_SCHEMA = DATABASE()
     AND k.TABLE_NAME = 'audiencia'
     AND k.COLUMN_NAME = 'vara_id'
     AND k.REFERENCED_TABLE_NAME = 'tblvara'
     AND k.REFERENCED_COLUMN_NAME = 'id'
     AND r.DELETE_RULE = 'SET NULL'
);
SET @nome_fk_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND CONSTRAINT_NAME = 'fk_audiencia_vara'
);
SET @sql_fk := CASE
  WHEN @fk_correta > 0 THEN
    'SELECT ''OK: FK audiencia.vara_id já está correta'' AS resultado'
  WHEN @varas_orfas > 0 THEN
    'SELECT ''BLOQUEADO: existem vara_id sem vara correspondente; corrija os dados antes da FK'' AS resultado'
  WHEN @nome_fk_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: o nome fk_audiencia_vara já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `audiencia` ADD CONSTRAINT `fk_audiencia_vara` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL'
END;
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ------------------------------------------------------------
-- ROLLBACK (se precisar desfazer):
-- ALTER TABLE `audiencia` DROP FOREIGN KEY `fk_audiencia_vara`;
-- ------------------------------------------------------------
