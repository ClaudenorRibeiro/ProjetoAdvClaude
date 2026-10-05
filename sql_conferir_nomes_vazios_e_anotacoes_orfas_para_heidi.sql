-- TEMPORÁRIO — pode apagar depois de conferir o banco local (e as instâncias, se o usuário pedir) e anotar o resultado.
-- SOMENTE LEITURA (só SELECT): não altera nada. Rodar no HeidiSQL com o BANCO DO SISTEMA selecionado; executar TUDO (F9).
-- ============================================================================
-- Para que serve: antes de ativar a regra "nome em branco nunca é gravado" e "anotação só para pessoa que existe"
-- (Pessoas, pacote A de 05/10/2026), confere se o banco JÁ tem:
--   Resultado 1 = pessoas FÍSICAS com nome vazio ou só espaços
--   Resultado 2 = pessoas JURÍDICAS com razão social vazia ou só espaços
--   Resultado 3 = anotações de atendimento ÓRFÃS (a pessoa a que pertencem não existe)
--   Resultado 4 = pessoas (física/jurídica) com OBSERVAÇÕES acima de 5.000 caracteres (limite novo do pacote B de 05/10/2026, escolhido pelo usuário)
-- Se os quatro vierem vazios, não há nada a tratar. Se vier alguma linha, me avise ANTES de qualquer limpeza.
-- ============================================================================

SELECT 'FISICA com nome vazio' AS problema, id, nome, cpf, criado_em
  FROM pessoas_fisicas
 WHERE TRIM(nome) = '';

SELECT 'JURIDICA com razao social vazia' AS problema, id, razao_social, cnpj, criado_em
  FROM pessoas_juridicas
 WHERE TRIM(razao_social) = '';

SELECT 'ANOTACAO orfa' AS problema, h.id, h.tipo_pessoa, h.pessoa_id, LEFT(h.descricao, 60) AS inicio_do_texto, h.criado_em
  FROM historico_atendimento h
 WHERE (h.tipo_pessoa = 'juridica' AND NOT EXISTS (SELECT 1 FROM pessoas_juridicas pj WHERE pj.id = h.pessoa_id))
    OR (h.tipo_pessoa <> 'juridica' AND NOT EXISTS (SELECT 1 FROM pessoas_fisicas pf WHERE pf.id = h.pessoa_id));

SELECT 'FISICA com observacoes muito longas' AS problema, id, nome, CHAR_LENGTH(observacoes) AS tamanho
  FROM pessoas_fisicas
 WHERE CHAR_LENGTH(observacoes) > 5000
UNION ALL
SELECT 'JURIDICA com observacoes muito longas', id, razao_social, CHAR_LENGTH(observacoes)
  FROM pessoas_juridicas
 WHERE CHAR_LENGTH(observacoes) > 5000;
