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
- Alerta de prazos pendentes no horário configurado (até 2 horários — ver [[prazos]])
- **Comunicado de PERÍCIA ao cliente** (13/06/2026): ao cadastrar/remarcar/cancelar + reenvio manual.
  Serviço `backend/src/services/comunicadoService.js` (NOVO). Vai ao cliente do processo (autor/réu por
  `tblproc.cliente_polo`), e-mail principal de emails_pf/pj. NADA ao perito. Texto simples HTML em função
  MODULAR (`montarComunicadoPericia`) pronta p/ virar modelo+PDF. Registra em `log_comunicacoes`. Ver [[pericias]].

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
SMTP_USER=antonioadv.sistema@gmail.com
SMTP_PASS=<App Password 16 chars, sem espaços — fica SÓ no .env do servidor, não anotar aqui>
```
(O `.env` NÃO está no git → sobrevive ao deploy `git reset --hard`. Editar via WinSCP.)

### ⚠️ Causa raiz do BadCredentials resolvida em 13/06/2026 (LIÇÃO IMPORTANTE)
O PM2 reinjeta o ambiente salvo em `~/.pm2/dump.pm2` a cada start; lá estava uma App Password ANTIGA.
O `dotenv.config()` padrão NÃO sobrescreve variável já presente no `process.env` → a senha velha do PM2
vencia a do `.env` → `535 BadCredentials` em todo restart, independente do `.env` estar certo.
**FIX (já em produção):** `backend/server.js` → `require('dotenv').config({ override: true })`.
Higiene opcional no servidor: `pm2 delete advocacia-backend && cd /var/www/advocacia && unset SMTP_PASS && pm2 start ecosystem.config.js && pm2 save`.

### App Password do Gmail (IMPORTANTE)
- É diferente da senha normal da conta Google
- Necessário quando 2FA está ativo na conta
- Gerar em: **myaccount.google.com/apppasswords**
- Cada App Password é um código de 16 caracteres (sem espaços)
- Se invalidada (troca de senha, revogação manual), o sistema retorna erro `535-5.7.8 Invalid login`
- Nesse caso: gerar nova App Password → atualizar `.env` no servidor via WinSCP → `pm2 restart advocacia-backend --update-env`

### Problema — alerta_emails quebrado (ATUALIZADO 12/06/2026 tarde)
O valor real no banco (conferido no backup) é PIOR do que parecia:
`visaoecultura@gmail.com, ednasvlr@gmail,.com` — o e-mail da Edna está TRUNCADO (sem `.com`).
- **Correção: já incluída no script `scripts/fase2_1_correcao_dados.sql`** (UPDATE no banco) —
  o usuário roda no HeidiSQL; NÃO precisa mais corrigir pela tela
- Valor correto: `visaoecultura@gmail.com, ednasvlr@gmail.com`

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
