---
name: configuracoes-escritorio
description: "Módulo de configurações do escritório — dados, visual, alertas e backup automático"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 15 — Configurações do Escritório

## Dados do Escritório

- Nome, endereço, telefone, e-mail, CNPJ, logo
- Usados automaticamente nos documentos e comunicados gerados pelo sistema

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
  - Hover nos checkboxes e botão exibe tooltip explicativo
  - Nenhuma mensagem visível na tela — apenas o visual bloqueado
- Usuários comuns (nível 2+): comportamento normal, checkboxes editáveis
- Lógica: `const ehAdmin = usuarioSelecionado?.nivel <= 1`

## Tabelas do Banco

- `configuracoes_escritorio` — dados do escritório, visual, horários de alerta, dias de antecedência

**Relacionado:** [[user-permissions]], [[prazos]], [[audiencias]], [[feriados]], [[database-tables]]
