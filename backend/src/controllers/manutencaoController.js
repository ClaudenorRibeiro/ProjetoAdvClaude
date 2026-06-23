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
// (tipo_*, prazo_subtipo, estado_civil, genero, profissao, forma_pagamento),
// lookup de processo (tblvara/tblforum/tblstatusproc/tbltipoproc/tblinstanciaproc),
// calendario/feriados, configuracoes_escritorio/configuracoes_integracoes,
// usuarios/permissoes e modelo_documento (modelos .docx reais apontam para o S3).
// A ORDEM aqui não importa: a exclusão roda com FOREIGN_KEY_CHECKS=0.
const TABELAS_LIMPAR = [
  // Pessoas
  'pessoas_fisicas', 'pessoas_juridicas', 'emails_pf', 'emails_pj',
  'telefones_pf', 'telefones_pj', 'historico_atendimento',
  // Processos
  'tblpasta', 'tblproc', 'tbltituloprocautor', 'tbltituloprocreu',
  'processo_perito', 'andamento_processual',
  // Prazos / Tarefas / Agenda
  'prazos_processo', 'auditoria_prazo', 'tarefas', 'agenda_compromisso',
  // Audiências
  'audiencia', 'ata_audiencia', 'audiencia_testemunhas', 'auditoria_audiencia',
  // Perícias
  'pericia', 'auditoria_pericia',
  // Financeiro
  'conta_corrente', 'acordo', 'acordo_parcela', 'auditoria_parcela', 'auditoria_conta_corrente',
  // Publicações
  'publicacoes', 'publicacao_usuario', 'log_publicacoes',
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
    // Desliga a checagem de FK só NESTA conexão para não depender da ordem de exclusão
    // (são dezenas de tabelas inter-relacionadas). Tudo dentro de UMA transação: se
    // qualquer DELETE falhar, faz rollback e nada fica apagado pela metade.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();

    let registros = 0;
    for (const tabela of TABELAS_LIMPAR) {
      // Nome de tabela vem de uma whitelist fixa (não do request) — sem risco de injeção.
      const [r] = await conn.query(`DELETE FROM \`${tabela}\``);
      registros += r.affectedRows || 0;
    }

    await conn.commit();

    // A auditoria do "limpou" nasce JÁ no banco zerado (logs_auditoria está entre as
    // tabelas limpas). Por isso é registrada DEPOIS do commit, fora da transação.
    await auditoria.registrar(
      req.usuario.id, 'sistema', 'limpar-dados-teste', null,
      null, { tabelas: TABELAS_LIMPAR.length, registros }
    );

    return sucesso(res, { tabelas: TABELAS_LIMPAR.length, registros },
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
