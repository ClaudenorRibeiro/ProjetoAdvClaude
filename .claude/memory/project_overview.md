---
name: project-overview
description: "Visão geral do sistema de advocacia — objetivo, stack técnico, hospedagem e modelo de negócio"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Sistema de Advocacia — Visão Geral

Sistema de gestão para escritórios de advocacia, desenvolvido para substituir o Excel.

**Escritório atual:** 12 advogados — sistema preparado para até 150 por escritório  
**Áreas cobertas:** Trabalhista, Previdenciária e Família (**SEM** Criminal e Tributário)  
**Usuários:** Até 500 por escritório

## Stack Técnico

- **Linguagem:** JavaScript
- **Backend:** Node.js + Express
- **Frontend:** React
- **Banco de dados:** MySQL
- **Hospedagem:** AWS Lightsail — instância dedicada por escritório
- **Banco de dados:** MySQL na mesma instância (não usa RDS separado)
- **Manutenção:** Via VSCode

## Modelo de Negócio

- Cada escritório tem sua própria instância AWS Lightsail dedicada
- Dados 100% isolados entre escritórios
- Sem planos de assinatura — replicação fica por conta do dono
- Acesso via domínio próprio por escritório (ex: advocaciaclaudio.com.br/sistema)
- Painel administrativo com gestão de usuários e logs de auditoria

## Integrações Externas Previstas

- **WhatsApp:** Evolution API, Z-API ou WPPConnect
- **Outlook / Office 365:** Microsoft Graph API
- **Word / Excel:** Microsoft Graph API + bibliotecas locais (docx, xlsx)
- **PDF:** PDFKit ou Puppeteer (geração local)
- **AASP:** REST API via axios
- **CNJ:** API DataJud via axios

**Why:** Sistema desenvolvido para uso interno do escritório com possibilidade de replicar para outros  
**How to apply:** Arquitetura sempre pensando em isolamento total de dados por instância

**Relacionado:** [[user-permissions]], [[database-tables]]
