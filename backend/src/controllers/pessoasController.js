// ============================================================
// CONTROLLER DE PESSOAS (físicas e jurídicas)
// CRUD completo com telefones, e-mails e histórico
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

// ---- PESSOAS FÍSICAS ----

// GET /api/pessoas/fisicas — Lista todas as pessoas físicas
async function listarFisicas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20 } = req.query;
    // parseInt garante valores inteiros seguros para uso direto na query
    const limitInt  = parseInt(limite)  || 20;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE pf.ativo = 1';

    // Filtro de busca abrangente — nome, CPF, RG, PIS, endereço e telefone
    if (busca) {
      // CPF é armazenado só com dígitos; remove máscara digitada para bater com o banco
      const buscaDigitos = busca.replace(/\D/g, '');
      const b  = `%${busca}%`;
      const bD = `%${buscaDigitos || busca}%`;

      where += ` AND (
        pf.nome       LIKE ? OR
        pf.cpf        LIKE ? OR
        pf.rg         LIKE ? OR
        pf.pis        LIKE ? OR
        pf.logradouro LIKE ? OR
        pf.bairro     LIKE ? OR
        pf.cidade     LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pf t
          WHERE t.pessoa_id = pf.id AND t.ativo = 1 AND t.numero LIKE ?
        )
      )`;
      params.push(b, bD, b, b, b, b, b, b);
    }

    // Nota: LIMIT e OFFSET são inseridos diretamente na query (já sanitizados com parseInt)
    // pois o MySQL 8 tem incompatibilidade com parâmetros ? em LIMIT/OFFSET via prepared statements
    const [rows] = await pool.execute(
      `SELECT pf.id, pf.nome, pf.cpf, pf.data_nascimento,
              ec.nome AS estado_civil, g.nome AS genero,
              -- Pega o telefone principal
              (SELECT t.numero FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
              -- Pega o e-mail principal
              (SELECT e.email FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email,
              -- Total de processos como autor ou réu (sem duplicatas)
              (SELECT COUNT(*) FROM (
                SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id
                UNION
                SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id
              ) AS t) AS qtde_proc
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN genero g ON pf.genero_id = g.id
       ${where}
       ORDER BY pf.nome ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    // Conta total para paginação
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM pessoas_fisicas pf ${where}`,
      params
    );

    return sucesso(res, { registros: rows, total: total[0].total, pagina: parseInt(pagina), limite: parseInt(limite) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/fisicas/:id — Busca uma pessoa física completa
async function buscarFisica(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT pf.*, ec.nome AS estado_civil_nome, g.nome AS genero_nome, pr.nome AS profissao_nome
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN genero g ON pf.genero_id = g.id
       LEFT JOIN profissao pr ON pf.profissao_id = pr.id
       WHERE pf.id = ?`,
      [id]
    );

    if (!rows.length) return naoEncontrado(res, 'Pessoa não encontrada');

    const pessoa = rows[0];

    // Busca telefones
    const [telefones] = await pool.execute(
      'SELECT * FROM telefones_pf WHERE pessoa_id = ? ORDER BY principal DESC, id ASC',
      [id]
    );

    // Busca e-mails
    const [emails] = await pool.execute(
      'SELECT * FROM emails_pf WHERE pessoa_id = ? ORDER BY principal DESC, id ASC',
      [id]
    );

    // Busca histórico de atendimento
    const [historico] = await pool.execute(
      `SELECT h.*, u.nome AS usuario_nome
       FROM historico_atendimento h
       JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.tipo_pessoa = 'fisica' AND h.pessoa_id = ?
       ORDER BY h.criado_em DESC`,
      [id]
    );

    return sucesso(res, { ...pessoa, telefones, emails, historico });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/fisicas — Cadastra nova pessoa física
async function criarFisica(req, res) {
  const {
    nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
    data_nascimento, estado_civil_id, profissao_id,
    genero_id, nome_pai, nome_mae,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    observacoes, telefones = [], emails = []
  } = req.body;

  if (!nome) return erro(res, 'O nome é obrigatório');

  // Verifica CPF duplicado antes de iniciar a transação (leitura simples, sem lock)
  if (cpf) {
    try {
      const cpfLimpo = cpf.replace(/\D/g, '');
      const [dup] = await pool.execute(
        'SELECT id FROM pessoas_fisicas WHERE cpf = ?', [cpfLimpo]
      );
      if (dup.length > 0) return erro(res, 'CPF já cadastrado no sistema');
    } catch (err) {
      return erroInterno(res, err);
    }
  }

  // Transação: garante que pessoa, telefones e e-mails são gravados juntos ou nenhum é
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO pessoas_fisicas
         (nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
          data_nascimento, estado_civil_id, profissao_id, genero_id,
          nome_pai, nome_mae,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(), cpf?.replace(/\D/g, '') || null, rg || null, rg_orgao || null,
        pis || null, ctps_numero || null, ctps_serie || null,
        data_nascimento || null, estado_civil_id || null, profissao_id || null,
        genero_id || null, nome_pai || null, nome_mae || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null, req.usuario.id
      ]
    );

    const pessoaId = result.insertId;

    // Insere telefones vinculados à pessoa
    for (const tel of telefones) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'celular', tel.principal ? 1 : 0]
        );
      }
    }

    // Insere e-mails vinculados à pessoa
    for (const em of emails) {
      if (em.email) {
        await conn.execute(
          'INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await conn.commit();         // Grava tudo de uma vez — pessoa + telefones + e-mails
    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'criar', pessoaId);
    return sucesso(res, { id: pessoaId }, 'Pessoa cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// PUT /api/pessoas/fisicas/:id — Atualiza pessoa física
async function atualizarFisica(req, res) {
  try {
    const { id } = req.params;
    const {
      nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
      data_nascimento, estado_civil_id, profissao_id,
      genero_id, nome_pai, nome_mae,
      cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes
    } = req.body;

    // Busca dados atuais para auditoria
    const [antes] = await pool.execute('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Pessoa não encontrada');

    await pool.execute(
      `UPDATE pessoas_fisicas SET
         nome=?, cpf=?, rg=?, rg_orgao=?, pis=?, ctps_numero=?, ctps_serie=?,
         data_nascimento=?, estado_civil_id=?, profissao_id=?,
         genero_id=?, nome_pai=?, nome_mae=?,
         cep=?, logradouro=?, numero=?, complemento=?, bairro=?,
         cidade=?, estado=?, observacoes=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [
        nome?.trim(), cpf?.replace(/\D/g, '') || null, rg || null, rg_orgao || null,
        pis || null, ctps_numero || null, ctps_serie || null,
        // Garante formato YYYY-MM-DD — frontend pode enviar ISO com horário (ex: 1972-03-27T03:00:00.000Z)
        data_nascimento ? data_nascimento.toString().slice(0, 10) : null,
        estado_civil_id || null, profissao_id || null,
        genero_id || null, nome_pai || null, nome_mae || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null,
        req.usuario.id,   // alterado_por — id de quem fez o update
        id
      ]
    );

    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'editar', id, antes[0]);
    return sucesso(res, null, 'Pessoa atualizada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/pessoas/fisicas/:id — Exclui pessoa física SEM vínculos
// Antes de excluir, verifica em paralelo todas as tabelas relacionadas.
// Se houver qualquer vínculo, bloqueia e informa o motivo.
// Telefones e e-mails são removidos automaticamente via CASCADE do banco.
async function excluirFisica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT nome FROM pessoas_fisicas WHERE id = ? AND ativo = 1', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Pessoa não encontrada');

    // Verifica todos os vínculos em paralelo antes de permitir exclusão
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tblTituloProcAutor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tblTituloProcReu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);

    if (vinculos.length > 0) {
      return erro(res, `Pessoa não pode ser excluída pois possui: ${vinculos.join(', ')}`);
    }

    // Sem vínculos — DELETE real (telefones e e-mails apagam via CASCADE do banco)
    await pool.execute('DELETE FROM pessoas_fisicas WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'excluir', id);
    return sucesso(res, null, 'Pessoa excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/pessoas/juridicas/:id — Exclui pessoa jurídica SEM vínculos
// Mesma lógica da física: verifica vínculos em paralelo antes de excluir.
async function excluirJuridica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT razao_social FROM pessoas_juridicas WHERE id = ? AND ativo = 1', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Pessoa jurídica não encontrada');

    // Verifica todos os vínculos em paralelo antes de permitir exclusão
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tblTituloProcAutor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tblTituloProcReu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);

    if (vinculos.length > 0) {
      return erro(res, `Pessoa não pode ser excluída pois possui: ${vinculos.join(', ')}`);
    }

    // Sem vínculos — DELETE real (telefones e e-mails apagam via CASCADE do banco)
    await pool.execute('DELETE FROM pessoas_juridicas WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'excluir', id);
    return sucesso(res, null, 'Pessoa jurídica excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/fisicas/:id/historico — Adiciona histórico de atendimento
async function adicionarHistorico(req, res) {
  try {
    const { id } = req.params;
    const { descricao, tipo_pessoa } = req.body;

    if (!descricao) return erro(res, 'A descrição é obrigatória');

    await pool.execute(
      `INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id)
       VALUES (?, ?, ?, ?)`,
      [tipo_pessoa || 'fisica', id, descricao, req.usuario.id]
    );

    return sucesso(res, null, 'Histórico registrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ---- PESSOAS JURÍDICAS ----

// GET /api/pessoas/juridicas — Lista todas as pessoas jurídicas
async function listarJuridicas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20 } = req.query;
    // parseInt garante valores inteiros seguros para uso direto na query
    const limitInt  = parseInt(limite)  || 20;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE pj.ativo = 1';

    // Filtro de busca abrangente — razão social, CNPJ, fantasia, representante, endereço e telefone
    if (busca) {
      // CNPJ é armazenado só com dígitos; remove máscara para bater com o banco
      const buscaDigitos = busca.replace(/\D/g, '');
      const b  = `%${busca}%`;
      const bD = `%${buscaDigitos || busca}%`;

      where += ` AND (
        pj.razao_social        LIKE ? OR
        pj.cnpj                LIKE ? OR
        pj.nome_fantasia       LIKE ? OR
        pj.representante_legal LIKE ? OR
        pj.logradouro          LIKE ? OR
        pj.bairro              LIKE ? OR
        pj.cidade              LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pj t
          WHERE t.pessoa_id = pj.id AND t.ativo = 1 AND t.numero LIKE ?
        )
      )`;
      params.push(b, bD, b, b, b, b, b, b);
    }

    // Nota: LIMIT e OFFSET inseridos diretamente (sanitizados com parseInt — MySQL 8 não aceita ? em LIMIT/OFFSET)
    const [rows] = await pool.execute(
      `SELECT pj.id, pj.razao_social, pj.nome_fantasia, pj.cnpj, pj.representante_legal,
              (SELECT t.numero FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.ativo = 1
               ORDER BY t.principal DESC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pj e WHERE e.pessoa_id = pj.id AND e.ativo = 1
               ORDER BY e.principal DESC LIMIT 1) AS email,
              -- Total de processos como autor ou réu (sem duplicatas)
              (SELECT COUNT(*) FROM (
                SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id
                UNION
                SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id
              ) AS t) AS qtde_proc
       FROM pessoas_juridicas pj ${where}
       ORDER BY pj.razao_social ASC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM pessoas_juridicas pj ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/juridicas — Cadastra pessoa jurídica
async function criarJuridica(req, res) {
  const {
    razao_social, nome_fantasia, cnpj, inscricao_estadual, representante_legal,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    observacoes, telefones = [], emails = []
  } = req.body;

  if (!razao_social) return erro(res, 'A razão social é obrigatória');

  // Transação: garante que empresa, telefones e e-mails são gravados juntos ou nenhum é
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO pessoas_juridicas
         (razao_social, nome_fantasia, cnpj, inscricao_estadual, representante_legal,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        razao_social.trim(), nome_fantasia || null,
        cnpj?.replace(/\D/g, '') || null, inscricao_estadual || null,
        representante_legal || null, cep || null, logradouro || null,
        numero || null, complemento || null, bairro || null,
        cidade || null, estado || null, observacoes || null, req.usuario.id
      ]
    );

    const pessoaId = result.insertId;

    // Insere telefones vinculados à empresa
    for (const tel of telefones) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'comercial', tel.principal ? 1 : 0]
        );
      }
    }

    // Insere e-mails vinculados à empresa
    for (const em of emails) {
      if (em.email) {
        await conn.execute(
          'INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await conn.commit();         // Grava tudo de uma vez — empresa + telefones + e-mails
    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'criar', pessoaId);
    return sucesso(res, { id: pessoaId }, 'Pessoa jurídica cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// POST /api/pessoas/auxiliares/:tipo — Cadastra novo item em genero, estado_civil ou profissao
// tipo aceito: "generos" | "estados_civis" | "profissoes"
async function criarAuxiliar(req, res) {
  try {
    const { tipo } = req.params;
    const { nome } = req.body;

    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');

    // Whitelist de tabelas — evita SQL injection via parâmetro de rota
    const tabelas = {
      generos:       'genero',
      estados_civis: 'estado_civil',
      profissoes:    'profissao',
    };

    const tabela = tabelas[tipo];
    if (!tabela) return erro(res, 'Tipo inválido. Use: generos, estados_civis ou profissoes');

    // Normaliza: primeira letra maiúscula, demais minúsculas
    const nomeTrimmed = nome.trim();
    const nomeNormalizado = nomeTrimmed.charAt(0).toUpperCase() + nomeTrimmed.slice(1).toLowerCase();

    // Verifica se já existe o mesmo nome (case-insensitive)
    const [dup] = await pool.execute(
      `SELECT id FROM ${tabela} WHERE LOWER(nome) = LOWER(?)`, [nomeNormalizado]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrado na lista`);

    const [result] = await pool.execute(
      `INSERT INTO ${tabela} (nome) VALUES (?)`, [nomeNormalizado]
    );

    return sucesso(res, { id: result.insertId, nome: nomeNormalizado }, 'Cadastrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/fisicas/cpf/:cpf — Verifica se CPF já existe no banco
async function buscarPorCPF(req, res) {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return erro(res, 'CPF inválido');

    const [rows] = await pool.execute(
      'SELECT id, nome, cpf FROM pessoas_fisicas WHERE cpf = ? AND ativo = 1',
      [cpf]
    );

    if (!rows.length) return sucesso(res, { existe: false });

    // Retorna que existe e dados básicos para o frontend decidir o que fazer
    return sucesso(res, { existe: true, pessoa: rows[0] });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/auxiliares — Retorna listas para preencher selects
async function buscarAuxiliares(req, res) {
  try {
    const [estados_civis] = await pool.execute('SELECT * FROM estado_civil ORDER BY nome');
    const [generos]       = await pool.execute('SELECT * FROM genero ORDER BY nome');
    const [profissoes]    = await pool.execute('SELECT * FROM profissao ORDER BY nome');

    return sucesso(res, { estados_civis, generos, profissoes });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  listarFisicas, buscarFisica, criarFisica, atualizarFisica, excluirFisica, adicionarHistorico,
  listarJuridicas, criarJuridica, excluirJuridica, buscarAuxiliares, buscarPorCPF, criarAuxiliar
};
