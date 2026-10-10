-- IMPORTANTE — NÃO APAGAR. Script de atualização do banco: PERMISSÃO PRÓPRIA DE "REPASSES" NO FINANCEIRO (criado em 10/10/2026, pedido do usuário).
-- PARA QUE SERVE: o sistema passou a ter, em Configurações > Permissões > Financeiro, o sub-item "Repasses (registrar e desfazer)".
--   Só quem o tem consegue fazer e desfazer repasses (ao cliente, ao parceiro e da multa). Antes, quem tinha "Alterar" no Financeiro
--   repassava; sem este script, essas pessoas PERDERIAM o repasse até o administrador marcar o novo sub-item para cada uma.
--   Este script dá o novo sub-item a todo usuário que JÁ tem "Alterar" no Financeiro, para ninguém perder nada. Depois, o administrador
--   tira o sub-item de quem não deve repassar (Configurações > Permissões).
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local primeiro; Erick e Antônio só quando ele decidir, com backup antes).
--   Pode rodar quantas vezes quiser: só acrescenta o que falta, nunca repete e nunca mexe em quem já tem (ou já teve desmarcado) o sub-item.
-- NÃO ALTERA A ESTRUTURA do banco (só acrescenta linhas na tabela permissoes e registra a versão 4 em controle_versao_banco).
-- ORDEM EM PRODUÇÃO: depois do sql_atualizar_banco_para_heidi.sql (versão 1), do sql_avisos_clientes_para_heidi.sql (versão 2) e do
--   sql_cor_etiqueta_acordo_para_heidi.sql (versão 3). O código novo do sistema funciona mesmo sem este script; só que ninguém além do
--   administrador repassa até o sub-item ser marcado.
-- ----------------------------------------------------------------------------------------------------------
-- COMO USAR (nesta ordem):
--   1) Fazer o backup do banco (HeidiSQL: Exportar banco como SQL) e conferir que o arquivo não está com 0 KB.
--   2) HeidiSQL: clicar no BANCO DO SISTEMA na lista da esquerda (sistema_advocacia / erick_adv) e abrir este arquivo.
--   3) Executar TUDO com F9.
--   4) Ler a única linha de resultado: deve dizer "PRONTO ..." e mostrar quantos usuários receberam o sub-item.
--      Se disser "ABORTADO" ou "ATENCAO", me envie a linha.
-- ============================================================================================================
SET NAMES utf8mb4;
SET @db := DATABASE();

-- ---------- 0) este é mesmo o banco do sistema?
SET @n_chave := (SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = @db
                    AND TABLE_NAME IN ('usuarios','permissoes','configuracoes_escritorio','tblproc','acordo','controle_versao_banco'));
SET @ok := IF(@db IS NOT NULL AND @n_chave = 6, 1, 0);
SET @motivo := IF(@ok = 1, 'OK',
                  IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
                     'ABORTADO: este banco NAO parece ser o do sistema (faltam tabelas). Nada foi alterado.'));

-- (as contagens usam comandos preparados: se este não for o banco do sistema, nenhuma tabela é lida e o script só avisa)
SET @sql := IF(@ok = 1, 'SELECT COUNT(DISTINCT usuario_id) INTO @com_alterar FROM `permissoes`
                          WHERE modulo = ''financeiro'' AND submodulo IS NULL AND acao = ''alterar'' AND permitido = 1', 'SET @com_alterar := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@ok = 1, 'SELECT COUNT(DISTINCT p.usuario_id) INTO @ja_tinham FROM `permissoes` p
                          WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
                            AND EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                                     AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')', 'SET @ja_tinham := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- a) dá o sub-item "repasses" a quem já tem "Alterar" no Financeiro (e ainda não tem linha desse sub-item)
SET @sql := IF(@ok = 1,
 'INSERT INTO `permissoes` (`usuario_id`, `modulo`, `submodulo`, `acao`, `permitido`)
  SELECT DISTINCT p.usuario_id, ''financeiro'', ''repasses'', ''alterar'', 1
    FROM `permissoes` p
   WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
     AND NOT EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                    AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @receberam := IF(@ok = 1, @com_alterar - @ja_tinham, NULL);   -- (quem tinha Alterar e ainda não tinha o sub-item)

-- ---------- conferência: sobrou alguém com "Alterar" sem o sub-item (e sem linha dele)?
SET @sql := IF(@ok = 1, 'SELECT COUNT(DISTINCT p.usuario_id) INTO @faltando FROM `permissoes` p
                          WHERE p.modulo = ''financeiro'' AND p.submodulo IS NULL AND p.acao = ''alterar'' AND p.permitido = 1
                            AND NOT EXISTS (SELECT 1 FROM `permissoes` r WHERE r.usuario_id = p.usuario_id AND r.modulo = ''financeiro''
                                                                         AND r.submodulo = ''repasses'' AND r.acao = ''alterar'')', 'SET @faltando := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @tudo := IF(@ok = 1 AND @faltando = 0, 1, 0);

-- ---------- b) registra a versão 4 (só se tudo deu certo)
SET @sql := IF(@tudo = 1,
 'INSERT IGNORE INTO `controle_versao_banco` (`numero`, `descricao`) VALUES (4, ''Permissao de Repasses no Financeiro (10/10/2026): sub-item financeiro/repasses/alterar para quem ja tinha Alterar'')',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql := IF(@tudo = 1, 'SELECT CONCAT(''versao '', numero, '' registrada em '', aplicado_em) INTO @versao_registrada FROM `controle_versao_banco` WHERE numero = 4', 'SET @versao_registrada := NULL');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- resultado (uma única linha: leia a coluna "situacao")
SELECT IF(@tudo = 1, 'PRONTO: quem ja tinha Alterar no Financeiro agora tem tambem o sub-item Repasses.',
          IF(@ok = 1, 'ATENCAO: o script terminou mas ainda ha usuarios com Alterar sem o sub-item Repasses (veja a coluna abaixo). Rode de novo; se persistir, me envie esta linha.', @motivo)) AS situacao,
       @db AS banco,
       @com_alterar AS usuarios_com_alterar_no_financeiro,
       @ja_tinham AS ja_tinham_o_subitem_antes,
       @receberam AS receberam_agora,
       @faltando AS ainda_sem_o_subitem,
       @versao_registrada AS versao_registrada;
