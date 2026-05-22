---
name: database-tables
description: Lista de tabelas MySQL identificadas até o momento
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Tabelas Identificadas

| Tabela | Descrição |
|--------|-----------|
| pessoas_fisicas | Cadastro de pessoas físicas |
| pessoas_juridicas | Cadastro de pessoas jurídicas |
| emails_pf | E-mails de pessoas físicas |
| emails_pj | E-mails de pessoas jurídicas |
| telefones_pf | Telefones de pessoas físicas |
| telefones_pj | Telefones de pessoas jurídicas |
| estado_civil | Solteiro, casado, divorciado, etc. |
| genero | Masculino, feminino, etc. |
| profissao | Cadastro de profissões |
| forum | Cadastro de fóruns |
| vara | Cadastro de varas |
| pasta | Casos/pastas dos clientes |
| processo | Processos vinculados às pastas |
| status_processo | Fases do processo |
| tipo_prazo | Categoria do prazo |
| prazo | Prazos específicos por tipo |
| calendario | Dias com identificação útil/não útil |
| feriados | Feriados cadastrados pelo admin |
| historico_atendimento | Registro de atendimentos |
| usuarios | Usuários do sistema |
| permissoes | Permissões granulares por usuário |
| tipo_audiencia | Tipos de audiência |
| modelo_comunicado | Modelos de PDF por tipo de audiência |
| audiencia | Audiências por processo |
| ata_audiencia | Atas das audiências |
| conta_corrente_pasta | Lançamentos financeiros por pasta |
| honorarios | Configuração de honorários por pasta |
| parcerias | Parcerias/comissões por processo |
| configuracoes_escritorio | Horário de alerta, notificações, etc. |
| logs_auditoria | Histórico completo de ações no sistema |
| andamento_processual | Movimentações/andamentos de um processo |
| modelo_documento | Modelos de documentos com variáveis automáticas |
| log_documentos_gerados | Log de geração de documentos (quem, quando, qual modelo, qual processo) |
| log_comunicacoes | Histórico de mensagens enviadas (WhatsApp, e-mail) |
| configuracoes_integracoes | Módulos externos ativos e credenciais por escritório |
| pesquisas_salvas | Filtros e colunas de pesquisa salvos por usuário |
| pericia | Perícias vinculadas a processos |
| tipo_pericia | Tipos de perícia cadastráveis pelo admin |

## Próximos Blocos a Definir

- **Bloco 17 — Perícias** (mencionado no dashboard, ainda não detalhado)
- **Bloco 18 — Notificações internas** (a definir)
- **Bloco 19 — Integrações CNJ/AASP** (adiadas)
- **Bloco 20 — Setup/instalação inicial** (a definir)

**Relacionado:** [[project-overview]], [[cadastro-pessoas]], [[processos-pastas]]
