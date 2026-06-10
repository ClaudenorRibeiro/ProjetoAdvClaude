---
name: audiencias
description: "Módulo de audiências — tipos, comunicados, atas e integração com financeiro"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Tipos de Audiência

- Tabela cadastrável: Una, Instrução, Inicial, Conciliação, etc.
- Presencial ou virtual (Google Meet, Teams, Zoom, etc.)
- Se virtual: campo para plataforma e link

## Informações da Audiência

Tipo, data, hora, modalidade, local (padrão: endereço da vara, alterável), plataforma/link se virtual

## Comunicado Automático ao Cliente

- Ao cadastrar audiência → gera PDF do comunicado
- Cada tipo tem seu modelo específico
- Enviado via **e-mail e WhatsApp**

## Ata de Audiência — Pode Gerar

- Resultado da audiência
- Nova audiência (remarcação)
- Novos prazos
- Prazos de perícia e comunicados ao perito
- Tarefas diversas
- **Acordo com parcelas → vincula automaticamente ao financeiro da pasta**

## Alertas e Controle

- **3 dias úteis antes** → WhatsApp automático ao cliente
- Painel com filtro: hoje, ontem, amanhã, período
- Toda audiência exige ata — sistema avisa audiências sem ata
- Ao registrar ata → sai da lista de pendentes

## Editar Audiência (implementado 08/06/2026)

- Botão **✏️ Editar** na listagem — respeita permissão `audiencias.alterar`
- **Sem ata:** qualquer usuário com permissão pode editar
- **Com ata:** somente admin/super pode editar (aviso amarelo exibido no modal)
- **Cancelada/Remarcada:** botão não aparece para ninguém
- **Processo é somente leitura** na edição — para trocar processo: excluir + criar nova
- Mesmas validações de blur da criação (data retroativa / hora incomum)
- Todas as alterações registradas em `auditoria_audiencia` campo a campo + `obs_auditoria`
- `ModalEditarAudiencia` tem `export` — pode ser importado por outros módulos (ex: PastaDetalhe)

## Excluir Audiência (implementado 08/06/2026)

- Botão **🗑️ Excluir** na listagem — respeita permissão `audiencias.excluir`
- **Sem ata:** qualquer usuário com permissão pode excluir
- **Com ata:** somente admin/super pode excluir (mensagem diferenciada no ModalConfirmar)
- **Cancelada/Remarcada:** nunca podem ser excluídas (registro histórico permanente)
- Backend: `DELETE /api/audiencias/:id` — remove em transação: testemunhas → ata → auditoria → audiência

## Validações no Cadastro e Edição (implementado 08/06/2026)

- **Data retroativa:** aviso laranja ⚠️ inline abaixo do campo ao perder o foco (onBlur)
- **Hora incomum** (fora 08h–18h): aviso laranja ⚠️ inline abaixo do campo ao perder o foco
- **`window.confirm` substituído** por `ModalConfirmar` tipo `aviso` com botões:
  - "Confirmar mesmo assim" → salva e registra no histórico (`obs_auditoria`)
  - "Cancelar" → volta ao formulário para corrigir
- Avisos somem automaticamente quando o usuário corrige o campo

## STATUS — Refatoração Completa (09/06/2026)

### Banco de dados
- **Removidas** colunas `cancelada` (tinyint) e `motivo_cancelamento` (text)
- **Adicionadas** colunas:
  - `status VARCHAR(20)` — valor padrão `'agendada'`
  - `motivo_status TEXT` — motivo do cancelamento ou remarcação
- Migration rodada via HeidiSQL em 09/06/2026 ✅

### Os 6 status possíveis
| Status | Cor | Descrição |
|--------|-----|-----------|
| `agendada` | badge-azul | Estado inicial após cadastro |
| `realizada` | badge-verde | Ata registrada com resultado "realizada" |
| `acordo` | badge-verde | Ata registrada com resultado "acordo" |
| `adiada` | badge-laranja | Ata registrada com resultado "adiada" |
| `cancelada` | badge-vermelho | Cancelada manualmente — NÃO pode ser excluída |
| `remarcada` | badge-cinza | Remarcada — registro histórico preservado, NÃO pode ser excluída |

### Constantes no frontend (Audiencias.js e PastaDetalhe.js)
```javascript
const STATUS_COR   = { agendada:'badge-azul', realizada:'badge-verde', adiada:'badge-laranja', cancelada:'badge-vermelho', remarcada:'badge-cinza', acordo:'badge-verde' };
const STATUS_LABEL = { agendada:'Agendada', realizada:'Realizada', adiada:'Adiada', cancelada:'Cancelada', remarcada:'Remarcada', acordo:'Acordo' };
```

## Cancelar Audiência (09/06/2026)

- Botão **Cancelar** (amber) aparece apenas para status `agendada` ou `adiada`
- Exige motivo obrigatório (modal `ModalCancelarAudiencia`)
- Backend: `PUT /api/audiencias/:id/cancelar` — atualiza `status='cancelada'` + `motivo_status` + registra auditoria
- Audiência cancelada: NÃO pode ser editada, NÃO pode ser excluída, não aparece botão Cancelar/Remarcar

## Remarcar Audiência (09/06/2026)

- Botão **Remarcar** (roxo) aparece apenas para status `agendada` ou `adiada`
- Modal `ModalRemarcarAudiencia`: motivo (obrigatório) + nova data (obrigatório) + nova hora (obrigatório, pré-preenchida)
- Fluxo: audiência original → `status='remarcada'` + `motivo_status` / nova audiência criada copiando todos os dados originais (tipo, vara, responsável, etc.) com nova data/hora
- Backend: `PUT /api/audiencias/:id/remarcar` — transação com rollback
- Audiência remarcada: NÃO pode ser editada, NÃO pode ser excluída
- Nova audiência criada tem auditoria registrada: `"Criada por remarcação da audiência #X"`

## Histórico de Alterações (09/06/2026)

- Botão **Histórico** por linha na listagem → `ModalHistoricoAudiencia`
- Backend: `GET /api/audiencias/:id/historico` — query simples, sem resolução de IDs
- Tabela: `auditoria_audiencia` — campos: `audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id, alterado_em`

### Padrão de auditoria — gravar nomes legíveis NA ESCRITA
**Regra obrigatória para evitar N+1 queries na leitura:**
- `tipo_audiencia_id` → grava nome do tipo (ex: `"Audiência de Instrução"`)
- `vara_id` → grava `"Abrev — Fórum"` (ex: `"2ª Vara Cível — Foro Central"`)
- `responsavel_id` → grava nome da pessoa (ex: `"Dr. João Silva"` ou `"Maria Souza (freelancer)"`)
- Campos já legíveis (`data`, `hora`, `modalidade`, etc.) → gravados diretamente

**Helpers no controller (module-level):**
```javascript
resolverNomeTipo(id)         // → nome do tipo de audiência
resolverNomeVara(id)         // → "abrev — forum"
resolverNomeResponsavel(val) // → nome do usuário ou freelancer
```
Chamados em `atualizar()` antes do INSERT na auditoria.
`buscarHistorico()` agora é 1 query simples — sem nenhum processamento extra.

**Registros antigos** no banco (gravados antes de 09/06/2026) podem mostrar IDs crus — são dados históricos do passado, não afetam novos registros.

## Número do Processo como Link (09/06/2026)

- Na listagem de audiências, o número do processo é um `<Link>` clicável
- Destino: `/processos/pasta/:pasta_id` — leva direto para a tela da pasta

## PastaDetalhe — Aba Audiências (09/06/2026)

- **Coluna Status** adicionada com badge colorido (usa `STATUS_COR_AUD` / `STATUS_LABEL_AUD`)
- **Botão ✏️ Editar** por linha — abre `ModalEditarAudiencia` (mesmo modal da tela de audiências)
  - Visível apenas quando: `status !== 'cancelada'` && `status !== 'remarcada'` && `temPermissao('audiencias','alterar')`
- Audiências de **todos os status** aparecem (antes só mostrava não-canceladas)
- Lista ordenada por **data DESC** (mais recente primeiro)
- Tipos de audiência carregados em paralelo com as audiências (necessários para o modal de edição)
- `ModalEditarAudiencia` importado de `Audiencias.js` via named export

## Rotas Backend

```
GET    /api/audiencias                    → listar (filtros: processo_id, status, data_de, data_ate, sem_ata)
GET    /api/audiencias/:id                → buscar (completo com ata e testemunhas)
POST   /api/audiencias                    → criar
PUT    /api/audiencias/:id                → atualizar
DELETE /api/audiencias/:id                → excluir
PUT    /api/audiencias/:id/cancelar       → cancelar (body: { motivo })
PUT    /api/audiencias/:id/remarcar       → remarcar (body: { motivo, nova_data, nova_hora })
POST   /api/audiencias/:id/ata            → registrar ata
PUT    /api/audiencias/:id/ata-impressa   → marcar ata impressa
GET    /api/audiencias/:id/historico      → histórico de alterações
GET    /api/audiencias/advogados          → lista advogados (usuários + freelas)
GET    /api/audiencias/tipos              → listar tipos
POST   /api/audiencias/tipos              → criar tipo
PUT    /api/audiencias/tipos/:id          → atualizar tipo
DELETE /api/audiencias/tipos/:id          → excluir tipo
GET    /api/audiencias/freelas            → listar freelancers
POST   /api/audiencias/freelas            → criar freelancer
PUT    /api/audiencias/freelas/:id        → atualizar freelancer
DELETE /api/audiencias/freelas/:id        → excluir freelancer
```

**Relacionado:** [[processos-pastas]], [[prazos]], [[financeiro]]
