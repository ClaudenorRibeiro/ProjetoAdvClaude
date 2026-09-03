-- ============================================================
-- DIAGNÓSTICO COMPLETO — auditoria 03/09/2026
-- ------------------------------------------------------------
-- SÓ LEITURA: não altera nenhum dado nem estrutura.
-- Rode em cada instância (local + 2 AWS) antes dos scripts de correção.
-- Cada bloco confere separadamente dados, coluna, FK e UNIQUE, evitando
-- concluir que a estrutura está completa apenas porque uma coluna existe.
-- ============================================================

-- BLOCO 1 — audiências com vara inexistente.
-- Resultado esperado: nenhuma linha.
SELECT a.id AS audiencia_id, a.vara_id, a.data, a.processo_id
  FROM audiencia a
 WHERE a.vara_id IS NOT NULL
   AND a.vara_id NOT IN (SELECT id FROM tblvara);

-- BLOCO 2 — módulos duplicados.
-- Resultado esperado: nenhuma linha.
SELECT modulo, COUNT(*) AS quantidade, GROUP_CONCAT(id) AS ids, MAX(atualizado_em) AS mais_recente
  FROM configuracoes_integracoes
 GROUP BY modulo
HAVING COUNT(*) > 1;

-- BLOCO 3 — coluna audiencia.publicacao_id.
-- Resultado esperado: 1.
SELECT COUNT(*) AS coluna_publicacao_id_existe
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'audiencia'
   AND COLUMN_NAME = 'publicacao_id';

-- BLOCO 4 — publicações inexistentes referenciadas por audiência.
-- Funciona também quando a coluna ainda não existe.
-- Resultado esperado: nenhuma linha ou a mensagem informativa.
SET @coluna_publicacao_existe := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audiencia'
     AND COLUMN_NAME = 'publicacao_id'
);
SET @sql_diagnostico_publicacao := IF(
  @coluna_publicacao_existe = 1,
  'SELECT a.id AS audiencia_id, a.publicacao_id FROM audiencia a LEFT JOIN publicacoes p ON p.id = a.publicacao_id WHERE a.publicacao_id IS NOT NULL AND p.id IS NULL',
  'SELECT ''INFORMATIVO: audiencia.publicacao_id ainda não existe'' AS resultado'
);
PREPARE stmt_diagnostico_publicacao FROM @sql_diagnostico_publicacao;
EXECUTE stmt_diagnostico_publicacao;
DEALLOCATE PREPARE stmt_diagnostico_publicacao;

-- BLOCO 5 — FK audiencia.publicacao_id -> publicacoes.id com SET NULL.
-- Resultado esperado: 1.
SELECT COUNT(*) AS fk_audiencia_publicacao_correta
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
   AND r.DELETE_RULE = 'SET NULL';

-- BLOCO 6 — FK audiencia.vara_id -> tblvara.id com SET NULL.
-- Resultado esperado: 1.
SELECT COUNT(*) AS fk_audiencia_vara_correta
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
   AND r.DELETE_RULE = 'SET NULL';

-- BLOCO 7 — UNIQUE exclusivamente sobre configuracoes_integracoes.modulo.
-- Resultado esperado: uma linha com o nome do índice e quantidade_colunas = 1.
SELECT INDEX_NAME AS indice_unique, COUNT(*) AS quantidade_colunas
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'configuracoes_integracoes'
   AND NON_UNIQUE = 0
 GROUP BY INDEX_NAME
HAVING COUNT(*) = 1
   AND MAX(COLUMN_NAME) = 'modulo';
