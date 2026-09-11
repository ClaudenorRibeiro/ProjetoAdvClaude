// ============================================================
// CONTROLLER DE MANUTENÇÃO
// Ações administrativas de SISTEMA — restritas ao SUPERUSUÁRIO (nivel 0).
// A proteção de nível fica na rota (middleware apenasSuper); aqui há ainda
// uma 2ª trava textual (confirmacao === 'LIMPAR') contra disparo acidental.
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// Tabelas com a MASSA OPERACIONAL/TESTE esvaziadas pelo "Limpar dados de teste".
// NÃO inclui (são PRESERVADAS de propósito): tabelas de referência/listas
// (tipo_*, prazo_subtipo, estado_civil, genero, nacionalidade, parentesco,
// profissao, forma_pagamento), lookup de processo (tblvara/tblforum/tblstatusproc/
// tbltipoproc/tblinstanciaproc/tblassuntoproc), calendario/feriados,
// configuracoes_escritorio/configuracoes_integracoes, usuarios/permissoes,
// modelo_documento (modelos .docx reais apontam para o S3), etiquetas_definicoes
// e etiquetas_escritorio_catalogo (config de etiqueta), tipo_documento_pendencia
// (catálogo) e controle_versao_banco.
// A ORDEM aqui não importa: a exclusão roda com FOREIGN_KEY_CHECKS=0.
// Antes de rodar, a lista é filtrada para as tabelas que EXISTEM neste banco
// (instâncias podem estar em pontos diferentes do schema).
const TABELAS_LIMPAR = [
  // Pessoas
  'pessoas_fisicas', 'pessoas_juridicas', 'emails_pf', 'emails_pj',
  'telefones_pf', 'telefones_pj', 'historico_atendimento', 'pessoas_avisos_idade',
  'parabens_enviados',
  // Processos
  'tblpasta', 'tblproc', 'tbltituloprocautor', 'tbltituloprocreu',
  'processo_perito', 'processo_assunto', 'andamento_processual',
  // Prazos / Tarefas / Agenda
  'prazos_processo', 'auditoria_prazo', 'tarefas', 'agenda_compromisso',
  // Audiências
  'audiencia', 'ata_audiencia', 'audiencia_testemunhas', 'auditoria_audiencia',
  // Perícias
  'pericia', 'auditoria_pericia', 'pericia_local_reu',
  // Financeiro
  'conta_corrente', 'acordo', 'acordo_parcela', 'auditoria_parcela', 'auditoria_conta_corrente',
  // Publicações
  'publicacoes', 'publicacao_usuario', 'publicacoes_lidas', 'log_publicacoes',
  // Pendências de documentos (módulo novo)
  'pendencia_documento', 'pendencia_documento_item', 'pendencia_documento_responsavel',
  // Aplicação de etiquetas (as cores/significados em si — etiquetas_definicoes — ficam)
  'prazos_etiquetas', 'tarefas_etiquetas', 'audiencias_etiquetas', 'pericias_etiquetas',
  'publicacoes_etiquetas', 'pastas_etiquetas', 'processos_etiquetas_escritorio',
  'pessoas_fisicas_etiquetas_escritorio', 'pessoas_juridicas_etiquetas_escritorio',
  'auditoria_etiqueta_escritorio',
  // Notificações / Logs / Tokens
  'notificacoes', 'logs_auditoria', 'log_comunicacoes', 'log_emails', 'log_documentos_gerados',
  'reset_tokens',
  // Advogados freelancers (decisão do usuário em 22/06: tratar como massa de teste)
  'advogados_freela',
];

// POST /api/manutencao/limpar-dados-teste
// Esvazia a massa de teste. Restrito ao superusuário (rota já protegida por apenasSuper).
// Irreversível. Exige no corpo { confirmacao: 'LIMPAR' }.
async function limparDadosTeste(req, res) {
  // 2ª trava: confirmação textual explícita (defesa contra disparo acidental)
  if (String(req.body?.confirmacao || '').trim() !== 'LIMPAR') {
    return erro(res, 'Confirmação inválida. Digite LIMPAR para confirmar a limpeza.');
  }

  const conn = await pool.getConnection();
  try {
    // Filtra a whitelist para as tabelas que REALMENTE existem neste banco — instâncias
    // podem estar em pontos diferentes do schema (ex.: pendencia_documento_responsavel
    // ainda não criada). Assim o "limpar" não quebra num banco desatualizado.
    const [tabsBanco] = await conn.query(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const existentes = new Set(tabsBanco.map(r => r.t));
    const alvos = TABELAS_LIMPAR.filter(t => existentes.has(t));

    // Desliga a checagem de FK só NESTA conexão para não depender da ordem de exclusão
    // (são dezenas de tabelas inter-relacionadas). Tudo dentro de UMA transação: se
    // qualquer DELETE falhar, faz rollback e nada fica apagado pela metade.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();

    let registros = 0;
    for (const tabela of alvos) {
      // Nome de tabela vem de uma whitelist fixa (não do request) — sem risco de injeção.
      const [r] = await conn.query(`DELETE FROM \`${tabela}\``);
      registros += r.affectedRows || 0;
    }

    await conn.commit();

    // A auditoria do "limpou" nasce JÁ no banco zerado (logs_auditoria está entre as
    // tabelas limpas). Por isso é registrada DEPOIS do commit, fora da transação.
    await auditoria.registrar(
      req.usuario.id, 'sistema', 'limpar-dados-teste', null,
      null, { tabelas: alvos.length, registros }
    );

    return sucesso(res, { tabelas: alvos.length, registros },
      'Dados de teste removidos com sucesso.');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    // Religa a checagem de FK SEMPRE (mesmo em erro) antes de devolver a conexão ao pool
    try { await conn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) { /* nada a fazer */ }
    conn.release();
  }
}

module.exports = { limparDadosTeste };
