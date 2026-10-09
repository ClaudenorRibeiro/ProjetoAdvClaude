// Avisos aos clientes — módulo Parabéns de aniversário (só clientes pessoa física ativos com data de nascimento).
const { pool } = require('../../config/database');
const { SUB_CLIENTES_PF, PROX_ANIV } = require('../../controllers/pessoasController');
const { montarMensagemParabens, ASSUNTO_PARABENS } = require('../../utils/mensagemParabens');

// Clientes que fazem aniversário de hoje até hoje + "dias" e ainda não foram parabenizados neste ano.
async function aniversariantes(dias) {
  const [rows] = await pool.execute(
    `SELECT pf.id, pf.nome, DATE_FORMAT(${PROX_ANIV}, '%Y-%m-%d') AS data_evento
       FROM pessoas_fisicas pf
      WHERE pf.ativo = 1 AND pf.data_nascimento IS NOT NULL AND pf.id IN (${SUB_CLIENTES_PF})
        AND ${PROX_ANIV} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        AND NOT EXISTS (SELECT 1 FROM parabens_enviados pe WHERE pe.pessoa_id = pf.id AND pe.ano = YEAR(${PROX_ANIV}))`,
    [dias]
  );
  return rows;
}

function textoParabens(nome, cfg) {
  return { assunto: ASSUNTO_PARABENS, texto: montarMensagemParabens(cfg.mensagemAniversario, nome, cfg.escritorio) };
}

// Aviso pendente de quem foi parabenizado na mão (botão do aniversariante) ou deixou de ser cliente ativo: não vale mais.
async function limparObsoletos() {
  await pool.execute(
    `UPDATE avisos_cliente av JOIN parabens_enviados pe ON pe.pessoa_id = av.pessoa_fisica_id AND pe.ano = YEAR(av.data_evento)
        SET av.status = 'enviado', av.modo = 'manual', av.motivo_status = 'Parabéns já enviado pelo botão manual', av.decidido_em = NOW()
      WHERE av.modulo = 'parabens' AND av.status = 'pendente'`);
  await pool.execute(
    `UPDATE avisos_cliente av JOIN pessoas_fisicas pf ON pf.id = av.pessoa_fisica_id
        SET av.status = 'cancelado', av.modo = 'automatico', av.motivo_status = 'O cliente deixou de estar ativo ou sem data de nascimento', av.decidido_em = NOW()
      WHERE av.modulo = 'parabens' AND av.status = 'pendente'
        AND (pf.ativo <> 1 OR pf.data_nascimento IS NULL OR pf.id NOT IN (${SUB_CLIENTES_PF}))`);
}

module.exports = { modulo: 'parabens', aniversariantes, textoParabens, limparObsoletos };
