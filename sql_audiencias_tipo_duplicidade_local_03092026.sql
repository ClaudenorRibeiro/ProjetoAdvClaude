-- ============================================================
-- AUDIENCIAS: TIPO OBRIGATORIO + BLOQUEIO DE HORARIO DUPLICADO
-- Executar PRIMEIRO no banco LOCAL pelo HeidiSQL.
-- Banco esperado: sistema_advocacia
--
-- Este script NAO exclui, atualiza nem inventa dados.
-- Se houver audiencia sem tipo ou grupos ativos duplicados, a
-- respectiva trava sera ignorada ate a correcao manual dos dados.
--
-- DDL no MySQL faz COMMIT implicito. Por isso cada ALTER e
-- independente e protegido por diagnosticos, sem BEGIN/ROLLBACK.
-- ============================================================

USE `sistema_advocacia`;

-- ------------------------------------------------------------
-- 1. DIAGNOSTICO ANTES DA ALTERACAO
-- ------------------------------------------------------------

SELECT
  a.id,
  a.processo_id,
  pr.numProc AS processo,
  a.data,
  a.hora,
  a.status
FROM `audiencia` a
JOIN `tblproc` pr ON pr.id = a.processo_id
WHERE a.tipo_audiencia_id IS NULL
ORDER BY a.data, a.hora, a.id;

SELECT
  a.processo_id,
  pr.numProc AS processo,
  a.data,
  a.hora,
  COUNT(*) AS quantidade,
  GROUP_CONCAT(a.id ORDER BY a.id) AS ids_audiencias
FROM `audiencia` a
JOIN `tblproc` pr ON pr.id = a.processo_id
WHERE a.status IN ('agendada', 'adiada')
GROUP BY a.processo_id, pr.numProc, a.data, a.hora
HAVING COUNT(*) > 1
ORDER BY a.data, a.hora, a.processo_id;

SELECT COUNT(*) INTO @audiencias_sem_tipo
FROM `audiencia`
WHERE tipo_audiencia_id IS NULL;

SELECT COUNT(*) INTO @grupos_ativos_duplicados
FROM (
  SELECT 1
  FROM `audiencia`
  WHERE status IN ('agendada', 'adiada')
  GROUP BY processo_id, data, hora
  HAVING COUNT(*) > 1
) AS duplicados;

-- ------------------------------------------------------------
-- 2. TIPO DE AUDIENCIA OBRIGATORIO
-- Somente altera quando todos os registros antigos ja possuem tipo.
-- ------------------------------------------------------------

SELECT COUNT(*) INTO @tipo_ja_obrigatorio
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'audiencia'
  AND column_name = 'tipo_audiencia_id'
  AND is_nullable = 'NO';

SET @sql_tipo := IF(
  @tipo_ja_obrigatorio > 0,
  'SELECT ''OK: tipo_audiencia_id ja e obrigatorio.'' AS resultado',
  IF(
    @audiencias_sem_tipo = 0,
    'ALTER TABLE `audiencia` MODIFY COLUMN `tipo_audiencia_id` INT NOT NULL',
    'SELECT ''BLOQUEADO: existem audiencias sem tipo. Corrija-as pela tela e execute este script novamente.'' AS resultado'
  )
);

PREPARE stmt_tipo FROM @sql_tipo;
EXECUTE stmt_tipo;
DEALLOCATE PREPARE stmt_tipo;

-- ------------------------------------------------------------
-- 3. INDICADOR TECNICO DE HORARIO ATIVO
-- Retorna 1 apenas para Agendada/Adiada e NULL para historicos.
-- Isto permite manter canceladas/remarcadas/realizadas sem impedir
-- um agendamento futuro no mesmo processo, data e horario.
-- ------------------------------------------------------------

SELECT COUNT(*) INTO @coluna_horario_ativo_existe
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'audiencia'
  AND column_name = 'horario_ativo';

SET @sql_coluna := IF(
  @coluna_horario_ativo_existe > 0,
  'SELECT ''OK: coluna tecnica horario_ativo ja existe.'' AS resultado',
  'ALTER TABLE `audiencia` ADD COLUMN `horario_ativo` TINYINT GENERATED ALWAYS AS (CASE WHEN `status` IN (''agendada'',''adiada'') THEN 1 ELSE NULL END) STORED AFTER `publicacao_id`'
);

PREPARE stmt_coluna FROM @sql_coluna;
EXECUTE stmt_coluna;
DEALLOCATE PREPARE stmt_coluna;

-- ------------------------------------------------------------
-- 4. TRAVA DEFINITIVA DE DUPLICIDADE ATIVA
-- Impede mesmo processo + data + hora entre Agendada/Adiada.
-- Somente cria quando os dados atuais nao possuem duplicidades.
-- ------------------------------------------------------------

SELECT COUNT(*) INTO @unique_horario_existe
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'audiencia'
  AND index_name = 'uq_audiencia_horario_ativo'
  AND non_unique = 0;

SET @sql_unique := IF(
  @unique_horario_existe > 0,
  'SELECT ''OK: trava de horario ativo ja existe.'' AS resultado',
  IF(
    @grupos_ativos_duplicados = 0,
    'ALTER TABLE `audiencia` ADD UNIQUE KEY `uq_audiencia_horario_ativo` (`processo_id`,`data`,`hora`,`horario_ativo`)',
    'SELECT ''BLOQUEADO: existem audiencias ativas duplicadas. Exclua ou corrija as duplicadas pela tela e execute este script novamente.'' AS resultado'
  )
);

PREPARE stmt_unique FROM @sql_unique;
EXECUTE stmt_unique;
DEALLOCATE PREPARE stmt_unique;

-- ------------------------------------------------------------
-- 5. RESULTADO FINAL
-- Esperado depois da limpeza manual e nova execucao:
-- tres colunas estruturais = 1; duas pendencias = 0.
-- ------------------------------------------------------------

SELECT
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audiencia'
      AND column_name = 'tipo_audiencia_id'
      AND is_nullable = 'NO'
  ) AS tipo_obrigatorio_ok,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'audiencia'
      AND column_name = 'horario_ativo'
  ) AS coluna_horario_ativo_ok,
  (
    SELECT IF(COUNT(*) = 4, 1, 0)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'audiencia'
      AND index_name = 'uq_audiencia_horario_ativo'
      AND non_unique = 0
  ) AS unique_horario_ativo_ok,
  (
    SELECT COUNT(*)
    FROM `audiencia`
    WHERE tipo_audiencia_id IS NULL
  ) AS audiencias_sem_tipo,
  (
    SELECT COUNT(*)
    FROM (
      SELECT 1
      FROM `audiencia`
      WHERE status IN ('agendada', 'adiada')
      GROUP BY processo_id, data, hora
      HAVING COUNT(*) > 1
    ) AS pendencias_duplicadas
  ) AS grupos_ativos_duplicados;
