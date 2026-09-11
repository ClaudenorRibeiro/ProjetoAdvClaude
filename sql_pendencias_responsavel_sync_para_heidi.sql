-- ============================================================================
-- MÓDULO "PENDÊNCIAS DE DOCUMENTOS" — SINCRONIZAÇÃO 10/09/2026
-- Vários responsáveis por pendência, cada um com a SUA data de aviso.
-- Banco: usar o banco já selecionado no HeidiSQL | MySQL 8 | rodar pelo HeidiSQL
-- ----------------------------------------------------------------------------
-- ESTADO ENCONTRADO nos dumps das 3 instâncias (10/09/2026):
--   * As 3 já têm  tipo_documento_pendencia, pendencia_documento e
--     pendencia_documento_item  na estrutura ORIGINAL (08/09).
--   * pendencia_documento AINDA tem  responsavel_id / avisar_sino /
--     avisar_email / data_aviso / avisado_em  e os índices
--     idx_pend_doc_aviso  e  fk_pend_doc_responsavel.
--   * pendencia_documento_responsavel  NÃO existe em nenhuma.
--   * DADOS: LOCAL e AWS-Erick sem nenhuma pendência; AWS-Antônio COM
--     pendências de teste — por isso o passo 2 MIGRA o responsável atual
--     para a tabela nova ANTES de apagar as colunas.
--
-- O QUE ESTE SCRIPT FAZ (o mesmo nas 3; pode rodar de novo sem risco):
--   1. Cria pendencia_documento_responsavel (se não existir).
--   2. Copia o responsável atual de cada pendência para a tabela nova
--      (mesma data de aviso, mesmos canais, mesmo "já avisei").
--   3. Remove de pendencia_documento a FK, os 2 índices e as 5 colunas
--      antigas de responsável.
--
-- SEGURANÇA:
--   * IDEMPOTENTE: cada passo confere o estado em information_schema antes
--     de agir. Rodar 2x não dá erro e não duplica linha.
--   * Nenhum dado de pendência é perdido: o responsável de cada pendência
--     vira 1 linha em pendencia_documento_responsavel.
--   * CREATE/ALTER fazem COMMIT implícito no MySQL — por isso não há
--     BEGIN/ROLLBACK em volta do DDL. O passo 2 é um único INSERT ... SELECT.
--   * Rodar 1x em cada instância:  LOCAL -> testar -> AWS-Antônio -> AWS-Erick.
--   * Serve também para uma instância NOVA (os CREATE ... IF NOT EXISTS
--     abaixo montam as 4 tabelas do zero).
-- ============================================================================

SELECT CONCAT('Banco selecionado: ', DATABASE()) AS resultado;

-- ============================================================================
-- 0) BASE — só cria se faltar (instância nova). Nas 3 atuais é no-op.
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

CREATE TABLE IF NOT EXISTS `pendencia_documento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
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
  KEY `fk_pend_doc_criado_por` (`criado_por`),
  KEY `fk_pend_doc_alterado_por` (`alterado_por`),
  KEY `fk_pend_doc_resolvido_por` (`resolvido_por`),
  CONSTRAINT `fk_pend_doc_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pend_doc_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pend_doc_resolvido_por` FOREIGN KEY (`resolvido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
-- 1) TABELA NOVA — RESPONSÁVEIS PELA COBRANÇA (um ou vários por pendência)
--    Cada usuário: seus canais (sino/e-mail), sua data de aviso e seu
--    controle de "já avisei" (avisado_em). O cron avisa cada um 1x, na
--    data dele.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `pendencia_documento_responsavel` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pendencia_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `avisar_sino` tinyint(1) NOT NULL DEFAULT '1',
  `avisar_email` tinyint(1) NOT NULL DEFAULT '0',
  `data_aviso` date DEFAULT NULL,
  `avisado_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pend_doc_resp` (`pendencia_id`,`usuario_id`),
  KEY `idx_pend_doc_resp_aviso` (`data_aviso`,`avisado_em`),
  KEY `fk_pend_doc_resp_usuario` (`usuario_id`),
  KEY `fk_pend_doc_resp_criado_por` (`criado_por`),
  CONSTRAINT `fk_pend_doc_resp_pendencia` FOREIGN KEY (`pendencia_id`) REFERENCES `pendencia_documento` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pend_doc_resp_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pend_doc_resp_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- 2) MIGRAÇÃO — responsável atual de cada pendência  ->  linha na tabela nova
--    Só roda se a coluna antiga ainda existir; não duplica (NOT EXISTS).
-- ============================================================================
SELECT COUNT(*) INTO @tem_col_resp
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'pendencia_documento'
   AND COLUMN_NAME = 'responsavel_id';

SET @sql := IF(@tem_col_resp > 0,
  'INSERT INTO `pendencia_documento_responsavel`
     (`pendencia_id`,`usuario_id`,`avisar_sino`,`avisar_email`,`data_aviso`,`avisado_em`,`criado_em`,`criado_por`)
   SELECT pd.`id`, pd.`responsavel_id`, pd.`avisar_sino`, pd.`avisar_email`,
          pd.`data_aviso`, pd.`avisado_em`, pd.`criado_em`, pd.`criado_por`
     FROM `pendencia_documento` pd
    WHERE pd.`responsavel_id` IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM `pendencia_documento_responsavel` r
                       WHERE r.`pendencia_id` = pd.`id`
                         AND r.`usuario_id` = pd.`responsavel_id`)',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; SET @migrados := ROW_COUNT(); DEALLOCATE PREPARE s;
SELECT @migrados AS responsaveis_migrados_nesta_execucao;

-- ============================================================================
-- 3) LIMPEZA DA pendencia_documento — remove o que virou tabela nova.
--    Cada passo confere antes; rodar de novo é no-op (DO 0).
-- ============================================================================

-- 3.1) FK  fk_pend_doc_responsavel
SELECT COUNT(*) INTO @tem
  FROM information_schema.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pendencia_documento'
   AND CONSTRAINT_NAME = 'fk_pend_doc_responsavel' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @sql := IF(@tem > 0, 'ALTER TABLE `pendencia_documento` DROP FOREIGN KEY `fk_pend_doc_responsavel`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.2) índice que sobra da FK
SELECT COUNT(*) INTO @tem
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pendencia_documento' AND INDEX_NAME = 'fk_pend_doc_responsavel';
SET @sql := IF(@tem > 0, 'ALTER TABLE `pendencia_documento` DROP INDEX `fk_pend_doc_responsavel`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.3) índice  idx_pend_doc_aviso (status, data_aviso, avisado_em)
SELECT COUNT(*) INTO @tem
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pendencia_documento' AND INDEX_NAME = 'idx_pend_doc_aviso';
SET @sql := IF(@tem > 0, 'ALTER TABLE `pendencia_documento` DROP INDEX `idx_pend_doc_aviso`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.4) colunas antigas — uma a uma, cada uma conferida
SELECT COUNT(*) INTO @tem FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento' AND COLUMN_NAME='avisado_em';
SET @sql := IF(@tem>0, 'ALTER TABLE `pendencia_documento` DROP COLUMN `avisado_em`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT COUNT(*) INTO @tem FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento' AND COLUMN_NAME='data_aviso';
SET @sql := IF(@tem>0, 'ALTER TABLE `pendencia_documento` DROP COLUMN `data_aviso`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT COUNT(*) INTO @tem FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento' AND COLUMN_NAME='avisar_email';
SET @sql := IF(@tem>0, 'ALTER TABLE `pendencia_documento` DROP COLUMN `avisar_email`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT COUNT(*) INTO @tem FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento' AND COLUMN_NAME='avisar_sino';
SET @sql := IF(@tem>0, 'ALTER TABLE `pendencia_documento` DROP COLUMN `avisar_sino`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT COUNT(*) INTO @tem FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento' AND COLUMN_NAME='responsavel_id';
SET @sql := IF(@tem>0, 'ALTER TABLE `pendencia_documento` DROP COLUMN `responsavel_id`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ============================================================================
-- 4) DIAGNÓSTICO FINAL
--    Esperado nas 3 instâncias:
--      tabela_responsavel_ok        = 1
--      colunas_antigas_restantes    = 0
--      total_responsaveis          >= total_pendencias
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento_responsavel')   AS tabela_responsavel_ok,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento'
       AND COLUMN_NAME IN ('responsavel_id','avisar_sino','avisar_email','data_aviso','avisado_em')) AS colunas_antigas_restantes,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pendencia_documento'
       AND INDEX_NAME IN ('idx_pend_doc_aviso','fk_pend_doc_responsavel'))             AS indices_antigos_restantes,
  (SELECT COUNT(*) FROM `pendencia_documento`)              AS total_pendencias,
  (SELECT COUNT(*) FROM `pendencia_documento_responsavel`)  AS total_responsaveis;

-- ============================================================================
-- ROLLBACK MANUAL (só se precisar MESMO voltar atrás)
--   As colunas antigas NÃO voltam com dados — recrie a coluna e recopie de
--   pendencia_documento_responsavel se for o caso. Para desfazer só a tabela nova:
--
--   DROP TABLE IF EXISTS `pendencia_documento_responsavel`;
--
--   E, para repor as colunas antigas (vazias):
--   ALTER TABLE `pendencia_documento`
--     ADD COLUMN `responsavel_id` int NOT NULL AFTER `pessoa_id`,
--     ADD COLUMN `avisar_sino` tinyint(1) NOT NULL DEFAULT '1' AFTER `responsavel_id`,
--     ADD COLUMN `avisar_email` tinyint(1) NOT NULL DEFAULT '0' AFTER `avisar_sino`,
--     ADD COLUMN `data_aviso` date DEFAULT NULL AFTER `avisar_email`,
--     ADD COLUMN `avisado_em` datetime DEFAULT NULL AFTER `data_aviso`,
--     ADD KEY `idx_pend_doc_aviso` (`status`,`data_aviso`,`avisado_em`),
--     ADD KEY `fk_pend_doc_responsavel` (`responsavel_id`),
--     ADD CONSTRAINT `fk_pend_doc_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`);
-- ============================================================================
