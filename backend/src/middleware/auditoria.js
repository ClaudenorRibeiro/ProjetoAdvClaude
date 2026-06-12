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
// conn: conexão de transação OPCIONAL — quando informada, o INSERT participa
//       da transação do chamador e uma falha provoca rollback (tudo ou nada);
//       sem ela, mantém o comportamento tolerante (auditoria não derruba a operação)
async function registrar(usuarioId, tabela, acao, registroId, dadosAntigos = null, dadosNovos = null, conn = null) {
  const executor = conn || pool;
  try {
    await executor.execute(
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
    // Dentro de transação: repropaga para o chamador fazer rollback
    if (conn) throw err;
    // Standalone: não lança — falha na auditoria não derruba a operação principal
    console.error('Erro ao registrar auditoria:', err.message);
  }
}

module.exports = { registrar };
