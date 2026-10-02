-- IMPORTANTE — NÃO APAGAR. OBRIGATÓRIO: cria a tabela do agendamento/envio de relatórios por e-mail.
-- Rodar em CADA instância (local e AWS), depois do script da Fase 1. Pode rodar de novo sem problema.
-- ============================================================================
-- RELATÓRIOS (tela nova) — FASE 7: agendamento e envio por e-mail
-- Rodar pelo HeidiSQL, com o BANCO DO SISTEMA selecionado. Executar TUDO (F9).
-- ----------------------------------------------------------------------------
-- O QUE FAZ
--   Cria a tabela relatorio_agendamento (quando enviar, em que formato e para quem).
--   Guarda só a programação — o conteúdo dos relatórios NUNCA é guardado.
--
-- SEGURANÇA
--   * Confere sozinho se o banco é o do sistema (e se já tem a Fase 1). Se não, NÃO faz nada e avisa.
--   * Pode ser rodado várias vezes e em qualquer instância (local, AWS 1, AWS 2).
--   * CREATE TABLE faz COMMIT implícito no MySQL, por isso não há ROLLBACK.
--
-- ROLLBACK (só se precisar desfazer; nenhum dado de outras telas é afetado):
--   DROP TABLE `relatorio_agendamento`;
-- ============================================================================
SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- 0) este banco é o do sistema e já tem a Fase 1?
SET @n_tab := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('usuarios', 'relatorio_modelo'));
SET @ok := IF(@db IS NOT NULL AND @n_tab = 2, 1, 0);
SELECT IF(@ok = 1, 'OK', 'ABORTADO: este banco NAO parece ser o do sistema, ou falta rodar a Fase 1 dos Relatorios. Nada foi alterado.') AS situacao;

-- ---------- 1) tabela relatorio_agendamento
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_agendamento` (
    `id` int NOT NULL AUTO_INCREMENT,
    `modelo_id` int NOT NULL,
    `dono_id` int NOT NULL COMMENT ''quem agendou: o relatorio roda com as permissoes dele'',
    `frequencia` varchar(10) NOT NULL COMMENT ''diaria | semanal | mensal'',
    `dia_semana` tinyint DEFAULT NULL COMMENT ''0=domingo ... 6=sabado (semanal)'',
    `dia_mes` tinyint DEFAULT NULL COMMENT ''1 a 31 (mensal; meses curtos usam o ultimo dia)'',
    `hora` time NOT NULL,
    `formato` varchar(4) NOT NULL DEFAULT ''pdf'' COMMENT ''pdf | docx | xlsx'',
    `destinatarios` json NOT NULL COMMENT ''ids de usuarios ativos do sistema'',
    `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
    `proxima_execucao` datetime DEFAULT NULL COMMENT ''horario de Brasilia'',
    `ultimo_envio` datetime DEFAULT NULL,
    `ultimo_status` varchar(10) DEFAULT NULL COMMENT ''ok | falha'',
    `ultimo_erro` varchar(300) DEFAULT NULL,
    `falhas_seguidas` tinyint NOT NULL DEFAULT ''0'',
    `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
    `alterado_em` datetime DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_relag_proxima` (`ativo`,`proxima_execucao`),
    KEY `idx_relag_dono` (`dono_id`),
    KEY `idx_relag_modelo` (`modelo_id`),
    CONSTRAINT `fk_relag_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `relatorio_modelo` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_relag_dono` FOREIGN KEY (`dono_id`) REFERENCES `usuarios` (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT IF(@ok = 1, (SELECT IF(COUNT(*) = 1, 'PRONTO: tabela relatorio_agendamento existe.', 'ATENCAO: a tabela nao foi criada.')
                      FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'relatorio_agendamento'),
          'Nada foi alterado.') AS resultado;
