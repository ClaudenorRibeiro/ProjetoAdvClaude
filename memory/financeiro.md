---
name: financeiro
description: "Módulo financeiro — conta corrente por pasta, honorários, recibos e relatórios"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Conta Corrente por Pasta

| Campo | Descrição |
|-------|-----------|
| Data | Data do lançamento |
| Descrição | Ex: cartório, gasolina, xerox, táxi |
| Valor | Valor do lançamento |
| Tipo | Débito ou Crédito |
| Saldo | Calculado automaticamente |

## Honorários — Totalmente Flexíveis

- Percentual por parcela (ex: 30% de cada parcela)
- Valor fixo (ex: R$ 1.000,00)
- Sem honorários (R$ 0,00)
- Combinações diversas
- Processos podem ter acordo parcelado (10x, 15x, 20x, etc.)

## Recibo em PDF contém

- Dados da pasta e cliente
- Histórico de lançamentos
- Valor do acordo/parcela
- Honorários cobrados
- Despesas do processo
- Valor líquido ao cliente
- ❌ Sem emissão de nota fiscal

## Relatório Financeiro

- Período configurável: mensal, anual ou personalizado
- Mostra: processos no período, entradas, honorários, despesas, valor líquido

## Parcerias/Comissões

- Cadastradas por processo — opcional
- Com quem, percentual ou valor fixo
- Aparece no fechamento e nos relatórios

**Relacionado:** [[processos-pastas]], [[audiencias]]
