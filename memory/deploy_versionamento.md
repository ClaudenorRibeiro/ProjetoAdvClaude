---
name: deploy-versionamento
description: Requisitos de deploy na AWS Lightsail e estratégia de versionamento com Git
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Scripts Locais (Desenvolvimento — Windows)

| Arquivo | Função |
|---------|--------|
| `iniciar_pc_escrit.bat` | Inicia backend (`npm run dev` = nodemon) + frontend (`npm start`) |
| `parar_pc_escrit.bat` | Mata processos nas portas 3000 e 3001 |

**Rotina de reinício:** executar `parar_pc_escrit.bat` → `iniciar_pc_escrit.bat`  
**Nodemon:** backend reinicia automaticamente ao salvar qualquer `.js` — sem necessidade de reinício manual a cada mudança de código

## Scripts AWS (Produção)

| Arquivo | Função |
|---------|--------|
| `atualizar-sistema-aws.bat` | Conecta via SSH ao Lightsail e executa o script remoto |
| `scripts/atualizar_aws_remote.sh` | npm install + build frontend + pm2 restart (roda no servidor) |
| `scripts/deploy_completo.sh` | Deploy inicial completo (usar só na 1ª vez) |

**IP AWS Lightsail:** 98.86.50.188  
**SSH Key:** `C:\Users\Claudio\.ssh\lightsail-adv.pem`  
**Nota:** instância AWS ainda não criada — scripts prontos para quando for necessário

## Versionamento

- Formato de commit obrigatório: `DDMMYY-HHMM — descrição curta`
- Sem migrations — schema via HeidiSQL → exportar `estrutura_banco.sql` → commit
- Usar **Git** com commits organizados durante o desenvolvimento
- Estratégia de rollback: `git log` para ver commits, `git checkout <hash>` para voltar

## Deploy (Produção — Futura)

Ao preparar o deploy entregar:
- Tutorial completo do zero: como criar a instância AWS Lightsail
- Tutorial completo de deploy da aplicação na instância
- Todos os scripts/códigos necessários para o deploy
- Configuração do MySQL na instância
- Configuração do Node.js + Express + React na instância

**Why:** Usuário precisa ter autonomia para fazer deploy e reverter versões sem depender de terceiros
