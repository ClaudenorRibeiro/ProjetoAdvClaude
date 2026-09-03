-- ============================================================
-- Campo "Obs." (observações livres) na AUDIÊNCIA
-- ------------------------------------------------------------
-- Coluna nova, opcional (NULL). Audiências antigas ficam com NULL.
-- Preenchida à mão pelo usuário OU já vem com o corpo da sugestão
-- quando a audiência é criada a partir de uma Publicação.
--
-- Rodar 1x em CADA instância, nesta ordem:
--   1) LOCAL  (sistema_advocacia)  -> testar
--   2) AWS Antônio (sistema_advocacia)
--   3) AWS Erick   (erick_adv)
--
-- Obs.: no MySQL o ALTER TABLE faz commit implícito; o START/COMMIT
-- abaixo é só para manter o padrão dos outros scripts do projeto.
-- ============================================================

START TRANSACTION;

ALTER TABLE `audiencia`
  ADD COLUMN `observacoes` TEXT NULL AFTER `local`;

COMMIT;

-- ------------------------------------------------------------
-- ROLLBACK (se precisar desfazer):
-- ALTER TABLE `audiencia` DROP COLUMN `observacoes`;
-- ------------------------------------------------------------
