---
name: pendencias-proxima-sessao
description: "HANDOFF — LER PRIMEIRO. TOPO: SESSÃO 25-26/06 — DEPLOY DO ZERO num servidor NOVO (Ubuntu 24, IP 100.57.24.46, conta AWS EdnaADV 905418183179; domínio sistema.antonio.adv.br c/ HTTPS). Imprevistos resolvidos: firewall 443, DNS=registro A (não redirect), .pem→.ppk, CRLF→LF, token p/ repo privado, setup concluído ao salvar Escritório, e-mail Gmail PENDENTE. Scripts Deploy CORRIGIDOS (Node 24, LibreOffice, SEM rename camelCase, token, nginx 25m). MENU lateral novo (Layout.css: tela atual +40%+fundo; hover move o destaque) JÁ no GitHub (bf385e6) — FALTA rodar 1-AtualizarSistema no servidor novo. Guia: Deploy/GUIA-DEPLOY-DO-ZERO.txt. Resumo: 'resumo do dia 260626 - deploy AWS do zero.txt'. Antes — SESSÃO 23/06 — AUDITORIA COMPLETA + 10 MELHORIAS: (1) trava senha do super; (2) índices por pessoa [SQL produção]; (3) pool 10→15 + aviso de sobrecarga p/ admin; (4) bug exclusão de testemunha; (5) sessão reconfere nivel/ativo no banco a cada request; (6) travas UNIQUE CPF/login [SQL produção]; (7) auditoria dentro da transação (7 pts); (8) responsividade VERIFICADA (já estava boa, nada mudado); (9) painel mais leve; (10) telas por perfil. 2 SQL p/ rodar na PRODUÇÃO (índices + UNIQUE). Item D (JWT_SECRET/SUPER_SENHA no .env prod) PULADO pelo usuário. Resumo: resumo do dia 230626-1518.txt. Antes — SESSÃO 22/06 (NOITE) — exclusão de prazo robusta (trata FK filhas em transação) + ModalConfirmar passou a MOSTRAR o erro (conserta silêncio global) + FEATURE 'Limpar dados de teste' SÓ p/ superadmin (nivel 0, aba Manutenção); superadmin DEIXADO COMO ESTÁ (não removido do banco). Resumo: backups/RESUMO_SESSAO_22-06-2026-NOITE.txt. Antes (22/06 DIA): REGRA ABSOLUTA: tabelas SEMPRE minúsculas (banco E código); corrigido bug de produção tblPasta (148 subs camelCase->minúsculo no backend). AASP URL na tela (saiu do código/.env). Bucket S3 -dev + IAM próprio; .env local apontado p/ -dev. Limpeza .env/.env.example. Publicações: realce sem acento, filtro de data, dedup por numeroPublicacao + confirmação re-rodar + coluna Nº Publ. + pintura duplicadas, rodapé Exibindo X–Y de Z, seletor Exibir (Todas/Direcionadas a mim), fonte modal 14px. PENDENTE: commit+push+RE-DEPLOY (deploy de hoje NÃO tinha o fix de minúsculas) + SQL pendente na produção. Claude NÃO acessa o servidor. Resumo completo: backups/RESUMO_SESSAO_22-06-2026.txt. Abaixo: 21/06, 20/06, 17/06..."
metadata: 
  node_type: memory
  type: project
  originSessionId: a17aec30-7d20-496a-81a0-792eca6b27e8
---

# 🟢 SESSÃO 25-26/06/2026 — DEPLOY DO ZERO NUM SERVIDOR NOVO (Ubuntu 24) + MENU — LER PRIMEIRO

Sessão OPERACIONAL: o **USUÁRIO** fez um deploy REAL do zero num servidor NOVO; o Claude orientou passo a passo,
resolveu os imprevistos e DEPOIS corrigiu os scripts. Resumo completo em **`resumo do dia 260626 - deploy AWS do zero.txt`**
(raiz). SEM git nesta finalização. Memória da pasta do projeto atualizada COM autorização. Claude NÃO acessou o servidor.

## SERVIDOR NOVO (passou a ser a produção do domínio)
- Lightsail **AntonioADV**, **Ubuntu 24 LTS**, us-east-1. Conta AWS do servidor: **EdnaADV (905418183179)**.
- **IP público: 100.57.24.46**. Domínio **sistema.antonio.adv.br** agora aponta pra ele (HTTPS Let's Encrypt ok, renova sozinho).
- Antigo: 98.85.19.2 (Ubuntu 22, conta Antonio 264022422777) — o domínio NÃO aponta mais pra ele.
- Instalação **"vazio/do zero"** (estrutura + referência + super + admin), via Deploy/instalacao (versão CORRIGIDA).

## IMPREVISTOS RESOLVIDOS (viraram checklist no guia)
1. **Porta 443** fechada no firewall do Lightsail → HTTPS dava timeout. Abrir HTTPS(443) no IPv4 E IPv6.
2. **DNS**: estava como **redirecionamento** na Locaweb (caía em 186.202.157.79) → trocar por **registro A** `sistema`→100.57.24.46. Esperar propagar.
3. **WinSCP**: converter o **.pem → .ppk** (o próprio WinSCP converte).
4. **CRLF → LF**: todos os scripts vinham com final de linha do Windows (quebra no Linux). Convertidos.
5. **Repo privado**: precisa de **GITHUB_TOKEN** (fine-grained, sem expiração, Contents:Read-only) no 1-configurar.sh.
6. **estrutura_banco.sql** = SÓ estrutura (58 tabelas, sem dados) p/ instalação vazia.
7. **Login bloqueado** até concluir o setup: super loga → salva o **Escritório** (setup_concluido=1) → aí os outros logam.
8. **E-mail "esqueci a senha"** falha (senha de App do Gmail desatualizada) → admin define senha direto; conserto do e-mail PENDENTE.

## SCRIPTS DE DEPLOY CORRIGIDOS (Deploy/ fica só local — vai por WinSCP, NÃO pelo git)
- **instalacao**: Node 20→**24**; +**LibreOffice**; **removido lower_case_table_names** (travava o MySQL 8 + contra a regra);
  **removido o rename camelCase**; 46→58 tabelas; **bloco S3/AWS no .env** + campos AWS no 1-configurar.sh; **GITHUB_TOKEN** +
  clone autenticado; nginx **client_max_body_size 25m**; sem auto-feriados; tudo **LF**.
- **atualizacao**: **4-ReimportarBanco** sem o rename (só reinicia); **3-VerificarSistema** confere tabelas em **minúsculo**;
  **1-AtualizarSistema** com limite de memória no build (`--max-old-space-size=400`) + GIT_TERMINAL_PROMPT; 2-AtualizarBanco
  mantido (⚠️ a transação NÃO cobre ALTER/CREATE TABLE); tudo LF. (Usuário apagou 1 script que não usava.)

## S3 cross-account
Lightsail na conta EdnaADV; S3 na conta Antonio. Buckets **dev** (modelos-antonio-adv-dev) + **produção**, cada um com IAM próprio
+ policy de 4 ações restrita ao bucket. .env local→dev, .env servidor→produção. Código NÃO muda (lê do .env). Ver [[documentos-modelos]].

## MENU lateral novo (ÚNICA alteração de código) — `Layout.css`
Efeito "crescem juntos": o item da **tela atual** fica **+40%** maior + **fundo azul destacado**; ao passar o mouse, o destaque vai
pro item sob o cursor (o atual volta ao normal); só UM destacado por vez. Só CSS, build Vite OK. **JÁ COMMITADO+PUSHADO (local=GitHub `bf385e6`).**
Ícones continuam **emoji** (futuro opcional: trocar por lib de ícones — balança, martelo, microscópio...).

## PENDÊNCIAS (continuar daqui)
- [ ] **Deployar o MENU no servidor novo**: está no GitHub, mas o servidor foi instalado ANTES dele. Copiar `1-AtualizarSistema.sh`
  (corrigido) via WinSCP e rodar no servidor (`bash /home/ubuntu/1-AtualizarSistema.sh`). É só CSS — NÃO precisa mexer no banco.
- [ ] **Consertar o e-mail**: nova senha de App do Gmail → `SMTP_PASS` no .env do servidor → restart do backend.
- [ ] (Opcional) trocar os emoji do menu por ícones de biblioteca; decidir o destino do servidor antigo (98.85.19.2).
- OBS.: as pendências de SQL de PRODUÇÃO das sessões anteriores (UNIQUE uq_login/uq_pf_cpf, índices por pessoa) ficaram
  RESOLVIDAS no servidor novo — a instalação do zero já usou o `estrutura_banco.sql` atual (que já tem tudo). Guia: **Deploy/GUIA-DEPLOY-DO-ZERO.txt**.

---

# 🟢 SESSÃO 23/06/2026 — AUDITORIA COMPLETA + 9 MELHORIAS (segurança, performance, robustez) — LER PRIMEIRO

Sessão de **auditoria do sistema inteiro** a pedido do usuário ("quero um sistema redondo e perfeito"). Claude analisou
infra, schema (51 tabelas via `bancoDeDados.sql`), controllers críticos e frontend; listou os achados **por prioridade**
e foram resolvidos **um a um, com autorização a cada passo**. Tudo LOCAL, validado (node --check backend + build Vite OK).
**SEM git. SEM acesso ao servidor.** Resumo detalhado em **`resumo do dia 230626-1518.txt`** (raiz do projeto).

## ⚠️ SQL que o usuário JÁ RODOU no banco LOCAL — FALTA RODAR NA PRODUÇÃO (no deploy):
```sql
-- (Item 2) Índices p/ acelerar busca por pessoa (coluna "Qtde Proc" + checagem de vínculos na exclusão)
CREATE INDEX idx_titautor_pessoa ON tbltituloprocautor (pessoa_id, tipo_pessoa, proc_id);
CREATE INDEX idx_titreu_pessoa   ON tbltituloprocreu   (pessoa_id, tipo_pessoa, proc_id);

-- (Item 6) Travas de unicidade — EXCEÇÃO à regra "sem UNIQUE", APROVADA pelo usuário (trocam o índice comum por UNIQUE)
ALTER TABLE pessoas_fisicas DROP INDEX idx_pf_cpf, ADD UNIQUE KEY uq_pf_cpf (cpf);
ALTER TABLE usuarios        DROP INDEX idx_login,  ADD UNIQUE KEY uq_login (login);
-- Conferir duplicados ANTES na produção (devem vir VAZIOS):
--   SELECT cpf,COUNT(*) FROM pessoas_fisicas WHERE cpf IS NOT NULL GROUP BY cpf HAVING COUNT(*)>1;
--   SELECT login,COUNT(*) FROM usuarios GROUP BY login HAVING COUNT(*)>1;
```

## OS 10 ITENS RESOLVIDOS (na ordem em que foram feitos):

**1) SEGURANÇA — trava de senha do superusuário** (`configuracaoController.js` → `redefinirSenhaAdmin`).
Faltava a trava que `atualizarUsuario`/`excluirUsuario` já tinham. Um admin comum podia redefinir a senha do super
(id baixo, login padrão 'superadmin' previsível) e logar como ele. Adicionado: se alvo `nivel===0` → 403
"Não é possível redefinir a senha do superusuário". Fecha o ÚLTIMO vetor de takeover do super. (As listagens de
usuário já o escondem — verificado: `nivel > 0` / `tipo='advogado'` em todas as listas; super é tipo='administrador'.)

**2) PERFORMANCE — índices por pessoa (SQL acima).** `tbltituloprocautor`/`tbltituloprocreu` só tinham índice em
`proc_id`/`criado_por`. A coluna "Qtde Proc" da tela de Pessoas e a checagem de vínculos faziam full-scan por linha.
Índice composto `(pessoa_id, tipo_pessoa, proc_id)`. Tabelas pequenas hoje; crítico com 20k clientes. SÓ banco.

**3) CAPACIDADE — pool 10→15 + aviso de sobrecarga.** `config/database.js`: `connectionLimit` 10 → **15**
(servidor é 512MB/2vCPU — número conservador). O dashboard dispara 11 queries em paralelo → 10 saturava o pool.
+ **AVISO DE SOBRECARGA:** o pool emite `enqueue` ao saturar; `database.js` guarda o timestamp e exporta
`sistemaSobrecarregado()`; `notificacoesController.contagem` passou a devolver o campo `sobrecarga`; `Layout.js`
mostra um aviso amarelo **só p/ admin** no topo (pega carona na checagem do sino que já roda a cada 2min — sem
tráfego novo, sem banco). NOTA explicada ao usuário: "conexões" ≠ "usuários logados"; o limite é ajuste técnico no
código (mudar exige reiniciar), não vai na tela de Configurações.

**4) BUG — exclusão de pessoa física que é testemunha** (`pessoasController.js` → `excluirFisica`).
Faltava checar o vínculo `audiencia_testemunhas` (FK `ON DELETE RESTRICT`): excluir uma testemunha dava erro 500
genérico. Adicionada a 5ª checagem em paralelo + mensagem clara "X audiência(s) como testemunha". (PJ não é afetada
— testemunha é sempre física.)

**5) SEGURANÇA — sessão reconfere o usuário no banco** (`middleware/auth.js` → `autenticar`).
O token (8h) guardava o `nivel` do login. Rebaixar/desativar/excluir um usuário só valia após expirar. Agora
`autenticar` é async e reconfere a cada request: `SELECT nivel, tipo, ver_todos_processos FROM usuarios WHERE id=? AND
ativo=1` — sem linha (desativado/excluído) → desloga ("Sua sessão não é mais válida"); senão sobrepõe nivel/tipo/
ver_todos_processos do token pelos do banco. Fecha 2 brechas (admin rebaixado e funcionário demitido com acesso por
horas). Custo: 1 query PK por request (irrisório). **Ponto central — testar que login normal segue funcionando.**

**6) INTEGRIDADE — duplicados CPF/login (SQL acima + código).** Sem UNIQUE, dois cadastros simultâneos do mesmo
CPF/login passavam. Decisão do usuário: **TRAVAR no banco** (exceção aprovada à regra "sem UNIQUE"): `uq_pf_cpf`,
`uq_login`. No código, tratamento amigável do erro `ER_DUP_ENTRY` em `criarFisica`, `atualizarFisica` (editar CPF p/
um já existente), `criarUsuario` e `criarPrimeiroAdmin` ("CPF já cadastrado"/"Login já está em uso", não erro 500).

**7) CONSISTÊNCIA — auditoria dentro da transação (7 pontos).** Gravavam a auditoria DEPOIS do commit (modo tolerante):
`pessoasController` (criarFisica, criarJuridica), `processosController` (renumerarPasta, criarProcesso, atualizarProcesso),
`audienciasController` (criar, registrarAta). Movido p/ ANTES do commit com `conn` (tudo-ou-nada), igual financeiro/
tarefas/perícias já faziam. Invisível ao usuário; só consistência.

**8) RESPONSIVIDADE — VERIFICADA, JÁ ESTAVA BOA (NADA mudado).** Varredura: `Layout.css` (importado no `index.js` =
CSS global) tem base responsiva completa (menu off-canvas, grids→1 coluna, modais full-screen, abas com scroll,
`.tabela-wrapper` com overflow-x, `@media máx 768px`); 16/17 telas usam essa base (só Agenda não, e a "tabela" dela é
um quadro de detalhes dentro de modal — sem problema); NENHUMA largura fixa que vaze; toolbars já usam `flexWrap` +
`maxWidth`. Claude reconheceu que a avaliação inicial (pessimista) estava errada e **NÃO reescreveu telas que já
funcionam**. Manutenção pontual se algo aparecer ruim no celular no uso real.

**9) PERFORMANCE — painel mais leve** (`dashboardController.js`). A query "processos sem movimentação" calculava
`MAX(andamento.data)` por subconsulta correlacionada **3x por linha**. Reescrita com `LEFT JOIN (SELECT processo_id,
MAX(data) ... GROUP BY processo_id)` — calcula 1x por processo. Mesmo resultado, bem mais leve quando a base crescer.
SÓ código.

**10) SEGURANÇA/UX — telas por perfil** (`App.js`). `RotaProtegida` só checava login. Agora aceita props
`modulo`/`apenasAdmin` (espelham o menu lateral): usuário sem permissão que digita a URL é mandado p/ `/dashboard`.
O backend continua sendo o guardião real dos dados; isto é defesa em profundidade na navegação.

## NÃO FEITO (decisão do usuário):
- **Item D — JWT_SECRET e SUPER_SENHA fortes no `.env` de PRODUÇÃO:** PULADO (tarefa manual do usuário no servidor).
- **Cache do dashboard:** não feito (a otimização da query já resolveu; cache traria dado atrasado/complexidade).

## PENDÊNCIAS p/ o usuário (deploy desta sessão):
- Rodar os 2 blocos SQL acima na PRODUÇÃO (índices + travas CPF/login).
- Commit + push + deploy quando quiser (Claude não mexe no git).
- Trocar `JWT_SECRET` / `SUPER_SENHA` no `.env` do servidor (Item D).
- + as pendências antigas (22/06 e antes) que continuam valendo (ver abaixo).

## REGRAS NOVAS desta sessão (já gravadas em [[feedback-codigo]]):
- **Responsividade é REGRA GERAL** (toda tela, todo dispositivo) — não item pontual.
- **"Banco sem regra de negócio" TEM EXCEÇÕES** que só o usuário decide (consultar ANTES; Claude nunca remove
  UNIQUE/ENUM sozinho). Exceções aprovadas: ENUM `tipo_pessoa` (autor/réu), UNIQUE `uq_pf_cpf`/`uq_login`/`numPasta`/
  `reset_tokens.token`.
- **NÃO enviar trechos de código nas respostas ao usuário** (ele é leigo; polui a leitura) — explicar em português simples.

---

# 🟢 SESSÃO 22/06/2026 (CONTINUAÇÃO / NOITE) — exclusão de prazo + ModalConfirmar + "Limpar dados de teste"

Continuação da MESMA data, à noite. Tudo LOCAL, validado (node --check backend + build Vite OK). SEM SQL.
SEM git. SEM acesso ao servidor. Resumo detalhado em **`backups/RESUMO_SESSAO_22-06-2026-NOITE.txt`**.
Esta sessão começou analisando a pasta local + memórias e o RESUMO da manhã; depois corrigiu um bug e
criou uma feature, ambos autorizados pelo usuário passo a passo.

## 1) BUG (do print do usuário): "não consigo excluir um prazo e não aparece o motivo" — DUAS causas
- **Causa 1 (falha real):** `prazos_processo` tem 3 tabelas-filhas SEM `ON DELETE CASCADE` no banco:
  `auditoria_prazo` (histórico), `notificacoes` (`prazo_id`) e `tarefas` (`prazo_id`). O `excluir` fazia um
  `DELETE FROM prazos_processo` direto → quando o prazo tinha histórico/notificação, a FK barrava → 500.
  Por isso o prazo "Pendente" com histórico não excluía.
  **Fix (Parte A — `controllers/prazosController.js`, função `excluir`):** reescrito em TRANSAÇÃO
  (`pool.getConnection` + begin/commit/rollback). Ordem: (1) `UPDATE tarefas SET prazo_id=NULL` — DESVINCULA a
  tarefa (NÃO apaga; tarefa tem vida própria); (2) `DELETE notificacoes`; (3) `DELETE auditoria_prazo`;
  (4) `DELETE prazos_processo`; (5) `auditoria.registrar(...,conn)` na mesma transação. As regras antigas
  (não excluir concluído/cancelado; bloqueio de "fazendo" por outro) ficaram ANTES da transação. **SEM SQL**
  (não usei cascade no banco — decisão de fazer manual no código, do estilo do usuário).
- **Causa 2 (silêncio):** `components/ui/ModalConfirmar.js` tinha `try/finally` SEM `catch` → o erro do `acao()`
  era engolido, o modal fechava e NENHUM toast aparecia. **Fix (Parte B):** agora
  `try { await acao(); onCancelar(); } catch (err) { toast.error(err?.response?.data?.mensagem || fallback) }`
  — mostra o MOTIVO (mensagem do backend) e MANTÉM o modal aberto p/ retentar. Importou `toast` de 'react-toastify'.
  É componente COMPARTILHADO: conserta o silêncio em TODAS as confirmações do sistema; quem já trata o próprio
  erro dentro de `acao` (sem relançar) NÃO cai no catch → sem toast duplicado.

## 2) FEATURE NOVA — "Limpar dados de teste" (zerar massa de teste) SÓ p/ SUPERADMIN (nivel 0). SEM SQL.
Pedido do usuário (vai apagar muitos testes). Decidido: exclusão 1-a-1 pela tela (resolvida pela Parte A) +
um "limpa-tudo" restrito ao SUPERADMIN OCULTO. Gating: middleware `apenasSuper` (`middleware/auth.js`, `nivel!==0`).
- **NOVO `controllers/manutencaoController.js` → `limparDadosTeste`:** numa transação com `SET FOREIGN_KEY_CHECKS=0`
  (religado a 1 no `finally`), `DELETE` em **38 tabelas** de massa de teste; commit; e SÓ DEPOIS registra a
  auditoria (`'sistema'`/`'limpar-dados-teste'`) — porque `logs_auditoria` está entre as apagadas, então o registro
  nasce já no banco zerado (decisão do usuário). 2ª trava: backend exige `body.confirmacao === 'LIMPAR'`.
  (Nota: `logs_auditoria.usuario_id` é NULLABLE e SEM FK — confirmado no backup — então o registro pós-limpeza não quebra.)
- **APAGA (38):** pessoas_fisicas, pessoas_juridicas, emails_pf, emails_pj, telefones_pf, telefones_pj,
  historico_atendimento, tblpasta, tblproc, tbltituloprocautor, tbltituloprocreu, processo_perito,
  andamento_processual, prazos_processo, auditoria_prazo, tarefas, agenda_compromisso, audiencia, ata_audiencia,
  audiencia_testemunhas, auditoria_audiencia, pericia, auditoria_pericia, conta_corrente, acordo, acordo_parcela,
  auditoria_parcela, auditoria_conta_corrente, publicacoes, publicacao_usuario, log_publicacoes, notificacoes,
  logs_auditoria, log_comunicacoes, log_emails, log_documentos_gerados, reset_tokens, **advogados_freela**
  (o usuário decidiu tratar como teste).
- **MANTÉM (20):** tipo_audiencia, tipo_pericia, tipo_prazo, prazo_subtipo, estado_civil, genero, profissao,
  forma_pagamento, tblvara, tblforum, tblstatusproc, tbltipoproc, tblinstanciaproc, calendario, feriados,
  configuracoes_escritorio, configuracoes_integracoes, usuarios, permissoes, **modelo_documento**
  (modelos .docx reais apontam p/ o S3 — preservados; o usuário confirmou MANTER).
- **Rota:** `POST /manutencao/limpar-dados-teste` (`autenticar` + `apenasSuper`) em `routes/index.js`
  (importado `apenasSuper` e `manutencaoCtrl`).
- **Frontend:** aba **"Manutenção"** em `pages/Configuracoes/Configuracoes.js` visível só se `ehSuper` (do AuthContext,
  `nivel===0`); componente `TabManutencao` = "zona de perigo" que exige digitar **`LIMPAR`** p/ liberar o botão +
  passa pelo `ModalConfirmar`. `manutencaoAPI.limparDadosTeste` em `services/api.js`.

## 3) ANÁLISE (sem código) — "dá p/ NÃO colocar o superadmin no banco?"
- Diagnóstico: o super é só uma linha em `usuarios` com `nivel=0`; "invisível" só na aplicação (queries filtram
  `nivel>0`). Login normal (bcrypt na tabela). Seed `database/seeds/002_superusuario.js` cria a partir de
  `SUPER_LOGIN`/`SUPER_SENHA` do `.env` (default login `superadmin`).
- Conclusão honesta dada ao usuário: tirar do banco é POSSÍVEL, mas há **66 FKs** apontando p/ `usuarios` (criado_por
  etc.) → o super, ao escrever, quebraria integridade; e esconder a linha NÃO protege (quem tem acesso a banco/código
  cria outro `nivel=0`). Recomendei (Opção A) autenticar o super pelo `.env` deixando a senha do banco "morta" —
  fecha o furo do DBA trocar o hash. **DECISÃO DO USUÁRIO: NÃO fazer nada — DEIXAR COMO ESTÁ.** Não reabrir sem ele pedir.

## Arquivos desta sessão (NOITE) — todos LOCAIS, validados
- Backend: `controllers/prazosController.js` (excluir transacional), **NOVO** `controllers/manutencaoController.js`,
  `routes/index.js` (import apenasSuper + manutencaoCtrl + rota /manutencao/limpar-dados-teste).
- Frontend: `components/ui/ModalConfirmar.js` (catch + toast), `pages/Configuracoes/Configuracoes.js`
  (aba Manutenção + TabManutencao + ehSuper), `services/api.js` (manutencaoAPI).
- SEM SQL. SEM git. Nada deployado.

## ✅ Pendências (NOITE) — além das do bloco 22/06 (dia), que continuam valendo
- [ ] Testar: excluir um prazo com histórico (deve funcionar) e ver o toast de erro quando algo falhar.
- [ ] Testar a aba Manutenção logado como SUPERADMIN (digitar LIMPAR → confirmar). Conferir que some p/ admin normal.
- [ ] Levar estes arquivos no próximo deploy (commit+push do usuário). NENHUM SQL novo aqui.

---

# 🔴 SESSÃO 22/06/2026 — LER (correção crítica de produção + AASP/S3/Publicações)

Tudo LOCAL, validado (node --check + build Vite). SEM git (a pedido). Resumo COMPLETO e detalhado em
**`backups/RESUMO_SESSAO_22-06-2026.txt`** — ler junto com este bloco.

## ⚠️⚠️ REGRA NOVA ABSOLUTA — TABELAS SEMPRE EM MINÚSCULAS (banco E código)
Detalhe completo em [[feedback-codigo]]. **TODOS os nomes de tabela do banco devem ser MINÚSCULOS, no
banco E no código, para sempre.** Windows ignora caixa; **Linux (produção AWS) é SENSÍVEL**. Hoje a produção
quebrou com `Error: Table 'sistema_advocacia.tblPasta' doesn't exist` — banco tinha `tblpasta`, código pedia
`tblPasta` (camelCase), e o código estava INCONSISTENTE (uns minúsculo, outros camelCase).
**CORREÇÃO FEITA:** 148 substituições em 10 arquivos do backend (camelCase->minúsculo): `tblpasta, tblproc,
tbltipoproc, tblstatusproc, tblinstanciaproc, tblforum, tblvara, tbltituloprocautor, tbltituloprocreu`.
Verificado: grep por `tbl` com maiúscula no backend = 0. node --check OK. Foi RENAME literal (sem gambiarra/fallback).
Banco já estava minúsculo (confirmado no backup) — NÃO precisou mexer no banco.

## 🆕 O que foi feito hoje (22/06) — tudo LOCAL
1. **AASP — URL na tela.** Removida a constante fixa do código; `aaspService.buscarIntimacoes(chave,data,url)`;
   `publicacoesController.lerConfigAasp()` retorna url; tela Configurações->Integrações com campo "URL da API AASP"
   (pré-preenchido com a oficial). SEM SQL (url entra no JSON `configuracoes_integracoes.configuracoes.aasp.url`).
   Só URL+chave editáveis; `diferencial` segue fixo=false. AÇÃO: salvar a URL na tela da produção após deploy.
2. **S3 bucket de TESTE.** Criado `modelos-antonio-adv-dev` + usuário IAM `modelos-antonio-adv-dev` (policy
   `AcessoModelosAntonioDev`, só esse bucket). `.env` LOCAL aponta p/ `-dev`. Produção segue `modelos-antonio-adv`
   + usuário `modelos-s3-antonio-adv` (no .env do servidor). Código já lê tudo do .env — nenhuma mudança de código.
3. **Limpeza .env e .env.example.** Removido lixo não lido pelo código (EMAIL_PROVIDER, ZAPI_*, AASP_API_URL/
   AASP_TOKEN, S3_BUCKET_NAME, BACKUP_INTERVAL_HOURS) e DUPLICIDADES de AWS_*. LIBREOFFICE_PATH só no .env.example
   (autodetect acha o soffice; não precisa preencher). MANTIDO o que está em uso.
4. **Publicações — realce de busca sem ACENTO.** Novo `dobrarTexto()` + `realcarTexto()` reescrito com mapa de
   posições (pinta "audiência" ao buscar "audiencia" e vice-versa). [[integracoes-publicacoes]].
5. **Publicações — filtro de DATA da pesquisa** (`filtros.data`; checkbox "Todas as datas", padrão marcado).
6. **Publicações — fonte do modal 13px -> 14px** (corpo).
7. **Publicações — importação por numeroPublicacao** (traz TODAS; dedup por numeroPublicacao único do dia, fallback
   hash quando nulo; re-rodar = incremental + ModalConfirmar "dia já importado"). Coluna **"Nº Publ."**. **Pintura de
   duplicadas** (texto idêntico no MESMO dia, todas menos a mais antiga; campo `duplicada` no listar) + legenda.
8. **Publicações — rodapé "Exibindo X–Y de Z"** (removido o total do topo) + seletor **"Exibir" (Todas /
   Direcionadas a mim)** (backend `listar` param `escopo`). SEM SQL.
9. **Tabelas minúsculas no código** (item crítico acima).

## 🔧 Arquivos tocados hoje (todos LOCAIS)
Backend: `services/aaspService.js`, `controllers/publicacoesController.js`, `.env`, `.env.example` +
os 10 do rename de tabelas (processosController, audienciasController, dashboardController, pessoasController,
comunicadoService, periciasController, prazosController, tarefasController, alertasService, notificacoesController).
Frontend: `pages/Configuracoes/Configuracoes.js`, `pages/Publicacoes/Publicacoes.js`.

## ✅ PRÓXIMOS PASSOS / PENDÊNCIAS (22/06)
- [ ] **COMMIT + PUSH** das mudanças de hoje (quando o usuário quiser). `.env` NÃO vai pro git.
- [ ] **RE-DEPLOY na produção** com o fix de minúsculas — ⚠️ o deploy que rodou hoje (commit 2ed0e61, 14:38)
      NÃO continha esse fix. Sem re-deploy, a produção segue quebrada (tblPasta).
- [ ] **SQL pendente na PRODUÇÃO** (rodar ANTES do código): publicacoes+publicacao_usuario (refeito 21/06);
      logs_auditoria.acao VARCHAR(30); collation 0900_ai_ci; forma_pagamento; acordo.tipo; agenda_compromisso;
      colunas de repasse em acordo_parcela; idx_parcela_vencimento. (SQL consolidado nos blocos 20/06 e 21/06 abaixo.)
- [ ] **Bucket produção:** manter SÓ os 3 modelos referenciados em `modelo_documento`
      (`modelos/078f30b6...`, `modelos/a248b3b8...`, `modelos/a6b8660a...`) e apagar os órfãos.
- [ ] **AASP:** conferir/salvar a URL na tela de Integrações da produção (após deploy).
- [ ] **Segurança produção:** trocar JWT_SECRET e SUPER_SENHA por valores fortes no .env do servidor.
- [ ] Re-exportar `estrutura_banco.sql` quando o schema da produção estiver alinhado.

## 🚫 REGRA DE TRABALHO REFORÇADA HOJE
**Claude NÃO acessa o servidor — nem para leitura/diagnóstico.** Quem executa qualquer coisa no servidor é
SEMPRE o usuário; Claude só orienta e entrega comandos/SQL prontos. (Atualizar também em [[feedback-codigo]].)

---

# 🔵 SESSÃO 21/06/2026 — análise do banco (estrutura_banco.sql) + 2 ajustes de schema

Sessão de ANÁLISE (sem código). Revisão completa do `estrutura_banco.sql` (58 tabelas). Banco estava correto e rodando;
SQL de 20/06 e reforma S3 já aplicados no LOCAL. Levantei 4 pontos; resultado:
- **Item 1 (FEITO no LOCAL):** `logs_auditoria.acao` era VARCHAR(20) → causava 500 quando a ação passava de 20 chars
  (foi o caso de "desfazer-repasse-parceiro" em 20/06). Rodado: `ALTER TABLE logs_auditoria MODIFY COLUMN acao VARCHAR(30) NOT NULL;`
  ⚠️ FALTA rodar na PRODUÇÃO no deploy.
- **Item 2 (NADA a fazer):** UNIQUE em `tblpasta.numPasta` — investiguei `renumerarPasta` (processosController). A rotina
  trata o conflito (apaga a pasta vazia ANTES de gravar o número), então o UNIQUE nunca é violado. MANTER como está; é até saudável.
- **Item 3 (DECISÃO: NÃO fazer):** `tipo_pessoa` é ENUM em tbltituloprocautor/reu (varchar nas demais). Trocar seria só
  estética/consistência, sem ganho real e ENUM é até um pouco mais eficiente. Usuário decidiu DEIXAR como está.
- **Item 4 (FEITO no LOCAL):** collation mista — `log_emails`, `notificacoes`, `reset_tokens` e o DEFAULT do DATABASE eram
  utf8mb4_unicode_ci. Padronizado p/ utf8mb4_0900_ai_ci (elimina risco latente de "illegal mix of collations" em JOIN de texto futuro).
  Rodado: `ALTER DATABASE sistema_advocacia ...0900_ai_ci` + `CONVERT TO ...0900_ai_ci` nas 3 tabelas. Só banco, sem código.
  ⚠️ FALTA rodar na PRODUÇÃO no deploy.
- ⚠️ Após estes ALTERs, RE-EXPORTAR `estrutura_banco.sql`.
- REGRA NOVA gravada em [[feedback-codigo]]: analisar o código INTEIRO + testar mentalmente antes de apontar erro/sugerir
  (no Item 2 levantei falso risco lendo trecho isolado).

## 🖥️ INFRA AWS atualizada em 21/06 (produção — feito pelo usuário via SSH Lightsail, guiado por Claude)
- **Node atualizado para v24.17.0** na PRODUÇÃO (era v20.20.2 → passou por v22.23.0 → terminou em v24.17.0 a pedido do
  usuário, para PARIDADE com o PC local e suporte LTS mais longo). Via NodeSource: trocar repo node_XX.x
  (`curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -`) + `sudo apt install nodejs -y`. Node é system-wide
  (`/usr/bin/node`), sobrevive ao deploy. PM2 reinicia sozinho pelo needrestart; `advocacia-backend` ONLINE, 0 crash-loop,
  sem erro de Node (nenhum NODE_MODULE_VERSION / Cannot find module) → dependências OK no Node 24.
- **PC LOCAL já estava no Node v24.13.0** (instalado via instalador oficial, usa CMD; sem nvm). NÃO precisou atualizar —
  já estava à frente. RESULTADO: local (24.13.0) e produção (24.17.0) ambos na linha **Node 24 LTS** (paridade).
- LIÇÃO p/ o futuro (explicada ao usuário): Node não "pifa" sozinho, mas nenhuma versão dura ~10 anos — cada LTS recebe
  segurança por ~3 anos; atualizar Node/Ubuntu/deps a cada ~2 anos é manutenção de rotina normal (o processo acima leva minutos).

## 📊 DIAGNÓSTICO DE CAPACIDADE (medido em 21/06 via SSH; upgrade adiado "p/ depois")
- **Instância Lightsail = plano mais básico: 512 MB (416 MiB úteis) / 2 vCPU / ~20 GB.** Tudo numa máquina só (backend + MySQL + nginx).
- ⚠️ **Já usa SWAP em repouso** (free -h: total 416Mi, available ~193Mi, Swap 2Gi com 348Mi em uso, carga ~0). RAM no limite ANTES de qualquer usuário pesado.
- Pool MySQL = **10** (`database.js`); PM2 = **1 processo** (cluster mas 1 instância → usa 1 dos 2 núcleos); PDF (LibreOffice) é serializado e faminto por RAM (~100–200MB/conversão).
- **Gargalo é RAM, não CPU** (CPU em 0% idle; sobra). No Lightsail os planos sobem RAM+CPU+disco juntos (não dá p/ subir só RAM).
- **Estimativa de capacidade na config ATUAL (sem mexer):** com folga ~10 usuários ATIVOS simultâneos / ~15–20 logados em uso normal de escritório (cai bastante se houver geração de PDF/Excel intensa). **200 simultâneos pesados: NÃO suporta.**
- **Recomendação (quando o usuário quiser):** subir RAM — 2 GB resolve o swap; 4 GB dá folga. 4–8 vCPU só p/ cenário extremo ou PDF muito intenso.
  Para 200 reais simultâneos: instância grande (8–16 GB) + idealmente separar o MySQL + ligar PM2 cluster + subir pool p/ ~25–50.
- ⚠️ ALERTA imediato: a geração de PDF (LibreOffice) em produção numa máquina de 416 MiB que já faz swap pode ficar lenta/dar erro de memória — considerar subir o plano ANTES de usar PDF em produção de forma intensa.
- **LibreOffice instalado** na PRODUÇÃO: `sudo apt install libreoffice-writer -y` → LibreOffice 7.3.7.2 em `/usr/bin/soffice`
  (onde pdfConvertService procura; LIBREOFFICE_PATH pode ficar vazio). Prep p/ o deploy do módulo Documentos novo (S3+docx+PDF).
  ⚠️ Ao testar PDF após o deploy, conferir FONTES (sem MS fonts o LibreOffice usa Liberation — métrica compatível com Arial/Times,
  costuma ficar OK; se layout ficar estranho, instalar fonts-liberation ou ttf-mscorefonts-installer).
- ⚠️ Observação importante: nos logs do PM2 da produção aparece `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` (express-rate-limit +
  trust proxy=false atrás do nginx). NÃO é do Node — é o CÓDIGO ANTIGO ainda em produção; o fix de rate limit de 20/06
  (remove limitador global + trust proxy=1 em produção) resolve isso quando for deployado.

---

## 🆕 FEATURES NOVAS construídas em 21/06 (LOCAL; validadas node --check + build Vite; usuário ainda vai testar)

### A) "Documento de partes" (modelos .docx com vários autores × réus) — SEM SQL
- Detalhes completos em [[documentos-modelos]] (seção "DOCUMENTO DE PARTES (multipessoas)").
- Novo destino de modelo 'multipessoas'; no .docx usa regiões `{{#autores}}…{{/autores}}` e `{{#reus}}…{{/reus}}`
  (repetem por pessoa) + variáveis por pessoa + listas `{{#telefones}}`/`{{#emails}}`.
- Geração pelo botão **"Gerar documento de partes" na TELA DE PESSOAS** (modal 2 lados: autor à esquerda, réu à direita).
- ZERO banco. Fora do escopo (depois): amarrar modelo a um réu específico.

### B) Módulo de PUBLICAÇÕES (AASP) REFEITO DO ZERO — PRECISA RODAR SQL
- Detalhes completos em [[integracoes-publicacoes]].
- ⚠️ **RODAR no HeidiSQL (LOCAL primeiro; produção no deploy)** — refaz publicacoes + cria publicacao_usuario:
```sql
DROP TABLE IF EXISTS publicacao_usuario;
DROP TABLE IF EXISTS publicacoes;
CREATE TABLE publicacoes (
  id INT NOT NULL AUTO_INCREMENT, fonte VARCHAR(20) NOT NULL DEFAULT 'aasp', data_publicacao DATE NOT NULL,
  numero_processo VARCHAR(45) DEFAULT NULL, titulo VARCHAR(255) DEFAULT NULL, cabecalho VARCHAR(100) DEFAULT NULL,
  numero_publicacao VARCHAR(30) DEFAULT NULL, numero_arquivo VARCHAR(30) DEFAULT NULL,
  texto MEDIUMTEXT NOT NULL, texto_hash CHAR(64) NOT NULL, escritorio TINYINT(1) NOT NULL DEFAULT 1,
  importada_por INT DEFAULT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  direcionada_por INT DEFAULT NULL, direcionada_em DATETIME DEFAULT NULL,
  tratada TINYINT(1) NOT NULL DEFAULT 0, tratada_por INT DEFAULT NULL, tratada_em DATETIME DEFAULT NULL,
  PRIMARY KEY (id), KEY idx_pub_data (data_publicacao), KEY idx_pub_hash (texto_hash),
  KEY idx_pub_processo (numero_processo), KEY idx_pub_fonte (fonte), KEY importada_por (importada_por),
  KEY direcionada_por (direcionada_por), KEY tratada_por (tratada_por),
  CONSTRAINT fk_pub_importada FOREIGN KEY (importada_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_direcionada FOREIGN KEY (direcionada_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_tratada FOREIGN KEY (tratada_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE publicacao_usuario (
  id INT NOT NULL AUTO_INCREMENT, publicacao_id INT NOT NULL, usuario_id INT NOT NULL,
  PRIMARY KEY (id), KEY idx_pu_pub (publicacao_id), KEY idx_pu_user (usuario_id),
  CONSTRAINT fk_pu_pub FOREIGN KEY (publicacao_id) REFERENCES publicacoes (id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_user FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```
- Integração REAL com a AASP (chave em Configurações → Integrações; corrigido o controller de Integrações
  que não salvava/carregava config). Importar por dia, dedup por hash do texto, direcionar a vários usuários,
  pesquisa por conteúdo, histórico, navegação no modal + realce do termo, cabeçalho de tabela fixo (.tabela-sticky).
- DEPOIS de rodar o SQL: configurar a chave AASP e testar. "Criar prazo/audiência/perícia a partir da publicação" = depois.

---

# 🟠 SESSÃO 20/06/2026 — LER PRIMEIRO (Financeiro 2 tempos + Consulta + Agenda + rate limit)

Tudo LOCAL, validado (node --check + build Vite). SEM git. NENHUMA dependência nova (exceljs e
express-rate-limit já existiam). ✅ **SQL de 20/06 JÁ RODADO no banco LOCAL** (confirmado em 21/06 pelo
estrutura_banco.sql: acordo.tipo, colunas de repasse, idx_parcela_vencimento, forma_pagamento, agenda_compromisso
presentes). ⚠️ FALTA rodar o MESMO SQL na PRODUÇÃO antes do deploy. (SQL CONSOLIDADO abaixo p/ referência da produção.)
✅ Reforma S3 dos modelos TAMBÉM já no banco: `modelo_documento.arquivo_s3_key` NOT NULL, com modelos reais cadastrados.
REGRA NOVA gravada em [[feedback-codigo]]: analisar impacto e ALERTAR antes de executar qualquer pedido.

## ⚠️ SQL CONSOLIDADO 20/06 — rodar TUDO no HeidiSQL (LOCAL; depois PRODUÇÃO antes do deploy)
```sql
-- FINANCEIRO Etapa 1 (formas de pagamento + recebimento)
CREATE TABLE forma_pagamento ( id INT NOT NULL AUTO_INCREMENT, nome VARCHAR(60) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1, PRIMARY KEY (id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE acordo_parcela CHANGE data_pagamento recebido_em DATE NULL;
ALTER TABLE acordo_parcela
  ADD COLUMN recebimento_forma_id INT DEFAULT NULL AFTER recebido_em,
  ADD COLUMN recebimento_identificacao VARCHAR(120) DEFAULT NULL AFTER recebimento_forma_id,
  ADD CONSTRAINT fk_parcela_receb_forma FOREIGN KEY (recebimento_forma_id) REFERENCES forma_pagamento (id) ON DELETE SET NULL;
-- FINANCEIRO Etapa 2 (repasses cliente/parceiro independentes + quem fez)
ALTER TABLE acordo_parcela
  ADD COLUMN repasse_cliente_em DATE DEFAULT NULL, ADD COLUMN repasse_cliente_forma_id INT DEFAULT NULL,
  ADD COLUMN repasse_parceiro_em DATE DEFAULT NULL, ADD COLUMN repasse_parceiro_forma_id INT DEFAULT NULL,
  ADD CONSTRAINT fk_parcela_repcli_forma FOREIGN KEY (repasse_cliente_forma_id) REFERENCES forma_pagamento (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_parcela_reppar_forma FOREIGN KEY (repasse_parceiro_forma_id) REFERENCES forma_pagamento (id) ON DELETE SET NULL;
ALTER TABLE acordo_parcela
  ADD COLUMN repasse_cliente_por INT DEFAULT NULL, ADD COLUMN repasse_parceiro_por INT DEFAULT NULL,
  ADD CONSTRAINT fk_parcela_repcli_por FOREIGN KEY (repasse_cliente_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_parcela_reppar_por FOREIGN KEY (repasse_parceiro_por) REFERENCES usuarios (id) ON DELETE SET NULL;
-- FINANCEIRO Etapa 3 (alvará generalizado) — UM motor só via coluna tipo
ALTER TABLE acordo ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'acordo' AFTER processo_id;
-- CONSULTA (índice recomendado)
ALTER TABLE acordo_parcela ADD INDEX idx_parcela_vencimento (vencimento);
-- AGENDA (compromissos pessoais)
CREATE TABLE agenda_compromisso ( id INT NOT NULL AUTO_INCREMENT, usuario_id INT NOT NULL,
  titulo VARCHAR(150) NOT NULL, descricao TEXT DEFAULT NULL, data DATE NOT NULL, hora_inicio TIME DEFAULT NULL,
  hora_fim TIME DEFAULT NULL, dia_todo TINYINT(1) NOT NULL DEFAULT 0, escritorio TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, alterado_em DATETIME DEFAULT NULL, PRIMARY KEY (id),
  KEY usuario_id (usuario_id), KEY data (data),
  CONSTRAINT fk_agcomp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- (Recibos NÃO precisaram de SQL.) Depois: exportar estrutura → estrutura_banco.sql.
```

## O que foi feito (TUDO testado pelo usuário, exceto onde indicado)
1. **FINANCEIRO — pagamento de 2 TEMPOS.** TEMPO 1 = RECEBIMENTO (réu→escritório): "Receber" da parcela grava
   `recebido_em` + forma (obrigatória) + identificação. TEMPO 2 = REPASSE (escritório→cliente E/OU parceiro),
   datas/formas INDEPENDENTES; é no repasse que se GERA O RECIBO. A **conta corrente NÃO foi tocada** (segue sendo o
   P&L: honorário entra + parceria sai, no recebimento). Repasses/recibo são ADITIVOS. **Não dá p/ desfazer o
   recebimento enquanto houver repasse** (desfazer o repasse primeiro — fica na aba Repasses→Concluídos). Detalhes em [[financeiro]].
   - Etapa 1: `forma_pagamento` (cadastro em Controle→"Formas de pagamento", só admin, soft-delete ativo=0, não bloqueia em uso).
     NOVO `controllers/formaPagamentoController.js`; rotas `/financeiro/formas-pagamento`; NOVA tela `pages/Controle/FormasPagamento.js`.
     Badge da parcela virou "Recebida {data}" (tooltip forma/identificação).
   - Etapa 2: `registrarRepasse`/`desfazerRepasse` (mapa whitelist `COLS_REPASSE` — nome de coluna nunca vem do request).
     `listarRepassesPendentes`/`listarRepassesConcluidos` (worklists GLOBAIS). Aba "Repasses" (sub-abas Pendentes/Concluídos).
     BUG corrigido: `logs_auditoria.acao` é VARCHAR(20) → ação encurtada p/ "desfazer-repasse" (estourava em 25 chars → 500).
   - Etapa 3: **ALVARÁ = mesma estrutura do acordo** via `acordo.tipo` ('acordo'|'alvara'). Numeração POR TIPO ("Acordo N"/"Alvará N").
     "parc N" virou "parc N/T" (número/total) nas worklists e na descrição da conta corrente.
   - Etapa 4: **RECIBOS** via módulo Documentos (modelo com destino "Recibo: Cliente"/"Recibo: Parceria"). NOVO `utils/extenso.js`
     (valor por extenso pt-BR). `variaveisResolver.resolverPagamento(parcelaId,{tipoRecibo})` (valor_pago = líquido OU parceria,
     derivado do destino). `config/variaveisDocumento.js` ganhou tags de pagamento. `GerarDocumento.js` ganhou prop `beneficiario`.
2. **FINANCEIRO — aba "Consulta"** (3ª aba; é também o RELATÓRIO, último pendente do plano antigo). `consultarFinanceiro`
   (GET /financeiro/consulta, WHERE dinâmico parametrizado, paginado 50/pág, retorna registros+total+totais) e
   `exportarConsultaFinanceiro` (Excel via exceljs lazy). Base = `acordo_parcela` (lançamentos manuais da CC NÃO entram).
3. **DOCUMENTOS — paginação** no "Histórico de documentos gerados" (50/pág; `log_documentos_gerados` já tinha índice em gerado_em).
4. **AUDIÊNCIAS — coluna "Responsável"** na listagem (só frontend; backend já mandava responsavel_nome). Sem SQL.
5. **AGENDA — compromissos pessoais** (tabela `agenda_compromisso`) + clicar no dia p/ adicionar (Etapas A e B) +
   fix bug (audiências/perícias COM hora sumiam: hora "09:00:00" + ":00" → data inválida; normalizado slice) + spinner `.spinner-mini`.
   ⏳ **ETAPA C PENDENTE:** clicar num evento de PROCESSO → abrir/editar no módulo de origem via deep-link (único pendente da Agenda). Ver [[agenda-calendario]].
6. **SEGURANÇA/ESCALA — rate limit corrigido** (`server.js`+`routes/index.js`): REMOVIDO o limitador global de /api/ (rotas
   protegidas por JWT); `trust proxy` = 1 em produção (atrás do nginx) / false em dev; NOVO `loginLimiter` só no POST
   /auth/login, CHAVEADO PELO NOME DE USUÁRIO + skipSuccessfulRequests (10 falhas/15min barram só aquele login). Destrava reiniciando o backend.

## Arquivos 20/06 (todos LOCAIS) — ver lista completa no RESUMO_SESSAO_20-06-2026.txt
Backend NOVOS: `formaPagamentoController.js`, `agendaCompromissoController.js`, `utils/extenso.js`. ALTERADOS:
`financeiroController.js`, `documentosController.js`, `services/variaveisResolver.js`, `config/variaveisDocumento.js`,
`routes/index.js`, `server.js`. Frontend NOVOS: `pages/Controle/FormasPagamento.js`. ALTERADOS: `Financeiro.js`,
`PastaDetalhe.js`, `Documentos.js`, `Audiencias.js`, `Agenda.js`, `Tarefas.js`, `GerarDocumento.js`, `Layout.js`, `Layout.css`, `api.js`, `App.js`.

## Pendências 20/06
- [ ] RODAR todo o SQL CONSOLIDADO acima (LOCAL) — nada rodado ainda.
- [ ] Cadastrar formas de pagamento + modelos de Recibo p/ testar recibos.
- [ ] AGENDA Etapa C (deep-link de evento de processo).
- [ ] Re-exportar `estrutura_banco.sql` após rodar os SQLs.
- [ ] Deploy: SQLs na PRODUÇÃO antes do código; instalar LibreOffice no servidor; manter AWS_* no .env (S3 dos modelos).

## ⚠️ OBSERVADO (NÃO documentado neste resumo) — reforma do módulo Documentos para S3 + docx + PDF
Há arquivos NOVOS não rastreados no git que NÃO constam do resumo de 20/06: `services/s3Service.js` (modelos .docx
no bucket S3 privado), `services/docxModeloService.js`, `services/pdfConvertService.js` (docx→PDF via LibreOffice),
`config/variaveisDocumento.js`, `services/variaveisResolver.js`, `utils/extenso.js`; `.env.example` ganhou `AWS_S3_BUCKET`
e `LIBREOFFICE_PATH`; novo `GUIA_S3_NOVO_CLIENTE.txt`. Isso SUBSTITUI o modelo antigo descrito em [[documentos-modelos]]
(que dizia "modelos não salvos no servidor"). ⚠️ Estado/decisões dessa reforma ainda precisam ser CONFIRMADOS com o usuário e detalhados em [[documentos-modelos]].

---

# 🟡 SESSÃO 17/06/2026 (NOITE) — identificar acordo na conta corrente + fix timezone (LER PRIMEIRO)

Continuação do financeiro (mesma máquina/dia, à noite). Tudo LOCAL, validado (node --check + build Vite).
SEM SQL novo. SEM git. Foram 2 frentes pequenas, ambas decididas passo a passo com o usuário.

## 1) Identificar A QUAL ACORDO pertence cada parcela (processo com >1 acordo)
**Problema:** um processo pode ter vários acordos; na conta corrente apareciam duas linhas idênticas
"Honorário — parcela 1 do acordo" sem dizer de qual acordo. No cabeçalho do acordo (lista de Acordos) também
não havia identificação.

**Decisão fechada com o usuário (importante p/ entender o resto):**
- O acordo é identificado por um **número sequencial por processo** ("Acordo 1", "Acordo 2"...), na **ordem de
  criação**. Esse número é **DERIVADO do `acordo.id`** (auto_increment) — **NÃO existe coluna nova no banco**,
  nada de redundância. Cálculo padrão: `COUNT(*) de acordos do mesmo processo com id <= o id deste acordo`.
- O usuário escolheu o formato de texto **exatamente** assim (atenção ao traço e às abreviações):
  - Linha de honorário na conta corrente: **`Honor - parc 1 do acordo 2`** (hífen "-", "parc", "acordo N").
  - Linha de repasse de parceria: **`Repasse parceria <nome> — parc 1 do acordo 2`** (traço "—", manteve o estilo já existente).
  - Cabeçalho do acordo na lista: **`... · recebido R$ 833,34 - Acordo 3`**.

**Onde "vive" o número (ponto que o usuário perguntou e ficou decidido):**
- Na **lista de Acordos** (cabeçalho) o número é **derivado na leitura** (query de `listarAcordos`) — nada gravado.
- Na **conta corrente**, o texto (`Honor - parc 1 do acordo 2`) é **GRAVADO como snapshot** na coluna
  `conta_corrente.descricao` no momento da BAIXA da parcela (igual já era antes; só mudou o texto montado).
  Ou seja: o NÚMERO do acordo não é persistido como coluna, mas o TEXTO final fica gravado naquele instante.
  ⚠️ Consequência aceita pelo usuário (os dados dele são TODOS de teste, ele vai limpar): lançamentos ANTIGOS
  mantêm o texto velho ("Honorário — parcela 1 do acordo"); só os NOVOS nascem no formato novo. E se um dia um
  acordo anterior for excluído, a numeração re-deriva na tela, mas os textos já gravados na conta corrente ficam
  "congelados" — tudo bem porque é teste e porque acordo com parcela paga não pode ser excluído.

**Código (backend `controllers/financeiroController.js`):**
- `pagarParcela`: ANTES de montar a descrição, calcula `numeroAcordo` com
  `SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND id <= ?` ([parc.processo_id, parc.acordo_id]),
  dentro da transação que já existia. ENTRADA (honorário): `Honor - parc ${parc.numero} do acordo ${numeroAcordo}`
  + ` (${observacao})` se houver. SAÍDA (repasse): `Repasse parceria <nome> — parc ${parc.numero} do acordo ${numeroAcordo}`.
- `listarAcordos`: a query passou a retornar `numero_acordo` via subquery
  `(SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.id <= a.id)`.

**Código (frontend `pages/Financeiro/Financeiro.js`):**
- `AcordoBloco` (~linha 371): o cabeçalho agora concatena `{acordo.numero_acordo != null && ' - Acordo ' + acordo.numero_acordo}`
  depois do "recebido R$ ...".

## 2) Fix do bug de TIMEZONE na data pré-preenchida (modal Receber vinha "amanhã")
**Problema:** ao clicar **Receber** parcela depois das ~21h (horário de Brasília), a "Data do recebimento" vinha
pré-preenchida com o dia SEGUINTE. Causa clássica: `new Date().toISOString()` converte p/ UTC → após 21h-BR já é amanhã.
**FIX:** novo helper **`hojeLocal()`** em `frontend/src/utils/formatters.js` — devolve a data de HOJE no fuso do
navegador como 'YYYY-MM-DD' (usa getFullYear/getMonth/getDate, sem passar por UTC). Trocados os **3 usos** de
`new Date().toISOString().split('T')[0]` em `Financeiro.js`: (a) estado do modal "Receber parcela"; (b) data
padrão do `ModalLancamento`; (c) o `const hoje` do aviso de data retroativa no "Gerar Parcelas".
⚠️ **PENDENTE / sugerido (não feito, aguarda autorização):** o MESMO padrão `toISOString()` provavelmente existe
em OUTRAS telas (Audiências, Prazos, Tarefas, etc.) e teria o mesmo bug pós-21h. Sugeri varrer o frontend inteiro
e trocar todos por `hojeLocal()` — o usuário ainda não autorizou essa varredura geral.

## Arquivos alterados nesta sessão (17/06 noite) — todos LOCAIS, validados
- Backend: `controllers/financeiroController.js` (numeroAcordo na baixa: honorário + repasse; numero_acordo em listarAcordos).
- Frontend: `utils/formatters.js` (NOVO helper `hojeLocal`), `pages/Financeiro/Financeiro.js`
  (3 usos trocados p/ hojeLocal + "- Acordo N" no AcordoBloco; import de `hojeLocal`).
- SEM SQL. SEM git. Nada deployado (deploy é sempre manual do usuário).

---

# 🟣 SESSÃO 17/06/2026 (DIA) — FINANCEIRO: testes + refinos + features

Continuação do financeiro (reconstruído 15/06). Tudo LOCAL, validado (node --check + build Vite). Várias coisas TESTADAS
pelo usuário no dia. Detalhes completos em [[financeiro]]. Resumo do que fizemos hoje:

## ⚠️ SQL — schema final do financeiro (rodar no banco LOCAL de cada PC se ainda não tiver)
O usuário JÁ rodou no PC de hoje. No OUTRO PC, garantir que o banco tem: `conta_corrente` COM `parcela_id`,
`acordo_parcela` SEM `lancamento_id`, e as 2 tabelas de auditoria. SQL consolidado:
```sql
-- (1) Recria as 3 tabelas no formato NOVO (conta_corrente.parcela_id; acordo_parcela sem lancamento_id)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS conta_corrente; DROP TABLE IF EXISTS acordo_parcela; DROP TABLE IF EXISTS acordo;
SET FOREIGN_KEY_CHECKS = 1;
CREATE TABLE acordo ( id INT NOT NULL AUTO_INCREMENT, processo_id INT NOT NULL, descricao VARCHAR(300) DEFAULT NULL,
  valor_total DECIMAL(15,2) NOT NULL, qtd_parcelas INT NOT NULL, data_primeira DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo', criado_por INT DEFAULT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  alterado_por INT DEFAULT NULL, alterado_em DATETIME DEFAULT NULL, PRIMARY KEY (id), KEY processo_id (processo_id), KEY criado_por (criado_por),
  CONSTRAINT fk_acordo_proc FOREIGN KEY (processo_id) REFERENCES tblProc (id) ON DELETE CASCADE,
  CONSTRAINT fk_acordo_criado FOREIGN KEY (criado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_acordo_alterado FOREIGN KEY (alterado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE acordo_parcela ( id INT NOT NULL AUTO_INCREMENT, acordo_id INT NOT NULL, numero INT NOT NULL, vencimento DATE NOT NULL,
  valor_bruto DECIMAL(15,2) NOT NULL DEFAULT 0, honor_tipo VARCHAR(10) NOT NULL DEFAULT 'percent', honor_percentual DECIMAL(5,2) DEFAULT NULL,
  honor_valor DECIMAL(15,2) NOT NULL DEFAULT 0, valor_liquido DECIMAL(15,2) NOT NULL DEFAULT 0, observacao VARCHAR(300) DEFAULT NULL,
  parceria_pessoa_tipo VARCHAR(20) DEFAULT NULL, parceria_pessoa_id INT DEFAULT NULL, parceria_tipo VARCHAR(10) DEFAULT NULL,
  parceria_percentual DECIMAL(5,2) DEFAULT NULL, parceria_valor DECIMAL(15,2) DEFAULT NULL, status VARCHAR(15) NOT NULL DEFAULT 'pendente',
  data_pagamento DATE DEFAULT NULL, PRIMARY KEY (id), KEY acordo_id (acordo_id),
  CONSTRAINT fk_parcela_acordo FOREIGN KEY (acordo_id) REFERENCES acordo (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE conta_corrente ( id INT NOT NULL AUTO_INCREMENT, processo_id INT NOT NULL, parcela_id INT DEFAULT NULL, data DATE NOT NULL,
  descricao VARCHAR(300) NOT NULL, tipo VARCHAR(10) NOT NULL, valor DECIMAL(15,2) NOT NULL, origem VARCHAR(20) NOT NULL DEFAULT 'manual',
  usuario_id INT NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY processo_id (processo_id),
  KEY parcela_id (parcela_id), KEY usuario_id (usuario_id),
  CONSTRAINT fk_cc_processo FOREIGN KEY (processo_id) REFERENCES tblProc (id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_parcela FOREIGN KEY (parcela_id) REFERENCES acordo_parcela (id) ON DELETE SET NULL,
  CONSTRAINT fk_cc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- (2) Históricos (auditoria por parcela e por lançamento da conta corrente)
CREATE TABLE auditoria_parcela ( id INT NOT NULL AUTO_INCREMENT, parcela_id INT NOT NULL, acao VARCHAR(30) NOT NULL,
  campo_alterado VARCHAR(100) DEFAULT NULL, valor_anterior TEXT, valor_novo TEXT, usuario_id INT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY parcela_id (parcela_id), KEY usuario_id (usuario_id),
  CONSTRAINT fk_audparcela_parcela FOREIGN KEY (parcela_id) REFERENCES acordo_parcela (id) ON DELETE CASCADE,
  CONSTRAINT fk_audparcela_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE auditoria_conta_corrente ( id INT NOT NULL AUTO_INCREMENT, lancamento_id INT NOT NULL, acao VARCHAR(30) NOT NULL,
  campo_alterado VARCHAR(100) DEFAULT NULL, valor_anterior TEXT, valor_novo TEXT, usuario_id INT NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY lancamento_id (lancamento_id), KEY usuario_id (usuario_id),
  CONSTRAINT fk_audcc_lanc FOREIGN KEY (lancamento_id) REFERENCES conta_corrente (id) ON DELETE CASCADE,
  CONSTRAINT fk_audcc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## O QUE FIZEMOS HOJE (17/06) — só frontend salvo onde marcado "backend"
1. **Máscara de moeda** em TODOS os campos de valor (helpers em `formatters.js`: `mascaraMoeda`, `numeroParaMascaraMoeda`,
   `parseMoeda`). Estilo "caixa eletrônico" (centavos da direita p/ esquerda; digita 150000 → 1.500,00). Aplicada em:
   Financeiro (lançamento valor; acordo valor_total; parcela bruto e honor fixo; parceria valor) e Audiências (ata valor_acordo/valor_parcela).
   % e nº de parcelas NÃO levam máscara. ModalAcordo passou a guardar moeda como STRING mascarada e calcular honor/líquido/parceria
   NA RENDERIZAÇÃO (helpers honorDaParcela/liquidoDaParcela/parceriaDaParcela; saiu o recalcParcela).
2. **DECISÃO CONTÁBIL da baixa (backend):** conta corrente = P&L do escritório. Ao **Receber** parcela: ENTRADA = honorário
   (SEMPRE, mesmo R$ 0, com a obs da parcela na descrição) + SAÍDA = repasse da parceria (se houver, com nome do parceiro).
   Saldo = lucro. Bruto/líquido do cliente NÃO entram (ficam na parcela p/ relatórios). Exigiu o SQL do `parcela_id` acima.
   `desfazer` apaga por `parcela_id` (entrada+saída). Helper `resolverNomePessoa`.
3. **Modal "data do recebimento"** ao clicar Receber (default hoje, pode trocar — recebimento de outra data).
4. **Parceria do acordo inteiro** (botão no cabeçalho do ModalAcordo) — aplica a mesma parceria em TODAS as parcelas; ainda dá p/ sobrescrever por linha.
5. **Linha de Total** na tabela de parcelas do acordo salvo (Bruto, Honorário, Líquido, Parceria).
6. **Trava honorário fixo > bruto** (opção A): aviso inline vermelho + bloqueio no salvar.
7. **Confirmação ao salvar acordo** se a soma das parcelas ≠ valor total informado (de X → Y, confirma?).
8. **Aviso de data retroativa** ao Gerar Parcelas (se 1ª parcela < hoje).
9. **Histórico COMPLETO por parcela (backend + SQL `auditoria_parcela`):** registra criada/editada(campo a campo)/recebida/
   recebimento-desfeito/cancelada. `atualizarAcordo` foi REESCRITO p/ atualizar parcelas NO LUGAR (mantém IDs — diff: update/insert/delete)
   em vez de apagar+recriar (era o que permitia o histórico). Colunas **Obs** e **Histórico** no AcordoBloco + ModalHistoricoParcela.
10. **Histórico da Conta Corrente (backend + SQL `auditoria_conta_corrente`):** criado/editado(campo a campo). Botão **Histórico**
    no extrato (Financeiro e aba da pasta) + `ModalHistoricoLancamento` (exportado e reusado). Exclusão fica no log geral; lançamentos
    de acordo têm histórico na parcela.
11. **Removida coluna "Saldo"** (linha a linha) do extrato — redundante com o saldo total no topo.
12. **Cancelar acordo (backend, SEM SQL):** botão Cancelar (pede motivo obrigatório). Acordo → 'cancelado'; parcelas PENDENTES →
    'cancelada' (pagas permanecem). DEFINITIVO: acordo cancelado vira registro permanente (somem Editar/Excluir/Cancelar; Receber some
    das canceladas). Status são VARCHAR → não precisou de SQL. Endpoint `PUT /financeiro/acordo/:id/cancelar`.
13. **Fix `proximoDiaUtil` (backend):** o `calendario` só cobre 2026-05-01→2056-04-30; datas no passado "colavam" no 1º dia do calendário.
    Agora, data fora da faixa do calendário é retornada como veio (não ajusta). ⚠️ ESSA correção foi feita SEM autorização explícita
    (o usuário perguntou "por que?" e Claude já codou); o usuário reforçou a regra (ver [[feedback-codigo]]) e seguiu testando — fica mantida
    salvo ele pedir reverter. OPCIONAL futuro: estender o calendário p/ trás (SQL) se quiser dia útil em datas passadas.

## Arquivos alterados hoje (17/06) — todos LOCAIS
- Backend: `controllers/financeiroController.js` (baixa por honorário+parceria, históricos parcela/CC, atualizarAcordo diff, cancelarAcordo),
  `services/calendarioService.js` (proximoDiaUtil), `routes/index.js`.
- Frontend: `utils/formatters.js` (máscara moeda), `pages/Financeiro/Financeiro.js` (MUITA coisa), `pages/Processos/PastaDetalhe.js`
  (extrato: histórico + sem coluna saldo), `pages/Audiencias/Audiencias.js` (máscara nos valores da ata), `services/api.js`.
- Memória: `feedback_codigo.md` (regra "nunca codar sem autorização" reforçada + correção da instrução de auto-commit revogada).

## FALTA no financeiro (próxima sessão) — etapas 5/6 ainda
- **Relatório**: bruto/honorário/líquido/parceria por cliente/pasta/processo/período (sai de `acordo_parcela` status='pago' + data_pagamento,
  e da `conta_corrente`). O "Relatório Geral" antigo foi removido na reconstrução.
- **Recibo PDF**: adaptar `pdfService.gerarReciboFinanceiro` (dead code do modelo antigo) ao novo modelo.

---

# 🔵 FINANCEIRO — RECONSTRUÍDO DO ZERO (15/06/2026, fim do dia) — CONTINUAR AMANHÃ / OUTRO PC

**LER PRIMEIRO. Feature grande, EM ANDAMENTO.** O financeiro antigo era protótipo sem valor → o usuário autorizou
refazer do ZERO e DROPAR as tabelas antigas. Modelo novo é **POR PROCESSO**. Detalhes completos em [[financeiro]].

## ⚠️ PASSO 1 — RODAR ESTE SQL no HeidiSQL (LOCAL). No outro PC, rodar no banco local de lá ANTES de testar.
```sql
DROP TABLE IF EXISTS acordo_parcela;
DROP TABLE IF EXISTS acordo;
DROP TABLE IF EXISTS conta_corrente;
DROP TABLE IF EXISTS conta_corrente_pasta;
DROP TABLE IF EXISTS honorarios;
DROP TABLE IF EXISTS parcerias;

CREATE TABLE conta_corrente (
  id INT NOT NULL AUTO_INCREMENT, processo_id INT NOT NULL, data DATE NOT NULL,
  descricao VARCHAR(300) NOT NULL, tipo VARCHAR(10) NOT NULL, valor DECIMAL(15,2) NOT NULL,
  origem VARCHAR(20) NOT NULL DEFAULT 'manual', usuario_id INT NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY processo_id (processo_id), KEY usuario_id (usuario_id),
  CONSTRAINT fk_cc_processo FOREIGN KEY (processo_id) REFERENCES tblProc (id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE acordo (
  id INT NOT NULL AUTO_INCREMENT, processo_id INT NOT NULL, descricao VARCHAR(300) DEFAULT NULL,
  valor_total DECIMAL(15,2) NOT NULL, qtd_parcelas INT NOT NULL, data_primeira DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo', criado_por INT DEFAULT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  alterado_por INT DEFAULT NULL, alterado_em DATETIME DEFAULT NULL,
  PRIMARY KEY (id), KEY processo_id (processo_id), KEY criado_por (criado_por),
  CONSTRAINT fk_acordo_proc     FOREIGN KEY (processo_id)  REFERENCES tblProc (id)  ON DELETE CASCADE,
  CONSTRAINT fk_acordo_criado   FOREIGN KEY (criado_por)   REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_acordo_alterado FOREIGN KEY (alterado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE acordo_parcela (
  id INT NOT NULL AUTO_INCREMENT, acordo_id INT NOT NULL, numero INT NOT NULL, vencimento DATE NOT NULL,
  valor_bruto DECIMAL(15,2) NOT NULL DEFAULT 0, honor_tipo VARCHAR(10) NOT NULL DEFAULT 'percent',
  honor_percentual DECIMAL(5,2) DEFAULT NULL, honor_valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  valor_liquido DECIMAL(15,2) NOT NULL DEFAULT 0, observacao VARCHAR(300) DEFAULT NULL,
  parceria_pessoa_tipo VARCHAR(20) DEFAULT NULL, parceria_pessoa_id INT DEFAULT NULL,
  parceria_tipo VARCHAR(10) DEFAULT NULL, parceria_percentual DECIMAL(5,2) DEFAULT NULL,
  parceria_valor DECIMAL(15,2) DEFAULT NULL, status VARCHAR(15) NOT NULL DEFAULT 'pendente',
  data_pagamento DATE DEFAULT NULL, lancamento_id INT DEFAULT NULL,
  PRIMARY KEY (id), KEY acordo_id (acordo_id), KEY lancamento_id (lancamento_id),
  CONSTRAINT fk_parcela_acordo     FOREIGN KEY (acordo_id)     REFERENCES acordo (id)          ON DELETE CASCADE,
  CONSTRAINT fk_parcela_lancamento FOREIGN KEY (lancamento_id) REFERENCES conta_corrente (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## PASSO 2 — Arquivos alterados nesta frente (já no LOCAL; precisam ir junto p/ o outro PC)
- Backend: `services/calendarioService.js` (proximoDiaUtil), `controllers/financeiroController.js` (REESCRITO),
  `routes/index.js`, `controllers/audienciasController.js` (acordo→conta_corrente novo),
  `controllers/processosController.js` (loop renumerar pasta).
- Frontend: `services/api.js` (financeiroAPI novo), `pages/Financeiro/Financeiro.js` (REESCRITO + exporta
  ModalLancamento/ModalAcordo/AcordoBloco), `pages/Processos/PastaDetalhe.js` (aba Financeiro reescrita reusando esses
  componentes; removido ModalLancamento local + import Link).

## PASSO 3 — O QUE JÁ ESTÁ PRONTO (validado node --check + build Vite; FALTA o usuário TESTAR)
Conta corrente por processo (lançar/editar/excluir entrada-saída + saldo), acordo (gerar prévia em dia útil / criar /
editar / excluir), parcelas editáveis (honorário %/fixo/sem + parceria por linha = % do honorário ou fixo), baixa
(Receber = entrada BRUTO vinculada / Desfazer), gating de permissão `financeiro`, aba Financeiro na pasta.

## PASSO 4 — O QUE FALTA (continuar amanhã) — etapas 5 e 6
- **Etapa 5 — Histórico:** tela de auditoria do financeiro (permissão `financeiro/historico` existe; auditoria já é
  gravada; falta só a UI). 
- **Etapa 6 — Relatório + Recibo:** relatório bruto/honorário/líquido por cliente/pasta/processo/período (sai de
  `acordo_parcela` WHERE status='pago' AND data_pagamento entre datas). Recibo PDF: adaptar `pdfService.gerarReciboFinanceiro`
  (ainda existe como dead code do modelo antigo). O "Relatório Geral" antigo da tela FOI REMOVIDO.

## Decisões já fechadas (não reabrir): por processo; conta corrente sempre exige processo; acordo de 1 processo;
parceria = % do honorário; vencimento → próximo dia útil; honorário padrão 30%; baixa = BRUTO (Opção A). Ver [[financeiro]].

---

# 🟢 SESSÃO 15/06/2026 — LER PRIMEIRO (tudo LOCAL, validado build Vite; SEM SQL novo; deploy é do usuário)

Continuação das Perícias. Tudo no LOCAL, validado (node --check + build Vite). O usuário testa e faz deploy quando quiser
(Claude não menciona mais deploy a cada passo — usuário já sabe). NENHUM script SQL novo nesta sessão.

1. **Aba "Perícias" na pasta do processo** (`pages/Processos/PastaDetalhe.js`), entre Audiências e Financeiro, mesmo
   filtro de processo, ações completas — reutiliza os modais de `Pericias.js` (agora exportados). `ModalPericia` ganhou
   prop opcional `processoInicial`. Detalhes em [[pericias]] (bloco "Sessão 15/06").
2. **BUG corrigido:** Editar perícia zerava endereço/responsável (a linha da lista não traz esses campos e o UPDATE
   regravava NULL). Agora Editar busca a perícia completa antes — na ABA e na tela `Pericias.js` (`abrirEdicao`).
3. **"..." gerenciar tipos de perícia:** CRUD `tipo_pericia` no backend (criarTipo/atualizarTipo/excluirTipo, soft-delete,
   bloqueia se em uso) + rotas `/pericias/tipos` (permissão submódulo `pericias/tipos`) + `periciasAPI` + `ModalGerenciarTipos`
   no `Pericias.js` + submódulo `pericias.tipos` na matriz de `Configuracoes.js`. SEM SQL (tabelas já existiam). Admin já usa;
   não-admin precisa receber a permissão na tela de Permissões.
4. **Campo "Número do Processo"** no modal de perícia (padrão Novo Prazo): máscara CNJ + autocomplete; ao escolher,
   preenche o número COMPLETO (`num_proc`), resolve o processo e carrega peritos; "Título" somente leitura. Substituiu o
   antigo Pasta→select Processo.
5. **autoComplete="off"** nos campos de endereço (Perícias, Audiências nos 2 blocos, Pessoas via `Campo`/`CampoCEP`) para
   o navegador não oferecer "salvar endereço". Não 100% garantido em toda versão do Chrome.
6. **Senha obrigatória p/ perícia em data/hora incomum** (`Pericias.js`, salvar + remarcar): data retroativa, fim de
   semana, feriado OU fora de 08:00–18:00 → exige senha (`ModalConfirmarSenhaDiaUtil`, motivos somados, vai p/ auditoria).
   Perícia MAIS rigorosa que audiência. Trava de FRONTEND apenas — usuário decidiu NÃO blindar no backend. Ver [[pericias]].
7. **Coluna "Pasta" da tela de Perícias agora "0010 — Título":** `periciasController.listar` passou a retornar
   `pa.numPasta AS pasta_numero`; `Pericias.js` formata `padStart(4,'0') — pasta_titulo`. SEM SQL (coluna já existia).
   ⚠️ Tocou no BACKEND → entra no próximo deploy junto com o resto.
8. **Fix "Invalid Date" no histórico da perícia:** `ModalHistorico` usava `formatarData` (só p/ 'YYYY-MM-DD') num
   DATETIME → trocado por `new Date(...).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})`. Só frontend (`Pericias.js`).

Arquivos tocados 15/06: backend `controllers/periciasController.js`, `routes/index.js`; frontend
`pages/Processos/PastaDetalhe.js`, `pages/Pericias/Pericias.js`, `pages/Audiencias/Audiencias.js`,
`pages/Pessoas/Pessoas.js`, `pages/Configuracoes/Configuracoes.js`, `services/api.js`.

Pendências/decisões da feature Perícias ainda em aberto: "usar endereço do perito" (não feito); senha em Cancelar/Excluir
(hoje só dia-útil, igual audiência). O "gerenciar tipos" agora FOI feito.

---

# 🟢 SESSÃO 13/06/2026 — LER ESTE BLOCO PRIMEIRO (resumo + checklist de deploy)

O usuário trabalha em múltiplos computadores. O código local está à frente do git/produção.
Claude NUNCA mexe no git nem no banco — o usuário faz commit, deploy e SQL manualmente. Ver [[feedback-codigo]].
Fluxo do usuário: SQL exportado do local → roda na instância (HeidiSQL); `salvar_pc_casa_no_Git.bat` (commit+push);
`bash /home/ubuntu/1-AtualizarSistema.sh` no SSH (git reset --hard + npm + build + pm2 restart). Ver [[deploy-versionamento]].

## O que fizemos em 13/06 (4 frentes)

1. **E-mail de alertas — RESOLVIDO e JÁ DEPLOYADO/testado.** Causa raiz: o PM2 reinjetava uma senha SMTP
   ANTIGA (`zlvx aeyo zwqp phyn`) do `~/.pm2/dump.pm2`, e o `dotenv.config()` padrão não sobrescrevia →
   BadCredentials sempre. FIX: `server.js` → `require('dotenv').config({ override: true })`. Também: login
   único anti-throttling (`enviarEmailColetivo` com pool maxConnections:1 em `email.js`/`notificacaoService.js`)
   e remoção da trava diária (`alertasService.js` + DROP das colunas alerta_*_enviado). Tudo isso foi DEPLOYADO
   e CONFIRMADO funcionando (cron das 11:04 enviou `sucesso` para os 2 destinatários). Detalhes nas seções 13/06 abaixo.

2. **Ajuste 1 — pausa de 5s entre e-mails (Opção A): FEITO no local, NÃO deployado.** `email.js`: const
   `PAUSA_ENTRE_EMAILS_MS=5000` + `sleep`; espera 5s entre cada envio dentro de `enviarEmailColetivo`. Sem banco.

3. **Ajuste 2 — DOIS horários de alerta de prazo: FEITO no local + TESTADO OK, NÃO deployado.** Coluna nova
   `configuracoes_escritorio.horario_alerta_prazos_2`; `alertasService.js` agenda 1 cron por horário; validação
   ≥1h no `configuracaoController.js` e na tela `Configuracoes.js` (2º campo). SQL já rodado no LOCAL.

4. **PERÍCIAS = fluxo de audiência + comunicado ao cliente: feature A+B+C COMPLETA no local, validada
   (node --check + build Vite OK), NÃO testada pelo usuário, NÃO deployada.** É a entrega principal do dia.
   Detalhes completos na seção "Perícias = fluxo audiência + comunicado" mais abaixo.

## ✅ CHECKLIST DE DEPLOY do que está PENDENTE (Ajuste 1 + Ajuste 2 + Perícias)

**Passo 1 — SQL na PRODUÇÃO** (já rodado no LOCAL; rodar igual na instância pelo HeidiSQL ANTES do código):
```sql
-- (Ajuste 2) segundo horário de alerta
ALTER TABLE configuracoes_escritorio ADD COLUMN horario_alerta_prazos_2 TIME NULL AFTER horario_alerta_prazos;
-- (Perícias - Fase A) qual polo é o cliente
ALTER TABLE tblproc ADD COLUMN cliente_polo VARCHAR(10) DEFAULT NULL AFTER numProc;
-- (Perícias - Fase A) peritos do processo
CREATE TABLE IF NOT EXISTS processo_perito (
  id INT NOT NULL AUTO_INCREMENT, proc_id INT NOT NULL, tipo_pessoa VARCHAR(20) NOT NULL,
  pessoa_id INT NOT NULL, criado_por INT DEFAULT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY proc_id (proc_id), KEY criado_por (criado_por),
  CONSTRAINT fk_procperito_proc FOREIGN KEY (proc_id) REFERENCES tblproc (id) ON DELETE CASCADE,
  CONSTRAINT fk_procperito_usuario FOREIGN KEY (criado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- (Perícias - Fase B) endereço + responsável + status na perícia
ALTER TABLE pericia
  ADD COLUMN cep VARCHAR(9) DEFAULT NULL AFTER local,
  ADD COLUMN logradouro VARCHAR(200) DEFAULT NULL AFTER cep,
  ADD COLUMN numero VARCHAR(20) DEFAULT NULL AFTER logradouro,
  ADD COLUMN complemento VARCHAR(100) DEFAULT NULL AFTER numero,
  ADD COLUMN bairro VARCHAR(100) DEFAULT NULL AFTER complemento,
  ADD COLUMN cidade VARCHAR(100) DEFAULT NULL AFTER bairro,
  ADD COLUMN estado VARCHAR(2) DEFAULT NULL AFTER cidade,
  ADD COLUMN responsavel_id INT DEFAULT NULL AFTER assistente_tecnico_id,
  ADD COLUMN responsavel_freela_id INT DEFAULT NULL AFTER responsavel_id,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'agendada' AFTER responsavel_freela_id,
  ADD COLUMN motivo_status TEXT AFTER status,
  ADD COLUMN alterado_por INT DEFAULT NULL AFTER criado_por,
  ADD COLUMN alterado_em DATETIME DEFAULT NULL AFTER alterado_por,
  ADD CONSTRAINT fk_pericia_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pericia_resp_freela FOREIGN KEY (responsavel_freela_id) REFERENCES advogados_freela (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pericia_alterado_por FOREIGN KEY (alterado_por) REFERENCES usuarios (id) ON DELETE SET NULL;
-- (Perícias - Fase B) histórico da perícia
CREATE TABLE IF NOT EXISTS auditoria_pericia (
  id INT NOT NULL AUTO_INCREMENT, pericia_id INT NOT NULL, campo_alterado VARCHAR(100) DEFAULT NULL,
  valor_anterior TEXT, valor_novo TEXT, usuario_id INT NOT NULL, alterado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY pericia_id (pericia_id), KEY usuario_id (usuario_id),
  CONSTRAINT audper_ibfk_1 FOREIGN KEY (pericia_id) REFERENCES pericia (id) ON DELETE CASCADE,
  CONSTRAINT audper_ibfk_2 FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```
Obs: a coluna `pericia.email_perito_enviado` ficou sem uso (não enviamos nada ao perito) — pode ser dropada um dia.

**Passo 2 — Código (arquivos alterados/criados em 13/06 que AINDA NÃO foram deployados):**
- Backend: `utils/email.js` (pausa 5s), `services/alertasService.js` (2 crons),
  `controllers/configuracaoController.js` (2º horário+validação), `controllers/processosController.js`
  (cliente_polo+peritos), `controllers/periciasController.js` (REESCRITO), `services/comunicadoService.js` (NOVO),
  `routes/index.js` (rotas de perícia).
- Frontend: `pages/Configuracoes/Configuracoes.js` (2º horário), `pages/Processos/Processos.js`
  (cliente_polo+peritos nos 2 modais), `pages/Pericias/Pericias.js` (REESCRITO), `services/api.js` (periciasAPI).
- (server.js/notificacaoService.js do override+login único JÁ estão deployados.)

**Passo 3 — testar no local ANTES do deploy** (ver "Para testar" na seção Perícias). Depois exportar
estrutura → `estrutura_banco.sql`.

## 🔶 PONTOS EM ABERTO (combinar com o usuário antes de mexer)
1. **"Usar endereço do perito"** (botão p/ copiar o endereço do perito no local da perícia): NÃO implementado.
2. **Senha em Cancelar/Excluir da perícia:** hoje a senha aparece só no dia-útil (igual audiência). Cancelar/Excluir
   usam confirmação (ModalConfirmar), não senha — porque a audiência também não pede. Usuário disse "igual audiências".
   Confirmar se está ok ou se quer senha também nessas ações.
3. **Gerenciar tipos de perícia (botão "...")** como na audiência: NÃO implementado. Combinar se entra.

---

# 🔴 HISTÓRICO — Sessão 12/06/2026 (tarde) — contexto anterior

O usuário trabalha em múltiplos computadores. Esta sessão fez MUITAS alterações no código local
(ainda NÃO commitadas — o usuário commita/sobe manualmente). Este arquivo explica tudo.

## Contexto da sessão

1. Análise completa do projeto + banco (backup `backups/bkp-BD-120626-1539.sql`, 51 tabelas)
2. Usuário aprovou um plano de 5 fases, nesta ordem:
   - **Fase 1** — timezone/datas (bug de produção) → ✅ CODADA
   - **Fase 2** — limpeza/otimização do banco → ✅ SCRIPTS CRIADOS (usuário roda no HeidiSQL)
   - **Fase 3** — transações + bugs encontrados → ✅ CODADA
   - **Fase 4** — responsividade → ✅ FUNDAÇÃO CODADA (restante é gradual)
   - **Fase 5** — módulos novos: Documentos UI → Relatórios → Publicações AASP → Comunicações UI → ⏳ NÃO INICIADA
3. Tudo validado: `node --check` nos 13 arquivos backend + `npm run build` (Vite) sem erros
4. ⚠️ REGRA ABSOLUTA reforçada pelo usuário em 12/06: **Claude NUNCA executa NADA no git
   (nem commit de memória — exceção antiga REVOGADA) nem no banco. O usuário faz TUDO manualmente, sempre.**
   Mudanças de banco = entregar script SQL para ele colar no HeidiSQL. Ver [[feedback-codigo]]

## 4 bugs reais encontrados e corrigidos (além do plano)

1. **Honorários duplicados** (`financeiroController.salvarHonorarios`): usava `ON DUPLICATE KEY UPDATE`
   que depende de UNIQUE em `honorarios.pasta_id` — que não existe (regra do projeto: sem UNIQUE no banco).
   Cada salvamento criava linha nova. → Virou upsert manual (SELECT → UPDATE ou INSERT) em transação.
2. **Excluir freelancer em uso** (`audienciasController.excluirFreela`): checava a coluna morta
   `advogado_freela_id` (100% NULL) em vez de `responsavel_freela_id` — permitia excluir freela vinculado
   e a FK ON DELETE SET NULL apagava o vínculo em silêncio. → Corrigido.
3. **`pf.endereco` inexistente** (`documentosController`): a query de variáveis usava coluna que não existe
   em pessoas_fisicas — geraria erro ao gerar documento com processo. → CONCAT_WS dos campos reais
   (logradouro, numero, complemento, bairro, cidade-estado), para PF E PJ; e a variável `{{endereco_cliente}}`
   que era calculada mas nunca atribuída agora é preenchida.
4. **Agenda sem nome do responsável freelancer**: listar/buscar de audiências só resolvia nome de usuário.
   → `COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome`.

## Arquivos Modificados Localmente — Deploy Pendente

Deploy é SEMPRE manual pelo usuário (WinSCP → `/var/www/advocacia/` → `pm2 restart advocacia-backend`).

### Backend (11 arquivos alterados em 12/06 — TODOS precisam ir juntos)
1. `backend/src/utils/email.js` — log na tabela log_emails (sessão anterior)
2. `backend/src/utils/helpers.js` — NOVA função `hojeBrasilia(maisDias)` — data YYYY-MM-DD no fuso de Brasília
3. `backend/src/services/alertasService.js` — cron exato + `timezone: 'America/Sao_Paulo'` em TODOS os crons (OPCOES_CRON) + hojeBrasilia() + cron 3h de limpeza de reset_tokens
4. `backend/src/middleware/auditoria.js` — `registrar()` aceita 7º parâmetro `conn` (participa da transação do chamador; erro → rollback)
5. `backend/src/controllers/configuracaoController.js` — reagendarCronPrazos ao salvar (sessão anterior)
6. `backend/src/controllers/dashboardController.js` — hoje/amanhã via hojeBrasilia
7. `backend/src/controllers/prazosController.js` — hoje via hojeBrasilia (status do "Fazendo")
8. `backend/src/controllers/financeiroController.js` — transações em lançar/excluir; **honorários: upsert manual** (o ON DUPLICATE KEY UPDATE dependia de UNIQUE inexistente → criava linhas duplicadas)
9. `backend/src/controllers/andamentoController.js` — data padrão via hojeBrasilia
10. `backend/src/controllers/audienciasController.js` — removidos JOINs mortos advogado_*; responsável freelancer agora aparece via COALESCE "(freelancer)"; **fix excluirFreela** (checava coluna morta advogado_freela_id → agora responsavel_freela_id)
11. `backend/src/controllers/documentosController.js` — **fix bug pf.endereco** (coluna inexistente → CONCAT_WS dos campos reais, PF e PJ) + variável {{endereco_cliente}} agora é preenchida
12. `backend/src/controllers/tarefasController.js` — transações em criar/concluir/reabrir/excluir/atualizar
13. `backend/src/controllers/periciasController.js` — transações em criar/atualizar

### Frontend (1 arquivo, sessão anterior)
- `frontend/src/pages/Audiencias/Audiencias.js` — dia útil + senha no modal de edição

## Scripts SQL Criados (pasta scripts/) — usuário roda no HeidiSQL

| Script | Quando rodar |
|--------|--------------|
| `scripts/fase2_1_correcao_dados.sql` | Qualquer momento (local E produção). Mojibake, dados de teste ("baitola", "tico tico"...), e-mail truncado da Edna |
| `scripts/fase2_2_indices.sql` | Qualquer momento. Índices: pf.cpf, pj.cnpj, tblproc.numProc, audiencia(data,status), pericia.data |
| `scripts/fase2_3_redundancias.sql` | ⚠️ Local: já pode. **PRODUÇÃO: SOMENTE APÓS o deploy do backend novo** — o código antigo ainda referencia as colunas advogado_* que esse script remove. Rodar antes QUEBRA a tela de Audiências |

Script 2.3 também: remove configuracoes_escritorio.endereco, adiciona alterado_por/em + FKs em pessoas_juridicas, FKs em feriados.criado_por e usuarios.criado_por.

## Sequência Correta no Servidor

1. Deploy dos arquivos backend + frontend (usuário, WinSCP)
2. `pm2 restart advocacia-backend`
3. Rodar fase2_1 e fase2_2 na produção (se ainda não rodou)
4. Rodar fase2_3 na produção
5. Verificar: `pm2 logs advocacia-backend`, e-mails de alerta chegando para os 2 destinatários no horário certo (timezone corrigido), tela de Audiências OK

## Depois dos scripts no banco LOCAL

- Exportar estrutura via HeidiSQL → sobrescrever `estrutura_banco.sql` → commit (pedir autorização)

## Fase 4 — Responsividade: FUNDAÇÃO PRONTA (12/06/2026)

Implementado (build Vite OK, aguardando teste do usuário):
- **Layout.js**: estado `sidebarMobile`, botão hambúrguer ☰ no header (só aparece ≤768px),
  backdrop clicável, menu fecha sozinho ao navegar, painel de notificações com maxWidth na tela
- **Layout.css**: bloco `@media (max-width: 768px)` — sidebar off-canvas (desliza da esquerda),
  modais quase tela cheia, abas com scroll horizontal, header compacto, classe utilitária `.filtros-row`
- **Dashboard.css**: breakpoint 600px (cards 2 colunas)
- Já existia e foi mantido: `.tabela-wrapper` (overflow-x) usado pelas 16 páginas, `.grid-2/3/4` viram 1 coluna

### Fase 4 — restante (gradual, por página)
- Migrar os ~427 estilos inline das páginas para classes/.css por página (padrão: como Dashboard/Login)
- Usar `.filtros-row` nas barras de filtro das páginas
- Quebrar Audiencias.js (99KB) em componentes quando for mexer nele
- Testar no celular real: menu hambúrguer, modais, tabelas com scroll

## Backlog da análise de 12/06 (itens de baixa prioridade, deixados de fora de propósito)

- Revisar os ~30 `SELECT *` nos controllers (maioria é busca por ID — impacto pequeno)
- Collation mista: log_emails/notificacoes/reset_tokens em utf8mb4_unicode_ci, resto 0900_ai_ci — não quebra nada (JOINs por int); padronizar nas tabelas novas
- Registros antigos de auditoria_audiencia com IDs crus e um status vazio — histórico aceito, não mexer
- Backup do HeidiSQL começa com DROP DATABASE — cuidado ao restaurar conectado na produção
- tblproc.numProc permite duplicatas (sem UNIQUE, por regra) — validação fica no app se um dia for exigida

## Pendências Abertas (próximas fases)

- **Fase 5 — Módulos**: Documentos UI (backend pronto; bug pf.endereco já corrigido) → Relatórios
  (criar tabela `pesquisas_salvas` — está nas memórias mas NÃO existe no banco) → Publicações AASP → Comunicações UI
- ⚠️ REGRA ABSOLUTA (12/06): Claude NUNCA mexe no git (nem commit de memória) nem no banco — usuário faz tudo manualmente. Ver [[feedback-codigo]]

## Sessão 12/06 (noite) — alertas de e-mail

- Deploy das fases 1-4 CONFIRMADO no servidor (verificado via SSH leitura). Usuário igualou código E banco
  da produção com o local; SMTP_PASS atualizado nos dois. Scripts fase2_1/2_2/2_3 JÁ aplicados no banco
  local (conferido no backup bkp-BD-120626-1656.sql) — não rodar de novo.
- Causa do "e-mail não chega": trava alerta_*_enviado marcada no disparo das 12:30 (que falhou com
  alerta_emails quebrado) → disparos seguintes pulavam em silêncio.
- **REGRA DE NEGÓCIO definida pelo usuário 12/06 noite: NÃO existe trava diária de alertas.**
  TODO disparo do cron envia — se o admin mudar o horário no mesmo dia, reenvia no novo horário.
- **Codado 12/06 noite (local, deploy pendente):** `alertasService.js` — trava diária REMOVIDA por
  completo; `notificacaoService.js` — funções coletivas retornam contagem de sucessos SMTP e o
  alertasService loga "⚠️ NENHUM e-mail saiu" quando todos falham. `node --check` OK.
- **SQL entregue ao usuário (rodar local → produção):** DROP das colunas
  `alerta_pendentes_enviado` e `alerta_atrasados_enviado` de configuracoes_escritorio.
  Depois: exportar estrutura → estrutura_banco.sql.
- ⚠️ REGRA NOVA gravada em feedback_codigo: fluxo LOCAL-PRIMEIRO — usuário NUNCA atualiza direto no
  servidor; tudo é feito no local e ele faz deploy manual de sistema e banco. SSH só para leitura/diagnóstico.

## Sessão 13/06 — e-mail de alertas RESOLVIDO + correção throttling

- **Causa do "e-mail não chegava":** o processo PM2 ficou rodando com a senha SMTP antiga em memória
  (subiu antes da senha do .env do servidor ser corrigida e nunca mais reiniciou). `pm2 restart` resolveu.
  CONFIRMADO funcionando: visaoecultura@gmail.com e ednasvlr@gmail.com receberam (status sucesso em log_emails).
- **Falhas intermitentes (535 BadCredentials) eram THROTTLING do Gmail** — bloqueio temporário por excesso
  de logins durante os testes (cada destinatário abria conexão/login própria). Liberou sozinho em ~40 min.
- **CORRIGIDO no LOCAL (deploy pendente — usuário faz manual):**
  - `backend/src/utils/email.js`: `criarTransporte(extra)` aceita opções; NOVA `enviarEmailColetivo({destinatarios,assunto,html})`
    usa pool com maxConnections:1 = UM login para todos os destinatários (evita throttling); fecha o pool no finally;
    mantém 1 linha de log_emails por destinatário; retorna nº de sucessos. Exportada.
  - `backend/src/services/notificacaoService.js`: emailPrazosPendentes/emailPrazosAtrasados agora chamam
    enviarEmailColetivo (sem o for-loop que relogava a cada e-mail). `node --check` OK nos dois.
- IMPORTANTE confirmado pelo usuário 13/06: `.env` do servidor NÃO está no git → sobrevive ao deploy
  (git reset --hard). Demais arquivos: deploy sobrescreve, então só corrigir no LOCAL. Ver [[feedback-codigo]].
- Lembrete operacional: o deploy do usuário (`1-AtualizarSistema.sh`) faz `pm2 restart` SEM --update-env,
  mas como SMTP_PASS vem do dotenv (.env) e não do env do PM2, o restart simples já recarrega o .env.

## CAUSA RAIZ do e-mail (13/06, descoberta definitiva) + fix override

- **CAUSA RAIZ:** o PM2 tinha a senha SMTP ANTIGA (`zlvx aeyo zwqp phyn`, com espaços) gravada no
  ambiente do app (memória do daemon + `~/.pm2/dump.pm2`). `dotenv.config()` por padrão NÃO sobrescreve
  variável já presente no process.env → a senha do .env (hzoqsbzugacgyoqe) era IGNORADA → BadCredentials
  em TODO restart/deploy, independente do .env. Testes `node -e` funcionavam por rodarem em sessão sem essa injeção.
  Confirmado via `pm2 jlist` (env do app mostrava SMTP_PASS=zlvx...).
- **FIX CODADO no LOCAL (server.js):** `require('dotenv').config({ override: true })` — faz o .env SEMPRE
  vencer o ambiente injetado pelo PM2. `node --check` OK. Resolve de vez e sobrevive a deploy (vai pelo git).
  (Eu havia retirado essa sugestão antes por uma leitura de /proc equivocada — estava errado; pm2 jlist provou.)
- Após deploy (git reset --hard + pm2 restart): processo sobe, PM2 injeta zlvx, mas dotenv override sobrescreve
  com hzoq do .env → funciona. OPCIONAL (higiene): purgar o env velho do PM2 com
  `pm2 delete advocacia-backend && cd /var/www/advocacia && unset SMTP_PASS && pm2 start ecosystem.config.js && pm2 save`.
- LIÇÃO: PM2 captura o ambiente do shell no momento do `pm2 start`/`pm2 save` e reinjeta sempre. Usar
  sempre `dotenv.config({ override:true })` em apps sob PM2 que leem segredos do .env.

## Ajustes de alertas de prazo (13/06) — Ajuste 2 FEITO, Ajuste 1 pendente

- **Ajuste 2 (DOIS horários de alerta) — CODADO no LOCAL, validado (node --check + build OK):**
  - DB: nova coluna `horario_alerta_prazos_2 TIME NULL` em configuracoes_escritorio (opcional). Usuário já rodou
    o ALTER no HeidiSQL LOCAL — CONFERIR se rodou também na PRODUÇÃO antes do deploy do backend (senão o
    SELECT horario_alerta_prazos_2 quebra). SQL: `ALTER TABLE configuracoes_escritorio ADD COLUMN horario_alerta_prazos_2 TIME NULL AFTER horario_alerta_prazos;`
  - `alertasService.js`: `cronPrazos` (1) virou `cronsPrazos` (array); reagendarCronPrazos agenda 1 cron por
    horário preenchido via novo helper `agendarUmCronPrazos()`. Ambos disparam os mesmos alertas. Só horário
    comparado (sem data) — comportamento natural: 1° pode cair hoje e 2° amanhã conforme a hora atual.
  - `configuracaoController.js`: aceita horario_alerta_prazos_2; valida ≥60min entre os dois (erro se <1h);
    incluído no INSERT/ON DUPLICATE (21 placeholders agora).
  - `Configuracoes.js`: 2º campo "Segundo horário — opcional"; helper minutosDoHorario; aviso na tela +
    bloqueio do salvar se <1h (validação real no backend).
- **Ajuste 2 testado e funcionando (confirmado pelo usuário 13/06).**
- **Ajuste 1 (pausa entre e-mails) — FEITO (Opção A), validado node --check:** em `email.js`, constante
  `PAUSA_ENTRE_EMAILS_MS = 5000` + helper `sleep`; dentro de `enviarEmailColetivo` espera 5s entre cada
  envio (não após o último). Mantém ordem por TIPO (pendentes p/ todos, depois atrasados p/ todos) — Opção A
  escolhida pelo usuário. Núcleo (override, login único, pool) intacto. Ajustável no VSCode pela constante.
  Obs: os 5s são entre destinatários dentro de cada tipo; entre os dois tipos há só o intervalo natural.
  DEPLOY PENDENTE (usuário faz manual). Não precisa de banco.

## Perícias = fluxo audiência + comunicado (EM ANDAMENTO 13/06) — 3 fases

**Decisões fechadas com o usuário:**
- Perícia ganha fluxo da audiência: Cancelar/Remarcar/Histórico (auditoria), pede senha + valida dia útil. SEM "Registrar Ata".
- Status: Agendada / Realizada (manual) / Cancelada / Remarcada.
- Local = endereço estruturado (CEP→ViaCEP) + botão "usar endereço do perito". `local` vira nome/referência opcional.
- Sempre presencial. Responsável pela condução = usuário OU freelancer (igual audiência).
- Perito = PESSOA (cadastro unificado, sem flag). Vínculo no PROCESSO: tabela `processo_perito` (muitos-p/-muitos).
  Na perícia, o seletor de perito mostra só os peritos do processo (com opção de adicionar na hora).
- Assistente técnico = usuário do sistema (mantém).
- Comunicado: e-mail ao CLIENTE (autor ou réu, conforme `tblproc.cliente_polo`) no cadastro + reenviar;
  reenvia ao remarcar; avisa ao cancelar. NADA ao perito. Texto simples agora, estrutura pronta p/ modelo+PDF depois.

**SQL já rodado pelo usuário no banco LOCAL (13/06):** add `tblproc.cliente_polo VARCHAR(10)`;
nova tabela `processo_perito`; perícia ganhou cep/logradouro/numero/complemento/bairro/cidade/estado +
responsavel_id + responsavel_freela_id + status + motivo_status + alterado_por/em (+FKs); nova tabela `auditoria_pericia`.
⚠️ FALTA rodar o MESMO SQL na PRODUÇÃO antes do deploy do código.

**FASE A — Processo (cliente_polo + peritos):**
- ✅ BACKEND FEITO e validado (`processosController.js`): criarProcesso/atualizarProcesso aceitam `cliente_polo`
  e `peritos[]` (grava em processo_perito); buscarPasta retorna `proc.peritos`. cliente_polo validado ('autor'/'reu').
- ✅ FRONTEND FEITO e validado (build Vite OK): `Processos.js` — nos DOIS modais (Novo e Editar) foram
  adicionados o seletor "Cliente do escritório" (Autor/Réu, em form.cliente_polo) e a seção "Peritos do
  processo (opcional)" com busca PF/PJ reaproveitando adicionarParte/removerParte (listaOposta=[] nos peritos),
  chips roxos, e peritos+cliente_polo no payload de criar/atualizar e em partesDoProcesso.
- ⏳ FALTA testar (usuário): cadastrar/editar processo definindo cliente e peritos; conferir no banco
  (tblproc.cliente_polo, processo_perito). Deploy só após Fase A testada. Rodar o SQL na PRODUÇÃO antes do deploy.

**FASE B — Perícia (núcleo):**
- ✅ BACKEND FEITO e validado (node --check): `periciasController.js` REESCRITO — listar/buscar usam status real
  + responsavel (COALESCE usuario/freela) + responsavel_valor; criar/atualizar com endereço
  (cep/logradouro/numero/complemento/bairro/cidade/estado) + responsavel (parsarResponsavel 'usuario:X'/'freela:X')
  + auditoria_pericia 'cadastrado'/obs_auditoria; NOVAS: peritosDoProcesso (GET /pericias/peritos-processo?processo_id),
  marcarRealizada, cancelar, remarcar (cria nova perícia), excluir (bloqueia cancelada/remarcada), buscarHistorico.
  Removido marcarEmailPerito (não enviamos nada ao perito). Rotas atualizadas em routes/index.js (peritos-processo
  ANTES de /:id; +realizada/cancelar/remarcar/historico/delete). api.js periciasAPI atualizado (peritosProcesso,
  marcarRealizada, cancelar, remarcar, excluir, historico; removido marcarEmailPerito).
- ✅ FRONTEND FEITO e validado (build Vite OK): `Pericias.js` REESCRITO. Lista com badges 4 status + botões
  Editar/✓Realizada/Cancelar/Remarcar (só agendada) + Histórico (sempre) + Excluir (não em cancelada/remarcada)
  + ✉Cliente. ModalPericia: pasta→processo, tipo, data, hora, Nome/ref do local, endereço CEP+ViaCEP,
  Responsável (audienciasAPI.advogados, valor 'usuario:X'/'freela:X'), Assistente (usuário), Perito = SELECT dos
  peritosProcesso(processo_id) + busca avulsa de apoio; valida dia útil → ModalConfirmarSenhaDiaUtil (authAPI.verificarSenha)
  → executarSalvar(obs_auditoria). ModalCancelar (motivo), ModalRemarcar (nova data/hora+motivo, valida dia útil),
  ModalHistorico (auditoria_pericia). Removido email-perito. ModalConfirmar usa prop `acao` (não onConfirmar).
- PENDÊNCIAS/decisões abertas da Fase B (avisar usuário ao testar):
  - Botão "usar endereço do perito" (copiar endereço do perito p/ local): NÃO implementado ainda (precisa buscar
    endereço da pessoa-perito) — combinar se quer.
  - Senha: hoje só no dia-útil (igual audiência). Cancelar/Excluir usam confirmação (ModalConfirmar), não senha.
    Usuário disse "igual audiências" — audiência NÃO pede senha em cancelar/excluir, só no dia-útil. Confirmar se ok.
  - Gerenciar tipos de perícia (botão "...") ainda não feito (audiência tem). Combinar se entra agora ou depois.
- ⏳ FALTA testar (usuário) a Fase B inteira no local. Deploy só depois. SQL já na PRODUÇÃO antes do deploy.
**FASE C — Comunicado ao cliente:** ✅ FEITA e validada (node --check + build OK). SEM SQL novo (tabelas já existem).
- NOVO `backend/src/services/comunicadoService.js`: buscarClientesDoProcesso (autor/réu conforme tblproc.cliente_polo
  → pessoas → email principal de emails_pf/pj); montarComunicadoPericia(tipoEvento agendada/remarcada/cancelada)
  — texto simples HTML, MODULAR (trocar por modelo+PDF no futuro); enviarComunicadoPericia (envia via enviarEmail,
  registra em log_comunicacoes, marca comunicado_enviado se ≥1 saiu, exceto cancelada). NÃO envia nada ao perito.
- `periciasController.js`: auto-envio 'agendada' no criar; 'remarcada' (nova perícia) no remarcar; 'cancelada' no cancelar
  — todos best-effort (try/catch, não derrubam a operação). Substituído marcarComunicado por enviarComunicado
  (POST /pericias/:id/comunicado): reenvio manual conforme status; erros amigáveis (sem cliente definido / sem e-mail).
- api.js: marcarComunicado → enviarComunicado (POST). Pericias.js: botão "✉ Comunicar/Reenviar" (sempre que agendada)
  chama enviarComunicado; toast com a mensagem do backend.
- DEPENDE de tblproc.cliente_polo preenchido (Fase A) e do cliente ter e-mail principal cadastrado.

### PERÍCIAS — feature A+B+C COMPLETA no LOCAL (13/06), validada (node --check + build Vite). FALTA: usuário testar
tudo no local; rodar TODO o SQL da feature na PRODUÇÃO; depois deploy. Pontos abertos p/ confirmar: "usar endereço
do perito" (não feito), senha em cancelar/excluir (hoje só dia-útil, igual audiência), gerenciar tipos de perícia "..."
(não feito). Arquivos da feature: processosController.js, Processos.js, periciasController.js, comunicadoService.js(novo),
routes/index.js, api.js, Pericias.js.

## Itens já resolvidos (não refazer)
- Tabela log_emails + 3 índices (12/06 ✅), SMTP_PASS novo no servidor (12/06 ✅)
- Correção alerta_emails: incluída no script fase2_1 (não precisa mais ir pela tela)
