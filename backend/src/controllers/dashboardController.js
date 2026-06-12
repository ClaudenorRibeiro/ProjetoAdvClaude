// ============================================================
// CONTROLLER DO DASHBOARD
// Retorna todos os cards da tela principal em uma única chamada
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erroInterno } = require('../utils/response');
const { hojeBrasilia } = require('../utils/helpers');

// GET /api/dashboard — Retorna todos os dados do dashboard
async function buscarDados(req, res) {
  try {
    const userId = req.usuario.id;
    const hoje = hojeBrasilia();
    const amanha = hojeBrasilia(1);

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
      audienciasSemAdvogado,
      processosSemMovimentacao,
    ] = await Promise.all([

      // Prazos que vencem hoje
      pool.execute(
        `SELECT pp.id, pp.descricao, pp.data_vencimento, pp.status,
                pr.id AS processo_id, pr.numProc AS processo_numero, pr.NomeTituloProc AS pasta_titulo,
                pa.id AS pasta_id
         FROM prazos_processo pp
         JOIN tblProc pr  ON pp.processo_id = pr.id
         JOIN tblPasta pa ON pr.pasta_id = pa.id
         WHERE pp.data_vencimento = ? AND pp.status NOT IN ('concluido','cancelado')
           AND (pp.delegado_para = ? OR pp.delegado_para IS NULL)`,
        [hoje, userId]
      ),

      // Prazos atrasados (vencidos e não concluídos)
      pool.execute(
        `SELECT pp.id, pp.descricao, pp.data_vencimento, pp.status,
                pr.id AS processo_id, pr.numProc AS processo_numero, pr.NomeTituloProc AS pasta_titulo,
                pa.id AS pasta_id,
                DATEDIFF(CURDATE(), pp.data_vencimento) AS dias_atraso
         FROM prazos_processo pp
         JOIN tblProc pr  ON pp.processo_id = pr.id
         JOIN tblPasta pa ON pr.pasta_id = pa.id
         WHERE pp.data_vencimento < ? AND pp.status NOT IN ('concluido','cancelado')
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
                ta.nome AS tipo, pr.numProc AS processo_numero,
                pr.NomeTituloProc AS pasta_titulo,
                pr.pasta_id
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN tblProc pr ON a.processo_id = pr.id
         WHERE a.data = ?
         ORDER BY a.hora ASC`,
        [hoje]
      ),

      // Audiências de amanhã
      pool.execute(
        `SELECT a.id, a.data, a.hora, a.modalidade,
                ta.nome AS tipo, pr.numProc AS processo_numero,
                pr.pasta_id
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN tblProc pr ON a.processo_id = pr.id
         WHERE a.data = ?
         ORDER BY a.hora ASC`,
        [amanha]
      ),

      // Perícias de hoje
      pool.execute(
        `SELECT p.id, p.data, p.hora, p.local,
                tp.nome AS tipo, pr.numProc AS processo_numero
         FROM pericia p
         LEFT JOIN tipo_pericia tp ON p.tipo_pericia_id = tp.id
         JOIN tblProc pr ON p.processo_id = pr.id
         WHERE p.data = ?`,
        [hoje]
      ),

      // Perícias de amanhã
      pool.execute(
        `SELECT p.id, p.data, p.hora,
                tp.nome AS tipo, pr.numProc AS processo_numero
         FROM pericia p
         LEFT JOIN tipo_pericia tp ON p.tipo_pericia_id = tp.id
         JOIN tblProc pr ON p.processo_id = pr.id
         WHERE p.data = ?`,
        [amanha]
      ),

      // Audiências sem ata (já ocorreram e não têm ata nem foram marcadas como impressas)
      pool.execute(
        `SELECT a.id, a.data, a.hora, ta.nome AS tipo,
                pr.numProc AS processo_numero, pr.NomeTituloProc AS pasta_titulo,
                LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN tblProc pr ON a.processo_id = pr.id
         JOIN tblPasta pa ON pr.pasta_id = pa.id
         WHERE a.data < CURDATE()
           AND a.ata_impressa = 0
           AND NOT EXISTS (SELECT 1 FROM ata_audiencia aa WHERE aa.audiencia_id = a.id)
         ORDER BY a.data DESC`
      ),

      // Audiências sem advogado definido nos próximos X dias (configurável)
      pool.execute(
        `SELECT a.id, a.data, a.hora, ta.nome AS tipo,
                pr.numProc AS processo_numero, pr.NomeTituloProc AS pasta_titulo,
                LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
                DATEDIFF(a.data, CURDATE()) AS dias_para_audiencia
         FROM audiencia a
         LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         JOIN tblProc pr ON a.processo_id = pr.id
         JOIN tblPasta pa ON pr.pasta_id = pa.id
         WHERE a.status NOT IN ('cancelada', 'remarcada')
           AND a.data >= CURDATE()
           AND a.responsavel_id IS NULL AND a.responsavel_freela_id IS NULL
           AND DATEDIFF(a.data, CURDATE()) <= (
             SELECT COALESCE(dias_audiencia_sem_adv, 7) FROM configuracoes_escritorio LIMIT 1
           )
         ORDER BY a.data ASC`
      ),

      // Processos sem movimentação há X dias (configurável)
      pool.execute(
        `SELECT pr.id, pr.numProc AS numero, pr.NomeTituloProc AS pasta_titulo,
                LPAD(pa.numPasta, 4, '0') AS pasta_numero_fmt,
                COALESCE(
                  (SELECT MAX(ap.data) FROM andamento_processual ap WHERE ap.processo_id = pr.id),
                  DATE(pr.criado_em)
                ) AS ultima_movimentacao,
                DATEDIFF(CURDATE(), COALESCE(
                  (SELECT MAX(ap.data) FROM andamento_processual ap WHERE ap.processo_id = pr.id),
                  DATE(pr.criado_em)
                )) AS dias_sem_movimentacao
         FROM tblProc pr
         JOIN tblPasta pa ON pr.pasta_id = pa.id
         WHERE pr.ativo = 1
           AND DATEDIFF(CURDATE(), COALESCE(
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
      audiencias_sem_ata:        audienciasSemAta[0],
      audiencias_sem_advogado:   audienciasSemAdvogado[0],
      processos_sem_movimentacao: processosSemMovimentacao[0],

      // Contadores para o sino (sem dados detalhados)
      contadores: {
        prazos_hoje:       prazosHoje[0].length,
        prazos_atrasados:  prazosAtrasados[0].length,
        tarefas_pendentes: tarefasPendentes[0].length,
        tarefas_atrasadas: tarefasAtrasadas[0].length,
        audiencias_hoje:   audienciasHoje[0].length,
        pericias_hoje:     periciasHoje[0].length,
        sem_ata:              audienciasSemAta[0].length,
        audiencias_sem_adv:   audienciasSemAdvogado[0].length,
      },
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { buscarDados };
