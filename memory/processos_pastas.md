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

## Estrutura real no banco (importante)
- As partes NÃO são colunas de `tblProc`; ficam em tabelas próprias: **`tblTituloProcAutor`** e
  **`tblTituloProcReu`** (cada linha: proc_id + tipo_pessoa 'fisica'/'juridica' + pessoa_id). Um processo
  pode ter vários autores e vários réus. O `tblProc.NomeTituloProc` é só o texto-título gerado.

## Adições de 13/06/2026 (ver [[pericias]] e [[pendencias-proxima-sessao]])
- **`tblProc.cliente_polo`** (VARCHAR 'autor'/'reu', opcional): marca qual polo é o **cliente do escritório**.
  Usado para saber a quem enviar comunicados (perícia hoje; audiência no futuro). Definido no cadastro do processo
  (seletor "Cliente do escritório" nos dois modais de `pages/Processos/Processos.js`).
- **`processo_perito`** (tabela nova, muitos-p/-muitos): peritos vinculados ao processo (proc_id + tipo_pessoa +
  pessoa_id). Seção "Peritos do processo (opcional)" no cadastro do processo. O seletor de perito da perícia
  usa essa lista. Perito = pessoa (sem flag), papel pelo contexto. Backend: `processosController.js`
  (criarProcesso/atualizarProcesso/buscarPasta tratam cliente_polo + peritos[]).

**Relacionado:** [[cadastro-pessoas]], [[prazos]], [[financeiro]], [[audiencias]], [[pericias]]
