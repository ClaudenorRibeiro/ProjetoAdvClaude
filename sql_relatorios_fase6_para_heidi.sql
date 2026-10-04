-- SUBSTITUÍDO (04/10/2026) pelo script único sql_atualizar_banco_para_heidi.sql — NÃO rode mais este arquivo; ele fica só como histórico.
-- IMPORTANTE — NÃO APAGAR até rodar em todas as instâncias. OPCIONAL: só ajusta o comentário de uma coluna (documentação).
-- ============================================================================
-- RELATÓRIOS (tela nova) — FASE 6: acerto do COMENTÁRIO de uma coluna (OPCIONAL, só documentação)
-- Rodar pelo HeidiSQL, com o BANCO DO SISTEMA selecionado. Executar TUDO (F9).
-- ----------------------------------------------------------------------------
-- POR QUE EXISTE
--   Na Fase 1 a coluna relatorio_modelo_usuario.origem foi criada com o comentário
--   "proprio | compartilhado | liberado", mas a coluna tem só 12 caracteres e "compartilhado" tem 13.
--   O sistema (Fase 6) passou a gravar o valor curto "colega" para o relatório compartilhado.
--   Este script só corrige o COMENTÁRIO da coluna para dizer a verdade: "proprio | colega | liberado".
--
-- IMPORTANTE
--   * NÃO é preciso rodar para o sistema funcionar: o código já usa "colega", que cabe na coluna.
--   * NÃO altera tamanho, tipo, valor padrão nem dados. Só o texto do comentário.
--   * Confere sozinho se o banco é o do sistema e se a coluna existe. Se algo não bater, NÃO faz nada e avisa.
--   * Pode ser rodado várias vezes e em qualquer instância (local, AWS 1, AWS 2).
--
-- ROLLBACK (só se quiser voltar o comentário antigo; nada de dados é afetado):
--   ALTER TABLE `relatorio_modelo_usuario` MODIFY COLUMN `origem` varchar(12) NOT NULL DEFAULT 'proprio'
--     COMMENT 'proprio | compartilhado | liberado';
-- ============================================================================
SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- 0) este banco é o do sistema e tem a coluna?
SET @tem_coluna := (SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'relatorio_modelo_usuario' AND COLUMN_NAME = 'origem'
                       AND DATA_TYPE = 'varchar' AND CHARACTER_MAXIMUM_LENGTH = 12);
SET @ja_certo := (SELECT COUNT(*) FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'relatorio_modelo_usuario' AND COLUMN_NAME = 'origem'
                     AND COLUMN_COMMENT = 'proprio | colega | liberado');
SET @motivo := IF(@db IS NULL, 'ABORTADO: nenhum banco selecionado. Nada foi alterado.',
                IF(@tem_coluna = 0, 'ABORTADO: nao encontrei relatorio_modelo_usuario.origem varchar(12) (rode antes o script da Fase 1). Nada foi alterado.',
                IF(@ja_certo = 1, 'OK - o comentario ja estava correto. Nada a fazer.', 'OK - comentario atualizado.')));

-- ---------- 1) acerta o comentário
SET @sql := IF(@db IS NOT NULL AND @tem_coluna = 1 AND @ja_certo = 0,
 'ALTER TABLE `relatorio_modelo_usuario` MODIFY COLUMN `origem` varchar(12) NOT NULL DEFAULT ''proprio'' COMMENT ''proprio | colega | liberado''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 2) CONFERÊNCIA (veja a aba de resultado)
SELECT @motivo AS resultado,
       (SELECT COLUMN_COMMENT FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'relatorio_modelo_usuario' AND COLUMN_NAME = 'origem') AS comentario_atual_deve_ser_proprio_colega_liberado;
