---
name: database-tables
description: Lista de tabelas MySQL identificadas até o momento
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Banco — 58 tabelas (conferido no estrutura_banco.sql em 21/06/2026)

As tabelas antigas (`forum, vara, pasta, processo, partes_processo, status_processo, processo_responsaveis, modelo_comunicado`) foram **removidas**. As tabelas definitivas usam prefixo `tbl`.

### ⚠️ Objetos novos em 23/06/2026 (já no banco LOCAL; FALTA na PRODUÇÃO no deploy) — ver [[pendencias-proxima-sessao]]
- **Índices de performance** (busca por pessoa — coluna "Qtde Proc" e checagem de vínculos):
  `CREATE INDEX idx_titautor_pessoa ON tbltituloprocautor (pessoa_id, tipo_pessoa, proc_id);`
  `CREATE INDEX idx_titreu_pessoa ON tbltituloprocreu (pessoa_id, tipo_pessoa, proc_id);`
- **Travas de unicidade** (exceção à regra "sem UNIQUE", APROVADA pelo usuário — tratamento de duplicados CPF/login):
  `ALTER TABLE pessoas_fisicas DROP INDEX idx_pf_cpf, ADD UNIQUE KEY uq_pf_cpf (cpf);`
  `ALTER TABLE usuarios DROP INDEX idx_login, ADD UNIQUE KEY uq_login (login);`
  (Conferir duplicados antes na produção — devem vir vazios.)

### ⚠️ Ajustes de schema em 21/06/2026 (já no banco LOCAL; FALTA na PRODUÇÃO no deploy)
- `logs_auditoria.acao`: VARCHAR(20) → **VARCHAR(30)** (corrige 500 quando a ação passava de 20 chars). Ver [[pendencias-proxima-sessao]] Item 1.
- **Collation padronizada** p/ utf8mb4_0900_ai_ci: o DEFAULT do DATABASE + as 3 tabelas que estavam em utf8mb4_unicode_ci
  (`log_emails`, `notificacoes`, `reset_tokens`). Item 4. (MANTIDOS de propósito: UNIQUE em numPasta e ENUM em tipo_pessoa — ver Itens 2 e 3.)

### ⚠️ Alterações de schema em 13/06/2026 (já no banco LOCAL; FALTA na PRODUÇÃO — ver [[pendencias-proxima-sessao]] p/ o SQL)
- **NOVA** `processo_perito` — peritos vinculados ao processo (proc_id + tipo_pessoa + pessoa_id). Ver [[processos-pastas]].
- **NOVA** `auditoria_pericia` — histórico campo a campo das perícias (espelha auditoria_audiencia). Ver [[pericias]].
- `tblproc` ganhou **`cliente_polo`** (VARCHAR 'autor'/'reu' — qual polo é o cliente).
- `pericia` ganhou: cep, logradouro, numero, complemento, bairro, cidade, estado, responsavel_id,
  responsavel_freela_id, status, motivo_status, alterado_por, alterado_em (+FKs).
- `configuracoes_escritorio` ganhou **`horario_alerta_prazos_2`** (2º horário de alerta) e PERDEU
  `alerta_pendentes_enviado`/`alerta_atrasados_enviado` (trava diária removida).

### Pessoas
| Tabela | Descrição |
|--------|-----------|
| pessoas_fisicas | Cadastro de pessoas físicas |
| pessoas_juridicas | Cadastro de pessoas jurídicas |
| emails_pf | E-mails de pessoas físicas |
| emails_pj | E-mails de pessoas jurídicas |
| telefones_pf | Telefones de pessoas físicas |
| telefones_pj | Telefones de pessoas jurídicas |
| historico_atendimento | Registro de atendimentos por pessoa |

### Auxiliares de Pessoas
| Tabela | Descrição |
|--------|-----------|
| estado_civil | Solteiro, casado, etc. (gerenciável pelo admin) |
| genero | Masculino, feminino, etc. |
| profissao | Cadastro de profissões |

### Processos e Pastas (tabelas definitivas — prefixo tbl)
| Tabela | Descrição |
|--------|-----------|
| tblpasta | Pastas dos clientes (campo `area_direito` varchar 50) |
| tblproc | Processos vinculados às pastas |
| tblvara | Varas (com `abrev_nome` para dropdowns) |
| tblforum | Fóruns |
| tblstatusproc | Status/fases do processo |
| tbltipoproc | Tipos de processo |
| tblinstanciaproc | Instâncias processuais |
| tbltituloprocautor | Autores do processo (tipo_pessoa: fisica/juridica + pessoa_id) |
| tbltituloprocreu | Réus do processo (tipo_pessoa: fisica/juridica + pessoa_id) |

### Prazos e Tarefas
| Tabela | Descrição |
|--------|-----------|
| prazos_processo | Prazos vinculados a processos |
| tipo_prazo | Categorias de prazo |
| prazo_subtipo | Subtipos de prazo |
| tarefas | Tarefas (vínculo livre com processo/pasta) |

### Audiências e Perícias
| Tabela | Descrição |
|--------|-----------|
| audiencia | Audiências por processo — **coluna `status VARCHAR(20)` e `motivo_status TEXT`** (desde 09/06/2026). Colunas `cancelada` e `motivo_cancelamento` foram REMOVIDAS |
| ata_audiencia | Atas das audiências |
| auditoria_audiencia | Histórico campo a campo de alterações de audiências |
| tipo_audiencia | Tipos de audiência |
| audiencia_testemunhas | Testemunhas vinculadas a audiências |
| advogados_freela | Advogados freelancers para conduzir audiências |
| pericia | Perícias vinculadas a processos |
| tipo_pericia | Tipos de perícia |

### Financeiro (REESCRITO 15/06; modelo POR PROCESSO — ver [[financeiro]])
⚠️ As tabelas ANTIGAS `conta_corrente_pasta`, `honorarios`, `parcerias` foram **DROPADAS** (eram protótipo). As atuais:
| Tabela | Descrição |
|--------|-----------|
| conta_corrente | Entradas/saídas por PROCESSO (P&L do escritório). Tem `parcela_id` |
| acordo | Acordo/alvará por processo. Coluna `tipo` ('acordo'/'alvara'), status, valor_total, qtd_parcelas |
| acordo_parcela | Parcelas do acordo. Honorário/parceria por linha; `recebido_em`+forma; colunas de repasse cliente/parceiro (em/forma/por) |
| forma_pagamento | Formas de pagamento (Pix/TED/etc.), soft-delete `ativo` (cadastro em Controle, 20/06) |
| auditoria_parcela | Histórico campo a campo por parcela (acao VARCHAR(30)) |
| auditoria_conta_corrente | Histórico por lançamento manual da conta corrente |

### Calendário e Feriados
| Tabela | Descrição |
|--------|-----------|
| calendario | Dias 2024–2054 com flag dia_util (0/1). Nunca consultado diretamente para feriados. |
| feriados | Feriados gerenciados pelo admin via UI. POST/DELETE sincronizam com calendario.dia_util. |

### Comunicações e Documentos
| Tabela | Descrição |
|--------|-----------|
| modelo_documento | Modelos de documentos com variáveis. ⚠️ Agora guarda **`arquivo_s3_key`** (o .docx fica no S3 — reforma S3). Campo `destino` inclui recibo_cliente/recibo_parceria |
| andamento_processual | Movimentações/andamentos de um processo |

### Agenda
| Tabela | Descrição |
|--------|-----------|
| agenda_compromisso | Compromissos/lembretes pessoais NÃO ligados a processo (20/06). Privado por usuário; flag `escritorio` p/ compartilhar. Ver [[agenda-calendario]] |

### Auditorias adicionais
| Tabela | Descrição |
|--------|-----------|
| auditoria_prazo | Histórico campo a campo de prazos |
| notificacoes | Notificações internas (sino) por usuário |

### Integrações e Publicações
| Tabela | Descrição |
|--------|-----------|
| publicacoes | REFEITA 21/06: fonte, data, numero_processo, titulo, cabecalho, texto, **texto_hash (dedup fiel)**, escritorio, importada/direcionada/tratada (por quem+quando). Ver [[integracoes-publicacoes]] |
| publicacao_usuario | NOVA 21/06: ligação publicação↔usuários (direcionamento a vários usuários) |
| configuracoes_integracoes | Módulos externos e credenciais por escritório (aasp guarda JSON {chave}) |

### Configurações e Usuários
| Tabela | Descrição |
|--------|-----------|
| configuracoes_escritorio | Dados do escritório, alertas, visual |
| usuarios | Usuários do sistema |
| permissoes | Permissões granulares por usuário |
| reset_tokens | Tokens de redefinição de senha |
| pesquisas_salvas | Filtros de pesquisa salvos por usuário |

### Logs
| Tabela | Descrição |
|--------|-----------|
| logs_auditoria | Histórico completo de ações |
| log_documentos_gerados | Log de geração de documentos |
| log_comunicacoes | Histórico de mensagens enviadas |
| log_publicacoes | Registro de exclusões de publicações |
| log_emails | Log de todos os envios de e-mail (criada 12/06/2026) — leitura SEMPRE manual via HeidiSQL, sem UI |

## Tabela log_emails (criada 12/06/2026 via HeidiSQL)

```sql
CREATE TABLE log_emails (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  enviado_em    DATETIME     NOT NULL DEFAULT NOW(),
  para          VARCHAR(255) NOT NULL,
  assunto       VARCHAR(255) NOT NULL,
  status        VARCHAR(10)  NOT NULL,  -- 'ok' ou 'erro'
  erro          TEXT         NULL
);
CREATE INDEX idx_log_emails_enviado_em ON log_emails (enviado_em);
CREATE INDEX idx_log_emails_status     ON log_emails (status);
```

- Preenchida por `email.js` (`registrarLog()`) a cada tentativa de envio
- **Nunca haverá UI para leitura** — acesso somente via HeidiSQL diretamente no banco

## Índices Criados em 12/06/2026 (via HeidiSQL)

```sql
ALTER TABLE `prazos_processo` ADD INDEX `idx_vencimento_status` (`data_vencimento`, `status`);
ALTER TABLE `tarefas`         ADD INDEX `idx_concluida_vencimento` (`concluida`, `data_vencimento`);
ALTER TABLE `logs_auditoria`  ADD INDEX `idx_usuario_data` (`usuario_id`, `criado_em`);
```

## Scripts Fase 2 — Criados em 12/06/2026 (pasta scripts/, aguardando execução pelo usuário)

- `fase2_1_correcao_dados.sql` — mojibake + dados de teste ("baitola", "tico tico"...) + alerta_emails
- `fase2_2_indices.sql` — idx_pf_cpf, idx_pj_cnpj, idx_proc_numproc, idx_aud_data_status, idx_per_data
- `fase2_3_redundancias.sql` — ⚠️ produção só APÓS deploy do backend: remove audiencia.advogado_* (4 colunas
  órfãs do campo duplicado de 09/06) e configuracoes_escritorio.endereco; adiciona pessoas_juridicas.alterado_por/em
  + FKs (pj.criado_por, feriados.criado_por SET NULL, usuarios.criado_por RESTRICT)
- Após rodar no banco local: exportar estrutura → `estrutura_banco.sql` → commit (com autorização)

## ⚠️ pesquisas_salvas — NÃO EXISTE no banco

Listada nas memórias (módulo Relatórios) mas CONFIRMADO ausente no estrutura_banco.sql de 21/06 (58 tabelas).
A função de relatório acabou virando a aba "Consulta" do Financeiro (20/06) — não dependeu de pesquisas_salvas.

## Observações Importantes

- `calendarioService.js` só consulta a tabela `calendario` — nunca `feriados` diretamente
- `configuracaoController.js`: POST/DELETE em `feriados` sempre sincroniza `calendario.dia_util`
- FKs das tabelas operacionais apontam para as tabelas `tbl*` (nomes: `fk_andamento_tblproc`, `fk_audiencia_tblproc`, etc.)
- `tblpasta` tem coluna `area_direito varchar(50)` adicionada em 28/05/2026

**Relacionado:** [[project-overview]], [[cadastro-pessoas]], [[processos-pastas]], [[deploy-versionamento]]
