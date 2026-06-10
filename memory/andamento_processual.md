---
name: andamento-processual
description: Módulo de andamento processual — histórico de movimentações de um processo
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 10 — Andamento Processual

**Lançamento:** Manual pelo usuário (integração CNJ adiada para bloco futuro)

## Dados de um Andamento

- Data (preenchida automaticamente, editável se necessário)
- Descrição (texto livre)
- Usuário que lançou (automático — registra quem estava logado)

## Regras

- Vinculado obrigatoriamente a um processo
- Múltiplos andamentos por processo
- Ordenados por data — mais recente primeiro
- Usuário com permissão pode editar ou excluir um andamento
- Auditoria registra edições e exclusões (quem fez e quando)

## Pendente

- Integração com API DataJud do CNJ — será definida em bloco futuro

## Tabela do Banco

- **andamento_processual** — andamentos vinculados a um processo

**Relacionado:** [[processos-pastas]], [[database-tables]]
