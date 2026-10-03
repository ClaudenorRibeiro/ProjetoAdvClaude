# Plano — bateria de testes COMPLETA do módulo Processos

Pedido do usuário (Claudenor, 02/10/2026): colocar **TUDO** da tela de Processos na bateria, de forma
minuciosa, em todos os detalhes. Autorizado por ele: montar o plano, numerar os passos e executar na ordem.
**Não desmembrar nenhum arquivo agora** (decisão dele). Todo trabalho vai só para o branch `rascunho`; o `main`
nunca é tocado.

## ⚠ PENDÊNCIAS GERAIS — NÃO ESQUECER (registradas a pedido do usuário em 02/10/2026)

Itens abertos que NÃO fazem parte de um passo (A1…D1) e ficam fora do módulo Processos. Só tirar da lista com a decisão/OK do usuário.
Ao fechar a Fase D (ou quando o usuário pedir), **lembrar o usuário destas pendências**.

- [ ] **P1 — Validações específicas, módulo a módulo.** A rede de segurança (A3) só impede a QUEDA do servidor. Falta verificar, em cada módulo, se o
      servidor trata com aviso claro (400) e não com "Erro interno" (500): nome/campo que não é texto, texto longo demais (limites das colunas do banco),
      campo só com espaços, e demais entradas inválidas. Módulos: Pessoas, Prazos, Tarefas, Audiências, Perícias, Publicações, Documentos, Pendências de
      Docs., Dashboard, Relatórios, Configurações, Controle (e conferir o Financeiro). Modelo pronto: `backend/src/utils/camposTexto.js`.
- [ ] **P2 — Varredura de curingas do LIKE** (`%` e `_` tratados como "qualquer coisa") em TODAS as buscas do servidor, fora de Processos. Usar
      `escaparLike` (`backend/src/utils/helpers.js`). Já corrigido: busca de processos (`/processos/buscar`), listagem de pastas e Relatórios.
- [ ] **P3 — Paginação sem validação** (`pagina`/`limite` inválidos → erro 500) nas listagens dos outros módulos. Usar `paginacao()` (`utils/helpers.js`).
      Já corrigido: `listarPastas`.
- [ ] **P4 — Identificador que não é número** (ex.: `/modulo/abc`) dando 500 em outras rotas. Em Processos (processo/pasta/auxiliares) já responde 404.
      Verificar os demais módulos (ex.: `comIdNumerico` em `processosController.js`).
- [ ] **P5 — Migração do react-router para a versão 7** (adiada por decisão do usuário; hoje o `npm audit` do frontend mostra 2 avisos "média").
- [ ] **P6 — Informativo, sem ação:** `log_documentos_gerados` guarda a origem (processo, etc.) sem chave declarada; excluir o processo deixa o histórico
      apontando para um id que sumiu. Busca por poucos dígitos (ex.: "30") também casa CPF/CNPJ/telefone — é o desenho da busca.
- [ ] **P8 — Decidir (só se o usuário quiser): "ver só os meus processos".** Hoje todo usuário com a permissão de Processos vê todos os processos. A coluna
      `usuarios.ver_todos_processos` é vestigial (sem tela e sem uso). Seria um RECURSO NOVO (permissão nova em Processos, tela de Permissões e regra no
      servidor) — não é conserto. Se a coluna for removida, precisa de script SQL para o HeidiSQL e atualizar o `estrutura_banco.sql`.
- [ ] **P7 — Verificar no servidor real** se o PM2 reinicia sozinho após queda (o código menciona PM2; não foi verificado).

## Como cada passo funciona (protocolo combinado com o usuário)

1. **Mapear** os controles reais do passo (ler a tela/rotas atuais; nunca confiar neste arquivo nem em memória — regra 0).
2. **Escrever** os testes (servidor em `backend/tests/integration/`, navegador em `frontend/e2e/`), cobrindo cada botão,
   janela, campo, validação e a acessibilidade; conferir o resultado no banco de teste quando mexer em dados.
3. **Rodar** (sandbox: `quality/` e os testes isolados; o usuário roda a bateria completa no PC dele).
4. **Se achar erro:** PARAR, explicar ao usuário em linguagem simples (sem código) o que está errado e propor o ajuste.
   **Só corrigir depois da resposta dele.** Depois da correção, repetir o teste.
5. **Passou:** rodar a verificação rápida, commitar e enviar para `rascunho`, marcar `[x]` abaixo, avisar o usuário
   (para ele rodar `salvar_RASCUNHO_do_GIT_no_pc.bat` e `TESTAR-COMPLETO.bat` e mandar o "RESUMO DA BATERIA")
   e seguir para o próximo passo.

Regras que continuam valendo: teste pulado = reprovado; erro é erro (não importa a origem); toda tela/janela nova entra
na análise de acessibilidade; nunca alterar o banco real (scripts SQL só para o HeidiSQL); transações com
BEGIN/COMMIT/ROLLBACK; nenhum registro órfão ao excluir; nomes de tabela em minúsculas.

## Passos

### Fase A — Servidor (as 31 rotas de `/processos`)
- [x] **A1 (concluído em 02/10/2026)** Processos: criar, editar, excluir (sem deixar órfãos: OABs, partes, vínculos), histórico, buscas
      (`/buscar`, `/:id/basico`, `/sugerir-pasta`, `/pastas/checar`, `/auxiliares`), validações e entradas inválidas.
- [x] **A2 (concluído em 02/10/2026)** Pastas: listar (busca, etiquetas, assuntos, paginação), buscar uma pasta, renumerar (conflitos, histórico).
- [x] **A3 (concluído em 02/10/2026)** Auxiliares: fóruns, varas, tipos, status, instâncias e assuntos — criar, editar, excluir, com os bloqueios de uso.
- [x] **A4 (concluído em 02/10/2026)** Permissões: 401 sem login e 403 sem permissão em TODAS as rotas de Processos; áreas restritas.

### Fase B — Tela "lista de Processos" (`Processos.js`)
- [x] **B1 (concluído em 02/10/2026)** Tela: busca, filtros, ordenação, paginação, etiquetas, menu de cada linha, "Abrir pasta", estados vazio/erro.
- [x] **B2** Janela "Novo processo": todos os campos, assuntos, OABs, partes, cadastro rápido de parte, CEP, validações.
- [x] **B3** "Editar processo" (e modo Detalhes, somente leitura — todo campo travado), "Motivo do status", "Histórico".
- [x] **B4** Excluir processo, renumerar, "Gerenciar auxiliares" (fóruns, varas, tipos, status, instâncias, assuntos).

### Fase C — Tela da pasta (`PastaDetalhe.js`, aba por aba)
- [x] **C1** Cabeçalho e partes: voltar, editar número da pasta, painel de partes e contatos (e-mail, SMS, WhatsApp,
      copiar telefone/e-mail, anotações de atendimento, ver cadastro, gerar documento).
- [x] **C2** Aba **Processos**.
- [ ] **C3** Aba **Andamentos** (janela de andamento).
- [ ] **C4** Aba **Prazos** (novo, editar, cancelar, concluir/fazer/liberar, histórico).
- [ ] **C5** Aba **Tarefas** (nova, editar, concluir, histórico).
- [ ] **C6** Aba **Audiências** (nova, editar, cancelar, remarcar, histórico, resultado; ata já coberta) — inclui o
      problema já confirmado da data (ver "Achados").
- [ ] **C7** Aba **Perícias** (nova, editar, cancelar, remarcar, marcar realizada/remarcada, histórico).
- [ ] **C8** Aba **Financeiro** da pasta (blocos reaproveitados do Financeiro: lançamento, acordo, histórico).

### Fase D — Fechamento
- [ ] **D1** Bateria completa no PC do usuário; conferir se alguma tela nova precisa entrar em `TELAS_LOGADAS`; resumo final.

## Achados já confirmados (aguardam decisão/execução)

- **Data da audiência não pode ser digitada** (confirmado no código, 02/10/2026): o componente
  `frontend/src/components/ui/SeletorData.js` é só um botão que abre um calendário. É usado na janela de audiência
  (nova/editar) e na janela de perícia da ata (`ModalPericiaAta.js`). Proposta: aceitar digitação dd/mm/aaaa mantendo o
  calendário. O teste do passo C6 deve conferir que dá para digitar. Correção só com o OK do usuário.
- (Já corrigido em 02/10/2026) Pasta com 5 dígitos ou mais não era achada na busca: o `LPAD` do MySQL cortava 99001 em
  9900. Regra única `pastaFormatadaSql` em `backend/src/utils/helpers.js`.

## Achados do A1 — TODOS CORRIGIDOS (decisão do usuário: seguir a recomendação em cada um)

Teste: `backend/tests/integration/processos-crud.integration.test.js` (16/16). Servidor completo: 119/119 rápidos, 157/157 banco.

1. Pasta liberada não voltava a ser sugerida → `sugerirNumeroPasta` agora devolve o MENOR número livre (1 ou o primeiro buraco).
2. Item que não existe mais (vara, tipo, status, instância, assunto, pasta) dava "Erro interno" (500) → agora 409 com
   "Um dos itens escolhidos não existe mais... Recarregue a tela" — regra GLOBAL em `backend/src/utils/response.js`
   (`ER_NO_REFERENCED_ROW_*`), vale para todos os módulos (teste em `backend/tests/response.test.js`).
3. Editar gravava número do processo/protocolo com espaços nas pontas → agora grava o valor limpo, como a criação.
4. Busca de processo tratava `%` e `_` como curinga → `escaparLike` agora é único em `backend/src/utils/helpers.js`
   (os Relatórios passaram a usar o mesmo; teste em `backend/tests/unit/helpers-pasta-like.test.js`).
   **Atenção para o A2:** conferir se `listarPastas` (busca da lista) e outras buscas por `LIKE` têm o mesmo problema.
5. (informativo, sem correção) `log_documentos_gerados` guarda `ancora_tipo/ancora_id` sem chave declarada; excluir um
   processo deixa essas linhas de histórico apontando para um id que sumiu (é log, não é cadastro).

## Achados do A2 (teste `backend/tests/integration/processos-pastas.integration.test.js`: 18/18 — TODOS CORRIGIDOS)

Decisões do usuário (02/10/2026): itens 1 a 4 — seguir a recomendação; item 5 — regra dele (abaixo). Todos corrigidos.

1. [corrigido] Listagem com página/limite inválidos dava 500 → `paginacao()` em `backend/src/utils/helpers.js` (inválido vira padrão: página 1, 20 por página; teto de limite 100 e de página).
2. [corrigido] Busca de pastas tratava `%`/`_` como curinga → `escaparLike` na `listarPastas`.
3. [corrigido] Renumerar aceitava "12abc", "1e3", "0x10", 12.7 → `numeroPastaValido()` (só inteiro positivo de até 9 dígitos; espaços nas pontas ok).
   Aplicado também ao número da pasta em `criarProcesso` (mesmo defeito).
4. [corrigido] Duas renumerações simultâneas para o mesmo número: a segunda agora recebe "O número já pertence a outra pasta" (400), não 500.
5. [corrigido, regra do usuário] Dois usuários pegam o mesmo número de pasta ao mesmo tempo (ou um chega depois com a tela desatualizada):
   só um fica com a pasta; o outro recebe 409 "A pasta nº X já está em uso. Escolha outro número de pasta." O sistema continua PERMITINDO vários
   processos na mesma pasta (carta precatória, recurso) quando o usuário confirma "Sim, incluir": a tela (`Processos.js`, marca
   `usarPastaExistenteRef`, zerada ao mudar o número) manda `pasta_existente_confirmada: true`; `criarProcesso` só aceita pasta com processo
   ativo com essa confirmação (booleano `true`); pasta vazia continua livre para qualquer um; `pasta_id` explícito não muda. Corrida de INSERT
   (ER_DUP_ENTRY/ER_LOCK_DEADLOCK) também vira o mesmo 409. A tela "Novo processo" é o único chamador do POST /processos.
   **No B2 (tela Novo processo): cobrir no navegador o aviso "Pasta já em uso → Sim, incluir" e a mensagem de pasta em uso.**
6. (informativo, sem correção) Busca por poucos dígitos (ex.: "30") também casa CPF/CNPJ/telefone das partes que contenham esses dígitos.
7. (a decidir) O mesmo `LIKE` sem proteção de curingas e a mesma paginação sem validação provavelmente existem em OUTROS módulos
   (Pessoas, Prazos, Tarefas...); fazer varredura no servidor inteiro como passo separado, se o usuário quiser.

## Achados do A3 — TODOS CORRIGIDOS (decisão do usuário: seguir a recomendação nos 8)

Teste: `backend/tests/integration/processos-auxiliares.integration.test.js` (21/21). Servidor completo no fim do A3: 127 rápidos + 196 banco + 16 navegador, tudo verde.

1. **GRAVE — servidor caía** com `PUT` de nome que não é texto → REDE DE SEGURANÇA GLOBAL: `backend/src/utils/rotasSeguras.js` (`protegerRotas`)
   aplicada nos dois roteadores (`routes/index.js` e `routes/relatorios.js`): erro/rejeição em qualquer handler vira 500 e o servidor continua
   (teste de unidade com Express real em `tests/unit/rotas-seguras.test.js` + regressão no teste do A3). Vale para TODOS os módulos.
2. Tipos/instâncias gravavam nome vazio (só espaços) → recusado.
3. Nome que não é texto → 400 "Nome é obrigatório" (status também deixou de aceitar `123`/lista).
4. Texto longo demais (nome e campos de fórum/vara) → 400 "X muito longo (máximo N caracteres)" com os limites do banco
   (`backend/src/utils/camposTexto.js`, `texto`/`lerTextos`; CEP até 8 números).
5. Nome repetido em tipos, instâncias e status → 400 "Já existe um tipo/uma instância/um status com este nome" (entre os ativos; ignora
   maiúscula/acento/espaços). Regra no código, SEM índice novo no banco (pode haver repetidos antigos). Fórum/vara repetidos: permitidos (podem ser legítimos).
6. Excluir o que não existe / já excluído → 404, sem auditoria falsa (UPDATE com `ativo=1` e checagem de `affectedRows`).
7. Vara em fórum excluído (criar ou mover) → 409 "O fórum escolhido não existe mais".
8. Assunto excluído: cadastrar o mesmo nome REATIVA o assunto (auditoria `reativar`); renomear para o nome de um excluído explica o motivo.
9. (achado extra durante a correção) Editar/excluir auxiliar com id que não é número (`/foruns/abc`) dava 500 em 11 rotas → 404 (`comIdNumerico`).
   Processos e pastas já respondiam 404.
10. (informativo) O código menciona PM2 (comentário em `server.js`): em produção o processo pode reiniciar sozinho após uma queda, mas todos os usuários
    perdiam a conexão por instantes — não foi verificado.
11. (para a varredura) a rede de segurança resolve a QUEDA em qualquer rota; os erros de validação específicos (nome não-texto etc.) ainda precisam de
    verificação módulo a módulo — fazer nos passos de cada módulo.

## Achados do A4 — RESOLVIDOS (teste `backend/tests/integration/processos-permissoes.integration.test.js`: 10/10)

Resultado principal: as PORTAS DE PERMISSÃO de Processos estão corretas (matriz: um usuário só com a permissão X passa só nas rotas de X e leva 403
em todas as outras; negada explicitamente = 403; sub-módulo "assuntos" separado; admin/super passam; sem login = 401 em todas; efeito imediato de
revogar permissão, rebaixar nível e desativar usuário; a recusa ocorre antes de qualquer gravação).
Servidor completo no fim do A4: 127 rápidos + 206 banco + 16 navegador, tudo verde.

1. [corrigido, decisão do usuário] Token válido sem `id` (ou com `id` que não é número positivo) dava 500 → agora 401 "sessão não é mais válida"
   (`autenticar` em `backend/src/middleware/auth.js` valida o `id`; id numérico em texto, ex.: "1", continua valendo e é conferido no banco).
2. [decisão do usuário: MANTER] As rotas `/processos/buscar`, `/processos/:id/basico`, `/processos/sugerir-pasta`, `/processos/pastas/checar` e
   `GET /processos/auxiliares` continuam abertas a qualquer usuário logado (outros módulos as usam). O teste documenta esse comportamento.
3. [esclarecido] `usuarios.ver_todos_processos` é só uma coluna do banco (padrão 0) que o servidor grava e carrega na sessão; NÃO existe campo na tela de
   usuários (zero ocorrências no frontend) e NADA a usa. As permissões reais "ver de todos" ficam na aba Permissões (Prazos, Tarefas, Agenda). Para
   Processos não existe permissão desse tipo. Ver pendência P8.

## Achados do B1 (teste `frontend/e2e/processos-lista.spec.js`: 9 passam, 1 falha DE PROPÓSITO)

Cobertura: cabeçalho/colunas/contador, ordem e paginação (20 por página), busca (título, nº da pasta com destaque verde e "430 == 0430", CNJ, protocolo,
partes, CPF com/sem pontos, telefone, sem resultado, curingas `% _`, volta à página 1), filtro de assuntos, etiquetas pessoais e do escritório (legenda,
bolinhas, filtrar, combinar, limpar), marcar/trocar/remover etiqueta pelo menu ⋮ (conferido no banco), abrir pasta (título e menu), "+ Novo Processo"
(abre/fecha por Cancelar, ✕ e ESC), usuário que só visualiza (sem o botão), erro 500 do servidor, celular (375 px) e acessibilidade em cada estado.
Dados de teste: `prepararListaProcessos` (26 pastas) e `criarUsuarioSoVisualiza` em `frontend/e2e/helpers.js`.

1. [corrigido, decisão do usuário] **Acessibilidade — botão dentro de botão no seletor de assuntos** (axe `nested-interactive`, séria): o "×" de cada assunto
   era um `<span role="button">` dentro do `<button>` que abre a lista. Agora `SeletorAssuntos` (`frontend/src/pages/Processos/Processos.js`) é um contêiner
   clicável com controles IRMÃOS: um `<button aria-label="Remover assunto X">×</button>` por assunto e um `<button aria-label="Abrir a lista de assuntos"
   aria-expanded>` ▲/▼; clicar em qualquer ponto da caixa continua abrindo/fechando; funciona pelo teclado (testado). Visual igual. O mesmo componente é usado
   nas janelas Novo Processo e Editar Processo (2 outros usos em `Processos.js`) — **no B2/B3 conferir com assuntos marcados (acessibilidade e teclado)**.

Resultado no fim do B1: lista 10/10; navegador completo 26/26; frontend 175/175 + build; servidor 127 + 206 (sem mudança no servidor neste passo).

### Achados do B2 (02/10/2026) — CORRIGIDOS com autorização do usuário (3 itens + nomes dos "…")
Teste: `frontend/e2e/processos-novo.spec.js` (12 testes; criar processo completo conferido no banco, pasta em uso, erros do servidor e permissões já passam).
1. Acessibilidade: textos "Nenhum autor/réu/perito adicionado" em cinza #ccc (contraste 1,6:1) e "Será gerado ao adicionar autores e réus abaixo" (#aaa sobre #f8f8f8, 2,18:1).
2. Acessibilidade: campos sem rótulo — seletor Física/Jurídica de autor, de réu e de perito, e o seletor de OAB do processo.
3. Tecla ESC com uma lista aberta (responsável, assuntos etc.) fecha a janela "Novo Processo" inteira e perde o que foi digitado (`hooks/useEscFechar.js` fecha a janela mais acima sem olhar se há lista aberta).
4. Observação (não é erro): o "…" dos botões não tem nome descritivo (só "…") — sugestão de aria-label/title.

### Achados do B3 (03/10/2026) — CORRIGIDOS com autorização do usuário (itens 1–3 + réu "Jurídica" + nomes dos seletores)
Teste: `frontend/e2e/processos-editar.spec.js` (10 testes: Detalhes, Editar, partes/assuntos/OABs, motivo do status, erros do servidor, Histórico, assuntos/ESC, permissões). 8 passam.
1. Acessibilidade — "Detalhes do Processo" (somente leitura): a área rolável da janela não é alcançável pelo teclado (com todos os campos travados não há onde pôr o foco) — `scrollable-region-focusable` em `.modal-body`.
2. Acessibilidade — "Histórico do processo": cores "Cadastrou" (#16a34a, 3,3:1) e "Mudou status" (#d97706, ~3,2:1) abaixo de 4,5:1.
3. O motivo do status é gravado (`logs_auditoria.dados_novos`), mas NADA no código lê/mostra `dados_novos`: o Histórico mostra só "Mudou status — Processo <nº>", sem status anterior/novo nem o motivo, embora a janela diga "O motivo ficará salvo no histórico/auditoria do processo".
4. Observações (não são erro): no Editar o réu começa em "Física" (no Novo Processo começa em "Jurídica"); os seletores Física/Jurídica do Editar têm o mesmo nome acessível do grupo ("Autores — polo ativo"…).

### Achados do B4 (03/10/2026) — CORRIGIDOS com autorização do usuário (itens 1–5)
Testes: `frontend/e2e/processos-excluir-renumerar.spec.js` (8) e `frontend/e2e/processos-auxiliares-ui.spec.js` (11). Passam: excluir processo (confirmação, bloqueio por andamento, erro, permissão), renumerar (exceto a acessibilidade do campo), "Encerra o processo", erro/ESC/fechar e as permissões de editar/excluir/assuntos; falham só na acessibilidade:
1. Janelas "Gerenciar" (Tipos, Status, Instâncias, Assuntos, Fóruns, Varas): TODO campo do formulário e a caixa de busca sem rótulo associado (o `<label>` não está ligado ao campo) — regra `label`.
2. Dicas em cinza #aaa (2,2:1) nessas janelas: "Abreviação (Exibida nos dropdowns…)", "Complemento End. (Ex: 4º andar…)", caixa "Encerra o processo (ex.: Arquivado…)". Também ainda existem `#aaa` em "Sem processos" etc. (já tratado) — conferir.
3. Botão "Editar" da lista dessas janelas: azul com contraste 3,6–3,7:1.
4. Renumerar pasta (lápis ✎): o campo numérico sem rótulo.
5. Observação: os botões "Editar" e "✕" de cada linha não dizem de qual item são (leitor de tela lê só "Editar"/"✕"); sugestão aria-label "Editar <nome>" / "Excluir <nome>".

### Achados do C1 (03/10/2026) — CORRIGIDOS com autorização do usuário (itens 1–5)
Teste: `frontend/e2e/processos-pasta-partes.spec.js` (11 testes: cabeçalho, painel de partes, ver cadastro, copiar telefone/e-mail, WhatsApp, anotações, e-mail, SMS, permissão, ESC do SMS). Passam: cabeçalho, copiar e-mail, anotações; os demais falham pelos achados abaixo.
1. Painel "Partes do processo": o cabeçalho que abre/fecha é um `div` clicável — não se alcança com Tab nem abre com Enter (só mouse).
2. Fechar a ficha ("Ver cadastro") recarrega a pasta e o painel de partes volta a ficar FECHADO sozinho (o estado se perde).
3. ESC na confirmação do "Enviar SMS" (passo "Isso consome crédito…") fecha a janela inteira e perde a mensagem — o ouvinte global de ESC do `App.js` clica no ✕ e o "voltar" do próprio modal nunca roda.
4. Quem só tem permissão de Processos (sem Pessoas) vê todas as ações de contato; ao usar, aparece só "Erro ao buscar os telefones da pessoa" (o servidor exige permissão de Pessoas). Sugestão: esconder essas ações nesse caso.
5. Acessibilidade: "representado(a) por …" (#6b7280) com contraste 4,25:1 sobre a cor da linha ao passar o mouse; campo "Para" do e-mail e "Telefone" do SMS (listas) sem rótulo; ficha da pessoa em modo leitura (aberta pela pasta) com 2 campos de texto e 2 listas sem rótulo (bloco do responsável/parentesco).

### Achados do C2 (03/10/2026) — CORRIGIDO com autorização do usuário (balão "Copiado!": #15803d, também nos 2 balões iguais de Pessoas.js)
Teste: `frontend/e2e/processos-pasta-processos.spec.js` (9 testes: tabela e número copiável, etiqueta do escritório — aplicar/trocar/remover, status ligado com motivo, histórico, permissão, erro —, e "+ Novo Processo (mesma pasta)"). Só 1 falha, de acessibilidade:
1. O balão "Copiado!" do número do processo (`NumeroProcessoCopiavel`, componente compartilhado) é branco sobre verde #16a34a — contraste 3,29:1. Sugestão: verde mais escuro (#15803d, ~5:1). (O mesmo componente aparece em várias telas.)
Observação (não é erro): o "processo de referência" do "+ Novo Processo (mesma pasta)" é o 1º da lista (o mais novo); se ele não tiver partes, o novo processo não herda nada.

### Achados do C3 (03/10/2026) — AGUARDANDO decisão do usuário (nada corrigido ainda)
Testes: `frontend/e2e/processos-pasta-andamentos.spec.js` (8) e `backend/tests/integration/andamentos.integration.test.js` (9). Passam: lista/filtro/DataJud (mensagens e "Parar consulta")/Novo/Editar/Excluir na tela; no servidor: listar, excluir, sincronizar, permissões, caminho feliz.
SERVIDOR (`andamentoController.js`) — entradas inválidas dão erro interno ou gravam lixo:
1. Criar com descrição só de espaços grava um andamento VAZIO (201). Editar com descrição vazia/só espaços também grava vazio (200).
2. Descrição que não é texto (número, true, lista, objeto) → 500 (criar e editar); editar SEM descrição → 500 (`undefined.trim`).
3. Data inválida ("xyz", "2026-13-45", "31/12/2026", "2026-02-30", lista, objeto) → 500 ao criar e ao editar (e o número 20260315 é aceito).
4. Texto enorme (200 mil caracteres) → 500 (a coluna é TEXT).
5. Criar em processo com id que não é número ("abc") → 500; id inexistente/0/-1/1.5 → 409 (aceitável).
TELA:
6. Quem só pode VISUALIZAR andamentos vê "+ Novo Andamento" e, nos manuais, "Editar" e "Excluir" (o servidor recusa com 403 depois). Quem pode cadastrar+alterar (sem excluir) também vê "Excluir".
7. Quem NÃO tem permissão de ver andamentos vê "Nenhum andamento registrado" (parece que não há nada; devia avisar que não tem acesso/não foi possível carregar).
Observação: a descrição é convertida em "Iniciais Maiúsculas" ao sair do campo (ex.: "Para", "Que" ficam maiúsculos) — decisão de design já existente, só registrando.

## Estado atual

Plano criado em 02/10/2026. **C2 concluído (9 testes). Próximo passo: C3** (aba Andamentos e a janela de andamento; depois C4–C8). (Servidor completo no fim do A2: 121 rápidos + 175 banco + 175 frontend, tudo verde.) Antes de continuar, reler este arquivo e conferir o `git log` do
`rascunho` para saber o que já foi feito (marque `[x]` acima ao concluir cada passo).

Nota B2: o ESC que fecha janelas está em DOIS lugares — `hooks/useEscFechar.js` e um ouvinte global em `App.js`; ambos usam `escEhDeListaAberta` (lista aberta = ESC só fecha a lista). Textos de aviso em `#aaa` ainda existem em `Processos.js` (dicas das janelas de auxiliares) — tratar no B4.

Nota C1: a ficha da pessoa (`ModalPessoa`, Pessoas.js) tem muitos campos só com `<label>` visual; ganharam `aria-label` os componentes `Campo`, `Select`, `SelectComAdicao`, CPF, CTPS, busca do responsável e as linhas de telefone/e-mail (`LinhasContato.js`). A varredura completa dessa ficha (todas as abas/estados) pertence ao módulo Pessoas — lembrar ao fechar a Fase D. O ESC global (`App.js`) agora respeita `data-esc-proprio` (janelas com etapa interna).
