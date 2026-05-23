// ============================================================
// CONTROLLER DO DASHBOARD
// Retorna todos os cards da tela principal em uma única chamada
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erroInterno } = require('../utils/response');

// GET /api/dashboard — Retorna todos os dados do dashboard
async function buscarDados(req, res) {
  try {
    const userId = req.usuario.id;
    const hoje = new Date().toISOString().split('T')[0];
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Executa todas as consultas em paralelo para máxima performance
    const [
      prazosHoje,
      prazosAtrasados,
      tarefasPendentes,
      tarefasAtrasadas,
      audienciasHoje,
      audienciasAmanha,
      periciasHoje,
      periciasAmanha,
      audienciasSemAta,
      processosSemMovimentacao,
    ] = await Promise.all([

      // Prazos que vencem hoje
      pool.execute(
        `SELECT pp.id, pp.descricao, pp.data_vencimento, pp.status,
                pr.numero AS processo_numero, pa.titulo AS pasta_titulo
         FROM prazos_processo pp
         JOIN processo pr ON pp.processo_id = pr.id
         JOIN pasta pa ON pr.pasta_id = pa.id
         WHERE pp.data_vencimento = ? AND pp.status != 'concluido'
           AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)`,
        [hoje, userId]
      ),

      // Prazos atrasados (vencidos e não concluídos)
      pool.execute(
        `SELECT pp.id, pp.descricao, pp.data_vencimento, pp.status,
                pr.numero AS processo_numero, pa.titulo AS pasta_titulo,
                DATEDIFF(CURDATE(), pp.data_vencimento) AS dias_atraso
         FROM prazos_processo pp
         JOIN processo pr ON pp.processo_id = pr.id
         JOIN pasta pa ON pr.pasta_id = pa.id
         WHERE pp.data_vencimento < ? AND pp.status != 'concluido'
           AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)
         ORDER BY pp.data_vencimento ASC`,
        [hoje, userId]
      ),

      // Tarefas pendentes (sem data ou com data futura)
      pool.execute(
        `SELECT t.id, t.titulo, t.prioridade, t.data_vencimento
         FROM tarefas t
         WHERE t.concluida = 0
           AND (t.data_vencimento IS NULL OR t.data_vencimento >= ?)
           AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)
         ORDER BY FIELD(t.prioridade,'urgente','normal','baixa'), t.data_vencimento ASC`,
        [hoje, userId]
      ),

      // Tarefas atrasadas
      pool.execute(
        `SELECT t.id, t.titulo, t.prioridade, t.data_vencimento,
                DATEDIFF(CURDATE(), t.data_vencimento) AS dias_atraso
         FROM tarefas t
         WHERE t.concluida = 0
           AND t.data_vencimento < ?
           AND (t.atribuida_para = ? OR t.atribuida_para IS NULL)
         ORDER BY t.data_vencimento ASC`,
        [hoje, userId]
      ),

      // Audiências de hoje
      pool.execute(
        `SELECT a.id, a.data, a.hora, a.modalidade, a.local,
                ta.nome AS tipo, pr.numero AS processo_numero,
                pa.titulo AS pasta_titulo
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN processo pr ON a.processo_id = pr.id
         JOIN pasta pa ON pr.pasta_id = pa.id
         WHERE a.data = ?
         ORDER BY a.hora ASC`,
        [hoje]
      ),

      // Audiências de amanhã
      pool.execute(
        `SELECT a.id, a.data, a.hora, a.modalidade,
                ta.nome AS tipo, pr.numero AS processo_numero
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN processo pr ON a.processo_id = pr.id
         WHERE a.data = ?
         ORDER BY a.hora ASC`,
        [amanha]
      ),

      // Perícias de hoje
      pool.execute(
        `SELECT p.id, p.data, p.hora, p.local,
                tp.nome AS tipo, pr.numero AS processo_numero
         FROM pericia p
         LEFT JOIN tipo_pericia tp ON p.tipo_pericia_id = tp.id
         JOIN processo pr ON p.processo_id = pr.id
         WHERE p.data = ?`,
        [hoje]
      ),

      // Perícias de amanhã
      pool.execute(
        `SELECT p.id, p.data, p.hora,
                tp.nome AS tipo, pr.numero AS processo_numero
         FROM pericia p
         LEFT JOIN tipo_pericia tp ON p.tipo_pericia_id = tp.id
         JOIN processo pr ON p.processo_id = pr.id
         WHERE p.data = ?`,
        [amanha]
      ),

      // Audiências sem ata (já ocorreram e não têm ata nem foram marcadas como impressas)
      pool.execute(
        `SELECT a.id, a.data, a.hora, ta.nome AS tipo,
                pr.numero AS processo_numero, pa.titulo AS pasta_titulo,
                LPAD(pa.numero, 4, '0') AS pasta_numero_fmt
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN processo pr ON a.processo_id = pr.id
         JOIN pasta pa ON pr.pasta_id = pa.id
         WHERE a.data < CURDATE()
           AND a.ata_impressa = 0
           AND NOT EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)
         ORDER BY a.data DESC`
      ),

      // Processos sem movimentação há X dias (configurável)
      pool.execute(
        `SELECT pr.id, pr.numero, pa.titulo AS pasta_titulo,
                LPAD(pa.numero, 4, '0') AS pasta_numero_fmt,
                COALESCE(
                  (SELECT MAX(ap.data) FROM andamento_processual ap WHERE ap.processo_id = pr.id),
                  DATE(pr.criado_em)
                ) AS ultima_movimentacao,
                DATEDIFF(CURDATE(), COALESCE(
                  (SELECT MAX(ap.data) FROM andamento_processual ap WHERE ap.processo_id = pr.id),
                  DATE(pr.criado_em)
                )) AS dias_sem_movimentacao
         FROM processo pr
         JOIN pasta pa ON pr.pasta_id = pa.id
         WHERE DATEDIFF(CURDATE(), COALESCE(
           (SELECT MAX(ap.data) FROM andamento_processual ap WHERE ap.processo_id = pr.id),
           DATE(pr.criado_em)
         )) >= (SELECT COALESCE(dias_sem_movimentacao, 30) FROM configuracoes_escritorio LIMIT 1)
         ORDER BY dias_sem_movimentacao DESC
         LIMIT 20`
      ),
    ]);

    return sucesso(res, {
      prazos_hoje:             prazosHoje[0],
      prazos_atrasados:        prazosAtrasados[0],
      tarefas_pendentes:       tarefasPendentes[0],
      tarefas_atrasadas:       tarefasAtrasadas[0],
      audiencias_hoje:         audienciasHoje[0],
      audiencias_amanha:       audienciasAmanha[0],
      pericias_hoje:           periciasHoje[0],
      pericias_amanha:         periciasAmanha[0],
      audiencias_sem_ata:      audienciasSemAta[0],
      processos_sem_movimentacao: processosSemMovimentacao[0],

      // Contadores para o sino (sem dados detalhados)
      contadores: {
        prazos_hoje:       prazosHoje[0].length,
        prazos_atrasados:  prazosAtrasados[0].length,
        tarefas_pendentes: tarefasPendentes[0].length,
        tarefas_atrasadas: tarefasAtrasadas[0].length,
        audiencias_hoje:   audienciasHoje[0].length,
        pericias_hoje:     periciasHoje[0].length,
        sem_ata:           audienciasSemAta[0].length,
      },
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { buscarDados };
