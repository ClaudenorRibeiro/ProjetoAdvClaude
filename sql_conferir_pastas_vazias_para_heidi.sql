-- TEMPORÁRIO — pode apagar depois de conferir as pastas vazias (local e Antônio) e anotar o resultado.
-- SOMENTE LEITURA (só SELECT): não altera nada. Rodar no HeidiSQL com o BANCO DO SISTEMA selecionado; executar TUDO (F9).
-- ============================================================================
-- Para que serve: saber se ainda existem pastas TOTALMENTE vazias (sem nenhum processo, nem inativo, e sem tarefa ligada).
--   Resultado 1 = quantas pastas vazias existem (e quantas no total, para comparar)
--   Resultado 2 = as pastas vazias com número 9999 e 928804 (as 2 que o script antigo apagava; devem vir SEM linhas se já foi feito)
--   Resultado 3 = as 20 pastas vazias mais antigas (só amostra, para você enxergar o que sobrou)
-- ============================================================================

-- Resultado 1
SELECT
  (SELECT COUNT(*) FROM tblpasta) AS pastas_no_total,
  (SELECT COUNT(*) FROM tblpasta pa
    WHERE NOT EXISTS (SELECT 1 FROM tblproc pr WHERE pr.pasta_id = pa.id)
      AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)) AS pastas_totalmente_vazias;

-- Resultado 2
SELECT pa.id, pa.numPasta, pa.criado_em
  FROM tblpasta pa
 WHERE pa.numPasta IN (9999, 928804)
   AND NOT EXISTS (SELECT 1 FROM tblproc pr WHERE pr.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id);

-- Resultado 3
SELECT pa.id, pa.numPasta, pa.criado_em, pa.criado_por
  FROM tblpasta pa
 WHERE NOT EXISTS (SELECT 1 FROM tblproc pr WHERE pr.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
 ORDER BY pa.numPasta
 LIMIT 20;
