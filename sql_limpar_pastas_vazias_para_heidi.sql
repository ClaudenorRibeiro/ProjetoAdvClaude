-- IMPORTANTE — NÃO APAGAR. Remove "pastas fantasmas" ESPECÍFICAS: pastas sem nenhum processo que continuam ocupando um número
-- (ex.: a pasta 9999) e por isso fazem a troca de número recusar com "já pertence a outra pasta" sem aparecer em nenhuma lista.
-- Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, executando TUDO (F9), em CADA instância (local, AWS-Antônio, AWS-Erick).
--
-- ATENÇÃO — por que NÃO é uma limpeza geral: no Antônio e no local existem 2.702 pastas sem processo; 2.700 delas foram criadas de uma vez em
-- 28/06/2026 (números 1 a 8935, criador 24) e 2.627 têm "área do direito" preenchida. Não sei por que existem (parecem pastas antigas importadas
-- sem os processos), então este script NUNCA as apaga em lote: só apaga os números escritos na lista abaixo.
--
-- COMO USAR: a lista fica no comando "SET @numeros". Hoje só tem o 9999. Para incluir outro número, escreva-o dentro dos parênteses
-- (ex.: '9999,928804'). Seguro para rodar mais de uma vez e em bancos onde o número não existe (não faz nada).
-- Mesmo estando na lista, a pasta só é apagada se TODAS as condições forem verdadeiras:
--   1) não tem nenhum processo (nem excluído);  2) não tem nenhuma tarefa ligada;  3) não tem "área do direito" preenchida.
-- As etiquetas pessoais da pasta vazia saem junto (o banco faz isso sozinho). Nada mais é tocado.
-- Resultado 1 = o que será apagado. Resultado 2 = quantas foram apagadas. Resultado 3 = números da lista que NÃO foram apagados e o motivo.
-- ============================================================================================================

SET @numeros := '9999';

-- Resultado 1: o que será apagado
SELECT pa.id, pa.numPasta, pa.criado_em
  FROM tblpasta pa
 WHERE FIND_IN_SET(pa.numPasta, @numeros)
   AND NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
   AND pa.area_direito IS NULL
 ORDER BY pa.numPasta;

-- Apaga (um único comando: ou apaga tudo ou não apaga nada)
DELETE pa FROM tblpasta pa
 WHERE FIND_IN_SET(pa.numPasta, @numeros)
   AND NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
   AND pa.area_direito IS NULL;

-- Resultado 2: quantas foram apagadas
SELECT ROW_COUNT() AS pastas_apagadas;

-- Resultado 3: números da lista que continuam existindo (têm processo, tarefa ou área do direito) — normalmente vem vazio
SELECT pa.id, pa.numPasta,
       (SELECT COUNT(*) FROM tblproc p WHERE p.pasta_id = pa.id) AS processos,
       (SELECT COUNT(*) FROM tarefas t WHERE t.pasta_id = pa.id) AS tarefas,
       pa.area_direito
  FROM tblpasta pa
 WHERE FIND_IN_SET(pa.numPasta, @numeros)
 ORDER BY pa.numPasta;
