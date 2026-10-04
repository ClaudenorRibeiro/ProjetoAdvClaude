-- IMPORTANTE — NÃO APAGAR. Remove exatamente DUAS pastas vazias que prendem número: a pasta 9999 e a pasta 928804 (decisão do usuário, 04/10/2026).
-- Elas não têm processo e não aparecem em nenhuma lista, mas continuam donas do número (por isso a troca de número recusava: "já pertence a outra pasta").
-- Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, executando TUDO (F9), SÓ NO ANTÔNIO (no Erick não existem pastas vazias).
-- Nenhuma outra pasta é tocada: os números 9999 e 928804 estão escritos fixos no script (não há lista para editar).
-- Mesmo assim, cada uma só é apagada se estiver TOTALMENTE vazia: 1) sem nenhum processo (nem excluído); 2) sem tarefa ligada. (A "área do direito" deixou de existir na pasta: a área é do processo.)
-- As etiquetas pessoais da pasta vazia saem junto (o banco faz isso sozinho). Seguro para rodar mais de uma vez (na 2ª vez não encontra nada e não apaga nada).
-- Resultado 1 = o que será apagado. Resultado 2 = quantas foram apagadas (esperado: 2 na primeira vez). Resultado 3 = se alguma das duas ainda existe (esperado: vazio).
-- ============================================================================================================

-- Resultado 1: o que será apagado
SELECT pa.id, pa.numPasta, pa.criado_em
  FROM tblpasta pa
 WHERE pa.numPasta IN (9999, 928804)
   AND NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
 ORDER BY pa.numPasta;

-- Apaga (um único comando: ou apaga tudo ou não apaga nada)
DELETE pa FROM tblpasta pa
 WHERE pa.numPasta IN (9999, 928804)
   AND NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id);

-- Resultado 2: quantas foram apagadas
SELECT ROW_COUNT() AS pastas_apagadas;

-- Resultado 3: se alguma das duas ainda existe (só acontece se tiver processo ou tarefa) — normalmente vem vazio
SELECT pa.id, pa.numPasta,
       (SELECT COUNT(*) FROM tblproc p WHERE p.pasta_id = pa.id) AS processos,
       (SELECT COUNT(*) FROM tarefas t WHERE t.pasta_id = pa.id) AS tarefas
  FROM tblpasta pa
 WHERE pa.numPasta IN (9999, 928804)
 ORDER BY pa.numPasta;
