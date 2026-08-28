-- =============================================================================
--  RESPONSAVEL / OAB DO PROCESSO  -  script para rodar nas instancias AWS
-- =============================================================================
--
--  PARA QUE SERVE:
--    Adiciona no banco as colunas e vinculos abaixo, que hoje so existem no
--    computador local:
--      - configuracoes_escritorio.advogado_principal_id
--      - configuracoes_escritorio.oab_principal
--      - tblproc.responsavel_id
--      - tblproc.oab_processo
--      - vinculo fk_config_advogado_principal (configuracoes -> usuarios)
--      - vinculo fk_tblproc_responsavel       (tblproc      -> usuarios)
--
--  E SEGURO:
--    - Confere ANTES de criar cada item. Se ja existir, pula.
--    - Nao apaga, nao altera e nao mexe em nenhum dado.
--    - Pode ser rodado mais de uma vez sem problema.
--    - Feito para funcionar mesmo com collation diferente entre instancias
--      (usa CAST(... AS BINARY) nas comparacoes internas).
--
--  COMO RODAR (HeidiSQL):
--    1. Faca um backup do banco dessa instancia.
--    2. No HeidiSQL, conecte no banco CORRETO dessa instancia
--       (Erick = erick_adv  /  Antonio = sistema_advocacia).
--    3. Abra este arquivo, selecione TUDO e aperte F9 (Executar).
--    4. Ao terminar, olhe a ULTIMA grade de resultado: todos os itens
--       devem aparecer como "CRIADA (ok)" e os dois ultimos como "0 (ok)".
--    5. Rode o MESMO arquivo na outra instancia AWS.
--
--  OBS.: o passo do tblproc pode mostrar "~6 mil registros afetados". Isso e
--  so o MySQL reorganizando a tabela ao adicionar coluna/indice. Nenhum
--  processo e alterado.
-- =============================================================================


-- ----- 1) COLUNA configuracoes_escritorio.advogado_principal_id ---------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD COLUMN advogado_principal_id INT NULL AFTER ata_advogado_obrigatorio',
  'SELECT ''pulado: advogado_principal_id ja existe'''
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('advogado_principal_id' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 2) COLUNA configuracoes_escritorio.oab_principal ----------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD COLUMN oab_principal VARCHAR(30) NULL AFTER advogado_principal_id',
  'SELECT ''pulado: oab_principal ja existe'''
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('oab_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 3) COLUNA tblproc.responsavel_id -------------------------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD COLUMN responsavel_id INT NULL AFTER observacoes',
  'SELECT ''pulado: responsavel_id ja existe'''
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('responsavel_id' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 4) COLUNA tblproc.oab_processo ------------------------------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD COLUMN oab_processo VARCHAR(30) NULL AFTER responsavel_id',
  'SELECT ''pulado: oab_processo ja existe'''
) INTO @sql
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('oab_processo' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 5) INDICE do vinculo em configuracoes_escritorio ----------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD INDEX fk_config_advogado_principal (advogado_principal_id)',
  'SELECT ''pulado: indice fk_config_advogado_principal ja existe'''
) INTO @sql
FROM information_schema.STATISTICS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(INDEX_NAME   AS BINARY) = CAST('fk_config_advogado_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 6) INDICE do vinculo em tblproc --------------------------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD INDEX fk_tblproc_responsavel (responsavel_id)',
  'SELECT ''pulado: indice fk_tblproc_responsavel ja existe'''
) INTO @sql
FROM information_schema.STATISTICS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(INDEX_NAME   AS BINARY) = CAST('fk_tblproc_responsavel' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 7) VINCULO configuracoes_escritorio -> usuarios -----------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE configuracoes_escritorio ADD CONSTRAINT fk_config_advogado_principal FOREIGN KEY (advogado_principal_id) REFERENCES usuarios (id) ON DELETE SET NULL',
  'SELECT ''pulado: vinculo fk_config_advogado_principal ja existe'''
) INTO @sql
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME   AS BINARY) = CAST('fk_config_advogado_principal' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ----- 8) VINCULO tblproc -> usuarios -------------------------------------------
SELECT IF(COUNT(*) = 0,
  'ALTER TABLE tblproc ADD CONSTRAINT fk_tblproc_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios (id) ON DELETE SET NULL',
  'SELECT ''pulado: vinculo fk_tblproc_responsavel ja existe'''
) INTO @sql
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME   AS BINARY) = CAST('fk_tblproc_responsavel' AS BINARY);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
--  CONFERENCIA FINAL  -  olhe esta grade. Tudo deve dar "CRIADA (ok)" / "0 (ok)"
-- =============================================================================
SELECT '1) coluna configuracoes_escritorio.advogado_principal_id' AS item,
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR') AS resultado
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('advogado_principal_id' AS BINARY)

UNION ALL
SELECT '2) coluna configuracoes_escritorio.oab_principal',
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR')
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('configuracoes_escritorio' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('oab_principal' AS BINARY)

UNION ALL
SELECT '3) coluna tblproc.responsavel_id',
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR')
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('responsavel_id' AS BINARY)

UNION ALL
SELECT '4) coluna tblproc.oab_processo',
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR')
FROM information_schema.COLUMNS
WHERE CAST(TABLE_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(TABLE_NAME   AS BINARY) = CAST('tblproc' AS BINARY)
  AND CAST(COLUMN_NAME  AS BINARY) = CAST('oab_processo' AS BINARY)

UNION ALL
SELECT '5) vinculo fk_config_advogado_principal',
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR')
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME   AS BINARY) = CAST('fk_config_advogado_principal' AS BINARY)

UNION ALL
SELECT '6) vinculo fk_tblproc_responsavel',
       IF(COUNT(*) > 0, 'CRIADA (ok)', 'FALTANDO -> AVISAR')
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CAST(CONSTRAINT_SCHEMA AS BINARY) = CAST(DATABASE() AS BINARY)
  AND CAST(CONSTRAINT_NAME   AS BINARY) = CAST('fk_tblproc_responsavel' AS BINARY)

UNION ALL
SELECT '7) processos com responsavel invalido (tem que ser 0)',
       CONCAT(CAST(COUNT(*) AS CHAR), IF(COUNT(*) = 0, ' (ok)', ' -> AVISAR'))
FROM tblproc p
LEFT JOIN usuarios u ON u.id = p.responsavel_id
WHERE p.responsavel_id IS NOT NULL AND u.id IS NULL

UNION ALL
SELECT '8) config com advogado principal invalido (tem que ser 0)',
       CONCAT(CAST(COUNT(*) AS CHAR), IF(COUNT(*) = 0, ' (ok)', ' -> AVISAR'))
FROM configuracoes_escritorio c
LEFT JOIN usuarios u ON u.id = c.advogado_principal_id
WHERE c.advogado_principal_id IS NOT NULL AND u.id IS NULL;
