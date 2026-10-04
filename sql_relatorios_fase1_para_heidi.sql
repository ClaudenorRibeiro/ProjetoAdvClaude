-- SUBSTITUÍDO (04/10/2026) pelo script único sql_atualizar_banco_para_heidi.sql — NÃO rode mais este arquivo; ele fica só como histórico.
-- IMPORTANTE — NÃO APAGAR. OBRIGATÓRIO: cria as tabelas do módulo Relatórios.
-- Rodar em CADA instância (local e AWS) antes de usar a tela de Relatórios. Pode rodar de novo sem problema.
-- ============================================================================
-- RELATÓRIOS (tela nova) — FASE 1: tabelas e colunas
-- Rodar pelo HeidiSQL, com o BANCO DO SISTEMA selecionado. Executar TUDO (F9).
-- ----------------------------------------------------------------------------
-- O QUE FAZ
--   1) Cria a tabela relatorio_modelo          (a "receita" de cada relatório)
--   2) Cria a tabela relatorio_modelo_usuario  (quem usa cada relatório + preferências)
--   3) Acrescenta configuracoes_escritorio.max_relatorios_por_usuario (padrão 10)
--   4) Acrescenta usuarios.max_relatorios (exceção individual; vazio = usa o padrão)
--
-- O CONTEÚDO dos relatórios (dados de clientes, processos etc.) NUNCA é guardado:
-- a receita guarda só as escolhas (assunto, colunas, filtros, ordem).
--
-- SEGURANÇA
--   * Confere sozinho se o banco é o do sistema. Se não for, NÃO faz nada e avisa.
--   * Pode ser rodado várias vezes e em qualquer instância (local, AWS 1, AWS 2):
--     cada passo confere o que já existe antes de criar. Nada é apagado nem alterado.
--   * CREATE/ALTER TABLE fazem COMMIT implícito no MySQL, por isso não há ROLLBACK;
--     cada passo é independente e reaplicável.
--
-- ROLLBACK (só se precisar desfazer; nenhum dado de outras telas é afetado):
--   DROP TABLE `relatorio_modelo_usuario`;
--   DROP TABLE `relatorio_modelo`;
--   ALTER TABLE `configuracoes_escritorio` DROP COLUMN `max_relatorios_por_usuario`;
--   ALTER TABLE `usuarios` DROP COLUMN `max_relatorios`;
-- ============================================================================
SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- 0) este banco é o do sistema?
SET @n_tab := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = @db
                  AND ((TABLE_NAME = 'usuarios' AND COLUMN_NAME IN ('id','login','nivel'))
                    OR (TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME IN ('id','nome'))));
SET @n_coll := (SELECT COUNT(*) FROM information_schema.COLLATIONS WHERE COLLATION_NAME = 'utf8mb4_0900_ai_ci');
SET @ok := IF(@db IS NOT NULL AND @n_tab = 5 AND @n_coll = 1, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@n_tab <> 5, 'ABORTADO: este banco NAO parece ser o do sistema (faltam as tabelas usuarios/configuracoes_escritorio). Nada foi alterado.',
                                  'ABORTADO: este servidor nao tem a collation utf8mb4_0900_ai_ci (versao diferente). Nada foi alterado - avise o suporte.'));

-- ---------- 1) tabela relatorio_modelo
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_modelo` (
    `id` int NOT NULL AUTO_INCREMENT,
    `nome` varchar(100) NOT NULL,
    `descricao` varchar(300) DEFAULT NULL,
    `assunto` varchar(40) NOT NULL COMMENT ''chave do assunto no catalogo (ex.: prazos, tarefas)'',
    `definicao` json NOT NULL COMMENT ''receita: colunas, filtros e ordem. Nunca guarda dados'',
    `escopo` varchar(10) NOT NULL DEFAULT ''pessoal'' COMMENT ''pessoal | sistema'',
    `dono_id` int NOT NULL,
    `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
    `alterado_em` datetime DEFAULT NULL,
    `alterado_por` int DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_relmod_dono_nome` (`dono_id`,`nome`),
    KEY `idx_relmod_escopo` (`escopo`),
    KEY `fk_relmod_alterado_por` (`alterado_por`),
    CONSTRAINT `fk_relmod_dono` FOREIGN KEY (`dono_id`) REFERENCES `usuarios` (`id`),
    CONSTRAINT `fk_relmod_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 2) tabela relatorio_modelo_usuario
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_modelo_usuario` (
    `modelo_id` int NOT NULL,
    `usuario_id` int NOT NULL,
    `origem` varchar(12) NOT NULL DEFAULT ''proprio'' COMMENT ''proprio | compartilhado | liberado'',
    `preferencias` json DEFAULT NULL COMMENT ''preferencias deste usuario neste relatorio (ex.: linhas por pagina)'',
    `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`modelo_id`,`usuario_id`),
    KEY `idx_relmu_usuario` (`usuario_id`),
    CONSTRAINT `fk_relmu_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `relatorio_modelo` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_relmu_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 3) limite padrão de relatórios por usuário (configurações do escritório)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'max_relatorios_por_usuario');
SET @sql := IF(@ok = 1 AND @existe = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `max_relatorios_por_usuario` int NOT NULL DEFAULT ''10'' COMMENT ''limite padrao de relatorios pessoais por usuario''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 4) exceção individual do limite (vazio = usa o padrão do escritório)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'max_relatorios');
SET @sql := IF(@ok = 1 AND @existe = 0,
 'ALTER TABLE `usuarios` ADD COLUMN `max_relatorios` int DEFAULT NULL COMMENT ''limite individual de relatorios (vazio = usa o padrao do escritorio)''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 5) CONFERÊNCIA (veja as abas de resultado)
SELECT @motivo AS resultado,
       (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('relatorio_modelo','relatorio_modelo_usuario')) AS tabelas_novas_deve_ser_2,
       (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND ((TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'max_relatorios_por_usuario') OR (TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'max_relatorios'))) AS colunas_novas_deve_ser_2;
