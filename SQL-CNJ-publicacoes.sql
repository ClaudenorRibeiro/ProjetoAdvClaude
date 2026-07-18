-- ============================================================
-- CNJ / DJEN  —  colunas na tabela de publicacoes + linha de integracao
-- ------------------------------------------------------------
-- Rode UMA vez no banco de cada escritorio (LOCAL e depois AWS), pelo HeidiSQL.
-- Seguro para bancos que JA tem dados: as colunas novas nascem VAZIAS nas
-- publicacoes da AASP e nao mudam nada do que ja existe.
-- ============================================================

-- 1) Colunas que o CNJ usa (ficam NULL para as publicacoes da AASP).
ALTER TABLE `publicacoes`
  ADD COLUMN `id_cnj`   bigint      DEFAULT NULL AFTER `fonte`,
  ADD COLUMN `tribunal` varchar(20) DEFAULT NULL AFTER `numero_processo`,
  ADD COLUMN `hash_cnj` varchar(60) DEFAULT NULL AFTER `texto_hash`;

-- 2) Trava que impede importar a mesma comunicacao do CNJ duas vezes.
--    (Nas linhas da AASP, id_cnj e NULL e o MySQL permite varios NULLs — nao conflita.)
ALTER TABLE `publicacoes`
  ADD UNIQUE KEY `uq_pub_cnj` (`fonte`,`id_cnj`);

-- 3) Cria a linha da integracao CNJ (o "Salvar" da tela so faz UPDATE;
--    sem esta linha, a configuracao do CNJ nao seria gravada).
--    Idempotente: se ja existir a linha 'cnj', nao faz nada.
INSERT INTO `configuracoes_integracoes` (`modulo`, `ativo`, `configuracoes`)
SELECT 'cnj', 0, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `configuracoes_integracoes` WHERE `modulo` = 'cnj');
