---
name: configuracoes-escritorio
description: "Módulo de configurações do escritório — dados, usuários, feriados, alertas e backup"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 15 — Configurações do Escritório

## Dados do Escritório (aba "Escritório")

- Nome, endereço, telefone, e-mail, CNPJ, logo
- Usados automaticamente nos documentos e comunicados gerados pelo sistema

### Controle de Edição por Nível (implementado 11/06/2026)
- **Campos "Dados do Escritório"** (nome, CNPJ, endereço, telefone, logo, etc.): `disabled={!ehSuper}`
  - Somente o superusuário (nivel=0) pode editar
  - Para admins e demais: campos aparecem visíveis mas desabilitados — sem mensagem, sem explicação
  - **Não existe nenhuma referência ao superusuário na interface** — ele é completamente oculto
- **Campos de alertas e configurações** (horário de disparo, dias de antecedência, etc.): editáveis por qualquer admin
- **Botão Salvar:** sempre visível para admins — podem salvar os campos de alerta mesmo sem poder editar os dados do escritório

### Sincronização entre abas (implementado 11/06/2026)
- Se dois admins estiverem com a tela de Configurações aberta ao mesmo tempo:
  - Quando um salva as configurações do escritório, o outro verá os dados atualizados automaticamente ao voltar para a aba do navegador
  - Implementado via evento `visibilitychange` no `useEffect` do `TabEscritorio`
  - Ao detectar `document.visibilityState === 'visible'` → recarrega os dados do escritório

## Personalização Visual

- Cada instância Lightsail pode personalizar livremente:
  - Cor principal do sistema
  - Logo do escritório
  - Tela de login
- Configurável pelo admin — sem precisar alterar código

## Feriados e Calendário

- Finais de semana dos próximos 30 anos pré-cadastrados automaticamente na instalação
- Admin cadastra manualmente feriados nacionais, estaduais, municipais e pontos facultativos

## Tabelas Auxiliares

Cada tabela tem seu próprio módulo e telas de CRUD separadas (não ficam dentro das configurações):
- Tipos de prazo
- Tipos de audiência
- Status de processo
- Profissões
- Fóruns
- Varas
- Outras conforme necessidade

## Alertas e Notificações

- Horário de disparo dos alertas de prazos pendentes (ex: 18h) — configurável por escritório
- Quantidade de dias úteis antes da audiência para notificar o cliente — configurável por escritório (padrão: 3 dias úteis)
- Quantidade de dias úteis antes da perícia para notificar o cliente — configurável por escritório (padrão: 2 dias úteis)

## Timezone dos Crons — OBRIGATÓRIO (12/06/2026 tarde)

Todos os `cron.schedule` do alertasService.js recebem a constante
`OPCOES_CRON = { timezone: 'America/Sao_Paulo' }`. Sem isso, no servidor (Ubuntu = UTC)
o cron das 18h dispararia às 15h de Brasília. Datas "hoje" usam `hojeBrasilia()` de helpers.js.
Cron novo: limpeza diária de reset_tokens usados/expirados às 3h.

## Cron de Alertas — alertasService.js (reescrito 12/06/2026)

### Problema anterior
O cron rodava a cada minuto (`* * * * *`) e comparava o horário — desperdício de CPU.

### Solução atual
- Cron exato: agendado para disparar no horário configurado no banco (ex: `0 18 * * *` para 18:00)
- Variável de módulo `let cronPrazos = null;` — instância única
- Ao iniciar o backend (`iniciarAlertas()`): lê o horário do banco e agenda o cron
- Ao admin salvar Configurações (`configuracaoController.js`): chama `reagendarCronPrazos()` que destrói o cron antigo e cria o novo com o novo horário

### Função reagendarCronPrazos()
```javascript
async function reagendarCronPrazos() {
  const [config] = await pool.execute(
    'SELECT horario_alerta_prazos FROM configuracoes_escritorio LIMIT 1'
  );
  const horario = config[0]?.horario_alerta_prazos;
  if (cronPrazos) { cronPrazos.stop(); cronPrazos = null; }
  if (!horario) return;
  const partes = horario.split(':');
  const hh = parseInt(partes[0], 10);
  const mm = parseInt(partes[1], 10);
  const expressao = `${mm} ${hh} * * *`;
  cronPrazos = cron.schedule(expressao, async () => {
    await executarAlertasPrazos();
  });
}
```

### Comportamento com múltiplos admins
- Se 3 admins salvam configurações diferentes simultaneamente, **o último a salvar prevalece**
- Isso é intencional — não há conflito real, apenas um vence

### Exports do módulo
```javascript
module.exports = { iniciarAlertas, reagendarCronPrazos };
```

### configuracaoController.js — integração
```javascript
const { reagendarCronPrazos } = require('../services/alertasService');
// ... após salvar:
await reagendarCronPrazos();
```

## Backup Automático — Invisível aos Usuários

- ❌ Sem backup manual pelo sistema
- No arquivo de configuração do servidor (invisível na interface), o superusuário define:
  - Endereço do bucket S3 da AWS
  - Intervalo de backup em horas
- Backup completo do MySQL enviado automaticamente para o S3 no intervalo configurado
- Usuários do escritório não têm acesso nem visibilidade sobre o backup

## Permissões — Comportamento para Admin (implementado 08/06/2026)

- Ao selecionar um usuário **admin (nível 1) ou super (nível 0)** na aba Permissões:
  - Todos os checkboxes aparecem **marcados e desabilitados** (cinza, cursor `not-allowed`)
  - Botão **Salvar Permissões** também desabilitado
  - Hover nos checkboxes exibe tooltip: "Administradores têm acesso total"
  - Nenhuma mensagem visível na tela — apenas o visual bloqueado
- Usuários comuns (nível 2+): comportamento normal, checkboxes editáveis

## Gerenciamento de Usuários (aba "Usuários" — implementado 11/06/2026)

### Criar / Editar Usuário
- `ModalUsuario` com validação de senha forte: ver [[validacao-senha]]
- Campo senha com `autocomplete="new-password"` (evita preenchimento automático do navegador)
- Dica de senha exibida abaixo do campo

### Redefinir Senha (admin redefine senha de outro usuário)
- `ModalRedefinirSenha` com mesma validação forte de senha
- Acessível pelo botão "Redefinir Senha" na listagem de usuários

### Excluir Usuário (implementado 11/06/2026)
- Botão **🗑️** por linha na tabela de usuários
- Usa `window.confirm` para confirmação (exceção ao padrão ModalConfirmar — por simplicidade)
- Backend: `DELETE /api/configuracoes/usuarios/:id`
  - Impede auto-exclusão (usuário não pode excluir a si mesmo)
  - Impede exclusão do superusuário (nivel=0)
  - Se usuário tem registros vinculados → erro amigável: "Não é possível excluir: usuário possui registros no sistema"
  - Captura `ER_ROW_IS_REFERENCED_2` do MySQL para mensagem adequada
- Route: `router.delete('/configuracoes/usuarios/:id', autenticar, apenasAdmin, configuracaoCtrl.excluirUsuario)`

### Histórico do Usuário (implementado 11/06/2026)
- Botão **📋** por linha na tabela de usuários
- Abre `ModalHistoricoUsuario` com filtros de data (De / Até) e lista de ações
- Fonte de dados: tabela `logs_auditoria` filtrada por `usuario_id`
- Backend: `GET /api/configuracoes/usuarios/:id/historico?de=YYYY-MM-DD&ate=YYYY-MM-DD`
  - Retorna até 500 registros, ordenados por data DESC
- Route: `router.get('/configuracoes/usuarios/:id/historico', autenticar, apenasAdmin, configuracaoCtrl.historicoUsuario)`

## Alertas de E-mail — Persistência no Banco (implementado 11/06/2026)

### Problema resolvido
O sistema enviava alertas de prazos por e-mail somente uma vez. Ao reiniciar o PM2 (deploy, crash, etc.), a variável em memória `enviadoHoje` era resetada e o e-mail era reenviado ou deixava de ser enviado corretamente.

### Solução
Duas colunas novas na tabela `configuracoes_escritorio` (adicionadas via HeidiSQL ✅):
```sql
ALTER TABLE configuracoes_escritorio
  ADD COLUMN alerta_pendentes_enviado DATE NULL,
  ADD COLUMN alerta_atrasados_enviado DATE NULL;
```

### Lógica em alertasService.js
- A cada execução do cron (node-cron), o sistema lê as duas colunas do banco
- Compara com a data de hoje (string `YYYY-MM-DD`)
- Se já enviou hoje → pula
- Se ainda não enviou → envia o e-mail e atualiza a coluna com a data de hoje
- `toStr()` normaliza tanto `Date` quanto `string` para `YYYY-MM-DD` (MySQL retorna DATE como objeto Date)

## Tabelas do Banco

- `configuracoes_escritorio` — dados do escritório, visual, horários de alerta, dias de antecedência
  - `alerta_pendentes_enviado DATE NULL` — data do último envio do alerta de prazos pendentes
  - `alerta_atrasados_enviado DATE NULL` — data do último envio do alerta de prazos atrasados

**Relacionado:** [[user-permissions]], [[prazos]], [[audiencias]], [[database-tables]], [[validacao-senha]]
