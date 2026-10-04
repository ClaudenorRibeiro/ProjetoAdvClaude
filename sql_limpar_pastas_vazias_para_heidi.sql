-- IMPORTANTE — NÃO APAGAR. Procura e remove "pastas fantasmas": pastas SEM NENHUM processo (nem ativo, nem excluído) que continuam
-- ocupando um número (ex.: a pasta 9999) e por isso fazem a troca de número recusar com "já pertence a outra pasta" sem aparecer em nenhuma lista.
-- Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, executando TUDO (F9), em CADA instância (local, AWS-Antônio, AWS-Erick).
-- Seguro para rodar mais de uma vez. Só apaga a pasta quando TODAS as condições abaixo são verdadeiras:
--   1) a pasta não tem nenhum processo (nem os excluídos);
--   2) a pasta não tem nenhuma tarefa ligada;
--   3) a pasta foi criada há mais de 1 dia (nunca mexe numa pasta que alguém acabou de abrir).
-- As etiquetas pessoais da pasta vazia saem junto (o banco faz isso sozinho). Nada mais é tocado.
-- Pastas vazias que têm tarefa ligada NÃO são apagadas: aparecem no resultado 3 para você decidir.
-- Resultado 1 = o que será apagado. Resultado 2 = quantas foram apagadas. Resultado 3 = vazias que ficaram (por terem tarefa).
-- ============================================================================================================

-- Resultado 1: o que será apagado
SELECT pa.id, pa.numPasta, pa.criado_em
  FROM tblpasta pa
 WHERE NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
   AND pa.criado_em < NOW() - INTERVAL 1 DAY
 ORDER BY pa.numPasta;

-- Apaga (um único comando: ou apaga tudo ou não apaga nada)
DELETE pa FROM tblpasta pa
 WHERE NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
   AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.pasta_id = pa.id)
   AND pa.criado_em < NOW() - INTERVAL 1 DAY;

-- Resultado 2: quantas foram apagadas
SELECT ROW_COUNT() AS pastas_apagadas;

-- Resultado 3: pastas vazias que ficaram (têm tarefa ligada ou foram criadas há menos de 1 dia) — normalmente vem vazio
SELECT pa.id, pa.numPasta, pa.criado_em,
       (SELECT COUNT(*) FROM tarefas t WHERE t.pasta_id = pa.id) AS tarefas_ligadas
  FROM tblpasta pa
 WHERE NOT EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id)
 ORDER BY pa.numPasta;
