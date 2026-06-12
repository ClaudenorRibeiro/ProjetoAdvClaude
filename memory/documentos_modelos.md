---
name: documentos-modelos
description: Módulo de geração de documentos a partir de modelos com variáveis automáticas
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 11 — Documentos e Modelos

## Correção de 12/06/2026 (documentosController.js — local, aguardando deploy)

- **Bug corrigido:** a query de variáveis usava `pf.endereco`, coluna que NÃO existe em
  pessoas_fisicas — geraria erro SQL ao gerar documento vinculado a processo.
  Agora monta o endereço com CONCAT_WS (logradouro, numero, complemento, bairro, cidade-estado),
  tanto para pessoa física quanto jurídica.
- A variável `{{endereco_cliente}}` era selecionada mas nunca atribuída — agora é preenchida.
- **Próximo passo (Fase 5):** construir a UI deste módulo — backend já está pronto.

## Formato

- Gera **Word (.docx)** editável
- Gera **PDF** para exportação
- Usuário escolhe o formato na hora de gerar

## Modelos

- Cadastrados e configurados pelo admin (ou usuário com permissão)
- Contêm variáveis automáticas que o sistema preenche ao gerar:
  - `{{nome_cliente}}`, `{{cpf_cliente}}`, `{{endereco_cliente}}`
  - `{{numero_processo}}`, `{{vara}}`, `{{forum}}`
  - `{{data_hoje}}`, `{{nome_advogado}}`
  - (outras variáveis definidas pelo admin)
- Modelos iniciais: Contrato de honorários, Procuração, Petição inicial, Recurso, Notificação extrajudicial
- Admin pode criar quantos modelos quiser

## Vinculação

- Arquivo gerado **não é salvo** no servidor — usuário baixa e gerencia localmente
- Salvo apenas o **log da geração:** qual modelo, qual processo/pasta, quem gerou, data e hora

## Tabelas do Banco

- `modelo_documento` — modelos cadastrados com variáveis
- `log_documentos_gerados` — registro de geração (modelo, processo, usuário, data/hora)

**Relacionado:** [[processos-pastas]], [[database-tables]]
