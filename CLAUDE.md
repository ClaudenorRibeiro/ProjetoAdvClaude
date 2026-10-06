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

- **Procedimentos sempre em SEQUÊNCIA DE EXECUÇÃO (pedido do usuário, 04/10/2026):**
  toda vez que a IA passar instruções de o que fazer (atualizar sistema, rodar scripts, testar, etc.), entregar uma lista numerada na ORDEM EXATA em que o usuário
  executa, cada passo dizendo onde (HeidiSQL/cmd/tela) e o resultado esperado. Condições ("só se...") ficam dentro do passo, no lugar certo da sequência — nunca
  espalhadas em texto solto fora de ordem.

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
- **A janela da bateria NUNCA fecha sozinha (pedido do usuário, 05/10/2026):** ele esbarrou numa tecla no `pause` final e a janela fechou, perdendo o resultado. `TESTAR-COMPLETO.bat` e `TESTAR-SISTEMA.bat` agora terminam com `cmd /k` (só fecha no X) e
  `quality/run.mjs` copia tudo o que aparece na tela para `quality/test-results/ultima-bateria.txt` (fora do Git; só a saída padrão, a de erro dos programas filhos fica só na tela). Os outros `.bat` (iniciar, parar, salvar) ainda terminam com `pause`.
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

- **CONFERÊNCIA REAL de 05/10/2026 (rascunho `8e1aa4b`)** — banco de teste descartável criado do `estrutura_banco.sql` + servidor do projeto, 886 chamadas em 316 rotas com entradas ruins (tipo errado, texto de 6.000 letras,
  id "abc", paginação negativa). Base de teste quase vazia: rota que NÃO deu 500 não está provada perfeita, só não deu "Erro interno". Estado exato das pendências abaixo (a lista antiga estava desatualizada):
- **P1, P2, P3 e P4 — FEITAS no `rascunho` em 06/10/2026 (OK do usuário: "pode corrigir junto com as outras pendências"; aguardam a bateria completa no Windows).** Levantamento feito no mesmo dia com uma sonda temporária (fora do Git) que chama TODAS as rotas de `routes/index.js` com entrada ruim (nome número/lista/6.000 letras, id "abc"/-1/gigante, página negativa/zero/texto, busca em lista, datas e valores inválidos, `%`/`_`): antes **34 rotas davam 500** (+1 achada depois: `GET /processos/pastas?busca[]=a`); agora **0**. Base de teste quase vazia: "não deu 500" não prova perfeição, só que não dá "Erro interno".
  **O que mudou (código):** (a) NOMES e textos dos cadastros auxiliares conferidos com `camposTexto.js` (`texto`/`lerTextos`) nos limites reais das colunas — tipos de prazo (100) e subtipos (150, tipo precisa ser número), tipos de audiência/perícia (100), documentos da pendência (150), forma de pagamento (60), instituição financeira (100, também o atalho "+ novo banco" de Pessoas, `criarBancoNoCatalogo`), modelos de documento (nome 150, descrição 300), freelancers (todos os campos; `lerDadosFreela` em `audienciasController`), motivo da reversão de audiência (300), dados do escritório (textos, horários `HH:MM` com `horaDoDia`, dias/minutos inteiros 1 a 100.000 — vazio/texto/zero voltam ao padrão, negativo ou gigante dá 400), novo compromisso da Agenda (título 150, descrição 5.000, data, horas, delegado e publicação numéricos; `dadosDoCorpo` devolve `{ erro }`). Limites de 5.000 (e-mails de alerta, mensagem de aniversário, descrição do compromisso) foram ESCOLHA da IA, não do usuário — ajustar se ele quiser. (b) **P4:** `comIdNumerico(handler, mensagem)` (agora em `utils/rotasSeguras.js`, a cópia que era de `processosController` passou a importar dali): id da rota que não é só dígitos (até 15) = 404 "não encontrado" — aplicado nas exportações de Prazos (tipos/subtipos), Audiências (tipos, freelas, ata impressa, reverter), Perícias (tipos), Pendências (tipos), Financeiro (formas de pagamento, instituições), Documentos (modelos) e Agenda (compromissos). (c) **P3:** `paginacao()` em Prazos, Publicações, Documentos > histórico e Financeiro > Consulta (padrões 30/30/50/50, máximo 100). (d) **P2:** `escaparLike` na busca de Tarefas (inclusive o "rotina interna"), Publicações, Pendências (lista e clientes), Perícias (busca de peritos da ata e relatório de peritos), freelas de Audiências e Financeiro > Consulta. (e) busca que não é texto (`?busca[]=a`) ou com mais de 200 letras = 400 em Publicações (também na exclusão em lote — busca inválida lá NUNCA vira "sem filtro", senão apagaria mais do que a tela mostra), Pendências e `/processos/pastas`.
  **Provado:** `backend/tests/integration/validacoes-cadastros.integration.test.js` (11 testes; 10 falham no código antigo e todos passam no novo; o 11º, de modelos, passa nos dois mas agora exige que o aviso fale do campo), testes rápidos novos (`horaDoDia`, `comIdNumerico`) 138/138 (servidor) e 180/180 (telas), integração completa 339/339, nomes indefinidos: nenhum, audit de produção 0; telas dos módulos tocados no Chromium 113/113 (+ Financeiro e Repassar 18/18 depois de trocar os CPFs fixos do teste por CPFs únicos — o banco de teste é compartilhado). **Ainda NÃO coberto:** o cadastro de banco por Controle > Instituições financeiras com acento/emoji (só tamanho), e telas Pessoas/Processos (não mexidas). Obs. de teste: o node-cron guarda UMA tarefa por objeto de opções compartilhado (`OPCOES_CRON`), por isso o teste do escritório só grava UM horário, senão o processo de teste não termina.
- **PESSOAS — testes de servidor criados em 05/10/2026 (`backend/tests/integration/pessoas.integration.test.js`, 25 testes, passam 25/25 e rodaram 3 vezes seguidas):** permissões de cada rota, física e jurídica (criar/editar/buscar/listar/excluir com bloqueios por vínculo e sem órfãos),
  responsável legal, avisos de idade, anotações, listas auxiliares, profissões (Controle), unificar (física e jurídica), exportar Excel, processos da pessoa, parabéns, WhatsApp/SMS/e-mail (só validações). **AINDA SEM TESTE DE TELA da ficha (`ModalPessoa`, abas e estados) — é o passo seguinte.**
  **ACHADOS no módulo Pessoas (confirmados rodando o sistema) e o que foi decidido pelo usuário em 05/10/2026 — "pode codar começando pelo pacote A e NÃO deixe os outros pacotes serem esquecidos":**
  **PACOTE A — FEITO no `rascunho` em 05/10/2026 (aguarda a bateria completa no Windows):** (1) nome em branco: criar e editar (física e jurídica) agora recusam nome vazio, só espaços, que não é texto, ausente e acima de 200 caracteres ("O nome é obrigatório" / "A razão social é obrigatória" / "muito longo (máximo 200 caracteres)");
  editar nunca apaga o nome. (2) anotação de atendimento: só grava se a pessoa EXISTE (404 senão; id "abc", 0 e negativo também = 404; conferência com FOR SHARE dentro da transação), texto obrigatório e de até **2.000 caracteres** (limite escolhido pelo usuário), aparado; editar anotação tem a mesma regra.
  (8b) o TIPO da anotação (física/jurídica) agora é decidido pela ROTA (`adicionarHistoricoFisica`/`adicionarHistoricoJuridica`), nunca pelo corpo. Também: `camposTexto.texto` ganhou a opção `feminino` ("obrigatória", "longa", "inválida").
  Provado: os 2 testes novos falham com o código antigo e passam com o novo; `pessoas.integration.test.js` 27/27 (3 rodadas); integração completa 307/307; testes rápidos 128/128; telas de Pessoas/anotações/cadastro rápido no Chromium (11/11 e 1/1). Script de conferência só-leitura (TEMPORÁRIO): `sql_conferir_nomes_vazios_e_anotacoes_orfas_para_heidi.sql` — mostra pessoas com nome vazio e anotações órfãs JÁ existentes no banco (se vier linha, avisar a IA antes de qualquer limpeza).
  **PACOTE B — FEITO no `rascunho` em 05/10/2026 (aguarda a bateria completa no Windows): aviso claro 400 no lugar de "Erro interno" em Pessoas.** Novo leitor `backend/src/utils/dadosPessoa.js` (usa `camposTexto.js`) confere TODOS os campos da física e da jurídica antes de gravar, com os limites reais das colunas:
  nome/razão 200; RG, órgão do RG, PIS 20; CTPS número 30 e série 20; pai/mãe 200; CEP 9; logradouro 200; número do endereço 10; complemento, bairro, cidade 100; UF 2; nome fantasia 200; inscrição estadual 30 (só no cadastro da empresa — na edição ela não é gravada); telefone 20, tipo do telefone 100, e-mail 150;
  **observações 5.000 caracteres (limite escolhido pelo usuário em 05/10/2026; a IA havia proposto 15.000)**; CPF e CNPJ só como TEXTO (número perderia o zero da frente), guardados só com dígitos, até 11 e 14 números; data de nascimento = dia que existe (aceita o horário que a tela às vezes manda e descarta);
  ids das listas de escolha (profissão, estado civil, gênero, nacionalidade, parentesco, responsável) precisam ser número inteiro (vazio e 0 = não informado; número que não existe mais = 409 "recarregue"); telefones/e-mails/contas precisam ser LISTA; campos de texto agora são gravados APARADOS (sem espaços nas pontas).
  Contas bancárias (`conferirConta` em `pessoasController.js`): agência 20, número 30, chave PIX 150, titular 200, documento do titular até 18 números, observação 5.000, id da conta e do banco numéricos — erro vira 422 com a mensagem. Auxiliares (`/pessoas/auxiliares/:tipo`) e profissões do Controle: nome de texto e até 50 (gênero, estado civil, nacionalidade, parentesco) ou 100 (profissão, banco).
  Fora do escopo (continua no P1): o cadastro de banco pela tela de Controle > Instituições financeiras (`instituicaoFinanceiraController`) não foi tocado.
  Provado: os 6 testes novos falham com o código antigo (0/6) e passam com o novo; `pessoas.integration.test.js` 34/34 (3 rodadas), inclui um teste de IDA E VOLTA (o que a tela recebe ao abrir a ficha volta no salvar, física e jurídica, sem erro e sem perder nada); integração completa 314/314; testes rápidos 132/132 (4 novos do leitor); nomes indefinidos: nenhum; telas de Processos que usam Pessoas no Chromium 11/11.
  **TESTE DE TELA da ficha de PESSOA FÍSICA — criado em 05/10/2026 (`frontend/e2e/pessoas-ficha-fisica.spec.js`, 14 testes: nova, validações, CPF, responsável legal, avisos de idade, CTPS/telefones/e-mails, listas "…", CEP, contas bancárias, editar com ida e volta, detalhes travado, acessibilidade).** **Ficha da pessoa JURÍDICA: teste criado em 05/10/2026 (`frontend/e2e/pessoas-ficha-juridica.spec.js`, 11 testes: nova, validações, CNPJ incl. duplicado, Em Recuperação Judicial, telefones/e-mails, CEP, contas bancárias, editar com ida e volta, cancelar/erro do servidor, detalhes travado, acessibilidade; as 2 fichas juntas 25/25).** **ACHADO DA FICHA DA EMPRESA — CORRIGIDO em 06/10/2026 (OK do usuário): ela gravava e-mail inválido (ex.: "email-sem-arroba") porque a conferência do formato no salvar só existia para pessoa física; agora `emailsConferem()` em `Pessoas.js` vale para as duas (aviso na faixa da janela, nada é gravado). Teste da ficha jurídica 11/11; o passo novo falha no código antigo.** **LISTA de Pessoas: teste de tela criado em 05/10/2026 (`frontend/e2e/pessoas-lista.spec.js`, 12 testes: colunas, busca com/sem máscara e curingas, paginação, exportar Excel físicas e jurídicas com o arquivo baixado, menu ⋮ e "Qtde Proc", excluir (confirmação e bloqueio por vínculo), unificar pessoas e empresas, falha do servidor, usuário não administrador; as 3 telas de Pessoas juntas 37/37).**
  **ACHADOS da lista (aguardam decisão do usuário; NADA foi mudado):** (a) o menu ⋮ (`MenuAcoes.js`, usado no sistema todo) NÃO fecha com ESC — só clicando fora ou rolando; (b) a janela "Confirmar exclusão" diz "O registro ficará inativo e não aparecerá mais nas listagens", mas o servidor APAGA de verdade (DELETE; confirmado no código e no teste de servidor); (c) o número da coluna "Qtde Proc" é um `<span onClick>` (sem teclado/foco): quem usa só teclado não abre os processos; (d) no navegador de teste o arquivo exportado de Pessoas físicas aparece como "download" (sem nome e sem .xlsx) quando o nome tem acento ("Pessoas Físicas - ...") — a tela pede o nome certo; NÃO sei se acontece no Chrome do usuário (confirmar com um clique real no Windows); (e) busca com letras E números (ex.: "Paginada 1") também casa CPF/telefone pelos números (P6, desenho antigo).
  **Achados (a), (b) e (c) da lista — CORRIGIDOS em 05/10/2026 (OK do usuário):** `MenuAcoes.js` agora fecha com ESC (foco volta ao botão ⋮, `aria-expanded`/`data-esc-lista-aberta` para as janelas ignorarem o mesmo ESC; teste rápido novo falha no código antigo); a confirmação de exclusão diz que o cadastro é APAGADO (e recusado se houver vínculos); o número de "Qtde Proc" virou botão (abre por teclado). Continuam abertos (d) e (e).
  **Lista para quem só VISUALIZA — PROVADO e CORRIGIDO em 06/10/2026 (OK do usuário):** a lista mostrava "+ Nova", "Editar" e "Excluir" a quem só tinha "visualizar" (o servidor respondia 403). Agora "+ Nova Pessoa…" exige `cadastrar`, "Editar" (menu e botão dos Detalhes) exige `alterar`, "Excluir" exige `excluir`; "Anotações de atendimento" ficou como estava (decisão dele). Teste novo em `pessoas-lista.spec.js` (13/13; falhava antes). Falta: acessibilidade em outros estados/permissões.
  Correções feitas com OK do usuário (05/10/2026): select "Tipo da conta" ganhou rótulo; botão Salvar da ficha deixou de pular o aviso "dígito com mais de 2 caracteres" (e a 2ª confirmação "Campos sem informação" não some mais); campo Observações não é mais convertido para Title Case; ESC dentro do mini-formulário "…" fecha só ele.
  **Contraste dos avisos pequenos de erro — CORRIGIDO em 05/10/2026 (OK do usuário):** o vermelho claro `#e74c3c` (3,82:1) foi trocado pelo `#b91c1c` (já usado em 35 lugares) nos 8 avisos "⚠️ ..." de e-mail, CPF, CNPJ, data, nome, CEP (Pessoas, `LinhasContato.js`, Foruns, Audiências). Teste da ficha da pessoa física: 14/14.
  **BATERIA NO WINDOWS (05/10/2026, máquina lenta: Chromium ~43 min, frontend 96 s contra 18 s no ambiente da IA) — 5 falhas, todas de TESTE (nada do sistema), corrigidas com OK do usuário:** abrir "Editar" na ficha física (menu fechava quando a lista recarregava), aba Andamentos "Parar consulta" (consulta simulada de 4 s fixos acabava antes do clique — agora fica pendurada até o teste soltar), `violacoesGraves` (helpers.js) agora repete se a página recarregar no meio, testes rápidos do frontend esperam até 5 s em `waitFor`/`findBy` (`tests/setup.js`), e o contraste do aviso de e-mail (já corrigido antes). Causa de lentidão = hipótese forte, não provada; a prova é a próxima bateria no Windows.
  **BATERIA NO WINDOWS (06/10/2026, rascunho `0cf7eb9`): 11/12 etapas OK; testes rápidos 132/132 e 176/176, integração 319/319, Chromium 186/187. Única falha: `pessoas-ficha-fisica.spec.js` "Contas bancárias…" — era de TESTE (o menu ⋮ da linha sumia no meio do clique em "Editar" quando a lista recarregava e o teste esperava 150 s). `abrirEdicao` (ficha física e jurídica) agora faz abrir menu + clicar + esperar dados na MESMA tentativa, com nova tentativa se o menu sumir; as 2 fichas 25/25. `npm audit` (produção) do backend mostrou 2 avisos novos (compression alta, proxy-addr crítica) — CORRIGIDOS em 06/10/2026 (OK do usuário): `compression` 1.8.1→1.8.2 e `proxy-addr` (dentro do Express) 2.0.7→2.0.8, só no `package-lock.json` (package.json e código intactos); audit de produção = 0; testes rápidos 132/132 e integração 319/319 no ambiente da IA. Aguarda a bateria completa no Windows.**
  **BATERIA NO WINDOWS (06/10/2026, rascunho `55bc92b` — com compression/proxy-addr novos): 11/12 etapas OK; testes rápidos 132/132 e 176/176, integração 319/319, `npm audit` do servidor = nenhum aviso, Chromium 187/188. Os 3 testes de Pessoas que falharam antes (Contas bancárias, Editar, Lista só visualiza) PASSARAM. Única falha: `processos-lista.spec.js` "etiquetas pessoais e do escritório" — estourou o limite de 45 s POR TESTE (45,6 s; passou em 23 s na rodada anterior): teste longo com ~25 esperas de tela, em máquina lenta. Era de TESTE (nada do sistema): `playwright.config.js` agora dá 90 s por teste (o limite de cada verificação continua 8 s); outros testes longos também passavam de 40 s (37–43 s) e estavam no mesmo risco. Arquivo da lista de Processos 10/10 no ambiente da IA. CORREÇÃO DE DIAGNÓSTICO: o teste parou na PRIMEIRA pesquisa (não somou lentidão); a causa do travamento NÃO é conhecida (10/10 seguidas aqui). Por isso `aguardarTelaPronta` (`frontend/e2e/helpers.js`) agora tem limite próprio de 30 s e, se estourar, o erro traz o retrato da tela (endereço, nº de `.loading`, trecho com "Carregando"); provado com uma tela presa de propósito. Se travar de novo, ler essa mensagem na bateria. Aguarda nova bateria.**
  **BATERIA NO WINDOWS (06/10/2026, rascunho `dcd3c3e`, ANTES da pesquisa de Audiências/Perícias/Prazos): 11/12 etapas OK; testes rápidos 132/132 e 176/176, integração 319/319, audit do servidor = nenhum, Chromium 187/188 (o teste da lista de Processos que travou antes PASSOU em 20 s). Única falha: `pessoas-ficha-fisica.spec.js` "Editar: abre com tudo preenchido…" — no passo "mudar de verdade" a cidade digitada ("Valinhos") não foi gravada (ficou "Campinas") embora o aviso "Pessoa atualizada" tenha aparecido: o que foi digitado foi sobrescrito pelos dados da ficha que chegaram DEPOIS. Era de TESTE (hipótese forte, não provada): `waitForResponse` do Playwright resolve quando o navegador recebe a resposta, mas a PÁGINA ainda precisa processá-la e redesenhar; em máquina lenta o teste digitava antes disso. Correção: `aguardarRespostaProcessada` (`helpers.js`: espera o corpo terminar + 2 quadros desenhados) em `abrirEdicao`/`abrirDetalhes` das fichas física e jurídica. NOTA: a ficha também mostra o nome vindo da LISTA antes de a resposta chegar, então "o nome apareceu" não prova que a ficha carregou.**
  **PACOTE C — FEITO no `rascunho` em 05/10/2026 (aguarda a bateria completa no Windows) — listas e buscas de PESSOAS (física, jurídica, "escolher pessoa" e as 2 exportações):** (5) página/limite: usam `paginacao()` (negativo, zero, texto ou lista viram o padrão: página 1, 20 por página, máximo 100; a resposta devolve os valores já corrigidos);
  (6) o termo de busca precisa ser TEXTO (`?busca[]=a` dá aviso 400 "A busca inválida"), aparado e de até 200 caracteres; (7) `%` e `_` são procurados como texto (`escaparLike`, também na ordenação do "escolher pessoa");
  **(8a) busca COM OU SEM MÁSCARA (regra do usuário):** função `padroesDeBusca` em `pessoasController.js`. CPF e CNPJ (gravados só com dígitos) são achados com ou sem pontuação (já era assim para CPF); quando o termo é um NÚMERO digitado com ou sem máscara (só dígitos e `( ) . - / +`, com 3 ou mais dígitos),
  o telefone (física e jurídica), o RG e o PIS são comparados ignorando a máscara de quem foi gravado ("19988776655" acha "(19) 98877-6655" e o contrário). Termo com letras (nome) NÃO entra nessa regra (senão "Maria 2" acharia todo telefone com 2). Por desenho antigo (P6), um termo com letras e números continua usando os números dele na busca de CPF/CNPJ.
  Provado: os 4 testes novos falham com o código antigo (0/4) e passam com o novo; `pessoas.integration.test.js` 39/39 (3 rodadas); integração completa 319/319; testes rápidos 132/132; nomes indefinidos: nenhum; telas de Processos que buscam pessoas (partes, cadastro rápido, ver cadastro, anotações) no Chromium 5/5. Os testes antigos do pacote C (pasta `backend/tests/pendentes`) foram incorporados ao teste de Pessoas e a pasta foi apagada.
- **P5** — Migração do react-router para a versão 7 — **ADIADA POR DECISÃO DO USUÁRIO (05/10/2026): NÃO FAZER AGORA.** Ele avaliou que o retorno é pequeno e o risco, grande; o assunto passa a fazer parte do
  "plano de modernização" (seção 11). Análise feita em 05/10/2026, numa cópia descartável fora do projeto (nada mudou no código): trocar `react-router-dom` `^6.21.0` → `^7.18.4` altera SÓ `package.json` e
  `package-lock.json` (nenhum `.js` muda; todos os `navigate()`/`Link` do código usam caminho absoluto). Resultado na cópia: Vitest 175/175, build OK (pacote principal 316 → 334 kB), checagem de nomes igual, `npm audit` de
  produção 0, os 2 avisos "Future Flag" somem, sem mexer em `vite.config.js`. Telas completas (166) rodadas 2 vezes na versão 7: 163/166 e 164/166 — as 2 falhas fixas são o defeito de teste de horário descrito abaixo (falham igual
  na versão atual); 1 falha do "Novo Prazo" ocorreu UMA vez e não se repetiu (sozinho 3/3 na v7 e 1/1 na v6): causa NÃO conhecida. Advisories que justificam a troca: abertura de redirecionamento (`Link`/`useNavigate`, só corrigido a partir da 7.18.4)
  e um de renderização no servidor (não se aplica a este SPA). Se for retomado: não silenciar os avisos com `future` (gambiarra); fazer a migração de verdade.
- **Defeito de TESTE de horário — CORRIGIDO em 05/10/2026 (OK do usuário):** `frontend/e2e/processos-pasta-tarefas.spec.js` calculava "hoje" (`hojeMais`) com o relógio da máquina, enquanto o sistema usa o horário de Brasília; em máquina em UTC, entre 21h e meia-noite
  de Brasília, "Nova tarefa" e "Editar tarefa" falhavam por 1 dia. Agora usa `America/Sao_Paulo`, como o teste de Prazos. Provado: com a máquina de teste num fuso atrasado (`TZ=Etc/GMT+12`) o teste antigo falhava e o novo passa (arquivo inteiro de Tarefas, 10/10).
  **Mesmo defeito em `frontend/e2e/processos-pasta-audiencias.spec.js` (~linha 184, escolha do "mês seguinte") — CORRIGIDO em 05/10/2026 (OK do usuário):** só aparecia no último dia do mês, entre 21h e meia-noite de Brasília, em máquina em UTC.
  Provado com "agora" simulado em 31/10 23:30 de Brasília numa máquina em UTC (expressão antiga dava 12/2026; a nova dá 11/2026, certo); arquivo inteiro de Audiências 15/15.
- **P9 — Buscas com e sem máscara fora de Pessoas — DESCARTADO por decisão do usuário (06/10/2026): "achei o risco muito alto, e não posso quebrar o sistema nesta altura dos trabalhos; nem marca para depois, já descarta logo esse serviço, a menos que seja muito necessário".** NÃO propor de novo, NÃO listar como pendência. Só reabrir se ele pedir, ou se aparecer falha real de uso (usuário sem achar um processo/telefone). Pessoas (pacote C) já está feito e fica como está.
  Para registro (leitura de 06/10/2026, nada alterado): Perícias, Financeiro > Consulta, Publicações e a lista de Processos procuram o número do processo como digitado.
- **PESQUISA em AUDIÊNCIAS, PERÍCIAS e PRAZOS — FEITO no `rascunho` em 06/10/2026 (commit `2f9791f`; OK do usuário para começar sem esperar a bateria; aguarda a bateria completa no Windows).** Servidor: peça única `backend/src/utils/buscaFrase.js` (`lerBuscaFrase`, `condBuscaFrase`) usada por `audienciasController.listar`, `periciasController.listar` e `prazosController.listar` (parâmetro `busca`; o antigo `numero_processo` de Prazos foi REMOVIDO e o número só com dígitos continua achando o gravado com máscara); os COUNT ganharam as mesmas junções. Tela: componente único `frontend/src/components/ui/CampoPesquisa.js` (350 ms + "Limpar pesquisa"). Provado: `busca-frase.integration.test.js` 8/8 (0/8 no código antigo), `busca-frase.test.js` 4/4, `CampoPesquisa.test.js` 4/4, `pesquisa-listas.spec.js` 5/5 (3 rodadas, 15/15); testes rápidos 136/136 e 180/180; telas que já existiam (pastas de Prazos/Audiências/Perícias, ata, acessibilidade de todas as telas) 58/58. Descrição do pedido original (para histórico): (só começar DEPOIS do "RESUMO DA BATERIA" do Windows ficar limpo, para não trocar arquivos no meio do teste; ele já aprovou o plano, falta só o sinal de início): hoje essas duas telas NÃO têm pesquisa por texto (só Status, datas, atalhos e etiqueta). Fazer um campo igual ao de Processos (espera 350 ms depois de digitar, botão "Limpar pesquisa"), que procura a FRASE DIGITADA INTEIRA como um bloco só (uma palavra ou várias na mesma ordem, ex.: "José e maria"; NÃO separar em palavras, NÃO fazer "ou"), SEM diferenciar acento e maiúscula (o banco já é `utf8mb4_0900_ai_ci`; provar com teste que "jose" acha "José"), junto com os filtros existentes (total e páginas acompanham), com `%`/`_` como texto (`escaparLike`) e termo inválido sem erro 500. Audiências: procura em partes (autores e réus), título, nº do processo, pasta, tipo, modalidade, responsável, vara e fórum. Perícias: mesmos tipos de campo (partes, título, nº do processo, pasta, tipo, perito, responsável, local); conferir o código real antes. Testes novos de servidor e de tela (devem falhar antes e passar depois). **PRAZOS entra no mesmo pedido (OK do usuário):** hoje o campo "Número do Processo" só age com 3 ou mais DÍGITOS (letras são ignoradas sem aviso) e acha o número com e sem pontuação (`prazosController.listar`, parâmetro `numero_processo`; teste de tela da aba Prazos usa esse campo). Vira o mesmo campo "Pesquisar" (frase inteira, sem acento/maiúscula; procura número do processo, partes, título, pasta, descrição, tipo/subtipo do prazo, responsável e quem faz), MANTENDO o comportamento antigo do número com/sem pontuação (não pode regredir; atualizar o teste de tela de Prazos). Status, Responsável, Vencimento, "Mostrar concluídos", "Limpar filtros" e "+ Novo Prazo" não mudam.
  **SEM REDUNDÂNCIA DE CÓDIGO (exigência do usuário, 06/10/2026):** uma função ÚNICA no servidor para busca por frase (valida texto, aparar, máximo de caracteres, `escaparLike`; cada módulo só informa os campos) e UM componente único de campo de pesquisa na tela (espera 350 ms + "Limpar pesquisa"), reaproveitados nas 3 telas, com testes próprios. NÃO mexer agora em Processos, Pessoas e Tarefas (já estáveis e testadas; só migrar se o usuário pedir).
- **"REPASSAR" NO MENU ⋮ DA PARCELA — FEITO no `rascunho` em 06/10/2026 (OK do usuário: "pode aplicar com submenu, mas mantenha o que já existe"; aguarda a bateria completa no Windows).** Em `Financeiro.js` (`AcordoBloco`, usado em Financeiro > Por processo e na aba Financeiro da pasta): a parcela RECEBIDA com repasse pendente ganha "Repassar" no menu; com um só repasse pendente abre direto a janela `ModalRepasse`; com cliente E parceiro pendentes vira submenu ("Repassar ao cliente" / "Repassar ao parceiro (nome)"). Vale só para ESSA parcela; exige permissão `financeiro/alterar`; a aba "Repasses pendentes" e o resto do menu não mudaram. Destino "Dinheiro em espécie — em mãos" já existia na janela (caso da Bruna, sem conta em banco). Provado no Chromium: `processos-pasta-financeiro.spec.js` + `financeiro-controles.spec.js` 18/18 (3 testes novos); testes rápidos 180/180; nomes indefinidos: nenhum.
- **PERMISSÃO "EXPORTAR PARA EXCEL" em PESSOAS — FEITO no `rascunho` em 06/10/2026 (OK do usuário: só Pessoas agora; começam todos SEM a permissão, exceto administrador; aguarda a bateria completa no Windows).** Configurações > Permissões > Pessoas (clicar na linha para expandir) ganhou o sub-item "Exportar para Excel — marque Visualizar" (módulo `pessoas`, sub-módulo `exportar`, ação `visualizar`). O botão "Exportar Excel" de Pessoas (físicas e jurídicas) só aparece com ela e as 2 rotas `/pessoas/fisicas/exportar` e `/pessoas/juridicas/exportar` respondem 403 sem ela (`verificarPermissao('pessoas','exportar','visualizar')`); administrador (nível 0 e 1) sempre pode. SEM mudança de banco e SEM script SQL: quem não tem linha na tabela `permissoes` já fica sem a permissão — por isso todos os usuários comuns passam a NÃO exportar até o administrador marcar. **Futuro (pedido do usuário, NÃO fazer agora):** o mesmo item para Processos, Prazos, Tarefas, Audiências e Perícias; Financeiro > Consulta e Relatórios exportam e não foram tocados. Provado: teste de servidor novo falha no código antigo e passa no novo (`pessoas.integration.test.js` 40/40; integração completa 328/328); telas de Pessoas (lista, ficha física, ficha jurídica) 40/40 incluindo o teste novo que usa a tela de Permissões de ponta a ponta; testes rápidos 180/180; nomes indefinidos: nenhum.
- **P6** — Informativo, sem ação (`log_documentos_gerados` sem chave declarada; busca por poucos dígitos casa CPF/CNPJ/telefone).
- **P7** — Verificar no servidor real se o PM2 reinicia sozinho após queda.
- **P8** — Decidir (só se ele quiser) o recurso "ver só os meus processos". Conferido em 05/10/2026: `usuarios.ver_todos_processos` é lido no login/middleware e gravado pela tela de usuários, mas NÃO existe no frontend e nenhum
  controlador o usa para filtrar — continua vestigial (só coluna).
- **Varredura da ficha da pessoa** (`ModalPessoa`, `Pessoas.js`, todas as abas/estados) — acessibilidade e validações; pertence ao módulo Pessoas. Conferido em 05/10/2026: não há teste de tela nem de servidor dedicado a Pessoas;
  a tela só entra na varredura de acessibilidade com a LISTA aberta (a ficha e suas abas não aparecem em nenhum teste); e cadastrar pessoa dá 500 com tipo errado/texto longo (ver P1).
- **CORREÇÃO PENDENTE — corrida na renumeração de pasta (anotada a pedido do usuário em 05/10/2026; SÓ AJUSTAR QUANDO ELE AVISAR):** em `renumerarPasta` (`processosController.js`), quando o número desejado é de uma pasta
  vazia, a conferência "tem processo?" lê o banco pela "foto" do início da transação (REPEATABLE READ) e o `DELETE FROM tblpasta` olha a situação real. Se outra pessoa criar um processo nessa pasta no mesmo instante, a conferência
  diz "vazia" e o banco recusa apagar (erro 1451, `tblproc_ibfk_1`). **Provado** num banco de teste do sandbox (contagem 0 e DELETE falhando com o mesmo código); o teste da corrida (`processos-pastas.integration.test.js`, ~linha 329) passou 6/6 aqui (depende de timing).
  **Efeito real, pelo código:** a transação é desfeita (nada se perde, nenhum órfão) e `erroInterno` (`utils/response.js`) responde **409** com a mensagem "Não é possível excluir este item porque ele está vinculado a outros registros…" —
  mensagem enganosa para uma renumeração (não é "erro interno" 500, e o teste, que só exige status < 500, passa). **Correção proposta (não feita):** (1) ler as contagens de processos/tarefas da pasta por leitura travada ("situação real"),
  (2) tratar esse 1451 específico nessa função com o aviso "número em uso". Risco avaliado: baixo (só `renumerarPasta`, sem mudança de banco/tela); verificar com teste que force a sequência e rodar a bateria de Processos.
  Não conferido: se o cadastro de processo, ao reaproveitar pasta vazia, tem a mesma fragilidade.
- **RUÍDO ESPERADO NO LOG DOS TESTES (não é defeito):** linhas "Erro interno: ... Cannot add or update a child row ... tblproc_ibfk_2/3/4/5 (vara, tipo, status, instância) e processo_assunto_ibfk_2" em `atualizarProcesso`
  (linhas ~926 e ~991) vêm do teste "editar: valores que o banco recusa" (`processos-crud.integration.test.js`, ~linha 272), que manda de propósito vara/tipo/status/instância/assunto com id 999999. O servidor responde **409** com
  "Um dos itens escolhidos não existe mais… Recarregue a tela" (tradução em `erroInterno`) e o teste exige isso. O texto "Erro interno:" é só o rótulo do `console.error`, impresso antes da tradução.
- **DICA OPERACIONAL (testar telas no ambiente da IA, 05/10/2026):** o Playwright do projeto (1.63) procura um Chromium que não existe no ambiente da nuvem, mas o Chromium 1194 já está em `/opt/pw-browsers`. Para rodar um teste de tela lá, criar TEMPORARIAMENTE
  `frontend/playwright.sandbox.tmp.config.js` (importa o config do projeto e acrescenta `use.launchOptions.executablePath` apontando para `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` com `--no-sandbox`), rodar `npx playwright test -c <esse arquivo> <spec>` e APAGAR o arquivo depois (nunca commitar).
  Também precisa de MySQL local (`apt-get install mysql-server`) com um banco `*_test` e usuário de testes (não root). A bateria oficial continua sendo a do Windows do usuário.
- **Pastas vazias antigas (achado de 04/10/2026, decisão pendente do usuário):** no local e no Antônio existem 2.702 pastas SEM processo; 2.700 foram criadas de uma vez em
  28/06/2026 (números 1 a 8935, criador 24) e 2.627 têm "área do direito" preenchida — parecem pastas antigas importadas sem os processos. O Erick não tem nenhuma.
  Não apagar em lote sem a decisão dele. O script `sql_limpar_pastas_vazias_para_heidi.sql` apaga SÓ as pastas 9999 e 928804 (fixas no script; rodar só no Antônio — o Erick não tem pastas vazias).
  **Regra decidida pelo usuário (04/10/2026) e já implementada:** pasta TOTALMENTE vazia (sem nenhum processo e sem tarefa ligada) é reaproveitável.
  Ao criar processo nesse número o sistema já reaproveitava a pasta; agora a troca de número (`renumerarPasta`) também: remove a pasta vazia (etiquetas pessoais saem em
  cascata, com auditoria) e faz a troca na mesma transação. Se a pasta vazia de processos ativos tiver processo inativado ou tarefa, a troca é recusada
  dizendo o motivo (nunca descarta informação). Excluir o último processo de uma pasta continua deixando a pasta no banco, vazia.
  **"Área do direito" saiu da pasta (decisão do usuário, 04/10/2026 — "não existe pasta trabalhista, existe processo trabalhista"):** a área é do PROCESSO (campo "Tipo").
  A coluna `tblpasta.area_direito` foi removida do código e do `estrutura_banco.sql`; o relatório e a variável de documento "área" passam a usar o Tipo do processo
  (`{{area_direito}}` continua funcionando em modelos antigos, devolvendo o Tipo). A remoção da coluna agora faz parte do script único `sql_atualizar_banco_para_heidi.sql` (seção 10); o banco local já está sem ela (confirmado no dump de 04/10/2026 19:28).

## 10. PENDÊNCIAS DE PRODUÇÃO — AWS-Erick e AWS-Antônio (pedido do usuário, 04/10/2026)

**REGRA ABSOLUTA (pedido do usuário, 04/10/2026, em maiúsculas): NUNCA MEXER NA AWS.** A IA não tem acesso aos servidores e não conduz o usuário a mexer neles por iniciativa própria: não sugere "rode isto no servidor", não manda enviar arquivos, não monta o próximo passo de produção sozinha. Só entrega script ou passo de AWS quando o usuário PEDIR, na hora que ele decidir. Os scripts e passos abaixo ficam apenas como material pronto, guardado.

**Regra do usuário:** Erick e Antônio são PRODUÇÃO e ficam por ÚLTIMO: só são atualizados depois que o LOCAL estiver 100% ok e testado. A IA mantém esta lista atualizada (acrescentar item a cada script/mudança nova que precise ir para produção; marcar como feito só com o OK do usuário) e a mostra quando ele perguntar "o que falta" ou for atualizar produção.

**Banco: UM script só, `sql_atualizar_banco_para_heidi.sql`** (criado em 04/10/2026; substitui os antigos de Relatórios fase1/6/7, Financeiro, contas bancárias e remoção
de `area_direito`, que ficam só como histórico). Ele confere se o banco é o do sistema (pelas tabelas, pois o nome muda: `sistema_advocacia` no Antônio, `erick_adv` no Erick),
exige MySQL 8.0.16+ (recusa MariaDB), só cria o que falta, pode rodar várias vezes, registra a versão em `controle_versao_banco` (nº 1) e termina com UMA linha de resultado
("PRONTO ..." / "ABORTADO ..." / "ATENCAO ..."). Testado em cópias dos dumps de 04/10/2026 do Antônio, do Erick e do local (2 rodadas cada, estrutura final igual ao
`estrutura_banco.sql`, contagem de linhas de todas as tabelas inalterada). **Se o `estrutura_banco.sql` mudar de novo, o script único precisa ser atualizado e retestado**.
Em CADA instância (Antônio e Erick), de preferência de noite sem ninguém usando, nesta sequência de execução (SSH do Lightsail como usuário ubuntu, sem sudo):
1. Fazer o backup do banco (HeidiSQL: Exportar como SQL) e conferir que o arquivo não está com 0 KB.
2. Guardar uma cópia do CÓDIGO: colocar `aws_<instancia>_codigo_salvar_e_voltar.sh` no servidor (WinSCP, em /home/ubuntu) e rodar `bash aws_<instancia>_codigo_salvar_e_voltar.sh salvar`. Deve terminar com "PRONTO" mostrando o arquivo da cópia (fica em ~/backups_codigo).
3. Parar o sistema na instância.
4. HeidiSQL: selecionar o BANCO DO SISTEMA e executar `sql_atualizar_banco_para_heidi.sql` inteiro (F9). A linha de resultado deve dizer "PRONTO" com tudo 0 (se disser ABORTADO/ATENCAO, parar e avisar a IA).
5. Atualizar o código do sistema (versão testada do local) e iniciar de novo. (O script apaga `tblpasta.area_direito`: o sistema ANTIGO quebra sem ela, por isso o código novo entra logo em seguida.)
6. Opcional: rodar `sql_diagnostico_estrutura_para_heidi.sql` (só lê): os resultados devem vir vazios.
**Para VOLTAR ATRÁS (só se a atualização der problema):** (a) `bash aws_<instancia>_codigo_salvar_e_voltar.sh voltar` (pede SIM; para o sistema, guarda a pasta atual ao lado como `...antes_da_volta_DATA`, devolve o código da cópia e religa no PM2); (b) restaurar o banco pelo HeidiSQL com o backup do passo 1 (mesma hora). Os dois juntos: código antigo não funciona com o banco novo.
Os scripts de código foram testados só em pasta simulada com PM2 de mentira (salvar, listar, voltar, instância errada, sem cópia, cópia com defeito, sem confirmar); o primeiro uso real é o passo 2 ("salvar"), que não altera nada no sistema.

Só no **Antônio**: o `sql_limpar_pastas_vazias_para_heidi.sql` (pastas 9999 e 928804) JÁ foi rodado (04/10/2026). Erick não precisa dele. Depois de atualizar o Antônio,
testar a troca de número 8926 → 9999.
Itens ainda sem decisão (não são script): as ~2.700 pastas vazias antigas do Antônio (ver seção 9) e conferir o PM2 (P7) nos servidores reais.

## 11. POLÍTICA DE VERSÕES e PLANO DE MODERNIZAÇÃO (pedido do usuário, 05/10/2026)

**Regra permanente:** o usuário sempre pediu as MELHORES soluções, as mais usadas nos grandes sistemas e a **versão estável mais recente, testada e com suporte** (no Node, a LTS ativa). Por isso:
- **Nada novo entra no projeto em versão antiga.** Antes de instalar ou acrescentar qualquer biblioteca, ferramenta ou programa, a IA CONFERE a versão estável mais recente e o calendário de suporte (ex.: `npm view <pacote> dist-tags`,
  `npm outdated`, calendário oficial do Node) e usa essa; se for usar outra, explica o motivo ao usuário ANTES.
- A IA **avisa o usuário** quando encontrar versão ultrapassada ou sem suporte, em vez de deixar passar. Sistema pensado para virar SaaS: dívida de versões custa cada vez mais caro depois.
- Atualizar versão grande é feito **uma de cada vez**, com a bateria completa (inclusive no Windows) como porteira. Nada de misturar várias trocas num commit só. Produção (AWS) só quando o usuário decidir.

**Inventário conferido em 05/10/2026 (`npm outdated` + calendário do Node; o que está em produção hoje é o da esquerda):**
- **Node:** o script de instalação dos servidores (`scripts/1_setup_servidor.sh`) instala o **Node 20 — fim do suporte em 30/04/2026 (já sem correções de segurança)**. Node 22 vai até 30/04/2027; **Node 24 (LTS ativa) até 30/04/2028**;
  Node 26 vira LTS em 28/10/2026. A versão REAL de cada servidor e do PC do usuário nunca foi conferida (o sandbox da IA usa Node 22).
- **Frontend (uma versão principal atrás):** React 18 → 19, Vite 5 → 8, Vitest 2 → 5, @vitejs/plugin-react 4 → 6, react-router-dom 6 → 7, date-fns 3 → 4, react-toastify 10 → 11, react-datepicker 6 → 9.
- **Backend:** Express 4 → 5, helmet 7 → 8, express-rate-limit 7 → 8, node-cron 3 → 4, dotenv 16 → 18, bcryptjs 2 → 3, docx 8 → 9, pdfkit 0.14 → 0.20, pdfjs-dist 3 → 6.
- `npm audit` completo (inclui ferramentas de desenvolvimento) mostra avisos em vite/vitest/esbuild/qs (só afetam o ambiente de desenvolvimento, não a produção; a bateria audita só produção). Correção exige vite 8/vitest 5 (troca grande).

**Ordem proposta do plano (NADA disto foi feito; só começa com OK do usuário):** (1) Node → 24 LTS (servidores e PC; quase sem mudar código; a AWS só quando o usuário decidir); (2) ferramentas de teste/build (Vite, Vitest);
(3) bibliotecas, uma por vez, bateria completa a cada uma (react-router 7 incluído aqui como o item mais simples; depois React 19, Express 5, etc.).

