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

    // Filtro de busca por nome ou CPF
    if (busca) {
      where += ' AND (pf.nome LIKE ? OR pf.cpf LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`);
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
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
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
  try {
    const {
      nome, cpf, rg, data_nascimento, estado_civil_id, profissao_id,
      genero_id, cep, logradouro, numero, complemento, bairro, cidade, estado,
      observacoes, telefones = [], emails = []
    } = req.body;

    if (!nome) return erro(res, 'O nome é obrigatório');

    // Verifica CPF duplicado
    if (cpf) {
      const cpfLimpo = cpf.replace(/\D/g, '');
      const [dup] = await pool.execute(
        'SELECT id FROM pessoas_fisicas WHERE cpf = ?', [cpfLimpo]
      );
      if (dup.length > 0) return erro(res, 'CPF já cadastrado no sistema');
    }

    const [result] = await pool.execute(
      `INSERT INTO pessoas_fisicas
         (nome, cpf, rg, data_nascimento, estado_civil_id, profissao_id, genero_id,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(), cpf?.replace(/\D/g, '') || null, rg || null,
        data_nascimento || null, estado_civil_id || null, profissao_id || null,
        genero_id || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null, req.usuario.id
      ]
    );

    const pessoaId = result.insertId;

    // Insere telefones
    for (const tel of telefones) {
      if (tel.numero) {
        await pool.execute(
          'INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'celular', tel.principal ? 1 : 0]
        );
      }
    }

    // Insere e-mails
    for (const em of emails) {
      if (em.email) {
        await pool.execute(
          'INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'criar', pessoaId);
    return sucesso(res, { id: pessoaId }, 'Pessoa cadastrada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pessoas/fisicas/:id — Atualiza pessoa física
async function atualizarFisica(req, res) {
  try {
    const { id } = req.params;
    const {
      nome, cpf, rg, data_nascimento, estado_civil_id, profissao_id,
      genero_id, cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes
    } = req.body;

    // Busca dados atuais para auditoria
    const [antes] = await pool.execute('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Pessoa não encontrada');

    await pool.execute(
      `UPDATE pessoas_fisicas SET
         nome=?, cpf=?, rg=?, data_nascimento=?, estado_civil_id=?, profissao_id=?,
         genero_id=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?,
         cidade=?, estado=?, observacoes=?
       WHERE id = ?`,
      [
        nome?.trim(), cpf?.replace(/\D/g, '') || null, rg || null,
        data_nascimento || null, estado_civil_id || null, profissao_id || null,
        genero_id || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null, id
      ]
    );

    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'editar', id, antes[0]);
    return sucesso(res, null, 'Pessoa atualizada com sucesso');
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

    if (busca) {
      where += ' AND (pj.razao_social LIKE ? OR pj.cnpj LIKE ? OR pj.nome_fantasia LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    // Nota: LIMIT e OFFSET inseridos diretamente (sanitizados com parseInt — MySQL 8 não aceita ? em LIMIT/OFFSET)
    const [rows] = await pool.execute(
      `SELECT pj.id, pj.razao_social, pj.nome_fantasia, pj.cnpj, pj.representante_legal,
              (SELECT t.numero FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.ativo = 1
               ORDER BY t.principal DESC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pj e WHERE e.pessoa_id = pj.id AND e.ativo = 1
               ORDER BY e.principal DESC LIMIT 1) AS email
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
  try {
    const {
      razao_social, nome_fantasia, cnpj, inscricao_estadual, representante_legal,
      cep, logradouro, numero, complemento, bairro, cidade, estado,
      observacoes, telefones = [], emails = []
    } = req.body;

    if (!razao_social) return erro(res, 'A razão social é obrigatória');

    const [result] = await pool.execute(
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

    for (const tel of telefones) {
      if (tel.numero) {
        await pool.execute(
          'INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'comercial', tel.principal ? 1 : 0]
        );
      }
    }
    for (const em of emails) {
      if (em.email) {
        await pool.execute(
          'INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'criar', pessoaId);
    return sucesso(res, { id: pessoaId }, 'Pessoa jurídica cadastrada com sucesso', 201);
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
  listarFisicas, buscarFisica, criarFisica, atualizarFisica, adicionarHistorico,
  listarJuridicas, criarJuridica, buscarAuxiliares, buscarPorCPF
};
