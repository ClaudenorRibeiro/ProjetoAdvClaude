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
  vez. É o destino padrão de qualquer commit desta IA e dos scripts locais
  `salvar_pc_casa_RASCUNHO_no_Git.bat` / `salvar_pc_escrit_RASCUNHO_no_Git.bat`.
- Os scripts `salvar_pc_casa_no_Git.bat` / `salvar_pc_escrit_no_Git.bat`
  (sem "RASCUNHO" no nome) enviam direto para `main` com `--force` — são
  de uso exclusivo e manual do usuário, quando ele decide oficializar uma
  versão. A IA nunca dispara isso por conta própria.
- Cada envio bem-sucedido para `main` por esses scripts cria uma tag
  `v-DDMMYY-HHMM`, mantendo sempre as 10 mais recentes (local e remoto),
  para permitir voltar a uma versão anterior se algo quebrar.

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
