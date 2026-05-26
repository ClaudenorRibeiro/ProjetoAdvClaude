-- ============================================================
-- MIGRAÇÃO 003 — Expande tblForum e tblVara
-- Adiciona: abrev_nome, endereço completo (forum), compl_end,
--           tel, email (vara). Renomeia estado → uf.
-- Data: 2026-05-26
-- ============================================================

-- ---- tblForum ----
-- 1. Abreviação opcional (exibida nos dropdowns no lugar do nome completo)
ALTER TABLE tblForum
  ADD COLUMN abrev_nome  VARCHAR(50)  NULL COMMENT 'Abreviação para dropdowns/mensagens — ex: VT/B.Funda' AFTER id;

-- 2. Campos de endereço completo
ALTER TABLE tblForum
  ADD COLUMN cep         VARCHAR(8)   NULL AFTER cidade,
  ADD COLUMN logradouro  VARCHAR(300) NULL AFTER cep,
  ADD COLUMN num_end     VARCHAR(11)  NULL AFTER logradouro,
  ADD COLUMN compl_end   VARCHAR(50)  NULL AFTER num_end,
  ADD COLUMN bairro      VARCHAR(100) NULL AFTER compl_end;

-- 3. Renomeia estado → uf (padroniza nomenclatura)
ALTER TABLE tblForum
  CHANGE COLUMN estado uf VARCHAR(2) NULL;

-- ---- tblVara ----
-- 1. Abreviação opcional
ALTER TABLE tblVara
  ADD COLUMN abrev_nome  VARCHAR(50) NULL COMMENT 'Abreviação para dropdowns/mensagens — ex: 04ªVT/SP-ZL' AFTER id;

-- 2. Complemento do endereço (ex: 4ª andar, Bloco B)
ALTER TABLE tblVara
  ADD COLUMN compl_end   VARCHAR(100) NULL AFTER codVaraNoProc;

-- 3. Contato da vara
ALTER TABLE tblVara
  ADD COLUMN tel         VARCHAR(50) NULL AFTER compl_end,
  ADD COLUMN email       VARCHAR(100) NULL AFTER tel;

-- ============================================================
-- VERIFICAÇÃO (opcional — rode após a migração para conferir)
-- DESCRIBE tblForum;
-- DESCRIBE tblVara;
-- ============================================================
