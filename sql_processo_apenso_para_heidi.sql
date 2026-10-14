-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: PROCESSO APENSO (criado em 14/10/2026, pedido do usuário).
-- PARA QUE SERVE: o sistema passou a aceitar o PROCESSO APENSO. Apenso é o processo de OUTRA pessoa (falência, recuperação judicial,
--   inventário...) que o escritório "pendura" nos processos dos clientes que têm crédito contra o réu. Cada apenso é uma linha própria
--   dentro da pasta do cliente, ligada a UM processo comum DA MESMA pasta; o mesmo número de apenso pode aparecer em várias pastas.
--   Este script cria o lugar onde esse vínculo fica guardado (tblproc.apenso_de_id).
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: só cria o que falta e não mexe em nenhum dado. Sem rodar este script o sistema novo NÃO funciona
--   direito (a tela de pastas procura a coluna nova), então rode-o junto com a atualização do código.
-- ORDEM EM PRODUÇÃO: depois do sql_atualizar_banco_para_heidi.sql (versão 1), do sql_avisos_clientes_para_heidi.sql (versão 2) e do
--   sql_cor_etiqueta_acordo_para_heidi.sql (versão 3). Este é a versão 5 do banco (a versão 4, das permissões de repasse, só mexe em dados
--   e não é exigida aqui). O sql_preparar_aws_erick_antonio_para_heidi.sql leva um banco à versão 4; depois dele, rode este.
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ (tudo na tabela tblproc):
--   a) acrescenta a coluna "apenso_de_id" (vazia = processo comum; preenchida = é apenso do processo comum indicado);
--   b) cria o índice "idx_proc_apenso_de" e a chave estrangeira "fk_proc_apenso_de" (o banco não deixa apagar um processo que ainda tem apenso);
--   c) registra a versão 5 na tabela controle_versao_banco, só se tudo terminar certo.
-- SEGURANÇA: não apaga nada e não altera nenhum dado existente (todos os processos de hoje continuam comuns). ALTER faz COMMIT automático
--   no MySQL (não há ROLLBACK): o caminho de volta é o backup do banco feito antes.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e as colunas "itens_faltando" devem ser 0.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve? os scripts das versões 2 e 3 já rodaram?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','tblpasta','tblproc','acordo','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @tem_v2 := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'avisos_cliente');
SET @tem_v3 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'cor_etiqueta_acordo');
SET @ok := IF(@db IS NOT NULL AND @n_chave = 8 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%' AND @tem_v2 = 1 AND @tem_v3 = 1, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 8, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Se for o banco antigo, rode antes o sql_atualizar_banco_para_heidi.sql. Nada foi alterado.',
                  IF(@tem_v2 = 0, 'ABORTADO: rode antes o sql_avisos_clientes_para_heidi.sql (versao 2). Nada foi alterado.',
                  IF(@tem_v3 = 0, 'ABORTADO: rode antes o sql_cor_etiqueta_acordo_para_heidi.sql (versao 3). Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.')))));

-- ---------- a) coluna do vínculo de apenso (logo depois de pasta_id)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'apenso_de_id') = 0,
 'ALTER TABLE `tblproc` ADD COLUMN `apenso_de_id` int DEFAULT NULL COMMENT ''vazio = processo comum; preenchido = APENSO do processo comum indicado (da mesma pasta)'' AFTER `pasta_id`', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- b) índice e chave estrangeira (sem cascata: não se apaga o principal com apenso)
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND INDEX_NAME = 'idx_proc_apenso_de') = 0,
 'ALTER TABLE `tblproc` ADD KEY `idx_proc_apenso_de` (`apenso_de_id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND CONSTRAINT_NAME = 'fk_proc_apenso_de') = 0,
 'ALTER TABLE `tblproc` ADD CONSTRAINT `fk_proc_apenso_de` FOREIGN KEY (`apenso_de_id`) REFERENCES `tblproc` (`id`)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência: o que ainda falta?
SET @falta_col := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'apenso_de_id'), NULL);
SET @falta_idx := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND INDEX_NAME = 'idx_proc_apenso_de'), NULL);
SET @falta_fk  := IF(@ok = 1, (SELECT 1 - COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND CONSTRAINT_NAME = 'fk_proc_apenso_de'), NULL);
SET @tudo := IF(@ok = 1 AND @falta_col = 0 AND @falta_idx = 0 AND @falta_fk = 0, 1, 0);

-- ---------- c) registra a versão 5 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (5, ''Processo apenso (14/10/2026): coluna tblproc.apenso_de_id com indice e chave estrangeira'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@tudo = 1, 'SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) INTO @versao_registrada FROM `controle_versao_banco` WHERE numero = 5', 'SET @versao_registrada := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o banco esta pronto para o processo apenso.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja as colunas abaixo). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @falta_col AS coluna_faltando,
       @falta_idx AS indice_faltando,
       @falta_fk AS chave_faltando,
       @versao_registrada AS versao_registrada;
