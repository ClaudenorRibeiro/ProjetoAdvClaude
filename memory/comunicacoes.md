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

## Gmail SMTP — Configuração Atual (Dr. Antonio Ferreira da Costa)

### Variáveis no `.env` do servidor (`/var/www/advocacia/backend/.env`)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email do escritório>
SMTP_PASS=goovjyiunyprdbfu   ← App Password (gerada 12/06/2026)
```

### App Password do Gmail (IMPORTANTE)
- É diferente da senha normal da conta Google
- Necessário quando 2FA está ativo na conta
- Gerar em: **myaccount.google.com/apppasswords**
- Cada App Password é um código de 16 caracteres (sem espaços)
- Se invalidada (troca de senha, revogação manual), o sistema retorna erro `535-5.7.8 Invalid login`
- Nesse caso: gerar nova App Password → atualizar `.env` no servidor via WinSCP → `pm2 restart advocacia-backend --update-env`

### Problema detectado — Vírgula sobrando no campo alerta_emails (12/06/2026)
O campo `alerta_emails` nas Configurações tinha: `visaoecultura@gmail.com, ednasvlr@gmail.com,.com`
- O `.com` era tratado como destinatário inválido mas passava pelo `filter(Boolean)`
- **Correção: usuário deve acessar a tela de Configurações e remover o `.com` sobrante**
- Isso explica por que só 1 dos 2 e-mails chegava (o `.com` recebia silenciosamente e falhava)

## Log de E-mails — backend/src/utils/email.js (implementado 12/06/2026)

### Função registrarLog (em email.js)
```javascript
async function registrarLog(para, assunto, status, erro) {
  try {
    await pool.execute(
      'INSERT INTO log_emails (para, assunto, status, erro) VALUES (?, ?, ?, ?)',
      [para, assunto, status, erro || null]
    );
  } catch (e) {
    console.error('Erro ao gravar log_emails:', e.message);
  }
}
```
- Chamada em `enviarEmail()` em caso de sucesso (`status='ok'`) e falha (`status='erro'`)
- `pool` importado de `'../config/database'`
- Em caso de falha: loga, repropaga a exceção para o chamador tratar

### Leitura
- **NUNCA haverá UI para essa tabela** — leitura somente manual via HeidiSQL
- Tabela: `log_emails` — ver [[database-tables]] para DDL completo

## Tabelas do Banco

- `log_comunicacoes` — histórico de todas as mensagens enviadas
- `log_emails` — log técnico de cada tentativa de envio por SMTP (sem UI, HeidiSQL only)
- `configuracoes_integracoes` — módulos ativos e credenciais por escritório (WhatsApp, e-mail, etc.)

**Relacionado:** [[project-overview]], [[audiencias]], [[prazos]], [[database-tables]]
