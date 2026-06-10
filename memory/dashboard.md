---
name: dashboard
description: "Módulo de dashboard — tela principal com cards, pendências e atalhos rápidos"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 16 — Dashboard

## Cards do Usuário Logado

Todos os cards mostram dados do próprio usuário logado:

- Prazos vencendo hoje
- Prazos atrasados (vencidos e não concluídos)
- Tarefas pendentes
- Tarefas vencidas (somente as que têm data de vencimento)
- Audiências de hoje
- Audiências de amanhã
- Perícias de hoje
- Perícias de amanhã
- Processos sem movimentação há X dias *(X configurável nas configurações do escritório)*

## Audiências sem Ata

- Mostra audiências que já ocorreram e ainda não têm ata registrada
- Cada item tem botão **"Ata já impressa"** — ao clicar, remove da lista de pendentes (advogado tem a ata física, não precisa digitar no sistema)
- Também sai da lista automaticamente quando ata for registrada digitalmente no sistema

## Atalhos Rápidos

- Botões de acesso rápido para as funções mais usadas
- Ex: cadastrar pessoa, novo processo, novo prazo, nova tarefa
- Lista definitiva a definir durante o desenvolvimento

## Layout

- Fixo — sem personalização pelo usuário
- Pode ser ampliado com novos cards futuramente

**Pendente:** Módulo de Perícias ainda não definido — criar Bloco próprio  
**Relacionado:** [[prazos]], [[tarefas]], [[audiencias]], [[processos-pastas]], [[configuracoes_escritorio]]
