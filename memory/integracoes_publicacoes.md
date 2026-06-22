---
name: integracoes-publicacoes
description: "Módulo de Publicações REFEITO DO ZERO em 21/06/2026 — integração real com a AASP (API de Intimações), importação por dia, dedup fiel pelo hash do texto, direcionamento manual a usuários, histórico via colunas. CNJ futuro."
metadata:
  node_type: project
  type: project
  originSessionId: current
---

## ⚠️ MÓDULO DE PUBLICAÇÕES REESCRITO DO ZERO (21/06/2026)
O módulo antigo era TESTE e a integração com a AASP estava toda errada (URL, auth, formato de
data e da resposta "chutados" — nunca funcionou). Usuário autorizou refazer banco + código.
Tudo LOCAL, validado (node --check + build Vite). Detalhes/SQL também no RESUMO_SESSAO_21-06-2026.txt
e no topo de [[pendencias-proxima-sessao]].

## API REAL DA AASP (confirmada pelo Python do usuário + Swagger oficial)
- URL: `https://intimacaoapi.aasp.org.br/api/Associado/intimacao/json`
- Autenticação: **parâmetro `chave`** (fornecida pela AASP) — NÃO é Bearer token.
- Parâmetros: `chave`, `data` (formato **dd/mm/aaaa**), `diferencial` (boolean).
  - `diferencial` (Swagger): "Busca somente as publicações do dia que não foram consultadas".
    Usamos **`false`** (traz SEMPRE o dia inteiro) porque deduplicamos do nosso lado; `true`
    "esconderia" o que já foi consultado e perderíamos publicações numa 2ª busca.
- Resposta: `{ intimacoes: [ ... ] }`. Campos por intimação:
  `textoPublicacao` (texto completo), `numeroUnicoProcesso` (CNJ), `titulo` (diário),
  `cabecalho` (ex.: "Intimação"), `numeroPublicacao`, `numeroArquivo`,
  `jornal: { dataDisponibilizacao_Publicacao, nomeJornal, ... }`.
- A OAB/advogado destinatário vem DENTRO do texto (não em campo separado) → por isso o
  direcionamento é **MANUAL** (não dá p/ rotear automático por OAB).

## REGRAS DE NEGÓCIO (decididas pelo usuário 21/06)
- **Busca SEMPRE MANUAL:** o usuário escolhe um DIA e o sistema baixa todas as publicações dele.
- **Dedup FIEL pelo CONTEÚDO:** compara o `textoPublicacao` inteiro; se UMA letra diferir, é outra.
  Implementado com **hash SHA-256 do texto exato** (coluna `texto_hash`) — Opção B, rápida e escalável.
  Ao rebaixar um dia já salvo, só entram as novas/diferentes (atenção: a collation do MySQL é
  case/acento-insensível, por isso NÃO comparamos com `=` no texto; o hash garante a comparação fiel).
- **Direcionamento manual** por usuário com permissão: ESCRITÓRIO (todos com permissão veem) OU
  VÁRIOS usuários específicos (só eles + admin veem). Tabela de ligação `publicacao_usuario`.
- **Visibilidade:** admin (nivel<=1) vê tudo; demais veem escritorio=1 OU as direcionadas a eles.
- **"Lida" = quem BAIXOU** (gravado em `importada_por`). NÃO se rastreia cada abertura (sem inchar o banco).
- **Histórico sem tabela extra:** vem das colunas (importada/direcionada/tratada por quem e quando).
- **Sem AASP configurada:** a tela NÃO dá erro, só mostra aviso "não configurado".
- **Abas no topo por FONTE** (hoje só "AASP"; outras fontes entram depois).
- **"Daí nascem prazo/audiência/perícia":** o usuário lê e interpreta; criar prazo/etc a partir da
  publicação ficou para DEPOIS (fora do escopo desta entrega; os modais antigos de +Prazo/+Tarefa foram removidos).

## CONFIGURAÇÃO (Configurações → Integrações → Publicações AASP)
- Agora pede só a **CHAVE** (antes pedia login/senha/OABs — estava errado). As OABs já estão
  vinculadas à chave na própria AASP. A chave é SEGREDO: fica em `configuracoes_integracoes`
  (modulo='aasp', JSON `{chave}`), NUNCA no git.
- ⚠️ CORRIGIDO o controller de Integrações (`configuracaoController.buscarIntegracoes`/`salvarIntegracao`):
  antes NÃO carregava/salvava a config de verdade (retornava array e gravava configuracoes=NULL).
  Agora retorna objeto por módulo `{ativo, ...config}` e salva `{ativo} + resto=configuracoes`.
  Isso conserta também WhatsApp/E-mail.

## BACKEND
- NOVO `services/aaspService.js` — `buscarIntimacoes(chave, dataISO)` (converte p/ dd/mm/aaaa, diferencial=false).
- `controllers/publicacoesController.js` REESCRITO: `statusAasp` (configurado?), `listar` (filtros
  data/tratada/busca-por-conteúdo + visibilidade + direcionada_nomes via subquery, paginado),
  `importar` (lê chave; se não configurado responde ok com configurado=false; dedup por hash em
  transação; importada_por=leitor), `direcionar` (escritório OU usuario_ids[], transação),
  `tratar` ({tratada:bool}), `historico` (lê colunas + usuários direcionados), `excluir` (+log_publicacoes),
  `usuariosParaDirecionar` (usuários ativos, nivel>0).
- `routes/index.js`: /publicacoes/aasp/status, /publicacoes/usuarios, GET /publicacoes,
  /publicacoes/:id/historico, POST /publicacoes/importar (cadastrar), PUT /:id/direcionar (alterar),
  PUT /:id/tratar (alterar), DELETE /:id (excluir).

## FRONTEND
- `pages/Publicacoes/Publicacoes.js` REESCRITO: aba "AASP"; seletor de DIA + "Buscar publicações do
  dia"; **pesquisa por conteúdo**; filtro de status; tabela (Data, Processo, Conteúdo, Direcionada a,
  Status) com ações **Direcionar / Tratar(Reabrir) / Histórico / Excluir**; aviso "não configurado";
  modal de leitura com **navegação Anterior/Próxima** (só no resultado da tela) + **realce do termo
  pesquisado** (fundo amarelo, função `realcarTexto`); **cabeçalho da tabela fixo ao rolar**.
- `pages/Configuracoes/Configuracoes.js`: form AASP agora é só a **chave**.
- `services/api.js`: `publicacoesAPI` reescrita (statusAasp, usuarios, listar, importar, direcionar, tratar, historico, excluir).
- `components/layout/Layout.css`: NOVA classe reutilizável **`.tabela-sticky`** (cabeçalho fixo; aplicar no `<table>` + dar maxHeight/overflow-y ao wrapper).

## TABELAS DO BANCO (refeitas — ver SQL em [[pendencias-proxima-sessao]] e no .txt de 21/06)
- `publicacoes` — fonte, data_publicacao, numero_processo, titulo, cabecalho, numero_publicacao,
  numero_arquivo, texto, **texto_hash (CHAR 64, dedup)**, escritorio, importada_por, criado_em,
  direcionada_por/em, tratada/_por/_em.
- `publicacao_usuario` — ligação publicação↔usuários (direcionamento múltiplo).
- `log_publicacoes` — registro de exclusões (mantida).

## CNJ — versão futura (mantém)
- Consulta de andamentos por número de processo; complementar ao DJE; alternativa à AASP nas configs.

**Relacionado:** [[prazos]], [[tarefas]], [[user-permissions]], [[configuracoes-escritorio]], [[database-tables]], [[pendencias-proxima-sessao]]
