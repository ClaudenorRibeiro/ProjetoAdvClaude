---
name: deploy-versionamento
description: Requisitos de deploy na AWS Lightsail e estratégia de versionamento com Git
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## ⭐⭐ PRODUÇÃO NOVA — DEPLOY DO ZERO EM 25-26/06/2026 (LER PRIMEIRO)

A produção foi migrada para um **servidor NOVO**, instalado do zero. Detalhes e passo a passo completo em
**`Deploy/GUIA-DEPLOY-DO-ZERO.txt`**; narrativa em **`resumo do dia 260626 - deploy AWS do zero.txt`**.

- **Servidor novo:** Lightsail **AntonioADV**, **Ubuntu 24 LTS**, us-east-1. Conta AWS: **EdnaADV (905418183179)**.
  **IP público: 100.57.24.46**. Domínio **sistema.antonio.adv.br** aponta pra ele (HTTPS Let's Encrypt, renova sozinho).
- **Servidor antigo:** 98.85.19.2 (Ubuntu 22, conta Antonio 264022422777) — o domínio NÃO aponta mais pra ele.
- **Node no servidor novo:** **24 LTS** (não 20). **LibreOffice** instalado (geração de PDF).
- **S3 cross-account:** Lightsail na conta EdnaADV, S3 na conta Antonio — funciona por credencial IAM no .env (buckets dev+prod).

**Scripts de Deploy CORRIGIDOS nesta sessão (ficam só locais, vão por WinSCP — NÃO pelo git):**
- `Deploy/instalacao`: Node 20→24; +LibreOffice; **removido lower_case_table_names** (travava MySQL 8); **removido o rename
  camelCase**; 46→58 tabelas; bloco S3/AWS no .env + campos AWS no 1-configurar.sh; **GITHUB_TOKEN** + clone autenticado
  (repo é PRIVADO) + GIT_TERMINAL_PROMPT=0; nginx `client_max_body_size 25m`; sem auto-feriados; tudo LF.
- `Deploy/atualizacao`: 3-VerificarSistema confere tabelas em minúsculo;
  1-AtualizarSistema com `--max-old-space-size=400` no build + GIT_TERMINAL_PROMPT; tudo LF.
  (28/06: 4-ReimportarBanco .sh+.txt REMOVIDOS — eram o "substituir o banco inteiro", incompatível com a rotina incremental nova.)

**Imprevistos do deploy (checklist no guia):** abrir porta **443** no firewall do Lightsail (IPv4+IPv6); DNS = **registro A**
(NÃO redirecionamento) apontando o subdomínio pro IP, esperar propagar; WinSCP usa **.ppk** (converte do .pem); **concluir o
setup** salvando o Escritório libera o login dos demais usuários; e-mail (Gmail) precisa de senha de App ATUAL.

**Pendente:** rodar `1-AtualizarSistema.sh` no servidor novo p/ deployar a mudança do MENU (já está no GitHub) + consertar o e-mail.

---

## ⭐ FLUXO REAL DE DEPLOY DO USUÁRIO (confirmado 12/06/2026 — é assim que ele faz SEMPRE)

1. **Banco (NOVA ROTINA desde 28/06/2026 — incremental, NÃO destrutiva):** NÃO se reimporta mais o banco
   inteiro na AWS (apagaria os dados reais). Cada alteração de ESTRUTURA é aplicada MANUALMENTE no HeidiSQL —
   LOCAL primeiro, depois AWS — como um "bloco" (o ALTER/CREATE + um INSERT registrando a mudança na tabela
   `controle_versao_banco`). Comparar essa tabela no local vs AWS mostra o que falta. Ver seção "Atualização
   do Banco em PRODUÇÃO" abaixo.
2. **Código:** roda `salvar_pc_casa_no_Git.bat` (ou `salvar_pc_escrit_no_Git.bat`) →
   git add -A + commit "DDMMYY-HHMM — descrição" + push origin main
3. **Servidor:** via SSH roda `bash /home/ubuntu/1-AtualizarSistema.sh`
   (em `Deploy/atualizacao/`) → git fetch + reset --hard origin/main → npm install backend
   → build frontend → pm2 restart

O Git é o CANAL DE DEPLOY do código. WinSCP é só para casos pontuais (ex: editar .env).
Claude nunca executa nenhum desses passos — só o usuário. SSH de Claude = leitura/diagnóstico.

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

## Servidor — Caminhos e PM2 (descobertos 12/06/2026)

### Caminho correto no servidor
```
/var/www/advocacia/           ← raiz do projeto
/var/www/advocacia/backend/   ← backend Node.js
/var/www/advocacia/backend/.env  ← variáveis de ambiente
/var/www/advocacia/frontend/  ← React (build estático)
```
⚠️ NÃO existe `/home/ubuntu/sistema-advocacia/` — é o caminho ERRADO

### Encontrar o .env se perdido
```bash
find / -name ".env" -path "*/backend/*" 2>/dev/null
```

### PM2 — Nome do processo
```
advocacia-backend
```
⚠️ NÃO é `backend` — o nome correto é `advocacia-backend`

### Comandos PM2 essenciais
```bash
pm2 list                                    # ver todos os processos
pm2 restart advocacia-backend --update-env  # SEMPRE usar --update-env após editar .env
pm2 logs advocacia-backend                  # ver logs em tempo real
pm2 status                                  # status resumido
```

### ⚠️ Flag --update-env é obrigatório
Ao editar o `.env` no servidor, o PM2 **não recarrega as variáveis automaticamente**.
Sem `--update-env`, o processo reinicia mas mantém os valores antigos em memória.

## Acesso ao Servidor — WinSCP (SFTP)

### Arquivo de documentação local
`C:\Users\Claudio\Downloads\ProjetoAdvClaude\WINSCP_ACESSO_SERVIDOR.txt`

Contém passo a passo completo para outro computador:
- Download e instalação do WinSCP
- Configuração da conexão (SFTP, porta 22, IP `98.85.19.2`)
- Importar chave `.pem` → WinSCP converte para `.ppk` automaticamente
- Navegar até `/var/www/advocacia/backend/`
- Editar o `.env`
- Reiniciar o PM2 com `--update-env`

### Configuração básica WinSCP
- Protocolo: SFTP
- Servidor: `98.85.19.2`
- Porta: 22
- Usuário: `ubuntu`
- Autenticação: chave `.pem` (WinSCP converte automaticamente para `.ppk`)

### Alternativas SFTP gratuitas
- **WinSCP** (recomendado) — mais fácil para iniciantes
- **FileZilla** — multiplataforma, também gratuito

## Versionamento

- Formato de commit obrigatório: `DDMMYY-HHMM — descrição curta`
- Sem migrations (regra MANTIDA — nunca criar arquivos de migração) — schema via HeidiSQL → exportar `estrutura_banco.sql` → commit

## Atualização do Banco em PRODUÇÃO — incremental, SEM perder dados (NOVO 28/06/2026)

- ❌ NUNCA reimportar o dump completo numa produção com dados reais: o `estrutura_banco.sql` começa com `DROP DATABASE` → apagaria tudo. (Por isso o `4-ReimportarBanco` foi removido.)
- ✅ Cada alteração de ESTRUTURA é aplicada MANUALMENTE no HeidiSQL: LOCAL primeiro, depois AWS.
- Tabela de controle **`controle_versao_banco`** (`numero` PK, `descricao`, `sql_aplicado` MEDIUMTEXT, `aplicado_em` DATETIME): registra cada mudança; existe nos 2 bancos; comparar mostra o que falta aplicar na AWS.
- SEM pasta/arquivos de migração (regra do usuário reafirmada 28/06). O controle é só essa tabela + aplicação manual.
- Claude entrega cada mudança como um "bloco" = o ALTER/CREATE + o INSERT na tabela de controle; o usuário roda. Claude NUNCA executa no banco.
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
- `Deploy/atualizacao/4-ReimportarBanco.sh` e `4-ReimportarBanco.txt` — removidos 28/06 (reimport destrutivo do banco; substituídos pela rotina incremental + tabela `controle_versao_banco`)
