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

## Sessão 12/06 (noite) — alertas de e-mail

- Deploy das fases 1-4 CONFIRMADO no servidor (verificado via SSH leitura). Usuário igualou código E banco
  da produção com o local; SMTP_PASS atualizado nos dois. Scripts fase2_1/2_2/2_3 JÁ aplicados no banco
  local (conferido no backup bkp-BD-120626-1656.sql) — não rodar de novo.
- Causa do "e-mail não chega": trava alerta_*_enviado marcada no disparo das 12:30 (que falhou com
  alerta_emails quebrado) → disparos seguintes pulavam em silêncio.
- **REGRA DE NEGÓCIO definida pelo usuário 12/06 noite: NÃO existe trava diária de alertas.**
  TODO disparo do cron envia — se o admin mudar o horário no mesmo dia, reenvia no novo horário.
- **Codado 12/06 noite (local, deploy pendente):** `alertasService.js` — trava diária REMOVIDA por
  completo; `notificacaoService.js` — funções coletivas retornam contagem de sucessos SMTP e o
  alertasService loga "⚠️ NENHUM e-mail saiu" quando todos falham. `node --check` OK.
- **SQL entregue ao usuário (rodar local → produção):** DROP das colunas
  `alerta_pendentes_enviado` e `alerta_atrasados_enviado` de configuracoes_escritorio.
  Depois: exportar estrutura → estrutura_banco.sql.
- ⚠️ REGRA NOVA gravada em feedback_codigo: fluxo LOCAL-PRIMEIRO — usuário NUNCA atualiza direto no
  servidor; tudo é feito no local e ele faz deploy manual de sistema e banco. SSH só para leitura/diagnóstico.

## Sessão 13/06 — e-mail de alertas RESOLVIDO + correção throttling

- **Causa do "e-mail não chegava":** o processo PM2 ficou rodando com a senha SMTP antiga em memória
  (subiu antes da senha do .env do servidor ser corrigida e nunca mais reiniciou). `pm2 restart` resolveu.
  CONFIRMADO funcionando: visaoecultura@gmail.com e ednasvlr@gmail.com receberam (status sucesso em log_emails).
- **Falhas intermitentes (535 BadCredentials) eram THROTTLING do Gmail** — bloqueio temporário por excesso
  de logins durante os testes (cada destinatário abria conexão/login própria). Liberou sozinho em ~40 min.
- **CORRIGIDO no LOCAL (deploy pendente — usuário faz manual):**
  - `backend/src/utils/email.js`: `criarTransporte(extra)` aceita opções; NOVA `enviarEmailColetivo({destinatarios,assunto,html})`
    usa pool com maxConnections:1 = UM login para todos os destinatários (evita throttling); fecha o pool no finally;
    mantém 1 linha de log_emails por destinatário; retorna nº de sucessos. Exportada.
  - `backend/src/services/notificacaoService.js`: emailPrazosPendentes/emailPrazosAtrasados agora chamam
    enviarEmailColetivo (sem o for-loop que relogava a cada e-mail). `node --check` OK nos dois.
- IMPORTANTE confirmado pelo usuário 13/06: `.env` do servidor NÃO está no git → sobrevive ao deploy
  (git reset --hard). Demais arquivos: deploy sobrescreve, então só corrigir no LOCAL. Ver [[feedback-codigo]].
- Lembrete operacional: o deploy do usuário (`1-AtualizarSistema.sh`) faz `pm2 restart` SEM --update-env,
  mas como SMTP_PASS vem do dotenv (.env) e não do env do PM2, o restart simples já recarrega o .env.

## CAUSA RAIZ do e-mail (13/06, descoberta definitiva) + fix override

- **CAUSA RAIZ:** o PM2 tinha a senha SMTP ANTIGA (`zlvx aeyo zwqp phyn`, com espaços) gravada no
  ambiente do app (memória do daemon + `~/.pm2/dump.pm2`). `dotenv.config()` por padrão NÃO sobrescreve
  variável já presente no process.env → a senha do .env (hzoqsbzugacgyoqe) era IGNORADA → BadCredentials
  em TODO restart/deploy, independente do .env. Testes `node -e` funcionavam por rodarem em sessão sem essa injeção.
  Confirmado via `pm2 jlist` (env do app mostrava SMTP_PASS=zlvx...).
- **FIX CODADO no LOCAL (server.js):** `require('dotenv').config({ override: true })` — faz o .env SEMPRE
  vencer o ambiente injetado pelo PM2. `node --check` OK. Resolve de vez e sobrevive a deploy (vai pelo git).
  (Eu havia retirado essa sugestão antes por uma leitura de /proc equivocada — estava errado; pm2 jlist provou.)
- Após deploy (git reset --hard + pm2 restart): processo sobe, PM2 injeta zlvx, mas dotenv override sobrescreve
  com hzoq do .env → funciona. OPCIONAL (higiene): purgar o env velho do PM2 com
  `pm2 delete advocacia-backend && cd /var/www/advocacia && unset SMTP_PASS && pm2 start ecosystem.config.js && pm2 save`.
- LIÇÃO: PM2 captura o ambiente do shell no momento do `pm2 start`/`pm2 save` e reinjeta sempre. Usar
  sempre `dotenv.config({ override:true })` em apps sob PM2 que leem segredos do .env.

## Ajustes de alertas de prazo (13/06) — Ajuste 2 FEITO, Ajuste 1 pendente

- **Ajuste 2 (DOIS horários de alerta) — CODADO no LOCAL, validado (node --check + build OK):**
  - DB: nova coluna `horario_alerta_prazos_2 TIME NULL` em configuracoes_escritorio (opcional). Usuário já rodou
    o ALTER no HeidiSQL LOCAL — CONFERIR se rodou também na PRODUÇÃO antes do deploy do backend (senão o
    SELECT horario_alerta_prazos_2 quebra). SQL: `ALTER TABLE configuracoes_escritorio ADD COLUMN horario_alerta_prazos_2 TIME NULL AFTER horario_alerta_prazos;`
  - `alertasService.js`: `cronPrazos` (1) virou `cronsPrazos` (array); reagendarCronPrazos agenda 1 cron por
    horário preenchido via novo helper `agendarUmCronPrazos()`. Ambos disparam os mesmos alertas. Só horário
    comparado (sem data) — comportamento natural: 1° pode cair hoje e 2° amanhã conforme a hora atual.
  - `configuracaoController.js`: aceita horario_alerta_prazos_2; valida ≥60min entre os dois (erro se <1h);
    incluído no INSERT/ON DUPLICATE (21 placeholders agora).
  - `Configuracoes.js`: 2º campo "Segundo horário — opcional"; helper minutosDoHorario; aviso na tela +
    bloqueio do salvar se <1h (validação real no backend).
- **Ajuste 2 testado e funcionando (confirmado pelo usuário 13/06).**
- **Ajuste 1 (pausa entre e-mails) — FEITO (Opção A), validado node --check:** em `email.js`, constante
  `PAUSA_ENTRE_EMAILS_MS = 5000` + helper `sleep`; dentro de `enviarEmailColetivo` espera 5s entre cada
  envio (não após o último). Mantém ordem por TIPO (pendentes p/ todos, depois atrasados p/ todos) — Opção A
  escolhida pelo usuário. Núcleo (override, login único, pool) intacto. Ajustável no VSCode pela constante.
  Obs: os 5s são entre destinatários dentro de cada tipo; entre os dois tipos há só o intervalo natural.
  DEPLOY PENDENTE (usuário faz manual). Não precisa de banco.

## Itens já resolvidos (não refazer)
- Tabela log_emails + 3 índices (12/06 ✅), SMTP_PASS novo no servidor (12/06 ✅)
- Correção alerta_emails: incluída no script fase2_1 (não precisa mais ir pela tela)
