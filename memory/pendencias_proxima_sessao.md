---
name: pendencias-proxima-sessao
description: Itens pendentes — deploy, scripts SQL das fases 2.1/2.2/2.3 e sequência obrigatória (script 2.3 só após deploy)
metadata: 
  node_type: memory
  type: project
  originSessionId: a17aec30-7d20-496a-81a0-792eca6b27e8
---

## Sessão 12/06/2026 (tarde) — Fases 1 a 3 do plano de melhorias CONCLUÍDAS no código local

Plano aprovado pelo usuário em 12/06/2026: Fase 1 (timezone/deploy), Fase 2 (limpeza banco),
Fase 3 (transações), Fase 4 (responsividade), Fase 5 (módulos novos: Documentos UI → Relatórios → AASP → Comunicações UI).

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

## Pendências Abertas (próximas fases)

- **Fase 4 — Responsividade**: só 2 @media no projeto; 427+ estilos inline nas páginas; decidir padrão CSS (arquivo .css por página) ANTES dos módulos novos. Audiencias.js tem 99KB (monolítico)
- **Fase 5 — Módulos**: Documentos UI (backend pronto) → Relatórios (criar tabela `pesquisas_salvas` — está nas memórias mas NÃO existe no banco) → Publicações AASP → Comunicações UI
- Commit/push do código: SOMENTE com autorização do usuário após ele testar

## Itens já resolvidos (não refazer)
- Tabela log_emails + 3 índices (12/06 ✅), SMTP_PASS novo no servidor (12/06 ✅)
- Correção alerta_emails: incluída no script fase2_1 (não precisa mais ir pela tela)
