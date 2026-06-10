---
name: audiencias
description: "Módulo de audiências — tipos, comunicados, atas e integração com financeiro"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Tipos de Audiência

- Tabela cadastrável: Una, Instrução, Inicial, Conciliação, etc.
- Presencial ou virtual (Google Meet, Teams, Zoom, etc.)
- Se virtual: campo para plataforma e link

## Informações da Audiência

Tipo, data, hora, modalidade, local (padrão: endereço da vara, alterável), plataforma/link se virtual

## Comunicado Automático ao Cliente

- Ao cadastrar audiência → gera PDF do comunicado
- Cada tipo tem seu modelo específico
- Enviado via **e-mail e WhatsApp**

## Ata de Audiência — Pode Gerar

- Resultado da audiência
- Nova audiência (remarcação)
- Novos prazos
- Prazos de perícia e comunicados ao perito
- Tarefas diversas
- **Acordo com parcelas → vincula automaticamente ao financeiro da pasta**

## Alertas e Controle

- **3 dias úteis antes** → WhatsApp automático ao cliente
- Painel com filtro: hoje, ontem, amanhã, período
- Toda audiência exige ata — sistema avisa audiências sem ata
- Ao registrar ata → sai da lista de pendentes

**Relacionado:** [[processos-pastas]], [[prazos]], [[financeiro]]
