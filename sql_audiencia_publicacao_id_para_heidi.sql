-- ============================================================
-- VÍNCULO DE ORIGEM: audiencia.publicacao_id -> publicacoes.id
-- Script reaplicável para MySQL 8 / HeidiSQL.
-- ------------------------------------------------------------
-- Cada objeto é verificado separadamente. DDL no MySQL faz COMMIT implícito;
-- por isso não há BEGIN/ROLLBACK falso envolvendo os ALTER TABLE.
-- A audiência remarcada NÃO herda automaticamente a publicação antiga.
-- ============================================================

-- 1) Cria a coluna somente se estiver ausente.
SET @coluna_existe := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND COLUMN_NAME = 'publicacao_id'
);
SET @sql_coluna := IF(
  @coluna_existe = 0,
  'ALTER TABLE `audiencia` ADD COLUMN `publicacao_id` INT NULL AFTER `motivo_status`',
  'SELECT ''OK: audiencia.publicacao_id já existe'' AS resultado'
);
PREPARE stmt_coluna FROM @sql_coluna;
EXECUTE stmt_coluna;
DEALLOCATE PREPARE stmt_coluna;

-- 2) Confere dados inválidos antes da FK.
SET @publicacoes_orfas := (
  SELECT COUNT(*)
    FROM audiencia a
    LEFT JOIN publicacoes p ON p.id = a.publicacao_id
   WHERE a.publicacao_id IS NOT NULL
     AND p.id IS NULL
);

-- 3) Confere a FK completa, inclusive destino e regra de exclusão.
SET @fk_correta := (
  SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
     AND r.TABLE_NAME = k.TABLE_NAME
     AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
   WHERE k.CONSTRAINT_SCHEMA = DATABASE()
     AND k.TABLE_NAME = 'audiencia'
     AND k.COLUMN_NAME = 'publicacao_id'
     AND k.REFERENCED_TABLE_NAME = 'publicacoes'
     AND k.REFERENCED_COLUMN_NAME = 'id'
     AND r.DELETE_RULE = 'SET NULL'
);
SET @nome_fk_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND CONSTRAINT_NAME = 'fk_audiencia_publicacao'
);
SET @sql_fk := CASE
  WHEN @fk_correta > 0 THEN
    'SELECT ''OK: FK audiencia.publicacao_id já está correta'' AS resultado'
  WHEN @publicacoes_orfas > 0 THEN
    'SELECT ''BLOQUEADO: existem publicacao_id sem publicação correspondente; corrija os dados antes da FK'' AS resultado'
  WHEN @nome_fk_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: o nome fk_audiencia_publicacao já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `audiencia` ADD CONSTRAINT `fk_audiencia_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL'
END;
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ------------------------------------------------------------
-- ROLLBACK (se precisar desfazer — nesta ordem, a FK primeiro):
-- ALTER TABLE `audiencia` DROP FOREIGN KEY `fk_audiencia_publicacao`;
-- ALTER TABLE `audiencia` DROP COLUMN `publicacao_id`;
-- ------------------------------------------------------------
