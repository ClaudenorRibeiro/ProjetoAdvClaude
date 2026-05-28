-- ============================================================
-- LIMPEZA DO BANCO — Sistema de Advocacia
-- Execute no HeidiSQL: abra a aba Query, cole tudo e execute
-- Data: 28/05/2026  v2 — nomes novos nas constraints
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- PASSO 1: Corrigir FKs das tabelas ATIVAS
--          Remove a FK antiga e cria nova com nome diferente
--          apontando para as tabelas corretas (tblProc/tblPasta)
-- ============================================================

-- andamento_processual: processo_id → tblProc
ALTER TABLE `andamento_processual`
  DROP FOREIGN KEY `andamento_processual_ibfk_1`,
  ADD CONSTRAINT `fk_andamento_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- audiencia: processo_id → tblProc
ALTER TABLE `audiencia`
  DROP FOREIGN KEY `audiencia_ibfk_1`,
  ADD CONSTRAINT `fk_audiencia_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- conta_corrente_pasta: pasta_id → tblPasta
ALTER TABLE `conta_corrente_pasta`
  DROP FOREIGN KEY `conta_corrente_pasta_ibfk_1`,
  ADD CONSTRAINT `fk_contacorrente_tblpasta`
    FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`);

-- honorarios: pasta_id → tblPasta
ALTER TABLE `honorarios`
  DROP FOREIGN KEY `honorarios_ibfk_1`,
  ADD CONSTRAINT `fk_honorarios_tblpasta`
    FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`);

-- log_comunicacoes: processo_id → tblProc
ALTER TABLE `log_comunicacoes`
  DROP FOREIGN KEY `log_comunicacoes_ibfk_1`,
  ADD CONSTRAINT `fk_logcomun_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- log_documentos_gerados: processo_id e pasta_id atualizados
ALTER TABLE `log_documentos_gerados`
  DROP FOREIGN KEY `log_documentos_gerados_ibfk_2`,
  DROP FOREIGN KEY `log_documentos_gerados_ibfk_3`,
  ADD CONSTRAINT `fk_logdocs_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  ADD CONSTRAINT `fk_logdocs_tblpasta`
    FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`);

-- parcerias: processo_id → tblProc
ALTER TABLE `parcerias`
  DROP FOREIGN KEY `parcerias_ibfk_1`,
  ADD CONSTRAINT `fk_parcerias_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- pericia: processo_id → tblProc
ALTER TABLE `pericia`
  DROP FOREIGN KEY `pericia_ibfk_1`,
  ADD CONSTRAINT `fk_pericia_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- prazos_processo: processo_id → tblProc
ALTER TABLE `prazos_processo`
  DROP FOREIGN KEY `prazos_processo_ibfk_1`,
  ADD CONSTRAINT `fk_prazos_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`);

-- tarefas: processo_id → tblProc, pasta_id → tblPasta
ALTER TABLE `tarefas`
  DROP FOREIGN KEY `tarefas_ibfk_1`,
  DROP FOREIGN KEY `tarefas_ibfk_2`,
  ADD CONSTRAINT `fk_tarefas_tblproc`
    FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  ADD CONSTRAINT `fk_tarefas_tblpasta`
    FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`);

-- ============================================================
-- PASSO 2: Adicionar area_direito em tblPasta
--          (campo que existia na tabela antiga "pasta")
-- ============================================================

ALTER TABLE `tblpasta`
  ADD COLUMN `area_direito` VARCHAR(50) NULL
    COMMENT 'Área do Direito — ex: Trabalhista, Previdenciária, Família'
    AFTER `numPasta`;

-- ============================================================
-- PASSO 3: Excluir tabelas antigas / não utilizadas
-- ============================================================

-- Dependentes primeiro (têm FK apontando para as demais antigas)
DROP TABLE IF EXISTS `partes_processo`;       -- substituída por tblTituloProcAutor/Reu
DROP TABLE IF EXISTS `processo_responsaveis`; -- nunca foi utilizada
DROP TABLE IF EXISTS `modelo_comunicado`;     -- nunca foi utilizada (sistema usa modelo_documento)

-- Tabelas do modelo antigo
DROP TABLE IF EXISTS `processo`;              -- substituída por tblProc
DROP TABLE IF EXISTS `vara`;                  -- substituída por tblVara
DROP TABLE IF EXISTS `pasta`;                 -- substituída por tblPasta
DROP TABLE IF EXISTS `forum`;                 -- substituída por tblForum
DROP TABLE IF EXISTS `status_processo`;       -- substituída por tblStatusProc

-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- PRÓXIMO PASSO OBRIGATÓRIO APÓS EXECUTAR:
--   HeidiSQL → Ferramentas → Exportar banco de dados como SQL
--   → marcar apenas "Estrutura" (sem dados)
--   → salvar como: estrutura_banco.sql  (raiz do projeto)
-- ============================================================
