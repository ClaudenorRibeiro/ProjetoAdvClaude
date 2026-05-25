---
name: comunicacoes
description: "Módulo de comunicações — WhatsApp e e-mail, arquitetura modular por escritório"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 12 — Comunicações

## Arquitetura Modular — IMPORTANTE

- Sistema base funciona 100% sem nenhuma integração externa
- Cada integração é um módulo isolado, implantado individualmente por escritório
- Admin configura quais módulos estão ativos na instância
- Botões de envio só aparecem se o módulo correspondente estiver ativo
- Cada integração fica em pasta isolada no código: `/integrations/whatsapp-zapi/`, `/integrations/email-office365/`, etc.
- Trocar de API não afeta o restante do sistema

## WhatsApp

- Número dedicado do escritório
- Botão "Enviar via WhatsApp" disponível em: documentos gerados, audiências, comunicados, envio manual
- ❌ Não recebe respostas pelo sistema — somente envio
- APIs suportadas (módulos separados, implantados conforme contratação):
  - Z-API (recomendada — custo fixo ~R$150/mês, estável, suporte BR)
  - Evolution API (gratuita, self-hosted, risco de banimento)
  - Outras poderão ser adicionadas futuramente

## E-mail

- Configurável pelo admin por escritório
- ❌ Não recebe respostas — somente envio
- Provedores suportados (módulos separados):
  - Office 365 via Microsoft Graph API
  - Gmail / SMTP genérico

## Disparos Automáticos (já definidos em outros módulos)

- Comunicado de audiência ao cadastrar
- Alerta 3 dias úteis antes da audiência
- Alerta de prazos pendentes no horário configurado

## Disparo Manual

- Usuário pode enviar WhatsApp ou e-mail para o cliente diretamente pelo sistema
- Disponível em qualquer tela de processo/pasta/cliente

## Histórico

- Toda mensagem enviada fica registrada: destinatário, conteúdo, canal, usuário que enviou, data e hora
- Registro vinculado ao cliente/processo

## Tabelas do Banco

- `log_comunicacoes` — histórico de todas as mensagens enviadas
- `configuracoes_integracoes` — módulos ativos e credenciais por escritório (WhatsApp, e-mail, etc.)

**Relacionado:** [[project-overview]], [[audiencias]], [[prazos]], [[database-tables]]
