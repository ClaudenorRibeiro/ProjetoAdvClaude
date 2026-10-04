-- IMPORTANTE — NÃO APAGAR. Atualiza o banco do FINANCEIRO que está atrasado em relação ao estrutura_banco.sql.
-- Cria 5 tabelas (instituicao_financeira, conta_financeira, contas_bancarias_pf, contas_bancarias_pj, acordo_parcela_multa) e
-- acrescenta 23 colunas (acordo, acordo_parcela, conta_corrente, forma_pagamento, advogados_freela) com seus índices e chaves.
-- Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, executando TUDO (F9), em CADA instância (local, AWS-Antônio, AWS-Erick).
-- Seguro para rodar mais de uma vez: só cria o que ainda não existe e não apaga nem altera nenhum dado.
-- Depois de rodar, execute o sql_diagnostico_estrutura_para_heidi.sql: os dois resultados devem vir vazios.
-- As definições são cópia fiel do estrutura_banco.sql (por isso esse arquivo NÃO muda).
-- ============================================================================================================
SET @db := DATABASE();

-- 1) Tabelas novas (na ordem das dependências)
CREATE TABLE IF NOT EXISTS `instituicao_financeira` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instituicao_financeira_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `conta_financeira` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instituicao_financeira_id` int DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conta_financeira_nome` (`nome`),
  KEY `idx_conta_financeira_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_conta_financeira_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `contas_bancarias_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT 'corrente ou poupanca',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = conta da propria pessoa; 1 = conta de outra pessoa (autorizacao)',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpf_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpf_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpf_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpf_tipo` CHECK ((`tipo` in (_utf8mb4'corrente',_utf8mb4'poupanca')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `contas_bancarias_pj` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT 'corrente ou poupanca',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = conta da propria empresa; 1 = conta de outra pessoa/empresa (autorizacao)',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpj_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpj_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpj_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpj_tipo` CHECK ((`tipo` in (_utf8mb4'corrente',_utf8mb4'poupanca')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `acordo_parcela_multa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `parcela_id` int NOT NULL,
  `percentual_juiz` decimal(5,2) DEFAULT NULL,
  `vencimento` date NOT NULL,
  `valor_bruto` decimal(15,2) NOT NULL,
  `honor_tipo` varchar(10) NOT NULL DEFAULT 'percent',
  `honor_percentual` decimal(5,2) DEFAULT NULL,
  `honor_valor` decimal(15,2) NOT NULL DEFAULT '0.00',
  `valor_liquido` decimal(15,2) NOT NULL DEFAULT '0.00',
  `repasse_cliente_habilitado` tinyint(1) NOT NULL DEFAULT '0',
  `repasse_cliente_tipo` varchar(10) DEFAULT NULL,
  `repasse_cliente_pessoa_id` int DEFAULT NULL,
  `repasse_cliente_conta_id` int DEFAULT NULL,
  `parceria_pessoa_tipo` varchar(20) DEFAULT NULL,
  `parceria_pessoa_id` int DEFAULT NULL,
  `parceria_tipo` varchar(10) DEFAULT NULL,
  `parceria_percentual` decimal(5,2) DEFAULT NULL,
  `parceria_valor` decimal(15,2) DEFAULT NULL,
  `repasse_parceiro_habilitado` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(15) NOT NULL DEFAULT 'pendente',
  `recebido_em` date DEFAULT NULL,
  `recebimento_forma_id` int DEFAULT NULL,
  `recebimento_identificacao` varchar(120) DEFAULT NULL,
  `recebimento_conta_financeira_id` int DEFAULT NULL,
  `repasse_cliente_em` date DEFAULT NULL,
  `repasse_cliente_forma_id` int DEFAULT NULL,
  `repasse_cliente_conta_financeira_id` int DEFAULT NULL,
  `repasse_cliente_destino_tipo` varchar(15) DEFAULT NULL,
  `repasse_cliente_destino_snapshot` longtext,
  `repasse_cliente_observacao` text,
  `repasse_cliente_por` int DEFAULT NULL,
  `repasse_parceiro_em` date DEFAULT NULL,
  `repasse_parceiro_forma_id` int DEFAULT NULL,
  `repasse_parceiro_conta_financeira_id` int DEFAULT NULL,
  `repasse_parceiro_conta_id` int DEFAULT NULL,
  `repasse_parceiro_destino_tipo` varchar(15) DEFAULT NULL,
  `repasse_parceiro_destino_snapshot` longtext,
  `repasse_parceiro_observacao` text,
  `repasse_parceiro_por` int DEFAULT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_multa_parcela` (`parcela_id`),
  KEY `fk_multa_receb_forma` (`recebimento_forma_id`),
  KEY `fk_multa_repcli_forma` (`repasse_cliente_forma_id`),
  KEY `fk_multa_reppar_forma` (`repasse_parceiro_forma_id`),
  KEY `fk_multa_repcli_por` (`repasse_cliente_por`),
  KEY `fk_multa_reppar_por` (`repasse_parceiro_por`),
  KEY `idx_multa_receb_conta_financeira` (`recebimento_conta_financeira_id`),
  KEY `idx_multa_repcli_conta_financeira` (`repasse_cliente_conta_financeira_id`),
  KEY `idx_multa_reppar_conta_financeira` (`repasse_parceiro_conta_financeira_id`),
  KEY `fk_multa_criado_por` (`criado_por`),
  CONSTRAINT `fk_multa_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_parcela` FOREIGN KEY (`parcela_id`) REFERENCES `acordo_parcela` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_multa_receb_conta_financeira` FOREIGN KEY (`recebimento_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_receb_forma` FOREIGN KEY (`recebimento_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_repcli_conta_financeira` FOREIGN KEY (`repasse_cliente_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_repcli_forma` FOREIGN KEY (`repasse_cliente_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_repcli_por` FOREIGN KEY (`repasse_cliente_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_reppar_conta_financeira` FOREIGN KEY (`repasse_parceiro_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_reppar_forma` FOREIGN KEY (`repasse_parceiro_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_reppar_por` FOREIGN KEY (`repasse_parceiro_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2) Colunas novas nas tabelas que já existem (com os índices e chaves delas)
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_tipo')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_tipo` varchar(10) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_id')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_conta_id')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='multa_percentual')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `multa_percentual` decimal(5,2) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='recebimento_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `recebimento_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='recebimento_instituicao_origem_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `recebimento_instituicao_origem_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_conta_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_destino_snapshot')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_destino_snapshot` longtext', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_destino_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_destino_tipo` varchar(15) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_instituicao_destino_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_instituicao_destino_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_observacao')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_observacao` text', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_pessoa_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_pessoa_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_tipo` varchar(10) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_conta_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_destino_snapshot')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_destino_snapshot` longtext', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_destino_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_destino_tipo` varchar(15) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_instituicao_destino_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_instituicao_destino_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_observacao')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_observacao` text', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND COLUMN_NAME='profissao_id')=0, 'ALTER TABLE `advogados_freela` ADD COLUMN `profissao_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND COLUMN_NAME='conta_financeira_id')=0, 'ALTER TABLE `conta_corrente` ADD COLUMN `conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='forma_pagamento' AND COLUMN_NAME='uso_permitido')=0, 'ALTER TABLE `forma_pagamento` ADD COLUMN `uso_permitido` enum(''financeira'',''especie'',''ambos'') NOT NULL DEFAULT ''ambos''', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Índices e chaves ligados às colunas novas
SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_receb_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_receb_conta_financeira` (`recebimento_conta_financeira_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_repcli_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_repcli_conta_financeira` (`repasse_cliente_conta_financeira_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_reppar_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_reppar_conta_financeira` (`repasse_parceiro_conta_financeira_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_receb_instituicao_origem')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_receb_instituicao_origem` (`recebimento_instituicao_origem_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_repcli_instituicao_destino')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_repcli_instituicao_destino` (`repasse_cliente_instituicao_destino_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_reppar_instituicao_destino')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_reppar_instituicao_destino` (`repasse_parceiro_instituicao_destino_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_receb_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_receb_conta_financeira` FOREIGN KEY (`recebimento_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_repcli_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_repcli_conta_financeira` FOREIGN KEY (`repasse_cliente_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_reppar_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_reppar_conta_financeira` FOREIGN KEY (`repasse_parceiro_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND INDEX_NAME='idx_cc_conta_financeira')=0, 'ALTER TABLE `conta_corrente` ADD KEY `idx_cc_conta_financeira` (`conta_financeira_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND CONSTRAINT_NAME='fk_cc_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `conta_corrente` ADD CONSTRAINT `fk_cc_conta_financeira` FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND INDEX_NAME='idx_freela_profissao')=0, 'ALTER TABLE `advogados_freela` ADD KEY `idx_freela_profissao` (`profissao_id`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND CONSTRAINT_NAME='fk_freela_profissao' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `advogados_freela` ADD CONSTRAINT `fk_freela_profissao` FOREIGN KEY (`profissao_id`) REFERENCES `profissao` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
