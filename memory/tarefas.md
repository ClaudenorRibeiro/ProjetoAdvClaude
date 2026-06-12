---
name: tarefas
description: "Módulo de tarefas — diferença em relação a prazos, atribuição e prioridades"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Diferença Fundamental: Prazo vs Tarefa

| | Prazo | Tarefa |
|-|-------|--------|
| Vínculo | Obrigatório com processo | Livre |
| Natureza | Jurídico/processual | Agenda/compromisso |
| Alerta admin | ✅ Sim | ❌ Não |
| Cor de atraso | ✅ Sim | ✅ Vermelho |

## Funcionalidades

- Atribuída a: usuário específico, grupo, departamento, escritório ou si mesmo
- Pode ser encaminhada para outro usuário ou devolvida ao escritório
- Data de vencimento opcional
- Tarefa vencida fica em **vermelho indefinidamente** até ser concluída
- ❌ Sem subtarefas
- Vínculo com processo ou rotina interna (pasta removida em 01/06/2026)
- Conclusão registra usuário, data e hora

## Tipos de Vínculo (Nova Tarefa)

- ⚖️ Processo — vincula ao processo selecionado
- 🗂️ Rotina Interna — sem vínculo processual
- ~~📁 Pasta~~ — **removido em 01/06/2026** (botão e código excluídos do modal)
- Tarefas antigas com `pasta_id` continuam exibidas corretamente na listagem (backward compat)

## Prioridades

- 🔴 Urgente
- 🟡 Normal
- 🟢 Baixa

**Relacionado:** [[prazos]]
