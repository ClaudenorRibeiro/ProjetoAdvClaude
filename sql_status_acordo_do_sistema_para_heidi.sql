-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: STATUS "ACORDO" DO SISTEMA (criado em 20/10/2026, pedido do usuário).
-- PARA QUE SERVE: a etiqueta automática "Acordo" (linha colorida do processo) depende de existir o status de processo chamado
--   "Acordo". O sistema agora não deixa ninguém renomear nem excluir esse status. Este script garante que ele EXISTE no banco
--   (banco novo, ou banco onde alguém o apagou), ativo e sem a opção "encerra o processo".
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: se o status já está certo, não muda nada.
-- ORDEM EM PRODUÇÃO: com o banco já na versão 5 (processo apenso).
--   Este é a versão 6 do banco (só mexe em DADOS da tabela tblstatusproc; não muda estrutura).
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ (tabela tblstatusproc):
--   a) se existe um status "Acordo" ATIVO: não cria outro; só desliga "encerra o processo" se estiver ligado;
--   b) se só existe um "Acordo" EXCLUÍDO (inativo): reativa o mesmo (os processos antigos continuam ligados a ele);
--   c) se não existe nenhum: cria o status "Acordo";
--   d) registra a versão 6 em controle_versao_banco, só se tudo terminar certo.
--   O nome é reconhecido sem diferenciar maiúscula, acento e espaços nas pontas (igual ao sistema).
-- SEGURANÇA: não apaga nada e não mexe em nenhum outro status nem em nenhum processo.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e a coluna "status_acordo_ativos" deve ser 1.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','pessoas_fisicas','pessoas_juridicas','tblproc','tblstatusproc','acordo','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @ok := IF(@db IS NOT NULL AND @n_chave = 8 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%', 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 8, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.')));

-- ---------- a) "Acordo" ativo que encerra o processo: desliga a opção
SET @sql := IF(@ok = 1,
 'UPDATE `tblstatusproc` SET `encerra_processo` = 0, `alterado_em` = NOW() WHERE `ativo` = 1 AND `encerra_processo` <> 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- b) não há "Acordo" ativo, mas há um excluído: reativa o mais antigo (mantém a ligação com os processos antigos)
SET @n_ativos_antes := 1;
SET @id_inativo := NULL;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_ativos_antes FROM `tblstatusproc` WHERE `ativo` = 1 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1 AND @n_ativos_antes = 0, 'SELECT MIN(`id`) INTO @id_inativo FROM `tblstatusproc` WHERE `ativo` = 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@id_inativo IS NOT NULL,
 CONCAT('UPDATE `tblstatusproc` SET `ativo` = 1, `encerra_processo` = 0, `alterado_em` = NOW() WHERE `id` = ', @id_inativo), 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- c) não existe nenhum "Acordo": cria
SET @sql := IF(@ok = 1 AND @n_ativos_antes = 0 AND @id_inativo IS NULL,
 'INSERT INTO `tblstatusproc` (`nome`, `encerra_processo`, `ativo`) VALUES (''Acordo'', 0, 1)', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência
SET @n_ativos := NULL;
SET @n_encerra := NULL;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_ativos FROM `tblstatusproc` WHERE `ativo` = 1 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @n_encerra FROM `tblstatusproc` WHERE `ativo` = 1 AND `encerra_processo` <> 0 AND LOWER(TRIM(`nome`)) = ''acordo''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @tudo := IF(@ok = 1 AND @n_ativos = 1 AND @n_encerra = 0, 1, 0);

-- ---------- d) registra a versão 6 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (6, ''Status Acordo do sistema (20/10/2026): garante o status de processo Acordo, ativo e sem encerrar o processo'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versao_registrada := NULL;
SET @sql := IF(@tudo = 1, 'SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) INTO @versao_registrada FROM `controle_versao_banco` WHERE numero = 6', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o status Acordo existe, esta ativo e nao encerra o processo.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas o status Acordo nao ficou como esperado (veja as colunas abaixo). Me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @n_ativos AS status_acordo_ativos,
       @n_encerra AS status_acordo_que_encerra,
       @versao_registrada AS versao_registrada;
