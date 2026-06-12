---
name: pendencias-proxima-sessao
description: Itens pendentes que ficaram prontos localmente mas ainda não foram para o servidor (deploy manual pelo usuário)
metadata: 
  node_type: memory
  type: project
  originSessionId: a17aec30-7d20-496a-81a0-792eca6b27e8
---

## Arquivos Modificados Localmente — Deploy Pendente (12/06/2026)

Estes arquivos foram alterados na máquina local mas **ainda não foram enviados ao servidor**.
O deploy é feito SEMPRE manualmente pelo usuário (nunca pelo Claude).

### backend/src/utils/email.js
- Adicionado `const { pool } = require('../config/database')`
- Adicionada função `registrarLog(para, assunto, status, erro)` que grava na tabela `log_emails`
- `enviarEmail()` atualizado para chamar `registrarLog` em sucesso e em falha

### backend/src/services/alertasService.js (REESCRITO COMPLETAMENTE)
- Removido cron `* * * * *` (polling a cada minuto)
- Agora agenda o cron para o horário exato configurado no banco (`horario_alerta_prazos`)
- Exporta `{ iniciarAlertas, reagendarCronPrazos }`
- `reagendarCronPrazos()` destrói cron antigo e cria novo com horário atualizado

### backend/src/controllers/configuracaoController.js
- Adicionado import: `const { reagendarCronPrazos } = require('../services/alertasService')`
- Após salvar configurações: `await reagendarCronPrazos()` é chamado

### frontend/src/pages/Audiencias/Audiencias.js
- `ModalEditarAudiencia.salvar()`: adicionada verificação de dia útil antes de salvar
- Se a data não for dia útil → abre `ModalConfirmarSenhaDiaUtil` (exige senha do usuário logado)
- Ambos os modais (novo e editar) têm validação idêntica de dia útil

## Tabela log_emails — Criada no Banco (12/06/2026 ✅)

Já foi criada via HeidiSQL diretamente no banco de produção:
```sql
CREATE TABLE log_emails (...)
```
Ver [[database-tables]] para o DDL completo. **Não precisa de deploy de código para isso.**

## Índices — Criados no Banco (12/06/2026 ✅)

Já criados via HeidiSQL:
```sql
ALTER TABLE `prazos_processo` ADD INDEX `idx_vencimento_status` (`data_vencimento`, `status`);
ALTER TABLE `tarefas`         ADD INDEX `idx_concluida_vencimento` (`concluida`, `data_vencimento`);
ALTER TABLE `logs_auditoria`  ADD INDEX `idx_usuario_data` (`usuario_id`, `criado_em`);
```

## SMTP_PASS — Atualizado no Servidor (12/06/2026 ✅)

O `.env` do servidor já tem a nova App Password:
```
SMTP_PASS=goovjyiunyprdbfu
```
PM2 reiniciado com `--update-env`. **Não precisa de deploy para isso.**

## Ação Necessária pelo Usuário — Vírgula no campo alerta_emails

**Problema:** Campo `alerta_emails` nas Configurações tem um `.com` sobrante:
```
visaoecultura@gmail.com, ednasvlr@gmail.com,.com
```
**Correção:** Acessar tela de Configurações → remover o `.com` → Salvar.

## Verificações Pós-Deploy

Após o usuário fazer o deploy dos arquivos acima, verificar:
1. PM2 reiniciou sem erros: `pm2 logs advocacia-backend`
2. No horário configurado (ex: 18h), verificar se os e-mails chegam para AMBOS os destinatários
3. Verificar tabela `log_emails` via HeidiSQL para confirmar os logs
