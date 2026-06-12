-- ============================================================
-- FASE 2.2 — ÍNDICES DE BUSCA
-- Rodar no HeidiSQL (local E produção)
--
-- Índices nas colunas usadas em buscas e filtros frequentes.
-- Pode rodar a qualquer momento — não depende de deploy.
-- Obs: DDL (ALTER TABLE) não usa transação no MySQL — cada
-- comando é commitado individualmente.
-- ============================================================

-- Busca de pessoa por CPF (tela de Pessoas e verificação de duplicidade)
ALTER TABLE `pessoas_fisicas`   ADD INDEX `idx_pf_cpf` (`cpf`);

-- Busca de empresa por CNPJ
ALTER TABLE `pessoas_juridicas` ADD INDEX `idx_pj_cnpj` (`cnpj`);

-- Busca de processo por número
ALTER TABLE `tblproc`           ADD INDEX `idx_proc_numproc` (`numProc`);

-- Dashboard, Agenda e cron diário filtram audiências por data/status
ALTER TABLE `audiencia`         ADD INDEX `idx_aud_data_status` (`data`, `status`);

-- Dashboard e cron diário filtram perícias por data
ALTER TABLE `pericia`           ADD INDEX `idx_per_data` (`data`);
