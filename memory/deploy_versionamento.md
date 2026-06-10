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

## Pasta deploy/atualizacao/ — Scripts de Atualização (revisados em 10/06/2026)

Os 3 scripts de atualização ficam na pasta `deploy/atualizacao/`. Cada um tem um `.txt` explicativo.

| Script | O que faz |
|--------|-----------|
| `1-AtualizarSistema.sh` | Baixa código do GitHub, instala dependências, rebuilda frontend, reinicia PM2 |
| `2-AtualizarBanco.sh` | Executa SQL de alteração de banco com transação automática (rollback em erro) |
| `3-VerificarSistema.sh` | Diagnóstico completo: PM2, Nginx, MySQL, disco, SSL, tabelas tbl, logs |

**Como subir os scripts para o servidor:**
```
scp -i "chave.pem" deploy/atualizacao/*.sh ubuntu@IP:/home/ubuntu/
```
Depois no servidor: `bash /home/ubuntu/1-AtualizarSistema.sh`

### Mudanças feitas em 10/06/2026 — 1-AtualizarSistema.sh

**Problema encontrado:** `git pull` falha após `git push --force` (histórico incompatível).  
**Solução permanente:** substituído por:
```bash
git fetch origin && git reset --hard origin/main
```
Isso funciona independentemente de histórico reescrito.

**Otimização npm install no frontend:**
```bash
HASH_ATUAL=$(md5sum package.json 2>/dev/null | cut -d' ' -f1 || echo "novo")
HASH_ANTERIOR=$(cat .npm_hash 2>/dev/null || echo "")
if [ "$HASH_ATUAL" != "$HASH_ANTERIOR" ]; then
  npm install --silent
  echo "$HASH_ATUAL" > .npm_hash
fi
```
Só roda `npm install` quando o `package.json` muda — economiza tempo e memória.

### Mudanças feitas em 10/06/2026 — 2-AtualizarBanco.sh

Adicionado suporte a transações automáticas:
- Toda execução SQL é envolvida em `SET autocommit=0; START TRANSACTION; ... COMMIT;`
- Se qualquer comando SQL falhar → `ROLLBACK` automático
- Banco nunca fica em estado parcialmente atualizado

### Mudanças feitas em 10/06/2026 — 3-VerificarSistema.sh

- Adicionada seção **[6] Tabelas do banco de dados** — verifica se as 6 tabelas tbl principais existem com nomes camelCase corretos: `tblProc, tblPasta, tblForum, tblVara, tblTituloProcAutor, tblTituloProcReu`
- Seção anterior [6] renumerada para [7]

## Mudanças nos Scripts de Instalação (10/06/2026)

### 2-instalar-servidor.sh — lower_case_table_names

Adicionado ao config do MySQL:
```ini
lower_case_table_names = 1
```
**Efeito:** MySQL passa a ignorar maiúsculas/minúsculas em nomes de tabelas — igual ao comportamento do Windows.  
**CRÍTICO:** só pode ser aplicado em instalação nova (antes de qualquer dado). Em servidor existente, o MySQL rejeita e não inicia.

### 4-deploy-sistema.sh — rename_tbl() após importar SQL

Adicionada função `rename_tbl()` que renomeia as 9 tabelas tbl de minúsculo para camelCase após importar o `estrutura_banco.sql`:
```bash
rename_tbl tblforum           tblForum
rename_tbl tblinstanciaproc   tblInstanciaProc
rename_tbl tblpasta           tblPasta
rename_tbl tblproc            tblProc
rename_tbl tblstatusproc      tblStatusProc
rename_tbl tbltipoproc        tblTipoProc
rename_tbl tbltituloprocautor tblTituloProcAutor
rename_tbl tbltituloprocreu   tblTituloProcReu
rename_tbl tblvara            tblVara
```
Funciona mesmo que as tabelas já estejam com nome correto (verifica antes de renomear).

## Estado do Git — 10/06/2026

O histórico do git foi **completamente limpo** em 10/06/2026 a pedido do usuário.  
Todos os arquivos locais foram subidos como um único commit inicial zerado.

**Commits após limpeza:**
| Hash | Data | Descrição |
|------|------|-----------|
| `ab6261c` | 10/06/26 | commit inicial — todos os arquivos |
| `0ca58e8` | 10/06/26 | correções (audiências, transações, gitignore) |
| `d9ee9f0` | 10/06/26 | scripts de deploy revisados |
| `5e5342e` | 10/06/26 | fix: padroniza nomes camelCase das tabelas tbl |

**Workflow após limpeza de histórico no servidor:**
1. Local: `git push --force origin main` (só quando o usuário autorizar)
2. Servidor: `bash /home/ubuntu/1-AtualizarSistema.sh` (usa `git fetch + reset --hard`)
3. **NUNCA** usar `git pull` no servidor após force push — vai falhar

## .gitignore — Correção de 10/06/2026

**Bug encontrado:** `.gitignore` tinha `package.json` sem barra inicial, o que fazia com que TODOS os `package.json` do projeto fossem ignorados, incluindo `backend/package.json` e `frontend/package.json`.

**Efeito:** `npm install` falhava no servidor com "missing package.json".

**Correção:** trocado para `/package.json` e `/package-lock.json` (só ignora os da raiz).  
Os arquivos `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json` agora estão no git.

## Arquivos removidos/apagados

- `scripts/limpeza_banco_280526.sql` — uso único já executado
- `puxar_pc_casa.bat` — obsoleto
- `Como rodar em um servidor novo.docx` — substituído
- `HANDOFF_OUTRO_COMPUTADOR.txt` — substituído pela memória
- `scripts/1_setup_servidor.sh` até `5_atualizar.sh` — substituídos pela pasta `deploy/`
- `DEPLOY_AWS_LIGHTSAIL.txt` — substituído pela pasta `deploy/`
- `ConfiguracoesIniciais.txt` — desatualizado (falava em migrations antigas)
- `gerar_manual_prazos.js` — uso pontual, removido
