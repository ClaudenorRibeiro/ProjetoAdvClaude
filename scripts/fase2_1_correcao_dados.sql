-- ============================================================
-- FASE 2.1 — CORREÇÃO DE DADOS
-- Rodar no HeidiSQL (local E produção — mesma ordem)
--
-- Corrige encoding corrompido (mojibake), remove dados de
-- teste/impróprios e conserta os e-mails de alerta.
--
-- SEGURANÇA: os DELETEs são protegidos por FK — se algum
-- registro ainda estiver em uso, o MySQL bloqueia o comando
-- e nada é perdido. Se aparecer erro, execute: ROLLBACK;
-- ============================================================

START TRANSACTION;

-- ── 1) Encoding corrompido (mojibake) ───────────────────────

UPDATE estado_civil SET nome = 'Viúvo(a)'      WHERE id = 4;
UPDATE estado_civil SET nome = 'União Estável' WHERE id = 5;

UPDATE genero SET nome = 'Não informado' WHERE id = 3;

UPDATE profissao SET nome = 'Médico'              WHERE id = 2;
UPDATE profissao SET nome = 'Empresário'          WHERE id = 5;
UPDATE profissao SET nome = 'Funcionário Público' WHERE id = 6;
UPDATE profissao SET nome = 'Doméstica'           WHERE id = 12;
UPDATE profissao SET nome = 'Operário'            WHERE id = 13;
UPDATE profissao SET nome = 'Técnico'             WHERE id = 14;

UPDATE tipo_pericia SET nome = 'Médica'     WHERE id = 1;
UPDATE tipo_pericia SET nome = 'Contábil'   WHERE id = 2;
UPDATE tipo_pericia SET nome = 'Ergonômica' WHERE id = 5;
UPDATE tipo_pericia SET nome = 'Técnica'    WHERE id = 7;

UPDATE tipo_audiencia SET nome = 'Instrução'   WHERE id = 10;
UPDATE tipo_audiencia SET nome = 'Conciliação' WHERE id = 11;

-- ── 2) Dados de teste / impróprios ──────────────────────────

-- Edna (pessoa id 2) está com gênero "baitola" (id 5) → corrige para Feminino
UPDATE pessoas_fisicas SET genero_id = 2 WHERE id = 2 AND genero_id = 5;

-- "disquitado" é um estado civil legítimo (antigo) com grafia errada → renomeia
UPDATE estado_civil SET nome = 'Desquitado(a)' WHERE id = 7;

-- Corrige typo e capitalização
UPDATE profissao SET nome = 'Controlador de Acesso'   WHERE id = 18;
UPDATE profissao SET nome = 'Negociadora de Cobrança' WHERE id = 17;

-- Remove registros de teste (a FK bloqueia se algum estiver em uso)
DELETE FROM genero         WHERE id = 5;  -- "baitola" (ofensivo)
DELETE FROM estado_civil   WHERE id = 8;  -- "tico tico no fuba"
DELETE FROM profissao      WHERE id = 15; -- "advogada" (duplica id 1 "Advogado")
DELETE FROM profissao      WHERE id = 16; -- "pipoqueiro"
DELETE FROM tipo_audiencia WHERE id = 8;  -- "Julgamento" duplicado (já inativo)
DELETE FROM tipo_audiencia WHERE id = 9;  -- "Julgamento-197" (teste)

-- ── 3) E-mails de alerta ────────────────────────────────────
-- Corrige o e-mail truncado da Edna (estava "ednasvlr@gmail" + ".com" solto)
UPDATE configuracoes_escritorio
   SET alerta_emails = 'visaoecultura@gmail.com, ednasvlr@gmail.com'
 WHERE id = 1;

COMMIT;

-- Conferência rápida (opcional):
-- SELECT * FROM estado_civil; SELECT * FROM genero; SELECT * FROM profissao;
-- SELECT * FROM tipo_pericia; SELECT * FROM tipo_audiencia;
-- SELECT alerta_emails FROM configuracoes_escritorio;
