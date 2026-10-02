# Plano — bateria de testes COMPLETA do módulo Processos

Pedido do usuário (Claudenor, 02/10/2026): colocar **TUDO** da tela de Processos na bateria, de forma
minuciosa, em todos os detalhes. Autorizado por ele: montar o plano, numerar os passos e executar na ordem.
**Não desmembrar nenhum arquivo agora** (decisão dele). Todo trabalho vai só para o branch `rascunho`; o `main`
nunca é tocado.

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
- [ ] **A3 (EM ANDAMENTO — teste escrito, 8 achados aguardando decisão do usuário; ver "Achados do A3")** Auxiliares: fóruns, varas, tipos, status, instâncias e assuntos — criar, editar, excluir, com os bloqueios de uso.
- [ ] **A4** Permissões: 401 sem login e 403 sem permissão em TODAS as rotas de Processos; áreas restritas.

### Fase B — Tela "lista de Processos" (`Processos.js`)
- [ ] **B1** Tela: busca, filtros, ordenação, paginação, etiquetas, menu de cada linha, "Abrir pasta", estados vazio/erro.
- [ ] **B2** Janela "Novo processo": todos os campos, assuntos, OABs, partes, cadastro rápido de parte, CEP, validações.
- [ ] **B3** "Editar processo" (e modo Detalhes, somente leitura — todo campo travado), "Motivo do status", "Histórico".
- [ ] **B4** Excluir processo, renumerar, "Gerenciar auxiliares" (fóruns, varas, tipos, status, instâncias, assuntos).

### Fase C — Tela da pasta (`PastaDetalhe.js`, aba por aba)
- [ ] **C1** Cabeçalho e partes: voltar, editar número da pasta, painel de partes e contatos (e-mail, SMS, WhatsApp,
      copiar telefone/e-mail, anotações de atendimento, ver cadastro, gerar documento).
- [ ] **C2** Aba **Processos**.
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

## Achados do A3 (teste `backend/tests/integration/processos-auxiliares.integration.test.js`: 6 passam, 13 falham DE PROPÓSITO)

Nada deve ser corrigido sem a resposta do usuário. Sondagem completa (valores reais) abaixo.

1. **GRAVE — o servidor CAI**: `PUT` de fórum/vara/tipo/instância/assunto com `nome` que não é texto (ex.: `{nome: 5}`) derruba o processo inteiro
   (confirmado subindo o app real: `TypeError: nome?.trim is not a function` fora do `try` do handler async; o Express 4 não captura e não há
   `unhandledRejection`/wrapper; o processo sai com código 1). Propor: (a) rede de segurança GLOBAL (todo handler async cai no tratamento de
   erro → 500 "Erro interno", servidor continua) e (b) validar que `nome` é texto. O mesmo padrão pode existir em outros módulos.
2. Tipos e instâncias aceitam nome só com espaços e GRAVAM nome vazio (a sondagem encontrou 1 vazio em cada tabela). Status/assunto/fórum/vara recusam.
3. `nome` que não é texto: fórum/tipo/instância/assunto/vara → 500 (POST); status aceita `123` e `['x']` e grava como texto.
4. Textos longos demais (nome e todos os campos de fórum e vara: abrev, cep, num_end, cidade, logradouro, compl, bairro, código, e-mail, tel) → 500 "Erro
   interno" sem explicação (limites do banco: fórum nome 150/abrev 50/cep 8/num 11/cidade 100/logradouro 300/compl 50/bairro 100; vara nome 150/cód 15/email 100/
   tel 50/compl 100/abrev 50; tipo, instância e status 100; assunto 150).
5. Nome repetido é aceito em tipos, instâncias e status (assunto já recusa). Fórum/vara repetidos podem ser legítimos (mesmo nome em lugares diferentes) — não testado.
6. Excluir algo que NÃO existe (ou já excluído) responde 200 "Excluído" e grava auditoria falsa (6 auditorias fantasma na sondagem).
7. Vara pode ser criada/movida para um FÓRUM EXCLUÍDO (200/201).
8. Assunto EXCLUÍDO não deixa reutilizar o nome ("Já existe um assunto..." mesmo sem aparecer na lista) — o UNIQUE do banco vale também para os excluídos.

## Estado atual

Plano criado em 02/10/2026. **Passo atual: A3 — teste escrito; aguardando o usuário decidir os achados 1 a 8.** (Servidor completo no fim do A2: 121 rápidos + 175 banco + 175 frontend, tudo verde.) Antes de continuar, reler este arquivo e conferir o `git log` do
`rascunho` para saber o que já foi feito (marque `[x]` acima ao concluir cada passo).
