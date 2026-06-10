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
| `iniciar_pc_casa.bat` | Idem para PC de casa (Claudenor) — corrigido para `npm run dev` |
| `parar_pc_escrit.bat` | Mata processos nas portas 3000 e 3001 |
| `parar_pc_casa.bat` | Idem para PC de casa |
| `salvar_pc_escrit.bat` | Faz commit + push no Git |
| `salvar_pc_casa.bat` | Idem para PC de casa |

**Rotina de reinício:** executar `parar_pc_escrit.bat` → `iniciar_pc_escrit.bat`  
**Nodemon:** backend reinicia automaticamente ao salvar qualquer `.js`

## Scripts AWS (Produção)

| Arquivo | Função |
|---------|--------|
| `atualizar-sistema-aws.bat` | Conecta via SSH ao Lightsail e executa o script remoto |
| `scripts/atualizar_aws_remote.sh` | npm install + build frontend + pm2 restart (roda no servidor) |
| `deploy_completo.sh` | Deploy inicial legado — substituído pela pasta `deploy/instalacao/` |

## Pasta deploy/ — Scripts de Instalação (NOVO — 05/06/2026)

**Localização:** `deploy/instalacao/` — NÃO vai para o git (contém senhas dos clientes)  
**Fluxo:** Edita no PC → cria arquivo no servidor via nano → cola → roda

| Arquivo | O que faz |
|---------|-----------|
| `1-configurar.sh` | ÚNICO arquivo editado — dados do cliente (IP, senhas, e-mail, nome) |
| `2-instalar-servidor.sh` | Instala Node.js 20, MySQL 8, Nginx, PM2, Certbot — sem interatividade |
| `3-preparar-mysql.sh` | Cria banco, usuário, permissões e verifica conexão |
| `4-deploy-sistema.sh` | Clona repo, compila frontend, cria tabelas, dados, feriados, superusuário |
| `5-iniciar-servicos.sh` | Inicia PM2, configura Nginx, verifica tudo |
| `6-ssl.sh` | Ativa HTTPS gratuito (Let's Encrypt) — só se tiver domínio |
| `7-backup.sh` | Backup do banco em .sql — pode rodar a qualquer momento |

Cada `.sh` tem um `.txt` correspondente com instruções passo a passo para leigos.  
**Tela roxa eliminada:** `export NEEDRESTART_MODE=a` no `2-instalar-servidor.sh`

## Instância do Dr. Antonio Ferreira da Costa

- **IP:** `98.85.19.2` (Virginia, us-east-1)
- **Domínio:** `sistema.antonio.adv.br` → DNS configurado na Locaweb
- **DNS:** Locaweb (ns1/ns2/ns3.locaweb.com.br) — registro A `sistema` → `98.85.19.2`
- **SSL:** Let's Encrypt (gratuito, renova automaticamente a cada 90 dias)
- **Instância:** AntonioAdv — Ubuntu 22.04, 512MB RAM, 2vCPUs, 20GB SSD

## Versionamento

- Formato de commit obrigatório: `DDMMYY-HHMM — descrição curta`
- Sem migrations — schema via HeidiSQL → exportar `estrutura_banco.sql` → commit
- **Regra nova (05/06/2026):** Só subir para o git após autorização explícita do usuário
- A pasta local SEMPRE prevalece sobre o git
- Estratégia de rollback: `git log` para ver commits, `git checkout <hash>` para voltar

## .gitignore — O que NÃO vai para o git

- `backups/` — SQLs grandes com dados reais
- `.claude/settings.local.json` — config local do Claude
- `*.docx` — documentos gerados localmente
- `package.json` / `package-lock.json` da raiz
- `deploy/` — scripts com senhas dos clientes
- `INSTALACAO_AWS_LIGHTSAIL.txt` — guia local

## Arquivos removidos/apagados

- `scripts/limpeza_banco_280526.sql` — uso único já executado
- `puxar_pc_casa.bat` — obsoleto
- `Como rodar em um servidor novo.docx` — substituído
- `HANDOFF_OUTRO_COMPUTADOR.txt` — substituído pela memória
- `scripts/1_setup_servidor.sh` até `5_atualizar.sh` — substituídos pela pasta `deploy/`
- `DEPLOY_AWS_LIGHTSAIL.txt` — substituído pela pasta `deploy/`
- `ConfiguracoesIniciais.txt` — desatualizado (falava em migrations antigas)
- `gerar_manual_prazos.js` — uso pontual, removido
