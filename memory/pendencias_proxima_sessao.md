---
name: pendencias-proxima-sessao
description: "HANDOFF COMPLETO sessão 12/06/2026 (tarde) — LER PRIMEIRO: fases 1-4 codadas, scripts SQL, sequência de deploy, próximos passos"
metadata: 
  node_type: memory
  type: project
  originSessionId: a17aec30-7d20-496a-81a0-792eca6b27e8
---

# 🔴 HANDOFF — Sessão 12/06/2026 (tarde) — LER ESTE ARQUIVO PRIMEIRO

O usuário trabalha em múltiplos computadores. Esta sessão fez MUITAS alterações no código local
(ainda NÃO commitadas — o usuário commita/sobe manualmente). Este arquivo explica tudo.

## Contexto da sessão

1. Análise completa do projeto + banco (backup `backups/bkp-BD-120626-1539.sql`, 51 tabelas)
2. Usuário aprovou um plano de 5 fases, nesta ordem:
   - **Fase 1** — timezone/datas (bug de produção) → ✅ CODADA
   - **Fase 2** — limpeza/otimização do banco → ✅ SCRIPTS CRIADOS (usuário roda no HeidiSQL)
   - **Fase 3** — transações + bugs encontrados → ✅ CODADA
   - **Fase 4** — responsividade → ✅ FUNDAÇÃO CODADA (restante é gradual)
   - **Fase 5** — módulos novos: Documentos UI → Relatórios → Publicações AASP → Comunicações UI → ⏳ NÃO INICIADA
3. Tudo validado: `node --check` nos 13 arquivos backend + `npm run build` (Vite) sem erros
4. ⚠️ REGRA ABSOLUTA reforçada pelo usuário em 12/06: **Claude NUNCA executa NADA no git
   (nem commit de memória — exceção antiga REVOGADA) nem no banco. O usuário faz TUDO manualmente, sempre.**
   Mudanças de banco = entregar script SQL para ele colar no HeidiSQL. Ver [[feedback-codigo]]

## 4 bugs reais encontrados e corrigidos (além do plano)

1. **Honorários duplicados** (`financeiroController.salvarHonorarios`): usava `ON DUPLICATE KEY UPDATE`
   que depende de UNIQUE em `honorarios.pasta_id` — que não existe (regra do projeto: sem UNIQUE no banco).
   Cada salvamento criava linha nova. → Virou upsert manual (SELECT → UPDATE ou INSERT) em transação.
2. **Excluir freelancer em uso** (`audienciasController.excluirFreela`): checava a coluna morta
   `advogado_freela_id` (100% NULL) em vez de `responsavel_freela_id` — permitia excluir freela vinculado
   e a FK ON DELETE SET NULL apagava o vínculo em silêncio. → Corrigido.
3. **`pf.endereco` inexistente** (`documentosController`): a query de variáveis usava coluna que não existe
   em pessoas_fisicas — geraria erro ao gerar documento com processo. → CONCAT_WS dos campos reais
   (logradouro, numero, complemento, bairro, cidade-estado), para PF E PJ; e a variável `{{endereco_cliente}}`
   que era calculada mas nunca atribuída agora é preenchida.
4. **Agenda sem nome do responsável freelancer**: listar/buscar de audiências só resolvia nome de usuário.
   → `COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome`.

## Arquivos Modificados Localmente — Deploy Pendente

Deploy é SEMPRE manual pelo usuário (WinSCP → `/var/www/advocacia/` → `pm2 restart advocacia-backend`).

### Backend (11 arquivos alterados em 12/06 — TODOS precisam ir juntos)
1. `backend/src/utils/email.js` — log na tabela log_emails (sessão anterior)
2. `backend/src/utils/helpers.js` — NOVA função `hojeBrasilia(maisDias)` — data YYYY-MM-DD no fuso de Brasília
3. `backend/src/services/alertasService.js` — cron exato + `timezone: 'America/Sao_Paulo'` em TODOS os crons (OPCOES_CRON) + hojeBrasilia() + cron 3h de limpeza de reset_tokens
4. `backend/src/middleware/auditoria.js` — `registrar()` aceita 7º parâmetro `conn` (participa da transação do chamador; erro → rollback)
5. `backend/src/controllers/configuracaoController.js` — reagendarCronPrazos ao salvar (sessão anterior)
6. `backend/src/controllers/dashboardController.js` — hoje/amanhã via hojeBrasilia
7. `backend/src/controllers/prazosController.js` — hoje via hojeBrasilia (status do "Fazendo")
8. `backend/src/controllers/financeiroController.js` — transações em lançar/excluir; **honorários: upsert manual** (o ON DUPLICATE KEY UPDATE dependia de UNIQUE inexistente → criava linhas duplicadas)
9. `backend/src/controllers/andamentoController.js` — data padrão via hojeBrasilia
10. `backend/src/controllers/audienciasController.js` — removidos JOINs mortos advogado_*; responsável freelancer agora aparece via COALESCE "(freelancer)"; **fix excluirFreela** (checava coluna morta advogado_freela_id → agora responsavel_freela_id)
11. `backend/src/controllers/documentosController.js` — **fix bug pf.endereco** (coluna inexistente → CONCAT_WS dos campos reais, PF e PJ) + variável {{endereco_cliente}} agora é preenchida
12. `backend/src/controllers/tarefasController.js` — transações em criar/concluir/reabrir/excluir/atualizar
13. `backend/src/controllers/periciasController.js` — transações em criar/atualizar

### Frontend (1 arquivo, sessão anterior)
- `frontend/src/pages/Audiencias/Audiencias.js` — dia útil + senha no modal de edição

## Scripts SQL Criados (pasta scripts/) — usuário roda no HeidiSQL

| Script | Quando rodar |
|--------|--------------|
| `scripts/fase2_1_correcao_dados.sql` | Qualquer momento (local E produção). Mojibake, dados de teste ("baitola", "tico tico"...), e-mail truncado da Edna |
| `scripts/fase2_2_indices.sql` | Qualquer momento. Índices: pf.cpf, pj.cnpj, tblproc.numProc, audiencia(data,status), pericia.data |
| `scripts/fase2_3_redundancias.sql` | ⚠️ Local: já pode. **PRODUÇÃO: SOMENTE APÓS o deploy do backend novo** — o código antigo ainda referencia as colunas advogado_* que esse script remove. Rodar antes QUEBRA a tela de Audiências |

Script 2.3 também: remove configuracoes_escritorio.endereco, adiciona alterado_por/em + FKs em pessoas_juridicas, FKs em feriados.criado_por e usuarios.criado_por.

## Sequência Correta no Servidor

1. Deploy dos arquivos backend + frontend (usuário, WinSCP)
2. `pm2 restart advocacia-backend`
3. Rodar fase2_1 e fase2_2 na produção (se ainda não rodou)
4. Rodar fase2_3 na produção
5. Verificar: `pm2 logs advocacia-backend`, e-mails de alerta chegando para os 2 destinatários no horário certo (timezone corrigido), tela de Audiências OK

## Depois dos scripts no banco LOCAL

- Exportar estrutura via HeidiSQL → sobrescrever `estrutura_banco.sql` → commit (pedir autorização)

## Fase 4 — Responsividade: FUNDAÇÃO PRONTA (12/06/2026)

Implementado (build Vite OK, aguardando teste do usuário):
- **Layout.js**: estado `sidebarMobile`, botão hambúrguer ☰ no header (só aparece ≤768px),
  backdrop clicável, menu fecha sozinho ao navegar, painel de notificações com maxWidth na tela
- **Layout.css**: bloco `@media (max-width: 768px)` — sidebar off-canvas (desliza da esquerda),
  modais quase tela cheia, abas com scroll horizontal, header compacto, classe utilitária `.filtros-row`
- **Dashboard.css**: breakpoint 600px (cards 2 colunas)
- Já existia e foi mantido: `.tabela-wrapper` (overflow-x) usado pelas 16 páginas, `.grid-2/3/4` viram 1 coluna

### Fase 4 — restante (gradual, por página)
- Migrar os ~427 estilos inline das páginas para classes/.css por página (padrão: como Dashboard/Login)
- Usar `.filtros-row` nas barras de filtro das páginas
- Quebrar Audiencias.js (99KB) em componentes quando for mexer nele
- Testar no celular real: menu hambúrguer, modais, tabelas com scroll

## Backlog da análise de 12/06 (itens de baixa prioridade, deixados de fora de propósito)

- Revisar os ~30 `SELECT *` nos controllers (maioria é busca por ID — impacto pequeno)
- Collation mista: log_emails/notificacoes/reset_tokens em utf8mb4_unicode_ci, resto 0900_ai_ci — não quebra nada (JOINs por int); padronizar nas tabelas novas
- Registros antigos de auditoria_audiencia com IDs crus e um status vazio — histórico aceito, não mexer
- Backup do HeidiSQL começa com DROP DATABASE — cuidado ao restaurar conectado na produção
- tblproc.numProc permite duplicatas (sem UNIQUE, por regra) — validação fica no app se um dia for exigida

## Pendências Abertas (próximas fases)

- **Fase 5 — Módulos**: Documentos UI (backend pronto; bug pf.endereco já corrigido) → Relatórios
  (criar tabela `pesquisas_salvas` — está nas memórias mas NÃO existe no banco) → Publicações AASP → Comunicações UI
- ⚠️ REGRA ABSOLUTA (12/06): Claude NUNCA mexe no git (nem commit de memória) nem no banco — usuário faz tudo manualmente. Ver [[feedback-codigo]]

## Itens já resolvidos (não refazer)
- Tabela log_emails + 3 índices (12/06 ✅), SMTP_PASS novo no servidor (12/06 ✅)
- Correção alerta_emails: incluída no script fase2_1 (não precisa mais ir pela tela)
