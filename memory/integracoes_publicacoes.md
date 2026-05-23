---
name: integracoes-publicacoes
description: "Bloco 19 — Tela de Publicações AASP, integração, regras de salvamento e permissões"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Bloco 19 — Integrações e Tela de Publicações

## Integração Escolhida

- **AASP** — foco atual, integração via API (credenciais configuradas pelo admin)
- **CNJ DataJud** — reservado para atualização futura (não entra nesta versão)
- Nas configurações do escritório: admin escolhe qual integração usar (somente uma ativa por vez)

## Tela de Publicações

- Tela exclusiva no menu do sistema
- Ao entrar, carrega automaticamente as publicações do **dia atual**
- Consulta por até **10 números de OAB** cadastrados nas configurações do escritório
- Calendário disponível para consultar publicações de outras datas

## O que é exibido por publicação

- Texto completo da publicação
- Botão **"Gerar Prazo"** — abre formulário de prazo com número do processo já preenchido
- Botão **"Gerar Tarefa"** — abre formulário de tarefa com número do processo já preenchido
- Amarração no banco sempre pelo **número do processo**

## Marcação de Publicação Tratada

- Ao gerar prazo ou tarefa → publicação recebe marcação visual **"Tratada por [usuário X]"**
- Essa marcação é visível para **todos os usuários** que acessarem a tela

## Regras de Salvamento

- Publicações **não excluídas** ficam salvas permanentemente no banco
- Publicações **excluídas** somem para sempre da tela e do banco
- Exclusão gera registro simples no log de auditoria: usuário, quantidade excluída e data
- Ao buscar novamente uma data já consultada → sistema pergunta se deseja repetir a busca
- Se sim: traz todas as publicações da AASP para aquela data
  - Publicações **novas** (que não existiam no banco) → são adicionadas normalmente
  - Publicações **já existentes** no banco → não são modificadas, anotações preservadas
- Essa lógica permite capturar publicações que aparecem com atraso no DJE

## Permissões

- Controladas pelo admin nas configurações de permissões granulares
- Permissões previstas: ver publicações, tratar (gerar prazo/tarefa), excluir publicações

## Tabelas do Banco

- `publicacoes` — publicações salvas com texto, data, OAB, número do processo, status
- `log_publicacoes` — registro de exclusões (usuário, quantidade, data)
- (integração com `prazo`, `tarefas`, `logs_auditoria`, `permissoes`)

## CNJ — Para Versão Futura

- Consulta de andamentos processuais por número de processo
- Não substitui DJE/publicações — funcionalidade complementar
- Será implementado como opção alternativa à AASP nas configurações

**Relacionado:** [[prazos]], [[tarefas]], [[user-permissions]], [[configuracoes-escritorio]], [[database-tables]]
