-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: AVISOS AUTOMÁTICOS AOS CLIENTES (criado em 08/10/2026, pedido do usuário).
-- PARA QUE SERVE: prepara o banco para a tela "Avisos aos clientes" (Audiência, Perícia e Parabéns de aniversário), com envio por
--   e-mail, SMS e WhatsApp, e para os marcadores "este número é WhatsApp / SMS" nos telefones das pessoas.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: só cria o que falta e NUNCA remarca telefone que você já tenha ajustado.
-- ORDEM EM PRODUÇÃO: rodar DEPOIS do script sql_atualizar_banco_para_heidi.sql (versão 1). Este é a versão 2 do banco.
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ:
--   a) telefones_pf e telefones_pj: acrescenta as colunas "whatsapp" e "sms" (0/1) e uma trava no banco que impede mais de UM número
--      ativo marcado como WhatsApp, e mais de UM como SMS, para a mesma pessoa (o mesmo número pode ser os dois).
--   b) Telefones que JÁ existem (só na primeira vez que o script roda): o número PRINCIPAL e ativo de cada pessoa é marcado como
--      WhatsApp e SMS quando parece celular (DDD + 9 dígitos começando em 9). Telefone fixo fica sem marcação.
--   c) configuracoes_escritorio: acrescenta os quadradinhos "mostrar avisos antes de enviar" (Perícia, Audiência e Parabéns; vêm LIGADOS)
--      e os dias de antecedência dos Parabéns (0 = no dia do aniversário). Os dias de Audiência e Perícia já existiam.
--   d) Cria a tabela avisos_cliente (a lista de avisos a conferir/enviar, com o resultado de cada um).
--   e) log_comunicacoes: acrescenta a coluna aviso_id (liga cada envio ao aviso que o originou). parabens_enviados.usuario_id passa a aceitar vazio
--      (parabéns enviado sozinho pelo sistema não tem usuário).
--   f) Registra a versão 2 na tabela controle_versao_banco, só se tudo terminar certo.
-- SEGURANÇA: não apaga nada e não altera nenhum dado existente além da marcação do item (b). CREATE/ALTER fazem COMMIT automático no
--   MySQL (não há ROLLBACK): o caminho de volta é o backup do banco feito antes.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e as colunas "faltando" devem ser 0.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','telefones_pf','telefones_pj',
                                       'pericia','audiencia','tblproc','log_comunicacoes','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @ok := IF(@db IS NOT NULL AND @n_chave = 11 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%', 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 11, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Se for o banco antigo, rode antes o sql_atualizar_banco_para_heidi.sql. Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.')));

-- ---------- a) colunas whatsapp e sms nos telefones (guarda se ELAS ainda não existiam: a marcação do item b só vale nesta primeira vez)
SET @pf_novo := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pf' AND COLUMN_NAME = 'whatsapp') = 0, 1, 0);
SET @pj_novo := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pj' AND COLUMN_NAME = 'whatsapp') = 0, 1, 0);

SET @sql := IF(@pf_novo = 1, 'ALTER TABLE `telefones_pf` ADD COLUMN `whatsapp` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de WhatsApp da pessoa (no maximo um ativo)'', ADD COLUMN `sms` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de SMS da pessoa (no maximo um ativo)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@pj_novo = 1, 'ALTER TABLE `telefones_pj` ADD COLUMN `whatsapp` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de WhatsApp da pessoa (no maximo um ativo)'', ADD COLUMN `sms` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de SMS da pessoa (no maximo um ativo)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- b) marcação inicial dos telefones que já existem (só na 1ª vez; um único número por pessoa: o de menor id entre os principais que parecem celular)
SET @sql := IF(@pf_novo = 1,
 'UPDATE `telefones_pf` t JOIN (
     SELECT MIN(id) AS id FROM `telefones_pf`
      WHERE principal = 1 AND ativo = 1
        AND CHAR_LENGTH(REGEXP_REPLACE(numero, ''[^0-9]'', '''')) = 11
        AND SUBSTRING(REGEXP_REPLACE(numero, ''[^0-9]'', ''''), 3, 1) = ''9''
      GROUP BY pessoa_id) x ON x.id = t.id
    SET t.whatsapp = 1, t.sms = 1', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@pj_novo = 1,
 'UPDATE `telefones_pj` t JOIN (
     SELECT MIN(id) AS id FROM `telefones_pj`
      WHERE principal = 1 AND ativo = 1
        AND CHAR_LENGTH(REGEXP_REPLACE(numero, ''[^0-9]'', '''')) = 11
        AND SUBSTRING(REGEXP_REPLACE(numero, ''[^0-9]'', ''''), 3, 1) = ''9''
      GROUP BY pessoa_id) x ON x.id = t.id
    SET t.whatsapp = 1, t.sms = 1', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- a2) a trava no banco: no máximo UM número ativo com WhatsApp e UM com SMS por pessoa (coluna calculada + índice único; vazios não contam)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pf' AND COLUMN_NAME = 'whatsapp_unico') = 0,
 'ALTER TABLE `telefones_pf`
    ADD COLUMN `whatsapp_unico` int GENERATED ALWAYS AS (IF(`whatsapp` = 1 AND `ativo` = 1, `pessoa_id`, NULL)) VIRTUAL,
    ADD COLUMN `sms_unico` int GENERATED ALWAYS AS (IF(`sms` = 1 AND `ativo` = 1, `pessoa_id`, NULL)) VIRTUAL,
    ADD UNIQUE KEY `uq_tel_pf_whatsapp` (`whatsapp_unico`),
    ADD UNIQUE KEY `uq_tel_pf_sms` (`sms_unico`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pj' AND COLUMN_NAME = 'whatsapp_unico') = 0,
 'ALTER TABLE `telefones_pj`
    ADD COLUMN `whatsapp_unico` int GENERATED ALWAYS AS (IF(`whatsapp` = 1 AND `ativo` = 1, `pessoa_id`, NULL)) VIRTUAL,
    ADD COLUMN `sms_unico` int GENERATED ALWAYS AS (IF(`sms` = 1 AND `ativo` = 1, `pessoa_id`, NULL)) VIRTUAL,
    ADD UNIQUE KEY `uq_tel_pj_whatsapp` (`whatsapp_unico`),
    ADD UNIQUE KEY `uq_tel_pj_sms` (`sms_unico`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- c) configuração do escritório: "mostrar avisos antes de enviar" por módulo + dias dos Parabéns
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'avisos_pericia_mostrar') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `avisos_pericia_mostrar` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''1 = avisos de pericia aos clientes passam pela tela de conferencia; 0 = saem sozinhos (e-mail e SMS)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'avisos_audiencia_mostrar') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `avisos_audiencia_mostrar` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''1 = avisos de audiencia aos clientes passam pela tela de conferencia; 0 = saem sozinhos (e-mail e SMS)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'avisos_parabens_mostrar') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `avisos_parabens_mostrar` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''1 = parabens de aniversario passam pela tela de conferencia; 0 = saem sozinhos (e-mail e SMS)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'dias_aviso_parabens') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `dias_aviso_parabens` int NOT NULL DEFAULT ''0'' COMMENT ''dias ANTES do aniversario para aparecer o aviso de parabens (0 = no proprio dia)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- d) tabela avisos_cliente (um aviso por ocorrência, tipo e cliente: módulo + registro + data do evento + tipo + cliente; nunca repete)
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `avisos_cliente` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(20) NOT NULL COMMENT ''pericia | audiencia | parabens'',
  `tipo` varchar(15) NOT NULL COMMENT ''agendada | remarcada | cancelada | lembrete | aniversario'',
  `pericia_id` int DEFAULT NULL,
  `audiencia_id` int DEFAULT NULL,
  `pessoa_fisica_id` int DEFAULT NULL COMMENT ''so nos parabens: o aniversariante'',
  `referencia_id` int GENERATED ALWAYS AS (COALESCE(`pericia_id`, `audiencia_id`, `pessoa_fisica_id`)) VIRTUAL,
  `cliente_tipo` varchar(10) NOT NULL COMMENT ''fisica | juridica'',
  `cliente_id` int NOT NULL,
  `processo_id` int DEFAULT NULL,
  `data_evento` date NOT NULL COMMENT ''data da pericia/audiencia/aniversario'',
  `data_aviso` date NOT NULL COMMENT ''primeiro dia em que o aviso podia aparecer'',
  `assunto` varchar(200) NOT NULL,
  `texto` text NOT NULL,
  `texto_editado` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = alguem editou o texto na tela (nao regenerar)'',
  `status` varchar(15) NOT NULL DEFAULT ''pendente'' COMMENT ''pendente | enviado | descartado | expirado | cancelado'',
  `modo` varchar(10) DEFAULT NULL COMMENT ''tela | automatico (como foi decidido)'',
  `decidido_por` int DEFAULT NULL,
  `decidido_em` datetime DEFAULT NULL,
  `motivo_status` varchar(300) DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aviso_ocorrencia` (`modulo`, `referencia_id`, `data_evento`, `tipo`, `cliente_tipo`, `cliente_id`),
  KEY `idx_aviso_status` (`status`, `modulo`),
  KEY `idx_aviso_pericia` (`pericia_id`),
  KEY `idx_aviso_audiencia` (`audiencia_id`),
  KEY `idx_aviso_pessoa_fisica` (`pessoa_fisica_id`),
  KEY `idx_aviso_processo` (`processo_id`),
  KEY `idx_aviso_decidido_por` (`decidido_por`),
  CONSTRAINT `fk_aviso_pericia` FOREIGN KEY (`pericia_id`) REFERENCES `pericia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aviso_audiencia` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aviso_pessoa_fisica` FOREIGN KEY (`pessoa_fisica_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aviso_processo` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_aviso_decidido_por` FOREIGN KEY (`decidido_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `chk_aviso_uma_referencia` CHECK (((`pericia_id` IS NOT NULL) + (`audiencia_id` IS NOT NULL) + (`pessoa_fisica_id` IS NOT NULL)) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- e) log_comunicacoes.aviso_id (liga cada envio ao aviso de origem)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'log_comunicacoes' AND COLUMN_NAME = 'aviso_id') = 0,
 'ALTER TABLE `log_comunicacoes` ADD COLUMN `aviso_id` int DEFAULT NULL, ADD KEY `idx_logcom_aviso` (`aviso_id`), ADD CONSTRAINT `fk_logcom_aviso` FOREIGN KEY (`aviso_id`) REFERENCES `avisos_cliente` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- e2) parabens_enviados.usuario_id passa a aceitar vazio (parabéns enviado SOZINHO pelo sistema não tem usuário)
SET @sql := IF(@ok = 1 AND (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parabens_enviados' AND COLUMN_NAME = 'usuario_id') = 'NO',
 'ALTER TABLE `parabens_enviados` MODIFY COLUMN `usuario_id` int DEFAULT NULL', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @usuario_ainda_obrigatorio := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parabens_enviados' AND COLUMN_NAME = 'usuario_id' AND IS_NULLABLE = 'NO'), NULL);

-- ---------- conferência: o que ainda falta?
SET @falta_col := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'avisos_cliente' AS t, 'tipo' AS c UNION ALL SELECT 'telefones_pf', 'whatsapp' UNION ALL SELECT 'telefones_pf', 'sms' UNION ALL SELECT 'telefones_pf', 'whatsapp_unico' UNION ALL SELECT 'telefones_pf', 'sms_unico'
      UNION ALL SELECT 'telefones_pj', 'whatsapp' UNION ALL SELECT 'telefones_pj', 'sms' UNION ALL SELECT 'telefones_pj', 'whatsapp_unico' UNION ALL SELECT 'telefones_pj', 'sms_unico'
      UNION ALL SELECT 'configuracoes_escritorio', 'avisos_pericia_mostrar' UNION ALL SELECT 'configuracoes_escritorio', 'avisos_audiencia_mostrar'
      UNION ALL SELECT 'configuracoes_escritorio', 'avisos_parabens_mostrar' UNION ALL SELECT 'configuracoes_escritorio', 'dias_aviso_parabens'
      UNION ALL SELECT 'log_comunicacoes', 'aviso_id' UNION ALL SELECT 'avisos_cliente', 'referencia_id'
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.COLUMN_NAME = x.c)), NULL);
SET @falta_idx := IF(@ok = 1, (SELECT COUNT(*) FROM (
      SELECT 'telefones_pf' AS t, 'uq_tel_pf_whatsapp' AS i UNION ALL SELECT 'telefones_pf', 'uq_tel_pf_sms'
      UNION ALL SELECT 'telefones_pj', 'uq_tel_pj_whatsapp' UNION ALL SELECT 'telefones_pj', 'uq_tel_pj_sms'
      UNION ALL SELECT 'avisos_cliente', 'uq_aviso_ocorrencia' UNION ALL SELECT 'log_comunicacoes', 'idx_logcom_aviso'
    ) x WHERE NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.INDEX_NAME = x.i)), NULL);
SET @falta_tab := IF(@ok = 1, (SELECT COUNT(*) FROM (SELECT 'avisos_cliente' AS t) x
                       WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t)), NULL);
SET @tudo := IF(@ok = 1 AND @falta_col = 0 AND @falta_idx = 0 AND @falta_tab = 0 AND @usuario_ainda_obrigatorio = 0, 1, 0);

-- ---------- f) registra a versão 2 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (2, ''Avisos automaticos aos clientes (08/10/2026): tabela avisos_cliente, marcadores de WhatsApp/SMS nos telefones e configuracao por modulo (script sql_avisos_clientes_para_heidi.sql)'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versao_registrada := IF(@tudo = 1, (SELECT CONCAT('versao ', numero, ' registrada em ', aplicado_em) FROM `controle_versao_banco` WHERE numero = 2), NULL);

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SET @marcados_pf := IF(@ok = 1, (SELECT COUNT(*) FROM `telefones_pf` WHERE whatsapp = 1), NULL);
SET @marcados_pj := IF(@ok = 1, (SELECT COUNT(*) FROM `telefones_pj` WHERE whatsapp = 1), NULL);
SELECT IF(@tudo = 1, 'PRONTO: o banco esta pronto para os avisos aos clientes.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja as colunas abaixo). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @falta_tab AS tabelas_faltando,
       @falta_col AS colunas_faltando,
       @falta_idx AS indices_faltando,
       @marcados_pf AS telefones_pf_marcados_whatsapp,
       @marcados_pj AS telefones_pj_marcados_whatsapp,
       @versao_registrada AS versao_registrada;
