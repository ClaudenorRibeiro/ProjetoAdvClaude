-- ============================================================================
-- ATUALIZAÇÃO ÚNICA DA AWS PARA A ESTRUTURA LOCAL — 03/09/2026
-- Banco: sistema_advocacia | MySQL 8 | Execução pelo HeidiSQL
-- ============================================================================
-- Comparação realizada entre:
--   C:\Users\Claudio\Downloads\aws.sql
--   C:\Users\Claudio\Downloads\local.sql
--
-- Diferenças encontradas:
--   1. audiencia.publicacao_id não existe na AWS;
--   2. falta a FK audiencia.publicacao_id -> publicacoes.id (ON DELETE SET NULL);
--   3. falta a FK audiencia.vara_id -> tblvara.id (ON DELETE SET NULL);
--   4. falta UNIQUE em configuracoes_integracoes.modulo.
--
-- SEGURANÇA:
--   - O script é reaplicável: cada objeto é conferido antes do ALTER TABLE.
--   - Nenhum dado é apagado, corrigido ou deduplicado automaticamente.
--   - Se houver órfãos, duplicatas ou nome de constraint incompatível, somente
--     aquele item informa BLOQUEADO; os demais continuam sendo verificados.
--   - ALTER TABLE faz COMMIT implícito no MySQL. Por isso não há BEGIN/ROLLBACK
--     envolvendo DDL: cada alteração é independente e verificável.
-- ============================================================================

USE `sistema_advocacia`;

SELECT CONCAT('Banco selecionado: ', DATABASE()) AS resultado;

-- ============================================================================
-- 1) COLUNA audiencia.publicacao_id
-- ============================================================================

SET @coluna_publicacao_existe := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND COLUMN_NAME = 'publicacao_id'
);

SET @sql_coluna_publicacao := IF(
  @coluna_publicacao_existe = 0,
  'ALTER TABLE `audiencia` ADD COLUMN `publicacao_id` INT NULL AFTER `motivo_status`',
  'SELECT ''OK: audiencia.publicacao_id já existe'' AS resultado'
);

PREPARE stmt_coluna_publicacao FROM @sql_coluna_publicacao;
EXECUTE stmt_coluna_publicacao;
DEALLOCATE PREPARE stmt_coluna_publicacao;

-- ============================================================================
-- 2) FK audiencia.publicacao_id -> publicacoes.id ON DELETE SET NULL
-- ============================================================================

SET @publicacoes_orfas := (
  SELECT COUNT(*)
    FROM audiencia a
    LEFT JOIN publicacoes p ON p.id = a.publicacao_id
   WHERE a.publicacao_id IS NOT NULL
     AND p.id IS NULL
);

SET @fk_publicacao_correta := (
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

SET @nome_fk_publicacao_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND CONSTRAINT_NAME = 'fk_audiencia_publicacao'
);

SET @sql_fk_publicacao := CASE
  WHEN @fk_publicacao_correta > 0 THEN
    'SELECT ''OK: FK audiencia.publicacao_id já está correta'' AS resultado'
  WHEN @publicacoes_orfas > 0 THEN
    'SELECT ''BLOQUEADO: existem publicacao_id sem publicação correspondente; nenhum dado foi alterado'' AS resultado'
  WHEN @nome_fk_publicacao_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: fk_audiencia_publicacao já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `audiencia` ADD CONSTRAINT `fk_audiencia_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL'
END;

PREPARE stmt_fk_publicacao FROM @sql_fk_publicacao;
EXECUTE stmt_fk_publicacao;
DEALLOCATE PREPARE stmt_fk_publicacao;

-- ============================================================================
-- 3) FK audiencia.vara_id -> tblvara.id ON DELETE SET NULL
-- ============================================================================

SET @varas_orfas := (
  SELECT COUNT(*)
    FROM audiencia a
    LEFT JOIN tblvara v ON v.id = a.vara_id
   WHERE a.vara_id IS NOT NULL
     AND v.id IS NULL
);

SET @fk_vara_correta := (
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

SET @nome_fk_vara_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND CONSTRAINT_NAME = 'fk_audiencia_vara'
);

SET @sql_fk_vara := CASE
  WHEN @fk_vara_correta > 0 THEN
    'SELECT ''OK: FK audiencia.vara_id já está correta'' AS resultado'
  WHEN @varas_orfas > 0 THEN
    'SELECT ''BLOQUEADO: existem vara_id sem vara correspondente; nenhum dado foi alterado'' AS resultado'
  WHEN @nome_fk_vara_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: fk_audiencia_vara já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `audiencia` ADD CONSTRAINT `fk_audiencia_vara` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL'
END;

PREPARE stmt_fk_vara FROM @sql_fk_vara;
EXECUTE stmt_fk_vara;
DEALLOCATE PREPARE stmt_fk_vara;

-- ============================================================================
-- 4) UNIQUE em configuracoes_integracoes.modulo
-- ============================================================================

SET @modulos_duplicados := (
  SELECT COUNT(*)
    FROM (
      SELECT modulo
        FROM configuracoes_integracoes
       GROUP BY modulo
      HAVING COUNT(*) > 1
    ) duplicados
);

SET @unique_modulo_correto := (
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

SET @nome_unique_modulo_ocupado := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracoes_integracoes'
     AND INDEX_NAME = 'uq_configuracoes_integracoes_modulo'
);

SET @sql_unique_modulo := CASE
  WHEN @unique_modulo_correto > 0 THEN
    'SELECT ''OK: UNIQUE de configuracoes_integracoes.modulo já existe'' AS resultado'
  WHEN @modulos_duplicados > 0 THEN
    'SELECT ''BLOQUEADO: existem módulos duplicados; nenhum registro foi apagado ou alterado'' AS resultado'
  WHEN @nome_unique_modulo_ocupado > 0 THEN
    'SELECT ''BLOQUEADO: uq_configuracoes_integracoes_modulo já existe com definição diferente; revise antes de alterar'' AS resultado'
  ELSE
    'ALTER TABLE `configuracoes_integracoes` ADD CONSTRAINT `uq_configuracoes_integracoes_modulo` UNIQUE (`modulo`)'
END;

PREPARE stmt_unique_modulo FROM @sql_unique_modulo;
EXECUTE stmt_unique_modulo;
DEALLOCATE PREPARE stmt_unique_modulo;

-- ============================================================================
-- 5) DIAGNÓSTICO FINAL
-- Todos os indicadores estruturais esperados devem retornar 1.
-- Todos os indicadores de inconsistência esperados devem retornar 0.
-- ============================================================================

SELECT
  (SELECT COUNT(*)
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'audiencia'
      AND COLUMN_NAME = 'publicacao_id') AS coluna_publicacao_id_ok,

  (SELECT COUNT(*)
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
      AND r.DELETE_RULE = 'SET NULL') AS fk_publicacao_ok,

  (SELECT COUNT(*)
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
      AND r.DELETE_RULE = 'SET NULL') AS fk_vara_ok,

  (SELECT COUNT(*)
     FROM (
       SELECT INDEX_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'configuracoes_integracoes'
          AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
       HAVING COUNT(*) = 1
          AND MAX(COLUMN_NAME) = 'modulo'
     ) indices) AS unique_modulo_ok,

  (SELECT COUNT(*)
     FROM audiencia a
     LEFT JOIN publicacoes p ON p.id = a.publicacao_id
    WHERE a.publicacao_id IS NOT NULL
      AND p.id IS NULL) AS publicacoes_orfas,

  (SELECT COUNT(*)
     FROM audiencia a
     LEFT JOIN tblvara v ON v.id = a.vara_id
    WHERE a.vara_id IS NOT NULL
      AND v.id IS NULL) AS varas_orfas,

  (SELECT COUNT(*)
     FROM (
       SELECT modulo
         FROM configuracoes_integracoes
        GROUP BY modulo
       HAVING COUNT(*) > 1
     ) duplicados) AS modulos_duplicados;

-- Se algum item tiver sido BLOQUEADO, estes detalhes mostram os registros envolvidos.

SELECT a.id AS audiencia_id, a.publicacao_id
  FROM audiencia a
  LEFT JOIN publicacoes p ON p.id = a.publicacao_id
 WHERE a.publicacao_id IS NOT NULL
   AND p.id IS NULL;

SELECT a.id AS audiencia_id, a.vara_id, a.data, a.processo_id
  FROM audiencia a
  LEFT JOIN tblvara v ON v.id = a.vara_id
 WHERE a.vara_id IS NOT NULL
   AND v.id IS NULL;

SELECT modulo, COUNT(*) AS quantidade, GROUP_CONCAT(id ORDER BY id) AS ids,
       MAX(atualizado_em) AS atualizacao_mais_recente
  FROM configuracoes_integracoes
 GROUP BY modulo
HAVING COUNT(*) > 1;

-- ============================================================================
-- ROLLBACK MANUAL (somente se for realmente necessário desfazer)
-- Execute cada linha separadamente e somente após conferir dependências.
--
-- ALTER TABLE `configuracoes_integracoes`
--   DROP INDEX `uq_configuracoes_integracoes_modulo`;
-- ALTER TABLE `audiencia`
--   DROP FOREIGN KEY `fk_audiencia_vara`;
-- ALTER TABLE `audiencia`
--   DROP FOREIGN KEY `fk_audiencia_publicacao`;
-- ALTER TABLE `audiencia`
--   DROP COLUMN `publicacao_id`;
-- ============================================================================
