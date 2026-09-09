# Auditoria do sistema — 08/09/2026

Varredura **somente leitura** de front, back e banco. Nada foi alterado.
Sistema em produção em 2 clientes (instâncias separadas).

---

## 1. Escopo e método

**Lido linha a linha:** toda a camada transversal (`config/database.js`, `middleware/auth.js`,
`middleware/permissoes.js`, `middleware/auditoria.js`, `utils/response.js`, `utils/helpers.js`,
`server.js`, `routes/index.js`, `context/AuthContext.js`, `services/api.js`, `App.js`,
`components/layout/Layout.js`); `authController` inteiro; `configuracaoController` inteiro;
`financeiroController` inteiro; `publicacoesController` inteiro; `services/pdfConvertService`,
`services/s3Service`, `services/datajudService`, `services/iaService`, `services/alertasService`;
os pontos de exclusão/atualização de `processosController` e `pessoasController`;
a estrutura de ~80% das 82 tabelas.

**Varredura dirigida (grep) em 100% do código:** SQL com interpolação de dados, `req.query/body/params`
dentro de string SQL, `child_process`/`eval`/`new Function`, `dangerouslySetInnerHTML`, `href` dinâmico,
transações ausentes em escritas múltiplas, `npm audit`, arquivos sensíveis no Git.

**Amostrado (padrão verificado por grep, não lido inteiro):** `audienciasController`,
`andamentoController`, `agendaCompromissoController`, `tarefasController`, `prazosController`,
`periciasController`, `dashboardController`, `etiquetasController`, `variaveisResolver`,
serviços `cnj/aasp/comunicado/docx/calendario/sms/agendaGoogle`, e a maioria das telas do frontend.
Todos seguem os mesmos padrões verificados nos arquivos lidos por completo.

> Isto **não substitui** uma auditoria de segurança formal com pentest e revisão linha a linha
> das 46 mil linhas — isso é um trabalho de dias. É uma passada profunda no que concentra o risco.

---

## 2. Veredito geral

**O código é sólido, consistente e bem defendido.** Não encontrei nada que esteja
**perdendo ou corrompendo dados hoje**. Em particular:

- **Injeção de SQL: risco muito baixo.** Não há um único ponto onde `req.query/body/params` entre
  cru numa string SQL. Todas as interpolações `${...}` são placeholders (`?,?,?`) ou nomes de
  coluna/tabela vindos de listas brancas fixas.
- **XSS: superfície mínima.** Zero `dangerouslySetInnerHTML`, zero `eval`, e apenas **um** `href`
  dinâmico no sistema inteiro (ver F-2). Todo o resto é escapado pelo React.
- **Transações:** disciplina consistente (`BEGIN/COMMIT/ROLLBACK`) em quase toda escrita múltipla,
  com auditoria dentro da mesma transação.
- **Dinheiro (`financeiroController`):** o backend **recalcula** todos os valores (nunca confia na
  conta do front); nomes de coluna de UPDATE dinâmico saem de whitelist; trilha por parcela e por
  lançamento; bloqueios contra editar/excluir o que já foi pago.
- **Autenticação:** reconfere o usuário no banco a cada requisição (revogação imediata), sessão
  única por dispositivo, bcrypt custo 12, política de senha forte, resposta genérica no
  "esqueci a senha".
- **Higiene de Git:** `.gitignore` cobre `.env`, `backups/`, `deploy/` (com senhas de cliente),
  `memory/`. Nenhum segredo real versionado.

As lacunas são de **maturidade operacional** e de **alguns pontos pontuais** abaixo — não de
arquitetura podre.

---

## 3. Achados por gravidade

### 🔴 Alto — resolver antes de colocar mais clientes

| # | Achado | Onde | Risco |
|---|--------|------|-------|
| **F-1** | **`salvarPermissoes` sem transação.** Faz `DELETE FROM permissoes WHERE usuario_id=?` e depois um **loop de ~75 INSERTs** no `pool` (sem `beginTransaction`). Se um INSERT falhar ou o processo cair no meio, o usuário fica **com permissões parciais ou zeradas**, sem volta. | `configuracaoController.js:479` | Um admin editando permissões pode travar ou bagunçar o acesso de alguém. Perda de configuração. |
| **F-2** | **XSS armazenado via `javascript:` no link da audiência virtual.** `link_virtual` é digitado pelo usuário e renderizado como `<a href={a.link_virtual}>`. Um usuário com `audiencias/cadastrar` pode gravar `javascript:...` como link; quem abrir a audiência executa o script na origem do sistema (e o token JWT está no `sessionStorage`). | `frontend/.../PastaDetalhe.js:1312` (input em `Audiencias.js`) | Roubo de sessão / ações no navegador de outro usuário. Precisa de usuário interno mal-intencionado, mas é real. |
| **F-3** | **Dependências desatualizadas e sem processo de atualização.** `npm audit`: backend 14 vulnerabilidades (6 altas — `tmp` path traversal, `qs` via `express`, `uuid`), frontend 11 (6 altas — todas de build: `postcss`, `nanoid`, `form-data`). A maioria é transitiva e de baixa exploração *hoje*, mas acumulam e ninguém está olhando. | `backend/package.json`, `frontend/package.json` | Janela crescente de vulnerabilidade conhecida. `npm audit fix` resolve quase tudo sem breaking change. |
| **F-4** | **Segredos em texto puro no banco.** Chaves de API (Claude/OpenAI), chave AASP, e o que mais entrar em Integrações, ficam como JSON claro em `configuracoes_integracoes.configuracoes`. Dumps do banco circulam entre 3 máquinas (consta na própria memória do projeto). | `configuracoes_integracoes` | Vazamento de um dump = vazamento das chaves de terceiros do escritório. |

### 🟠 Médio

| # | Achado | Onde | Risco |
|---|--------|------|-------|
| **F-5** | **Escalonamento admin → superusuário.** `criarUsuario`/`atualizarUsuario` aceitam `nivel` cru do body (`nivel \|\| 2`). O código bloqueia *alterar* um alvo `nivel=0`, mas **não impede definir `nivel=0`** num usuário comum. Um admin pode criar/promover alguém a superusuário (nível 0 = acesso total, fora dos controles de "super invisível/intocável"). | `configuracaoController.js:385, 421` | Quebra do modelo de separação super × admin. Depende de quanto você confia nos admins. |
| **F-6** | **`/pessoas/enviar-email` é um relay aberto.** Qualquer usuário com `pessoas/visualizar` envia e-mail com assunto/corpo/anexos (PDF/DOC/imagem) para **qualquer endereço**, pelo SMTP do escritório. Não há vínculo com o e-mail cadastrado da pessoa. É logado (`log_emails`), o que ajuda na atribuição. | `pessoasController.js:1892` | Spam pela reputação do domínio do escritório; canal de exfiltração de dados. |
| **F-7** | **OOM/DoS no upload de anexos.** O multer do "Enviar e-mail" tem `fileSize: 20 MB` **por arquivo** e `files: 20` → até **400 MB carregados em RAM** antes de o controller checar o total. Numa instância de 512 MB, um request derruba o backend do cliente. A checagem de "soma > 20 MB" acontece **depois** de o multer já ter bufferizado tudo. | `pessoasController.js:60` | Um request (acidental ou proposital) tira o sistema do ar. |
| **F-8** | **Sem rate limit nos endpoints públicos além do login.** `/auth/esqueci-senha` (dispara e-mail a cada chamada → email bombing / abuso de SMTP), `/auth/validar-token`, `/auth/redefinir-senha` sem limitador. E **nenhum teto por usuário autenticado** — um usuário pode marretar a listagem pesada de Publicações ou o relay de e-mail sem freio. | `routes/index.js` | Abuso de recurso, email bombing, degradação. |
| **F-9** | **Reset de senha não encerra sessões ativas.** `redefinirSenha` e `trocarSenha` trocam o hash mas não limpam `usuarios.sessao_atual`. Quem já tinha um token válido continua logado por até 8 h — mesmo cenário em que o usuário reseta a senha *porque* suspeita de invasão. | `authController.js:416, 452` | A troca de senha não corta o acesso de quem já entrou. |
| **F-10** | **Performance da listagem de Publicações.** A query tem ~12 subconsultas correlacionadas por linha, várias com `REPLACE(REPLACE(REPLACE(numProc,...)))` — que **não usa índice**. Com `tblproc` pequeno ainda vai; degrada conforme o volume cresce (você mesmo previu dobrar). | `publicacoesController.js:364` | Lentidão crescente na tela mais usada. |
| **F-11** | **SSRF via configuração de integração.** As URLs de DataJud/CNJ/AASP vêm de `configuracoes_integracoes` (admin). Um admin pode apontar para `169.254.169.254` (metadata da nuvem) ou serviços internos. Só admin configura, mas não há allowlist de host. | `datajudService`, `cnjService`, `aaspService` | Um admin comprometido alcança a rede interna / credenciais da instância. |

### 🟡 Baixo / higiene

- **F-12** — `Content-Disposition: filename="${modelo.nome}.docx"` sem sanitizar no download de modelo
  (`documentosController.js:160`); nome do modelo é definido por admin. Injeção de header de resposta (menor).
- **F-13** — `helpers.formatarData` / `formatarDataHora` / `dataParaMySQL` têm bugs de fuso e de
  ordem de campos, mas são **código morto** (exportados, nunca usados). Remover.
- **F-14** — `POST /auth/criar-admin` fica aberto enquanto não existir nenhum `nivel=1` (só o
  superusuário conta). Se um dia todos os admins forem apagados, o endpoint reabre publicamente.
  Adicionar checagem de `setup_concluido`.
- **F-15** — `esqueciSenha` vaza existência do usuário no ramo "usuário existe mas não tem e-mail"
  (mensagem específica em vez da genérica).
- **F-16** — Chave pública do DataJud embutida no código (`datajudService.js:32`). É de fato pública
  (publicada pelo CNJ), mas é um padrão ruim — se um dia colarem uma chave real ali, ela vai pro Git.
- **F-17** — Órfãos possíveis nas tabelas polimórficas sem FK (`historico_atendimento`,
  `log_comunicacoes`, `audiencia_testemunhas` já tem FK, mas várias outras não) quando uma pessoa
  é excluída fisicamente. Impacto: linhas de histórico apontando para pessoa inexistente.
- **F-18** — `tblproc.numProc` **não tem UNIQUE**. O controller checa duplicidade na aplicação, mas
  dois cadastros simultâneos com o mesmo número passam os dois. Baixa probabilidade.
- **F-19** — Sem *error boundary* geral no frontend: um erro de render numa tela vira tela branca
  (o boundary atual só cobre falha de carregamento de chunk).
- **F-20** — `connectionLimit: 15` no pool + MySQL na mesma máquina de 512 MB. É o teto de escala
  atual; já aparecem avisos de saturação (`pool.on('enqueue')`).

---

## 4. Observações de arquitetura (não são bugs)

1. **Multi-instância, não multi-tenant.** Um banco/instância por cliente. Cada cliente novo =
   mais um deploy, patch, backup e monitoramento manuais. Some fast acima de ~5–10 clientes.
2. **Permissão por módulo, quase sem escopo por linha.** Quem tem `financeiro/visualizar` vê o
   financeiro de **todos** os processos; idem pessoas, publicações (com exceção de
   prazos/tarefas/agenda que têm "ver todos", e publicações que tem atribuição). Pode ser a
   intenção (escritório pequeno, todos veem tudo) — mas um estagiário com o módulo vê tudo dele.
3. **Deploy manual.** Build no PC, subir `build/` pronto (`npm run build` trava a Lightsail).
   Sem CI, sem staging, sem rollback automático.
4. **Sem testes automatizados.** "Build não é teste" é regra recorrente — toda verificação é manual.
5. **Observabilidade = `console.log`.** Sem rastreio de erro (Sentry etc.), sem alerta de queda,
   sem métrica. Uma queda às 2h da manhã só é descoberta pelo cliente.
6. **Backup:** existem dumps em `backups/`, sem evidência de rotina automática nem de teste de
   restauração.
7. **LGPD:** sistema jurídico com CPF e dados pessoais de milhares de pessoas. A IA (opt-in, BYOK,
   desligada por padrão) envia texto de publicação a provedor nos EUA quando ligada — precisa de
   base legal documentada.

---

## 5. O que está bem-feito (para não perder)

- Parametrização de SQL disciplinada; listas brancas para identificadores dinâmicos.
- Transações + auditoria atômica em toda escrita relevante.
- Backend recalcula dinheiro; nunca confia no cliente.
- Auth reconfere no banco a cada request; sessão única; bcrypt 12.
- `.gitignore` correto; segredos fora do Git.
- Exclusões checam dependentes e dão mensagem amigável em vez de estourar FK.
- Upload de logo valida os *magic bytes* (não a extensão).
- Rate limit de login por **usuário** (não por IP) — pensado para NAT de escritório.
- Frontend sem `innerHTML`/`eval`; code-splitting já feito.
- SQL de migração reaplicável e multi-instância.

---

## 6. Recomendações (nesta ordem)

**Bloco 1 — antes de qualquer cliente novo (1–2 semanas)**
1. **F-1**: pôr `salvarPermissoes` em transação com INSERT multi-linha único. (baixo risco, alto ganho)
2. **F-2**: validar o esquema de `link_virtual` (só `http`/`https`) no salvar **e** no render.
3. **F-7**: baixar o limite do multer de anexos para ~8 MB/arquivo e ~8 arquivos; validar o total
   antes de bufferizar.
4. **F-8**: limitador em `/auth/esqueci-senha` (ex.: 5/hora por login+IP) e um teto global por
   usuário autenticado, generoso, chaveado pelo id do JWT.
5. **F-3**: rodar `npm audit fix` (sem `--force`) nos dois `package.json`, testar, subir. Criar o
   hábito mensal.
6. **F-9**: no reset de senha, `UPDATE usuarios SET sessao_atual = NULL`.
7. **F-6**: restringir `/pessoas/enviar-email` a um e-mail cadastrado da pessoa selecionada, ou
   exigir permissão dedicada + rate limit.

**Bloco 2 — fundação operacional (paralelo)**
8. **Backup automático off-site + teste de restauração** documentado (mensal).
9. **Monitoramento**: uptime externo (UptimeRobot/healthcheck) + captura de erro (Sentry no
   backend e no frontend).
10. **F-4**: cifrar as chaves de integração em repouso (ex.: `AES-256-GCM` com uma chave só no
    `.env`), decifrando só na hora de usar.
11. **F-5**: travar `nivel` a uma lista (`[1,2,3]`) em criar/editar usuário.

**Bloco 3 — antes de escalar de verdade**
12. Testes automatizados dos fluxos críticos: login, criar processo, criar/concluir prazo,
    receber parcela, gerar documento.
13. **F-10**: materializar `numProc` sem pontuação numa coluna indexada (`numProc_norm`) e casar
    por ela, em vez de `REPLACE(REPLACE(REPLACE(...)))`.
14. Deploy: script único versionado + ambiente de *staging* que espelha produção.
15. Revisar o modelo multi-instância vs. multi-tenant antes de passar de ~10 clientes.
16. Revisão de segurança formal (pentest) com foco em LGPD, dado o tipo de dado que o sistema guarda.

**Nada nas recomendações apaga ou reescreve dado.** Cada item do Bloco 1 é uma mudança pequena,
localizada, com rollback trivial — e deve ir para produção uma de cada vez, testada nas duas
instâncias.
