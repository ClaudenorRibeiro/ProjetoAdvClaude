// ============================================================
// MIDDLEWARE DE AUDITORIA
// Registra automaticamente ações importantes no banco
// ============================================================

const { pool } = require('../config/database');

// Registra uma ação no log de auditoria
// tabela: tabela afetada (ex: 'processos', 'prazos')
// acao:   o que foi feito ('criar', 'editar', 'excluir')
// registroId: ID do registro afetado
// dadosAntigos: dados antes da alteração (para edições)
// dadosNovos: dados após a alteração
async function registrar(usuarioId, tabela, acao, registroId, dadosAntigos = null, dadosNovos = null) {
  try {
    await pool.execute(
      `INSERT INTO logs_auditoria
        (usuario_id, tabela, acao, registro_id, dados_antigos, dados_novos, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        usuarioId,
        tabela,
        acao,
        registroId,
        dadosAntigos ? JSON.stringify(dadosAntigos) : null,
        dadosNovos   ? JSON.stringify(dadosNovos)   : null,
      ]
    );
  } catch (err) {
    // Não lança erro — falha na auditoria não deve derrubar a operação principal
    console.error('Erro ao registrar auditoria:', err.message);
  }
}

module.exports = { registrar };
