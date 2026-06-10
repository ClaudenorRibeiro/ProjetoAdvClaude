---
name: prazos
description: "Módulo de prazos processuais — cadastro, delegação, status e alertas"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Cadastro

- Qualquer usuário pode cadastrar um prazo
- Prazo em dias ou horas
- Se em dias: dias corridos ou dias úteis
- Dias úteis = exceto sábado, domingo e feriado
- Sábados e domingos pré-cadastrados para 20-30 anos
- Feriados cadastráveis por usuário com permissão

## Tipos de Prazo — Duas Tabelas

- **tipo_prazo:** Processual, Recursal, Judicial, Execução
- **prazo:** Contestação, Recurso Ordinário, Agravo de Petição, etc. (42+ prazos)

## Delegação

- Prazo delegado a usuário específico ou fica como prazo do escritório

## Status do Prazo

| Status | Descrição |
|--------|-----------|
| Aberto | Ninguém assumiu |
| Fazendo | Usuário assumiu — visível para todos em tempo real |
| Pendente | Usuário parou — volta para fila |
| Agendado | Programado para depois |
| Concluído | Cumprido — registra usuário, data e hora |

## Alertas

- Ao logar: usuário vê prazos do dia delegados a ele
- Indicador visual com quantidade de prazos do dia
- Filtro completo por data (anteriores e posteriores)
- Horário configurável (ex: 18h/19h) → admins recebem alerta de prazos pendentes via **e-mail e/ou WhatsApp**

## Auditoria Completa

Registra: quem cadastrou, quem assumiu, quem pausou, quem concluiu + data e hora de cada evento

**Diferença prazo vs tarefa:** Ver [[tarefas]]  
**Relacionado:** [[processos-pastas]], [[tarefas]]
