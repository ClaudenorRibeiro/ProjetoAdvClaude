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

**Escritório atual:** Dr. Antonio Ferreira da Costa — 12 advogados  
**Capacidade:** Até 150 advogados / 500 usuários por escritório  
**Áreas cobertas:** Trabalhista, Previdenciária e Família (**SEM** Criminal e Tributário)

## Stack Técnico

- **Linguagem:** JavaScript (decisão confirmada — não migrar para TypeScript)
- **Backend:** Node.js 20 + Express (porta 3001)
- **Frontend:** React + Vite (build estático servido pelo Nginx)
- **Banco de dados:** MySQL 8 na mesma instância (não usa RDS separado)
- **Hospedagem:** AWS Lightsail — Ubuntu 22.04, Virginia (us-east-1)
- **Processo:** PM2 com autostart
- **Proxy:** Nginx (porta 80/443 → 3001)
- **Manutenção:** Via VSCode
- **Estado atual:** ~20% do desenvolvimento concluído

## Modelo de Negócio

- Cada escritório tem sua própria instância AWS Lightsail dedicada ($5/mês)
- Dados 100% isolados entre escritórios
- Acesso via subdomínio próprio (ex: `sistema.antonio.adv.br`)
- SSL gratuito via Let's Encrypt (Certbot)
- Deploy feito pelo dono (Claudio) via scripts da pasta `deploy/instalacao/`

## Instâncias Ativas

| Cliente | IP | Domínio | Status |
|---------|-----|---------|--------|
| Dr. Antonio Ferreira da Costa | 98.85.19.2 | sistema.antonio.adv.br | ✅ Online |

## Nome do Sistema na Tela de Login

O nome do escritório é carregado **dinamicamente** do banco via endpoint público `GET /api/public/info`.  
Antes retornava "Sistema de Advocacia" fixo — agora mostra o nome real do escritório.  
Fallback: "Sistema de Advocacia" se o banco não responder.

## Integrações Externas Previstas

- **WhatsApp:** Z-API (descartado por ora — custo ~R$100/mês, implementar depois)
- **SMS:** Descartado — taxa de leitura péssima no Brasil
- **E-mail:** Gmail SMTP ativo (antonioadv.sistema@gmail.com)
- **Word / Excel:** bibliotecas locais (docx, xlsx)
- **PDF:** PDFKit ou Puppeteer (geração local)
- **AASP:** REST API via axios
- **CNJ:** API DataJud via axios (versão futura)

## Estado dos Módulos

| Módulo | Status |
|--------|--------|
| Auth / Login | ✅ Funcional |
| Pessoas | ✅ Funcional |
| Processos / Pastas | ✅ Funcional |
| Prazos (com histórico) | ✅ Funcional |
| Tarefas (excluir + histórico) | ✅ Funcional |
| Audiências | ✅ Funcional |
| Financeiro | ✅ Funcional |
| Andamentos Processuais | ✅ Funcional |
| Perícias | ✅ Funcional |
| Dashboard | ✅ Funcional |
| Configurações + Permissões | ✅ Funcional |
| Documentos / Modelos | 🔄 Backend ok, UI pendente |
| Agenda / Calendário | ❌ Não iniciado |
| Relatórios | ❌ Não iniciado |
| Publicações AASP | ❌ Não iniciado |
| Comunicações (UI) | ❌ Não iniciado |

**Relacionado:** [[user-permissions]], [[database-tables]]
