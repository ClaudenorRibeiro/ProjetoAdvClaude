# Sistema de Advocacia (ProjetoAdvClaude) — Instruções permanentes para a IA

Este arquivo é lido automaticamente por qualquer sessão do Claude Code neste
projeto. Registra as exigências do usuário (Claudenor, leigo em código, só
usa `cmd.exe` no Windows — nunca PowerShell). **Vale para qualquer
IA/assistente que trabalhe neste repositório, em qualquer sessão futura.**

> **Histórico detalhado:** este arquivo foi resumido em 06/11/2026. Todo o
> histórico de decisões, auditorias, testes e features feitas sessão a
> sessão (de 2026 até aqui) está preservado em `CLAUDE-HISTORICO.md`.
> Consulte-o quando precisar saber *como* ou *por que* algo foi feito, ou
> se um "achado"/decisão antiga parecer relevante — mas **sempre reconfira
> contra o código atual** (regra 0 abaixo: relatório antigo expira quando o
> código muda).

## REGRA Nº 1 — Fluxo de branches e publicação (vale para TODOS os
projetos do usuário, cada um com seu próprio branch de rascunho)

O usuário mantém **vários projetos totalmente separados e independentes**
(ProjetoAdvClaude, AC-Portaria, NovoJud-saas — e outros que vierem). O que
é pedido em um nunca tem relação com outro — nunca presumir, copiar ou
"portar" nada de um projeto para o outro por conta própria.

Em cada projeto existem dois branches: **`rascunho`** (neste projeto) —
onde a IA trabalha e pode dar `push` livremente, sem pedir autorização a
cada vez, desde que dentro do escopo já autorizado — e **`main`** —
a versão que vai para o servidor; a IA só dá `push` ali quando o usuário
disser explicitamente, na hora, **"PODE SUBIR"** (autorização anterior
não vale para a próxima vez).

Fluxo completo (confirmado 08/11/2026, vale em todos os projetos): (1) a
IA deixa o `rascunho` pronto; (2) o usuário baixa no PC, testa de ponta
a ponta e **aprova**; (3) só então, com **"PODE SUBIR"** na hora, atualiza-se
o `main`; (4) o usuário roda o SQL no HeidiSQL de cada banco de produção
(Antônio e Erick, se houver script novo); (5) o usuário mesmo atualiza o
servidor AWS. A IA nunca mexe na AWS. **“Apto para produção” = o rascunho
está testado e aprovado** — não é auditar servidor. Sem bateria completa
neste rascunho (quando houve mudança grande) e sem SQL local conferido,
o rascunho **não** está apto.

**Antes de afirmar algo sobre branches de qualquer projeto (quais
existem, em qual está o quê), sempre conferir com `git fetch` completo
(nunca clone raso/`--depth 1` sem buscar todos os branches) — nunca
supor pela memória ou por um clone parcial.**

## 0. Regra de certeza absoluta (a mais importante)

Se a IA não tiver certeza absoluta sobre uma informação, código ou fato,
deve responder estritamente **"Não sei"**. Nunca inventar fatos, nomes de
tabela/coluna, comportamento de código ou solução para preencher lacunas.
Toda afirmação e toda ação precisa se basear em fato verificado — no
código, no arquivo, na configuração real, ou no banco (via
`estrutura_banco.sql`). Se não for possível confirmar algo diretamente, a
IA não deve supor: ou verifica na fonte, ou pede para o usuário verificar.

**Regra eterna: NUNCA CONFIAR EM MEMÓRIAS, SEMPRE CONFERIR.** Isso vale
para a memória da própria IA, resumos de conversas anteriores, resultados
de análises passadas e qualquer "já sabemos que...". Um relatório de
auditoria (seu ou de um agente) **expira no instante em que o código
muda**: antes de apresentar qualquer "achado" como fato — mesmo um já
listado antes — reler o trecho exato no arquivo atual. Antes de falar de
qualquer tela, botão, campo ou comportamento, ler o código que o define
(e o `estrutura_banco.sql`, quando for banco) e só então afirmar. Nada de
descrever de memória ou "por dedução".

## 1. Nunca codar sem autorização prévia

- A IA nunca escreve/altera código sem autorização explícita do usuário
  para aquela tarefa específica.
- Sempre que o usuário pedir algo, a IA primeiro **explica o que entendeu
  do pedido** (português simples, sem jargão) e só começa a codar depois
  que o usuário confirmar.
- Antes de propor qualquer alteração, analisar o código inteiro (front,
  back e banco quando aplicável) relevante à mudança, e avaliar efeitos
  colaterais — o sistema é grande e complexo. Se o pedido prejudicar outra
  parte do sistema, avisar e sugerir correção antes de prosseguir.
- Antes de criar rotina nova, verificar se já existe — não duplicar
  lógica.
- Nunca colar trechos de código no chat — explicar em linguagem simples.
- **Procedimentos sempre em SEQUÊNCIA DE EXECUÇÃO:** lista numerada na
  ORDEM EXATA de execução, cada passo dizendo onde (HeidiSQL/cmd/tela) e o
  resultado esperado. Condições ("só se...") ficam dentro do passo certo.

## 2. Git — fluxo de branches

- **`main`**: produção. A IA só envia (push) quando o usuário disser
  explicitamente **"PODE SUBIR"**.
- **`rascunho`**: branch de trabalho. A IA pode enviar livremente, sem
  pedir autorização a cada vez. Destino padrão de qualquer commit da IA.
- Scripts `salvar_pc_*_no_Git.bat` (sem "RASCUNHO") enviam direto para
  `main` com `--force` — uso exclusivo e manual do usuário. A IA nunca
  dispara isso por conta própria.
- Não existe branch `rascunho` local no PC do usuário — só no GitHub; no
  PC o `main` local recebe o conteúdo do rascunho temporariamente p/ teste.

## 3. Banco de dados (MySQL)

- O usuário só atualiza o banco **manualmente pelo HeidiSQL**. A IA nunca
  roda comandos que alterem o banco — sempre entrega script SQL pronto.
- Sem ORM — acesso via `mysql2` direto (nunca Sequelize/Prisma/TypeORM).
- Toda transação multi-tabela usa `BEGIN`/`COMMIT`/`ROLLBACK` explícitos.
- **Nenhuma exclusão pode deixar órfãos.** Verificar TODAS as tabelas com
  vínculo (inclusive relações polimórficas sem FK declarada) antes de
  apagar um registro.
- **Nomes de tabela sempre em letras minúsculas**, sem exceção.
- Sem redundância: não criar tabelas/colunas desnecessárias.
- `estrutura_banco.sql` (raiz) precisa estar **sempre 100% igual ao banco
  local real**. Toda alteração de banco proposta atualiza esse arquivo
  junto.
- Sistema roda em várias instâncias idênticas (local + AWS). Scripts SQL
  são testados primeiro no local, depois replicados manualmente pelo
  usuário nas instâncias AWS.

## 4. Padrões de código e arquitetura

- Sistema escalável, robusto, sem gambiarras, responsivo (celular, tablet,
  notebook, PC).
- Manter code-splitting: toda tela nova entra sob demanda (lazy load).
- Ao modificar qualquer rotina, cuidado para não quebrar outros setores
  que dependam dela (front, back ou banco).
- **Campo novo em formulário com modo "Detalhes" (somente leitura)**:
  todo campo novo em formulário com modo de visualização travada precisa
  receber a trava (`somenteLeitura={leitura}` / `disabled`) também.
- "Build não é teste": rodar `node _verificacao/rodar.mjs` e conferir
  build antes de qualquer entrega, mas isso não substitui teste manual do
  usuário.

## 5. Stack técnica

- **Backend**: Node.js + Express, MySQL via `mysql2` (sem ORM), JWT,
  bcryptjs, nodemailer, node-cron, AWS S3 SDK, docxtemplater/docx,
  exceljs.
- **Frontend**: React 18 + Vite, react-router-dom, react-big-calendar,
  react-select, react-toastify, date-fns.
- Estrutura: `backend/src/{controllers,routes,services,middleware,config,utils,scripts}`,
  `frontend/src/{pages,components,context,hooks,services,utils}`.

## 6. Scripts: sempre indicar a importância

Todo script que a IA criar ou alterar (SQL, `.bat`, `.sh`) precisa trazer,
nas primeiras linhas, um aviso claro: `IMPORTANTE — NÃO APAGAR` + para que
serve + quando/quem roda; ou `TEMPORÁRIO — pode apagar depois de
<condição>`. O índice `SCRIPTS-IMPORTANTES.txt` (raiz) lista todos; a IA o
atualiza sempre que criar, renomear ou remover um script. Nenhum teste
pode depender de arquivo que não está no Git.

## 7. Bateria de testes (`node quality/run.mjs`)

- **Teste pulado = REPROVADO.** Não usar `skip`/`todo`/`only`/`fixme`.
- A bateria prepara o que precisa (npm, Chromium) em vez de pular/exigir
  instalação manual.
- **Erro é erro, não importa a origem ou a idade.** Não existe "já
  falhava" como justificativa.
- **Bateria completa só com autorização prévia:** rodar a bateria
  inteira (`node quality/run.mjs`) consome muito token. A cada ajuste a
  IA roda só os testes rápidos e dirigidos àquele ajuste; para rodar a
  bateria completa, **perguntar ao usuário antes**, mesmo que pareça
  necessário.
- No `rascunho` a IA pode alterar e enviar sem pedir autorização a cada
  vez; no `main` a IA nunca mexe (só o usuário, ou com "PODE SUBIR").
- Horário do banco é o de Brasília (`backend/src/config/database.js`,
  fuso -03:00).
- Acessibilidade em todas as telas (`frontend/e2e/qualidade.spec.js`):
  axe reprova violação séria/crítica (contraste mínimo 4,5:1, campo sem
  rótulo, área rolável sem teclado). Toda tela nova entra em
  `TELAS_LOGADAS`/`TELAS_PUBLICAS`. Todo teste de tela começa o título com
  `@critical` (senão a bateria reprova na largada).
- A janela da bateria NUNCA fecha sozinha (`cmd /k`); o resultado vai para
  `quality/test-results/ultima-bateria.txt`.
- `backend/.npmrc` tem `omit=optional`; cuidado ao trocar dependências que
  dependam de binário nativo (ex.: `archiver`/`exceljs` — não trocar pela
  v7, quebra exportação de Excel).

## 8. AWS / produção — REGRA ABSOLUTA

**NUNCA MEXER NA AWS por conta própria.** A IA não tem acesso aos
servidores (Erick e Antônio) e não conduz o usuário a mexer neles por
iniciativa própria. Só entrega script/passo de AWS quando o usuário
PEDIR, na hora que ele decidir. Erick e Antônio são PRODUÇÃO e ficam por
ÚLTIMO: só atualizados depois que o LOCAL estiver 100% ok e testado.

## 9. Política de versões

- Sempre a **versão estável mais recente, testada e com suporte** (Node:
  a LTS ativa). Antes de instalar/acrescentar biblioteca, conferir a
  versão estável mais recente e o calendário de suporte (`npm view
  <pacote> dist-tags`, `npm outdated`).
- A IA avisa quando encontrar versão ultrapassada ou sem suporte.
- Atualização de versão grande é feita **uma de cada vez**, com a bateria
  completa (inclusive no Windows) como porteira. Nada de misturar várias
  trocas num commit só.

## 10. Como o usuário trabalha

- Português simples, SEM código no chat; instruções em lista numerada na
  ordem de execução; só `cmd.exe`.
- Ao achar falha na bateria: **PARAR e combinar com o usuário antes de
  corrigir.**
- Resumo do dia: **SÓ QUANDO O USUÁRIO PEDIR** — nunca gerar, oferecer ou
  perguntar se quer o resumo por conta própria.
- Teste que depende de ordem/corrida compartilhada: o banco de teste é
  compartilhado entre arquivos de teste — não assumir "a primeira pasta
  que casa" ou "o último botão com o mesmo nome" sem escopo.
- Regra de trabalho geral: testes rápidos e dirigidos a cada ajuste;
  bateria completa só depois de muitas alterações (usuário roda
  `TESTAR-COMPLETO.bat`).
- Regra para auditorias: correção que obriga mexer em muitos pontos do
  código para um risco baixo não se faz sem decisão explícita do usuário.

## 11. Estado atual do projeto (resumo; ver CLAUDE-HISTORICO.md para detalhes)

Sistema de advocacia completo e maduro, em produção (Erick e Antônio),
cobrindo: Pessoas (física/jurídica), Processos/Pastas (incl. **apensos**),
Prazos, Tarefas, Audiências (com Ata), Perícias, Financeiro (acordos,
alvarás, recebimento avulso, multas, repasses), Documentos (geração via
modelo .docx/PDF), Publicações (AASP/CNJ-DJEN + sugestões), Pendências de
Documentos, Avisos aos Clientes, Agenda (+ Google Agenda), Relatórios
(construtor, agrupamento, exportação, agendamento), Dashboard, Controle
(fóruns/varas/auxiliares), Configurações, Vigilância de processo, aviso
diário de andamentos do DataJud, integração DataJud/CNJ.

- Última bateria completa no Windows: **08/11/2026, 12/12** (rascunho atual: Vigilância, horário na Agenda, Tarefas, Qtde Proc e o que veio depois de 29/10).
- Pendências conhecidas em aberto (conferir com o usuário antes de agir):
  - **P7**: conferir PM2 no servidor real — só no fim de semana, com aviso
    prévio do usuário.
  - Rotas "só login" sem trava de permissão de módulo — usuário decidiu
    "deixa como está"; não propor de novo.
- Regra "DOIS SISTEMAS IDÊNTICOS" foi **substituída** em 25/10/2026 pela
  regra "UMA SESSÃO = UM SISTEMA": o ProjetoAdvClaude (mono) e o
  NovoJud-saas **não são mais obrigados a ser idênticos**. Nesta sessão
  (mono) só se altera o mono — nunca o SaaS nem o site, e nunca "portar"
  um pedido para o outro por conta própria. Ler o outro repositório só
  como consulta, com autorização explícita do usuário, sem alterar nada.

Sempre que uma feature nova, uma correção ou uma decisão importante for
concluída, registre um resumo curto em `CLAUDE-HISTORICO.md` (não neste
arquivo) seguindo o padrão já usado lá — e, se for uma regra permanente
nova, inclua-a aqui também.
