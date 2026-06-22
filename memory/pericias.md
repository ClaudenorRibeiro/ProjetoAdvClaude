---
name: pericias
description: "Módulo de perícias — fluxo de audiência (status/cancelar/remarcar/histórico) + comunicado ao cliente. Reescrito 13/06/2026."
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 17 — Perícias (REESCRITO 13/06/2026 — feature A+B+C, ver [[pendencias-proxima-sessao]] p/ status de deploy)

A perícia virou "irmã" da audiência, porém mais enxuta: tem status, cancelar, remarcar e histórico,
mas NÃO tem "Registrar Ata". Implementada no local em 13/06 (validada node --check + build Vite),
ainda NÃO testada pelo usuário nem deployada.

## Campos da perícia (modal Nova/Editar — frontend `pages/Pericias/Pericias.js`)
- **Número do Processo** (CNJ, padrão do Novo Prazo desde 15/06): input com máscara CNJ + autocomplete;
  ao escolher o item, preenche o número COMPLETO (`num_proc` do registro de `listarPastas`), resolve o
  `processo_id` e carrega os peritos. Campo **Título** somente leitura abaixo. Na aba da pasta o campo é
  somente leitura (processo fixo). SUBSTITUIU o antigo fluxo "busca Pasta → select Processo".
- **Tipo de perícia** (tabela `tipo_pericia`, cadastrável). Botão **"..."** de gerenciar tipos: FEITO 15/06
  (ver bloco "Sessão 15/06" abaixo) — aparece para quem tem permissão `pericias/tipos`.
- **Data** (obrigatória) e **Hora** (opcional)
- **Nome/Referência do local** (campo `local`, opcional — ex.: "IML Central", "Consultório Dr. X")
- **Endereço estruturado**: cep, logradouro, numero, complemento, bairro, cidade, estado (CEP → ViaCEP preenche)
- **Responsável pela condução**: usuário do sistema OU freelancer (igual audiência; select de `audienciasAPI.advogados`,
  valor gravado como 'usuario:X' ou 'freela:X' → backend `parsarResponsavel` → responsavel_id / responsavel_freela_id)
- **Assistente técnico**: usuário do sistema
- **Perito**: PESSOA (PF ou PJ) — o seletor mostra os **peritos do processo** (de `processo_perito`, via
  `GET /pericias/peritos-processo?processo_id`), com uma busca avulsa de apoio caso não esteja na lista.
  Perito = pessoa no papel de perito (cadastro unificado, SEM flag "é perito"). Ver [[cadastro-pessoas]] e [[processos-pastas]].

## Sempre presencial
Perícia não tem modalidade/online (diferente da audiência).

## Status e fluxo (espelha audiência, SEM ata)
- Status: **agendada / realizada / cancelada / remarcada** (coluna real `pericia.status`).
- **Marcar realizada**: manual (botão), sem preencher nada.
- **Cancelar**: pede motivo; grava em `auditoria_pericia`; avisa o cliente por e-mail.
- **Remarcar**: pede nova data/hora + motivo; marca a original como 'remarcada' e CRIA uma nova perícia
  (copiando endereço/perito/responsável); reenvia comunicado ao cliente com a nova data.
- **Histórico**: tabela `auditoria_pericia` (campo a campo), modal na lista.
- **Excluir**: permitido só se NÃO for cancelada/remarcada (essas são histórico).
- **Confirmação por senha (regra 15/06):** cadastrar (Nova/Editar) E remarcar uma perícia SÓ é permitido com
  senha do usuário (`authAPI.verificarSenha`) quando a data/hora cair em QUALQUER destes casos: data retroativa
  (anterior a hoje), fim de semana, feriado (calendário do sistema) OU fora do expediente 08:00–18:00 (hora opcional;
  se vazia não checa horário). O modal `ModalConfirmarSenhaDiaUtil` (reusado, título generalizado p/ "Confirmação por
  senha") lista todos os motivos juntos e o motivo vai pra auditoria. Perícia é MAIS rigorosa que a audiência (lá,
  retroativa/hora incomum usam só confirmação simples; senha só p/ dia não útil). ⚠️ Trava é de FRONTEND (igual
  audiência) — usuário decidiu 15/06 NÃO blindar no backend. Cancelar/Excluir usam ModalConfirmar (não senha).
- Permissões verificadas no backend (`temPermissaoBackend`) em cancelar/remarcar (alterar) e excluir (excluir).

## Comunicado ao cliente (Fase C — `services/comunicadoService.js`, NOVO)
- Vai para o **CLIENTE do escritório** = a parte (autor OU réu) marcada em `tblproc.cliente_polo`
  (definido no cadastro do processo). Pega o e-mail principal de `emails_pf`/`emails_pj`. **NADA é enviado ao perito.**
- Dispara automático: ao **cadastrar** (agendada), ao **remarcar** (nova data), ao **cancelar** (aviso) — best-effort.
- **Reenvio manual**: botão "✉ Comunicar/Reenviar" na lista (`POST /pericias/:id/comunicado`).
- Conteúdo: texto HTML simples por enquanto, mas em FUNÇÃO MODULAR (`montarComunicadoPericia`) pronta para
  virar **modelo de documento + PDF** no futuro (mesma ideia valerá para audiências). Registra em `log_comunicacoes`.
- Depende de: `cliente_polo` preenchido no processo E o cliente ter e-mail principal cadastrado.

## NÃO tem (decisões do usuário)
- ❌ Ata / registro de "depois" / resultado / laudo
- ❌ E-mail ao perito
- ❌ Testemunhas (isso é só de audiência)

## Listagem (tela de Perícias)
- Coluna **Pasta** = formato padrão `0010 — Título` (desde 15/06). `listar` retorna `pa.numPasta AS pasta_numero`
  além de `pasta_titulo`; o front faz `padStart(4,'0') — título`. A aba Perícias da pasta não tem essa coluna.
- **Fix "Invalid Date" no Histórico (15/06):** o `ModalHistorico` usava `formatarData(alterado_em)`, mas `alterado_em`
  é DATETIME completo (formatarData só serve p/ 'YYYY-MM-DD'). Trocado por
  `new Date(r.alterado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})` (mesmo padrão da audiência). Só frontend.

## Tabelas do Banco
- `pericia` — agora com endereço, responsavel_id/responsavel_freela_id, status, motivo_status, alterado_por/em
- `tipo_pericia` — tipos cadastráveis
- `auditoria_pericia` — NOVA (histórico campo a campo)
- `processo_perito` — NOVA (peritos vinculados ao processo, muitos-p/-muitos)
- `log_comunicacoes` — registro dos comunicados enviados
- `tblproc.cliente_polo` — NOVA coluna (autor/réu = cliente do escritório)

## Backend (arquivos)
- `controllers/periciasController.js` (reescrito): listar/buscar/criar/atualizar/peritosDoProcesso/marcarRealizada/
  cancelar/remarcar/excluir/buscarHistorico/enviarComunicado.
- `services/comunicadoService.js` (novo). Rotas em `routes/index.js` (peritos-processo ANTES de /:id).
- `controllers/processosController.js`: criar/atualizar/buscarPasta tratam cliente_polo + peritos.

## Sessão 15/06/2026 — aba na pasta + "..." tipos + nº processo + autocomplete (LOCAL, validado build Vite; SEM SQL novo)
- **Aba "Perícias" na pasta do processo** (`pages/Processos/PastaDetalhe.js`): entre Audiências e Financeiro,
  mesmo seletor de processo das outras abas (filtra por `processo_id`; "Todos os processos" = pasta inteira).
  Ações: + Nova Perícia, Editar, ✓Realizada, Cancelar, Remarcar, Histórico, Excluir, ✉Comunicar — reutiliza os
  modais de `Pericias.js` (agora EXPORTADOS: ModalPericia, ModalCancelar→ModalCancelarPericia,
  ModalRemarcar→ModalRemarcarPericia, ModalHistorico→ModalHistoricoPericia). Permissões `temPermissao('pericias',…)`.
  `ModalPericia` ganhou prop OPCIONAL `processoInicial` (pré-seleciona o processo na aba; default = tela normal igual).
- **BUG corrigido (Editar perícia zerava endereço/responsável):** a linha do `listar` não traz endereço nem
  `responsavel_valor`; o `atualizar` regrava `campo || null` → apagava. Agora o Editar busca a perícia COMPLETA
  (`periciasAPI.buscar`) antes de abrir o modal — corrigido NA ABA e na tela original (`Pericias.js`, função `abrirEdicao`).
- **"..." gerenciar tipos de perícia:** backend `periciasController` ganhou `criarTipo/atualizarTipo/excluirTipo`
  (espelha audiência; exclusão = soft-delete `ativo=0`, bloqueia se em uso). Rotas POST/PUT/DELETE `/pericias/tipos`
  com permissão submódulo `pericias/tipos`. `periciasAPI.criarTipo/atualizarTipo/excluirTipo`. `Pericias.js`:
  botão "..." no select de tipo (`podeTipos`) + componente `ModalGerenciarTipos` (igual audiência) + `onTiposChange`
  para refresh. `Configuracoes.js`: submódulo `pericias.tipos` ("Tipos de perícia") na matriz de permissões.
  SEM SQL: `tipo_pericia` (ativo DEFAULT 1) e tabela `permissoes` (genérica) já existiam. Admin/super já usa; não-admin
  precisa receber a permissão na tela.
- **Campo "Número do Processo"** (ver seção de campos acima) substituiu Pasta→Processo.
- **autoComplete="off"** nos campos de endereço (Perícias, Audiências 2 blocos, Pessoas via componentes `Campo`/`CampoCEP`)
  para o navegador não oferecer "salvar endereço". Em Pessoas o `Campo` é genérico → desliga autofill em todos os
  campos de texto (efeito colateral aceito/desejável). Não é 100% à prova de toda versão do Chrome.

**Relacionado:** [[audiencias]], [[processos-pastas]], [[cadastro-pessoas]], [[comunicacoes]], [[pendencias-proxima-sessao]]
