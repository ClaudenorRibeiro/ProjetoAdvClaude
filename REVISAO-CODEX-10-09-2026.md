# Conferência dos 17 apontamentos do Codex — 10/09/2026

Cada item foi verificado no código-fonte real. Legenda:
**PROCEDE** = confirmado no código · **PROCEDE (parcial)** = parte confere · **conferir** = falsificável mas não verifiquei 100%.
"Origem": ⚠️ = código mexido/criado nesta sessão (10/09) · 🕓 = pré-existente.

| # | Veredito | Origem | Nota |
|---|---|---|---|
| 1 | **PROCEDE** | ⚠️ | `excluirFisica`/`excluirJuridica` conferem ~10 vínculos, mas **não** `pendencia_documento` (polimórfica, sem FK). Cliente que só tem pendência pode ser apagado → pendência órfã. **Fere a regra "sem órfãos".** |
| 2 | **PROCEDE** | 🕓/⚠️ | `unificarJuridicas` (e a de PF) move 9 vínculos mas **não** move `pericia_local_reu` **nem** `pendencia_documento`. O duplicado é apagado no fim → esses dois ficam apontando pro id morto. **Fere "sem órfãos".** |
| 3 | **PROCEDE** | 🕓 | `manutencaoController` limpa uma **lista fixa** (`TABELAS_LIMPAR`) com `FOREIGN_KEY_CHECKS=0`. Faltam tabelas criadas depois: `pericia_local_reu`, `processo_assunto`, `pessoas_avisos_idade`, `publicacoes_lidas`, as `*_etiquetas*`, `pendencia_documento*`, `tipo_documento_pendencia`, `parentesco`. → órfãos depois de "limpar". Só superusuário + só massa de teste, mas real. |
| 4 | **PROCEDE (tarefa) / parcial (prazo)** | 🕓 | `tarefasController.concluir` **não** reaplica o filtro de visibilidade da listagem — chamada direta conclui tarefa que o usuário não veria. `prazosController.mudarStatus` tem a trava `fazendo_por` (bloqueia se OUTRO está fazendo) mas não o escopo `ver_todos`/delegado. |
| 5 | **PROCEDE** | 🕓 | `criarUsuario` usa `nivel \|\| 2` e `atualizarUsuario` idem — **sem whitelist**. Um admin pode mandar `nivel: 0` e criar/promover um **superusuário**. `atualizarUsuario` só protege o alvo que **já é** super, não impede setar 0 num comum. |
| 6 | **PROCEDE** | 🕓 | `salvarPermissoes`: `DELETE FROM permissoes` + loop de `INSERT`, tudo `pool.execute`, **sem transação**. Falha no meio = usuário com permissões pela metade. **Fere a regra de transações.** |
| 7 | **PROCEDE** | 🕓 | `audienciasController.cancelar`, `periciasController.cancelar` e `marcarRealizada`: `UPDATE` do status + `INSERT` na auditoria em dois `pool.execute` separados, **sem transação**. Falha no 2º = status mudou sem histórico. (Os `atualizar` dessas telas **usam** transação — o problema é só o cancelar/realizada.) **Fere a regra de transações.** |
| 8 | **PROCEDE (teórico)** | 🕓 | `pagarParcela` lê a parcela **sem `FOR UPDATE`**, checa `status`, insere na `conta_corrente`. Sem lock de linha e sem unicidade em `conta_corrente(parcela_id, tipo)`. Dois cliques quase simultâneos → dois lançamentos. Baixa probabilidade, mas o furo existe. |
| 9 | **PROCEDE** | 🕓 | `excluirAcordo` só bloqueia se houver **parcela paga** — **não** bloqueia acordo com `status='cancelado'` (contradiz o comentário "cancelamento é definitivo, não exclui mais"). `pagarParcela` só bloqueia `status='pago'` — **não** bloqueia `status='cancelada'` → dá pra "receber" parcela cancelada. |
| 10 | **PROCEDE** | ⚠️ | `recalcularStatus` reabre pendência `resolvida → aberta` **sem checar** se já existe outra aberta do mesmo cliente. Caminho: resolver A → criar B (permitido, A não está 'aberta') → desmarcar doc de A → A reabre → **2 abertas**. Bug da lógica que escrevi nesta sessão. |
| 11 | **PROCEDE (parcial)** | 🕓 | `Relatorios.js` linha 122 chama `financeiroAPI.relatorio(...)` — **essa função não existe** no `api.js` → aba "Financeiro" quebra. Prazos/Tarefas/Audiências/Pastas usam `limite: 200` fixo mas exibem o **total geral** e exportam só os 200 carregados (sem paginação). "Pastas com campos trocados": plausível, não conferi campo a campo. |
| 12 | **PROCEDE** | 🕓 | `authController.verificarSenha` devolve **401** para "senha incorreta"; o interceptor de `api.js` **desloga em qualquer 401**. Errar a senha de confirmação → cai pra tela de login. É o **mesmo padrão** do hotfix de 01/09 (401→403). |
| 13 | **PROCEDE (eventos) / conferir (ata)** | 🕓 | Dashboard: "Audiências/Perícias de hoje/amanhã" filtram só `WHERE data = ?`, **sem status** → cancelada/remarcada aparecem no cartão. "Audiências sem ata": plausível divergir do filtro da tela de Audiências; não vi a query exata. |
| 14 | **PROCEDE** | 🕓 | `verificarAlertasAudiencias` e `verificarAlertasPericias` **só fazem `console.log`** quando chega a data de alerta. A config "dias úteis antes para alertar cliente" existe, o envio não. (Os comunicados normais de audiência/perícia, por outro caminho, funcionam — isto aqui é o alerta antecipado, que é um esqueleto.) |
| 15 | **PROCEDE** | ⚠️ | `verificarAvisosPendenciaDocumento`: grava `avisado_em = NOW()` **dentro da transação** (junto com o sino); o e-mail é best-effort **depois**, fora dela. Se o e-mail falha — e pior, se **só** e-mail estava marcado — a linha já ficou "avisada" e não é re-tentada. Comportamento que mantive do original nesta sessão. |
| 16 | **PROCEDE** | 🕓 | `JOIN_ULTIMA_ACAO` usa `GREATEST(criado_em, editado_em)` de `andamento_processual` — data de **inclusão no sistema**, não do movimento real. Importar hoje um andamento antigo "reanima" o processo. Lançamento manual em `conta_corrente` também não entra no cálculo. **Já era pendência conhecida** (memórias de 07/08 e 31/08). |
| 17 | **PROCEDE** | 🕓 | `criar` processo insere autor/réu/perito **sem checar** se a pessoa existe (sem FK em `pessoa_id`). Tarefas: `data_vencimento \|\| null` no backend (a tela exige, o back não). |

## Leitura geral

- **O audit do Codex é competente. 16 dos 17 procedem** (o #13 só metade não conferi 100%, e o #11 tem um sub-item não verificado). Nada é "invenção".
- **Ferem regras suas explícitas:** órfãos → **#1, #2, #3**; transação em multi-passo → **#6, #7**. Esses são os que eu classificaria como prioridade máxima junto com **#5** (escalonamento de privilégio) e **#12** (desloga o usuário).
- **Vieram do código desta sessão (10/09):** #1 (parcial), #2 (parte pendências), #10, #15. Os outros são **antigos** — já estavam no sistema antes de eu mexer.
- **#16 já estava anotado** como pendência há tempos.

## Por que a minha bateria de verificação não pegou nada disso

Ela testa **função pura** (formatadores, validadores, os detectores de Sugestão). Todos esses 17 são **lógica de controller / fluxo de permissão / integridade entre tabelas** — exatamente o "nível de integração" que eu disse que ficou de fora por precisar de banco de teste. A bateria continua útil pro que ela cobre; ela nunca prometeu isso aqui.

## Próximo passo

Nada foi consertado. Me diga quais itens você quer atacar e em que ordem — eu explico o plano de cada um (front + back + banco + se precisa de SQL) antes de codar qualquer coisa.
