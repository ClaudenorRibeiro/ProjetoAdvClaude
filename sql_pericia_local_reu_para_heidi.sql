-- Rode este script manualmente no HeidiSQL.
-- Ele cria a tabela que registra os reus escolhidos como locais da pericia.
-- Nao execute pelo Codex.

CREATE TABLE IF NOT EXISTS `pericia_local_reu` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pericia_id` int NOT NULL,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pericia_local_reu` (`pericia_id`, `tipo_pessoa`, `pessoa_id`),
  KEY `idx_pericia_local_reu_pericia` (`pericia_id`),
  KEY `idx_pericia_local_reu_pessoa` (`tipo_pessoa`, `pessoa_id`),
  CONSTRAINT `fk_pericia_local_reu_pericia`
    FOREIGN KEY (`pericia_id`) REFERENCES `pericia` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
