-- ============================================================================
-- PREFERÊNCIA "VER: Atribuídas a mim / Todas" na tela de Publicações (por usuário)
-- Banco: usar o banco já selecionado no HeidiSQL | MySQL 8 | rodar pelo HeidiSQL
-- ----------------------------------------------------------------------------
-- Acrescenta 1 coluna em `usuarios`:
--   publicacoes_escopo VARCHAR(10) NOT NULL DEFAULT 'todas'   -- 'todas' | 'minhas'
--
-- Guarda a escolha do seletor "Ver" da tela de Publicações. Vale só para admin
-- e para quem tem permissão de "cadastrar" publicações (o buscador). Os demais
-- usuários já veem só as atribuídas a eles e a coluna não os afeta.
--
-- SEGURANÇA:
--   - Reaplicável: confere no information_schema antes do ALTER.
--   - Nenhum dado existente é lido, apagado ou alterado — a coluna nasce com
--     'todas' para todo mundo, ou seja, exatamente o comportamento de hoje.
--   - Mesmo padrão das outras preferências de `usuarios` (cores_menu, cor_linha...).
--   - Rodar 1x em cada instância (local -> testar -> as 2 AWS).
--
-- ROLLBACK (se precisar desfazer):
--   ALTER TABLE `usuarios` DROP COLUMN `publicacoes_escopo`;
-- ============================================================================

SELECT CONCAT('Banco selecionado: ', DATABASE()) AS resultado;
SET @db := DATABASE();

SET @col_existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME   = 'usuarios'
    AND COLUMN_NAME  = 'publicacoes_escopo'
);
SET @sql := IF(@col_existe = 0,
  'ALTER TABLE `usuarios` ADD COLUMN `publicacoes_escopo` VARCHAR(10) NOT NULL DEFAULT ''todas'' AFTER `google_agenda_email`',
  'SELECT ''coluna publicacoes_escopo ja existe — nada a fazer'' AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Conferência
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios'
  AND COLUMN_NAME = 'publicacoes_escopo';
