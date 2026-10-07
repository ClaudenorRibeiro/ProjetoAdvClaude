-- IMPORTANTE — NÃO APAGAR. Script PEQUENO e independente (criado em 07/10/2026, pedido do usuário).
-- PARA QUE SERVE: aumenta a coluna modelo_documento.destino de 20 para 40 letras, para caber os tipos de modelo
--   "Recibo consolidado do acordo: cliente" (recibo_acordo_cliente = 21 letras) e "...: parceria" (recibo_acordo_parceria = 22).
--   Com 20 letras o banco recusava salvar esses dois tipos ("Erro interno").
-- QUEM RODA E QUANDO: o usuário, no HeidiSQL, em cada banco (local, Erick, Antônio). Pode rodar quantas vezes quiser.
--   A AWS (Erick/Antônio) só quando o usuário decidir, com backup do banco antes.
-- SEGURANÇA: só AUMENTA o tamanho da coluna (mantém NOT NULL e o padrão 'comum'). Não altera nem apaga nenhum modelo/dado.
--   Se a coluna já tem 40 ou mais, não faz nada. Se o banco selecionado não for o do sistema, não faz nada e avisa.
-- O mesmo passo também está dentro do script único sql_atualizar_banco_para_heidi.sql (item 5b); este arquivo é só o atalho.
-- COMO USAR (nesta ordem):
--   1) HeidiSQL: abrir a conexão e CLICAR no banco do sistema na lista da esquerda (sistema_advocacia / erick_adv).
--   2) Abrir este arquivo e executar TUDO com F9.
--   3) Ler a única linha de resultado: deve dizer "PRONTO" e a coluna "tamanho_destino_agora" deve ser 40 (ou mais).
-- ============================================================================================================
SET NAMES utf8mb4;
SET @db := DATABASE();

SET @tem_tabela := IF(@db IS NULL, 0, (SELECT COUNT(*) FROM information_schema.COLUMNS
                                        WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'modelo_documento' AND COLUMN_NAME = 'destino'));

SET @tamanho_antes := IF(@tem_tabela = 1, (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                                           WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'modelo_documento' AND COLUMN_NAME = 'destino'), NULL);

SET @sql := IF(@tem_tabela = 1 AND @tamanho_antes < 40,
 'ALTER TABLE `modelo_documento` MODIFY COLUMN `destino` varchar(40) NOT NULL DEFAULT ''comum''',
 'DO 0');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @tamanho_agora := IF(@tem_tabela = 1, (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                                           WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'modelo_documento' AND COLUMN_NAME = 'destino'), NULL);

SELECT IF(@db IS NULL, 'ABORTADO: nenhum banco esta selecionado. Clique no banco do sistema na lista da esquerda e rode de novo. Nada foi alterado.',
          IF(@tem_tabela = 0, 'ABORTADO: este banco NAO parece ser o do sistema (nao tem modelo_documento.destino). Selecione o banco certo e rode de novo. Nada foi alterado.',
             IF(@tamanho_agora >= 40, IF(@tamanho_antes < 40, 'PRONTO: a coluna destino foi aumentada para 40 letras.', 'PRONTO: a coluna destino ja tinha 40 letras ou mais. Nada precisou mudar.'),
                'ATENCAO: a coluna destino continua pequena. Me envie esta linha.'))) AS situacao,
       @db AS banco,
       @tamanho_antes AS tamanho_destino_antes,
       @tamanho_agora AS tamanho_destino_agora;
