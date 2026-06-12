---
name: cadastro-pessoas
description: Módulo de cadastro de pessoas físicas e jurídicas — conceito de papel por contexto
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Conceito Fundamental

**Primeiro cadastra-se a pessoa — ela não tem papel definido no cadastro.**  
O papel é definido no contexto onde ela é utilizada.

Pessoa só vira **cliente** quando vinculada a uma pasta + contrato de honorários.

## Papéis Possíveis da Mesma Pessoa

| Contexto | Papel |
|----------|-------|
| Vinculada a processo como autor/réu + contrato | Cliente |
| Vinculada a processo como testemunha | Testemunha |
| Vinculada a processo como perito | Perito |
| Vinculada a processo como advogado adverso | Advogado adverso |
| Vinculada a processo como assistente/médico | Assistente técnico |
| Sem vínculo | Apenas pessoa cadastrada |

## Dados — Pessoa Física

Nome completo, CPF, RG, data de nascimento, estado civil, profissão, gênero, telefone(s), e-mail(s), endereço completo, foto (opcional)

## Dados — Pessoa Jurídica

Razão social, nome fantasia, CNPJ, inscrição estadual, telefone(s), e-mail(s), endereço completo, nome do representante legal

## Regras

- Uma pessoa pode ter vários telefones e e-mails
- Telefones ordenados por mais recente primeiro — **nunca excluídos sem permissão**
- Campo de foto opcional para pessoa física
- ❌ Sem anexo de documentos
- Histórico de atendimento: data e hora automáticas, texto livre, múltiplos registros

## Implementado (28/05/2026)

- **Busca abrangente (físicas):** nome, CPF (sem máscara), RG, PIS, logradouro, bairro, cidade, qualquer telefone (via EXISTS em telefones_pf)
- **Busca abrangente (jurídicas):** razão social, CNPJ (sem máscara), nome fantasia, representante legal, logradouro, bairro, cidade, qualquer telefone (via EXISTS em telefones_pj)
- **Capitalização de auxiliares:** ao cadastrar novo estado civil, profissão ou gênero, primeira letra maiúscula + demais minúsculas (normalização no backend em `criarAuxiliar`)
- **Coluna Qtde Proc:** na listagem de pessoas físicas e jurídicas, mostra total de processos onde a pessoa aparece como autor (`tbltituloprocautor`) OU réu (`tbltituloprocreu`), sem duplicatas (UNION)

**Relacionado:** [[processos-pastas]], [[database-tables]]
