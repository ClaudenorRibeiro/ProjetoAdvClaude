// ============================================================
// "NOVIDADES DOS PROCESSOS": os andamentos do DataJud que chegaram nos últimos 7 dias, dos processos que a pessoa
// acompanha (o escopo que o administrador escolheu para ela: os meus ou todos) e, se o escritório quis, só dos tipos
// importantes. É para onde o sino leva. Agrupado por processo, do mais recente ao mais antigo (até 200 processos).
// ============================================================
const { pool } = require('../config/database');
const { sucesso, erroInterno } = require('../utils/response');

const DIAS = 7;
const LIMITE_DE_PROCESSOS = 200;

// GET /api/andamentos/novidades
async function novidades(req, res) {
  try {
    const eu = req.usuario.id;
    const [[pessoa]] = await pool.execute('SELECT datajud_aviso_escopo AS escopo FROM usuarios WHERE id = ?', [eu]);
    const [cfg] = await pool.execute('SELECT datajud_aviso_modo AS modo FROM configuracoes_escritorio LIMIT 1');
    const todos = !pessoa || pessoa.escopo === 'todos';
    const soImportantes = !!cfg[0] && cfg[0].modo === 'importantes';
    const [linhas] = await pool.execute(
      `SELECT a.id, a.processo_id, DATE_FORMAT(a.data, '%Y-%m-%d') AS data, a.descricao,
              pa.id AS pasta_id, pa.numPasta, p.numProc AS numero, p.NomeTituloProc AS titulo
         FROM andamento_processual a
         JOIN tblproc p ON p.id = a.processo_id
         JOIN tblpasta pa ON pa.id = p.pasta_id
        WHERE a.fonte = 'datajud'
          AND a.novidade_em >= DATE_SUB(NOW(), INTERVAL ${DIAS} DAY)
          ${todos ? '' : `AND (p.responsavel_id = ? OR EXISTS (SELECT 1 FROM processo_oabs po WHERE po.processo_id = p.id AND po.usuario_id = ?))`}
          ${soImportantes ? 'AND EXISTS (SELECT 1 FROM datajud_tipos_andamento t WHERE t.codigo = a.codigo_movimento AND t.importante = 1)' : ''}
        ORDER BY a.novidade_em DESC, a.data DESC, a.id DESC`,
      todos ? [] : [eu, eu]
    );
    const processos = new Map();
    for (const l of linhas) {
      let p = processos.get(l.processo_id);
      if (!p) {
        if (processos.size >= LIMITE_DE_PROCESSOS) continue;
        p = { processo_id: l.processo_id, pasta_id: l.pasta_id, numPasta: l.numPasta, numero: l.numero, titulo: l.titulo, andamentos: [] };
        processos.set(l.processo_id, p);
      }
      p.andamentos.push({ id: l.id, data: l.data, descricao: l.descricao });
    }
    return sucesso(res, { dias: DIAS, processos: [...processos.values()] });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { novidades };
