-- IMPORTANTE — NÃO APAGAR. Só LÊ (não altera nada): mostra o que falta no banco em relação ao estrutura_banco.sql.
-- Usar sempre que o sistema reclamar de tabela/coluna inexistente, e depois de atualizar uma instância.
-- ============================================================================
-- DIAGNOSTICO (SOMENTE LEITURA): o que o estrutura_banco.sql tem e este banco NAO tem
-- Rodar no HeidiSQL com o BANCO DO SISTEMA selecionado. Executar TUDO (F9).
-- Nao altera nada: so consulta o information_schema.
-- Resultado 1 = tabelas que faltam. Resultado 2 = colunas que faltam (em tabelas que existem).
-- Se os dois vierem vazios, o banco esta igual ao estrutura_banco.sql.
-- ============================================================================
SET @db := DATABASE();

SELECT esperado.tabela AS tabela_que_falta
  FROM (
    SELECT 'acordo' AS tabela
    UNION ALL
    SELECT 'acordo_parcela' AS tabela
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela
    UNION ALL
    SELECT 'advogados_freela' AS tabela
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela
    UNION ALL
    SELECT 'andamento_processual' AS tabela
    UNION ALL
    SELECT 'ata_audiencia' AS tabela
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela
    UNION ALL
    SELECT 'audiencia' AS tabela
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela
    UNION ALL
    SELECT 'audiencias_etiquetas' AS tabela
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela
    UNION ALL
    SELECT 'calendario' AS tabela
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela
    UNION ALL
    SELECT 'conta_corrente' AS tabela
    UNION ALL
    SELECT 'conta_financeira' AS tabela
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela
    UNION ALL
    SELECT 'controle_versao_banco' AS tabela
    UNION ALL
    SELECT 'emails_pf' AS tabela
    UNION ALL
    SELECT 'emails_pj' AS tabela
    UNION ALL
    SELECT 'estado_civil' AS tabela
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela
    UNION ALL
    SELECT 'feriados' AS tabela
    UNION ALL
    SELECT 'forma_pagamento' AS tabela
    UNION ALL
    SELECT 'genero' AS tabela
    UNION ALL
    SELECT 'historico_atendimento' AS tabela
    UNION ALL
    SELECT 'instituicao_financeira' AS tabela
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela
    UNION ALL
    SELECT 'log_emails' AS tabela
    UNION ALL
    SELECT 'log_publicacoes' AS tabela
    UNION ALL
    SELECT 'logs_auditoria' AS tabela
    UNION ALL
    SELECT 'modelo_documento' AS tabela
    UNION ALL
    SELECT 'nacionalidade' AS tabela
    UNION ALL
    SELECT 'notificacoes' AS tabela
    UNION ALL
    SELECT 'parabens_enviados' AS tabela
    UNION ALL
    SELECT 'parentesco' AS tabela
    UNION ALL
    SELECT 'pastas_etiquetas' AS tabela
    UNION ALL
    SELECT 'pendencia_documento' AS tabela
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela
    UNION ALL
    SELECT 'pericia' AS tabela
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela
    UNION ALL
    SELECT 'pericias_etiquetas' AS tabela
    UNION ALL
    SELECT 'permissoes' AS tabela
    UNION ALL
    SELECT 'avisos_cliente' AS tabela
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela
    UNION ALL
    SELECT 'pessoas_fisicas_etiquetas_escritorio' AS tabela
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela
    UNION ALL
    SELECT 'pessoas_juridicas_etiquetas_escritorio' AS tabela
    UNION ALL
    SELECT 'prazo_subtipo' AS tabela
    UNION ALL
    SELECT 'prazos_etiquetas' AS tabela
    UNION ALL
    SELECT 'prazos_processo' AS tabela
    UNION ALL
    SELECT 'processo_assunto' AS tabela
    UNION ALL
    SELECT 'processo_oabs' AS tabela
    UNION ALL
    SELECT 'processo_perito' AS tabela
    UNION ALL
    SELECT 'processos_etiquetas_escritorio' AS tabela
    UNION ALL
    SELECT 'profissao' AS tabela
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela
    UNION ALL
    SELECT 'publicacoes' AS tabela
    UNION ALL
    SELECT 'publicacoes_etiquetas' AS tabela
    UNION ALL
    SELECT 'publicacoes_lidas' AS tabela
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela
    UNION ALL
    SELECT 'reset_tokens' AS tabela
    UNION ALL
    SELECT 'tarefas' AS tabela
    UNION ALL
    SELECT 'tarefas_etiquetas' AS tabela
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela
    UNION ALL
    SELECT 'tblforum' AS tabela
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela
    UNION ALL
    SELECT 'tblpasta' AS tabela
    UNION ALL
    SELECT 'tblproc' AS tabela
    UNION ALL
    SELECT 'tblstatusproc' AS tabela
    UNION ALL
    SELECT 'tbltipoproc' AS tabela
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela
    UNION ALL
    SELECT 'tblvara' AS tabela
    UNION ALL
    SELECT 'telefones_pf' AS tabela
    UNION ALL
    SELECT 'telefones_pj' AS tabela
    UNION ALL
    SELECT 'tipo_audiencia' AS tabela
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela
    UNION ALL
    SELECT 'tipo_pericia' AS tabela
    UNION ALL
    SELECT 'tipo_prazo' AS tabela
    UNION ALL
    SELECT 'usuarios' AS tabela
  ) esperado
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES x WHERE x.TABLE_SCHEMA = @db AND x.TABLE_NAME = esperado.tabela)
 ORDER BY esperado.tabela;

SELECT esperado.tabela AS tabela, esperado.coluna AS coluna_que_falta
  FROM (
    SELECT 'acordo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'valor_total' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'qtd_parcelas' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'data_primeira' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'beneficiario_cliente_tipo' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'beneficiario_cliente_id' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'beneficiario_cliente_conta_id' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'acordo' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'acordo_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'vencimento' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'valor_bruto' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'honor_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'honor_percentual' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'honor_valor' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'valor_liquido' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'parceria_pessoa_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'parceria_pessoa_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'parceria_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'parceria_percentual' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'parceria_valor' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'multa_percentual' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'recebido_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'recebimento_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'recebimento_identificacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'recebimento_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'recebimento_instituicao_origem_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_instituicao_destino_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_pessoa_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_conta_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_destino_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_destino_snapshot' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_observacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_instituicao_destino_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_conta_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_destino_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_destino_snapshot' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_observacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_cliente_por' AS coluna
    UNION ALL
    SELECT 'acordo_parcela' AS tabela, 'repasse_parceiro_por' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parcela_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'percentual_juiz' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'vencimento' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'valor_bruto' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'honor_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'honor_percentual' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'honor_valor' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'valor_liquido' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_habilitado' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_pessoa_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_conta_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parceria_pessoa_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parceria_pessoa_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parceria_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parceria_percentual' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'parceria_valor' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_habilitado' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'recebido_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'recebimento_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'recebimento_identificacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'recebimento_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_destino_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_destino_snapshot' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_observacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_cliente_por' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_em' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_forma_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_conta_id' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_destino_tipo' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_destino_snapshot' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_observacao' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'repasse_parceiro_por' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'acordo_parcela_multa' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'oab' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'profissao_id' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'telefone' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'complemento' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'estado' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'advogados_freela' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'delegado_para' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'titulo' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'hora_inicio' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'hora_fim' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'dia_todo' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'escritorio' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'concluido' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'concluido_por' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'concluido_em' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'agenda_compromisso' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'data_hora' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'fonte' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'codigo_movimento' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'hash_movimento' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'editado_por' AS coluna
    UNION ALL
    SELECT 'andamento_processual' AS tabela, 'editado_em' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'resultado' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'houve_acordo' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'valor_acordo' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'parcelas' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'valor_parcela' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'data_primeiro_pagamento' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'nova_audiencia' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'teve_prazo' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'teve_pericia' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'teve_alvara' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'teve_desistencia' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'teve_retorno_autos' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'observacoes' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'advogado_id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'advogado_freela_id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia' AS tabela, 'sem_advogado' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'ata_audiencia_id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'registro_id' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'titulo' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'data_referencia' AS coluna
    UNION ALL
    SELECT 'ata_audiencia_itens' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'tipo_audiencia_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'hora' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'modalidade' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'local' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'observacoes' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'vara_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'plataforma_virtual' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'link_virtual' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'responsavel_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'responsavel_freela_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'comunicado_enviado' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'ata_impressa' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'motivo_status' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'audiencia' AS tabela, 'horario_ativo' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'parte_pessoa_id' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'polo' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'audiencia_testemunhas' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'responsavel_id' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'responsavel_freela_id' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'audiencia_responsaveis' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'audiencias_etiquetas' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'audiencias_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'audiencias_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'campo_alterado' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'valor_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'valor_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_audiencia' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'lancamento_id' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'acao' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'campo_alterado' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'valor_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'valor_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_conta_corrente' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'registro_id' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'slot_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'slot_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_etiqueta_escritorio' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'parcela_id' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'acao' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'campo_alterado' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'valor_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'valor_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_parcela' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'pericia_id' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'campo_alterado' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'valor_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'valor_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_pericia' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'prazo_id' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'status_anterior' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'status_novo' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'auditoria_prazo' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'calendario' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'calendario' AS tabela, 'dia_util' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'cnpj_cpf' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'telefone' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'estado' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'logo_base64' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'cor_principal' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'horario_alerta_prazos' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'horario_alerta_prazos_2' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_alerta_audiencia' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_alerta_pericia' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_sem_movimentacao' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_processo_parado' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_audiencia_sem_adv' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'setup_concluido' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'alerta_atrasado_ativo' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'alerta_emails' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'prazo_fazendo_timeout' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'titulo_aba' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'mensagem_aniversario' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'documentos_maiusculas' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'tempo_inatividade_min' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'ata_advogado_obrigatorio' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'advogado_principal_id' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'oab_principal' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'modelos_email_perito' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'max_relatorios_por_usuario' AS coluna
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela, 'configuracoes' AS coluna
    UNION ALL
    SELECT 'configuracoes_integracoes' AS tabela, 'atualizado_em' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'parcela_id' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'valor' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'origem' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'conta_financeira_id' AS coluna
    UNION ALL
    SELECT 'conta_corrente' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'instituicao_financeira_id' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'agencia' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'digito' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'chave_pix' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'conta_financeira' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'instituicao_financeira_id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'agencia' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'digito' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'chave_pix' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'conta_terceiro' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'titular' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'documento_titular' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pf' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'instituicao_financeira_id' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'agencia' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'digito' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'chave_pix' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'conta_terceiro' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'titular' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'documento_titular' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'contas_bancarias_pj' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'controle_versao_banco' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'controle_versao_banco' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'controle_versao_banco' AS tabela, 'sql_aplicado' AS coluna
    UNION ALL
    SELECT 'controle_versao_banco' AS tabela, 'aplicado_em' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'emails_pf' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'emails_pj' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'estado_civil' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'estado_civil' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela, 'cor' AS coluna
    UNION ALL
    SELECT 'etiquetas_definicoes' AS tabela, 'significado' AS coluna
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela, 'cor' AS coluna
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela, 'significado' AS coluna
    UNION ALL
    SELECT 'etiquetas_escritorio_catalogo' AS tabela, 'status_id' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'feriados' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'forma_pagamento' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'forma_pagamento' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'forma_pagamento' AS tabela, 'uso_permitido' AS coluna
    UNION ALL
    SELECT 'forma_pagamento' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'genero' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'genero' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'historico_atendimento' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'instituicao_financeira' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'instituicao_financeira' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'instituicao_financeira' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'canal' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'destinatario' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'assunto' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'conteudo' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'enviado' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'erro_msg' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'enviado_em' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'modelo_id' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'modelo_nome' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'formato' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'ancora_tipo' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'ancora_id' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'referencia' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'nome_arquivo' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'usuario_nome' AS coluna
    UNION ALL
    SELECT 'log_documentos_gerados' AS tabela, 'gerado_em' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'enviado_em' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'para' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'destinatario_nome' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'mensagem' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'assunto' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'log_emails' AS tabela, 'erro' AS coluna
    UNION ALL
    SELECT 'log_publicacoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'log_publicacoes' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'log_publicacoes' AS tabela, 'quantidade' AS coluna
    UNION ALL
    SELECT 'log_publicacoes' AS tabela, 'data_publicacao' AS coluna
    UNION ALL
    SELECT 'log_publicacoes' AS tabela, 'acao_em' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'tabela' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'acao' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'registro_id' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'dados_antigos' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'dados_novos' AS coluna
    UNION ALL
    SELECT 'logs_auditoria' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'destino' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'tipo_audiencia_id' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'modalidade' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'minutos_antes' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'tipo_pericia_id' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'subtipo_prazo_id' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'arquivo_s3_key' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'blocos_exigidos' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'variaveis_usadas' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'modelo_documento' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'nacionalidade' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'nacionalidade' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'prazo_id' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'tarefa_id' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'mensagem' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'lida' AS coluna
    UNION ALL
    SELECT 'notificacoes' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'ano' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'canal' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'parabens_enviados' AS tabela, 'enviado_em' AS coluna
    UNION ALL
    SELECT 'parentesco' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'parentesco' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'pastas_etiquetas' AS tabela, 'pasta_id' AS coluna
    UNION ALL
    SELECT 'pastas_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'pastas_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'observacao' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'resolvido_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'resolvido_por' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'pendencia_id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'tipo_documento_id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'recebido' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'data_recebimento' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'recebido_por' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_item' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'pendencia_id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'avisar_sino' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'avisar_email' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'data_aviso' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'avisado_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pendencia_documento_responsavel' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'tipo_pericia_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'data' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'hora' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'local' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'complemento' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'estado' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'perito_tipo' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'perito_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'assistente_tecnico_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'assistente_tecnico_freela_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'responsavel_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'responsavel_freela_id' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'motivo_status' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'comunicado_enviado' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'email_perito_enviado' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'pericia' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela, 'pericia_id' AS coluna
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'pericia_local_reu' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pericias_etiquetas' AS tabela, 'pericia_id' AS coluna
    UNION ALL
    SELECT 'pericias_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'pericias_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'submodulo' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'acao' AS coluna
    UNION ALL
    SELECT 'permissoes' AS tabela, 'permitido' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'modulo' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'pericia_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'audiencia_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'pessoa_fisica_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'referencia_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'cliente_tipo' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'cliente_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'data_evento' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'data_aviso' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'assunto' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'texto' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'texto_editado' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'modo' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'decidido_por' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'decidido_em' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'motivo_status' AS coluna
    UNION ALL
    SELECT 'avisos_cliente' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'whatsapp' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'sms' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'whatsapp_unico' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'sms_unico' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'whatsapp' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'sms' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'whatsapp_unico' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'sms_unico' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'avisos_pericia_mostrar' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'avisos_audiencia_mostrar' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'avisos_parabens_mostrar' AS coluna
    UNION ALL
    SELECT 'configuracoes_escritorio' AS tabela, 'dias_aviso_parabens' AS coluna
    UNION ALL
    SELECT 'log_comunicacoes' AS tabela, 'aviso_id' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'idade' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'avisado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_avisos_idade' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'cpf' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'rg' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'rg_orgao' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'pis' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'ctps_numero' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'ctps_serie' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'nome_pai' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'nome_mae' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'responsavel_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'parentesco_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'data_nascimento' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'estado_civil_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'profissao_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'genero_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'nacionalidade_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'complemento' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'estado' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'foto_path' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'observacoes' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas_etiquetas_escritorio' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas_etiquetas_escritorio' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas_etiquetas_escritorio' AS tabela, 'marcado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_fisicas_etiquetas_escritorio' AS tabela, 'marcado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'razao_social' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'nome_fantasia' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'cnpj' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'em_recuperacao_judicial' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'inscricao_estadual' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'complemento' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'estado' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'observacoes' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas_etiquetas_escritorio' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas_etiquetas_escritorio' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas_etiquetas_escritorio' AS tabela, 'marcado_por' AS coluna
    UNION ALL
    SELECT 'pessoas_juridicas_etiquetas_escritorio' AS tabela, 'marcado_em' AS coluna
    UNION ALL
    SELECT 'prazo_subtipo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'prazo_subtipo' AS tabela, 'tipo_prazo_id' AS coluna
    UNION ALL
    SELECT 'prazo_subtipo' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'prazo_subtipo' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'prazos_etiquetas' AS tabela, 'prazo_id' AS coluna
    UNION ALL
    SELECT 'prazos_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'prazos_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'subtipo_id' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'data_inicio' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'quantidade' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'tipo_dias' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'data_vencimento' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'delegado_para' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'status' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'status_alterado_por' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'status_alterado_em' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'concluido_por' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'concluido_em' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'notificar_conclusao' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'motivo_cancelamento' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'fazendo_por' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'fazendo_desde' AS coluna
    UNION ALL
    SELECT 'prazos_processo' AS tabela, 'status_antes_fazendo' AS coluna
    UNION ALL
    SELECT 'processo_assunto' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'processo_assunto' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'processo_assunto' AS tabela, 'assunto_id' AS coluna
    UNION ALL
    SELECT 'processo_assunto' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'processo_assunto' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'freela_id' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'processo_oabs' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'proc_id' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'processo_perito' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'processos_etiquetas_escritorio' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'processos_etiquetas_escritorio' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'processos_etiquetas_escritorio' AS tabela, 'marcado_por' AS coluna
    UNION ALL
    SELECT 'processos_etiquetas_escritorio' AS tabela, 'marcado_em' AS coluna
    UNION ALL
    SELECT 'profissao' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'profissao' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'atribuida_por' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'atribuida_em' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'tratada' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'tratada_em' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'tratada_por' AS coluna
    UNION ALL
    SELECT 'publicacao_usuario' AS tabela, 'motivo_sem_acao' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'fonte' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'id_cnj' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'data_publicacao' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'numero_processo' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'tribunal' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'oab' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'titulo' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'cabecalho' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'numero_publicacao' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'numero_arquivo' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'texto' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'texto_hash' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'hash_cnj' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'escritorio' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'importada_por' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'direcionada_por' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'direcionada_em' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'tratada' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'tratada_por' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'tratada_em' AS coluna
    UNION ALL
    SELECT 'publicacoes' AS tabela, 'motivo_sem_acao' AS coluna
    UNION ALL
    SELECT 'publicacoes_etiquetas' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'publicacoes_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'publicacoes_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'publicacoes_lidas' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'publicacoes_lidas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'publicacoes_lidas' AS tabela, 'lida_em' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'modelo_id' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'dono_id' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'frequencia' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'dia_semana' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'dia_mes' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'hora' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'formato' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'destinatarios' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'proxima_execucao' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'ultimo_envio' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'ultimo_status' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'ultimo_erro' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'falhas_seguidas' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'relatorio_agendamento' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'assunto' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'definicao' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'escopo' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'dono_id' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela, 'modelo_id' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela, 'origem' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela, 'preferencias' AS coluna
    UNION ALL
    SELECT 'relatorio_modelo_usuario' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'token' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'expires_at' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'usado' AS coluna
    UNION ALL
    SELECT 'reset_tokens' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'titulo' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'descricao' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'prioridade' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'processo_id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'pasta_id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'prazo_id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'publicacao_id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'atribuida_para' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'data_vencimento' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'concluida' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'concluida_por' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'concluida_em' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'andamento_id' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tarefas' AS tabela, 'notificar_conclusao' AS coluna
    UNION ALL
    SELECT 'tarefas_etiquetas' AS tabela, 'tarefa_id' AS coluna
    UNION ALL
    SELECT 'tarefas_etiquetas' AS tabela, 'usuario_id' AS coluna
    UNION ALL
    SELECT 'tarefas_etiquetas' AS tabela, 'slot' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblassuntoproc' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'abrev_nome' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'cidade' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'cep' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'logradouro' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'num_end' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'compl_end' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'bairro' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'uf' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblforum' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblinstanciaproc' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'numPasta' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblpasta' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'pasta_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'numProc' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'protocolo' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'datajud_sincronizado_em' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'cliente_polo' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'NomeTituloProc' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'vara_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'tipo_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'status_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'instancia_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'data_distribuicao' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'observacoes' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'responsavel_id' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'oab_processo' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblproc' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'encerra_processo' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblstatusproc' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'codTipoProc' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tbltipoproc' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'proc_id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tbltituloprocautor' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'proc_id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'tipo_pessoa' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tbltituloprocreu' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'abrev_nome' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'forum_id' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'codVaraNoProc' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'compl_end' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'tel' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tblvara' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'telefones_pf' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'pessoa_id' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'numero' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'principal' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'telefones_pj' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tipo_audiencia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tipo_audiencia' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tipo_audiencia' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'alterado_por' AS coluna
    UNION ALL
    SELECT 'tipo_documento_pendencia' AS tabela, 'alterado_em' AS coluna
    UNION ALL
    SELECT 'tipo_pericia' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tipo_pericia' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tipo_pericia' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'tipo_prazo' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'tipo_prazo' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'tipo_prazo' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'id' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'nome' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'login' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'senha_hash' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'email' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'oab' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'tipo' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'nivel' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'ativo' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'ver_todos_processos' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'criado_em' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'criado_por' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'ultimo_acesso' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'notif_email' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'notif_tela' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'sessao_atual' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'cores_agenda' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'cores_menu' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'cor_linha' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'cor_linha_lida' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'google_agenda_ativo' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'google_agenda_email' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'publicacoes_escopo' AS coluna
    UNION ALL
    SELECT 'usuarios' AS tabela, 'max_relatorios' AS coluna
  ) esperado
 WHERE EXISTS (SELECT 1 FROM information_schema.TABLES x WHERE x.TABLE_SCHEMA = @db AND x.TABLE_NAME = esperado.tabela)
   AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = @db AND c.TABLE_NAME = esperado.tabela AND c.COLUMN_NAME = esperado.coluna)
 ORDER BY esperado.tabela, esperado.coluna;
