---
name: financeiro
description: "Módulo financeiro RECONSTRUÍDO DO ZERO 15/06/2026 — por PROCESSO: conta corrente (entradas/saídas) + acordo parcelado (parcelas com honorário/parceria por linha) + baixa. Etapas 5 (histórico) e 6 (relatório/recibo) PENDENTES."
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## ⚠️ FINANCEIRO FOI REESCRITO DO ZERO em 15/06/2026 (modelo POR PROCESSO)

O usuário disse que o financeiro antigo era só protótipo SEM valor → autorizou refazer do zero e DROPAR as
tabelas antigas. Tudo no LOCAL, validado (node --check + build Vite). NÃO testado pelo usuário ainda.
Ver [[pendencias-proxima-sessao]] (bloco topo "FINANCEIRO") para o SQL e o handoff de continuação.

## Decisões fechadas com o usuário (15/06)
- **Tudo é POR PROCESSO** (não por pasta). A conta corrente é do processo ("cliente pede pra descontar do processo tal").
- **Conta corrente sempre exige um processo** (NÃO existe "geral da pasta").
- **Acordo é de UM processo** (a pasta pode ter vários; o acordo é de um, os outros ficam sem).
- **Parceria incide sobre o HONORÁRIO** (não sobre o bruto; não reduz o líquido do cliente). Por parcela, opcional.
- **Dia útil:** vencimento que cai em fim de semana/feriado → joga p/ o PRÓXIMO dia útil (tabela `calendario`).
- **Honorário padrão** ao gerar parcelas = 30% (usuário ajusta no modal).
- **Baixa (REVISADA 17/06 — conta corrente = P&L do escritório, lucro/prejuízo):** receber uma parcela lança na conta
  corrente: **ENTRADA = honorário** (SEMPRE, mesmo R$ 0,00 — registra que não cobrou; a obs da parcela vai na descrição)
  + **SAÍDA = repasse da parceria** (só se houver, com o nome do parceiro). Saldo = honorários − despesas − parcerias = lucro.
  O BRUTO e o LÍQUIDO do cliente NÃO entram na conta corrente (ficam na parcela p/ relatórios). ⚠️ Isto SUBSTITUI a decisão
  antiga de 15/06 ("baixa = bruto"). Exigiu `conta_corrente.parcela_id` (liga os 2 lançamentos à parcela; desfazer apaga por parcela_id).
- **Honorário fixo NÃO pode passar do bruto da parcela** (trava A): aviso inline + bloqueio no salvar (líquido nunca negativo).
- **Cancelar acordo (17/06):** acordo → 'cancelado'; parcelas PENDENTES → 'cancelada' (pagas permanecem); pede motivo;
  DEFINITIVO (vira registro permanente). Status são VARCHAR → sem SQL.

## Tabelas NOVAS (3) — antigas DROPADAS
DROPADAS (eram protótipo vazio): `conta_corrente_pasta`, `honorarios`, `parcerias`.
- **`conta_corrente`** — entradas/saídas por processo. Campos: id, processo_id(FK tblProc, NOT NULL), data,
  descricao, tipo('entrada'/'saida'), valor, origem('manual'/'acordo'), usuario_id, criado_em.
- **`acordo`** — por processo. Campos: id, processo_id(FK), descricao, valor_total, qtd_parcelas, data_primeira,
  status('ativo'/'quitado'/'cancelado'), criado_por, criado_em, alterado_por, alterado_em.
- **`acordo_parcela`** — N por acordo. Campos: id, acordo_id(FK CASCADE), numero, vencimento, valor_bruto,
  honor_tipo('percent'/'fixo'/'sem'), honor_percentual, honor_valor, valor_liquido, observacao,
  parceria_pessoa_tipo, parceria_pessoa_id(sem FK, PF ou PJ igual perito), parceria_tipo('percent'/'fixo'),
  parceria_percentual, parceria_valor, status('pendente'/'pago'), data_pagamento, lancamento_id(FK conta_corrente SET NULL).

## Backend (PRONTO, validado)
- `services/calendarioService.js` — NOVO `proximoDiaUtil(data)` (próximo dia útil >= data via `calendario`).
- `controllers/financeiroController.js` — REESCRITO. Helpers `round2`, `somarMeses`, `calcularValoresParcela`
  (recalcula honor/líquido/parceria no BACKEND — não confia na conta do front). Funções:
  - Conta corrente: buscarContaCorrente (saldo acumulado), lancar, editarLancamento, excluirLancamento
    (editar/excluir bloqueados p/ origem='acordo' → desfazer a baixa antes).
  - Acordo: listarAcordos (com resumo pagas/recebido), gerarPreviaParcelas (POST /acordo/previa — gera tabela
    em dia útil SEM salvar), criarAcordo, buscarAcordo (com parcelas + parceria_nome), atualizarAcordo
    (bloqueia se há parcela paga), excluirAcordo (bloqueia se há parcela paga; CASCADE nas parcelas).
  - Baixa: pagarParcela (cria entrada BRUTO + vincula lancamento_id), desfazerPagamento (apaga a entrada, volta pendente).
  - TUDO em transação (BEGIN/COMMIT/ROLLBACK) + auditoria.registrar(...conn).
- `routes/index.js` — rotas novas /financeiro/processo/:id (GET conta), .../lancamento (POST), /lancamento/:id (PUT/DELETE),
  .../acordos (GET), /acordo/previa (POST), .../acordo (POST), /acordo/:id (GET/PUT/DELETE),
  /parcela/:id/pagar (PUT), /parcela/:id/desfazer (PUT). Permissões financeiro visualizar/cadastrar/alterar/excluir.
- **Integrações ajustadas p/ não quebrar:** `audienciasController` (acordo em audiência → agora INSERT em `conta_corrente`
  por processo, tipo 'entrada') e `processosController` (loop de migração ao renumerar pasta: removidas as tabelas
  dropadas; conta_corrente/acordo seguem o processo).

## Frontend (PRONTO, validado)
- `services/api.js` — `financeiroAPI` novo (buscarConta, lancar, editarLanc, excluirLanc, listarAcordos,
  previaParcelas, criarAcordo, buscarAcordo, atualizarAcordo, excluirAcordo, pagarParcela, desfazerParcela).
- `pages/Financeiro/Financeiro.js` — REESCRITO por processo. Busca pasta → select processo → extrato (entrada/saída
  + saldo) + acordos. Componentes EXPORTADOS p/ reuso: `ModalLancamento`, `ModalAcordo`, `AcordoBloco`. Internos:
  `ModalParceriaParcela` (parceiro PF/PJ + % do honorário ou fixo), helper `recalcParcela`. ModalAcordo = o
  modal-tabela (gera prévia → edita linha a linha → salva).
- `pages/Processos/PastaDetalhe.js` — aba Financeiro REESCRITA por processo REUSANDO os componentes acima
  (ModalLancamentoFin/ModalAcordoFin/AcordoBloco). Removido o ModalLancamento local antigo e o import `Link`.
  Usa o `selectProcesso` que já existia; exige processo específico (não funciona em "Todos os processos").

## FALTA fazer (etapas 5 e 6) — próxima sessão
- **Etapa 5 — Histórico:** tela de auditoria do financeiro (a permissão `financeiro/historico` existe na matriz;
  a auditoria JÁ é gravada nas operações; falta só a UI pra exibir).
- **Etapa 6 — Relatório + Recibo:**
  - Relatório: bruto / honorário / líquido por cliente / pasta / processo num período. Sai de `acordo_parcela`
    WHERE status='pago' AND data_pagamento BETWEEN ... (join processo→pasta→cliente). O "Relatório Geral" antigo FOI REMOVIDO.
  - Recibo PDF: `pdfService.gerarReciboFinanceiro` ainda existe (dead code do modelo antigo) — adaptar ao novo schema.

## Regras de bloqueio implementadas (não esquecer)
- Lançamento origem='acordo' não pode ser editado/excluído direto (desfazer a baixa da parcela antes).
- Acordo com parcela paga não pode ser editado nem excluído (desfazer os recebimentos antes).

## Sessão 17/06/2026 — refinos + features (resumo; detalhes/SQL no topo de [[pendencias-proxima-sessao]])
- **Máscara de moeda** em todos os campos de valor (helpers `mascaraMoeda/numeroParaMascaraMoeda/parseMoeda` em `formatters.js`;
  estilo centavos-da-direita). `ModalAcordo` guarda moeda como STRING e calcula honor/líquido/parceria na renderização
  (helpers honorDaParcela/liquidoDaParcela/parceriaDaParcela; saiu o recalcParcela).
- **Baixa revisada** (honorário entra + parceria sai) — ver "Decisões" acima. Helper `resolverNomePessoa`.
- **Modal data do recebimento** ao Receber (default hoje, editável). **Parceria do acordo inteiro** (botão no cabeçalho).
- **Linha de Total** nas parcelas. **Trava honor fixo > bruto**. **Confirmação** se soma ≠ total informado. **Aviso data retroativa** no Gerar.
- **2 tabelas de auditoria NOVAS:**
  - `auditoria_parcela` — histórico por parcela: criada/editada(campo a campo)/recebida/recebimento-desfeito/cancelada.
    `atualizarAcordo` REESCRITO p/ UPDATE no lugar (mantém IDs; diff update/insert/delete). Colunas Obs+Histórico no AcordoBloco.
  - `auditoria_conta_corrente` — histórico por lançamento manual: criado/editado(campo a campo). Botão Histórico no extrato.
    Exclusão fica só no log geral; lançamentos de acordo têm histórico na parcela.
- **Coluna "Saldo" (linha a linha) REMOVIDA** do extrato (redundante com saldo total no topo).
- **Cancelar acordo** — ver "Decisões". Endpoint `PUT /financeiro/acordo/:id/cancelar`.
- **Fix `proximoDiaUtil`** (`calendarioService`): calendário só cobre 2026-05-01→2056-04-30; datas fora da faixa retornam como vieram
  (não "colam" no 1º dia). ⚠️ Correção feita SEM autorização — usuário reforçou a regra (ver [[feedback-codigo]]); mantida salvo pedir reverter.

## Sessão 17/06/2026 (NOITE) — identificar acordo na conta corrente + fix timezone
- **Número do acordo por processo** (quando o processo tem mais de um acordo): identificado por um número
  sequencial pela ordem de criação ("Acordo 1/2/3..."), **DERIVADO de `acordo.id`** (NÃO há coluna nova; sem
  redundância). Cálculo: `COUNT(*)` de acordos do mesmo processo com `id <=` o do acordo. Usado em 3 lugares:
  - `pagarParcela` grava a descrição da baixa já com o número: ENTRADA = **`Honor - parc N do acordo M`**
    (+ `(obs)` se houver); SAÍDA de repasse = **`Repasse parceria <nome> — parc N do acordo M`**. O número é
    calculado por query dentro da transação. ⚠️ O TEXTO fica GRAVADO em `conta_corrente.descricao` (snapshot da
    baixa) — lançamentos antigos mantêm o texto velho; só novos nascem no formato novo (dados são de teste).
  - `listarAcordos` retorna `numero_acordo` (subquery COUNT por id) → cabeçalho do acordo mostra `- Acordo M`.
  - Frontend `AcordoBloco` exibe `... · recebido R$ X - Acordo M`.
- **Fix timezone:** novo helper `hojeLocal()` em `frontend/src/utils/formatters.js` (data de hoje no fuso do
  navegador, 'YYYY-MM-DD', sem UTC) — corrige a data pré-preenchida que vinha "amanhã" após as 21h. Trocados os
  3 usos de `new Date().toISOString().split('T')[0]` em `Financeiro.js` (modal Receber, ModalLancamento, aviso
  data retroativa). Sugerido (NÃO autorizado ainda): varrer o frontend inteiro e trocar todos os toISOString por hojeLocal.
- SEM SQL nesta sessão. Detalhes completos no topo de [[pendencias-proxima-sessao]] (bloco "17/06 NOITE").

## Sessão 20/06/2026 — pagamento de 2 TEMPOS + Alvará + Consulta (TUDO testado; SQL no topo de [[pendencias-proxima-sessao]])
**Modelo de 2 TEMPOS (decisão do usuário):** o pagamento tem dois momentos distintos.
- **TEMPO 1 — RECEBIMENTO** (réu→escritório): é o "Receber" da parcela. `pagarParcela` grava `recebido_em`
  (renomeada de data_pagamento) + `recebimento_forma_id` (forma OBRIGATÓRIA) + `recebimento_identificacao`. Badge
  da parcela = "Recebida {data}" (tooltip forma/identificação).
- **TEMPO 2 — REPASSE** (escritório→cliente E/OU parceiro): acontece DEPOIS, em datas/formas INDEPENDENTES.
  É no repasse que se GERA O RECIBO. Colunas em acordo_parcela: repasse_cliente_em/forma_id/por e repasse_parceiro_em/forma_id/por.
- **A conta corrente NÃO foi tocada** (segue P&L: honorário entra + parceria sai, no recebimento). Repasses e recibo
  são ADITIVOS, sem quebrar o que existia. **Não dá p/ desfazer o recebimento enquanto houver repasse** — desfazer
  o(s) repasse(s) primeiro (bloqueio no backend + botão desabilitado; desfazer de repasse vive em Repasses→Concluídos).

**Tabela NOVA `forma_pagamento`** (id, nome, ativo) — cadastro em Controle→"Formas de pagamento" (só admin), soft-delete
(ativo=0), NÃO bloqueia em uso (resolve o nome no histórico). NOVO `controllers/formaPagamentoController.js`; rotas
`/financeiro/formas-pagamento`; NOVA tela `pages/Controle/FormasPagamento.js`.

**Repasses (backend `financeiroController.js`):** `registrarRepasse` (cliente OU parceiro, independentes; grava data+forma+quem fez),
`desfazerRepasse`. Mapa `COLS_REPASSE` = whitelist de nomes de coluna (nunca vêm do request → sem injeção). Tudo em transação+auditoria.
`listarRepassesPendentes` (recebido e falta repassar) e `listarRepassesConcluidos` (com forma+quem fez) = worklists GLOBAIS.
Aba "Repasses" no Financeiro (sub-abas Pendentes/Concluídos; cada parcela = 1 ou 2 linhas cliente/parceiro).
⚠️ BUG corrigido: `logs_auditoria.acao` é VARCHAR(20) → "desfazer-repasse-parceiro" (25) estourava (500); encurtado p/ "desfazer-repasse".

**ALVARÁ generalizado** = MESMA estrutura do acordo via coluna `acordo.tipo` ('acordo'|'alvara'). UM motor só, sem duplicar
tabelas/lógica. Numeração POR TIPO ("Acordo N" e "Alvará N" contados separados) em listarAcordos, descrições da CC e worklists.
"parc N" virou "parc N/T" (número/total) na CC e nas worklists (ex.: "Honor - parc 1/5 do acordo 2"). Frontend: botão
"+ Novo Alvará" (Financeiro.js e PastaDetalhe.js); ModalAcordo com prop `tipo`; AcordoBloco mostra Acordo N/Alvará N.

**RECIBO** = MODELO de documento normal (destino "Recibo: Cliente"/"Recibo: Parceria" em Documentos). NOVO `utils/extenso.js`
(valor por extenso pt-BR). `variaveisResolver.resolverPagamento(parcelaId,{tipoRecibo})`: valor_pago = líquido (recibo cliente)
OU parceria (recibo parceiro), derivado do DESTINO do modelo. `config/variaveisDocumento.js` ganhou tags (valor_parceria,
forma_repasse, forma_recebimento, identificacao_recebimento, forma_pagamento, identificacao_pagamento). `GerarDocumento.js`
ganhou prop `beneficiario`; botão "Recibo" em cada Repasse→Concluído. (documentosController trata âncora 'pagamento'.)

**Aba "Consulta" (= o RELATÓRIO financeiro, etapa 6 do plano antigo — agora FEITA):** `consultarFinanceiro`
(GET /financeiro/consulta; WHERE dinâmico parametrizado, só entra filtro preenchido; paginado 50/pág; retorna
registros+total+totais = SUM de bruto/honor/líquido/parceria sobre TODO o conjunto filtrado). `exportarConsultaFinanceiro`
(mesma query sem paginação → Excel .xlsx via exceljs lazy, com linha de totais). SELECT/FROM/WHERE unificados
(CONSULTA_SELECT/CONSULTA_FROM/montarFiltroConsulta — sem repetição). Filtros: período de vencimento, faixa de valor por
campo, autor/réu (via EXISTS), parceiro, nº processo, pasta, status. Base = `acordo_parcela` (lançamentos manuais da CC NÃO entram).
Índice recomendado: `idx_parcela_vencimento`. Frontend: componente `ConsultaFinanceiro` (atalhos Hoje/Semana/Mês, barra de Totais).
✅ Com a aba Consulta, a **etapa 6 (relatório)** deixou de ser pendência. Recibo PDF antigo (`pdfService.gerarReciboFinanceiro`) foi superado pelos recibos via Documentos.

**Relacionado:** [[processos-pastas]], [[audiencias]], [[documentos-modelos]], [[pendencias-proxima-sessao]], [[database-tables]], [[feedback-codigo]]
