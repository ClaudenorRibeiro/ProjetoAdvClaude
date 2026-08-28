-- Responsável e OAB padrão do escritório + responsável/OAB em cada processo.
-- Script para rodar manualmente no HeidiSQL, dentro do banco correto.
-- Pode ser rodado em mais de uma instância: só cria o que ainda não existir.
-- As checagens no information_schema usam CAST(... AS BINARY) para evitar erro
-- "Illegal mix of collations" em instâncias com collations diferentes.

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD COLUMN advogado_principal_id INT NULL AFTER ata_advogado_obrigatorio',
  'SELECT 1'
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME AS BINARY) = CAST('advogado_principal_id' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD COLUMN oab_principal VARCHAR(30) NULL AFTER advogado_principal_id',
  'SELECT 1'
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME AS BINARY) = CAST('oab_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD COLUMN responsavel_id INT NULL AFTER observacoes',
  'SELECT 1'
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME AS BINARY) = CAST('responsavel_id' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD COLUMN oab_processo VARCHAR(30) NULL AFTER responsavel_id',
  'SELECT 1'
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME AS BINARY) = CAST('oab_processo' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD INDEX fk_config_advogado_principal (advogado_principal_id)',
  'SELECT 1'
) INTO @sql
FROM information_schema.STATISTICS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(INDEX_NAME AS BINARY) = CAST('fk_config_advogado_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD INDEX fk_tblproc_responsavel (responsavel_id)',
  'SELECT 1'
) INTO @sql
FROM information_schema.STATISTICS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(INDEX_NAME AS BINARY) = CAST('fk_tblproc_responsavel' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD CONSTRAINT fk_config_advogado_principal FOREIGN KEY (advogado_principal_id) REFERENCES usuarios (id) ON DELETE SET NULL',
  'SELECT 1'
) INTO @sql
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME AS BINARY) = CAST('fk_config_advogado_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD CONSTRAINT fk_tblproc_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios (id) ON DELETE SET NULL',
  'SELECT 1'
) INTO @sql
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME AS BINARY) = CAST('fk_tblproc_responsavel' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
