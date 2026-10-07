-- IMPORTANTE — NÃO APAGAR. SCRIPT ÚNICO de atualização do banco das instâncias de produção (AWS-Antônio e AWS-Erick).
-- Substitui TODOS estes scripts antigos: sql_relatorios_fase1/fase6/fase7, sql_atualizar_financeiro,
-- sql_contas_bancarias_pessoas e sql_remover_area_direito_da_pasta (os arquivos antigos ficam só como histórico).
-- ============================================================================================================
-- COMO USAR (nesta ordem; o script confere tudo sozinho e pode ser rodado quantas vezes quiser):
--   1) Fora do horário de uso: parar o sistema na instância (ninguém usando) e fazer o BACKUP do banco
--      (HeidiSQL: Exportar banco como SQL). Apagar uma coluna não tem volta.
--   2) HeidiSQL: abrir a conexão da instância, SELECIONAR O BANCO DO SISTEMA (clicar no nome dele na lista da esquerda;
--      o nome é diferente em cada instância) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a aba de resultado: a coluna "situacao" deve dizer "PRONTO ...", e as colunas de "faltando" devem ser 0.
--      Se disser "ABORTADO" ou "ATENCAO", nada de errado foi feito no banco: me envie a linha do resultado.
--   5) SÓ DEPOIS de "PRONTO": atualizar o código do sistema e iniciar de novo.
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ (só cria o que falta; não altera nem apaga dado nenhum, EXCETO o item e):
--   a) Cria as tabelas: instituicao_financeira, conta_financeira, contas_bancarias_pf, contas_bancarias_pj, acordo_parcela_multa,
--      relatorio_modelo, relatorio_modelo_usuario, relatorio_agendamento.
--   b) Acrescenta 23 colunas do Financeiro (acordo, acordo_parcela, conta_corrente, forma_pagamento, advogados_freela) com índices e chaves.
--   c) Acrescenta os limites de relatórios (configuracoes_escritorio.max_relatorios_por_usuario e usuarios.max_relatorios).
--   d) Registra a versão na tabela controle_versao_banco (número 1), só se tudo terminar certo.
--   e) APAGA a coluna antiga tblpasta.area_direito (decisão do usuário, 04/10/2026: a área é o "Tipo" do processo).
--      O sistema ANTIGO quebra sem essa coluna; por isso o passo 1 manda parar o sistema e o passo 5 manda atualizar o código logo depois.
--   f) AUMENTA modelo_documento.destino de varchar(20) para varchar(40) (decisão do usuário, 07/10/2026): os tipos "Recibo consolidado do
--      acordo: cliente/parceria" (recibo_acordo_cliente = 21 letras, recibo_acordo_parceria = 22) não cabiam em 20. Só aumenta o tamanho:
--      nenhum modelo existente é alterado. Se a coluna já tiver 40 ou mais, não faz nada.
-- SEGURANÇA:
--   * Antes de tudo confere: há um banco selecionado, ele tem as tabelas principais do sistema, o MySQL é 8.0.16 ou mais novo
--     (não aceita MariaDB) e tem a collation do sistema. Se algo não bater, NÃO faz nada e avisa.
--   * Cada passo olha o que já existe antes de criar: rodar de novo não duplica nem estraga nada.
--   * CREATE/ALTER fazem COMMIT automático no MySQL (não há ROLLBACK): o caminho de volta é o backup do passo 1.
-- ============================================================================================================
SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','tblpasta','tblproc',
                                       'acordo','acordo_parcela','conta_corrente','forma_pagamento','advogados_freela','profissao'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @e_mariadb := IF(VERSION() LIKE '%MariaDB%', 1, 0);
SET @n_coll := (SELECT COUNT(*) FROM information_schema.COLLATIONS WHERE COLLATION_NAME = 'utf8mb4_0900_ai_ci');
SET @ok := IF(@db IS NOT NULL AND @n_chave = 12 AND @mysql_num >= 80016 AND @e_mariadb = 0 AND @n_coll = 1, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 12, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas principais). Selecione o banco certo e rode de novo. Nada foi alterado.',
                  IF(@e_mariadb = 1 OR @mysql_num < 80016, 'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser MySQL 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.',
                     'ABORTADO: este servidor nao tem a collation utf8mb4_0900_ai_ci. Nada foi alterado - avise o suporte.'))));

-- ---------- 1) TABELAS NOVAS (só cria se ainda não existir; dependências na ordem certa)
-- instituicao_financeira: Financeiro
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `instituicao_financeira` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instituicao_financeira_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- conta_financeira: Financeiro
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `conta_financeira` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instituicao_financeira_id` int DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT ''0'',
  `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conta_financeira_nome` (`nome`),
  KEY `idx_conta_financeira_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_conta_financeira_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- contas_bancarias_pf: Contas bancárias das pessoas
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `contas_bancarias_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT ''corrente ou poupanca'',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''0 = conta da propria pessoa; 1 = conta de outra pessoa (autorizacao)'',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT ''0'',
  `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpf_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpf_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpf_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpf_tipo` CHECK ((`tipo` in (_utf8mb4''corrente'',_utf8mb4''poupanca'')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- contas_bancarias_pj: Contas bancárias das pessoas
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `contas_bancarias_pj` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT ''corrente ou poupanca'',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''0 = conta da propria empresa; 1 = conta de outra pessoa/empresa (autorizacao)'',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT ''0'',
  `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpj_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpj_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpj_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpj_tipo` CHECK ((`tipo` in (_utf8mb4''corrente'',_utf8mb4''poupanca'')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- acordo_parcela_multa: Financeiro (multa por atraso)
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `acordo_parcela_multa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `parcela_id` int NOT NULL,
  `percentual_juiz` decimal(5,2) DEFAULT NULL,
  `vencimento` date NOT NULL,
  `valor_bruto` decimal(15,2) NOT NULL,
  `honor_tipo` varchar(10) NOT NULL DEFAULT ''percent'',
  `honor_percentual` decimal(5,2) DEFAULT NULL,
  `honor_valor` decimal(15,2) NOT NULL DEFAULT ''0.00'',
  `valor_liquido` decimal(15,2) NOT NULL DEFAULT ''0.00'',
  `repasse_cliente_habilitado` tinyint(1) NOT NULL DEFAULT ''0'',
  `repasse_cliente_tipo` varchar(10) DEFAULT NULL,
  `repasse_cliente_pessoa_id` int DEFAULT NULL,
  `repasse_cliente_conta_id` int DEFAULT NULL,
  `parceria_pessoa_tipo` varchar(20) DEFAULT NULL,
  `parceria_pessoa_id` int DEFAULT NULL,
  `parceria_tipo` varchar(10) DEFAULT NULL,
  `parceria_percentual` decimal(5,2) DEFAULT NULL,
  `parceria_valor` decimal(15,2) DEFAULT NULL,
  `repasse_parceiro_habilitado` tinyint(1) NOT NULL DEFAULT ''0'',
  `status` varchar(15) NOT NULL DEFAULT ''pendente'',
  `recebido_em` date DEFAULT NULL,
  `recebimento_forma_id` int DEFAULT NULL,
  `recebimento_identificacao` varchar(120) DEFAULT NULL,
  `recebimento_conta_financeira_id` int DEFAULT NULL,
  `repasse_cliente_em` date DEFAULT NULL,
  `repasse_cliente_forma_id` int DEFAULT NULL,
  `repasse_cliente_conta_financeira_id` int DEFAULT NULL,
  `repasse_cliente_destino_tipo` varchar(15) DEFAULT NULL,
  `repasse_cliente_destino_snapshot` longtext,
  `repasse_cliente_observacao` text,
  `repasse_cliente_por` int DEFAULT NULL,
  `repasse_parceiro_em` date DEFAULT NULL,
  `repasse_parceiro_forma_id` int DEFAULT NULL,
  `repasse_parceiro_conta_financeira_id` int DEFAULT NULL,
  `repasse_parceiro_conta_id` int DEFAULT NULL,
  `repasse_parceiro_destino_tipo` varchar(15) DEFAULT NULL,
  `repasse_parceiro_destino_snapshot` longtext,
  `repasse_parceiro_observacao` text,
  `repasse_parceiro_por` int DEFAULT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_multa_parcela` (`parcela_id`),
  KEY `fk_multa_receb_forma` (`recebimento_forma_id`),
  KEY `fk_multa_repcli_forma` (`repasse_cliente_forma_id`),
  KEY `fk_multa_reppar_forma` (`repasse_parceiro_forma_id`),
  KEY `fk_multa_repcli_por` (`repasse_cliente_por`),
  KEY `fk_multa_reppar_por` (`repasse_parceiro_por`),
  KEY `idx_multa_receb_conta_financeira` (`recebimento_conta_financeira_id`),
  KEY `idx_multa_repcli_conta_financeira` (`repasse_cliente_conta_financeira_id`),
  KEY `idx_multa_reppar_conta_financeira` (`repasse_parceiro_conta_financeira_id`),
  KEY `fk_multa_criado_por` (`criado_por`),
  CONSTRAINT `fk_multa_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_parcela` FOREIGN KEY (`parcela_id`) REFERENCES `acordo_parcela` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_multa_receb_conta_financeira` FOREIGN KEY (`recebimento_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_receb_forma` FOREIGN KEY (`recebimento_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_repcli_conta_financeira` FOREIGN KEY (`repasse_cliente_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_repcli_forma` FOREIGN KEY (`repasse_cliente_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_repcli_por` FOREIGN KEY (`repasse_cliente_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_reppar_conta_financeira` FOREIGN KEY (`repasse_parceiro_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_multa_reppar_forma` FOREIGN KEY (`repasse_parceiro_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_multa_reppar_por` FOREIGN KEY (`repasse_parceiro_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- relatorio_modelo: Relatórios
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_modelo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `descricao` varchar(300) DEFAULT NULL,
  `assunto` varchar(40) NOT NULL COMMENT ''chave do assunto no catalogo (ex.: prazos, tarefas)'',
  `definicao` json NOT NULL COMMENT ''receita: colunas, filtros e ordem. Nunca guarda dados'',
  `escopo` varchar(10) NOT NULL DEFAULT ''pessoal'' COMMENT ''pessoal | sistema'',
  `dono_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_em` datetime DEFAULT NULL,
  `alterado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_relmod_dono_nome` (`dono_id`,`nome`),
  KEY `idx_relmod_escopo` (`escopo`),
  KEY `fk_relmod_alterado_por` (`alterado_por`),
  CONSTRAINT `fk_relmod_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_relmod_dono` FOREIGN KEY (`dono_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- relatorio_modelo_usuario: Relatórios
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_modelo_usuario` (
  `modelo_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `origem` varchar(12) NOT NULL DEFAULT ''proprio'' COMMENT ''proprio | colega | liberado'',
  `preferencias` json DEFAULT NULL COMMENT ''preferencias deste usuario neste relatorio (ex.: linhas por pagina)'',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`modelo_id`,`usuario_id`),
  KEY `idx_relmu_usuario` (`usuario_id`),
  CONSTRAINT `fk_relmu_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `relatorio_modelo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_relmu_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- relatorio_agendamento: Relatórios (envio por e-mail)
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `relatorio_agendamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modelo_id` int NOT NULL,
  `dono_id` int NOT NULL COMMENT ''quem agendou: o relatorio roda com as permissoes dele'',
  `frequencia` varchar(10) NOT NULL COMMENT ''diaria | semanal | mensal'',
  `dia_semana` tinyint DEFAULT NULL COMMENT ''0=domingo ... 6=sabado (semanal)'',
  `dia_mes` tinyint DEFAULT NULL COMMENT ''1 a 31 (mensal; meses curtos usam o ultimo dia)'',
  `hora` time NOT NULL,
  `formato` varchar(4) NOT NULL DEFAULT ''pdf'' COMMENT ''pdf | docx | xlsx'',
  `destinatarios` json NOT NULL COMMENT ''ids de usuarios ativos do sistema'',
  `ativo` tinyint(1) NOT NULL DEFAULT ''1'',
  `proxima_execucao` datetime DEFAULT NULL COMMENT ''horario de Brasilia'',
  `ultimo_envio` datetime DEFAULT NULL,
  `ultimo_status` varchar(10) DEFAULT NULL COMMENT ''ok | falha'',
  `ultimo_erro` varchar(300) DEFAULT NULL,
  `falhas_seguidas` tinyint NOT NULL DEFAULT ''0'',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_relag_proxima` (`ativo`,`proxima_execucao`),
  KEY `idx_relag_dono` (`dono_id`),
  KEY `idx_relag_modelo` (`modelo_id`),
  CONSTRAINT `fk_relag_dono` FOREIGN KEY (`dono_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_relag_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `relatorio_modelo` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 2) FINANCEIRO: colunas novas em tabelas que já existem
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_tipo')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_tipo` varchar(10) DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_id')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo' AND COLUMN_NAME='beneficiario_cliente_conta_id')=0, 'ALTER TABLE `acordo` ADD COLUMN `beneficiario_cliente_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='multa_percentual')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `multa_percentual` decimal(5,2) DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='recebimento_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `recebimento_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='recebimento_instituicao_origem_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `recebimento_instituicao_origem_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_conta_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_destino_snapshot')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_destino_snapshot` longtext', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_destino_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_destino_tipo` varchar(15) DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_instituicao_destino_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_instituicao_destino_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_observacao')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_observacao` text', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_pessoa_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_pessoa_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_cliente_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_cliente_tipo` varchar(10) DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_conta_financeira_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_conta_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_conta_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_destino_snapshot')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_destino_snapshot` longtext', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_destino_tipo')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_destino_tipo` varchar(15) DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_instituicao_destino_id')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_instituicao_destino_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND COLUMN_NAME='repasse_parceiro_observacao')=0, 'ALTER TABLE `acordo_parcela` ADD COLUMN `repasse_parceiro_observacao` text', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND COLUMN_NAME='profissao_id')=0, 'ALTER TABLE `advogados_freela` ADD COLUMN `profissao_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND COLUMN_NAME='conta_financeira_id')=0, 'ALTER TABLE `conta_corrente` ADD COLUMN `conta_financeira_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='forma_pagamento' AND COLUMN_NAME='uso_permitido')=0, 'ALTER TABLE `forma_pagamento` ADD COLUMN `uso_permitido` enum(''financeira'',''especie'',''ambos'') NOT NULL DEFAULT ''ambos''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 3) FINANCEIRO: índices e chaves ligados às colunas novas
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_receb_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_receb_conta_financeira` (`recebimento_conta_financeira_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_repcli_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_repcli_conta_financeira` (`repasse_cliente_conta_financeira_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_reppar_conta_financeira')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_reppar_conta_financeira` (`repasse_parceiro_conta_financeira_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_receb_instituicao_origem')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_receb_instituicao_origem` (`recebimento_instituicao_origem_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_repcli_instituicao_destino')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_repcli_instituicao_destino` (`repasse_cliente_instituicao_destino_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND INDEX_NAME='idx_ap_reppar_instituicao_destino')=0, 'ALTER TABLE `acordo_parcela` ADD KEY `idx_ap_reppar_instituicao_destino` (`repasse_parceiro_instituicao_destino_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_receb_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_receb_conta_financeira` FOREIGN KEY (`recebimento_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_repcli_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_repcli_conta_financeira` FOREIGN KEY (`repasse_cliente_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='acordo_parcela' AND CONSTRAINT_NAME='fk_ap_reppar_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `acordo_parcela` ADD CONSTRAINT `fk_ap_reppar_conta_financeira` FOREIGN KEY (`repasse_parceiro_conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND INDEX_NAME='idx_cc_conta_financeira')=0, 'ALTER TABLE `conta_corrente` ADD KEY `idx_cc_conta_financeira` (`conta_financeira_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conta_corrente' AND CONSTRAINT_NAME='fk_cc_conta_financeira' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `conta_corrente` ADD CONSTRAINT `fk_cc_conta_financeira` FOREIGN KEY (`conta_financeira_id`) REFERENCES `conta_financeira` (`id`) ON DELETE RESTRICT', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND INDEX_NAME='idx_freela_profissao')=0, 'ALTER TABLE `advogados_freela` ADD KEY `idx_freela_profissao` (`profissao_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='advogados_freela' AND CONSTRAINT_NAME='fk_freela_profissao' AND CONSTRAINT_TYPE='FOREIGN KEY')=0, 'ALTER TABLE `advogados_freela` ADD CONSTRAINT `fk_freela_profissao` FOREIGN KEY (`profissao_id`) REFERENCES `profissao` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 4) RELATÓRIOS: colunas dos limites de relatórios
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'max_relatorios_por_usuario') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `max_relatorios_por_usuario` int NOT NULL DEFAULT ''10'' COMMENT ''limite padrao de relatorios pessoais por usuario''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'max_relatorios') = 0,
 'ALTER TABLE `usuarios` ADD COLUMN `max_relatorios` int DEFAULT NULL COMMENT ''limite individual de relatorios (vazio = usa o padrao do escritorio)''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 5) PASTAS: remove a coluna antiga "area_direito" (a área agora é o Tipo do processo)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblpasta' AND COLUMN_NAME = 'area_direito') > 0,
 'ALTER TABLE `tblpasta` DROP COLUMN `area_direito`',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 5b) MODELOS DE DOCUMENTO: aumenta o tamanho da coluna "destino" (20 -> 40 letras). Só aumenta; mantém NOT NULL e o padrão 'comum'.
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'modelo_documento' AND COLUMN_NAME = 'destino' AND CHARACTER_MAXIMUM_LENGTH < 40) > 0,
 'ALTER TABLE `modelo_documento` MODIFY COLUMN `destino` varchar(40) NOT NULL DEFAULT ''comum''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 6) CONFERÊNCIA FINAL (só lê): conta o que ainda estiver faltando. Tudo deve ser 0.
SET @falta_tab := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'instituicao_financeira' AS t
      UNION ALL SELECT 'conta_financeira' AS t
      UNION ALL SELECT 'contas_bancarias_pf' AS t
      UNION ALL SELECT 'contas_bancarias_pj' AS t
      UNION ALL SELECT 'acordo_parcela_multa' AS t
      UNION ALL SELECT 'relatorio_modelo' AS t
      UNION ALL SELECT 'relatorio_modelo_usuario' AS t
      UNION ALL SELECT 'relatorio_agendamento' AS t
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t)), NULL);
SET @falta_col := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'acordo' AS t, 'beneficiario_cliente_tipo' AS c
      UNION ALL SELECT 'acordo' AS t, 'beneficiario_cliente_id' AS c
      UNION ALL SELECT 'acordo' AS t, 'beneficiario_cliente_conta_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'multa_percentual' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'recebimento_conta_financeira_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'recebimento_instituicao_origem_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_conta_financeira_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_conta_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_destino_snapshot' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_destino_tipo' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_instituicao_destino_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_observacao' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_pessoa_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_cliente_tipo' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_conta_financeira_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_conta_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_destino_snapshot' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_destino_tipo' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_instituicao_destino_id' AS c
      UNION ALL SELECT 'acordo_parcela' AS t, 'repasse_parceiro_observacao' AS c
      UNION ALL SELECT 'advogados_freela' AS t, 'profissao_id' AS c
      UNION ALL SELECT 'conta_corrente' AS t, 'conta_financeira_id' AS c
      UNION ALL SELECT 'forma_pagamento' AS t, 'uso_permitido' AS c
      UNION ALL SELECT 'configuracoes_escritorio' AS t, 'max_relatorios_por_usuario' AS c
      UNION ALL SELECT 'usuarios' AS t, 'max_relatorios' AS c
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.COLUMN_NAME = x.c)), NULL);
SET @falta_idx := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'acordo_parcela' AS t, 'idx_ap_receb_conta_financeira' AS i
      UNION ALL SELECT 'acordo_parcela' AS t, 'idx_ap_repcli_conta_financeira' AS i
      UNION ALL SELECT 'acordo_parcela' AS t, 'idx_ap_reppar_conta_financeira' AS i
      UNION ALL SELECT 'acordo_parcela' AS t, 'idx_ap_receb_instituicao_origem' AS i
      UNION ALL SELECT 'acordo_parcela' AS t, 'idx_ap_repcli_instituicao_destino' AS i
      UNION ALL SELECT 'acordo_parcela' AS t, 'idx_ap_reppar_instituicao_destino' AS i
      UNION ALL SELECT 'conta_corrente' AS t, 'idx_cc_conta_financeira' AS i
      UNION ALL SELECT 'advogados_freela' AS t, 'idx_freela_profissao' AS i
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.INDEX_NAME = x.i)), NULL);
SET @falta_fk := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'acordo_parcela' AS t, 'fk_ap_receb_conta_financeira' AS f
      UNION ALL SELECT 'acordo_parcela' AS t, 'fk_ap_repcli_conta_financeira' AS f
      UNION ALL SELECT 'acordo_parcela' AS t, 'fk_ap_reppar_conta_financeira' AS f
      UNION ALL SELECT 'conta_corrente' AS t, 'fk_cc_conta_financeira' AS f
      UNION ALL SELECT 'advogados_freela' AS t, 'fk_freela_profissao' AS f
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.CONSTRAINT_NAME = x.f AND i.CONSTRAINT_TYPE = 'FOREIGN KEY')), NULL);
SET @area := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblpasta' AND COLUMN_NAME = 'area_direito'), NULL);
SET @destino_curto := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'modelo_documento' AND COLUMN_NAME = 'destino' AND CHARACTER_MAXIMUM_LENGTH < 40), NULL);
SET @tudo := IF(@ok = 1 AND @falta_tab = 0 AND @falta_col = 0 AND @falta_idx = 0 AND @falta_fk = 0 AND @area = 0 AND @destino_curto = 0, 1, 0);

-- ---------- 7) REGISTRA A VERSÃO no próprio banco (tabela controle_versao_banco; só se tudo deu certo)
SET @tem_versao := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'controle_versao_banco');
SET @sql := IF(@tudo = 1 AND @tem_versao = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (1, ''Atualizacao geral de 04/10/2026: Financeiro, contas bancarias das pessoas, Relatorios e remocao de tblpasta.area_direito (script sql_atualizar_banco_para_heidi.sql)'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@tem_versao = 1,
 'SET @versao_registrada := (SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) FROM `controle_versao_banco` WHERE numero = 1)',
 'SET @versao_registrada := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 8) RESULTADO (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o banco esta igual ao estrutura_banco.sql. Pode atualizar/reiniciar o sistema.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja as colunas abaixo). Rode de novo; se persistir, me envie esta linha.',
             @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @falta_tab AS tabelas_faltando,
       @falta_col AS colunas_faltando,
       @falta_idx AS indices_faltando,
       @falta_fk AS chaves_faltando,
       @area AS area_direito_ainda_existe,
       @destino_curto AS destino_modelo_ainda_curto,
       @versao_registrada AS versao_registrada;
