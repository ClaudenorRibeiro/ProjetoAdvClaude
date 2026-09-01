-- ============================================================
-- Atribuir publicações a usuários (status "tratada / pendente" POR PESSOA)
-- Rodar primeiro no banco LOCAL pelo HeidiSQL.
-- Depois de testar localmente, rodar nas instâncias AWS (Antônio e Erick).
-- Rode UMA vez por instância. Se uma coluna/índice já existir, o HeidiSQL
-- acusa erro naquela linha — basta pular essa linha e seguir as demais.
-- ============================================================

START TRANSACTION;

-- Colunas novas na tabela de vínculo publicação <-> usuário.
-- Cada linha passa a carregar: quem atribuiu, quando, e o status
-- (tratada / pendente) daquele usuário para aquela publicação.
ALTER TABLE `publicacao_usuario`
  ADD COLUMN `atribuida_por`   int          DEFAULT NULL,
  ADD COLUMN `atribuida_em`    datetime     DEFAULT NULL,
  ADD COLUMN `tratada`         tinyint(1)   NOT NULL DEFAULT 0,
  ADD COLUMN `tratada_em`      datetime     DEFAULT NULL,
  ADD COLUMN `tratada_por`     int          DEFAULT NULL,
  ADD COLUMN `motivo_sem_acao` varchar(500) DEFAULT NULL;

-- Impede atribuir a mesma pessoa duas vezes na mesma publicação.
-- (Se esta linha falhar por "Duplicate entry", rode antes o DELETE do bloco
--  OPCIONAL lá embaixo e depois execute esta linha de novo.)
ALTER TABLE `publicacao_usuario`
  ADD UNIQUE KEY `uq_pu_pub_user` (`publicacao_id`, `usuario_id`);

-- Índices e chaves estrangeiras das colunas novas (quem atribuiu / quem tratou).
-- ON DELETE SET NULL: se o usuário for excluído, a linha da atribuição não some,
-- só perde a referência de "quem atribuiu / quem tratou".
ALTER TABLE `publicacao_usuario`
  ADD KEY `idx_pu_atribuida_por` (`atribuida_por`),
  ADD KEY `idx_pu_tratada_por`   (`tratada_por`),
  ADD CONSTRAINT `fk_pu_atribuida_por` FOREIGN KEY (`atribuida_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pu_tratada_por`   FOREIGN KEY (`tratada_por`)   REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

COMMIT;

-- ------------------------------------------------------------
-- OPCIONAL — limpeza de linhas antigas de teste
-- ------------------------------------------------------------
-- A tabela publicacao_usuario era usada por um recurso antigo ("direcionar"),
-- que foi retirado da tela. Se o SELECT abaixo trouxer linhas, elas são
-- resíduo daquele teste e apareceriam como "publicação pendente" para os
-- usuários citados. Confira e, se não quiser nenhuma delas, rode o DELETE.
--
--   SELECT * FROM `publicacao_usuario`;
--   DELETE FROM `publicacao_usuario`;
