-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: VIGILÂNCIA DO PROCESSO (criado em 05/11/2026, pedido do usuário;
--   porte da mesma funcionalidade já feita no NovoJud-saas).
-- PARA QUE SERVE: a Vigilância é um lembrete SEM DATA que fica de olho num processo (ex.: "Recurso adesivo" — o escritório
--   não quer recorrer da sentença, mas precisa ser avisado se a OUTRA parte recorrer). Enquanto está "aguardando", trava
--   arquivar e excluir o processo. O sistema avisa no sino (e, quando houver, no celular) quando uma publicação nova ou um
--   andamento novo do DataJud parece falar de recurso num processo vigiado — é só um alerta, nunca cria nada sozinho.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir — este
--   script NÃO depende de nenhuma versão numerada do banco, pode rodar em qualquer banco que já tenha as tabelas tblproc,
--   usuarios e logs_auditoria). Pode rodar quantas vezes quiser: só cria o que ainda não existe.
-- O QUE FAZ: cria 3 tabelas — `vigilancia_tipo` (os tipos que o escritório cadastra; já nasce com "Recurso adesivo"),
--   `vigilancia` (a vigilância em si, ligada a um processo e a um tipo) e `vigilancia_usuario` (quem é avisado). Não apaga
--   nem altera nenhum dado existente.
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

SET @tinha_vigilancia_tipo := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vigilancia_tipo'), 0);
SET @tinha_vigilancia := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vigilancia'), 0);
SET @tinha_vigilancia_usuario := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vigilancia_usuario'), 0);

SET @sql := IF(@ok = 1, 'CREATE TABLE IF NOT EXISTS `vigilancia_tipo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `nome_ativo` varchar(100) GENERATED ALWAYS AS (IF(`ativo` = 1, `nome`, NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vigtipo_nome_ativo` (`nome_ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT=''tipos de vigilancia do processo (ex.: Recurso adesivo)'';', 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@ok = 1, 'CREATE TABLE IF NOT EXISTS `vigilancia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_id` int NOT NULL,
  `observacao` varchar(1000) DEFAULT NULL,
  `situacao` varchar(12) NOT NULL DEFAULT ''aguardando'',
  `criado_por` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `encerrada_por` int DEFAULT NULL,
  `encerrada_em` datetime DEFAULT NULL,
  `motivo_encerramento` varchar(300) DEFAULT NULL,
  `aberta_chave` varchar(30) GENERATED ALWAYS AS (IF(`situacao` = ''aguardando'', CONCAT(`processo_id`, ''-'', `tipo_id`), NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vig_aberta` (`aberta_chave`),
  KEY `idx_vig_processo` (`processo_id`),
  KEY `idx_vig_tipo` (`tipo_id`),
  CONSTRAINT `ck_vig_situacao` CHECK (`situacao` IN (''aguardando'', ''encerrada'')),
  CONSTRAINT `fk_vig_processo` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `fk_vig_tipo` FOREIGN KEY (`tipo_id`) REFERENCES `vigilancia_tipo` (`id`),
  CONSTRAINT `fk_vig_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_vig_encerrada_por` FOREIGN KEY (`encerrada_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT=''lembrete sem data que fica de olho num processo (ex.: recurso adesivo)'';', 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@ok = 1, 'CREATE TABLE IF NOT EXISTS `vigilancia_usuario` (
  `vigilancia_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`vigilancia_id`, `usuario_id`),
  KEY `idx_vigusu_usuario` (`usuario_id`),
  CONSTRAINT `fk_vigusu_vigilancia` FOREIGN KEY (`vigilancia_id`) REFERENCES `vigilancia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vigusu_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT=''quem e avisado por cada vigilancia'';', 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Todo escritório (este sistema é de um só) ganha o tipo "Recurso adesivo", só se ainda não tiver nenhum tipo cadastrado.
-- A conferência "já existe algum tipo?" fica DENTRO do texto preparado (nunca solta na SET): com @ok = 0 (banco errado),
-- a tabela vigilancia_tipo pode nem existir, e uma referência a ela fora de PREPARE pararia o script com erro de sintaxe.
SET @sql := IF(@ok = 1,
 'INSERT INTO vigilancia_tipo (nome) SELECT ''Recurso adesivo'' FROM (SELECT 1 AS x) t WHERE NOT EXISTS (SELECT 1 FROM vigilancia_tipo);',
 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  IF(@ok = 0, @motivo,
     CONCAT('PRONTO — vigilancia_tipo ', IF(@tinha_vigilancia_tipo = 1, 'já existia', 'criada'),
            '; vigilancia ', IF(@tinha_vigilancia = 1, 'já existia', 'criada'),
            '; vigilancia_usuario ', IF(@tinha_vigilancia_usuario = 1, 'já existia', 'criada'), '.')) AS resultado;
