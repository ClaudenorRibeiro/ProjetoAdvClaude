-- IMPORTANTE — NÃO APAGAR. Script ÚNICO para levar os bancos da AWS-ERICK (erick_adv) e da AWS-ANTÔNIO (sistema_advocacia) da VERSÃO 4 à VERSÃO 6
--   do banco (criado em 20/10/2026, pedido do usuário, depois de conferir os dumps de 19/10/2026 dos dois bancos).
-- PARA QUE SERVE: deixa o banco pronto para o sistema atualizado (processo apenso e status "Acordo" do sistema). Junta DOIS passos num só:
--   VERSÃO 5 (processo apenso): tabela tblproc ganha a coluna "apenso_de_id", o índice "idx_proc_apenso_de" e a chave "fk_proc_apenso_de"
--     (sem cascata: o banco não deixa apagar um processo que ainda tem apenso). Equivale ao sql_processo_apenso_para_heidi.sql.
--   VERSÃO 6 (status "Acordo" do sistema): garante que existe o status de processo "Acordo", ativo e sem "encerra o processo"
--     (se já existe certo, não muda nada; se está desligado, reativa o mesmo; se não existe, cria). Equivale ao sql_status_acordo_do_sistema_para_heidi.sql.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, uma vez em CADA banco da AWS, na hora da atualização (com o sistema parado e backup antes).
--   Pode rodar quantas vezes quiser: só faz o que falta e não altera nenhum dado de cliente, processo, pessoa ou financeiro.
-- CONDIÇÕES (se alguma falhar, o script PARA e não altera nada): banco selecionado chamado erick_adv ou sistema_advocacia; as 21 tabelas
--   principais existem; MySQL 8.0.16+ (não MariaDB); o banco já está na versão 4 (ou 5/6, se for repetir); nenhuma versão acima de 6.
-- O QUE CONFERE NO FIM: coluna, índice e chave do apenso existem; existe exatamente UM status "Acordo" ativo e ele não encerra o processo.
--   Só se tudo estiver certo ele diz "PRONTO" e registra as versões 5 e 6 em controle_versao_banco.
-- SEGURANÇA: ALTER TABLE faz COMMIT automático no MySQL (não há ROLLBACK): o caminho de volta é o backup do banco feito antes.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (erick_adv no Erick; sistema_advocacia no Antônio) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." com itens_faltando = 0.
--      Se disser "ABORTADO" ou "ATENCAO", NÃO continue: me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
SET @db := DATABASE();

-- ---------- 0) é mesmo o banco certo, no ponto certo?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','tblpasta','tblproc','tblstatusproc','acordo','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @v_max := NULL; SET @tem_v4 := 0;
SET @sql := IF(@n_chave = 9, 'SELECT IFNULL(MAX(`numero`), 0), IFNULL(SUM(`numero` = 4), 0) INTO @v_max, @tem_v4 FROM `controle_versao_banco`', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @ok := IF(@db IN ('erick_adv', 'sistema_advocacia') AND @n_chave = 9 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%'
              AND @tem_v4 = 1 AND @v_max <= 6, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@db NOT IN ('erick_adv', 'sistema_advocacia'), 'ABORTADO: este script e so para os bancos erick_adv e sistema_advocacia (o banco selecionado tem outro nome). Nada foi alterado.',
                  IF(@n_chave <> 9, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Nada foi alterado.',
                  IF(@mysql_num < 80016 OR VERSION() LIKE '%MariaDB%', 'ABORTADO: o MySQL deste servidor e antigo demais ou e MariaDB (precisa ser MySQL 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.',
                  IF(@tem_v4 = 0, 'ABORTADO: este banco ainda nao esta na versao 4 (rode antes o sql_preparar_aws_erick_antonio_para_heidi.sql). Nada foi alterado.',
                     'ABORTADO: este banco tem uma versao acima de 6, mais nova que este script. Nada foi alterado - avise o suporte.'))))));

-- ---------- VERSÃO 5 · a) coluna do vínculo de apenso (logo depois de pasta_id)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'apenso_de_id') = 0,
 'ALTER TABLE `tblproc` ADD COLUMN `apenso_de_id` int DEFAULT NULL COMMENT ''vazio = processo comum; preenchido = APENSO do processo comum indicado (da mesma pasta)'' AFTER `pasta_id`', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- VERSÃO 5 · b) índice e chave estrangeira (sem cascata)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND INDEX_NAME = 'idx_proc_apenso_de') = 0,
 'ALTER TABLE `tblproc` ADD KEY `idx_proc_apenso_de` (`apenso_de_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND CONSTRAINT_NAME = 'fk_proc_apenso_de') = 0,
 'ALTER TABLE `tblproc` ADD CONSTRAINT `fk_proc_apenso_de` FOREIGN KEY (`apenso_de_id`) REFERENCES `tblproc` (`id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- VERSÃO 6 · status "Acordo" do sistema (o nome é reconhecido sem diferenciar maiúscula, acento e espaços nas pontas)
-- a) "Acordo" ativo que encerra o processo: desliga a opção
SET @sql := IF(@ok = 1,
 'UPDATE `tblstatusproc` SET `encerra_processo` = 0, `alterado_em` = NOW() WHERE `ativo` = 1 AND `encerra_processo` <> 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
-- b) não há "Acordo" ativo, mas há um excluído: reativa o mais antigo (mantém a ligação com os processos antigos)
SET @n_ativos_antes := 1; SET @id_inativo := NULL;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_ativos_antes FROM `tblstatusproc` WHERE `ativo` = 1 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND @n_ativos_antes = 0, 'SELECT MIN(`id`) INTO @id_inativo FROM `tblstatusproc` WHERE `ativo` = 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@id_inativo IS NOT NULL,
 CONCAT('UPDATE `tblstatusproc` SET `ativo` = 1, `encerra_processo` = 0, `alterado_em` = NOW() WHERE `id` = ', @id_inativo), 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
-- c) não existe nenhum "Acordo": cria
SET @sql := IF(@ok = 1 AND @n_ativos_antes = 0 AND @id_inativo IS NULL,
 'INSERT INTO `tblstatusproc` (`nome`, `encerra_processo`, `ativo`) VALUES (''Acordo'', 0, 1)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência: o que ainda falta?
SET @falta_col := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'apenso_de_id'), NULL);
SET @falta_idx := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND INDEX_NAME = 'idx_proc_apenso_de'), NULL);
SET @falta_fk  := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND CONSTRAINT_NAME = 'fk_proc_apenso_de'), NULL);
SET @n_ativos := NULL; SET @n_encerra := NULL;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_ativos FROM `tblstatusproc` WHERE `ativo` = 1 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_encerra FROM `tblstatusproc` WHERE `ativo` = 1 AND `encerra_processo` <> 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @itens_faltando := IF(@ok = 1, @falta_col + @falta_idx + @falta_fk + ABS(@n_ativos - 1) + @n_encerra, NULL);
SET @tudo := IF(@ok = 1 AND @itens_faltando = 0, 1, 0);

-- ---------- registra as versões 5 e 6 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (5, ''Processo apenso (14/10/2026): coluna tblproc.apenso_de_id com indice e chave estrangeira''), (6, ''Status Acordo do sistema (20/10/2026): garante o status de processo Acordo, ativo e sem encerrar o processo'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versoes := NULL;
SET @sql := IF(@tudo = 1, 'SELECT GROUP_CONCAT(CONCAT(`numero`, '' em '', `aplicado_em`) ORDER BY `numero` SEPARATOR '' | '') INTO @versoes FROM `controle_versao_banco` WHERE `numero` IN (5, 6)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o banco esta na versao 6, pronto para o sistema atualizado (apenso e status Acordo).',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja as colunas abaixo). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @itens_faltando AS itens_faltando,
       @n_ativos AS status_acordo_ativos,
       @n_encerra AS status_acordo_que_encerra,
       @versoes AS versoes_registradas;
