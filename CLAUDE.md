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
- **P1** — Validações específicas (servidor responde 400 claro, nunca "Erro interno"). **Fluxos principais já sem 500:** Processos, Tarefas, Perícias, Audiências, Prazos, Publicações, Dashboard, Relatórios.
  **Ainda dão 500 (tipo errado e/ou texto longo demais):** Pessoas (cadastrar física e jurídica, 3 rotas de histórico, auxiliares); Prazos (tipos e subtipos); Audiências (tipos, freelas, "reverter");
  Perícias (tipos); Financeiro (formas de pagamento, instituições financeiras); Documentos (modelos); Pendências de Docs. (tipos); Controle (profissões); Configurações (dados do escritório, texto longo); Agenda (novo compromisso).
  Ou seja: Audiências, Perícias e Financeiro estão só PARCIALMENTE feitos (fluxo principal sim, cadastros auxiliares não). Modelo pronto: `backend/src/utils/camposTexto.js`.
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
  **TESTE DE TELA da ficha de PESSOA FÍSICA — criado em 05/10/2026 (`frontend/e2e/pessoas-ficha-fisica.spec.js`, 14 testes: nova, validações, CPF, responsável legal, avisos de idade, CTPS/telefones/e-mails, listas "…", CEP, contas bancárias, editar com ida e volta, detalhes travado, acessibilidade).** **Ficha da pessoa JURÍDICA: teste criado em 05/10/2026 (`frontend/e2e/pessoas-ficha-juridica.spec.js`, 11 testes: nova, validações, CNPJ incl. duplicado, Em Recuperação Judicial, telefones/e-mails, CEP, contas bancárias, editar com ida e volta, cancelar/erro do servidor, detalhes travado, acessibilidade; as 2 fichas juntas 25/25).** **ACHADO ABERTO (aguarda decisão do usuário): a ficha da EMPRESA grava e-mail inválido ("email-sem-arroba" foi gravado; provado rodando) porque a conferência do formato do e-mail no salvar só existe para pessoa física; a tela só mostra o aviso embaixo do campo.** **LISTA de Pessoas: teste de tela criado em 05/10/2026 (`frontend/e2e/pessoas-lista.spec.js`, 12 testes: colunas, busca com/sem máscara e curingas, paginação, exportar Excel físicas e jurídicas com o arquivo baixado, menu ⋮ e "Qtde Proc", excluir (confirmação e bloqueio por vínculo), unificar pessoas e empresas, falha do servidor, usuário não administrador; as 3 telas de Pessoas juntas 37/37).**
  **ACHADOS da lista (aguardam decisão do usuário; NADA foi mudado):** (a) o menu ⋮ (`MenuAcoes.js`, usado no sistema todo) NÃO fecha com ESC — só clicando fora ou rolando; (b) a janela "Confirmar exclusão" diz "O registro ficará inativo e não aparecerá mais nas listagens", mas o servidor APAGA de verdade (DELETE; confirmado no código e no teste de servidor); (c) o número da coluna "Qtde Proc" é um `<span onClick>` (sem teclado/foco): quem usa só teclado não abre os processos; (d) no navegador de teste o arquivo exportado de Pessoas físicas aparece como "download" (sem nome e sem .xlsx) quando o nome tem acento ("Pessoas Físicas - ...") — a tela pede o nome certo; NÃO sei se acontece no Chrome do usuário (confirmar com um clique real no Windows); (e) busca com letras E números (ex.: "Paginada 1") também casa CPF/telefone pelos números (P6, desenho antigo).
  Faltam: lista de Pessoas para quem só VISUALIZA (hipótese NÃO provada: a lista mostra "+ Nova", "Editar" e "Excluir" a quem só tem "visualizar"; o servidor então responde 403) e acessibilidade em outros estados/permissões.
  Correções feitas com OK do usuário (05/10/2026): select "Tipo da conta" ganhou rótulo; botão Salvar da ficha deixou de pular o aviso "dígito com mais de 2 caracteres" (e a 2ª confirmação "Campos sem informação" não some mais); campo Observações não é mais convertido para Title Case; ESC dentro do mini-formulário "…" fecha só ele.
  **Contraste dos avisos pequenos de erro — CORRIGIDO em 05/10/2026 (OK do usuário):** o vermelho claro `#e74c3c` (3,82:1) foi trocado pelo `#b91c1c` (já usado em 35 lugares) nos 8 avisos "⚠️ ..." de e-mail, CPF, CNPJ, data, nome, CEP (Pessoas, `LinhasContato.js`, Foruns, Audiências). Teste da ficha da pessoa física: 14/14.
  **BATERIA NO WINDOWS (05/10/2026, máquina lenta: Chromium ~43 min, frontend 96 s contra 18 s no ambiente da IA) — 5 falhas, todas de TESTE (nada do sistema), corrigidas com OK do usuário:** abrir "Editar" na ficha física (menu fechava quando a lista recarregava), aba Andamentos "Parar consulta" (consulta simulada de 4 s fixos acabava antes do clique — agora fica pendurada até o teste soltar), `violacoesGraves` (helpers.js) agora repete se a página recarregar no meio, testes rápidos do frontend esperam até 5 s em `waitFor`/`findBy` (`tests/setup.js`), e o contraste do aviso de e-mail (já corrigido antes). Causa de lentidão = hipótese forte, não provada; a prova é a próxima bateria no Windows.
  **PACOTE C — FEITO no `rascunho` em 05/10/2026 (aguarda a bateria completa no Windows) — listas e buscas de PESSOAS (física, jurídica, "escolher pessoa" e as 2 exportações):** (5) página/limite: usam `paginacao()` (negativo, zero, texto ou lista viram o padrão: página 1, 20 por página, máximo 100; a resposta devolve os valores já corrigidos);
  (6) o termo de busca precisa ser TEXTO (`?busca[]=a` dá aviso 400 "A busca inválida"), aparado e de até 200 caracteres; (7) `%` e `_` são procurados como texto (`escaparLike`, também na ordenação do "escolher pessoa");
  **(8a) busca COM OU SEM MÁSCARA (regra do usuário):** função `padroesDeBusca` em `pessoasController.js`. CPF e CNPJ (gravados só com dígitos) são achados com ou sem pontuação (já era assim para CPF); quando o termo é um NÚMERO digitado com ou sem máscara (só dígitos e `( ) . - / +`, com 3 ou mais dígitos),
  o telefone (física e jurídica), o RG e o PIS são comparados ignorando a máscara de quem foi gravado ("19988776655" acha "(19) 98877-6655" e o contrário). Termo com letras (nome) NÃO entra nessa regra (senão "Maria 2" acharia todo telefone com 2). Por desenho antigo (P6), um termo com letras e números continua usando os números dele na busca de CPF/CNPJ.
  Provado: os 4 testes novos falham com o código antigo (0/4) e passam com o novo; `pessoas.integration.test.js` 39/39 (3 rodadas); integração completa 319/319; testes rápidos 132/132; nomes indefinidos: nenhum; telas de Processos que buscam pessoas (partes, cadastro rápido, ver cadastro, anotações) no Chromium 5/5. Os testes antigos do pacote C (pasta `backend/tests/pendentes`) foram incorporados ao teste de Pessoas e a pasta foi apagada.
- **P2** — Curingas do LIKE (`%` e `_`): **aberta fora de Processos e Pessoas** (Pessoas feito no pacote C em 05/10/2026). `escaparLike` é usada em Processos e Pessoas. Montam `%termo%` direto: Tarefas, Publicações, Perícias, Pendências de Docs., Audiências (freelas), Financeiro.
  A busca de Prazos usa só dígitos, então NÃO é afetada.
- **P3** — Paginação inválida: **aberta** em Prazos, Publicações, Documentos (histórico) e Financeiro (consulta) (Pessoas físicas e jurídicas foram corrigidas no pacote C em 05/10/2026): `pagina`/`limite` negativos dão 500 (Prazos também com zero);
  texto como "abc" não dá erro. Já usam `paginacao()` e não deram erro: Audiências, Perícias, Processos, Tarefas.
- **P4** — Id que não é número: **quase feita**. Em todas as rotas de LEITURA com id ("abc", -1, número gigante) nenhuma deu 500. **Ainda dão 500 com id "abc"**, em exclusões/alterações de cadastros auxiliares:
  Audiências (excluir tipo, excluir freela, "ata impressa"), Financeiro (excluir forma de pagamento, excluir instituição), Documentos (desativar/reativar modelo), Perícias (excluir tipo), Pendências de Docs. (excluir tipo).
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
- **P9 — Buscas com e sem máscara em TODOS os módulos (regra do usuário, 05/10/2026: "o sistema precisa localizar telefones, processos, CPF — todos com ou sem máscaras"):** PENDENTE fora de Pessoas e Processos. **Pessoas: FEITO (pacote C).** Processos: já tem testes de busca por CPF/CNPJ/telefone com e sem pontuação.
  **Auditoria só de LEITURA do código em 05/10/2026 (nada foi alterado; reconferir o código antes de agir, regra 0):** Prazos busca o número do processo só por dígitos (ok com e sem máscara); Tarefas busca o número do processo com e sem pontuação (ok); Pendências de Docs. (escolher cliente) acha CPF/CNPJ com e sem pontuação (ok), mas não busca telefone;
  **Perícias** (tela e relatório): número do processo (`pr.numProc LIKE`) e telefone do perito são procurados como foram digitados — número CNJ só com dígitos NÃO acha o gravado com máscara, e telefone só com dígitos não acha o gravado com máscara; **Financeiro > Consulta**: `num_processo` procurado como digitado (mesmo problema com o CNJ);
  **Publicações**: `numero_processo` e texto procurados como digitados; Audiências (freelas): só nome/OAB (sem telefone/CPF). Documentos, Dashboard e Relatórios: não conferidos nesta auditoria. A fazer (precisa do OK do usuário): aplicar o mesmo método do pacote C (comparar só os números quando o termo é numérico) em Perícias, Financeiro > Consulta e Publicações, com testes.
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

