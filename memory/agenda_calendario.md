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

## Sessão 20/06/2026 — compromissos pessoais + clicar no dia + correções (detalhes em [[pendencias-proxima-sessao]])
A Agenda já agregava prazos/audiências/perícias/tarefas do usuário (ou do Escritório). Mantida a base e ESTENDIDA:
- **Compromissos pessoais (Etapa A):** conceito novo "compromisso/lembrete" NÃO ligado a processo (reunião, etc.).
  Tabela NOVA **`agenda_compromisso`** (privado por usuário; flag `escritorio=1` p/ compartilhar; campos: titulo,
  descricao, data, hora_inicio/fim, dia_todo, escritorio). NOVO `controllers/agendaCompromissoController.js`
  (listar/criar/atualizar/excluir; só o DONO edita/exclui o seu). Rotas `/agenda/compromissos`; `agendaAPI` em api.js.
  Frontend `Agenda.js`: eventos "📌 Compromissos" (ciano) + checkbox na legenda + "+ Novo compromisso" + ModalCompromisso.
- **Clicar no dia (Etapa B):** calendário "selectable" → seletor "Adicionar em DD/MM/AAAA" com "📌 Novo compromisso"
  (abre ModalCompromisso já com a data) e "✅ Nova tarefa" via DEEP-LINK `/tarefas?nova=1&data=YYYY-MM-DD` (abre o MODAL
  REAL de Tarefas com Vencimento preenchido; Tarefas.js lê via useLocation, ModalTarefa ganhou prop `dataInicial`). Sem duplicar formulário.
- **BUG corrigido:** audiências/perícias COM hora sumiam — `a.hora` vinha "09:00:00" e o código acrescentava ":00"
  → "2026-07-17T09:00:00:00" inválido → react-big-calendar descartava. Normalizado hora p/ "HH:MM" (slice 0,5) e data p/ "YYYY-MM-DD" (slice 0,10).
- **Spinner** `.spinner-mini` (utilitário CSS reutilizável no Layout.css) no "Carregando...".
- ⏳ **ETAPA C PENDENTE:** clicar num evento de PROCESSO (prazo/audiência/perícia/tarefa) → abrir/editar no módulo de
  origem via deep-link. É o ÚNICO pendente da Agenda. (A memória antiga dizia que "clicar num evento abre o relacionado" — isso ainda NÃO existe; é a Etapa C.)

**Relacionado:** [[prazos]], [[tarefas]], [[audiencias]], [[user-permissions]], [[pendencias-proxima-sessao]]
