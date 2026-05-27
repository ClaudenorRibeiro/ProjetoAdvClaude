-- ============================================================
-- MIGRAÇÃO 006 — Adiciona codTipoProc em tblTipoProc
-- Data: 2026-05-27
-- ============================================================

USE sistema_advocacia;

ALTER TABLE tblTipoProc
  ADD COLUMN codTipoProc VARCHAR(1) NULL AFTER nome;
