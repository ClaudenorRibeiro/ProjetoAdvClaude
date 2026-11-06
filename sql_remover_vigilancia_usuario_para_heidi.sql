-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: REMOVE a tabela VIGILANCIA_USUARIO (criado em 06/11/2026,
--   pedido do usuário — redesenho da Vigilância do processo: o aviso deixou de ser seletivo [por usuário marcado] e
--   virou sempre visível para quem tem permissão de ver Vigilâncias, então ninguém mais precisa ser escolhido).
-- PARA QUE SERVE: apaga a tabela `vigilancia_usuario` (só guardava "quem deve ser avisado" de cada vigilância; a
--   funcionalidade da Vigilância em si — vigilancia_tipo e vigilancia — continua intacta e não é tocada).
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir —
--   este script NÃO depende de nenhuma versão numerada do banco). Pode rodar quantas vezes quiser: se a tabela já
--   não existir, só confirma que está tudo certo e não faz nada.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ...". Se disser "ABORTADO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
SET @db := DATABASE();

SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('tblproc', 'usuarios', 'logs_auditoria'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @ok := IF(@db IS NOT NULL AND @n_chave = 3 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%', 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 3, 'ABORTADO: este banco NAO parece ser o do sistema (faltam as tabelas tblproc/usuarios/logs_auditoria). Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.')));

SET @tinha := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vigilancia_usuario'), 0);

SET @sql := IF(@ok = 1, 'DROP TABLE IF EXISTS `vigilancia_usuario`;', 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  IF(@ok = 0, @motivo,
     CONCAT('PRONTO — vigilancia_usuario ', IF(@tinha = 1, 'removida', 'já não existia'), '.')) AS resultado;
