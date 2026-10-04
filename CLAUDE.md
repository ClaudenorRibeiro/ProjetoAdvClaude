# Sistema de Advocacia — Instruções permanentes para a IA

Este arquivo é lido automaticamente por qualquer sessão do Claude Code neste
projeto (nuvem ou local). Ele registra as exigências do usuário (Claudenor)
para este sistema. **Vale para qualquer IA/assistente que trabalhe neste
repositório, em qualquer sessão futura.**

## 0. Regra de certeza absoluta (a mais importante)

Se a IA não tiver certeza absoluta sobre uma informação, código ou fato,
deve responder estritamente **"Não sei"**. Nunca inventar fatos, nomes de
tabela/coluna, comportamento de código ou solução para preencher lacunas.
Toda afirmação e toda ação precisa se basear em fato verificado — no
código, no arquivo, na configuração real, ou no banco (via
`estrutura_banco.sql`). Se não for possível confirmar algo diretamente
(estado do servidor, do banco, de uma config), a IA não deve supor: ou
verifica na fonte, ou pede para o usuário verificar e espera a resposta.
Diante de qualquer incerteza, dizer explicitamente "não tenho certeza,
preciso confirmar" antes de prosseguir.

**Erro real já cometido (25/09/2026), para nunca repetir:** uma auditoria
listou "achados" com base no resumo de agentes/relatórios, sem reler o
código atual linha por linha antes de apresentar como fato. Dois desses
itens ("achados confirmados") eram, na verdade, falsos alarmes — o código
já tratava o problema corretamente — porque o código tinha mudado (o
usuário mesclou um commit grande dele por cima) depois que o achado foi
gerado. Regra permanente: um relatório de auditoria (seu ou de um agente)
**expira no instante em que o código muda**. Antes de apresentar qualquer
"achado" ou item de lista como fato ao usuário — inclusive itens já
listados antes numa conversa — reler o trecho exato no arquivo atual.
Nunca reciclar a conclusão de uma auditoria anterior sem reconferir contra
o código de agora.

**Regra eterna (pedido do usuário, 02/10/2026): NUNCA CONFIAR EM MEMÓRIAS, SEMPRE
CONFERIR UMA INFORMAÇÃO PARA TER CERTEZA, NUNCA SUPOR NADA.** Isso vale para a memória da
própria IA, para o resumo de uma conversa anterior, para resultados de análises passadas e
para qualquer "já sabemos que...". Antes de afirmar um fato que pode ter mudado (estado do
banco, de um servidor, de um arquivo, resultado de teste), conferir na fonte AGORA ou pedir
ao usuário que confira. Não inventar explicação para conciliar dois resultados: se não se
sabe o que aconteceu entre eles, dizer "não sei". **Erro real (02/10/2026):** a IA repetiu
"seu banco local está desatualizado" a partir de um diagnóstico antigo; o diagnóstico mais
recente já mostrava o banco em dia, e a IA ainda inventou uma explicação ("alguém atualizou").

**Erro real (02/10/2026, 2ª vez que o usuário reclama disto):** a IA descreveu "um campo `ver_todos_processos` no cadastro do usuário" como
se fosse algo visível, sem ter conferido se esse campo aparece na tela. Não aparecia (só existia como coluna do banco, sem uso). Regra: **antes de
falar de qualquer tela, botão, campo ou comportamento, a IA lê o código que o define (e o `estrutura_banco.sql`, quando for banco) e só então afirma.**
Nada de descrever de memória ou "por dedução" do nome de uma coluna ou variável.

## 1. Nunca codar sem autorização prévia

- A IA nunca escreve/altera código sem autorização explícita do usuário
  para aquela tarefa específica.
- Sempre que o usuário pedir algo, a IA primeiro **explica o que entendeu
  do pedido** (em português simples, sem jargão — o usuário é leigo em
  código) e só começa a codar depois que o usuário confirmar/autorizar.
- Antes de propor qualquer alteração, analisar o código inteiro (front e
  back, e o banco quando aplicável) relevante à mudança, e avaliar efeitos
  colaterais: o sistema é grande e complexo, o usuário pode ter esquecido
  de alguma rotina já existente, e o pedido dele pode conflitar com algo
  que já está implementado. Se identificar que o pedido do usuário
  prejudica outra parte do sistema, avisar e sugerir correção antes de
  prosseguir — não apenas obedecer cegamente.
- Antes de entregar a resposta final (código ou explicação), fazer uma
  análise passo a passo de possíveis bugs/inconsistências que a mudança
  poderia introduzir, e corrigir antes de mostrar o resultado.
- Antes de criar uma rotina nova, verificar se ela já existe no código —
  não duplicar lógica.
- Nunca explicar respostas colando trechos de código no chat (o usuário
  não lê código) — explicar em linguagem simples o que foi/será feito.
- **O usuário só usa o Prompt de Comando (cmd.exe) no Windows — nunca
  PowerShell.** Sempre que for preciso pedir para ele rodar algo no
  terminal do PC local (ex.: `git status`), dar o comando/instrução em
  formato cmd (ex.: abrir a pasta no Explorador de Arquivos, digitar `cmd`
  na barra de endereço e Enter para abrir o Prompt de Comando ali; nunca
  sugerir "Abrir janela do PowerShell aqui" nem sintaxe de PowerShell).

## 2. Git — fluxo de branches

- **`main`**: versão oficial em produção. A IA só envia (push) para `main`
  quando o usuário disser explicitamente **"PODE SUBIR"**.
- **`rascunho`**: branch fixa e permanente para trabalho em andamento. A
  IA pode enviar (push) livremente para ela, sem pedir autorização a cada
  vez. É o destino padrão de qualquer commit desta IA.
  (Existiram scripts locais `salvar_pc_casa_RASCUNHO_no_Git.bat` /
  `salvar_pc_escrit_RASCUNHO_no_Git.bat`, que mandavam uma edição feita
  manualmente pelo usuário no PC — sem passar pela IA — direto para o
  rascunho. Excluídos em 28/09/2026 a pedido do usuário, por decisão dele
  de nunca editar código diretamente no PC fora de uma sessão da IA. Se
  algum dia precisar desse caminho de novo, terá que ser recriado.)
- Os scripts `salvar_pc_casa_no_Git.bat` / `salvar_pc_escrit_no_Git.bat`
  (sem "RASCUNHO" no nome) enviam direto para `main` com `--force` — são
  de uso exclusivo e manual do usuário, quando ele decide oficializar uma
  versão. A IA nunca dispara isso por conta própria.
- Cada envio bem-sucedido para `main` por esses scripts cria uma tag
  `v-DDMMYY-HHMM`, mantendo sempre as 10 mais recentes (local e remoto),
  para permitir voltar a uma versão anterior se algo quebrar.

### 2.1 Scripts de sincronia PC ↔ GitHub (corrigido e testado em 28/09/2026)

O fluxo real de trabalho do usuário é: a IA só trabalha no `rascunho` → o
usuário baixa o rascunho pro PC (`salvar_RASCUNHO_do_GIT_no_pc.bat`) e
testa → se estiver tudo certo, manda pra `main`
(`salvar_pc_casa_no_Git.bat` / `salvar_pc_escrit_no_Git.bat`) → depois
replica manualmente nas instâncias AWS.

Havia um bug real nesse fluxo, corrigido nesta data: os scripts de mandar
pra `main` só detectavam arquivo alterado na pasta. Se o usuário só
baixasse o rascunho e testasse **sem mexer em nada**, a pasta ficava
"limpa" (nada pendente pra commitar) e o script dizia "nenhuma alteração
encontrada" e não enviava nada pra `main` no GitHub — mesmo a pasta já
estando com o rascunho testado. Corrigido: agora os dois scripts de mandar
pra `main` também comparam (só um `git fetch` de leitura, nunca aplicam
nada sozinhos) a HEAD local com a `main` atual do GitHub, e enviam quando
forem diferentes, mesmo sem arquivo pendente.

O script de puxar o rascunho (`salvar_RASCUNHO_do_GIT_no_pc.bat`) também
não garantia em qual branch local estava operando (aplicava o rascunho em
cima de "qualquer branch que estivesse ativo" no PC). Corrigido: agora ele
sempre força a pasta para o branch `main` antes de aplicar o rascunho por
cima. **Não existe (e não deve ser criado) um branch local `rascunho` no
PC do usuário** — `rascunho` só existe de verdade no GitHub; no PC, o
`main` local apenas recebe temporariamente o conteúdo do rascunho para
teste.

Essa correção foi validada com testes reais num repositório Git isolado
(4 cenários: puxar rascunho e mandar pra main sem mexer em mais nada,
edição real seguida de envio, rodar o envio duas vezes seguidas sem nada
novo, e puxar o rascunho estando em outro branch por engano) — não é
suposição.

**Isso é código, não opinião — e por isso pode expirar (regra 0):** antes
de afirmar esse comportamento como fato numa sessão futura, reconferir o
conteúdo atual dos 3 arquivos na raiz do projeto
(`salvar_RASCUNHO_do_GIT_no_pc.bat`, `salvar_pc_casa_no_Git.bat`,
`salvar_pc_escrit_no_Git.bat`), porque se algum deles for editado de novo
depois desta data, esta descrição deixa de valer.

## 3. Banco de dados (MySQL)

- O usuário só atualiza o banco **manualmente pelo HeidiSQL**. A IA nunca
  roda comandos que alterem o banco diretamente — sempre entrega o script
  SQL pronto para o usuário copiar e colar no HeidiSQL.
- Sem middleware/ORM — acesso ao banco é manual (usando `mysql2`
  diretamente), não usar Sequelize/Prisma/TypeORM etc.
- Toda transação multi-tabela no código precisa usar
  `BEGIN` / `COMMIT` / `ROLLBACK` explícitos. Nunca fazer múltiplos
  `UPDATE`/`INSERT`/`DELETE` relacionados fora de uma transação.
- **Nenhuma exclusão pode deixar órfãos.** Antes de apagar um registro,
  verificar TODAS as tabelas com vínculo (inclusive relações polimórficas
  sem FK declarada) e tratar essas amarrações primeiro (mover, apagar em
  cascata deliberadamente, ou bloquear a exclusão).
- **Nomes de tabela sempre em letras minúsculas** — no banco e no código,
  sem exceção.
- Sem redundância: não criar tabelas ou colunas desnecessárias; tudo
  precisa ficar harmonizado e sincronizado com o que já existe.
- O arquivo `estrutura_banco.sql` (raiz do projeto) precisa estar **sempre
  100% igual ao banco local real**. Toda vez que uma alteração de banco for
  proposta (script para o usuário rodar no HeidiSQL), o `estrutura_banco.sql`
  precisa ser atualizado imediatamente junto.
- O sistema roda em várias instâncias idênticas (local + AWS). Scripts SQL
  precisam ser escritos pensando em serem executados em todas elas,
  sempre primeiro testados no ambiente local, depois replicados manualmente
  pelo usuário nas instâncias AWS.

## 4. Padrões de código e arquitetura

- Sistema precisa ser escalável, robusto, bem codificado, sem gambiarras,
  e responsivo (celular, tablet, notebook, PC).
- Manter o padrão de code-splitting: toda tela nova entra sob demanda
  (lazy load). Ao adicionar uma tela nova, seguir esse padrão sem quebrar
  o carregamento das demais — e explicar antes de codar.
- Ao modificar qualquer linha/rotina, ter muito cuidado para não quebrar
  outros setores do sistema que dependam dela (front, back ou banco).
- **Campo novo em formulário com modo "Detalhes" (somente leitura)**: todo
  campo novo adicionado a um formulário que tenha modo de visualização
  travada (ex.: ModalPessoa em `Pessoas.js`, telas de Audiências) precisa
  também receber a trava de leitura (`somenteLeitura={leitura}` /
  `disabled`) — senão fica editável indevidamente no modo "só ver".
  Conferir isso sempre que mexer nesses formulários.
- "Build não é teste": rodar a bateria de verificação automática
  (`node _verificacao/rodar.mjs`, quando existir) e conferir sintaxe/build
  antes de qualquer entrega, mas isso não substitui teste manual do
  usuário — que testará apenas a manutenção em foco, contando com a IA
  para não ter quebrado o resto do front/back/banco.

## 5. Stack técnica (verificado nos `package.json`)

- **Backend**: Node.js + Express, MySQL via `mysql2` (sem ORM), JWT,
  bcryptjs, nodemailer, node-cron, AWS S3 SDK, docxtemplater/docx,
  exceljs.
- **Frontend**: React 18 + Vite, react-router-dom, react-big-calendar,
  react-select, react-toastify, date-fns.
- Estrutura: `backend/src/{controllers,routes,services,middleware,config,utils,scripts}`,
  `frontend/src/{pages,components,context,hooks,services,utils}`.

## 6. Arquivos de sessões anteriores na raiz — NÃO são fonte de verdade

Existem arquivos de anotações de sessões anteriores na raiz do projeto:
`REVISAO-CODEX-10-09-2026.md`, `RESUMO-SESSAO-2026-09-14_16-33-38.txt`,
`RELATORIO-ALTERACOES-2026-09-13_20-25-59.txt`,
`ALTERACOES A SEREM FEITAS NO BANCO 130926-2022.txt` e
`PROMPT - cadastrar pessoa fisica-juridica.txt`.

**O usuário confirmou (25/09/2026) que TODOS esses arquivos estão
defasados/ultrapassados.** Nenhuma afirmação neles (bugs pendentes,
scripts SQL ainda não rodados, funcionalidades implementadas, decisões
tomadas) deve ser tratada como estado atual do sistema. Antes de citar
qualquer coisa desses arquivos como fato, a IA precisa reconferir
diretamente no código-fonte, no `estrutura_banco.sql` e/ou perguntar ao
usuário — nunca repetir o conteúdo deles como se fosse a situação
presente. Eles só têm valor como histórico de contexto (o que já foi
tentado/discutido no passado), não como checklist confiável do que falta
fazer.

## 7. Scripts: sempre indicar a importância (pedido do usuário, 02/10/2026)

O usuário já apagou, sem saber para que servia, um script que um teste usava.
Por isso, **todo script que a IA criar ou alterar** (SQL para o HeidiSQL, `.bat`, `.sh`)
precisa trazer, nas primeiras linhas, um aviso claro:
- `IMPORTANTE — NÃO APAGAR` + para que serve + quando e quem roda; ou
- `TEMPORÁRIO — pode apagar depois de <condição>`.

O índice `SCRIPTS-IMPORTANTES.txt` (raiz) lista todos; a IA o atualiza sempre que criar,
renomear ou remover um script. Nenhum teste pode depender de arquivo que não está no Git.

## 8. Bateria de testes (`node quality/run.mjs`) — regras do usuário (02/10/2026)

- **Teste pulado = REPROVADO.** A bateria não aprova o que não verificou. Não usar
  `skip`/`todo`/`only`/`fixme` em teste algum (a largada da bateria já barra) e a
  bateria reprova se qualquer ferramenta relatar teste pulado, pendente ou não executado.
- **A bateria prepara o que precisa**, em vez de pular: instala as dependências do npm e,
  nos perfis `completo`/`profundo`, o Chromium de teste. Nada de "instale o programa X
  no PC": se um teste precisa de uma ferramenta, ela vem pelo `npm` ou é instalada pela bateria.
- **Erro é erro, não importa a origem ou a idade.** Falha encontrada pela bateria é corrigida,
  mesmo que já existisse antes. Não existe "já falhava" como justificativa.
- No branch `rascunho` a IA pode alterar e enviar sem pedir autorização a cada vez;
  no `main` a IA nunca mexe (só o usuário, pelos scripts dele, ou com "PODE SUBIR").
- O horário do banco é o de Brasília: `backend/src/config/database.js` fixa o fuso
  (`-03:00`) em toda conexão, para `CURDATE()`/`NOW()` concordarem com o escritório
  mesmo se o MySQL rodar em UTC.
- **Acessibilidade em todas as telas** (`frontend/e2e/qualidade.spec.js`): a bateria varre cada
  tela com o verificador axe e reprova por violação séria/crítica (contraste mínimo 4,5:1,
  campo de formulário sem rótulo, área rolável sem teclado). **Toda tela nova entra na lista
  `TELAS_LOGADAS`/`TELAS_PUBLICAS`.** Campo novo: `aria-label` (ou `<label htmlFor>`); texto
  secundário usa `#5b6472` ou mais escuro, nunca cinzas claros como `#888`/`#94a3b8`.
- **Dependências (`backend/package.json`)**: `multer` está na versão 2; `overrides` troca `unzipper` e
  `uuid` por versões novas dentro do `exceljs`/`node-cron` (zera o `npm audit`). **Não** trocar o
  `archiver` do `exceljs` pela versão 7: ela quebra a exportação de Excel (testado). Depois de
  mexer em dependência, rodar a bateria completa — os testes de Excel, e-mail e upload pegam o problema.
- **Nome indefinido no código = reprovado** (`quality/check-nomes-indefinidos.mjs`): o TypeScript, instalado
  no frontend, lê os `.js` do frontend e do backend e reprova qualquer função/variável/componente usado sem
  existir (erro "Cannot find name"). Origem: `impedirAlteracaoDataPorRoda` estava só chamada, nunca definida, e
  derrubava a tela ao cadastrar testemunha na ata. O TypeScript fica só no frontend porque o `backend/.npmrc`
  (`omit=optional`) impediria a instalação do programa nativo dele.


## 9. Plano de testes de Processos (CONCLUÍDO em 03/10/2026) e PENDÊNCIAS ABERTAS (pedido do usuário)

O plano numerado (A1…D1) de `PLANO-TESTES-PROCESSOS.md` (raiz) foi concluído: tudo da tela de Processos entrou na bateria. Falta só o usuário rodar
`salvar_RASCUNHO_do_GIT_no_pc.bat` + `TESTAR-COMPLETO.bat` e enviar o "RESUMO DA BATERIA". Regra do protocolo (vale para trabalhos parecidos): ao achar erro,
PARAR e combinar o ajuste com o usuário antes de corrigir. Nada de desmembrar arquivos grandes (decisão dele) e nada no `main`.

**LEMBRETE OBRIGATÓRIO (pedido do usuário, 04/10/2026):** o usuário disse que vai tratar as pendências abaixo **mais para frente, depois de ajustar alguns erros
que o sistema está apresentando**. A IA deve **lembrá-lo delas** no início de uma sessão nova assim que ele terminar de falar dos erros atuais, e sempre que ele
perguntar "o que falta". Só tirar da lista com o OK dele. Detalhes de cada item: seção "PENDÊNCIAS GERAIS" do `PLANO-TESTES-PROCESSOS.md`.

- **P1** — Validações específicas, módulo a módulo (servidor responde 400 claro, nunca "Erro interno": campo que não é texto, texto longo demais, só espaços,
  datas/valores/ids inválidos, processo/registro inexistente = 404). Já feitos: Processos, Tarefas, Audiências, Perícias, Financeiro (aba da pasta).
  **Faltam: Pessoas, Prazos, Publicações, Documentos, Pendências de Docs., Dashboard, Relatórios, Configurações, Controle** (e conferir o resto do Financeiro:
  repasses, multa, contas, consulta). Modelo pronto: `backend/src/utils/camposTexto.js`.
- **P2** — Curingas do LIKE (`%` e `_`) nas buscas de todos os módulos fora de Processos (usar `escaparLike` em `utils/helpers.js`).
- **P3** — Paginação sem validação (`pagina`/`limite` inválidos → 500) nos outros módulos (usar `paginacao()` de `utils/helpers.js`).
- **P4** — Id que não é número (`/modulo/abc`) dando 500 nos outros módulos (devolver 404).
- **P5** — Migração do react-router para a versão 7 (adiada por decisão do usuário; `npm audit` do frontend mostra 2 avisos "média").
- **P6** — Informativo, sem ação (`log_documentos_gerados` sem chave declarada; busca por poucos dígitos casa CPF/CNPJ/telefone).
- **P7** — Verificar no servidor real se o PM2 reinicia sozinho após queda.
- **P8** — Decidir (só se ele quiser) o recurso "ver só os meus processos" (coluna `usuarios.ver_todos_processos` é vestigial).
- **Varredura da ficha da pessoa** (`ModalPessoa`, `Pessoas.js`, todas as abas/estados) — acessibilidade e validações; pertence ao módulo Pessoas.
- **Pastas vazias antigas (achado de 04/10/2026, decisão pendente do usuário):** no local e no Antônio existem 2.702 pastas SEM processo; 2.700 foram criadas de uma vez em
  28/06/2026 (números 1 a 8935, criador 24) e 2.627 têm "área do direito" preenchida — parecem pastas antigas importadas sem os processos. O Erick não tem nenhuma.
  Não apagar em lote sem a decisão dele. O sistema trata pasta vazia como "disponível" ao criar processo, mas a troca de número (`renumerarPasta`) a trata como ocupada.
  O script `sql_limpar_pastas_vazias_para_heidi.sql` só apaga os números listados nele (hoje o 9999).
