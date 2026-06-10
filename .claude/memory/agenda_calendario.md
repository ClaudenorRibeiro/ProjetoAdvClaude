---
name: agenda-calendario
description: Módulo de agenda e calendário — tela inicial do dia e navegação por datas
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 13 — Agenda / Calendário

## Tela Inicial ao Logar

- Primeira tela que o usuário vê ao entrar no sistema
- Exibe de forma explícita e destacada todos os eventos do dia atual:
  - Prazos do dia
  - Tarefas do dia
  - Audiências do dia
- Padrão: eventos do próprio usuário logado
- Com permissão: pode visualizar eventos de outros usuários ou do escritório (sem usuário definido)

## Calendário

- Visões disponíveis: **Dia, Semana e Mês**
- Padrão: eventos do usuário logado
- Filtros: por usuário (com permissão), por tipo (audiência / prazo / tarefa)
- Clicar num evento → abre diretamente o processo/prazo/audiência relacionado (navegação direta)
- Clicar numa data vazia → permite cadastrar prazo ou tarefa diretamente pelo calendário
- ❌ Sem impressão ou exportação (Google Calendar, Outlook, etc.)

## Permissões

- Usuário vê somente seus próprios eventos por padrão
- Com permissão habilitada: visualiza eventos de usuários específicos ou de todo o escritório

**Relacionado:** [[prazos]], [[tarefas]], [[audiencias]], [[user-permissions]]
