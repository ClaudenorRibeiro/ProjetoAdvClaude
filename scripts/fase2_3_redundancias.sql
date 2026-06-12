-- ============================================================
-- FASE 2.3 — REMOÇÃO DE REDUNDÂNCIAS + INTEGRIDADE
-- Rodar no HeidiSQL
--
-- ⚠️⚠️ ATENÇÃO — ORDEM OBRIGATÓRIA NO SERVIDOR ⚠️⚠️
-- O código ANTIGO em produção ainda referencia as colunas
-- advogado_* nas queries de audiências. Rodar este script na
-- produção ANTES do deploy do novo audienciasController.js
-- QUEBRA a tela de Audiências.
--
--   • Banco LOCAL:    pode rodar agora (código local já atualizado)
--   • Banco PRODUÇÃO: rodar SOMENTE APÓS o deploy do backend novo
-- ============================================================

-- ── 1) audiencia: colunas órfãs do campo duplicado (09/06) ──
-- Todas estão 100% NULL — eram o resquício do campo
-- "Advogado que conduzirá" que foi desfeito na UI.
-- O sistema vivo usa responsavel_id / responsavel_freela_id.

ALTER TABLE `audiencia`
  DROP FOREIGN KEY `aud_ibfk_adv_freela`,
  DROP FOREIGN KEY `aud_ibfk_adv_pessoa`,
  DROP FOREIGN KEY `aud_ibfk_adv_usuario`;

ALTER TABLE `audiencia`
  DROP COLUMN `advogado_tipo`,
  DROP COLUMN `advogado_usuario_id`,
  DROP COLUMN `advogado_pessoa_id`,
  DROP COLUMN `advogado_freela_id`;

-- ── 2) configuracoes_escritorio: campo de endereço agregado ──
-- Redundante com cep/logradouro/numero/bairro/cidade/estado.
-- Não é usado em nenhum ponto do código (backend nem frontend).

ALTER TABLE `configuracoes_escritorio` DROP COLUMN `endereco`;

-- ── 3) pessoas_juridicas: simetria com pessoas_fisicas ──────
-- PF tem alterado_por/alterado_em + FKs de auditoria; PJ não tinha.
-- Deixa o banco pronto para quando a edição de PJ for implementada.

ALTER TABLE `pessoas_juridicas`
  ADD COLUMN `alterado_por` INT NULL AFTER `criado_por`,
  ADD COLUMN `alterado_em` DATETIME NULL AFTER `alterado_por`,
  ADD CONSTRAINT `fk_pj_criado_por`   FOREIGN KEY (`criado_por`)   REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `fk_pj_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`);

-- ── 4) FKs de integridade que faltavam ──────────────────────

-- Feriado não deve impedir exclusão de usuário → SET NULL
-- (mesma convenção de tblforum/tblvara)
ALTER TABLE `feriados`
  ADD CONSTRAINT `fk_feriados_criado_por`
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

-- Quem criou um usuário não pode ser excluído enquanto a
-- referência existir (RESTRICT) — coerente com a mensagem
-- "usuário possui registros no sistema" do excluirUsuario
ALTER TABLE `usuarios`
  ADD CONSTRAINT `fk_usuarios_criado_por`
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`);

-- ============================================================
-- DEPOIS DE RODAR (no banco local):
-- HeidiSQL → exportar estrutura → sobrescrever estrutura_banco.sql
-- e me avisar para commitar (com sua autorização).
-- ============================================================
