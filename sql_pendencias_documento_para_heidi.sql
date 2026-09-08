-- ============================================================================
-- MÓDULO "PENDÊNCIAS DE DOCUMENTOS" — estrutura inicial
-- Banco: usar o banco já selecionado no HeidiSQL | MySQL 8 | rodar pelo HeidiSQL
-- ----------------------------------------------------------------------------
-- Controla clientes (Pessoa Física OU Jurídica) que fizeram o cadastro mas
-- ainda DEVEM documentos, deixando a abertura do processo suspensa.
-- NÃO depende de existir processo ou pasta — a pendência mora no cliente.
--
-- Cria 3 tabelas novas:
--   1. tipo_documento_pendencia   — catálogo editável de documentos
--   2. pendencia_documento        — a pendência aberta de um cliente
--   3. pendencia_documento_item   — os N documentos escolhidos naquela pendência
--
-- SEGURANÇA:
--   - Reaplicável: CREATE TABLE IF NOT EXISTS + INSERT IGNORE nas sementes.
--     Rodar de novo na mesma instância não altera nada e não gera erro.
--   - Nenhum dado existente é lido, apagado ou alterado.
--   - CREATE TABLE faz COMMIT implícito no MySQL — por isso não há
--     BEGIN/ROLLBACK envolvendo o DDL; cada objeto é independente.
--   - Rodar 1x em cada instância (local -> testar -> as 2 AWS).
-- ============================================================================

SELECT CONCAT('Banco selecionado: ', DATABASE()) AS resultado;

-- ============================================================================
-- 1) CATÁLOGO DE TIPOS DE DOCUMENTO
-- ============================================================================
CREATE TABLE IF NOT EXISTS `tipo_documento_pendencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tipo_doc_pend_nome` (`nome`),
  KEY `idx_tipo_doc_pend_ativo_nome` (`ativo`,`nome`),
  KEY `fk_tipo_doc_pend_criado_por` (`criado_por`),
  KEY `fk_tipo_doc_pend_alterado_por` (`alterado_por`),
  CONSTRAINT `fk_tipo_doc_pend_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tipo_doc_pend_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sementes — só entram se ainda não existir um tipo com o mesmo nome (INSERT IGNORE).
-- O usuário pode renomear/desativar/adicionar livremente depois.
INSERT IGNORE INTO `tipo_documento_pendencia` (`nome`) VALUES
  ('RG'),
  ('CPF'),
  ('Comprovante de residência'),
  ('Procuração assinada'),
  ('Contrato de honorários assinado'),
  ('Carteira de trabalho (CTPS)'),
  ('Documentos do INSS / CNIS'),
  ('Contrato social'),
  ('Cartão CNPJ'),
  ('Documento de identificação do representante legal');

-- ============================================================================
-- 2) PENDÊNCIA DO CLIENTE
--    tipo_pessoa + pessoa_id: mesmo padrão polimórfico de pericia_local_reu
--    (sem FK em pessoa_id, pois aponta ora p/ pessoas_fisicas, ora p/ pessoas_juridicas).
-- ============================================================================
CREATE TABLE IF NOT EXISTS `pendencia_documento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
  `responsavel_id` int NOT NULL,
  `avisar_sino` tinyint(1) NOT NULL DEFAULT '1',
  `avisar_email` tinyint(1) NOT NULL DEFAULT '0',
  `data_aviso` date DEFAULT NULL,
  `avisado_em` datetime DEFAULT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `status` enum('aberta','resolvida','cancelada') NOT NULL DEFAULT 'aberta',
  `resolvido_em` datetime DEFAULT NULL,
  `resolvido_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  `alterado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pend_doc_status` (`status`),
  KEY `idx_pend_doc_pessoa` (`tipo_pessoa`,`pessoa_id`),
  KEY `idx_pend_doc_aviso` (`status`,`data_aviso`,`avisado_em`),
  KEY `fk_pend_doc_responsavel` (`responsavel_id`),
  KEY `fk_pend_doc_criado_por` (`criado_por`),
  KEY `fk_pend_doc_alterado_por` (`alterado_por`),
  KEY `fk_pend_doc_resolvido_por` (`resolvido_por`),
  CONSTRAINT `fk_pend_doc_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pend_doc_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pend_doc_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pend_doc_resolvido_por` FOREIGN KEY (`resolvido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- 3) ITENS (documentos) DA PENDÊNCIA
--    ON DELETE CASCADE: apagar a pendência apaga os itens (sem órfãos).
--    FK do tipo é RESTRICT (padrão): um tipo em uso não pode ser apagado
--    fisicamente — o app faz soft-delete (ativo = 0).
-- ============================================================================
CREATE TABLE IF NOT EXISTS `pendencia_documento_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pendencia_id` int NOT NULL,
  `tipo_documento_id` int NOT NULL,
  `recebido` tinyint(1) NOT NULL DEFAULT '0',
  `data_recebimento` date DEFAULT NULL,
  `recebido_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pend_doc_item` (`pendencia_id`,`tipo_documento_id`),
  KEY `idx_pend_doc_item_tipo` (`tipo_documento_id`),
  KEY `fk_pend_doc_item_recebido_por` (`recebido_por`),
  CONSTRAINT `fk_pend_doc_item_pendencia` FOREIGN KEY (`pendencia_id`) REFERENCES `pendencia_documento` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pend_doc_item_tipo` FOREIGN KEY (`tipo_documento_id`) REFERENCES `tipo_documento_pendencia` (`id`),
  CONSTRAINT `fk_pend_doc_item_recebido_por` FOREIGN KEY (`recebido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- 4) DIAGNÓSTICO FINAL — as 3 tabelas devem retornar 1 e o catálogo >= 10.
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tipo_documento_pendencia')   AS tabela_tipo_documento_pendencia_ok,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pendencia_documento')        AS tabela_pendencia_documento_ok,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pendencia_documento_item')   AS tabela_pendencia_documento_item_ok,
  (SELECT COUNT(*) FROM `tipo_documento_pendencia`)                                AS tipos_no_catalogo;

-- ============================================================================
-- ROLLBACK MANUAL (somente se for realmente necessário desfazer)
-- Rode na ordem abaixo (as FKs exigem apagar os filhos primeiro).
--
-- DROP TABLE IF EXISTS `pendencia_documento_item`;
-- DROP TABLE IF EXISTS `pendencia_documento`;
-- DROP TABLE IF EXISTS `tipo_documento_pendencia`;
-- ============================================================================
