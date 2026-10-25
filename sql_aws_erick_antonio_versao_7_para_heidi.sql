-- IMPORTANTE — NÃO APAGAR até Erick e Antônio estarem na versão 7. Script de PRODUÇÃO (AWS) do banco, criado em 25/10/2026 a pedido do usuário.
-- PARA QUE SERVE: leva o banco do Erick (erick_adv) e o do Antônio (sistema_advocacia), que estão na VERSÃO 6, à VERSÃO 7 = aviso diário de
--   andamentos do DataJud. Ao terminar, a estrutura do banco fica idêntica à do arquivo estrutura_banco.sql.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em UM banco de cada vez, junto com a atualização do código (de noite, sem ninguém usando).
-- O QUE FAZ (só ACRESCENTA; não apaga nem altera nenhum dado existente):
--   a) tblproc: 4 colunas; andamento_processual: 2 colunas + 1 índice; notificacoes: 1 coluna; usuarios: 2 colunas + 2 regras;
--      configuracoes_escritorio: 2 colunas + 2 regras; tabela nova datajud_tipos_andamento;
--   b) copia, só na primeira vez: a data do último movimento do DataJud de cada processo e a lista de tipos de andamento que o banco já tem;
--   c) registra a versão 7 em controle_versao_banco, SÓ se a estrutura final ficou 100% igual à esperada.
-- TRAVAS (se qualquer uma falhar, NADA é alterado e a linha de resultado diz ABORTADO):
--   * o banco selecionado precisa se chamar erick_adv ou sistema_advocacia, ser MySQL 8.0.16 ou mais novo (não MariaDB) e ter as versões 1 a 6 registradas;
--   * o restante da estrutura (tudo que NÃO é desta versão) precisa estar exatamente como esperado (conferido por uma impressão digital da estrutura
--     inteira: colunas, tipos, índices, chaves, regras). Banco mexido à mão = recusa.
-- PODE RODAR MAIS DE UMA VEZ: se já estiver pronto, só diz "JA estava" e não muda nada.
-- ALTER faz COMMIT automático no MySQL (não existe ROLLBACK): o caminho de volta é o BACKUP feito antes.
-- COMO USAR (nesta ordem, em cada banco):
--   1) HeidiSQL: Exportar o banco como SQL (backup) e conferir que o arquivo não está com 0 KB.
--   2) Parar o sistema nessa instância.
--   3) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (erick_adv ou sistema_advocacia) e abrir este arquivo.
--   4) Executar TUDO com F9.
--   5) Ler a ÚNICA linha de resultado: deve dizer "PRONTO" (ou "JA estava") e itens_faltando = 0. Se disser ABORTADO ou ATENCAO, NÃO suba o
--      sistema novo e me envie a linha inteira.
-- ============================================================================================================
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;
SET SESSION group_concat_max_len = 4194304;
SET SESSION information_schema_stats_expiry = 0;
SET @db := DATABASE();

-- ---------- 0) travas básicas
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','configuracoes_escritorio','notificacoes','andamento_processual','tblproc','avisos_cliente','controle_versao_banco','tblpasta','acordo'));
SET @n_versoes := 0;
SET @maior_versao := 0;
SET @sql := IF(@n_chave = 9, 'SELECT IFNULL(SUM(`numero` BETWEEN 1 AND 6), 0), IFNULL(MAX(`numero`), 0) INTO @n_versoes, @maior_versao FROM `controle_versao_banco`', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @ok0 := IF(@db IN ('erick_adv','sistema_advocacia') AND @n_chave = 9 AND @mysql_num >= 80016 AND VERSION() NOT LIKE '%MariaDB%'
               AND @n_versoes = 6 AND @maior_versao BETWEEN 6 AND 7, 1, 0);
SET @motivo := IF(@ok0 = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@db NOT IN ('erick_adv','sistema_advocacia'), 'ABORTADO: este script so roda no banco erick_adv ou sistema_advocacia (os de producao). Nada foi alterado.',
                  IF(@n_chave <> 9, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Nada foi alterado.',
                  IF(@mysql_num < 80016 OR VERSION() LIKE '%MariaDB%', 'ABORTADO: o MySQL deste servidor nao serve (precisa ser MySQL 8.0.16 ou mais novo, nao MariaDB). Nada foi alterado.',
                  IF(@n_versoes <> 6, 'ABORTADO: o banco NAO esta na versao 6 (faltam versoes registradas de 1 a 6). Atualize ate a versao 6 antes. Nada foi alterado.',
                     'ABORTADO: o banco ja esta numa versao acima da 7. Nada foi alterado.'))))));

-- ---------- 1) retrato da estrutura atual (tabela temporária; o campo v7 marca o que pertence a esta versão)
DROP TEMPORARY TABLE IF EXISTS `_est`;
CREATE TEMPORARY TABLE `_est` (
  `k` varchar(5) NOT NULL,
  `v` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `v7` tinyint NOT NULL DEFAULT 0
) ENGINE=InnoDB;

SET @e_col := 'tblproc.datajud_atualizado_cnj,tblproc.datajud_qtd_movimentos,tblproc.datajud_ultima_movimentacao,tblproc.datajud_nao_encontrado_em,andamento_processual.novidade_em,andamento_processual.avisado_em,notificacoes.destino,usuarios.datajud_aviso_canal,usuarios.datajud_aviso_escopo,configuracoes_escritorio.datajud_aviso_modo,configuracoes_escritorio.datajud_aviso_horario';
SET @e_chk := 'ck_usuarios_datajud_canal,ck_usuarios_datajud_escopo,ck_config_datajud_modo,ck_config_datajud_horario';

INSERT INTO `_est` (`k`, `v`, `v7`)
SELECT 'COL', CONCAT(c.TABLE_NAME, '.', c.COLUMN_NAME, ' ', c.COLUMN_TYPE, ' ', c.IS_NULLABLE, ' ', IFNULL(c.COLUMN_DEFAULT, '~'), ' ', c.EXTRA, ' ', IFNULL(c.COLLATION_NAME, '')),
       IF(c.TABLE_NAME = 'datajud_tipos_andamento' OR FIND_IN_SET(CONCAT(c.TABLE_NAME, '.', c.COLUMN_NAME), @e_col) > 0, 1, 0)
  FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = @db
UNION ALL
SELECT 'IDX', CONCAT(s.TABLE_NAME, '.', s.INDEX_NAME, ' ', s.NON_UNIQUE, ' ', s.SEQ_IN_INDEX, ' ', s.COLUMN_NAME, ' ', IFNULL(s.SUB_PART, '')),
       IF(s.TABLE_NAME = 'datajud_tipos_andamento' OR (s.TABLE_NAME = 'andamento_processual' AND s.INDEX_NAME = 'idx_andamento_novidade'), 1, 0)
  FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = @db
UNION ALL
SELECT 'FK', CONCAT(r.TABLE_NAME, '.', r.CONSTRAINT_NAME, ' ', r.REFERENCED_TABLE_NAME, ' ', r.UPDATE_RULE, ' ', r.DELETE_RULE),
       IF(r.TABLE_NAME = 'datajud_tipos_andamento', 1, 0)
  FROM information_schema.REFERENTIAL_CONSTRAINTS r WHERE r.CONSTRAINT_SCHEMA = @db
UNION ALL
SELECT 'KCU', CONCAT(k.TABLE_NAME, '.', k.CONSTRAINT_NAME, ' ', k.ORDINAL_POSITION, ' ', k.COLUMN_NAME, ' ', k.REFERENCED_COLUMN_NAME),
       IF(k.TABLE_NAME = 'datajud_tipos_andamento', 1, 0)
  FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = @db AND k.REFERENCED_TABLE_NAME IS NOT NULL
UNION ALL
SELECT 'CHK', CONCAT(t.TABLE_NAME, '.', c.CONSTRAINT_NAME, ' ', c.CHECK_CLAUSE),
       IF(c.CONSTRAINT_NAME IN ('ck_usuarios_datajud_canal','ck_usuarios_datajud_escopo','ck_config_datajud_modo','ck_config_datajud_horario'), 1, 0)
  FROM information_schema.CHECK_CONSTRAINTS c
  JOIN information_schema.TABLE_CONSTRAINTS t ON t.CONSTRAINT_SCHEMA = c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME = c.CONSTRAINT_NAME
 WHERE c.CONSTRAINT_SCHEMA = @db
UNION ALL
SELECT 'TRG', tg.TRIGGER_NAME, 0 FROM information_schema.TRIGGERS tg WHERE tg.TRIGGER_SCHEMA = @db
UNION ALL
SELECT 'ENG', CONCAT(tb.TABLE_NAME, ' ', tb.ENGINE, ' ', tb.TABLE_COLLATION), IF(tb.TABLE_NAME = 'datajud_tipos_andamento', 1, 0)
  FROM information_schema.TABLES tb WHERE tb.TABLE_SCHEMA = @db AND tb.TABLE_TYPE = 'BASE TABLE';

-- impressões digitais: só o que NÃO é desta versão (tem de ser igual ao esperado) e a estrutura inteira (esperada ao final)
SET @h_fora := (SELECT MD5(IFNULL(GROUP_CONCAT(CONCAT(`k`, ' ', `v`) ORDER BY `k`, `v` SEPARATOR '\n'), '')) FROM `_est` WHERE `v7` = 0);
SET @n_fora := (SELECT COUNT(*) FROM `_est` WHERE `v7` = 0);
SET @h_tudo := (SELECT MD5(IFNULL(GROUP_CONCAT(CONCAT(`k`, ' ', `v`) ORDER BY `k`, `v` SEPARATOR '\n'), '')) FROM `_est`);
SET @n_tudo := (SELECT COUNT(*) FROM `_est`);

-- valores esperados (tirados do estrutura_banco.sql atual e dos dumps de produção de 25/10/2026)
SET @H_FORA_ESPERADO := '0596bd9b078faa57217d4320ac2378f7';
SET @N_FORA_ESPERADO := 1911;
SET @H_TUDO_ESPERADO := '403c00ae03bbc70a6640e022ed7318e4';
SET @N_TUDO_ESPERADO := 1938;

SET @ok := IF(@ok0 = 1 AND @h_fora = @H_FORA_ESPERADO AND @n_fora = @N_FORA_ESPERADO, 1, 0);
SET @motivo := IF(@ok0 = 0, @motivo,
                  IF(@ok = 1, 'OK',
                     'ABORTADO: a estrutura deste banco NAO e a esperada (alguem mexeu nele ou ele nao e o banco de producao conferido em 25/10/2026). Nada foi alterado - me envie esta linha.'));

-- ---------- o que já existia antes (para copiar dados só na primeira vez: enquanto a versão 7 não estiver registrada)
SET @v7_registrada := 1;
SET @sql := IF(@ok0 = 1, 'SELECT COUNT(*) INTO @v7_registrada FROM `controle_versao_banco` WHERE `numero` = 7', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @copiar := IF(@ok = 1 AND @v7_registrada = 0, 1, 0);

-- ---------- a) tblproc
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tblproc' AND COLUMN_NAME = 'datajud_atualizado_cnj') = 0,
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

-- ---------- g) cópia de dados, só enquanto a versão 7 não estiver registrada (só preenche o que está vazio; não apaga nada)
-- g1) a data do último movimento do DataJud de cada processo (a limpeza dos 6 meses não pode "rejuvenescer" o processo em "Processos parados")
SET @sql := IF(@copiar = 1,
 'UPDATE `tblproc` AS p
     SET p.`datajud_ultima_movimentacao` = (SELECT MAX(a.`data`) FROM `andamento_processual` AS a WHERE a.`processo_id` = p.`id` AND a.`fonte` = ''datajud'')
   WHERE p.`datajud_ultima_movimentacao` IS NULL',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
-- g2) os tipos de andamento que o banco já tem (todos "não importantes" e marcados como novos)
SET @sql := IF(@copiar = 1,
 'INSERT IGNORE INTO `datajud_tipos_andamento` (`codigo`, `nome`, `quantidade`)
  SELECT `codigo_movimento`, LEFT(MIN(SUBSTRING_INDEX(`descricao`, '' — '', 1)), 150), COUNT(*)
    FROM `andamento_processual`
   WHERE `fonte` = ''datajud'' AND `codigo_movimento` IS NOT NULL
   GROUP BY `codigo_movimento`',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- conferência final: a estrutura inteira tem de ficar IDÊNTICA à esperada
TRUNCATE TABLE `_est`;
INSERT INTO `_est` (`k`, `v`, `v7`)
SELECT 'COL', CONCAT(c.TABLE_NAME, '.', c.COLUMN_NAME, ' ', c.COLUMN_TYPE, ' ', c.IS_NULLABLE, ' ', IFNULL(c.COLUMN_DEFAULT, '~'), ' ', c.EXTRA, ' ', IFNULL(c.COLLATION_NAME, '')), 0
  FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = @db
UNION ALL
SELECT 'IDX', CONCAT(s.TABLE_NAME, '.', s.INDEX_NAME, ' ', s.NON_UNIQUE, ' ', s.SEQ_IN_INDEX, ' ', s.COLUMN_NAME, ' ', IFNULL(s.SUB_PART, '')), 0
  FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = @db
UNION ALL
SELECT 'FK', CONCAT(r.TABLE_NAME, '.', r.CONSTRAINT_NAME, ' ', r.REFERENCED_TABLE_NAME, ' ', r.UPDATE_RULE, ' ', r.DELETE_RULE), 0
  FROM information_schema.REFERENTIAL_CONSTRAINTS r WHERE r.CONSTRAINT_SCHEMA = @db
UNION ALL
SELECT 'KCU', CONCAT(k.TABLE_NAME, '.', k.CONSTRAINT_NAME, ' ', k.ORDINAL_POSITION, ' ', k.COLUMN_NAME, ' ', k.REFERENCED_COLUMN_NAME), 0
  FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = @db AND k.REFERENCED_TABLE_NAME IS NOT NULL
UNION ALL
SELECT 'CHK', CONCAT(t.TABLE_NAME, '.', c.CONSTRAINT_NAME, ' ', c.CHECK_CLAUSE), 0
  FROM information_schema.CHECK_CONSTRAINTS c
  JOIN information_schema.TABLE_CONSTRAINTS t ON t.CONSTRAINT_SCHEMA = c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME = c.CONSTRAINT_NAME
 WHERE c.CONSTRAINT_SCHEMA = @db
UNION ALL
SELECT 'TRG', tg.TRIGGER_NAME, 0 FROM information_schema.TRIGGERS tg WHERE tg.TRIGGER_SCHEMA = @db
UNION ALL
SELECT 'ENG', CONCAT(tb.TABLE_NAME, ' ', tb.ENGINE, ' ', tb.TABLE_COLLATION), 0
  FROM information_schema.TABLES tb WHERE tb.TABLE_SCHEMA = @db AND tb.TABLE_TYPE = 'BASE TABLE';
SET @h_final := (SELECT MD5(IFNULL(GROUP_CONCAT(CONCAT(`k`, ' ', `v`) ORDER BY `k`, `v` SEPARATOR '\n'), '')) FROM `_est`);
SET @n_final := (SELECT COUNT(*) FROM `_est`);
DROP TEMPORARY TABLE IF EXISTS `_est`;

SET @tudo := IF(@ok = 1 AND @h_final = @H_TUDO_ESPERADO AND @n_final = @N_TUDO_ESPERADO, 1, 0);
SET @itens_faltando := IF(@ok = 1, IF(@tudo = 1, 0, ABS(@N_TUDO_ESPERADO - @n_final) + IF(@h_final = @H_TUDO_ESPERADO, 0, 1)), NULL);

-- ---------- h) registra a versão 7 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (7, ''Aviso diario de andamentos do DataJud (24/10/2026): colunas de controle no processo, no andamento, nas notificacoes, nos usuarios e nas configuracoes; tabela datajud_tipos_andamento'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @versao_registrada := NULL;
SET @sql := IF(@tudo = 1, 'SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) INTO @versao_registrada FROM `controle_versao_banco` WHERE numero = 7', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (UMA linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, IF(@v7_registrada = 1, 'JA estava: o banco ja estava na versao 7 e a estrutura confere. Nada foi alterado.',
                        'PRONTO: o banco esta na versao 7 (aviso diario de andamentos do DataJud) e a estrutura confere com a esperada.'),
          IF(@ok = 1, 'ATENCAO: o script terminou mas a estrutura final NAO confere com a esperada. NAO suba o sistema novo; me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @itens_faltando AS itens_faltando,
       @versao_registrada AS versao_registrada,
       @h_fora AS diag_fora,
       @n_fora AS diag_n_fora,
       @h_final AS diag_final,
       @n_final AS diag_n_final;
