-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: HORÁRIO SEQUENCIAL de prazo/tarefa na Agenda e no Google (criado em 04/11/2026, pedido do usuário).
-- PARA QUE SERVE: prazo e tarefa são eventos de "dia inteiro" no Google Agenda e, por isso, ficam todos empilhados numa faixa só no
--   topo do dia (sem ordem visível). Agora, só os prazos/tarefas CRIADOS DE AGORA EM DIANTE recebem um horário de organização (nunca
--   de vencimento: o prazo/tarefa continua valendo o dia inteiro), só para espalhar os eventos em linhas separadas na Agenda do
--   sistema e no Google. Este script só cria a coluna onde esse horário fica guardado; os prazos/tarefas antigos continuam sem hora
--   (do jeito que já estão, no Google e na Agenda).
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir — este script NÃO
--   depende de nenhuma versão numerada do banco, pode rodar em qualquer banco que já tenha as tabelas prazos_processo e tarefas).
--   Pode rodar quantas vezes quiser: só cria a coluna que ainda não existe.
-- O QUE FAZ: acrescenta a coluna `hora_agenda` (TIME, pode ficar vazia) em `prazos_processo` e em `tarefas`. Não apaga nem altera
--   nenhum dado existente. ALTER faz COMMIT automático no MySQL (não há ROLLBACK): o caminho de volta é o backup do banco.
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
                  WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('prazos_processo', 'tarefas'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @ok := IF(@db IS NOT NULL AND @n_chave = 2 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%', 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 2, 'ABORTADO: este banco NAO parece ser o do sistema (faltam as tabelas prazos_processo/tarefas). Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.')));

SET @tem_prazo := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'prazos_processo' AND COLUMN_NAME = 'hora_agenda'), 0);
SET @tem_tarefa := IF(@ok = 1, (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'hora_agenda'), 0);

SET @sql := IF(@ok = 1 AND @tem_prazo = 0,
 'ALTER TABLE `prazos_processo` ADD COLUMN `hora_agenda` time DEFAULT NULL COMMENT ''horario de organizacao na Agenda/Google (so prazos criados apos este script); nao e horario de vencimento'';',
 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@ok = 1 AND @tem_tarefa = 0,
 'ALTER TABLE `tarefas` ADD COLUMN `hora_agenda` time DEFAULT NULL COMMENT ''horario de organizacao na Agenda/Google (so tarefas criadas apos este script); nao e horario de vencimento'';',
 'DO 0;');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT
  IF(@ok = 0, @motivo,
     CONCAT('PRONTO — coluna hora_agenda: prazos_processo ', IF(@tem_prazo = 1, 'já existia', 'criada'),
            '; tarefas ', IF(@tem_tarefa = 1, 'já existia', 'criada'), '.')) AS resultado;
