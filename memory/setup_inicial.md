---
name: setup-inicial
description: "Bloco 20 — Setup e instalação inicial do sistema, campos obrigatórios e bloqueio de módulos"
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

## Bloco 20 — Setup / Instalação Inicial

## Primeiro Acesso

- O **superusuário** está hardcoded no código — entra no primeiro acesso sem cadastro
- No primeiro login, o sistema exige imediatamente a criação do **primeiro usuário admin**
- Admin escolhe livremente o nome de usuário e senha
- O superusuário permanece sempre ativo em segundo plano, invisível no dia a dia

## Navegação no Setup

- Admin cai direto no painel de configurações — sem wizard passo a passo
- Preenche os campos na ordem que quiser
- Campos obrigatórios ficam destacados
- Enquanto os obrigatórios não forem preenchidos, o sistema fica **totalmente bloqueado**
- Sistema exibe mensagem clara indicando exatamente o que falta preencher

## Campos Obrigatórios para Liberar o Sistema

1. Nome do escritório
2. CNPJ ou CPF do responsável
3. E-mail do escritório
4. Criação do primeiro usuário administrador
5. Pelo menos 1 advogado cadastrado com OAB

## Configurações Opcionais

Tudo o mais é opcional — o admin configura conforme precisar:
- Demais usuários e advogados
- Modelos de documentos
- Feriados
- Integrações (AASP, WhatsApp, e-mail)
- Tipos de prazo, audiência, perícia
- Etc.

## Bloqueio de Módulos por Configuração Faltante

- Módulos que dependem de configurações não realizadas ficam **inacessíveis**
- Exibem mensagem indicando qual cadastro precisa ser feito pelo admin para liberar o módulo
- Exemplo: tela de Publicações bloqueada enquanto credenciais da AASP não forem configuradas

## Tabela de Calendário — Instalação

- Na instalação, o banco é populado com **30 anos de datas** pré-cadastradas
- Sábados e domingos marcados como dias não úteis
- Todos os demais marcados como dias úteis
- Feriados adicionados manualmente pelo admin alteram os dias na tabela
- Essa tabela é usada para todos os cálculos de prazo em dias úteis do sistema

**Relacionado:** [[user-permissions]], [[configuracoes-escritorio]], [[prazos]], [[integracoes-publicacoes]], [[database-tables]]
