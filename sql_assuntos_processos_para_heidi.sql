-- ============================================================
-- Assuntos dos processos
-- Rodar primeiro no banco LOCAL pelo HeidiSQL.
-- Depois de testar localmente, rodar nas instâncias AWS.
-- ============================================================

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `tblassuntoproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tblassuntoproc_nome` (`nome`),
  KEY `idx_tblassuntoproc_ativo_nome` (`ativo`, `nome`),
  KEY `idx_tblassuntoproc_criado_por` (`criado_por`),
  KEY `idx_tblassuntoproc_alterado_por` (`alterado_por`),
  CONSTRAINT `tblassuntoproc_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblassuntoproc_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `processo_assunto` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `assunto_id` int NOT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_processo_assunto` (`processo_id`, `assunto_id`),
  KEY `idx_processo_assunto_assunto` (`assunto_id`),
  KEY `idx_processo_assunto_criado_por` (`criado_por`),
  CONSTRAINT `processo_assunto_ibfk_1` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `processo_assunto_ibfk_2` FOREIGN KEY (`assunto_id`) REFERENCES `tblassuntoproc` (`id`),
  CONSTRAINT `processo_assunto_ibfk_3` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

COMMIT;
