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

## Observações Importantes

- `calendarioService.js` só consulta a tabela `calendario` — nunca `feriados` diretamente
- `configuracaoController.js`: POST/DELETE em `feriados` sempre sincroniza `calendario.dia_util`
- FKs das tabelas operacionais apontam para as tabelas `tbl*` (nomes: `fk_andamento_tblproc`, `fk_audiencia_tblproc`, etc.)
- `tblpasta` tem coluna `area_direito varchar(50)` adicionada em 28/05/2026

**Relacionado:** [[project-overview]], [[cadastro-pessoas]], [[processos-pastas]], [[deploy-versionamento]]
