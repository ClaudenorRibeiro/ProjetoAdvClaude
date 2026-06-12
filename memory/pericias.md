---
name: pericias
description: "Módulo de perícias — agendamento, comunicação e vinculação ao processo"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 17 — Perícias

## Dados Registrados

- Processo vinculado
- Tipo de perícia (médica, contábil, insalubridade, etc.) — tabela cadastrável
- Data, hora e local do exame
- Perito nomeado pelo juízo (pessoa já cadastrada no sistema)
- Assistente técnico do escritório (se houver)

## Comunicação

- Ao cadastrar → gera comunicado automático ao cliente (modelo cadastrável, igual às audiências)
- E-mail ao perito → somente se os dados do perito estiverem na ata de audiência, usando modelo cadastrado no sistema
- Antecedência de aviso ao cliente: configurável nas configurações do escritório *(padrão: 2 dias úteis antes)*

## Laudo

- ❌ Não é registrado no sistema
- Prazos decorrentes do laudo são cadastrados manualmente como qualquer outro prazo

## Honorários do Perito

- Cadastrados manualmente na conta corrente da pasta quando houver
- ❌ Sem controle automático

## Resultado

- ❌ Sem registro de resultado após realizada
- ❌ Sem geração automática de prazos ou tarefas

## Tabelas do Banco

- `pericia` — perícias vinculadas a processos
- `tipo_pericia` — tipos de perícia cadastráveis pelo admin

**Relacionado:** [[audiencias]], [[processos-pastas]], [[prazos]], [[financeiro]], [[configuracoes_escritorio]]
