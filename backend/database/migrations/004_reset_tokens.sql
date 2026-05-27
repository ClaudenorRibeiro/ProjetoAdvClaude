-- ============================================================
-- MIGRAÇÃO 004 — Tabela de tokens para redefinição de senha
-- Cada token tem validade de 1 hora e só pode ser usado uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT         NOT NULL,
  token       VARCHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME    NOT NULL,
  usado       TINYINT(1)  NOT NULL DEFAULT 0,
  criado_em   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
