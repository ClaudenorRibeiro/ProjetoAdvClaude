// ============================================================
// CONTROLLER DE PASTAS E PROCESSOS — Novo modelo
// Estrutura: tblpasta → tblproc → tbltituloprocautor + tbltituloprocreu
// Tabelas auxiliares: tblforum, tblvara, tbltipoproc, tblstatusproc, tblinstanciaproc
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// ============================================================
// PASTAS
// ============================================================

// GET /api/processos/sugerir-pasta
// Retorna o menor numPasta disponível na sequência (gap-finding).
// Pastas vazias (sem processos ativos) são tratadas como disponíveis —
// ao cadastrar um novo processo com esse número, a pasta existente é reaproveitada.
async function sugerirNumeroPasta(req, res) {
  try {
    const [rows] = await pool.execute(`
      SELECT IFNULL(
        (SELECT MIN(t1.numPasta + 1)
         FROM tblpasta t1
         -- t1 precisa ser uma pasta "ocupada" (com processos ativos)
         WHERE EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = t1.id AND p.ativo = 1)
         -- o próximo número não pode ser de uma pasta também "ocupada"
         AND NOT EXISTS (
           SELECT 1 FROM tblpasta t2
           WHERE t2.numPasta = t1.numPasta + 1
           AND EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = t2.id AND p.ativo = 1)
         )),
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

    // Exibe apenas pastas que têm pelo menos um processo ativo
    where += ` AND EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id AND p.ativo = 1)`;

    if (busca) {
      // Versão somente dígitos para comparar CPF, CNPJ e telefone armazenados sem formatação
      const buscaDigitos = busca.replace(/\D/g, '');
      const bL = `%${busca}%`;
      const bD = buscaDigitos.length >= 3 ? `%${buscaDigitos}%` : bL;

      // Busca em: nº pasta, título, nº CNJ, e TODOS os polos (autores e réus, físicos e jurídicos)
      where += ` AND (
        LPAD(pa.numPasta, 4, '0') LIKE ?
        OR EXISTS (
          SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id AND p.ativo = 1
          AND (
            p.NomeTituloProc LIKE ? OR p.numProc LIKE ?
            -- Autores físicos: nome, CPF, telefone
            OR EXISTS (
              SELECT 1 FROM tbltituloprocautor ta
              JOIN pessoas_fisicas pf ON pf.id = ta.pessoa_id AND ta.tipo_pessoa = 'fisica'
              WHERE ta.proc_id = p.id
              AND (pf.nome LIKE ? OR pf.cpf LIKE ?
                   OR EXISTS (SELECT 1 FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.numero LIKE ?))
            )
            -- Autores jurídicos: razão social, nome fantasia, CNPJ, telefone
            OR EXISTS (
              SELECT 1 FROM tbltituloprocautor ta
              JOIN pessoas_juridicas pj ON pj.id = ta.pessoa_id AND ta.tipo_pessoa = 'juridica'
              WHERE ta.proc_id = p.id
              AND (pj.razao_social LIKE ? OR pj.nome_fantasia LIKE ? OR pj.cnpj LIKE ?
                   OR EXISTS (SELECT 1 FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.numero LIKE ?))
            )
            -- Réus físicos: nome, CPF, telefone
            OR EXISTS (
              SELECT 1 FROM tbltituloprocreu tr
              JOIN pessoas_fisicas pf ON pf.id = tr.pessoa_id AND tr.tipo_pessoa = 'fisica'
              WHERE tr.proc_id = p.id
              AND (pf.nome LIKE ? OR pf.cpf LIKE ?
                   OR EXISTS (SELECT 1 FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.numero LIKE ?))
            )
            -- Réus jurídicos: razão social, nome fantasia, CNPJ, telefone
            OR EXISTS (
              SELECT 1 FROM tbltituloprocreu tr
              JOIN pessoas_juridicas pj ON pj.id = tr.pessoa_id AND tr.tipo_pessoa = 'juridica'
              WHERE tr.proc_id = p.id
              AND (pj.razao_social LIKE ? OR pj.nome_fantasia LIKE ? OR pj.cnpj LIKE ?
                   OR EXISTS (SELECT 1 FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.numero LIKE ?))
            )
          )
        )
      )`;
      params.push(
        bL,              // nº pasta
        bL, bL,          // NomeTituloProc, numProc
        bL, bD, bD,      // autor físico:   nome, cpf, telefone
        bL, bL, bD, bD,  // autor jurídico: razao_social, nome_fantasia, cnpj, telefone
        bL, bD, bD,      // réu físico:     nome, cpf, telefone
        bL, bL, bD, bD   // réu jurídico:   razao_social, nome_fantasia, cnpj, telefone
      );
    }

    const [rows] = await pool.execute(
      `SELECT
         pa.id,
         pa.numPasta,
         pa.criado_em,
         (SELECT pr.NomeTituloProc
          FROM tblproc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS titulo_proc,
         (SELECT pr.numProc
          FROM tblproc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
          ORDER BY pr.id DESC LIMIT 1) AS num_proc,
         -- Tipo: exibe o nome somente se TODOS os processos da pasta têm o mesmo tipo
         CASE
           WHEN (SELECT COUNT(DISTINCT pr.tipo_id)
                 FROM tblproc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
                 AND pr.tipo_id IS NOT NULL) = 1
           THEN (SELECT tp.nome FROM tblproc pr
                 JOIN tbltipoproc tp ON tp.id = pr.tipo_id
                 WHERE pr.pasta_id = pa.id AND pr.ativo = 1
                 AND pr.tipo_id IS NOT NULL LIMIT 1)
           ELSE NULL
         END AS tipo_nome,
         -- Status: exibe o nome somente se TODOS os processos da pasta têm o mesmo status
         CASE
           WHEN (SELECT COUNT(DISTINCT pr.status_id)
                 FROM tblproc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1
                 AND pr.status_id IS NOT NULL) = 1
           THEN (SELECT sp.nome FROM tblproc pr
                 JOIN tblstatusproc sp ON sp.id = pr.status_id
                 WHERE pr.pasta_id = pa.id AND pr.ativo = 1
                 AND pr.status_id IS NOT NULL LIMIT 1)
           ELSE NULL
         END AS status_nome,
         (SELECT COUNT(*) FROM tblproc pr WHERE pr.pasta_id = pa.id AND pr.ativo = 1) AS total_processos
       FROM tblpasta pa
       ${where}
       ORDER BY pa.numPasta DESC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tblpasta pa ${where}`,
      params
    );

    return sucesso(res, { registros: rows, total: totalRows[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/processos/pastas/:id/renumerar — Altera o numPasta de uma pasta.
// O número escolhido precisa estar LIVRE: se já pertencer a qualquer outra pasta,
// a troca é recusada com mensagem explicativa. O sistema nunca apaga uma pasta aqui
// (o banco já tem UNIQUE em numPasta — duas pastas jamais dividem um número).
async function renumerarPasta(req, res) {
  const { id } = req.params;
  const num = parseInt(req.body.numPasta);
  if (!num || num < 1) return erro(res, 'Número de pasta inválido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pasta] = await conn.execute('SELECT id, numPasta FROM tblpasta WHERE id = ?', [id]);
    if (!pasta.length) { await conn.rollback(); return naoEncontrado(res, 'Pasta não encontrada'); }
    if (pasta[0].numPasta === num) { await conn.rollback(); return erro(res, 'A pasta já possui este número'); }

    // O número precisa estar livre — tanto faz se a outra pasta tem processos ou não.
    const [existente] = await conn.execute('SELECT id FROM tblpasta WHERE numPasta = ? AND id != ?', [num, id]);
    if (existente.length) {
      await conn.rollback();
      return erro(res,
        `O número ${String(num).padStart(4,'0')} já pertence a outra pasta. ` +
        `Escolha um número que não esteja em uso.`
      );
    }

    // Renumera a pasta
    await conn.execute('UPDATE tblpasta SET numPasta = ? WHERE id = ?', [num, id]);

    // Auditoria na MESMA transação (tudo ou nada): antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'tblpasta', 'renumerar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, { numPasta: num }, 'Número da pasta atualizado com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/processos/pastas/:id — Pasta completa com todos os processos, autores e réus
async function buscarPasta(req, res) {
  try {
    const { id } = req.params;

    const [pastas] = await pool.execute('SELECT * FROM tblpasta WHERE id = ?', [id]);
    if (!pastas.length) return naoEncontrado(res, 'Pasta não encontrada');

    // Busca todos os processos da pasta com informações completas
    const [processos] = await pool.execute(
      `SELECT
         pr.*,
         v.nome AS vara_nome, v.abrev_nome AS vara_abrev_nome,
         v.codVaraNoProc, v.compl_end AS vara_compl_end,
         v.tel AS vara_tel, v.email AS vara_email,
         f.nome AS forum_nome, f.abrev_nome AS forum_abrev_nome,
         f.id AS forum_id, f.cidade AS forum_cidade, f.uf AS forum_uf,
         tp.nome AS tipo_nome,
         sp.nome AS status_nome,
         inst.nome AS instancia_nome
       FROM tblproc pr
       LEFT JOIN tblvara v         ON pr.vara_id     = v.id
       LEFT JOIN tblforum f        ON v.forum_id     = f.id
       LEFT JOIN tbltipoproc tp    ON pr.tipo_id     = tp.id
       LEFT JOIN tblstatusproc sp  ON pr.status_id   = sp.id
       LEFT JOIN tblinstanciaproc inst ON pr.instancia_id = inst.id
       WHERE pr.pasta_id = ? AND pr.ativo = 1
       ORDER BY pr.id DESC`,
      [id]
    );

    // Para cada processo, busca autores e réus em paralelo
    for (const proc of processos) {
      const [autores, reus, peritos] = await Promise.all([
        pool.execute(
          `SELECT ta.id, ta.tipo_pessoa, ta.pessoa_id,
                  CASE ta.tipo_pessoa
                    WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = ta.pessoa_id)
                    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ta.pessoa_id)
                  END AS nome
           FROM tbltituloprocautor ta WHERE ta.proc_id = ?`,
          [proc.id]
        ),
        pool.execute(
          `SELECT tr.id, tr.tipo_pessoa, tr.pessoa_id,
                  CASE tr.tipo_pessoa
                    WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = tr.pessoa_id)
                    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = tr.pessoa_id)
                  END AS nome
           FROM tbltituloprocreu tr WHERE tr.proc_id = ?`,
          [proc.id]
        ),
        pool.execute(
          `SELECT pp.id, pp.tipo_pessoa, pp.pessoa_id,
                  CASE pp.tipo_pessoa
                    WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = pp.pessoa_id)
                    WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = pp.pessoa_id)
                  END AS nome
           FROM processo_perito pp WHERE pp.proc_id = ?`,
          [proc.id]
        ),
      ]);
      proc.autores = autores[0];
      proc.reus    = reus[0];
      proc.peritos = peritos[0];
    }

    return sucesso(res, { ...pastas[0], processos });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/processos/pastas/checar?numPasta=42
// Checagem SOMENTE LEITURA (sem transação): informa se a pasta já existe e
// quantos processos ATIVOS possui. Usada no cadastro de processo para avisar
// antes de anexar um novo processo a uma pasta que já está em uso.
async function checarPasta(req, res) {
  try {
    const num = parseInt(req.query.numPasta);
    if (!num || num < 1) return sucesso(res, { emUso: false });

    const [pastas] = await pool.execute(
      'SELECT id FROM tblpasta WHERE numPasta = ?',
      [num]
    );
    if (!pastas.length) return sucesso(res, { emUso: false });

    const pastaId = pastas[0].id;
    const [contagem] = await pool.execute(
      'SELECT COUNT(*) AS total FROM tblproc WHERE pasta_id = ? AND ativo = 1',
      [pastaId]
    );
    const total = contagem[0].total;
    // Pasta existe mas sem processo ativo (pasta "vazia") = reaproveitável sem aviso
    if (total === 0) return sucesso(res, { emUso: false });

    // Título do processo mais recente da pasta — deixa o aviso informativo
    const [titulo] = await pool.execute(
      'SELECT NomeTituloProc FROM tblproc WHERE pasta_id = ? AND ativo = 1 ORDER BY id DESC LIMIT 1',
      [pastaId]
    );
    return sucesso(res, {
      emUso: true,
      totalProcessos: total,
      titulo: titulo.length ? titulo[0].NomeTituloProc : null,
    });
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
    peritos = [],          // peritos vinculados ao processo (opcional)
    cliente_polo,          // 'autor' ou 'reu' — qual polo é o cliente do escritório
  } = req.body;

  if (!NomeTituloProc) return erro(res, 'Título do processo é obrigatório');
  if (autores.length === 0) return erro(res, 'Inclua ao menos um autor no polo ativo');
  if (reus.length === 0)    return erro(res, 'Inclua ao menos um réu no polo passivo');
  if (!pasta_id && !numPasta) return erro(res, 'Número da pasta é obrigatório');
  // cliente_polo é opcional, mas se vier precisa ser 'autor' ou 'reu'
  if (cliente_polo && !['autor', 'reu'].includes(cliente_polo)) {
    return erro(res, 'Polo do cliente inválido (use "autor" ou "reu")');
  }

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
        'SELECT id FROM tblpasta WHERE numPasta = ? FOR UPDATE',
        [num]
      );
      if (existente.length) {
        // Pasta já existe com este número (carta precatória, recurso, etc.)
        pastaId = existente[0].id;
      } else {
        const [pastaResult] = await conn.execute(
          'INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, ?)',
          [num, req.usuario.id]
        );
        pastaId = pastaResult.insertId;
      }
    }

    // Verifica duplicidade de numProc (ignora null/vazio)
    const numProcLimpo = numProc?.trim() || null;
    if (numProcLimpo) {
      const [duplic] = await conn.execute(
        'SELECT id FROM tblproc WHERE numProc = ? AND ativo = 1 LIMIT 1',
        [numProcLimpo]
      );
      if (duplic.length) {
        await conn.rollback();
        return erro(res, `O número de processo "${numProcLimpo}" já está cadastrado no sistema`);
      }
    }

    // Cria o processo
    const [procResult] = await conn.execute(
      `INSERT INTO tblproc
         (pasta_id, numProc, NomeTituloProc, cliente_polo, vara_id, tipo_id, status_id, instancia_id,
          data_distribuicao, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pastaId,
       numProcLimpo,
       NomeTituloProc,
       cliente_polo     || null,
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
        'INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
        [procId, autor.tipo_pessoa, autor.pessoa_id, req.usuario.id]
      );
    }

    // Insere réus (polo passivo)
    for (const reu of reus) {
      await conn.execute(
        'INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
        [procId, reu.tipo_pessoa, reu.pessoa_id, req.usuario.id]
      );
    }

    // Insere peritos vinculados ao processo (opcional)
    for (const perito of peritos) {
      await conn.execute(
        'INSERT INTO processo_perito (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
        [procId, perito.tipo_pessoa, perito.pessoa_id, req.usuario.id]
      );
    }

    // Auditoria na MESMA transação (tudo ou nada): antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'tblproc', 'criar', procId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: procId, pasta_id: pastaId }, 'Processo criado com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release(); // SEMPRE devolve ao pool
  }
}

// DELETE /api/processos/:id — Exclusão DEFINITIVA do processo (apaga do banco).
// Só exclui a "casca vazia": qualquer trabalho ou dinheiro pendurado no processo
// (as 8 verificações abaixo) bloqueia a exclusão com mensagem explicativa. Um caso
// real — arquivado, com acordo, audiências etc. — nunca passa por aqui.
// Passando na trava, saem junto APENAS os vínculos de autor/réu/perito: essas tabelas
// guardam pessoa_id sem FK para pessoas, então as PESSOAS continuam intactas no
// cadastro, com os demais processos delas.
// A pasta não é apagada — fica totalmente vazia e seu número volta a ser sugerido
// pelo sugerirNumeroPasta. O único rastro é o log de auditoria.
async function excluirProcesso(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      'SELECT id, numProc, NomeTituloProc FROM tblproc WHERE id = ? AND ativo = 1', [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Processo não encontrado'); }
    const proc = rows[0];

    // Verifica dados dependentes que impedem a exclusão.
    // conta_corrente e acordo estão aqui por um motivo crítico: a FK das duas é
    // ON DELETE CASCADE, então sem estas checagens o DELETE abaixo apagaria o
    // financeiro do processo em silêncio.
    const verificacoes = [
      { tabela: 'andamento_processual', coluna: 'processo_id', label: 'andamento(s) processual(is)' },
      { tabela: 'audiencia',            coluna: 'processo_id', label: 'audiência(s)'                 },
      { tabela: 'pericia',              coluna: 'processo_id', label: 'perícia(s)'                   },
      { tabela: 'prazos_processo',      coluna: 'processo_id', label: 'prazo(s)'                     },
      { tabela: 'tarefas',              coluna: 'processo_id', label: 'tarefa(s)'                    },
      { tabela: 'acordo',               coluna: 'processo_id', label: 'acordo(s)/alvará(s) no financeiro' },
      { tabela: 'conta_corrente',       coluna: 'processo_id', label: 'lançamento(s) na conta corrente' },
      { tabela: 'log_comunicacoes',     coluna: 'processo_id', label: 'comunicação(ões) registrada(s)' },
    ];

    const bloqueios = [];
    for (const v of verificacoes) {
      const [[{ total }]] = await conn.execute(
        `SELECT COUNT(*) AS total FROM ${v.tabela} WHERE ${v.coluna} = ?`, [id]
      );
      if (total > 0) bloqueios.push(`${total} ${v.label}`);
    }

    if (bloqueios.length > 0) {
      await conn.rollback();
      return erro(res,
        `Não é possível excluir este processo — ele possui: ${bloqueios.join(', ')}. ` +
        `Remova esses registros antes de excluir o processo.`
      );
    }

    // Casca vazia — apaga de verdade. Os vínculos saem explicitamente (não dependemos
    // do ON DELETE CASCADE do banco para algo que precisa ser garantido).
    await conn.execute('DELETE FROM tbltituloprocautor WHERE proc_id = ?', [id]);
    await conn.execute('DELETE FROM tbltituloprocreu   WHERE proc_id = ?', [id]);
    await conn.execute('DELETE FROM processo_perito    WHERE proc_id = ?', [id]);
    await conn.execute('DELETE FROM tblproc WHERE id = ?', [id]);

    // Auditoria na MESMA transação. Guarda o NÚMERO do processo: depois da exclusão
    // o id não aponta mais para nada, e é o número que identifica o que foi apagado.
    await auditoria.registrar(
      req.usuario.id, 'tblproc', 'excluir', Number(id),
      { numProc: proc.numProc, titulo: proc.NomeTituloProc }, null, conn
    );

    await conn.commit();
    return sucesso(res, null, 'Processo excluído com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/processos/:id — Atualiza processo
async function atualizarProcesso(req, res) {
  const { id } = req.params;
  const {
    numProc, NomeTituloProc,
    vara_id, tipo_id, status_id, instancia_id,
    data_distribuicao, observacoes,
    autores, reus, peritos, cliente_polo,
  } = req.body;

  // cliente_polo é opcional; se vier preenchido precisa ser 'autor' ou 'reu'
  if (cliente_polo && !['autor', 'reu'].includes(cliente_polo)) {
    return erro(res, 'Polo do cliente inválido (use "autor" ou "reu")');
  }
  // Se autores/reus vierem no body (substituição das partes), processo precisa ficar com ao menos 1 de cada lado
  if (autores !== undefined && autores.length === 0) return erro(res, 'Inclua ao menos um autor no polo ativo');
  if (reus !== undefined && reus.length === 0)       return erro(res, 'Inclua ao menos um réu no polo passivo');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [antes] = await conn.execute('SELECT * FROM tblproc WHERE id = ? AND ativo = 1', [id]);
    if (!antes.length) {
      await conn.rollback();
      return naoEncontrado(res, 'Processo não encontrado');
    }

    // Verifica duplicidade de numProc (exclui o próprio processo da verificação)
    const numProcLimpo = numProc?.trim() || null;
    if (numProcLimpo) {
      const [duplic] = await conn.execute(
        'SELECT id FROM tblproc WHERE numProc = ? AND ativo = 1 AND id != ? LIMIT 1',
        [numProcLimpo, id]
      );
      if (duplic.length) {
        await conn.rollback();
        return erro(res, `O número de processo "${numProcLimpo}" já está cadastrado em outro processo`);
      }
    }

    await conn.execute(
      `UPDATE tblproc SET
         numProc=?, NomeTituloProc=?, cliente_polo=?,
         vara_id=?, tipo_id=?, status_id=?, instancia_id=?,
         data_distribuicao=?, observacoes=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [numProc          || null,
       NomeTituloProc   || antes[0].NomeTituloProc,
       // se não veio no body, preserva o valor atual; se veio vazio, grava NULL
       cliente_polo !== undefined ? (cliente_polo || null) : antes[0].cliente_polo,
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
      await conn.execute('DELETE FROM tbltituloprocautor WHERE proc_id = ?', [id]);
      for (const autor of autores) {
        await conn.execute(
          'INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
          [id, autor.tipo_pessoa, autor.pessoa_id, req.usuario.id]
        );
      }
    }
    if (reus !== undefined) {
      await conn.execute('DELETE FROM tbltituloprocreu WHERE proc_id = ?', [id]);
      for (const reu of reus) {
        await conn.execute(
          'INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
          [id, reu.tipo_pessoa, reu.pessoa_id, req.usuario.id]
        );
      }
    }
    // Substitui os peritos do processo se enviados
    if (peritos !== undefined) {
      await conn.execute('DELETE FROM processo_perito WHERE proc_id = ?', [id]);
      for (const perito of peritos) {
        await conn.execute(
          'INSERT INTO processo_perito (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, ?)',
          [id, perito.tipo_pessoa, perito.pessoa_id, req.usuario.id]
        );
      }
    }

    // Auditoria na MESMA transação (tudo ou nada): antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'tblproc', 'editar', id, antes[0], null, conn);
    await conn.commit();
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
      pool.execute('SELECT * FROM tblforum WHERE ativo=1 ORDER BY nome'),
      pool.execute(`SELECT v.*,
                           f.nome AS forum_nome, f.abrev_nome AS forum_abrev_nome,
                           f.logradouro AS forum_logradouro, f.num_end AS forum_num_end,
                           f.bairro AS forum_bairro, f.cidade AS forum_cidade,
                           f.uf AS forum_uf, f.cep AS forum_cep
                    FROM tblvara v JOIN tblforum f ON v.forum_id = f.id
                    WHERE v.ativo=1 ORDER BY f.nome, v.nome`),
      pool.execute('SELECT * FROM tbltipoproc WHERE ativo=1 ORDER BY nome'),
      pool.execute('SELECT * FROM tblstatusproc WHERE ativo=1 ORDER BY nome'),
      pool.execute('SELECT * FROM tblinstanciaproc WHERE ativo=1 ORDER BY nome'),
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

// ============================================================
// AUXILIARES — CRUD COMPLETO
// Helpers internos para evitar repetição nas tabelas simples
// ============================================================

// Atualiza uma tabela auxiliar simples (só nome)
async function _atualizarAuxSimples(req, res, tabela) {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
  try {
    const [r] = await pool.execute(
      `UPDATE ${tabela} SET nome=?, alterado_por=?, alterado_em=NOW() WHERE id=? AND ativo=1`,
      [nome.trim(), req.usuario.id, id]
    );
    if (!r.affectedRows) return naoEncontrado(res, 'Registro não encontrado');
    return sucesso(res, { id: parseInt(id), nome: nome.trim() }, 'Atualizado com sucesso');
  } catch (err) { return erroInterno(res, err); }
}

// Exclui (soft) uma tabela auxiliar — bloqueia se estiver em uso
async function _excluirAuxSimples(req, res, tabela, colunaUso) {
  const { id } = req.params;
  try {
    const [uso] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tblproc WHERE ${colunaUso}=? AND ativo=1`, [id]
    );
    if (uso[0].total > 0)
      return erro(res, `Não é possível excluir — este registro está vinculado a ${uso[0].total} processo(s) ativo(s)`);
    await pool.execute(
      `UPDATE ${tabela} SET ativo=0, alterado_por=?, alterado_em=NOW() WHERE id=?`,
      [req.usuario.id, id]
    );
    await auditoria.registrar(req.usuario.id, tabela, 'excluir', id);
    return sucesso(res, null, 'Excluído com sucesso');
  } catch (err) { return erroInterno(res, err); }
}

// POST /api/processos/auxiliares/foruns
async function criarForum(req, res) {
  try {
    const { abrev_nome, nome, cep, logradouro, num_end, compl_end, bairro, cidade, uf } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
    const [r] = await pool.execute(
      `INSERT INTO tblforum
         (abrev_nome, nome, cep, logradouro, num_end, compl_end, bairro, cidade, uf, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        abrev_nome?.trim()               || null,
        nome.trim(),
        cep?.replace(/\D/g, '')          || null,
        logradouro?.trim()               || null,
        num_end?.trim()                  || null,
        compl_end?.trim()                || null,
        bairro?.trim()                   || null,
        cidade?.trim()                   || null,
        uf?.toUpperCase().slice(0, 2)    || null,
        req.usuario.id,
      ]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim(), abrev_nome: abrev_nome?.trim() || null }, 'Fórum criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/processos/auxiliares/varas
async function criarVara(req, res) {
  try {
    const { abrev_nome, nome, forum_id, codVaraNoProc, compl_end, tel, email } = req.body;
    if (!nome?.trim() || !forum_id) return erro(res, 'Nome e fórum são obrigatórios');
    const [r] = await pool.execute(
      `INSERT INTO tblvara
         (abrev_nome, nome, forum_id, codVaraNoProc, compl_end, tel, email, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        abrev_nome?.trim()    || null,
        nome.trim(),
        forum_id,
        codVaraNoProc?.trim() || null,
        compl_end?.trim()     || null,
        tel?.trim()           || null,
        email?.trim()         || null,
        req.usuario.id,
      ]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim(), abrev_nome: abrev_nome?.trim() || null }, 'Vara criada com sucesso', 201);
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
      'INSERT INTO tbltipoproc (nome, criado_por) VALUES (?, ?)',
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
      'INSERT INTO tblstatusproc (nome, criado_por) VALUES (?, ?)',
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
      'INSERT INTO tblinstanciaproc (nome, criado_por) VALUES (?, ?)',
      [nome.trim(), req.usuario.id]
    );
    return sucesso(res, { id: r.insertId, nome: nome.trim() }, 'Instância criada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT/DELETE auxiliares — Fórum
async function atualizarForum(req, res) {
  const { id } = req.params;
  const { abrev_nome, nome, cep, logradouro, num_end, compl_end, bairro, cidade, uf } = req.body;
  if (!nome?.trim()) return erro(res, 'Nome é obrigatório');
  try {
    const [r] = await pool.execute(
      `UPDATE tblforum SET
         abrev_nome=?, nome=?, cep=?, logradouro=?, num_end=?,
         compl_end=?, bairro=?, cidade=?, uf=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id=? AND ativo=1`,
      [
        abrev_nome?.trim()              || null,
        nome.trim(),
        cep?.replace(/\D/g, '')         || null,
        logradouro?.trim()              || null,
        num_end?.trim()                 || null,
        compl_end?.trim()               || null,
        bairro?.trim()                  || null,
        cidade?.trim()                  || null,
        uf?.toUpperCase().slice(0, 2)   || null,
        req.usuario.id,
        id,
      ]
    );
    if (!r.affectedRows) return naoEncontrado(res, 'Fórum não encontrado');
    return sucesso(res, { id: parseInt(id), nome: nome.trim(), abrev_nome: abrev_nome?.trim() || null }, 'Fórum atualizado');
  } catch (err) { return erroInterno(res, err); }
}
async function excluirForum(req, res) {
  const { id } = req.params;
  try {
    const [varas] = await pool.execute(
      'SELECT nome FROM tblvara WHERE forum_id=? AND ativo=1 ORDER BY nome',
      [id]
    );
    if (varas.length > 0) {
      return erro(
        res,
        `Não é possível excluir este fórum — ele possui ${varas.length} vara(s) vinculada(s). Exclua as varas primeiro.`,
        400,
        { varas: varas.map(v => v.nome) }
      );
    }
    await pool.execute('UPDATE tblforum SET ativo=0, alterado_por=?, alterado_em=NOW() WHERE id=?', [req.usuario.id, id]);
    await auditoria.registrar(req.usuario.id, 'tblforum', 'excluir', id);
    return sucesso(res, null, 'Fórum excluído');
  } catch (err) { return erroInterno(res, err); }
}

// PUT/DELETE auxiliares — Vara
async function atualizarVara(req, res) {
  const { id } = req.params;
  const { abrev_nome, nome, forum_id, codVaraNoProc, compl_end, tel, email } = req.body;
  if (!nome?.trim() || !forum_id) return erro(res, 'Nome e fórum são obrigatórios');
  try {
    const [r] = await pool.execute(
      `UPDATE tblvara SET
         abrev_nome=?, nome=?, forum_id=?, codVaraNoProc=?,
         compl_end=?, tel=?, email=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id=? AND ativo=1`,
      [
        abrev_nome?.trim()    || null,
        nome.trim(),
        forum_id,
        codVaraNoProc?.trim() || null,
        compl_end?.trim()     || null,
        tel?.trim()           || null,
        email?.trim()         || null,
        req.usuario.id,
        id,
      ]
    );
    if (!r.affectedRows) return naoEncontrado(res, 'Vara não encontrada');
    return sucesso(res, { id: parseInt(id), nome: nome.trim(), abrev_nome: abrev_nome?.trim() || null }, 'Vara atualizada');
  } catch (err) { return erroInterno(res, err); }
}
async function excluirVara(req, res) {
  const { id } = req.params;
  try {
    const [processos] = await pool.execute(
      `SELECT numProc, NomeTituloProc FROM tblproc WHERE vara_id=? AND ativo=1 ORDER BY numProc`,
      [id]
    );
    if (processos.length > 0) {
      return erro(
        res,
        `Não é possível excluir esta vara — ela possui ${processos.length} processo(s) vinculado(s). Desvincule os processos antes de excluir a vara.`,
        400,
        { processos: processos.map(p => p.numProc || p.NomeTituloProc || `Processo #${p.id}`) }
      );
    }
    await pool.execute(
      'UPDATE tblvara SET ativo=0, alterado_por=?, alterado_em=NOW() WHERE id=?',
      [req.usuario.id, id]
    );
    await auditoria.registrar(req.usuario.id, 'tblvara', 'excluir', id);
    return sucesso(res, null, 'Vara excluída com sucesso');
  } catch (err) { return erroInterno(res, err); }
}

// PUT/DELETE auxiliares — Tipo, Status, Instância (só nome)
async function atualizarTipo(req, res)       { return _atualizarAuxSimples(req, res, 'tbltipoproc'); }
async function excluirTipo(req, res)         { return _excluirAuxSimples(req, res, 'tbltipoproc', 'tipo_id'); }
async function atualizarStatusProc(req, res) { return _atualizarAuxSimples(req, res, 'tblstatusproc'); }
async function excluirStatusProc(req, res)   { return _excluirAuxSimples(req, res, 'tblstatusproc', 'status_id'); }
async function atualizarInstancia(req, res)  { return _atualizarAuxSimples(req, res, 'tblinstanciaproc'); }
async function excluirInstancia(req, res)    { return _excluirAuxSimples(req, res, 'tblinstanciaproc', 'instancia_id'); }

// GET /api/processos/buscar?q=termo — Busca processos por numProc ou NomeTituloProc
// Retorna lista de processos com numPasta para autocomplete
async function buscarProcessosPorNumero(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return sucesso(res, []);

    const termo = `%${q}%`;
    const [rows] = await pool.execute(
      `SELECT p.id, p.numProc, p.NomeTituloProc, pa.numPasta
       FROM tblproc p
       JOIN tblpasta pa ON pa.id = p.pasta_id
       WHERE p.ativo = 1
         AND (p.numProc LIKE ? OR p.NomeTituloProc LIKE ?)
       ORDER BY p.numProc
       LIMIT 10`,
      [termo, termo]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  buscarProcessosPorNumero,
  sugerirNumeroPasta,
  listarPastas,
  renumerarPasta,
  buscarPasta,
  checarPasta,
  criarProcesso,
  atualizarProcesso,
  excluirProcesso,
  buscarAuxiliares,
  // Fórum
  criarForum, atualizarForum, excluirForum,
  // Vara
  criarVara, atualizarVara, excluirVara,
  // Tipo
  criarTipo, atualizarTipo, excluirTipo,
  // Status
  criarStatusProc, atualizarStatusProc, excluirStatusProc,
  // Instância
  criarInstancia, atualizarInstancia, excluirInstancia,
};
