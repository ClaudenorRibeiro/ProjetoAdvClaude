-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: AVISO DIÁRIO DE ANDAMENTOS DO DATAJUD (criado em 24/10/2026, pedido do usuário).
-- PARA QUE SERVE: o sistema passa a consultar o DataJud (CNJ) toda noite e a avisar cada pessoa, de manhã, dos andamentos NOVOS dos processos
--   (no sino, por e-mail, nos dois ou em nenhum, conforme cada pessoa escolher). O banco passa a guardar só 6 meses de andamentos do DataJud.
--   Este script cria os lugares onde isso fica guardado. É a mesma estrutura que o NovoJud-saas (migração 0040) já usa.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: só cria o que falta e só copia dados na primeira vez. Sem rodar este script o sistema novo NÃO funciona
--   direito, então rode-o junto com a atualização do código.
-- ORDEM EM PRODUÇÃO: depois de todas as versões anteriores (esta é a versão 7 do banco). Exige o banco já na versão do apenso (coluna
--   tblproc.apenso_de_id) e a tabela avisos_cliente.
-- ----------------------------------------------------------------------------------------------------------
-- O QUE FAZ:
--   a) tblproc: 4 colunas com o que se sabe do processo no CNJ (data da última atualização, quantidade de movimentos, data do último movimento
--      e o dia em que o CNJ não achou o processo);
--   b) andamento_processual: 2 colunas (novidade_em = entrou depois da primeira leitura do processo; avisado_em = já entrou num resumo) e um índice;
--   c) notificacoes: coluna "destino" (o sino pode abrir a tela "Novidades dos processos");
--   d) usuarios: como cada pessoa recebe o resumo (nenhum/sino/email/ambos; padrão NENHUM) e de quais processos (meus/todos; padrão meus);
--   e) configuracoes_escritorio: o resumo traz todos os andamentos ou só os importantes (padrão todos) e a que horas sai (padrão 07:30);
--   f) tabela nova datajud_tipos_andamento (um tipo por código do CNJ, para marcar quais são importantes);
--   g) copia de dados, SÓ na primeira vez: a data do último movimento DataJud de cada processo (a limpeza dos 6 meses não pode "rejuvenescer"
--      o processo em "Processos parados") e a lista de tipos que o banco já tem;
--   h) registra a versão 7 em controle_versao_banco, só se tudo terminar certo.
-- SEGURANÇA: não apaga nada e não altera nenhum dado existente (os andamentos antigos ficam como estão; a limpeza dos 6 meses é uma rotina
--   do sistema, que só roda depois que o código novo entrar). ALTER faz COMMIT automático no MySQL (não há ROLLBACK): o caminho de volta
--   é o backup do banco feito antes.
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e a coluna "itens_faltando" deve ser 0.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema? a versão do MySQL serve? o apenso (versão 5) e os avisos (versão 2) já estão aí?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','notificacoes','andamento_processual','tblproc','avisos_cliente','controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @tem_apenso := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'apenso_de_id');
SET @ok := IF(@db IS NOT NULL AND @n_chave = 7 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%' AND @tem_apenso = 1, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@n_chave <> 7, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Nada foi alterado.',
                  IF(@tem_apenso = 0, 'ABORTADO: este banco ainda nao esta na versao do processo apenso (versao 5). Atualize o banco ate a versao 6 antes. Nada foi alterado.',
                     'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.'))));

-- ---------- o que já existia antes deste script (para copiar dados SÓ na primeira vez)
SET @nova_proc := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'datajud_ultima_movimentacao') = 0, 1, 0);
SET @nova_tipos := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'datajud_tipos_andamento') = 0, 1, 0);

-- ---------- a) tblproc
SET @sql := IF(@ok = 1 AND @nova_proc = 1,
 'ALTER TABLE `tblproc`
    ADD COLUMN `datajud_atualizado_cnj` varchar(40) DEFAULT NULL COMMENT ''data da ultima atualizacao do processo no CNJ, como o CNJ informou (para so gravar quando mudou)'',
    ADD COLUMN `datajud_qtd_movimentos` int DEFAULT NULL COMMENT ''quantidade de movimentos que o CNJ informou na ultima consulta'',
    ADD COLUMN `datajud_ultima_movimentacao` date DEFAULT NULL COMMENT ''data do ultimo movimento do DataJud (vale para processos parados mesmo depois da limpeza dos 6 meses)'',
    ADD COLUMN `datajud_nao_encontrado_em` date DEFAULT NULL COMMENT ''dia em que o CNJ nao achou o processo (tenta de novo depois de 7 dias)''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- b) andamento_processual
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'andamento_processual' AND COLUMN_NAME = 'novidade_em') = 0,
 'ALTER TABLE `andamento_processual`
    ADD COLUMN `novidade_em` datetime DEFAULT NULL COMMENT ''quando um andamento do DataJud entrou DEPOIS da primeira leitura do processo (o que merece aviso)'',
    ADD COLUMN `avisado_em` datetime DEFAULT NULL COMMENT ''quando o andamento entrou num resumo de aviso'',
    ADD KEY `idx_andamento_novidade` (`novidade_em`)',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- c) notificacoes
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notificacoes' AND COLUMN_NAME = 'destino') = 0,
 'ALTER TABLE `notificacoes` ADD COLUMN `destino` varchar(30) DEFAULT NULL COMMENT ''tela que o sino abre ao clicar (ex.: novidades-processos)''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- d) usuarios
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'datajud_aviso_canal') = 0,
 'ALTER TABLE `usuarios`
    ADD COLUMN `datajud_aviso_canal` varchar(10) NOT NULL DEFAULT ''nenhum'' COMMENT ''como a pessoa recebe o resumo de andamentos do DataJud: nenhum, sino, email ou ambos'',
    ADD COLUMN `datajud_aviso_escopo` varchar(10) NOT NULL DEFAULT ''meus'' COMMENT ''de quais processos: meus (responsavel ou OAB do processo) ou todos'',
    ADD CONSTRAINT `ck_usuarios_datajud_canal` CHECK (`datajud_aviso_canal` IN (''nenhum'', ''sino'', ''email'', ''ambos'')),
    ADD CONSTRAINT `ck_usuarios_datajud_escopo` CHECK (`datajud_aviso_escopo` IN (''meus'', ''todos''))',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- e) configuracoes_escritorio
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'datajud_aviso_modo') = 0,
 'ALTER TABLE `configuracoes_escritorio`
    ADD COLUMN `datajud_aviso_modo` varchar(12) NOT NULL DEFAULT ''todos'' COMMENT ''o resumo traz todos os andamentos novos (todos) ou so os dos tipos marcados como importantes (importantes)'',
    ADD COLUMN `datajud_aviso_horario` char(5) NOT NULL DEFAULT ''07:30'' COMMENT ''hora (Brasilia, HH:MM) em que o resumo de andamentos sai'',
    ADD CONSTRAINT `ck_config_datajud_modo` CHECK (`datajud_aviso_modo` IN (''todos'', ''importantes'')),
    ADD CONSTRAINT `ck_config_datajud_horario` CHECK (`datajud_aviso_horario` REGEXP ''^([01][0-9]|2[0-3]):[0-5][0-9]$'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- f) tabela de tipos de andamento
SET @sql := IF(@ok = 1,
 'CREATE TABLE IF NOT EXISTS `datajud_tipos_andamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `codigo` int NOT NULL COMMENT ''codigo do movimento no CNJ'',
  `nome` varchar(150) NOT NULL,
  `importante` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = entra no resumo quando o modo e "importantes"'',
  `novo` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''1 = chegou e ninguem olhou ainda'',
  `quantidade` int NOT NULL DEFAULT ''0'' COMMENT ''quantas vezes o tipo ja apareceu'',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_datajud_tipo_codigo` (`codigo`),
  KEY `idx_datajud_tipo_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- g) copia de dados, só na primeira vez
-- g1) a data do último movimento do DataJud de cada processo
SET @sql := IF(@ok = 1 AND @nova_proc = 1,
 'UPDATE `tblproc` AS p
     SET p.`datajud_ultima_movimentacao` = (SELECT MAX(a.`data`) FROM `andamento_processual` AS a WHERE a.`processo_id` = p.`id` AND a.`fonte` = ''datajud'')
   WHERE p.`datajud_ultima_movimentacao` IS NULL',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
-- g2) os tipos de andamento que o banco já tem (todos "não importantes" e marcados como novos)
SET @sql := IF(@ok = 1 AND @nova_tipos = 1,
 'INSERT IGNORE INTO `datajud_tipos_andamento` (`codigo`, `nome`, `quantidade`)
  SELECT `codigo_movimento`, LEFT(MIN(SUBSTRING_INDEX(`descricao`, '' — '', 1)), 150), COUNT(*)
    FROM `andamento_processual`
   WHERE `fonte` = ''datajud'' AND `codigo_movimento` IS NOT NULL
   GROUP BY `codigo_movimento`',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência: o que ainda falta?
SET @esperadas := 'tblproc.datajud_atualizado_cnj,tblproc.datajud_qtd_movimentos,tblproc.datajud_ultima_movimentacao,tblproc.datajud_nao_encontrado_em,andamento_processual.novidade_em,andamento_processual.avisado_em,notificacoes.destino,usuarios.datajud_aviso_canal,usuarios.datajud_aviso_escopo,configuracoes_escritorio.datajud_aviso_modo,configuracoes_escritorio.datajud_aviso_horario';
SET @falta_col := IF(@ok = 1, 11 - (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND FIND_IN_SET(CONCAT(TABLE_NAME, '.', COLUMN_NAME), @esperadas) > 0), NULL);
SET @falta_idx := IF(@ok = 1, 1 - (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'andamento_processual' AND INDEX_NAME = 'idx_andamento_novidade'), NULL);
SET @falta_tab := IF(@ok = 1, 1 - (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'datajud_tipos_andamento'), NULL);
SET @falta_chk := IF(@ok = 1, 4 - (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = @db AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME IN ('ck_usuarios_datajud_canal','ck_usuarios_datajud_escopo','ck_config_datajud_modo','ck_config_datajud_horario')), NULL);
SET @itens_faltando := IF(@ok = 1, @falta_col + @falta_idx + @falta_tab + @falta_chk, NULL);
SET @tudo := IF(@ok = 1 AND @itens_faltando = 0, 1, 0);

-- ---------- h) registra a versão 7 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (7, ''Aviso diario de andamentos do DataJud (24/10/2026): colunas de controle no processo, no andamento, nas notificacoes, nos usuarios e nas configuracoes; tabela datajud_tipos_andamento'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versao_registrada := NULL;
SET @sql := IF(@tudo = 1, 'SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) INTO @versao_registrada FROM `controle_versao_banco` WHERE numero = 7', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: o banco esta pronto para o aviso diario de andamentos do DataJud.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha itens faltando (veja a coluna itens_faltando). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @itens_faltando AS itens_faltando,
       @versao_registrada AS versao_registrada;
