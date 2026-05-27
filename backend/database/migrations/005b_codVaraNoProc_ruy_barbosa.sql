-- ============================================================
-- SCRIPT 005b — Preencher codVaraNoProc nas varas já inseridas
-- Fórum Trabalhista Ruy Barbosa
-- Data: 2026-05-27
--
-- Pré-requisito: 005_popular_forum_varas_ruy_barbosa.sql já executado
--
-- Lógica: extrai o número ordinal do nome da vara (ex: "1ª Vara...")
-- e monta o código CNJ no padrão 50200NN (ex: 5020001)
-- ============================================================

USE sistema_advocacia;

UPDATE tblVara v
  JOIN tblForum f ON f.id = v.forum_id
SET v.codVaraNoProc = CONCAT(
    '50200',
    LPAD(CAST(REGEXP_REPLACE(v.nome, '[^0-9]', '') AS UNSIGNED), 2, '0')
  )
WHERE f.nome = 'Fórum Trabalhista Ruy Barbosa'
  AND v.codVaraNoProc IS NULL;

-- Verificação: deve retornar 90 linhas com o código preenchido
-- SELECT nome, codVaraNoProc FROM tblVara v
--   JOIN tblForum f ON f.id = v.forum_id
--   WHERE f.nome = 'Fórum Trabalhista Ruy Barbosa'
--   ORDER BY CAST(codVaraNoProc AS UNSIGNED);
