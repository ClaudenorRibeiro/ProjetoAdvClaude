-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: COR DA ETIQUETA "ACORDO" (criado em 10/10/2026, pedido do usuário).
-- PARA QUE SERVE: o processo que tem acordo cadastrado ganha, automaticamente, uma etiqueta escrita "Acordo" e um fundo colorido, ambos
--   na mesma cor. A cor é escolhida em Configurações > Etiquetas do escritório (linha "Acordo (automática)"). Este script cria o lugar
--   onde essa cor fica guardada.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: só cria o que falta e não mexe em nenhum dado.
-- ORDEM EM PRODUÇÃO: rodar DEPOIS do sql_atualizar_banco_para_heidi.sql (versão 1) e do sql_avisos_clientes_para_heidi.sql (versão 2).
--   Este é a versão 3 do banco.
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ:
--   a) configuracoes_escritorio: acrescenta a coluna "cor_etiqueta_acordo" (texto #rrggbb; vazia = o sistema usa a cor padrão).
--   b) Registra a versão 3 na tabela controle_versao_banco, só se tudo terminar certo.
-- SEGURANÇA: não apaga nada e não altera nenhum dado existente. ALTER faz COMMIT automático no MySQL (não há ROLLBACK):
--   o caminho de volta é o backup do banco feito antes.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e a coluna "colunas_faltando" deve ser 0.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve? o script dos avisos (versão 2) já rodou?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','tblproc','acordo','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @tem_v2 := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'avisos_cliente');
SET @ok := IF(@db IS NOT NULL AND @n_chave = 7 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%' AND @tem_v2 = 1, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 7, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Se for o banco antigo, rode antes o sql_atualizar_banco_para_heidi.sql. Nada foi alterado.',
                  IF(@tem_v2 = 0, 'ABORTADO: rode antes o sql_avisos_clientes_para_heidi.sql (versao 2). Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.'))));

-- ---------- a) coluna da cor da etiqueta "Acordo"
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'cor_etiqueta_acordo') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `cor_etiqueta_acordo` varchar(7) DEFAULT NULL COMMENT ''cor (#rrggbb) da etiqueta e do fundo automaticos de processo com acordo; vazio = cor padrao do sistema''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência: o que ainda falta?
SET @falta_col := IF(@ok = 1, (SELECT COUNT(*) FROM (SELECT 'configuracoes_escritorio' AS t, 'cor_etiqueta_acordo' AS c) x
      WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS i WHERE i.TABLE_SCHEMA = @db AND i.TABLE_NAME = x.t AND i.COLUMN_NAME = x.c)), NULL);
SET @tudo := IF(@ok = 1 AND @falta_col = 0, 1, 0);

-- ---------- b) registra a versão 3 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (3, ''Cor da etiqueta Acordo (10/10/2026): coluna configuracoes_escritorio.cor_etiqueta_acordo'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versao_registrada := IF(@tudo = 1, (SELECT CONCAT('versao ', numero, ' registrada em ', aplicado_em) FROM `controle_versao_banco` WHERE numero = 3), NULL);

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o banco esta pronto para a etiqueta Acordo.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja as colunas abaixo). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @falta_col AS colunas_faltando,
       @versao_registrada AS versao_registrada;
