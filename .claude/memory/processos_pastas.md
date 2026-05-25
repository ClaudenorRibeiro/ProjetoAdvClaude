---
name: processos-pastas
description: Estrutura hierárquica de pastas e processos — como casos são organizados no sistema
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Estrutura Hierárquica

```
PESSOA
└── CLIENTE (quando vinculado a uma pasta)
    ├── PASTA 0001 — Autor vs Réu (Trabalhista)
    │   ├── Processo 1 (nº → Vara → Fórum)
    │   ├── Processo 2
    │   └── Processo N...
    ├── PASTA 0002 — Autor vs Réu (Família)
    │   └── Processo 1...
    └── PASTA N...
```

## Regras

- Cada pasta tem número sequencial e título **Autor vs Réu**
- Cada pasta é exclusiva de um cliente — **nunca compartilhada**
- Um cliente pode ter várias pastas — uma por caso/situação
- Cada pasta tem sua área do direito
- Uma pasta pode ter vários processos
- Cada processo vinculado a uma vara que pertence a um fórum
- Polo ativo (autor) e polo passivo (réu) — um ou vários em cada polo (litisconsórcio)
- Sistema tem cadastro de **fórum** e cadastro de **vara** separados

**Relacionado:** [[cadastro-pessoas]], [[prazos]], [[financeiro]], [[audiencias]]
