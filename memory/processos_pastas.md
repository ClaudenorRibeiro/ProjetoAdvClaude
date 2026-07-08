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

## Estrutura real no banco (importante) — nomes de tabela em MINÚSCULAS, sempre (regra 22/06)
- As partes NÃO são colunas de `tblproc`; ficam em tabelas próprias: **`tbltituloprocautor`** e
  **`tbltituloprocreu`** (cada linha: proc_id + tipo_pessoa ENUM('fisica','juridica') + pessoa_id — o MySQL
  recusa qualquer outro valor de tipo_pessoa). Um processo pode ter vários autores e vários réus (litisconsórcio).
  O `tblproc.NomeTituloProc` é só o texto-título gerado (varchar 300) — não é fonte de verdade das partes.
- **Cadastrar processo com número de pasta já existente é PERMITIDO e intencional:** o campo "Número da Pasta"
  na tela é só uma sugestão editável; se o número digitado já existir em `tblpasta`, o backend (`criarProcesso`)
  REAPROVEITA a pasta (não duplica) — caso de uso: carta precatória, recurso, processo relacionado do mesmo cliente.
- **`numProc` (formato CNJ):** salvo já com a máscara aplicada (texto, varchar 45), padrão
  `NNNNNNN-DD.AAAA.J.TR.OOOO` (nº sequencial-dígito verificador.ano.segmento.tribunal.origem). Opcional — pode
  ficar NULL. Máscara aplicada no frontend via `mascaraCNJ` (`utils/formatters.js`).

## Adições de 13/06/2026 (ver [[pericias]] e [[pendencias-proxima-sessao]])
- **`tblproc.cliente_polo`** (VARCHAR 'autor'/'reu', opcional): marca qual polo é o **cliente do escritório**.
  Usado para saber a quem enviar comunicados (perícia hoje; audiência no futuro). Definido no cadastro do processo
  (seletor "Cliente do escritório" nos dois modais de `pages/Processos/Processos.js`).
- **`processo_perito`** (tabela nova, muitos-p/-muitos): peritos vinculados ao processo (proc_id + tipo_pessoa +
  pessoa_id). Seção "Peritos do processo (opcional)" no cadastro do processo. O seletor de perito da perícia
  usa essa lista. Perito = pessoa (sem flag), papel pelo contexto. Backend: `processosController.js`
  (criarProcesso/atualizarProcesso/buscarPasta tratam cliente_polo + peritos[]).

## 🆕 02-03/07/2026 — validação de autor/réu também na EDIÇÃO (código, LOCAL, não deployado)
- `criarProcesso` sempre exigiu ≥1 autor e ≥1 réu (backend + tela). Na EDIÇÃO (`atualizarProcesso`), essa trava só
  existia na TELA — o endpoint aceitava `autores`/`reus` vazios sem checar. Usuário pediu pra fechar essa brecha:
  agora `atualizarProcesso` (`processosController.js`) também retorna erro se `autores`/`reus` vierem no body
  vazios (só valida quando o campo é explicitamente enviado — `!== undefined` — pra não quebrar outros usos que
  atualizam o processo sem tocar nas partes). SEM banco, sem risco pro fluxo normal (a tela já mandava sempre
  preenchido).

## 🆕 03/07/2026 — IMPORTAÇÃO EM MASSA de `tblproc` da base antiga (planilha) — ver [[pendencias-proxima-sessao]]
- Gerado `import_tblproc.sql` (Downloads do usuário) a partir de `tblproc.xlsm` (6.712 processos da base antiga).
  Detalhes completos (decisões, tratamento de duplicados, título gigante truncado, etc.) na memória de pendências.
  **Importante:** essa importação povoa SÓ `tblproc` — os processos importados ficam SEM autor/réu vinculado em
  `tbltituloprocautor`/`tbltituloprocreu` (decisão do usuário, "por enquanto"). Ou seja, ao abrir um desses
  processos importados pra EDITAR na tela, a validação nova acima (autor/réu obrigatório) vai IMPEDIR salvar até
  alguém adicionar as partes manualmente — comportamento esperado, não é bug.

**Relacionado:** [[cadastro-pessoas]], [[prazos]], [[financeiro]], [[audiencias]], [[pericias]]
