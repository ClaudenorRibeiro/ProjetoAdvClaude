-- IMPORTANTE — NÃO APAGAR. SCRIPT ÚNICO para PREPARAR o banco das instâncias de produção AWS-Erick e AWS-Antônio (criado em 11/10/2026, pedido do usuário).
-- PARA QUE SERVE: deixa o banco de cada instância IGUAL ao banco local e ao estrutura_banco.sql (os 4 bancos precisam ser iguais para rodar o mesmo sistema).
--   Reúne, em ordem, as versões 1 a 4 do banco (os scripts sql_atualizar_banco_para_heidi, sql_avisos_clientes, sql_cor_etiqueta_acordo e
--   sql_permissao_repasses_financeiro, que ficam só como histórico). Em um banco que já está na versão 1 (caso do Erick e do Antônio, desde 04/10/2026),
--   faz só o que falta: versões 2, 3 e 4.
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em CADA instância (AWS-Erick e AWS-Antônio), só quando ele decidir, com backup antes e o sistema parado.
--   PODE RODAR QUANTAS VEZES QUISER no mesmo banco: o que já está pronto não é refeito nem duplicado. No banco LOCAL também é seguro (não muda nada).
-- ----------------------------------------------------------------------------------------------------------------------------------------
-- COMO USAR (nesta ordem):
--   1) Fora do horário de uso: parar o sistema na instância e fazer o BACKUP do banco (HeidiSQL: Exportar banco como SQL); conferir que o arquivo não tem 0 KB.
--   2) HeidiSQL: abrir a conexão da instância, CLICAR NO BANCO DO SISTEMA na lista da esquerda (erick_adv no Erick; sistema_advocacia no Antônio) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a ABA 1 do resultado (uma única linha): a coluna "situacao" deve começar com "PRONTO". Se disser "ABORTADO" ou "ATENCAO", NADA de errado foi
--      deixado no banco: me envie a linha e, se existir, a ABA 2 (lista de diferenças).
--   5) SÓ DEPOIS de "PRONTO": atualizar o código do sistema na instância e iniciar de novo.
-- ----------------------------------------------------------------------------------------------------------------------------------------
-- O QUE O SCRIPT CONFERE ANTES DE MEXER EM QUALQUER COISA (se algo não bater, NÃO altera nada e avisa):
--   * há um banco selecionado e o NOME dele é exatamente erick_adv ou sistema_advocacia (qualquer outro nome é recusado);
--   * as 21 tabelas principais do sistema existem, o MySQL é 8.0.16 ou mais novo (MariaDB é recusado) e a collation do sistema existe;
--   * a versão registrada no banco (tabela controle_versao_banco) não é maior que a deste script (4);
--   * a ESTRUTURA INTEIRA do banco (95 tabelas: colunas, tipos, índices, chaves e regras) é a esperada ou só difere nos itens que este script acrescenta.
--     Qualquer outra diferença (algo que alguém mudou à mão, por exemplo) faz o script PARAR, sem alterar nada, e listar o que encontrou na ABA 2.
-- O QUE O SCRIPT FAZ (só cria/ajusta o que falta):
--   Versão 1: tabelas e colunas do Financeiro e das contas bancárias, tabelas de Relatórios, limites de relatórios, remove tblpasta.area_direito e
--     aumenta modelo_documento.destino de 20 para 40 letras.
--   Versão 2: avisos aos clientes (tabela avisos_cliente; colunas e travas de WhatsApp/SMS nos telefones; opções em configuracoes_escritorio;
--     log_comunicacoes.aviso_id; parabens_enviados.usuario_id passa a aceitar vazio).
--   Versão 3: configuracoes_escritorio.cor_etiqueta_acordo.
--   Versão 4: dá o sub-item Repasses (Financeiro) a quem já tem Alterar no Financeiro.
-- ÚNICOS DADOS QUE ELE ALTERA (e só na primeira vez; depois que a versão fica registrada nunca mais mexe):
--   (a) telefones: o número PRINCIPAL e ativo de cada pessoa, quando parece celular (DDD + 9 dígitos começando em 9), é marcado como WhatsApp e SMS;
--       só se ninguém tiver marcação ainda e a versão 2 ainda não estiver registrada;
--   (b) permissões: quem tem Alterar no Financeiro ganha o sub-item Repasses (sem ele só o administrador repassa); nunca mexe em quem já tem linha dele.
-- FIM: confere a estrutura inteira de novo; só diz PRONTO se ficou 100% igual ao estrutura_banco.sql, e só então registra as versões 1 a 4.
-- OBSERVAÇÃO: os COMENTÁRIOS das colunas não são comparados nem alterados (não afetam o funcionamento do sistema).
-- PRIVILÉGIOS: o usuário do HeidiSQL precisa poder criar tabelas, alterar tabelas e criar TABELAS TEMPORÁRIAS (usadas só durante a conferência; somem sozinhas).
--   Se faltar algum privilégio, o MySQL avisa logo no começo, antes de qualquer alteração importante.
-- SEGURANÇA: CREATE/ALTER fazem COMMIT automático no MySQL (não há ROLLBACK): o caminho de volta é o BACKUP do passo 1.
-- ========================================================================================================================================
SET NAMES utf8mb4;
SET SESSION group_concat_max_len = 1000000;
SET SESSION sql_safe_updates = 0;   -- so desta conexao (o MySQL Workbench liga isso por padrao e recusaria a marcacao dos telefones)
SET @db := DATABASE();
-- (sem banco selecionado o MySQL nao deixa nem montar a conferencia: mostra o aviso em portugues primeiro e para logo depois; nada e alterado)
SET @sql := IF(@db IS NULL, 'SELECT ''ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.'' AS situacao', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 0) este e mesmo o banco certo? o MySQL serve? em que versao o banco esta?
SET @nome_ok := IF(@db IN ('erick_adv', 'sistema_advocacia'), 1, 0);
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN ('usuarios', 'configuracoes_escritorio', 'pessoas_fisicas', 'pessoas_juridicas', 'tblpasta', 'tblproc', 'acordo', 'acordo_parcela', 'conta_corrente', 'forma_pagamento', 'advogados_freela', 'profissao', 'telefones_pf', 'telefones_pj', 'pericia', 'audiencia', 'log_comunicacoes', 'parabens_enviados', 'modelo_documento', 'permissoes', 'controle_versao_banco'));
SET @mysql_num := CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) * 10000
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED) * 100
                + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 3), '.', -1) AS UNSIGNED);
SET @e_mariadb := IF(VERSION() LIKE '%MariaDB%', 1, 0);
SET @n_coll := (SELECT COUNT(*) FROM information_schema.COLLATIONS WHERE COLLATION_NAME = 'utf8mb4_0900_ai_ci');
SET @sql := IF(@n_chave = 21, 'SELECT COALESCE(MAX(numero), 0) INTO @versao_antes FROM `controle_versao_banco`', 'SET @versao_antes := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @ok0 := IF(@db IS NOT NULL AND @nome_ok = 1 AND @n_chave = 21 AND @mysql_num >= 80016 AND @e_mariadb = 0 AND @n_coll = 1 AND @versao_antes <= 4, 1, 0);
SET @motivo0 := IF(@ok0 = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                  IF(@nome_ok = 0, CONCAT('ABORTADO: o banco selecionado se chama ', @db, ' e este script so roda em erick_adv ou sistema_advocacia. Nada foi alterado.'),
                  IF(@n_chave <> 21, 'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas principais). Nada foi alterado.',
                  IF(@e_mariadb = 1 OR @mysql_num < 80016, 'ABORTADO: o MySQL deste servidor e antigo demais (precisa ser MySQL 8.0.16 ou mais novo). Nada foi alterado - avise o suporte.',
                  IF(@n_coll = 0, 'ABORTADO: este servidor nao tem a collation utf8mb4_0900_ai_ci. Nada foi alterado - avise o suporte.',
                     CONCAT('ABORTADO: este banco esta na versao ', @versao_antes, ', mais nova que a deste script (4). Use um script mais novo. Nada foi alterado.')))))));

-- ---------- 1) confere a ESTRUTURA ATUAL do banco com a estrutura esperada (lida do proprio banco; so leitura)
--   _esperado = a estrutura completa do estrutura_banco.sql (coluna "novo" = item que este script acrescenta);
--   _antigo_ok = os 2 itens antigos que este script troca; _atual = o que o banco tem agora. Tabelas temporarias: somem sozinhas.
DROP TEMPORARY TABLE IF EXISTS `_esperado`;
DROP TEMPORARY TABLE IF EXISTS `_antigo_ok`;
DROP TEMPORARY TABLE IF EXISTS `_atual`;
DROP TEMPORARY TABLE IF EXISTS `_dif`;
CREATE TEMPORARY TABLE `_esperado` (`linha` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, `novo` tinyint NOT NULL DEFAULT 0);
CREATE TEMPORARY TABLE `_antigo_ok` (`linha` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL);
CREATE TEMPORARY TABLE `_atual` (`linha` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL);
CREATE TEMPORARY TABLE `_dif` (`tipo` varchar(20) NOT NULL, `conhecida` tinyint NOT NULL, `linha` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|acordo_parcela_multa|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|acordo_parcela_multa|criado_por|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|honor_percentual|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|honor_tipo|varchar(10)|NO|percent||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|honor_valor|decimal(15,2)|NO|0.00||', 0),
  ('C|acordo_parcela_multa|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|acordo_parcela_multa|parcela_id|int|NO|<NULL>||', 0),
  ('C|acordo_parcela_multa|parceria_percentual|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|parceria_pessoa_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|parceria_pessoa_tipo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|parceria_tipo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|parceria_valor|decimal(15,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|percentual_juiz|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|recebido_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|recebimento_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|recebimento_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|recebimento_identificacao|varchar(120)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_cliente_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_conta_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_destino_snapshot|longtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_cliente_destino_tipo|varchar(15)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_cliente_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_habilitado|tinyint(1)|NO|0||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_cliente_pessoa_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_por|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_cliente_tipo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_conta_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_destino_snapshot|longtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_destino_tipo|varchar(15)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_habilitado|tinyint(1)|NO|0||', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|repasse_parceiro_por|int|YES|<NULL>||', 0),
  ('C|acordo_parcela_multa|status|varchar(15)|NO|pendente||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela_multa|valor_bruto|decimal(15,2)|NO|<NULL>||', 0),
  ('C|acordo_parcela_multa|valor_liquido|decimal(15,2)|NO|0.00||', 0),
  ('C|acordo_parcela_multa|vencimento|date|NO|<NULL>||', 0),
  ('C|acordo_parcela|acordo_id|int|NO|<NULL>||', 0),
  ('C|acordo_parcela|honor_percentual|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela|honor_tipo|varchar(10)|NO|percent||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|honor_valor|decimal(15,2)|NO|0.00||', 0),
  ('C|acordo_parcela|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|acordo_parcela|multa_percentual|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela|numero|int|NO|<NULL>||', 0),
  ('C|acordo_parcela|observacao|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|parceria_percentual|decimal(5,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela|parceria_pessoa_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|parceria_pessoa_tipo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|parceria_tipo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|parceria_valor|decimal(15,2)|YES|<NULL>||', 0),
  ('C|acordo_parcela|recebido_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela|recebimento_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|recebimento_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|recebimento_identificacao|varchar(120)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|recebimento_instituicao_origem_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_conta_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_destino_snapshot|longtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_cliente_destino_tipo|varchar(15)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_cliente_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_instituicao_destino_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_cliente_pessoa_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_por|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_cliente_tipo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_parceiro_conta_financeira_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_parceiro_conta_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_parceiro_destino_snapshot|longtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_parceiro_destino_tipo|varchar(15)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_parceiro_em|date|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_parceiro_forma_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_parceiro_instituicao_destino_id|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|repasse_parceiro_observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo_parcela|repasse_parceiro_por|int|YES|<NULL>||', 0),
  ('C|acordo_parcela|status|varchar(15)|NO|pendente||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|acordo_parcela|valor_bruto|decimal(15,2)|NO|0.00||', 0),
  ('C|acordo_parcela|valor_liquido|decimal(15,2)|NO|0.00||', 0),
  ('C|acordo_parcela|vencimento|date|NO|<NULL>||', 0),
  ('C|acordo|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|acordo|alterado_por|int|YES|<NULL>||', 0),
  ('C|acordo|beneficiario_cliente_conta_id|int|YES|<NULL>||', 0),
  ('C|acordo|beneficiario_cliente_id|int|YES|<NULL>||', 0),
  ('C|acordo|beneficiario_cliente_tipo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|acordo|criado_por|int|YES|<NULL>||', 0),
  ('C|acordo|data_primeira|date|NO|<NULL>||', 0),
  ('C|acordo|descricao|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|acordo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|acordo|processo_id|int|NO|<NULL>||', 0),
  ('C|acordo|qtd_parcelas|int|NO|<NULL>||', 0),
  ('C|acordo|status|varchar(20)|NO|ativo||utf8mb4_0900_ai_ci', 0),
  ('C|acordo|tipo|varchar(10)|NO|acordo||utf8mb4_0900_ai_ci', 0),
  ('C|acordo|valor_total|decimal(15,2)|NO|<NULL>||', 0),
  ('C|advogados_freela|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|cep|varchar(9)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|complemento|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|advogados_freela|criado_por|int|YES|<NULL>||', 0),
  ('C|advogados_freela|email|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|estado|char(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|advogados_freela|logradouro|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|nome|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|numero|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|oab|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|advogados_freela|profissao_id|int|YES|<NULL>||', 0),
  ('C|advogados_freela|telefone|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|agenda_compromisso|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|agenda_compromisso|concluido_em|datetime|YES|<NULL>||', 0),
  ('C|agenda_compromisso|concluido_por|int|YES|<NULL>||', 0),
  ('C|agenda_compromisso|concluido|tinyint(1)|NO|0||', 0),
  ('C|agenda_compromisso|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|agenda_compromisso|data|date|NO|<NULL>||', 0),
  ('C|agenda_compromisso|delegado_para|int|YES|<NULL>||', 0),
  ('C|agenda_compromisso|descricao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|agenda_compromisso|dia_todo|tinyint(1)|NO|0||', 0),
  ('C|agenda_compromisso|escritorio|tinyint(1)|NO|0||', 0),
  ('C|agenda_compromisso|hora_fim|time|YES|<NULL>||', 0),
  ('C|agenda_compromisso|hora_inicio|time|YES|<NULL>||', 0),
  ('C|agenda_compromisso|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|agenda_compromisso|publicacao_id|int|YES|<NULL>||', 0),
  ('C|agenda_compromisso|titulo|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|agenda_compromisso|usuario_id|int|NO|<NULL>||', 0),
  ('C|andamento_processual|codigo_movimento|int|YES|<NULL>||', 0),
  ('C|andamento_processual|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|andamento_processual|criado_por|int|YES|<NULL>||', 0),
  ('C|andamento_processual|data_hora|datetime|YES|<NULL>||', 0),
  ('C|andamento_processual|data|date|NO|<NULL>||', 0),
  ('C|andamento_processual|descricao|text|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|andamento_processual|editado_em|datetime|YES|<NULL>||', 0),
  ('C|andamento_processual|editado_por|int|YES|<NULL>||', 0),
  ('C|andamento_processual|fonte|varchar(10)|NO|manual||utf8mb4_0900_ai_ci', 0),
  ('C|andamento_processual|hash_movimento|char(40)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|andamento_processual|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|andamento_processual|processo_id|int|NO|<NULL>||', 0),
  ('C|ata_audiencia_itens|ata_audiencia_id|int|NO|<NULL>||', 0),
  ('C|ata_audiencia_itens|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|ata_audiencia_itens|data_referencia|date|YES|<NULL>||', 0),
  ('C|ata_audiencia_itens|descricao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|ata_audiencia_itens|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|ata_audiencia_itens|registro_id|int|YES|<NULL>||', 0),
  ('C|ata_audiencia_itens|tipo|varchar(40)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|ata_audiencia_itens|titulo|varchar(255)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|ata_audiencia|advogado_freela_id|int|YES|<NULL>||', 0),
  ('C|ata_audiencia|advogado_id|int|YES|<NULL>||', 0),
  ('C|ata_audiencia|audiencia_id|int|NO|<NULL>||', 0),
  ('C|ata_audiencia|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|ata_audiencia|criado_por|int|NO|<NULL>||', 0),
  ('C|ata_audiencia|data_primeiro_pagamento|date|YES|<NULL>||', 0),
  ('C|ata_audiencia|houve_acordo|tinyint(1)|YES|0||', 0),
  ('C|ata_audiencia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|ata_audiencia|nova_audiencia|tinyint(1)|YES|0||', 0),
  ('C|ata_audiencia|observacoes|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|ata_audiencia|parcelas|int|YES|<NULL>||', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|ata_audiencia|resultado|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|ata_audiencia|sem_advogado|tinyint|YES|0||', 0),
  ('C|ata_audiencia|teve_alvara|tinyint|YES|0||', 0),
  ('C|ata_audiencia|teve_desistencia|tinyint|YES|0||', 0),
  ('C|ata_audiencia|teve_pericia|tinyint|YES|0||', 0),
  ('C|ata_audiencia|teve_prazo|tinyint|YES|0||', 0),
  ('C|ata_audiencia|teve_retorno_autos|tinyint|YES|0||', 0),
  ('C|ata_audiencia|valor_acordo|decimal(15,2)|YES|<NULL>||', 0),
  ('C|ata_audiencia|valor_parcela|decimal(15,2)|YES|<NULL>||', 0),
  ('C|audiencia_responsaveis|audiencia_id|int|NO|<NULL>||', 0),
  ('C|audiencia_responsaveis|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|audiencia_responsaveis|criado_por|int|NO|<NULL>||', 0),
  ('C|audiencia_responsaveis|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|audiencia_responsaveis|responsavel_freela_id|int|YES|<NULL>||', 0),
  ('C|audiencia_responsaveis|responsavel_id|int|YES|<NULL>||', 0),
  ('C|audiencia_testemunhas|audiencia_id|int|NO|<NULL>||', 0),
  ('C|audiencia_testemunhas|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|audiencia_testemunhas|criado_por|int|YES|<NULL>||', 0),
  ('C|audiencia_testemunhas|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|audiencia_testemunhas|parte_pessoa_id|int|YES|<NULL>||', 0),
  ('C|audiencia_testemunhas|pessoa_id|int|NO|<NULL>||', 0),
  ('C|audiencia_testemunhas|polo|varchar(10)|NO|autor||utf8mb4_0900_ai_ci', 0),
  ('C|audiencias_etiquetas|audiencia_id|int|NO|<NULL>||', 0),
  ('C|audiencias_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|audiencias_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|audiencia|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|audiencia|alterado_por|int|YES|<NULL>||', 0),
  ('C|audiencia|ata_impressa|tinyint(1)|YES|0||', 0),
  ('C|audiencia|comunicado_enviado|tinyint(1)|YES|0||', 0),
  ('C|audiencia|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|audiencia|criado_por|int|NO|<NULL>||', 0),
  ('C|audiencia|data|date|NO|<NULL>||', 0),
  ('C|audiencia|horario_ativo|tinyint|YES|<NULL>|STORED GENERATED|', 0),
  ('C|audiencia|hora|time|NO|<NULL>||', 0),
  ('C|audiencia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|audiencia|link_virtual|varchar(500)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|local|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|modalidade|varchar(30)|YES|presencial||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|motivo_status|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|observacoes|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|plataforma_virtual|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|processo_id|int|NO|<NULL>||', 0),
  ('C|audiencia|publicacao_id|int|YES|<NULL>||', 0),
  ('C|audiencia|responsavel_freela_id|int|YES|<NULL>||', 0),
  ('C|audiencia|responsavel_id|int|YES|<NULL>||', 0),
  ('C|audiencia|status|varchar(20)|NO|agendada||utf8mb4_0900_ai_ci', 0),
  ('C|audiencia|tipo_audiencia_id|int|NO|<NULL>||', 0),
  ('C|audiencia|vara_id|int|YES|<NULL>||', 0),
  ('C|auditoria_audiencia|alterado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_audiencia|audiencia_id|int|NO|<NULL>||', 0),
  ('C|auditoria_audiencia|campo_alterado|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_audiencia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_audiencia|usuario_id|int|NO|<NULL>||', 0),
  ('C|auditoria_audiencia|valor_anterior|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_audiencia|valor_novo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_conta_corrente|acao|varchar(30)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_conta_corrente|campo_alterado|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_conta_corrente|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_conta_corrente|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_conta_corrente|lancamento_id|int|NO|<NULL>||', 0),
  ('C|auditoria_conta_corrente|usuario_id|int|NO|<NULL>||', 0),
  ('C|auditoria_conta_corrente|valor_anterior|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_conta_corrente|valor_novo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_etiqueta_escritorio|criado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_etiqueta_escritorio|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_etiqueta_escritorio|modulo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_etiqueta_escritorio|registro_id|int|NO|<NULL>||', 0),
  ('C|auditoria_etiqueta_escritorio|slot_anterior|tinyint|YES|<NULL>||', 0),
  ('C|auditoria_etiqueta_escritorio|slot_novo|tinyint|YES|<NULL>||', 0),
  ('C|auditoria_etiqueta_escritorio|usuario_id|int|NO|<NULL>||', 0),
  ('C|auditoria_parcela|acao|varchar(30)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_parcela|campo_alterado|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_parcela|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_parcela|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_parcela|parcela_id|int|NO|<NULL>||', 0),
  ('C|auditoria_parcela|usuario_id|int|NO|<NULL>||', 0),
  ('C|auditoria_parcela|valor_anterior|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_parcela|valor_novo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_pericia|alterado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_pericia|campo_alterado|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|auditoria_pericia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_pericia|pericia_id|int|NO|<NULL>||', 0),
  ('C|auditoria_pericia|usuario_id|int|NO|<NULL>||', 0),
  ('C|auditoria_pericia|valor_anterior|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_pericia|valor_novo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_prazo|alterado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|auditoria_prazo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|auditoria_prazo|observacao|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_prazo|prazo_id|int|NO|<NULL>||', 0),
  ('C|auditoria_prazo|status_anterior|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_prazo|status_novo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|auditoria_prazo|usuario_id|int|NO|<NULL>||', 0),
  ('C|avisos_cliente|assunto|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|audiencia_id|int|YES|<NULL>||', 1),
  ('C|avisos_cliente|cliente_id|int|NO|<NULL>||', 1),
  ('C|avisos_cliente|cliente_tipo|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 1),
  ('C|avisos_cliente|data_aviso|date|NO|<NULL>||', 1),
  ('C|avisos_cliente|data_evento|date|NO|<NULL>||', 1),
  ('C|avisos_cliente|decidido_em|datetime|YES|<NULL>||', 1),
  ('C|avisos_cliente|decidido_por|int|YES|<NULL>||', 1),
  ('C|avisos_cliente|id|int|NO|<NULL>|auto_increment|', 1),
  ('C|avisos_cliente|modo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|modulo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|motivo_status|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|pericia_id|int|YES|<NULL>||', 1),
  ('C|avisos_cliente|pessoa_fisica_id|int|YES|<NULL>||', 1),
  ('C|avisos_cliente|processo_id|int|YES|<NULL>||', 1),
  ('C|avisos_cliente|referencia_id|int|YES|<NULL>|VIRTUAL GENERATED|', 1),
  ('C|avisos_cliente|status|varchar(15)|NO|pendente||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|texto_editado|tinyint(1)|NO|0||', 1),
  ('C|avisos_cliente|texto|text|NO|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|avisos_cliente|tipo|varchar(15)|NO|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|calendario|data|date|NO|<NULL>||', 0),
  ('C|calendario|dia_util|tinyint(1)|NO|1||', 0),
  ('C|configuracoes_escritorio|advogado_principal_id|int|YES|<NULL>||', 0),
  ('C|configuracoes_escritorio|alerta_atrasado_ativo|tinyint(1)|YES|1||', 0),
  ('C|configuracoes_escritorio|alerta_emails|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|ata_advogado_obrigatorio|tinyint|YES|0||', 0),
  ('C|configuracoes_escritorio|avisos_audiencia_mostrar|tinyint(1)|NO|1||', 1),
  ('C|configuracoes_escritorio|avisos_parabens_mostrar|tinyint(1)|NO|1||', 1),
  ('C|configuracoes_escritorio|avisos_pericia_mostrar|tinyint(1)|NO|1||', 1),
  ('C|configuracoes_escritorio|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|cep|varchar(9)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|cnpj_cpf|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|cor_etiqueta_acordo|varchar(7)|YES|<NULL>||utf8mb4_0900_ai_ci', 1),
  ('C|configuracoes_escritorio|cor_principal|varchar(7)|YES|#1a56db||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|configuracoes_escritorio|dias_alerta_audiencia|int|YES|3||', 0),
  ('C|configuracoes_escritorio|dias_alerta_pericia|int|YES|2||', 0),
  ('C|configuracoes_escritorio|dias_audiencia_sem_adv|int|YES|7||', 0),
  ('C|configuracoes_escritorio|dias_aviso_parabens|int|NO|0||', 1),
  ('C|configuracoes_escritorio|dias_processo_parado|int|YES|365||', 0),
  ('C|configuracoes_escritorio|dias_sem_movimentacao|int|YES|30||', 0),
  ('C|configuracoes_escritorio|documentos_maiusculas|tinyint(1)|NO|0||', 0),
  ('C|configuracoes_escritorio|email|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|estado|varchar(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|horario_alerta_prazos_2|time|YES|<NULL>||', 0),
  ('C|configuracoes_escritorio|horario_alerta_prazos|time|YES|18:00:00||', 0),
  ('C|configuracoes_escritorio|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|configuracoes_escritorio|logo_base64|longtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|logradouro|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|max_relatorios_por_usuario|int|NO|10||', 0),
  ('C|configuracoes_escritorio|mensagem_aniversario|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|modelos_email_perito|json|YES|<NULL>||', 0),
  ('C|configuracoes_escritorio|nome|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|numero|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|oab_principal|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|prazo_fazendo_timeout|int|NO|60||', 0),
  ('C|configuracoes_escritorio|setup_concluido|tinyint(1)|YES|0||', 0),
  ('C|configuracoes_escritorio|telefone|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_escritorio|tempo_inatividade_min|int|NO|15||', 0),
  ('C|configuracoes_escritorio|titulo_aba|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|configuracoes_integracoes|ativo|tinyint(1)|YES|0||', 0),
  ('C|configuracoes_integracoes|atualizado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|configuracoes_integracoes|configuracoes|json|YES|<NULL>||', 0),
  ('C|configuracoes_integracoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|configuracoes_integracoes|modulo|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_corrente|conta_financeira_id|int|YES|<NULL>||', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|conta_corrente|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|conta_corrente|data|date|NO|<NULL>||', 0),
  ('C|conta_corrente|descricao|varchar(300)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_corrente|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|conta_corrente|origem|varchar(20)|NO|manual||utf8mb4_0900_ai_ci', 0),
  ('C|conta_corrente|parcela_id|int|YES|<NULL>||', 0),
  ('C|conta_corrente|processo_id|int|NO|<NULL>||', 0),
  ('C|conta_corrente|tipo|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_corrente|usuario_id|int|NO|<NULL>||', 0),
  ('C|conta_corrente|valor|decimal(15,2)|NO|<NULL>||', 0),
  ('C|conta_financeira|agencia|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|ativo|tinyint(1)|NO|1||', 0),
  ('C|conta_financeira|chave_pix|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|digito|varchar(5)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|conta_financeira|instituicao_financeira_id|int|YES|<NULL>||', 0),
  ('C|conta_financeira|nome|varchar(120)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|numero|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|conta_financeira|principal|tinyint(1)|NO|0||', 0),
  ('C|conta_financeira|tipo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|agencia|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|ativo|tinyint(1)|NO|1||', 0),
  ('C|contas_bancarias_pf|chave_pix|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|conta_terceiro|tinyint(1)|NO|0||', 0),
  ('C|contas_bancarias_pf|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|contas_bancarias_pf|digito|varchar(5)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|documento_titular|varchar(18)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|contas_bancarias_pf|instituicao_financeira_id|int|NO|<NULL>||', 0),
  ('C|contas_bancarias_pf|numero|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|pessoa_id|int|NO|<NULL>||', 0),
  ('C|contas_bancarias_pf|principal|tinyint(1)|NO|0||', 0),
  ('C|contas_bancarias_pf|tipo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pf|titular|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|agencia|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|ativo|tinyint(1)|NO|1||', 0),
  ('C|contas_bancarias_pj|chave_pix|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|conta_terceiro|tinyint(1)|NO|0||', 0),
  ('C|contas_bancarias_pj|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|contas_bancarias_pj|digito|varchar(5)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|documento_titular|varchar(18)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|contas_bancarias_pj|instituicao_financeira_id|int|NO|<NULL>||', 0),
  ('C|contas_bancarias_pj|numero|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|observacao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|pessoa_id|int|NO|<NULL>||', 0),
  ('C|contas_bancarias_pj|principal|tinyint(1)|NO|0||', 0),
  ('C|contas_bancarias_pj|tipo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|contas_bancarias_pj|titular|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|controle_versao_banco|aplicado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|controle_versao_banco|descricao|varchar(300)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|controle_versao_banco|numero|int|NO|<NULL>||', 0),
  ('C|controle_versao_banco|sql_aplicado|mediumtext|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|emails_pf|ativo|tinyint(1)|YES|1||', 0),
  ('C|emails_pf|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|emails_pf|email|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|emails_pf|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|emails_pf|pessoa_id|int|NO|<NULL>||', 0),
  ('C|emails_pf|principal|tinyint(1)|YES|0||', 0),
  ('C|emails_pj|ativo|tinyint(1)|YES|1||', 0),
  ('C|emails_pj|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|emails_pj|email|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|emails_pj|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|emails_pj|pessoa_id|int|NO|<NULL>||', 0),
  ('C|emails_pj|principal|tinyint(1)|YES|0||', 0),
  ('C|estado_civil|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|estado_civil|nome|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_definicoes|cor|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_definicoes|modulo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_definicoes|significado|varchar(60)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_definicoes|slot|tinyint|NO|<NULL>||', 0),
  ('C|etiquetas_definicoes|usuario_id|int|NO|<NULL>||', 0),
  ('C|etiquetas_escritorio_catalogo|cor|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_escritorio_catalogo|modulo|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_escritorio_catalogo|significado|varchar(60)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|etiquetas_escritorio_catalogo|slot|tinyint|NO|<NULL>||', 0),
  ('C|etiquetas_escritorio_catalogo|status_id|int|YES|<NULL>||', 0),
  ('C|feriados|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|feriados|criado_por|int|YES|<NULL>||', 0),
  ('C|feriados|data|date|NO|<NULL>||', 0),
  ('C|feriados|descricao|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|feriados|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|feriados|tipo|varchar(30)|YES|nacional||utf8mb4_0900_ai_ci', 0),
  ('C|forma_pagamento|ativo|tinyint(1)|NO|1||', 0),
  ('C|forma_pagamento|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|forma_pagamento|nome|varchar(60)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|forma_pagamento|uso_permitido|enum(''financeira'',''especie'',''ambos'')|NO|ambos||utf8mb4_0900_ai_ci', 0),
  ('C|genero|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|genero|nome|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|historico_atendimento|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|historico_atendimento|descricao|text|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|historico_atendimento|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|historico_atendimento|pessoa_id|int|NO|<NULL>||', 0),
  ('C|historico_atendimento|tipo_pessoa|varchar(20)|YES|fisica||utf8mb4_0900_ai_ci', 0),
  ('C|historico_atendimento|usuario_id|int|NO|<NULL>||', 0),
  ('C|instituicao_financeira|ativo|tinyint(1)|NO|1||', 0),
  ('C|instituicao_financeira|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|instituicao_financeira|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|assunto|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|aviso_id|int|YES|<NULL>||', 1),
  ('C|log_comunicacoes|canal|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|conteudo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|destinatario|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|enviado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|log_comunicacoes|enviado|tinyint(1)|YES|0||', 0),
  ('C|log_comunicacoes|erro_msg|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|log_comunicacoes|pessoa_id|int|YES|<NULL>||', 0),
  ('C|log_comunicacoes|processo_id|int|YES|<NULL>||', 0),
  ('C|log_comunicacoes|tipo_pessoa|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_comunicacoes|usuario_id|int|YES|<NULL>||', 0),
  ('C|log_documentos_gerados|ancora_id|int|YES|<NULL>||', 0),
  ('C|log_documentos_gerados|ancora_tipo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_documentos_gerados|formato|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_documentos_gerados|gerado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|log_documentos_gerados|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|log_documentos_gerados|modelo_id|int|YES|<NULL>||', 0),
  ('C|log_documentos_gerados|modelo_nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_documentos_gerados|nome_arquivo|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_documentos_gerados|referencia|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_documentos_gerados|usuario_id|int|NO|<NULL>||', 0),
  ('C|log_documentos_gerados|usuario_nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|assunto|varchar(255)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|destinatario_nome|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|enviado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|log_emails|erro|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|id|int unsigned|NO|<NULL>|auto_increment|', 0),
  ('C|log_emails|mensagem|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|para|varchar(255)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_emails|publicacao_id|int|YES|<NULL>||', 0),
  ('C|log_emails|status|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|log_publicacoes|acao_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|log_publicacoes|data_publicacao|date|YES|<NULL>||', 0),
  ('C|log_publicacoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|log_publicacoes|quantidade|int|NO|<NULL>||', 0),
  ('C|log_publicacoes|usuario_id|int|NO|<NULL>||', 0),
  ('C|logs_auditoria|acao|varchar(30)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|logs_auditoria|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|logs_auditoria|dados_antigos|json|YES|<NULL>||', 0),
  ('C|logs_auditoria|dados_novos|json|YES|<NULL>||', 0),
  ('C|logs_auditoria|descricao|varchar(255)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|logs_auditoria|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|logs_auditoria|registro_id|int|YES|<NULL>||', 0),
  ('C|logs_auditoria|tabela|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|logs_auditoria|usuario_id|int|YES|<NULL>||', 0),
  ('C|modelo_documento|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|modelo_documento|alterado_por|int|YES|<NULL>||', 0),
  ('C|modelo_documento|arquivo_s3_key|varchar(400)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|modelo_documento|ativo|tinyint(1)|NO|1||', 0),
  ('C|modelo_documento|blocos_exigidos|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|modelo_documento|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|modelo_documento|criado_por|int|YES|<NULL>||', 0),
  ('C|modelo_documento|descricao|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|modelo_documento|destino|varchar(40)|NO|comum||utf8mb4_0900_ai_ci', 1),
  ('C|modelo_documento|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|modelo_documento|minutos_antes|int|NO|0||', 0),
  ('C|modelo_documento|modalidade|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|modelo_documento|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|modelo_documento|subtipo_prazo_id|int|YES|<NULL>||', 0),
  ('C|modelo_documento|tipo_audiencia_id|int|YES|<NULL>||', 0),
  ('C|modelo_documento|tipo_pericia_id|int|YES|<NULL>||', 0),
  ('C|modelo_documento|variaveis_usadas|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|nacionalidade|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|nacionalidade|nome|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|notificacoes|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|notificacoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|notificacoes|lida|tinyint(1)|YES|0||', 0),
  ('C|notificacoes|mensagem|varchar(300)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|notificacoes|pessoa_id|int|YES|<NULL>||', 0),
  ('C|notificacoes|prazo_id|int|YES|<NULL>||', 0),
  ('C|notificacoes|tarefa_id|int|YES|<NULL>||', 0),
  ('C|notificacoes|usuario_id|int|NO|<NULL>||', 0),
  ('C|parabens_enviados|ano|smallint|NO|<NULL>||', 0),
  ('C|parabens_enviados|canal|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|parabens_enviados|enviado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|parabens_enviados|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|parabens_enviados|pessoa_id|int|NO|<NULL>||', 0),
  ('C|parabens_enviados|usuario_id|int|YES|<NULL>||', 1),
  ('C|parentesco|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|parentesco|nome|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pastas_etiquetas|pasta_id|int|NO|<NULL>||', 0),
  ('C|pastas_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|pastas_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento_item|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pendencia_documento_item|data_recebimento|date|YES|<NULL>||', 0),
  ('C|pendencia_documento_item|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pendencia_documento_item|pendencia_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento_item|recebido_por|int|YES|<NULL>||', 0),
  ('C|pendencia_documento_item|recebido|tinyint(1)|NO|0||', 0),
  ('C|pendencia_documento_item|tipo_documento_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento_responsavel|avisado_em|datetime|YES|<NULL>||', 0),
  ('C|pendencia_documento_responsavel|avisar_email|tinyint(1)|NO|0||', 0),
  ('C|pendencia_documento_responsavel|avisar_sino|tinyint(1)|NO|1||', 0),
  ('C|pendencia_documento_responsavel|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pendencia_documento_responsavel|criado_por|int|YES|<NULL>||', 0),
  ('C|pendencia_documento_responsavel|data_aviso|date|YES|<NULL>||', 0),
  ('C|pendencia_documento_responsavel|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pendencia_documento_responsavel|pendencia_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento_responsavel|usuario_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|pendencia_documento|alterado_por|int|YES|<NULL>||', 0),
  ('C|pendencia_documento|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pendencia_documento|criado_por|int|YES|<NULL>||', 0),
  ('C|pendencia_documento|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pendencia_documento|observacao|varchar(1000)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pendencia_documento|pessoa_id|int|NO|<NULL>||', 0),
  ('C|pendencia_documento|resolvido_em|datetime|YES|<NULL>||', 0),
  ('C|pendencia_documento|resolvido_por|int|YES|<NULL>||', 0),
  ('C|pendencia_documento|status|enum(''aberta'',''resolvida'',''cancelada'')|NO|aberta||utf8mb4_0900_ai_ci', 0),
  ('C|pendencia_documento|tipo_pessoa|enum(''fisica'',''juridica'')|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia_local_reu|criado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pericia_local_reu|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pericia_local_reu|pericia_id|int|NO|<NULL>||', 0),
  ('C|pericia_local_reu|pessoa_id|int|NO|<NULL>||', 0),
  ('C|pericia_local_reu|tipo_pessoa|enum(''fisica'',''juridica'')|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericias_etiquetas|pericia_id|int|NO|<NULL>||', 0),
  ('C|pericias_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|pericias_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|pericia|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|pericia|alterado_por|int|YES|<NULL>||', 0),
  ('C|pericia|assistente_tecnico_freela_id|int|YES|<NULL>||', 0),
  ('C|pericia|assistente_tecnico_id|int|YES|<NULL>||', 0),
  ('C|pericia|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|cep|varchar(9)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|complemento|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|comunicado_enviado|tinyint(1)|YES|0||', 0),
  ('C|pericia|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pericia|criado_por|int|NO|<NULL>||', 0),
  ('C|pericia|data|date|YES|<NULL>||', 0),
  ('C|pericia|email_perito_enviado|tinyint(1)|YES|0||', 0),
  ('C|pericia|estado|varchar(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|hora|time|YES|<NULL>||', 0),
  ('C|pericia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pericia|local|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|logradouro|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|motivo_status|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|numero|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|pericia|perito_id|int|YES|<NULL>||', 0),
  ('C|pericia|perito_tipo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|processo_id|int|NO|<NULL>||', 0),
  ('C|pericia|responsavel_freela_id|int|YES|<NULL>||', 0),
  ('C|pericia|responsavel_id|int|YES|<NULL>||', 0),
  ('C|pericia|status|varchar(20)|NO|agendada||utf8mb4_0900_ai_ci', 0),
  ('C|pericia|tipo_pericia_id|int|YES|<NULL>||', 0),
  ('C|permissoes|acao|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|permissoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|permissoes|modulo|varchar(50)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|permissoes|permitido|tinyint(1)|YES|0||', 0),
  ('C|permissoes|submodulo|varchar(50)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|permissoes|usuario_id|int|NO|<NULL>||', 0),
  ('C|pessoas_avisos_idade|avisado_em|datetime|YES|<NULL>||', 0),
  ('C|pessoas_avisos_idade|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pessoas_avisos_idade|criado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_avisos_idade|idade|tinyint unsigned|NO|<NULL>||', 0),
  ('C|pessoas_avisos_idade|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pessoas_avisos_idade|pessoa_id|int|NO|<NULL>||', 0),
  ('C|pessoas_fisicas_etiquetas_escritorio|marcado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pessoas_fisicas_etiquetas_escritorio|marcado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas_etiquetas_escritorio|pessoa_id|int|NO|<NULL>||', 0),
  ('C|pessoas_fisicas_etiquetas_escritorio|slot|tinyint|NO|<NULL>||', 0),
  ('C|pessoas_fisicas|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|alterado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|ativo|tinyint(1)|YES|1||', 0),
  ('C|pessoas_fisicas|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|cep|varchar(9)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|complemento|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|cpf|varchar(14)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pessoas_fisicas|criado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|ctps_numero|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|ctps_serie|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|data_nascimento|date|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|estado_civil_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|estado|char(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|foto_path|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|genero_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pessoas_fisicas|logradouro|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|nacionalidade_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|nome_mae|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|nome_pai|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|nome|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|numero|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|observacoes|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|parentesco_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|pis|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|profissao_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|responsavel_id|int|YES|<NULL>||', 0),
  ('C|pessoas_fisicas|rg_orgao|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_fisicas|rg|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas_etiquetas_escritorio|marcado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pessoas_juridicas_etiquetas_escritorio|marcado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_juridicas_etiquetas_escritorio|pessoa_id|int|NO|<NULL>||', 0),
  ('C|pessoas_juridicas_etiquetas_escritorio|slot|tinyint|NO|<NULL>||', 0),
  ('C|pessoas_juridicas|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|pessoas_juridicas|alterado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_juridicas|ativo|tinyint(1)|YES|1||', 0),
  ('C|pessoas_juridicas|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|cep|varchar(9)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|cnpj|varchar(18)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|complemento|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|pessoas_juridicas|criado_por|int|YES|<NULL>||', 0),
  ('C|pessoas_juridicas|em_recuperacao_judicial|tinyint(1)|NO|0||', 0),
  ('C|pessoas_juridicas|estado|char(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|pessoas_juridicas|inscricao_estadual|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|logradouro|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|nome_fantasia|varchar(200)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|numero|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|observacoes|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|pessoas_juridicas|razao_social|varchar(200)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|prazo_subtipo|ativo|tinyint(1)|YES|1||', 0),
  ('C|prazo_subtipo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|prazo_subtipo|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|prazo_subtipo|tipo_prazo_id|int|NO|<NULL>||', 0),
  ('C|prazos_etiquetas|prazo_id|int|NO|<NULL>||', 0),
  ('C|prazos_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|prazos_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|prazos_processo|concluido_em|datetime|YES|<NULL>||', 0),
  ('C|prazos_processo|concluido_por|int|YES|<NULL>||', 0),
  ('C|prazos_processo|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|prazos_processo|criado_por|int|NO|<NULL>||', 0),
  ('C|prazos_processo|data_inicio|date|NO|<NULL>||', 0),
  ('C|prazos_processo|data_vencimento|date|NO|<NULL>||', 0),
  ('C|prazos_processo|delegado_para|int|YES|<NULL>||', 0),
  ('C|prazos_processo|descricao|varchar(1000)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|prazos_processo|fazendo_desde|datetime|YES|<NULL>||', 0),
  ('C|prazos_processo|fazendo_por|int|YES|<NULL>||', 0),
  ('C|prazos_processo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|prazos_processo|motivo_cancelamento|varchar(500)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|prazos_processo|notificar_conclusao|tinyint(1)|NO|0||', 0),
  ('C|prazos_processo|processo_id|int|NO|<NULL>||', 0),
  ('C|prazos_processo|publicacao_id|int|YES|<NULL>||', 0),
  ('C|prazos_processo|quantidade|int|YES|<NULL>||', 0),
  ('C|prazos_processo|status_alterado_em|datetime|YES|<NULL>||', 0),
  ('C|prazos_processo|status_alterado_por|int|YES|<NULL>||', 0),
  ('C|prazos_processo|status_antes_fazendo|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|prazos_processo|status|varchar(20)|YES|aberto||utf8mb4_0900_ai_ci', 0),
  ('C|prazos_processo|subtipo_id|int|YES|<NULL>||', 0),
  ('C|prazos_processo|tipo_dias|varchar(20)|YES|uteis||utf8mb4_0900_ai_ci', 0),
  ('C|processo_assunto|assunto_id|int|NO|<NULL>||', 0),
  ('C|processo_assunto|criado_em|timestamp|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|processo_assunto|criado_por|int|YES|<NULL>||', 0),
  ('C|processo_assunto|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|processo_assunto|processo_id|int|NO|<NULL>||', 0),
  ('C|processo_oabs|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|processo_oabs|criado_por|int|NO|<NULL>||', 0),
  ('C|processo_oabs|freela_id|int|YES|<NULL>||', 0),
  ('C|processo_oabs|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|processo_oabs|processo_id|int|NO|<NULL>||', 0),
  ('C|processo_oabs|usuario_id|int|YES|<NULL>||', 0),
  ('C|processo_perito|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|processo_perito|criado_por|int|YES|<NULL>||', 0),
  ('C|processo_perito|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|processo_perito|pessoa_id|int|NO|<NULL>||', 0),
  ('C|processo_perito|proc_id|int|NO|<NULL>||', 0),
  ('C|processo_perito|tipo_pessoa|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|processos_etiquetas_escritorio|marcado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|processos_etiquetas_escritorio|marcado_por|int|YES|<NULL>||', 0),
  ('C|processos_etiquetas_escritorio|processo_id|int|NO|<NULL>||', 0),
  ('C|processos_etiquetas_escritorio|slot|tinyint|NO|<NULL>||', 0),
  ('C|profissao|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|profissao|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacao_usuario|atribuida_em|datetime|YES|<NULL>||', 0),
  ('C|publicacao_usuario|atribuida_por|int|YES|<NULL>||', 0),
  ('C|publicacao_usuario|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|publicacao_usuario|motivo_sem_acao|varchar(500)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacao_usuario|publicacao_id|int|NO|<NULL>||', 0),
  ('C|publicacao_usuario|tratada_em|datetime|YES|<NULL>||', 0),
  ('C|publicacao_usuario|tratada_por|int|YES|<NULL>||', 0),
  ('C|publicacao_usuario|tratada|tinyint(1)|NO|0||', 0),
  ('C|publicacao_usuario|usuario_id|int|NO|<NULL>||', 0),
  ('C|publicacoes_etiquetas|publicacao_id|int|NO|<NULL>||', 0),
  ('C|publicacoes_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|publicacoes_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|publicacoes_lidas|lida_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|publicacoes_lidas|publicacao_id|int|NO|<NULL>||', 0),
  ('C|publicacoes_lidas|usuario_id|int|NO|<NULL>||', 0),
  ('C|publicacoes|cabecalho|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|publicacoes|data_publicacao|date|NO|<NULL>||', 0),
  ('C|publicacoes|direcionada_em|datetime|YES|<NULL>||', 0),
  ('C|publicacoes|direcionada_por|int|YES|<NULL>||', 0),
  ('C|publicacoes|escritorio|tinyint(1)|NO|1||', 0),
  ('C|publicacoes|fonte|varchar(20)|NO|aasp||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|hash_cnj|varchar(255)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|id_cnj|bigint|YES|<NULL>||', 0),
  ('C|publicacoes|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|publicacoes|importada_por|int|YES|<NULL>||', 0),
  ('C|publicacoes|motivo_sem_acao|varchar(500)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|numero_arquivo|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|numero_processo|varchar(45)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|numero_publicacao|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|oab|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|publicacoes|texto_hash|char(64)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|texto|mediumtext|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|titulo|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|publicacoes|tratada_em|datetime|YES|<NULL>||', 0),
  ('C|publicacoes|tratada_por|int|YES|<NULL>||', 0),
  ('C|publicacoes|tratada|tinyint(1)|NO|0||', 0),
  ('C|publicacoes|tribunal|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_agendamento|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|relatorio_agendamento|ativo|tinyint(1)|NO|1||', 0),
  ('C|relatorio_agendamento|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|relatorio_agendamento|destinatarios|json|NO|<NULL>||', 0),
  ('C|relatorio_agendamento|dia_mes|tinyint|YES|<NULL>||', 0),
  ('C|relatorio_agendamento|dia_semana|tinyint|YES|<NULL>||', 0),
  ('C|relatorio_agendamento|dono_id|int|NO|<NULL>||', 0),
  ('C|relatorio_agendamento|falhas_seguidas|tinyint|NO|0||', 0),
  ('C|relatorio_agendamento|formato|varchar(4)|NO|pdf||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_agendamento|frequencia|varchar(10)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_agendamento|hora|time|NO|<NULL>||', 0),
  ('C|relatorio_agendamento|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|relatorio_agendamento|modelo_id|int|NO|<NULL>||', 0),
  ('C|relatorio_agendamento|proxima_execucao|datetime|YES|<NULL>||', 0),
  ('C|relatorio_agendamento|ultimo_envio|datetime|YES|<NULL>||', 0),
  ('C|relatorio_agendamento|ultimo_erro|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_agendamento|ultimo_status|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_modelo_usuario|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|relatorio_modelo_usuario|modelo_id|int|NO|<NULL>||', 0),
  ('C|relatorio_modelo_usuario|origem|varchar(12)|NO|proprio||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_modelo_usuario|preferencias|json|YES|<NULL>||', 0),
  ('C|relatorio_modelo_usuario|usuario_id|int|NO|<NULL>||', 0),
  ('C|relatorio_modelo|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|relatorio_modelo|alterado_por|int|YES|<NULL>||', 0),
  ('C|relatorio_modelo|assunto|varchar(40)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_modelo|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|relatorio_modelo|definicao|json|NO|<NULL>||', 0),
  ('C|relatorio_modelo|descricao|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_modelo|dono_id|int|NO|<NULL>||', 0),
  ('C|relatorio_modelo|escopo|varchar(10)|NO|pessoal||utf8mb4_0900_ai_ci', 0),
  ('C|relatorio_modelo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|relatorio_modelo|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|reset_tokens|criado_em|datetime|NO|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|reset_tokens|expires_at|datetime|NO|<NULL>||', 0),
  ('C|reset_tokens|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|reset_tokens|token|varchar(64)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|reset_tokens|usado|tinyint(1)|NO|0||', 0),
  ('C|reset_tokens|usuario_id|int|NO|<NULL>||', 0),
  ('C|tarefas_etiquetas|slot|tinyint|NO|<NULL>||', 0),
  ('C|tarefas_etiquetas|tarefa_id|int|NO|<NULL>||', 0),
  ('C|tarefas_etiquetas|usuario_id|int|NO|<NULL>||', 0),
  ('C|tarefas|andamento_id|int|YES|<NULL>||', 0),
  ('C|tarefas|atribuida_para|int|YES|<NULL>||', 0),
  ('C|tarefas|concluida_em|datetime|YES|<NULL>||', 0),
  ('C|tarefas|concluida_por|int|YES|<NULL>||', 0),
  ('C|tarefas|concluida|tinyint(1)|YES|0||', 0),
  ('C|tarefas|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tarefas|criado_por|int|NO|<NULL>||', 0),
  ('C|tarefas|data_vencimento|date|YES|<NULL>||', 0),
  ('C|tarefas|descricao|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tarefas|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tarefas|notificar_conclusao|tinyint(1)|NO|0||', 0),
  ('C|tarefas|pasta_id|int|YES|<NULL>||', 0),
  ('C|tarefas|prazo_id|int|YES|<NULL>||', 0),
  ('C|tarefas|prioridade|varchar(20)|YES|normal||utf8mb4_0900_ai_ci', 0),
  ('C|tarefas|processo_id|int|YES|<NULL>||', 0),
  ('C|tarefas|publicacao_id|int|YES|<NULL>||', 0),
  ('C|tarefas|titulo|varchar(300)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblassuntoproc|alterado_em|timestamp|YES|<NULL>||', 0),
  ('C|tblassuntoproc|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblassuntoproc|ativo|tinyint(1)|NO|1||', 0),
  ('C|tblassuntoproc|criado_em|timestamp|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblassuntoproc|criado_por|int|YES|<NULL>||', 0),
  ('C|tblassuntoproc|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblassuntoproc|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|abrev_nome|varchar(50)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblforum|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblforum|ativo|tinyint(1)|YES|1||', 0),
  ('C|tblforum|bairro|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|cep|varchar(8)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|cidade|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|compl_end|varchar(50)|YES|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|tblforum|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblforum|criado_por|int|YES|<NULL>||', 0),
  ('C|tblforum|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblforum|logradouro|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|num_end|varchar(11)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblforum|uf|varchar(2)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblinstanciaproc|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblinstanciaproc|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblinstanciaproc|ativo|tinyint(1)|YES|1||', 0),
  ('C|tblinstanciaproc|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblinstanciaproc|criado_por|int|YES|<NULL>||', 0),
  ('C|tblinstanciaproc|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblinstanciaproc|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblpasta|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblpasta|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblpasta|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblpasta|criado_por|int|YES|<NULL>||', 0),
  ('C|tblpasta|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblpasta|numPasta|int|NO|<NULL>||', 0),
  ('C|tblproc|NomeTituloProc|varchar(300)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblproc|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblproc|ativo|tinyint(1)|YES|1||', 0),
  ('C|tblproc|cliente_polo|varchar(10)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblproc|criado_por|int|YES|<NULL>||', 0),
  ('C|tblproc|data_distribuicao|date|YES|<NULL>||', 0),
  ('C|tblproc|datajud_sincronizado_em|datetime|YES|<NULL>||', 0),
  ('C|tblproc|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblproc|instancia_id|int|YES|<NULL>||', 0),
  ('C|tblproc|numProc|varchar(45)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|oab_processo|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|observacoes|text|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|pasta_id|int|NO|<NULL>||', 0),
  ('C|tblproc|protocolo|varchar(60)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblproc|responsavel_id|int|YES|<NULL>||', 0),
  ('C|tblproc|status_id|int|YES|<NULL>||', 0),
  ('C|tblproc|tipo_id|int|YES|<NULL>||', 0),
  ('C|tblproc|vara_id|int|YES|<NULL>||', 0),
  ('C|tblstatusproc|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblstatusproc|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblstatusproc|ativo|tinyint(1)|YES|1||', 0),
  ('C|tblstatusproc|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblstatusproc|criado_por|int|YES|<NULL>||', 0),
  ('C|tblstatusproc|encerra_processo|tinyint(1)|NO|0||', 0),
  ('C|tblstatusproc|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblstatusproc|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tbltipoproc|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tbltipoproc|alterado_por|int|YES|<NULL>||', 0),
  ('C|tbltipoproc|ativo|tinyint(1)|YES|1||', 0),
  ('C|tbltipoproc|codTipoProc|varchar(1)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tbltipoproc|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tbltipoproc|criado_por|int|YES|<NULL>||', 0),
  ('C|tbltipoproc|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tbltipoproc|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tbltituloprocautor|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tbltituloprocautor|criado_por|int|YES|<NULL>||', 0),
  ('C|tbltituloprocautor|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tbltituloprocautor|pessoa_id|int|NO|<NULL>||', 0),
  ('C|tbltituloprocautor|proc_id|int|NO|<NULL>||', 0),
  ('C|tbltituloprocautor|tipo_pessoa|enum(''fisica'',''juridica'')|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tbltituloprocreu|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tbltituloprocreu|criado_por|int|YES|<NULL>||', 0),
  ('C|tbltituloprocreu|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tbltituloprocreu|pessoa_id|int|NO|<NULL>||', 0),
  ('C|tbltituloprocreu|proc_id|int|NO|<NULL>||', 0),
  ('C|tbltituloprocreu|tipo_pessoa|enum(''fisica'',''juridica'')|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblvara|abrev_nome|varchar(50)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblvara|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tblvara|alterado_por|int|YES|<NULL>||', 0),
  ('C|tblvara|ativo|tinyint(1)|YES|1||', 0),
  ('C|tblvara|codVaraNoProc|varchar(15)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblvara|compl_end|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblvara|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tblvara|criado_por|int|YES|<NULL>||', 0),
  ('C|tblvara|email|varchar(100)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tblvara|forum_id|int|NO|<NULL>||', 0),
  ('C|tblvara|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tblvara|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('C|tblvara|tel|varchar(50)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|telefones_pf|ativo|tinyint(1)|YES|1||', 0),
  ('C|telefones_pf|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|telefones_pf|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|telefones_pf|numero|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|telefones_pf|pessoa_id|int|NO|<NULL>||', 0),
  ('C|telefones_pf|principal|tinyint(1)|YES|0||', 0),
  ('C|telefones_pf|sms_unico|int|YES|<NULL>|VIRTUAL GENERATED|', 1),
  ('C|telefones_pf|sms|tinyint(1)|NO|0||', 1),
  ('C|telefones_pf|tipo|varchar(100)|YES|Celular||utf8mb4_0900_ai_ci', 0),
  ('C|telefones_pf|whatsapp_unico|int|YES|<NULL>|VIRTUAL GENERATED|', 1),
  ('C|telefones_pf|whatsapp|tinyint(1)|NO|0||', 1),
  ('C|telefones_pj|ativo|tinyint(1)|YES|1||', 0),
  ('C|telefones_pj|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|telefones_pj|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|telefones_pj|numero|varchar(20)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|telefones_pj|pessoa_id|int|NO|<NULL>||', 0),
  ('C|telefones_pj|principal|tinyint(1)|YES|0||', 0),
  ('C|telefones_pj|sms_unico|int|YES|<NULL>|VIRTUAL GENERATED|', 1),
  ('C|telefones_pj|sms|tinyint(1)|NO|0||', 1),
  ('C|telefones_pj|tipo|varchar(100)|YES|Comercial||utf8mb4_0900_ai_ci', 0),
  ('C|telefones_pj|whatsapp_unico|int|YES|<NULL>|VIRTUAL GENERATED|', 1),
  ('C|telefones_pj|whatsapp|tinyint(1)|NO|0||', 1),
  ('C|tipo_audiencia|ativo|tinyint(1)|YES|1||', 0),
  ('C|tipo_audiencia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tipo_audiencia|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tipo_documento_pendencia|alterado_em|datetime|YES|<NULL>||', 0),
  ('C|tipo_documento_pendencia|alterado_por|int|YES|<NULL>||', 0),
  ('C|tipo_documento_pendencia|ativo|tinyint(1)|NO|1||', 0),
  ('C|tipo_documento_pendencia|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|tipo_documento_pendencia|criado_por|int|YES|<NULL>||', 0),
  ('C|tipo_documento_pendencia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tipo_documento_pendencia|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tipo_pericia|ativo|tinyint(1)|YES|1||', 0),
  ('C|tipo_pericia|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tipo_pericia|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|tipo_prazo|ativo|tinyint(1)|YES|1||', 0),
  ('C|tipo_prazo|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|tipo_prazo|nome|varchar(100)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|ativo|tinyint(1)|YES|1||', 0),
  ('C|usuarios|cor_linha_lida|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|cor_linha|varchar(20)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|cores_agenda|varchar(255)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|cores_menu|varchar(255)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|criado_em|datetime|YES|CURRENT_TIMESTAMP|DEFAULT_GENERATED|', 0),
  ('C|usuarios|criado_por|int|YES|<NULL>||', 0),
  ('C|usuarios|email|varchar(150)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|google_agenda_ativo|tinyint(1)|NO|0||', 0),
  ('C|usuarios|google_agenda_email|varchar(255)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|id|int|NO|<NULL>|auto_increment|', 0),
  ('C|usuarios|login|varchar(80)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|max_relatorios|int|YES|<NULL>||', 0),
  ('C|usuarios|nivel|tinyint|NO|2||', 0),
  ('C|usuarios|nome|varchar(150)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|notif_email|tinyint(1)|YES|1||', 0),
  ('C|usuarios|notif_tela|tinyint(1)|YES|1||', 0),
  ('C|usuarios|oab|varchar(30)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|publicacoes_escopo|varchar(10)|NO|todas||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|senha_hash|varchar(255)|NO|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|sessao_atual|varchar(64)|YES|<NULL>||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|tipo|varchar(30)|YES|advogado||utf8mb4_0900_ai_ci', 0),
  ('C|usuarios|ultimo_acesso|datetime|YES|<NULL>||', 0),
  ('C|usuarios|ver_todos_processos|tinyint(1)|YES|0||', 0),
  ('F|acordo_parcela_multa|fk_multa_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela_multa|fk_multa_parcela|parcela_id|acordo_parcela|id|NO ACTION|CASCADE', 0),
  ('F|acordo_parcela_multa|fk_multa_receb_conta_financeira|recebimento_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela_multa|fk_multa_receb_forma|recebimento_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela_multa|fk_multa_repcli_conta_financeira|repasse_cliente_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela_multa|fk_multa_repcli_forma|repasse_cliente_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela_multa|fk_multa_repcli_por|repasse_cliente_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela_multa|fk_multa_reppar_conta_financeira|repasse_parceiro_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela_multa|fk_multa_reppar_forma|repasse_parceiro_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela_multa|fk_multa_reppar_por|repasse_parceiro_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela|fk_ap_receb_conta_financeira|recebimento_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela|fk_ap_repcli_conta_financeira|repasse_cliente_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela|fk_ap_reppar_conta_financeira|repasse_parceiro_conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|acordo_parcela|fk_parcela_acordo|acordo_id|acordo|id|NO ACTION|CASCADE', 0),
  ('F|acordo_parcela|fk_parcela_receb_forma|recebimento_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela|fk_parcela_repcli_forma|repasse_cliente_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela|fk_parcela_repcli_por|repasse_cliente_por|usuarios|id|NO ACTION|SET NULL', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('F|acordo_parcela|fk_parcela_reppar_forma|repasse_parceiro_forma_id|forma_pagamento|id|NO ACTION|SET NULL', 0),
  ('F|acordo_parcela|fk_parcela_reppar_por|repasse_parceiro_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo|fk_acordo_alterado|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo|fk_acordo_criado|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|acordo|fk_acordo_proc|processo_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|advogados_freela|fk_freela_profissao|profissao_id|profissao|id|NO ACTION|SET NULL', 0),
  ('F|advogados_freela|freela_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|agenda_compromisso|fk_agcomp_concluido_por|concluido_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|agenda_compromisso|fk_agcomp_delegado|delegado_para|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|agenda_compromisso|fk_agcomp_publicacao|publicacao_id|publicacoes|id|NO ACTION|SET NULL', 0),
  ('F|agenda_compromisso|fk_agcomp_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|andamento_processual|andamento_processual_ibfk_2|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|andamento_processual|andamento_processual_ibfk_3|editado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|andamento_processual|fk_andamento_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|ata_audiencia_itens|fk_ata_audiencia_itens_ata|ata_audiencia_id|ata_audiencia|id|NO ACTION|CASCADE', 0),
  ('F|ata_audiencia|ata_audiencia_ibfk_1|audiencia_id|audiencia|id|NO ACTION|NO ACTION', 0),
  ('F|ata_audiencia|ata_audiencia_ibfk_2|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|ata_audiencia|fk_ata_advogado_freela|advogado_freela_id|advogados_freela|id|NO ACTION|SET NULL', 0),
  ('F|ata_audiencia|fk_ata_advogado|advogado_id|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|audiencia_responsaveis|fk_ar_audiencia|audiencia_id|audiencia|id|NO ACTION|CASCADE', 0),
  ('F|audiencia_responsaveis|fk_ar_freela|responsavel_freela_id|advogados_freela|id|NO ACTION|RESTRICT', 0),
  ('F|audiencia_responsaveis|fk_ar_usuario|responsavel_id|usuarios|id|NO ACTION|RESTRICT', 0),
  ('F|audiencia_testemunhas|aut_ibfk_1|audiencia_id|audiencia|id|NO ACTION|CASCADE', 0),
  ('F|audiencia_testemunhas|aut_ibfk_2|pessoa_id|pessoas_fisicas|id|NO ACTION|RESTRICT', 0),
  ('F|audiencia_testemunhas|fk_at_parte_pessoa|parte_pessoa_id|pessoas_fisicas|id|NO ACTION|RESTRICT', 0),
  ('F|audiencias_etiquetas|fk_aude_reg|audiencia_id|audiencia|id|NO ACTION|CASCADE', 0),
  ('F|audiencias_etiquetas|fk_aude_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|audiencia|aud_ibfk_alterado_por|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|audiencia|aud_ibfk_resp_freela|responsavel_freela_id|advogados_freela|id|NO ACTION|SET NULL', 0),
  ('F|audiencia|aud_ibfk_responsavel|responsavel_id|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|audiencia|audiencia_ibfk_2|tipo_audiencia_id|tipo_audiencia|id|NO ACTION|NO ACTION', 0),
  ('F|audiencia|audiencia_ibfk_3|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|audiencia|fk_audiencia_publicacao|publicacao_id|publicacoes|id|NO ACTION|SET NULL', 0),
  ('F|audiencia|fk_audiencia_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|audiencia|fk_audiencia_vara|vara_id|tblvara|id|NO ACTION|SET NULL', 0),
  ('F|auditoria_audiencia|audaud_ibfk_1|audiencia_id|audiencia|id|NO ACTION|CASCADE', 0),
  ('F|auditoria_audiencia|audaud_ibfk_2|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_conta_corrente|fk_audcc_lanc|lancamento_id|conta_corrente|id|NO ACTION|CASCADE', 0),
  ('F|auditoria_conta_corrente|fk_audcc_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_etiqueta_escritorio|fk_aee_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_parcela|fk_audparcela_parcela|parcela_id|acordo_parcela|id|NO ACTION|CASCADE', 0),
  ('F|auditoria_parcela|fk_audparcela_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_pericia|audper_ibfk_1|pericia_id|pericia|id|NO ACTION|CASCADE', 0),
  ('F|auditoria_pericia|audper_ibfk_2|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_prazo|auditoria_prazo_ibfk_1|prazo_id|prazos_processo|id|NO ACTION|NO ACTION', 0),
  ('F|auditoria_prazo|auditoria_prazo_ibfk_2|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|avisos_cliente|fk_aviso_audiencia|audiencia_id|audiencia|id|NO ACTION|CASCADE', 1),
  ('F|avisos_cliente|fk_aviso_decidido_por|decidido_por|usuarios|id|NO ACTION|NO ACTION', 1),
  ('F|avisos_cliente|fk_aviso_pericia|pericia_id|pericia|id|NO ACTION|CASCADE', 1),
  ('F|avisos_cliente|fk_aviso_pessoa_fisica|pessoa_fisica_id|pessoas_fisicas|id|NO ACTION|CASCADE', 1),
  ('F|avisos_cliente|fk_aviso_processo|processo_id|tblproc|id|NO ACTION|SET NULL', 1),
  ('F|configuracoes_escritorio|fk_config_advogado_principal|advogado_principal_id|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|conta_corrente|fk_cc_conta_financeira|conta_financeira_id|conta_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|conta_corrente|fk_cc_parcela|parcela_id|acordo_parcela|id|NO ACTION|SET NULL', 0),
  ('F|conta_corrente|fk_cc_processo|processo_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|conta_corrente|fk_cc_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|conta_financeira|fk_conta_financeira_instituicao|instituicao_financeira_id|instituicao_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|contas_bancarias_pf|fk_cbpf_instituicao|instituicao_financeira_id|instituicao_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|contas_bancarias_pf|fk_cbpf_pessoa|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|contas_bancarias_pj|fk_cbpj_instituicao|instituicao_financeira_id|instituicao_financeira|id|NO ACTION|RESTRICT', 0),
  ('F|contas_bancarias_pj|fk_cbpj_pessoa|pessoa_id|pessoas_juridicas|id|NO ACTION|CASCADE', 0),
  ('F|emails_pf|emails_pf_ibfk_1|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|emails_pj|emails_pj_ibfk_1|pessoa_id|pessoas_juridicas|id|NO ACTION|CASCADE', 0),
  ('F|etiquetas_definicoes|fk_etqdef_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|etiquetas_escritorio_catalogo|fk_etqesc_status|status_id|tblstatusproc|id|NO ACTION|SET NULL', 0),
  ('F|feriados|fk_feriados_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|historico_atendimento|historico_atendimento_ibfk_1|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|log_comunicacoes|fk_logcom_aviso|aviso_id|avisos_cliente|id|NO ACTION|SET NULL', 1),
  ('F|log_comunicacoes|fk_logcomun_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|log_comunicacoes|log_comunicacoes_ibfk_2|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|log_documentos_gerados|fk_logdoc_modelo|modelo_id|modelo_documento|id|NO ACTION|SET NULL', 0),
  ('F|log_documentos_gerados|fk_logdoc_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|log_emails|fk_log_emails_pub|publicacao_id|publicacoes|id|NO ACTION|SET NULL', 0),
  ('F|log_publicacoes|log_publicacoes_ibfk_1|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|modelo_documento|fk_modelo_alterado_por|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|modelo_documento|fk_modelo_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|modelo_documento|fk_modelo_subtipo_prazo|subtipo_prazo_id|prazo_subtipo|id|NO ACTION|SET NULL', 0),
  ('F|modelo_documento|fk_modelo_tipo_aud|tipo_audiencia_id|tipo_audiencia|id|NO ACTION|SET NULL', 0),
  ('F|modelo_documento|fk_modelo_tipo_per|tipo_pericia_id|tipo_pericia|id|NO ACTION|SET NULL', 0),
  ('F|notificacoes|fk_notif_pessoa|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('F|notificacoes|fk_notif_prazo|prazo_id|prazos_processo|id|NO ACTION|NO ACTION', 0),
  ('F|notificacoes|fk_notif_tarefa|tarefa_id|tarefas|id|NO ACTION|CASCADE', 0),
  ('F|notificacoes|fk_notif_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|parabens_enviados|fk_parabens_pessoa|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|pastas_etiquetas|fk_paset_pasta|pasta_id|tblpasta|id|NO ACTION|CASCADE', 0),
  ('F|pastas_etiquetas|fk_paset_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|pendencia_documento_item|fk_pend_doc_item_pendencia|pendencia_id|pendencia_documento|id|NO ACTION|CASCADE', 0),
  ('F|pendencia_documento_item|fk_pend_doc_item_recebido_por|recebido_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pendencia_documento_item|fk_pend_doc_item_tipo|tipo_documento_id|tipo_documento_pendencia|id|NO ACTION|NO ACTION', 0),
  ('F|pendencia_documento_responsavel|fk_pend_doc_resp_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pendencia_documento_responsavel|fk_pend_doc_resp_pendencia|pendencia_id|pendencia_documento|id|NO ACTION|CASCADE', 0),
  ('F|pendencia_documento_responsavel|fk_pend_doc_resp_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|pendencia_documento|fk_pend_doc_alterado_por|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pendencia_documento|fk_pend_doc_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pendencia_documento|fk_pend_doc_resolvido_por|resolvido_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pericia_local_reu|fk_pericia_local_reu_pericia|pericia_id|pericia|id|NO ACTION|CASCADE', 0),
  ('F|pericias_etiquetas|fk_perie_reg|pericia_id|pericia|id|NO ACTION|CASCADE', 0),
  ('F|pericias_etiquetas|fk_perie_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|pericia|fk_pericia_alterado_por|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pericia|fk_pericia_assistente_freela|assistente_tecnico_freela_id|advogados_freela|id|NO ACTION|SET NULL', 0),
  ('F|pericia|fk_pericia_resp_freela|responsavel_freela_id|advogados_freela|id|NO ACTION|SET NULL', 0),
  ('F|pericia|fk_pericia_responsavel|responsavel_id|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pericia|fk_pericia_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|pericia|pericia_ibfk_2|tipo_pericia_id|tipo_pericia|id|NO ACTION|NO ACTION', 0),
  ('F|pericia|pericia_ibfk_3|assistente_tecnico_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|pericia|pericia_ibfk_4|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|permissoes|permissoes_ibfk_1|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|pessoas_avisos_idade|fk_aviso_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pessoas_avisos_idade|fk_aviso_pessoa|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|pessoas_fisicas_etiquetas_escritorio|fk_pfee_reg|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|pessoas_fisicas_etiquetas_escritorio|fk_pfee_usuario|marcado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pessoas_fisicas|fk_pf_alterado_por|alterado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|fk_pf_criado_por|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|fk_pf_parentesco|parentesco_id|parentesco|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|fk_pf_responsavel|responsavel_id|pessoas_fisicas|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|pessoas_fisicas_ibfk_1|estado_civil_id|estado_civil|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|pessoas_fisicas_ibfk_2|profissao_id|profissao|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|pessoas_fisicas_ibfk_3|genero_id|genero|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_fisicas|pessoas_fisicas_ibfk_4|nacionalidade_id|nacionalidade|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_juridicas_etiquetas_escritorio|fk_pjee_reg|pessoa_id|pessoas_juridicas|id|NO ACTION|CASCADE', 0),
  ('F|pessoas_juridicas_etiquetas_escritorio|fk_pjee_usuario|marcado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|pessoas_juridicas|fk_pj_alterado_por|alterado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|pessoas_juridicas|fk_pj_criado_por|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|prazo_subtipo|prazo_subtipo_ibfk_1|tipo_prazo_id|tipo_prazo|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_etiquetas|fk_praze_reg|prazo_id|prazos_processo|id|NO ACTION|CASCADE', 0),
  ('F|prazos_etiquetas|fk_praze_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|prazos_processo|fk_pp_fazendo_por|fazendo_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|prazos_processo|fk_pp_publicacao|publicacao_id|publicacoes|id|NO ACTION|SET NULL', 0),
  ('F|prazos_processo|fk_prazos_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_processo|prazos_processo_ibfk_2|subtipo_id|prazo_subtipo|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_processo|prazos_processo_ibfk_3|delegado_para|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_processo|prazos_processo_ibfk_4|concluido_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_processo|prazos_processo_ibfk_5|status_alterado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|prazos_processo|prazos_processo_ibfk_6|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|processo_assunto|processo_assunto_ibfk_1|processo_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|processo_assunto|processo_assunto_ibfk_2|assunto_id|tblassuntoproc|id|NO ACTION|NO ACTION', 0),
  ('F|processo_assunto|processo_assunto_ibfk_3|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|processo_oabs|fk_po_freela|freela_id|advogados_freela|id|NO ACTION|RESTRICT', 0),
  ('F|processo_oabs|fk_po_processo|processo_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|processo_oabs|fk_po_usuario|usuario_id|usuarios|id|NO ACTION|RESTRICT', 0),
  ('F|processo_perito|fk_procperito_proc|proc_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|processo_perito|fk_procperito_usuario|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|processos_etiquetas_escritorio|fk_pee_proc|processo_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|processos_etiquetas_escritorio|fk_pee_usuario|marcado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|publicacao_usuario|fk_pu_atribuida_por|atribuida_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|publicacao_usuario|fk_pu_pub|publicacao_id|publicacoes|id|NO ACTION|CASCADE', 0),
  ('F|publicacao_usuario|fk_pu_tratada_por|tratada_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|publicacao_usuario|fk_pu_user|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|publicacoes_etiquetas|fk_pube_reg|publicacao_id|publicacoes|id|NO ACTION|CASCADE', 0),
  ('F|publicacoes_etiquetas|fk_pube_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|publicacoes_lidas|fk_pl_pub|publicacao_id|publicacoes|id|NO ACTION|CASCADE', 0),
  ('F|publicacoes_lidas|fk_pl_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|publicacoes|fk_pub_direcionada|direcionada_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|publicacoes|fk_pub_importada|importada_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|publicacoes|fk_pub_tratada|tratada_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|relatorio_agendamento|fk_relag_dono|dono_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|relatorio_agendamento|fk_relag_modelo|modelo_id|relatorio_modelo|id|NO ACTION|CASCADE', 0),
  ('F|relatorio_modelo_usuario|fk_relmu_modelo|modelo_id|relatorio_modelo|id|NO ACTION|CASCADE', 0),
  ('F|relatorio_modelo_usuario|fk_relmu_usuario|usuario_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|relatorio_modelo|fk_relmod_alterado_por|alterado_por|usuarios|id|NO ACTION|NO ACTION', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('F|relatorio_modelo|fk_relmod_dono|dono_id|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|reset_tokens|reset_tokens_ibfk_1|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|tarefas_etiquetas|fk_tare_reg|tarefa_id|tarefas|id|NO ACTION|CASCADE', 0),
  ('F|tarefas_etiquetas|fk_tare_usuario|usuario_id|usuarios|id|NO ACTION|CASCADE', 0),
  ('F|tarefas|fk_tarefas_andamento|andamento_id|andamento_processual|id|NO ACTION|SET NULL', 0),
  ('F|tarefas|fk_tarefas_publicacao|publicacao_id|publicacoes|id|NO ACTION|SET NULL', 0),
  ('F|tarefas|fk_tarefas_tblpasta|pasta_id|tblpasta|id|NO ACTION|NO ACTION', 0),
  ('F|tarefas|fk_tarefas_tblproc|processo_id|tblproc|id|NO ACTION|NO ACTION', 0),
  ('F|tarefas|tarefas_ibfk_3|prazo_id|prazos_processo|id|NO ACTION|NO ACTION', 0),
  ('F|tarefas|tarefas_ibfk_4|atribuida_para|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|tarefas|tarefas_ibfk_5|concluida_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|tarefas|tarefas_ibfk_6|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('F|tblassuntoproc|tblassuntoproc_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblassuntoproc|tblassuntoproc_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblforum|tblforum_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblforum|tblforum_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblinstanciaproc|tblinstanciaproc_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblinstanciaproc|tblinstanciaproc_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblpasta|tblpasta_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblpasta|tblpasta_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|fk_tblproc_responsavel|responsavel_id|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_1|pasta_id|tblpasta|id|NO ACTION|NO ACTION', 0),
  ('F|tblproc|tblproc_ibfk_2|vara_id|tblvara|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_3|tipo_id|tbltipoproc|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_4|status_id|tblstatusproc|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_5|instancia_id|tblinstanciaproc|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_6|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblproc|tblproc_ibfk_7|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblstatusproc|tblstatusproc_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblstatusproc|tblstatusproc_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tbltipoproc|tbltipoproc_ibfk_1|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tbltipoproc|tbltipoproc_ibfk_2|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tbltituloprocautor|tbltituloprocautor_ibfk_1|proc_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|tbltituloprocautor|tbltituloprocautor_ibfk_2|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tbltituloprocreu|tbltituloprocreu_ibfk_1|proc_id|tblproc|id|NO ACTION|CASCADE', 0),
  ('F|tbltituloprocreu|tbltituloprocreu_ibfk_2|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblvara|tblvara_ibfk_1|forum_id|tblforum|id|NO ACTION|NO ACTION', 0),
  ('F|tblvara|tblvara_ibfk_2|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tblvara|tblvara_ibfk_3|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|telefones_pf|telefones_pf_ibfk_1|pessoa_id|pessoas_fisicas|id|NO ACTION|CASCADE', 0),
  ('F|telefones_pj|telefones_pj_ibfk_1|pessoa_id|pessoas_juridicas|id|NO ACTION|CASCADE', 0),
  ('F|tipo_documento_pendencia|fk_tipo_doc_pend_alterado_por|alterado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|tipo_documento_pendencia|fk_tipo_doc_pend_criado_por|criado_por|usuarios|id|NO ACTION|SET NULL', 0),
  ('F|usuarios|fk_usuarios_criado_por|criado_por|usuarios|id|NO ACTION|NO ACTION', 0),
  ('I|acordo_parcela_multa|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_receb_forma|1|1:recebimento_forma_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_repcli_forma|1|1:repasse_cliente_forma_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_repcli_por|1|1:repasse_cliente_por::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_reppar_forma|1|1:repasse_parceiro_forma_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|fk_multa_reppar_por|1|1:repasse_parceiro_por::A|BTREE', 0),
  ('I|acordo_parcela_multa|idx_multa_receb_conta_financeira|1|1:recebimento_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|idx_multa_repcli_conta_financeira|1|1:repasse_cliente_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|idx_multa_reppar_conta_financeira|1|1:repasse_parceiro_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela_multa|uq_multa_parcela|0|1:parcela_id::A|BTREE', 0),
  ('I|acordo_parcela|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|acordo_parcela|acordo_id|1|1:acordo_id::A|BTREE', 0),
  ('I|acordo_parcela|fk_parcela_receb_forma|1|1:recebimento_forma_id::A|BTREE', 0),
  ('I|acordo_parcela|fk_parcela_repcli_forma|1|1:repasse_cliente_forma_id::A|BTREE', 0),
  ('I|acordo_parcela|fk_parcela_repcli_por|1|1:repasse_cliente_por::A|BTREE', 0),
  ('I|acordo_parcela|fk_parcela_reppar_forma|1|1:repasse_parceiro_forma_id::A|BTREE', 0),
  ('I|acordo_parcela|fk_parcela_reppar_por|1|1:repasse_parceiro_por::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_receb_conta_financeira|1|1:recebimento_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_receb_instituicao_origem|1|1:recebimento_instituicao_origem_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_repcli_conta_financeira|1|1:repasse_cliente_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_repcli_instituicao_destino|1|1:repasse_cliente_instituicao_destino_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_reppar_conta_financeira|1|1:repasse_parceiro_conta_financeira_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_ap_reppar_instituicao_destino|1|1:repasse_parceiro_instituicao_destino_id::A|BTREE', 0),
  ('I|acordo_parcela|idx_parcela_vencimento|1|1:vencimento::A|BTREE', 0),
  ('I|acordo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|acordo|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|acordo|fk_acordo_alterado|1|1:alterado_por::A|BTREE', 0),
  ('I|acordo|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|advogados_freela|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|advogados_freela|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|advogados_freela|idx_freela_profissao|1|1:profissao_id::A|BTREE', 0),
  ('I|agenda_compromisso|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|agenda_compromisso|data|1|1:data::A|BTREE', 0),
  ('I|agenda_compromisso|idx_agcomp_concluido_por|1|1:concluido_por::A|BTREE', 0),
  ('I|agenda_compromisso|idx_agcomp_delegado|1|1:delegado_para::A|BTREE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('I|agenda_compromisso|idx_agcomp_publicacao|1|1:publicacao_id::A|BTREE', 0),
  ('I|agenda_compromisso|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|andamento_processual|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|andamento_processual|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|andamento_processual|editado_por|1|1:editado_por::A|BTREE', 0),
  ('I|andamento_processual|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|andamento_processual|uq_andamento_hash|0|1:hash_movimento::A|BTREE', 0),
  ('I|ata_audiencia_itens|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|ata_audiencia_itens|idx_ata_audiencia_itens_ata|1|1:ata_audiencia_id::A|BTREE', 0),
  ('I|ata_audiencia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|ata_audiencia|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|ata_audiencia|fk_ata_advogado_freela|1|1:advogado_freela_id::A|BTREE', 0),
  ('I|ata_audiencia|fk_ata_advogado|1|1:advogado_id::A|BTREE', 0),
  ('I|ata_audiencia|idx_audiencia_id|1|1:audiencia_id::A|BTREE', 0),
  ('I|audiencia_responsaveis|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|audiencia_responsaveis|idx_ar_freela|1|1:responsavel_freela_id::A|BTREE', 0),
  ('I|audiencia_responsaveis|idx_ar_responsavel|1|1:responsavel_id::A|BTREE', 0),
  ('I|audiencia_responsaveis|uq_audiencia_responsavel_freela|0|1:audiencia_id::A,2:responsavel_freela_id::A|BTREE', 0),
  ('I|audiencia_responsaveis|uq_audiencia_responsavel_usuario|0|1:audiencia_id::A,2:responsavel_id::A|BTREE', 0),
  ('I|audiencia_testemunhas|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|audiencia_testemunhas|audiencia_id|1|1:audiencia_id::A|BTREE', 0),
  ('I|audiencia_testemunhas|idx_at_parte_pessoa|1|1:parte_pessoa_id::A|BTREE', 0),
  ('I|audiencia_testemunhas|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|audiencias_etiquetas|PRIMARY|0|1:audiencia_id::A,2:usuario_id::A|BTREE', 0),
  ('I|audiencias_etiquetas|idx_aude_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|audiencia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|audiencia|aud_ibfk_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|audiencia|aud_ibfk_resp_freela|1|1:responsavel_freela_id::A|BTREE', 0),
  ('I|audiencia|aud_ibfk_responsavel|1|1:responsavel_id::A|BTREE', 0),
  ('I|audiencia|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|audiencia|fk_audiencia_publicacao|1|1:publicacao_id::A|BTREE', 0),
  ('I|audiencia|fk_audiencia_vara|1|1:vara_id::A|BTREE', 0),
  ('I|audiencia|idx_aud_data_status|1|1:data::A,2:status::A|BTREE', 0),
  ('I|audiencia|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|audiencia|tipo_audiencia_id|1|1:tipo_audiencia_id::A|BTREE', 0),
  ('I|audiencia|uq_audiencia_horario_ativo|0|1:processo_id::A,2:data::A,3:hora::A,4:horario_ativo::A|BTREE', 0),
  ('I|auditoria_audiencia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_audiencia|audiencia_id|1|1:audiencia_id::A|BTREE', 0),
  ('I|auditoria_audiencia|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|auditoria_conta_corrente|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_conta_corrente|lancamento_id|1|1:lancamento_id::A|BTREE', 0),
  ('I|auditoria_conta_corrente|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|auditoria_etiqueta_escritorio|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_etiqueta_escritorio|idx_aee_data|1|1:criado_em::A|BTREE', 0),
  ('I|auditoria_etiqueta_escritorio|idx_aee_modulo_registro|1|1:modulo::A,2:registro_id::A|BTREE', 0),
  ('I|auditoria_etiqueta_escritorio|idx_aee_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|auditoria_parcela|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_parcela|parcela_id|1|1:parcela_id::A|BTREE', 0),
  ('I|auditoria_parcela|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|auditoria_pericia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_pericia|pericia_id|1|1:pericia_id::A|BTREE', 0),
  ('I|auditoria_pericia|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|auditoria_prazo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|auditoria_prazo|prazo_id|1|1:prazo_id::A|BTREE', 0),
  ('I|auditoria_prazo|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|avisos_cliente|PRIMARY|0|1:id::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_audiencia|1|1:audiencia_id::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_decidido_por|1|1:decidido_por::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_pericia|1|1:pericia_id::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_pessoa_fisica|1|1:pessoa_fisica_id::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_processo|1|1:processo_id::A|BTREE', 1),
  ('I|avisos_cliente|idx_aviso_status|1|1:status::A,2:modulo::A|BTREE', 1),
  ('I|avisos_cliente|uq_aviso_ocorrencia|0|1:modulo::A,2:referencia_id::A,3:data_evento::A,4:tipo::A,5:cliente_tipo::A,6:cliente_id::A|BTREE', 1),
  ('I|calendario|PRIMARY|0|1:data::A|BTREE', 0),
  ('I|configuracoes_escritorio|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|configuracoes_escritorio|fk_config_advogado_principal|1|1:advogado_principal_id::A|BTREE', 0),
  ('I|configuracoes_integracoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|configuracoes_integracoes|uq_configuracoes_integracoes_modulo|0|1:modulo::A|BTREE', 0),
  ('I|conta_corrente|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|conta_corrente|idx_cc_conta_financeira|1|1:conta_financeira_id::A|BTREE', 0),
  ('I|conta_corrente|parcela_id|1|1:parcela_id::A|BTREE', 0),
  ('I|conta_corrente|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|conta_corrente|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|conta_financeira|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|conta_financeira|idx_conta_financeira_instituicao|1|1:instituicao_financeira_id::A|BTREE', 0),
  ('I|conta_financeira|uq_conta_financeira_nome|0|1:nome::A|BTREE', 0),
  ('I|contas_bancarias_pf|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|contas_bancarias_pf|idx_cbpf_instituicao|1|1:instituicao_financeira_id::A|BTREE', 0),
  ('I|contas_bancarias_pf|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|contas_bancarias_pj|PRIMARY|0|1:id::A|BTREE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('I|contas_bancarias_pj|idx_cbpj_instituicao|1|1:instituicao_financeira_id::A|BTREE', 0),
  ('I|contas_bancarias_pj|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|controle_versao_banco|PRIMARY|0|1:numero::A|BTREE', 0),
  ('I|emails_pf|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|emails_pf|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|emails_pj|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|emails_pj|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|estado_civil|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|etiquetas_definicoes|PRIMARY|0|1:usuario_id::A,2:modulo::A,3:slot::A|BTREE', 0),
  ('I|etiquetas_escritorio_catalogo|PRIMARY|0|1:modulo::A,2:slot::A|BTREE', 0),
  ('I|etiquetas_escritorio_catalogo|fk_etqesc_status|1|1:status_id::A|BTREE', 0),
  ('I|feriados|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|feriados|fk_feriados_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|forma_pagamento|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|forma_pagamento|uq_forma_pagamento_nome_ativo|0|1:nome::A,2:ativo::A|BTREE', 0),
  ('I|genero|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|historico_atendimento|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|historico_atendimento|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|instituicao_financeira|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|instituicao_financeira|uq_instituicao_financeira_nome|0|1:nome::A|BTREE', 0),
  ('I|log_comunicacoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|log_comunicacoes|idx_logcom_aviso|1|1:aviso_id::A|BTREE', 1),
  ('I|log_comunicacoes|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|log_comunicacoes|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|log_documentos_gerados|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|log_documentos_gerados|gerado_em|1|1:gerado_em::A|BTREE', 0),
  ('I|log_documentos_gerados|modelo_id|1|1:modelo_id::A|BTREE', 0),
  ('I|log_documentos_gerados|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|log_emails|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|log_emails|idx_log_emails_enviado_em|1|1:enviado_em::A|BTREE', 0),
  ('I|log_emails|idx_log_emails_publicacao|1|1:publicacao_id::A|BTREE', 0),
  ('I|log_emails|idx_log_emails_status|1|1:status::A|BTREE', 0),
  ('I|log_publicacoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|log_publicacoes|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|logs_auditoria|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|logs_auditoria|idx_data|1|1:criado_em::A|BTREE', 0),
  ('I|logs_auditoria|idx_tabela|1|1:tabela::A|BTREE', 0),
  ('I|logs_auditoria|idx_usuario_data|1|1:usuario_id::A,2:criado_em::A|BTREE', 0),
  ('I|logs_auditoria|idx_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|modelo_documento|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|modelo_documento|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|modelo_documento|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|modelo_documento|idx_modelo_subtipo_prazo|1|1:subtipo_prazo_id::A|BTREE', 0),
  ('I|modelo_documento|idx_modelo_tipo_aud|1|1:tipo_audiencia_id::A|BTREE', 0),
  ('I|modelo_documento|idx_modelo_tipo_per|1|1:tipo_pericia_id::A|BTREE', 0),
  ('I|nacionalidade|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|notificacoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|notificacoes|idx_notif_pessoa|1|1:pessoa_id::A|BTREE', 0),
  ('I|notificacoes|idx_notif_tarefa|1|1:tarefa_id::A|BTREE', 0),
  ('I|notificacoes|prazo_id|1|1:prazo_id::A|BTREE', 0),
  ('I|notificacoes|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|parabens_enviados|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|parabens_enviados|idx_pessoa_ano|1|1:pessoa_id::A,2:ano::A|BTREE', 0),
  ('I|parentesco|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pastas_etiquetas|PRIMARY|0|1:pasta_id::A,2:usuario_id::A|BTREE', 0),
  ('I|pastas_etiquetas|idx_paset_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|pendencia_documento_item|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pendencia_documento_item|fk_pend_doc_item_recebido_por|1|1:recebido_por::A|BTREE', 0),
  ('I|pendencia_documento_item|idx_pend_doc_item_tipo|1|1:tipo_documento_id::A|BTREE', 0),
  ('I|pendencia_documento_item|uq_pend_doc_item|0|1:pendencia_id::A,2:tipo_documento_id::A|BTREE', 0),
  ('I|pendencia_documento_responsavel|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pendencia_documento_responsavel|fk_pend_doc_resp_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|pendencia_documento_responsavel|fk_pend_doc_resp_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|pendencia_documento_responsavel|idx_pend_doc_resp_aviso|1|1:data_aviso::A,2:avisado_em::A|BTREE', 0),
  ('I|pendencia_documento_responsavel|uq_pend_doc_resp|0|1:pendencia_id::A,2:usuario_id::A|BTREE', 0),
  ('I|pendencia_documento|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pendencia_documento|fk_pend_doc_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|pendencia_documento|fk_pend_doc_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|pendencia_documento|fk_pend_doc_resolvido_por|1|1:resolvido_por::A|BTREE', 0),
  ('I|pendencia_documento|idx_pend_doc_pessoa|1|1:tipo_pessoa::A,2:pessoa_id::A|BTREE', 0),
  ('I|pendencia_documento|idx_pend_doc_status|1|1:status::A|BTREE', 0),
  ('I|pericia_local_reu|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pericia_local_reu|idx_pericia_local_reu_pericia|1|1:pericia_id::A|BTREE', 0),
  ('I|pericia_local_reu|idx_pericia_local_reu_pessoa|1|1:tipo_pessoa::A,2:pessoa_id::A|BTREE', 0),
  ('I|pericia_local_reu|uq_pericia_local_reu|0|1:pericia_id::A,2:tipo_pessoa::A,3:pessoa_id::A|BTREE', 0),
  ('I|pericias_etiquetas|PRIMARY|0|1:pericia_id::A,2:usuario_id::A|BTREE', 0),
  ('I|pericias_etiquetas|idx_perie_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|pericia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pericia|assistente_tecnico_id|1|1:assistente_tecnico_id::A|BTREE', 0),
  ('I|pericia|criado_por|1|1:criado_por::A|BTREE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('I|pericia|fk_pericia_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|pericia|fk_pericia_resp_freela|1|1:responsavel_freela_id::A|BTREE', 0),
  ('I|pericia|fk_pericia_responsavel|1|1:responsavel_id::A|BTREE', 0),
  ('I|pericia|idx_per_data|1|1:data::A|BTREE', 0),
  ('I|pericia|idx_pericia_assistente_freela|1|1:assistente_tecnico_freela_id::A|BTREE', 0),
  ('I|pericia|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|pericia|tipo_pericia_id|1|1:tipo_pericia_id::A|BTREE', 0),
  ('I|permissoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|permissoes|idx_usuario_modulo|1|1:usuario_id::A,2:modulo::A,3:submodulo::A,4:acao::A|BTREE', 0),
  ('I|pessoas_avisos_idade|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pessoas_avisos_idade|fk_aviso_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|pessoas_avisos_idade|idx_aviso_pendente|1|1:avisado_em::A|BTREE', 0),
  ('I|pessoas_avisos_idade|uq_aviso_pessoa_idade|0|1:pessoa_id::A,2:idade::A|BTREE', 0),
  ('I|pessoas_fisicas_etiquetas_escritorio|PRIMARY|0|1:pessoa_id::A|BTREE', 0),
  ('I|pessoas_fisicas_etiquetas_escritorio|idx_pfee_marcado_por|1|1:marcado_por::A|BTREE', 0),
  ('I|pessoas_fisicas|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pessoas_fisicas|estado_civil_id|1|1:estado_civil_id::A|BTREE', 0),
  ('I|pessoas_fisicas|fk_pf_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|pessoas_fisicas|fk_pf_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|pessoas_fisicas|fk_pf_parentesco|1|1:parentesco_id::A|BTREE', 0),
  ('I|pessoas_fisicas|genero_id|1|1:genero_id::A|BTREE', 0),
  ('I|pessoas_fisicas|idx_pf_ativo_nome|1|1:ativo::A,2:nome::A|BTREE', 0),
  ('I|pessoas_fisicas|idx_pf_responsavel|1|1:responsavel_id::A|BTREE', 0),
  ('I|pessoas_fisicas|nacionalidade_id|1|1:nacionalidade_id::A|BTREE', 0),
  ('I|pessoas_fisicas|profissao_id|1|1:profissao_id::A|BTREE', 0),
  ('I|pessoas_fisicas|uq_pf_cpf|0|1:cpf::A|BTREE', 0),
  ('I|pessoas_juridicas_etiquetas_escritorio|PRIMARY|0|1:pessoa_id::A|BTREE', 0),
  ('I|pessoas_juridicas_etiquetas_escritorio|idx_pjee_marcado_por|1|1:marcado_por::A|BTREE', 0),
  ('I|pessoas_juridicas|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|pessoas_juridicas|fk_pj_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|pessoas_juridicas|fk_pj_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|pessoas_juridicas|idx_pj_ativo_razao|1|1:ativo::A,2:razao_social::A|BTREE', 0),
  ('I|pessoas_juridicas|uq_pj_cnpj|0|1:cnpj::A|BTREE', 0),
  ('I|prazo_subtipo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|prazo_subtipo|tipo_prazo_id|1|1:tipo_prazo_id::A|BTREE', 0),
  ('I|prazos_etiquetas|PRIMARY|0|1:prazo_id::A,2:usuario_id::A|BTREE', 0),
  ('I|prazos_etiquetas|idx_praze_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|prazos_processo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|prazos_processo|concluido_por|1|1:concluido_por::A|BTREE', 0),
  ('I|prazos_processo|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|prazos_processo|delegado_para|1|1:delegado_para::A|BTREE', 0),
  ('I|prazos_processo|fk_pp_fazendo_por|1|1:fazendo_por::A|BTREE', 0),
  ('I|prazos_processo|idx_pp_publicacao|1|1:publicacao_id::A|BTREE', 0),
  ('I|prazos_processo|idx_vencimento_status|1|1:data_vencimento::A,2:status::A|BTREE', 0),
  ('I|prazos_processo|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|prazos_processo|status_alterado_por|1|1:status_alterado_por::A|BTREE', 0),
  ('I|prazos_processo|subtipo_id|1|1:subtipo_id::A|BTREE', 0),
  ('I|processo_assunto|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|processo_assunto|idx_processo_assunto_assunto|1|1:assunto_id::A|BTREE', 0),
  ('I|processo_assunto|idx_processo_assunto_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|processo_assunto|uq_processo_assunto|0|1:processo_id::A,2:assunto_id::A|BTREE', 0),
  ('I|processo_oabs|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|processo_oabs|idx_po_freela|1|1:freela_id::A|BTREE', 0),
  ('I|processo_oabs|idx_po_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|processo_oabs|uq_processo_oab_freela|0|1:processo_id::A,2:freela_id::A|BTREE', 0),
  ('I|processo_oabs|uq_processo_oab_usuario|0|1:processo_id::A,2:usuario_id::A|BTREE', 0),
  ('I|processo_perito|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|processo_perito|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|processo_perito|proc_id|1|1:proc_id::A|BTREE', 0),
  ('I|processos_etiquetas_escritorio|PRIMARY|0|1:processo_id::A|BTREE', 0),
  ('I|processos_etiquetas_escritorio|idx_pee_marcado_por|1|1:marcado_por::A|BTREE', 0),
  ('I|profissao|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|publicacao_usuario|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|publicacao_usuario|idx_pu_atribuida_por|1|1:atribuida_por::A|BTREE', 0),
  ('I|publicacao_usuario|idx_pu_pub|1|1:publicacao_id::A|BTREE', 0),
  ('I|publicacao_usuario|idx_pu_tratada_por|1|1:tratada_por::A|BTREE', 0),
  ('I|publicacao_usuario|idx_pu_user|1|1:usuario_id::A|BTREE', 0),
  ('I|publicacao_usuario|uq_pu_pub_user|0|1:publicacao_id::A,2:usuario_id::A|BTREE', 0),
  ('I|publicacoes_etiquetas|PRIMARY|0|1:publicacao_id::A,2:usuario_id::A|BTREE', 0),
  ('I|publicacoes_etiquetas|idx_pube_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|publicacoes_lidas|PRIMARY|0|1:publicacao_id::A,2:usuario_id::A|BTREE', 0),
  ('I|publicacoes_lidas|idx_pl_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|publicacoes|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|publicacoes|direcionada_por|1|1:direcionada_por::A|BTREE', 0),
  ('I|publicacoes|idx_pub_data|1|1:data_publicacao::A|BTREE', 0),
  ('I|publicacoes|idx_pub_fonte|1|1:fonte::A|BTREE', 0),
  ('I|publicacoes|idx_pub_hash|1|1:texto_hash::A|BTREE', 0),
  ('I|publicacoes|idx_pub_processo|1|1:numero_processo::A|BTREE', 0),
  ('I|publicacoes|importada_por|1|1:importada_por::A|BTREE', 0),
  ('I|publicacoes|tratada_por|1|1:tratada_por::A|BTREE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('I|publicacoes|uq_pub_cnj|0|1:fonte::A,2:id_cnj::A|BTREE', 0),
  ('I|relatorio_agendamento|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|relatorio_agendamento|idx_relag_dono|1|1:dono_id::A|BTREE', 0),
  ('I|relatorio_agendamento|idx_relag_modelo|1|1:modelo_id::A|BTREE', 0),
  ('I|relatorio_agendamento|idx_relag_proxima|1|1:ativo::A,2:proxima_execucao::A|BTREE', 0),
  ('I|relatorio_modelo_usuario|PRIMARY|0|1:modelo_id::A,2:usuario_id::A|BTREE', 0),
  ('I|relatorio_modelo_usuario|idx_relmu_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|relatorio_modelo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|relatorio_modelo|fk_relmod_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|relatorio_modelo|idx_relmod_escopo|1|1:escopo::A|BTREE', 0),
  ('I|relatorio_modelo|uq_relmod_dono_nome|0|1:dono_id::A,2:nome::A|BTREE', 0),
  ('I|reset_tokens|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|reset_tokens|token|0|1:token::A|BTREE', 0),
  ('I|reset_tokens|usuario_id|1|1:usuario_id::A|BTREE', 0),
  ('I|tarefas_etiquetas|PRIMARY|0|1:tarefa_id::A,2:usuario_id::A|BTREE', 0),
  ('I|tarefas_etiquetas|idx_tare_usuario|1|1:usuario_id::A|BTREE', 0),
  ('I|tarefas|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tarefas|andamento_id|1|1:andamento_id::A|BTREE', 0),
  ('I|tarefas|atribuida_para|1|1:atribuida_para::A|BTREE', 0),
  ('I|tarefas|concluida_por|1|1:concluida_por::A|BTREE', 0),
  ('I|tarefas|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tarefas|idx_concluida_vencimento|1|1:concluida::A,2:data_vencimento::A|BTREE', 0),
  ('I|tarefas|idx_tarefas_publicacao|1|1:publicacao_id::A|BTREE', 0),
  ('I|tarefas|pasta_id|1|1:pasta_id::A|BTREE', 0),
  ('I|tarefas|prazo_id|1|1:prazo_id::A|BTREE', 0),
  ('I|tarefas|processo_id|1|1:processo_id::A|BTREE', 0),
  ('I|tblassuntoproc|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblassuntoproc|idx_tblassuntoproc_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblassuntoproc|idx_tblassuntoproc_ativo_nome|1|1:ativo::A,2:nome::A|BTREE', 0),
  ('I|tblassuntoproc|idx_tblassuntoproc_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblassuntoproc|uq_tblassuntoproc_nome|0|1:nome::A|BTREE', 0),
  ('I|tblforum|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblforum|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblforum|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblinstanciaproc|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblinstanciaproc|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblinstanciaproc|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblpasta|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblpasta|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblpasta|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblpasta|numPasta|0|1:numPasta::A|BTREE', 0),
  ('I|tblproc|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblproc|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblproc|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblproc|fk_tblproc_responsavel|1|1:responsavel_id::A|BTREE', 0),
  ('I|tblproc|idx_proc_numproc|1|1:numProc::A|BTREE', 0),
  ('I|tblproc|idx_proc_pasta_ativo|1|1:pasta_id::A,2:ativo::A|BTREE', 0),
  ('I|tblproc|idx_proc_protocolo|1|1:protocolo::A|BTREE', 0),
  ('I|tblproc|instancia_id|1|1:instancia_id::A|BTREE', 0),
  ('I|tblproc|pasta_id|1|1:pasta_id::A|BTREE', 0),
  ('I|tblproc|status_id|1|1:status_id::A|BTREE', 0),
  ('I|tblproc|tipo_id|1|1:tipo_id::A|BTREE', 0),
  ('I|tblproc|vara_id|1|1:vara_id::A|BTREE', 0),
  ('I|tblstatusproc|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblstatusproc|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblstatusproc|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tbltipoproc|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tbltipoproc|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tbltipoproc|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tbltituloprocautor|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tbltituloprocautor|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tbltituloprocautor|idx_titautor_pessoa|1|1:pessoa_id::A,2:tipo_pessoa::A,3:proc_id::A|BTREE', 0),
  ('I|tbltituloprocautor|proc_id|1|1:proc_id::A|BTREE', 0),
  ('I|tbltituloprocreu|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tbltituloprocreu|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tbltituloprocreu|idx_titreu_pessoa|1|1:pessoa_id::A,2:tipo_pessoa::A,3:proc_id::A|BTREE', 0),
  ('I|tbltituloprocreu|proc_id|1|1:proc_id::A|BTREE', 0),
  ('I|tblvara|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tblvara|alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tblvara|criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tblvara|forum_id|1|1:forum_id::A|BTREE', 0),
  ('I|telefones_pf|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|telefones_pf|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|telefones_pf|uq_tel_pf_sms|0|1:sms_unico::A|BTREE', 1),
  ('I|telefones_pf|uq_tel_pf_whatsapp|0|1:whatsapp_unico::A|BTREE', 1),
  ('I|telefones_pj|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|telefones_pj|pessoa_id|1|1:pessoa_id::A|BTREE', 0),
  ('I|telefones_pj|uq_tel_pj_sms|0|1:sms_unico::A|BTREE', 1),
  ('I|telefones_pj|uq_tel_pj_whatsapp|0|1:whatsapp_unico::A|BTREE', 1),
  ('I|tipo_audiencia|PRIMARY|0|1:id::A|BTREE', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('I|tipo_documento_pendencia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tipo_documento_pendencia|fk_tipo_doc_pend_alterado_por|1|1:alterado_por::A|BTREE', 0),
  ('I|tipo_documento_pendencia|fk_tipo_doc_pend_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|tipo_documento_pendencia|idx_tipo_doc_pend_ativo_nome|1|1:ativo::A,2:nome::A|BTREE', 0),
  ('I|tipo_documento_pendencia|uq_tipo_doc_pend_nome|0|1:nome::A|BTREE', 0),
  ('I|tipo_pericia|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|tipo_prazo|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|usuarios|PRIMARY|0|1:id::A|BTREE', 0),
  ('I|usuarios|fk_usuarios_criado_por|1|1:criado_por::A|BTREE', 0),
  ('I|usuarios|uq_login|0|1:login::A|BTREE', 0),
  ('K|audiencia_responsaveis|chk_ar_um_responsavel', 0),
  ('K|avisos_cliente|chk_aviso_uma_referencia', 1),
  ('K|contas_bancarias_pf|ck_cbpf_tipo', 0),
  ('K|contas_bancarias_pj|ck_cbpj_tipo', 0),
  ('K|processo_oabs|chk_po_um_dono', 0),
  ('T|acordo_parcela_multa|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|acordo_parcela|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|acordo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|advogados_freela|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|agenda_compromisso|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|andamento_processual|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|ata_audiencia_itens|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|ata_audiencia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|audiencia_responsaveis|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|audiencia_testemunhas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|audiencias_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|audiencia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_audiencia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_conta_corrente|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_etiqueta_escritorio|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_parcela|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_pericia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|auditoria_prazo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|avisos_cliente|InnoDB|utf8mb4_0900_ai_ci|', 1),
  ('T|calendario|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|configuracoes_escritorio|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|configuracoes_integracoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|conta_corrente|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|conta_financeira|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|contas_bancarias_pf|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|contas_bancarias_pj|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|controle_versao_banco|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|emails_pf|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|emails_pj|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|estado_civil|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|etiquetas_definicoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|etiquetas_escritorio_catalogo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|feriados|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|forma_pagamento|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|genero|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|historico_atendimento|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|instituicao_financeira|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|log_comunicacoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|log_documentos_gerados|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|log_emails|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|log_publicacoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|logs_auditoria|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|modelo_documento|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|nacionalidade|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|notificacoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|parabens_enviados|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|parentesco|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pastas_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pendencia_documento_item|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pendencia_documento_responsavel|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pendencia_documento|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pericia_local_reu|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pericias_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pericia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|permissoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pessoas_avisos_idade|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pessoas_fisicas_etiquetas_escritorio|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pessoas_fisicas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pessoas_juridicas_etiquetas_escritorio|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|pessoas_juridicas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|prazo_subtipo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|prazos_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|prazos_processo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|processo_assunto|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|processo_oabs|InnoDB|utf8mb4_0900_ai_ci|', 0);

INSERT INTO `_esperado` (`linha`, `novo`) VALUES
  ('T|processo_perito|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|processos_etiquetas_escritorio|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|profissao|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|publicacao_usuario|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|publicacoes_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|publicacoes_lidas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|publicacoes|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|relatorio_agendamento|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|relatorio_modelo_usuario|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|relatorio_modelo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|reset_tokens|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tarefas_etiquetas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tarefas|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblassuntoproc|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblforum|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblinstanciaproc|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblpasta|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblproc|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblstatusproc|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tbltipoproc|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tbltituloprocautor|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tbltituloprocreu|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tblvara|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|telefones_pf|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|telefones_pj|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tipo_audiencia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tipo_documento_pendencia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tipo_pericia|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|tipo_prazo|InnoDB|utf8mb4_0900_ai_ci|', 0),
  ('T|usuarios|InnoDB|utf8mb4_0900_ai_ci|', 0);

INSERT INTO `_antigo_ok` (`linha`) VALUES
  ('C|modelo_documento|destino|varchar(20)|NO|comum||utf8mb4_0900_ai_ci'),
  ('C|parabens_enviados|usuario_id|int|NO|<NULL>||');

INSERT INTO `_atual` (`linha`)
SELECT CONCAT('T|', table_name, '|', engine, '|', table_collation, '|', IFNULL(create_options, ''))
  FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
UNION ALL
SELECT CONCAT('C|', table_name, '|', column_name, '|', column_type, '|', is_nullable, '|', IFNULL(column_default, '<NULL>'), '|', extra, '|', IFNULL(collation_name, ''))
  FROM information_schema.COLUMNS WHERE table_schema = DATABASE()
UNION ALL
SELECT CONCAT('I|', table_name, '|', index_name, '|', non_unique, '|', GROUP_CONCAT(CONCAT(seq_in_index, ':', IFNULL(column_name, expression), ':', IFNULL(sub_part, ''), ':', IFNULL(collation, '')) ORDER BY seq_in_index SEPARATOR ','), '|', index_type)
  FROM information_schema.STATISTICS WHERE table_schema = DATABASE() GROUP BY table_name, index_name, non_unique, index_type
UNION ALL
SELECT CONCAT('F|', k.table_name, '|', k.constraint_name, '|', GROUP_CONCAT(k.column_name ORDER BY k.ordinal_position SEPARATOR ','), '|', k.referenced_table_name, '|', GROUP_CONCAT(k.referenced_column_name ORDER BY k.ordinal_position SEPARATOR ','), '|', r.update_rule, '|', r.delete_rule)
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name AND r.table_name = k.table_name
 WHERE k.table_schema = DATABASE() AND k.referenced_table_name IS NOT NULL
 GROUP BY k.table_name, k.constraint_name, k.referenced_table_name, r.update_rule, r.delete_rule
UNION ALL
SELECT CONCAT('K|', table_name, '|', constraint_name)
  FROM information_schema.TABLE_CONSTRAINTS WHERE table_schema = DATABASE() AND constraint_type = 'CHECK'
UNION ALL
SELECT CONCAT('R|gatilho|', event_object_table, '|', trigger_name) FROM information_schema.TRIGGERS WHERE trigger_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|rotina|', routine_type, '|', routine_name) FROM information_schema.ROUTINES WHERE routine_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|evento|', event_name) FROM information_schema.EVENTS WHERE event_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|visao|', table_name) FROM information_schema.VIEWS WHERE table_schema = DATABASE();

SET @n_esperado := (SELECT COUNT(*) FROM `_esperado`);
SET @pre_faltam_novos := (SELECT COUNT(*) FROM `_esperado` e WHERE e.novo = 1 AND NOT EXISTS (SELECT 1 FROM `_atual` a WHERE a.linha = e.linha));
SET @pre_faltam_outros := (SELECT COUNT(*) FROM `_esperado` e WHERE e.novo = 0 AND NOT EXISTS (SELECT 1 FROM `_atual` a WHERE a.linha = e.linha));
SET @pre_sobram_outros := (SELECT COUNT(*) FROM `_atual` a WHERE NOT EXISTS (SELECT 1 FROM `_esperado` e WHERE e.linha = a.linha)
                                                               AND NOT EXISTS (SELECT 1 FROM `_antigo_ok` o WHERE o.linha = a.linha));
SET @pre_desconhecidas := @pre_faltam_outros + @pre_sobram_outros;
SET @ok := IF(@ok0 = 1 AND @pre_desconhecidas = 0, 1, 0);
SET @motivo := IF(@ok0 = 0, @motivo0,
                  IF(@pre_desconhecidas > 0, CONCAT('ABORTADO: este banco tem ', @pre_desconhecidas, ' diferenca(s) que o script NAO conhece (veja a segunda aba, linhas com conhecida = 0). Nada foi alterado - me envie a lista.'), 'OK'));

-- ---------- 2) VERSAO 1 (04/10/2026): Financeiro, contas bancarias, Relatorios, remocao de tblpasta.area_direito, destino do modelo (so cria/ajusta o que falta)
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

-- ---------- 3) VERSAO 2 (08/10/2026): avisos aos clientes
-- ---------- a) colunas whatsapp e sms nos telefones (guarda se ELAS ainda não existiam: a marcação do item b só vale nesta primeira vez)
SET @pf_novo := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pf' AND COLUMN_NAME = 'whatsapp') = 0, 1, 0);
SET @pj_novo := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'telefones_pj' AND COLUMN_NAME = 'whatsapp') = 0, 1, 0);

SET @sql := IF(@pf_novo = 1, 'ALTER TABLE `telefones_pf` ADD COLUMN `whatsapp` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de WhatsApp da pessoa (no maximo um ativo)'', ADD COLUMN `sms` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de SMS da pessoa (no maximo um ativo)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@pj_novo = 1, 'ALTER TABLE `telefones_pj` ADD COLUMN `whatsapp` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de WhatsApp da pessoa (no maximo um ativo)'', ADD COLUMN `sms` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = este e o numero de SMS da pessoa (no maximo um ativo)''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- b) marcacao inicial dos telefones que ja existem: so se a versao 2 ainda NAO esta registrada e ninguem marcou nada ainda (um unico numero por pessoa:
--    o de menor id entre os principais ativos que parecem celular). Depois que a versao 2 e registrada, nunca mais marca.
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @v2_registrada FROM `controle_versao_banco` WHERE numero = 2', 'SET @v2_registrada := 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @pf_ja_marcado FROM `telefones_pf` WHERE whatsapp = 1 OR sms = 1', 'SET @pf_ja_marcado := 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @pj_ja_marcado FROM `telefones_pj` WHERE whatsapp = 1 OR sms = 1', 'SET @pj_ja_marcado := 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @marcar_pf := IF(@ok = 1 AND @v2_registrada = 0 AND @pf_ja_marcado = 0, 1, 0);
SET @marcar_pj := IF(@ok = 1 AND @v2_registrada = 0 AND @pj_ja_marcado = 0, 1, 0);
SET @sql := IF(@marcar_pf = 1,
 'UPDATE `telefones_pf` t JOIN (
     SELECT MIN(id) AS id FROM `telefones_pf`
      WHERE principal = 1 AND ativo = 1
        AND CHAR_LENGTH(REGEXP_REPLACE(numero, ''[^0-9]'', '''')) = 11
        AND SUBSTRING(REGEXP_REPLACE(numero, ''[^0-9]'', ''''), 3, 1) = ''9''
      GROUP BY pessoa_id) x ON x.id = t.id
    SET t.whatsapp = 1, t.sms = 1', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@marcar_pj = 1,
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


-- ---------- 4) VERSAO 3 (10/10/2026): cor da etiqueta Acordo
-- ---------- a) coluna da cor da etiqueta "Acordo"
SET @sql := IF(@ok = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'configuracoes_escritorio' AND COLUMN_NAME = 'cor_etiqueta_acordo') = 0,
 'ALTER TABLE `configuracoes_escritorio` ADD COLUMN `cor_etiqueta_acordo` varchar(7) DEFAULT NULL COMMENT ''cor (#rrggbb) da etiqueta e do fundo automaticos de processo com acordo; vazio = cor padrao do sistema''', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------- 5) VERSAO 4 (10/10/2026): permissao de Repasses no Financeiro (so na PRIMEIRA vez, enquanto a versao 4 nao esta registrada;
--    depois que registrada, nunca mais mexe nas permissoes). Da o sub-item a quem ja tem Alterar no Financeiro e ainda nao tem linha dele.
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @v4_registrada FROM `controle_versao_banco` WHERE numero = 4', 'SET @v4_registrada := 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @dar_repasses := IF(@ok = 1 AND @v4_registrada = 0, 1, 0);
SET @sql := IF(@dar_repasses = 1, 'SELECT COUNT(DISTINCT p.usuario_id) INTO @com_alterar FROM `permissoes` p
                          WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1', 'SET @com_alterar := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@dar_repasses = 1, 'SELECT COUNT(DISTINCT p.usuario_id) INTO @ja_tinham FROM `permissoes` p
                          WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
                            AND EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                                     AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')', 'SET @ja_tinham := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@dar_repasses = 1,
 'INSERT INTO `permissoes` (`usuario_id`, `modulo`, `submodulo`, `acao`, `permitido`)
  SELECT DISTINCT p.usuario_id, ''financeiro'', ''repasses'', ''alterar'', 1
    FROM `permissoes` p
   WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
     AND NOT EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                    AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @receberam := IF(@dar_repasses = 1, @com_alterar - @ja_tinham, NULL);
SET @sql := IF(@dar_repasses = 1, 'SELECT COUNT(DISTINCT p.usuario_id) INTO @perm_faltando FROM `permissoes` p
                          WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
                            AND NOT EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                                         AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')', 'SET @perm_faltando := 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 6) CONFERENCIA FINAL: a estrutura do banco agora e igual a esperada? (so leitura)
TRUNCATE TABLE `_atual`;
INSERT INTO `_atual` (`linha`)
SELECT CONCAT('T|', table_name, '|', engine, '|', table_collation, '|', IFNULL(create_options, ''))
  FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
UNION ALL
SELECT CONCAT('C|', table_name, '|', column_name, '|', column_type, '|', is_nullable, '|', IFNULL(column_default, '<NULL>'), '|', extra, '|', IFNULL(collation_name, ''))
  FROM information_schema.COLUMNS WHERE table_schema = DATABASE()
UNION ALL
SELECT CONCAT('I|', table_name, '|', index_name, '|', non_unique, '|', GROUP_CONCAT(CONCAT(seq_in_index, ':', IFNULL(column_name, expression), ':', IFNULL(sub_part, ''), ':', IFNULL(collation, '')) ORDER BY seq_in_index SEPARATOR ','), '|', index_type)
  FROM information_schema.STATISTICS WHERE table_schema = DATABASE() GROUP BY table_name, index_name, non_unique, index_type
UNION ALL
SELECT CONCAT('F|', k.table_name, '|', k.constraint_name, '|', GROUP_CONCAT(k.column_name ORDER BY k.ordinal_position SEPARATOR ','), '|', k.referenced_table_name, '|', GROUP_CONCAT(k.referenced_column_name ORDER BY k.ordinal_position SEPARATOR ','), '|', r.update_rule, '|', r.delete_rule)
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name AND r.table_name = k.table_name
 WHERE k.table_schema = DATABASE() AND k.referenced_table_name IS NOT NULL
 GROUP BY k.table_name, k.constraint_name, k.referenced_table_name, r.update_rule, r.delete_rule
UNION ALL
SELECT CONCAT('K|', table_name, '|', constraint_name)
  FROM information_schema.TABLE_CONSTRAINTS WHERE table_schema = DATABASE() AND constraint_type = 'CHECK'
UNION ALL
SELECT CONCAT('R|gatilho|', event_object_table, '|', trigger_name) FROM information_schema.TRIGGERS WHERE trigger_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|rotina|', routine_type, '|', routine_name) FROM information_schema.ROUTINES WHERE routine_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|evento|', event_name) FROM information_schema.EVENTS WHERE event_schema = DATABASE()
UNION ALL
SELECT CONCAT('R|visao|', table_name) FROM information_schema.VIEWS WHERE table_schema = DATABASE();
SET @pos_faltam := (SELECT COUNT(*) FROM `_esperado` e WHERE NOT EXISTS (SELECT 1 FROM `_atual` a WHERE a.linha = e.linha));
SET @pos_sobram := (SELECT COUNT(*) FROM `_atual` a WHERE NOT EXISTS (SELECT 1 FROM `_esperado` e WHERE e.linha = a.linha));
SET @tudo := IF(@ok = 1 AND @pos_faltam = 0 AND @pos_sobram = 0 AND @perm_faltando = 0, 1, 0);

-- ---------- 7) REGISTRA AS VERSOES 1 A 4 no proprio banco (tabela controle_versao_banco; so se tudo deu certo; nunca repete)
SET @sql := IF(@tudo = 1, 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (1, ''Atualizacao geral de 04/10/2026: Financeiro, contas bancarias das pessoas, Relatorios e remocao de tblpasta.area_direito (script sql_atualizar_banco_para_heidi.sql)'')', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@tudo = 1, 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (2, ''Avisos automaticos aos clientes (08/10/2026): tabela avisos_cliente, marcadores de WhatsApp/SMS nos telefones e configuracao por modulo (script sql_avisos_clientes_para_heidi.sql)'')', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@tudo = 1, 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (3, ''Cor da etiqueta Acordo (10/10/2026): coluna configuracoes_escritorio.cor_etiqueta_acordo'')', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@tudo = 1, 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (4, ''Permissao de Repasses no Financeiro (10/10/2026): sub-item financeiro/repasses/alterar para quem ja tinha Alterar'')', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql := IF(@ok = 1, 'SELECT COALESCE(MAX(numero), 0) INTO @versao_agora FROM `controle_versao_banco`', 'SET @versao_agora := @versao_antes');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @tel_pf FROM `telefones_pf` WHERE whatsapp = 1', 'SET @tel_pf := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(*) INTO @tel_pj FROM `telefones_pj` WHERE whatsapp = 1', 'SET @tel_pj := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- 8) RESULTADO: aba 1 = UMA linha (leia a coluna "situacao"); aba 2 = so aparece se houver diferencas
SELECT IF(@tudo = 1,
          IF(@versao_antes = 4 AND @pre_faltam_novos = 0 AND @pre_sobram_outros = 0, 'PRONTO: o banco JA estava igual ao estrutura_banco.sql (nada precisou mudar). Pode atualizar/reiniciar o sistema.',
             'PRONTO: o banco esta igual ao estrutura_banco.sql. Pode atualizar/reiniciar o sistema.'),
          IF(@ok = 1, 'ATENCAO: o script terminou mas a estrutura ainda difere da esperada (veja a segunda aba). Rode de novo; se persistir, me envie a lista.', @motivo)) AS situacao,
       @db AS banco,
       VERSION() AS versao_mysql,
       @versao_antes AS versao_do_banco_antes,
       @versao_agora AS versao_do_banco_agora,
       @n_esperado AS itens_de_estrutura_conferidos,
       IF(@ok = 1, @pos_faltam, @pre_faltam_outros + @pre_faltam_novos) AS itens_faltando,
       IF(@ok = 1, @pos_sobram, @pre_sobram_outros) AS itens_a_mais,
       @pre_desconhecidas AS diferencas_desconhecidas_antes,
       @receberam AS usuarios_que_receberam_repasses_agora,
       @tel_pf AS telefones_pf_marcados_whatsapp,
       @tel_pj AS telefones_pj_marcados_whatsapp;

SET @listar := IF(@ok0 = 1 AND ((@ok = 1 AND @tudo = 0) OR (@ok = 0 AND @pre_desconhecidas > 0)), 1, 0);
-- (a lista de diferencas e montada em duas etapas porque o MySQL nao deixa a mesma tabela temporaria aparecer duas vezes numa consulta)
INSERT INTO `_dif` (`tipo`, `conhecida`, `linha`)
  SELECT 'FALTA NO BANCO', e.novo, e.linha FROM `_esperado` e WHERE NOT EXISTS (SELECT 1 FROM `_atual` a WHERE a.linha = e.linha);
INSERT INTO `_dif` (`tipo`, `conhecida`, `linha`)
  SELECT 'A MAIS NO BANCO', IF(EXISTS (SELECT 1 FROM `_antigo_ok` o WHERE o.linha = a.linha), 1, 0), a.linha FROM `_atual` a WHERE NOT EXISTS (SELECT 1 FROM `_esperado` e WHERE e.linha = a.linha);
SET @sql := IF(@listar = 1, 'SELECT `tipo`, `conhecida`, `linha` FROM `_dif` ORDER BY `conhecida`, `tipo`, `linha` LIMIT 300', 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

DROP TEMPORARY TABLE IF EXISTS `_dif`;
DROP TEMPORARY TABLE IF EXISTS `_esperado`;
DROP TEMPORARY TABLE IF EXISTS `_antigo_ok`;
DROP TEMPORARY TABLE IF EXISTS `_atual`;
