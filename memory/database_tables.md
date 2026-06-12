---
name: database-tables
description: Lista de tabelas MySQL identificadas até o momento
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Banco Limpo — 46 Tabelas (após limpeza de 28/05/2026)

As tabelas antigas (`forum, vara, pasta, processo, partes_processo, status_processo, processo_responsaveis, modelo_comunicado`) foram **removidas**. As tabelas definitivas usam prefixo `tbl`.

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

### Financeiro
| Tabela | Descrição |
|--------|-----------|
| conta_corrente_pasta | Lançamentos financeiros por pasta |
| honorarios | Configuração de honorários por pasta |
| parcerias | Parcerias/comissões por processo |

### Calendário e Feriados
| Tabela | Descrição |
|--------|-----------|
| calendario | Dias 2024–2054 com flag dia_util (0/1). Nunca consultado diretamente para feriados. |
| feriados | Feriados gerenciados pelo admin via UI. POST/DELETE sincronizam com calendario.dia_util. |

### Comunicações e Documentos
| Tabela | Descrição |
|--------|-----------|
| modelo_documento | Modelos de documentos com variáveis automáticas |
| andamento_processual | Movimentações/andamentos de um processo |

### Integrações e Publicações
| Tabela | Descrição |
|--------|-----------|
| publicacoes | Publicações AASP salvas |
| configuracoes_integracoes | Módulos externos e credenciais por escritório |

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

Listada nas memórias (módulo Relatórios) mas ausente no backup de 12/06/2026 (51 tabelas conferidas).
Será criada quando o módulo Relatórios for desenvolvido (Fase 5).

## Observações Importantes

- `calendarioService.js` só consulta a tabela `calendario` — nunca `feriados` diretamente
- `configuracaoController.js`: POST/DELETE em `feriados` sempre sincroniza `calendario.dia_util`
- FKs das tabelas operacionais apontam para as tabelas `tbl*` (nomes: `fk_andamento_tblproc`, `fk_audiencia_tblproc`, etc.)
- `tblpasta` tem coluna `area_direito varchar(50)` adicionada em 28/05/2026

**Relacionado:** [[project-overview]], [[cadastro-pessoas]], [[processos-pastas]], [[deploy-versionamento]]
