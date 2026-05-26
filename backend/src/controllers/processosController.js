// ============================================================
// CONTROLLER DE PASTAS E PROCESSOS — Novo modelo
// Estrutura: tblPasta → tblProc → tblTituloProcAutor + tblTituloProcReu
// Tabelas auxiliares: tblForum, tblVara, tblTipoProc, tblStatusProc, tblInstanciaProc
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// ============================================================
// PASTAS
// ============================================================

// GET /api/processos/sugerir-pasta
// Retorna o menor numPasta disponível na sequência (gap-finding)
// Ex: se existem 1,2,3,4,6,7 → retorna 5
async function sugerirNumeroPasta(req, res) {
  try {
    const [rows] = await pool.execute(`
      SELECT IFNULL(
        (SELECT MIN(t1.numPasta + 1)
         FROM tblPasta t1
         LEFT JOIN tblPasta t2 ON t2.numPasta = t1.numPasta + 1
         WHERE t2.numPasta IS NULL),
        1
      ) AS proximo
    `);
    return sucesso(res, { proximo: rows[0].proximo });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/processos/pastas — Lista pastas com resumo do processo mais recente
async function listarPastas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20 } = req.query;
    const limitInt  = parseInt(limite) || 20;
    const offsetInt = (parseInt(pagina) - 1) * limitInt;
    const params = [];
    let where = 'WHERE 1=1';

    if (busca) {
      // Busca por número da pasta ou pelo título (NomeTituloProc) ou número CNJ
      where += ` AND (
        LPAD(pa.numPasta, 4, '0') LIKE ?
        OR EXISTS (SELECT 1 FROM tblProc p WHERE p.pasta_id = pa.id AND p.ativo=1
                   AND (p.NomeTituloProc LIKE ? OR p.numProc LIKE ?))
      )`;
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    const [rows] = await pool.execute(
      `SELECT
         pa.id,
         pa.numPasta,
         pa.criado_em,
         (SELECT pr.NomeTituloProc
          FROM tblProc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS titulo_proc,
         (SELECT pr.numProc
          FROM tblProc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS num_proc,
         (SELECT tp.nome
          FROM tblProc pr JOIN tblTipoProc tp ON tp.id = pr.tipo_id
          WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS tipo_nome,
         (SELECT sp.nome
          FROM tblProc pr JOIN tblStatusProc sp ON sp.id = pr.status_id
          WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS status_nome,
         (SELECT COUNT(*) FROM tblProc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1) AS total_processos
       FROM tblPasta pa
       ${where}
       ORDER BY pa.numPasta DESC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tblPasta pa ${where}`,
      params
    );

    return sucesso(res, { registros: rows, total: totalRows[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/processos/pastas/:id — Pasta completa com todos os processos, autores e réus
async function buscarPasta(req, res) {
  try {
    const { id } = req.params;

    const [pastas] = await pool.execute('SELECT * FROM tblPasta WHERE id = ?', [id]);
    if (!pastas.length) return naoEncontrado(res, 'Pasta não encontrada');

    // Busca todos os processos da pasta com informações completas
    const [processos] = await pool.execute(
      `SELECT
         pr.*,
         v.nome AS vara_nome, v.codVaraNoProc,
         f.nome AS forum_nome, f.id AS forum_id,
         tp.nome AS tipo_nome,
         sp.nome AS status_nome,
         inst.nome AS instancia_nome
       FROM tblProc pr
       LEFT JOIN tblVara v         ON pr.vara_id     = v.id
       LEFT JOIN tblForum f        ON v.forum_id     = f.id
       LEFT JOIN tblTipoProc tp    ON pr.tipo_id     = tp.id
       LEFT JOIN tblStatusProc sp  ON pr.status_id   = sp.id
       LEFT JOIN tblInstanciaProc inst ON pr.instancia_id = inst.id
       WHERE pr.pasta_id = ? AND pr.ativo = 1
       ORDER BY pr.id DESC`,
      [id]
    );

    // Para cada processo, busca autores e réus em paralelo
    for (const proc of processos) {
      const [autores, reus] = await Promise.all([
        pool.execute(
          `SELECT ta.id, ta.tipo_pessoa, ta.pessoa_id,
                  CASE ta.tipo_pessoa
                    WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = ta.pessoa_id)
                    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ta.pessoa_id)
                  END AS nome
           FROM tblTituloProcAutor ta WHERE ta.proc_id = ?`,
          [proc.id]
        ),
        pool.execute(
          `SELECT tr.id, tr.tipo_pessoa, tr.pessoa_id,
                  CASE tr.tipo_pessoa
                    WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = tr.pessoa_id)
                    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = tr.pessoa_id)
                  END AS nome
           FROM tblTituloProcReu tr WHERE tr.proc_id = ?`,
          [proc.id]
        ),
      ]);
      proc.autores = autores[0];
      proc.reus    = reus[0];
    }

    return sucesso(res, { ...pastas[0], processos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// PROCESSOS
// ============================================================

// POST /api/processos — Cria processo (e pasta se não houver pasta_id)
// Body: { pasta_id?, numPasta?, numProc, NomeTituloProc,
//         vara_id, tipo_id, status_id, instancia_id,
//         data_distribuicao, observacoes,
//         autores: [{tipo_pessoa, pessoa_id}],
//         reus:    [{tipo_pessoa, pessoa_id}] }
async function criarProcesso(req, res) {
  const {
    pasta_id,
    numPasta,
    numProc,
    NomeTituloProc,
    vara_id, tipo_id, status_id, instancia_id,
    data_distribuicao,
    observacoes,
    autores = [],
    reus    = [],
  } = req.body;

  if (!NomeTituloProc) return erro(res, 'Título do processo é obrigatório');
  if (autores.length === 0) return erro(res, 'Inclua ao menos um autor no polo ativo');
  if (reus.length === 0)    return erro(res, 'Inclua ao menos um réu no polo passivo');
  if (!pasta_id && !numPasta) return erro(res, 'Número da pasta é obrigatório');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let pastaId = pasta_id ? parseInt(pasta_id) : null;

    // Se não tem pasta_id, cria ou reutiliza pasta pelo numPasta
    if (!pastaId) {
      const num = parseInt(numPasta);
      if (!num || num < 1) {
        await conn.rollback();
        return erro(res, 'Número da pasta deve ser um inteiro positivo');
      }
      // SELECT FOR UPDATE garante que nenhuma outra requisição simultânea use o mesmo número
      const [existente] = await conn.execute(
        'SELECT id FROM tblPasta WHERE numPasta = ? FOR UPDATE',
        [num]
      );
      if (existente.length) {
        // Pasta já existe com este número (carta precatória, recurso, etc.)
        pastaId = existente[0].id;
      } else {
        const [pastaResult] = await conn.execute(
          'INSERT INTO tblPasta (numPasta, criado_por) VALUES (?, ?)',
          [num, req.usuario.id]
        );
        pastaId = pastaResult.insertId;
      }
    }

    // Cria o processo
    const [procResult] = await conn.execute(
      `INSERT INTO tblProc
         (pasta_id, numProc, NomeTituloProc, vara_id, tipo_id, status_id, instancia_id,
          data_distribuicao, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pastaId,
       numProc          || null,
       NomeTituloProc,
       vara_id          || null,
       tipo_id          || null,
       status_id        || null,
       instancia_id     || null,
       data_distribuicao || null,
       observacoes      || null,
       req.usuario.id]
    );
    const procId = procResult.insertId;

    // Insere autores (polo ativo)
    for (const autor of autores) {
      await conn.execute(
        'INSERT INTO tblTituloProcAutor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
        [procId, autor.tipo_pessoa, autor.pessoa_id, req.usuario.id]
      );
    }

    // Insere réus (polo passivo)
    for (const reu of reus) {
      await conn.execute(
        'INSERT INTO tblTituloProcReu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
        [procId, reu.tipo_pessoa, reu.pessoa_id, req.usuario.id]
      );
    }

    await conn.commit();
    await auditoria.registrar(req.usuario.id, 'tblProc', 'criar', procId);
    return sucesso(res, { id: procId, pasta_id: pastaId }, 'Processo criado com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release(); // SEMPRE devolve ao pool
  }
}

// PUT /api/processos/:id — Atualiza processo
async function atualizarProcesso(req, res) {
  const { id } = req.params;
  const {
    numProc, NomeTituloProc,
    vara_id, tipo_id, status_id, instancia_id,
    data_distribuicao, observacoes,
    autores, reus,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [antes] = await conn.execute('SELECT * FROM tblProc WHERE id = ? AND ativo = 1', [id]);
    if (!antes.length) {
      await conn.rollback();
      return naoEncontrado(res, 'Processo não encontrado');
    }

    await conn.execute(
      `UPDATE tblProc SET
         numProc=?, NomeTituloProc=?,
         vara_id=?, tipo_id=?, status_id=?, instancia_id=?,
         data_distribuicao=?, observacoes=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [numProc          || null,
       NomeTituloProc   || antes[0].NomeTituloProc,
       vara_id          || null,
       tipo_id          || null,
       status_id        || null,
       instancia_id     || null,
       data_distribuicao || null,
       observacoes      || null,
       req.usuario.id,
       id]
    );

    // Substitui partes se enviadas
    if (autores !== undefined) {
      await conn.execute('DELETE FROM tblTituloProcAutor WHERE proc_id = ?', [id]);
      for (const autor of autores) {
        await conn.execute(
          'INSERT INTO tblTituloProcAutor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
          [id, autor.tipo_pessoa, autor.pessoa_id, req.usuario.id]
        );
      }
    }
    if (reus !== undefined) {
      await conn.execute('DELETE FROM tblTituloProcReu WHERE proc_id = ?', [id]);
      for (const reu of reus) {
        await conn.execute(
          'INSERT INTO tblTituloProcReu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
          [id, reu.tipo_pessoa, reu.pessoa_id, req.usuario.id]
        );
      }
    }

    await conn.commit();
    await auditoria.registrar(req.usuario.id, 'tblProc', 'editar', id, antes[0]);
    return sucesso(res, null, 'Processo atualizado com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// AUXILIARES
// ============================================================

// GET /api/processos/auxiliares — Dados para selects do formulário
async function buscarAuxiliares(req, res) {
  try {
    const [foruns, varas, tipos, status, instancias, usuarios] = await Promise.all([
      pool.execute('SELECT * FROM tblForum WHERE ativo=1 ORDER BY nome'),
      pool.execute(`SELECT v.*, f.nome AS forum_nome
                    FROM tblVara v JOIN tblForum f ON v.forum_id = f.id
                    WHERE v.ativo=1 ORDER BY f.nome, v.nome`),
      pool.execute('SELECT * FROM tblTipoProc WHERE ativo=1 ORDER BY nome'),
      pool.execute('SELECT * FROM tblStatusProc WHERE ativo=1 ORDER BY nome'),
      pool.execute('SELECT * FROM tblInstanciaProc WHERE ativo=1 ORDER BY nome'),
      pool.execute('SELECT id, nome, tipo FROM usuarios WHERE ativo=1 AND nivel > 0 ORDER BY nome'),
    ]);

    return sucesso(res, {
      foruns:    foruns[0],
      varas:     varas[0],
      tipos:     tipos[0],
      status:    status[0],
      instancias: instancias[0],
      usuarios:  usuarios[0],
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/foruns (admin)
async function criarForum(req, res) {
  try {
    const { nome, cidade, estado } = req.body;
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      'INSERT INTO tblForum (nome, cidade, estado, criado_por) VALUES (?, ?, ?, ?)',
      [nome.trim(), cidade?.trim() || null, estado?.toUpperCase().slice(0, 2) || null, req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Fórum criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/varas (admin)
async function criarVara(req, res) {
  try {
    const { nome, forum_id, codVaraNoProc } = req.body;
    if (!nome || !forum_id) return erro(res, 'Nome e fórum são obrigatórios');
    const [r] = await pool.execute(
      'INSERT INTO tblVara (nome, forum_id, codVaraNoProc, criado_por) VALUES (?, ?, ?, ?)',
      [nome.trim(), forum_id, codVaraNoProc?.trim() || null, req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Vara criada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/tipos (admin)
async function criarTipo(req, res) {
  try {
    const { nome } = req.body;
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      'INSERT INTO tblTipoProc (nome, criado_por) VALUES (?, ?)',
      [nome.trim(), req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Tipo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/status (admin)
async function criarStatusProc(req, res) {
  try {
    const { nome } = req.body;
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      'INSERT INTO tblStatusProc (nome, criado_por) VALUES (?, ?)',
      [nome.trim(), req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Status criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/instancias (admin)
async function criarInstancia(req, res) {
  try {
    const { nome } = req.body;
    if (!nome) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      'INSERT INTO tblInstanciaProc (nome, criado_por) VALUES (?, ?)',
      [nome.trim(), req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Instância criada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  sugerirNumeroPasta,
  listarPastas,
  buscarPasta,
  criarProcesso,
  atualizarProcesso,
  buscarAuxiliares,
  criarForum,
  criarVara,
  criarTipo,
  criarStatusProc,
  criarInstancia,
};
