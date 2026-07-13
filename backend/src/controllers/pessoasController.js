// ============================================================
// CONTROLLER DE PESSOAS (físicas e jurídicas)
// CRUD completo com telefones, e-mails e histórico
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { hojeBrasilia } = require('../utils/helpers');

// ---- Filtros de busca reutilizáveis (listagem E exportação) — evita duplicar a mesma condição ----

// Condição de busca de PESSOA FÍSICA (nome, CPF, RG, PIS, endereço, telefone). Retorna { cond, params }.
function condBuscaFisica(busca) {
  const buscaDigitos = busca.replace(/\D/g, '');
  const b  = `%${busca}%`;
  const bD = `%${buscaDigitos || busca}%`;
  const cond = ` AND (
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
  return { cond, params: [b, bD, b, b, b, b, b, b] };
}

// Condição de busca de PESSOA JURÍDICA (razão social, CNPJ, fantasia, endereço, telefone).
function condBuscaJuridica(busca) {
  const buscaDigitos = busca.replace(/\D/g, '');
  const b  = `%${busca}%`;
  const bD = `%${buscaDigitos || busca}%`;
  const cond = ` AND (
        pj.razao_social        LIKE ? OR
        pj.cnpj                LIKE ? OR
        pj.nome_fantasia       LIKE ? OR
        pj.logradouro          LIKE ? OR
        pj.bairro              LIKE ? OR
        pj.cidade              LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pj t
          WHERE t.pessoa_id = pj.id AND t.ativo = 1 AND t.numero LIKE ?
        )
      )`;
  return { cond, params: [b, bD, b, b, b, b, b] };
}

// ---- PESSOAS FÍSICAS ----

// GET /api/pessoas/fisicas — Lista todas as pessoas físicas
async function listarFisicas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20, somente_advogados } = req.query;
    // parseInt garante valores inteiros seguros para uso direto na query
    const limitInt  = parseInt(limite)  || 20;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE pf.ativo = 1';

    // Filtra apenas pessoas com profissão de advogado (para campos de advogado em audiências)
    if (somente_advogados) {
      where += ` AND EXISTS (
        SELECT 1 FROM profissao pr
        WHERE pr.id = pf.profissao_id AND pr.nome LIKE '%dvogado%'
      )`;
    }

    // Filtro de busca abrangente (mesma condição reutilizada na exportação — ver condBuscaFisica)
    if (busca) {
      const f = condBuscaFisica(busca);
      where += f.cond;
      params.push(...f.params);
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
    genero_id, nacionalidade_id, nome_pai, nome_mae,
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
          data_nascimento, estado_civil_id, profissao_id, genero_id, nacionalidade_id,
          nome_pai, nome_mae,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(), cpf?.replace(/\D/g, '') || null, rg || null, rg_orgao || null,
        pis || null, ctps_numero || null, ctps_serie || null,
        data_nascimento || null, estado_civil_id || null, profissao_id || null,
        genero_id || null, nacionalidade_id || null, nome_pai || null, nome_mae || null,
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

    // Auditoria participa da MESMA transação (tudo ou nada): grava antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'criar', pessoaId, null, null, conn);
    await conn.commit();         // Grava tudo de uma vez — pessoa + telefones + e-mails + auditoria
    return sucesso(res, { id: pessoaId }, 'Pessoa cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    // Rede de segurança da trava de unicidade do banco: se dois cadastros do mesmo CPF
    // chegarem ao mesmo tempo, o segundo é barrado aqui com mensagem amigável (não erro 500).
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'CPF já cadastrado no sistema');
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// PUT /api/pessoas/fisicas/:id — Atualiza pessoa física
async function atualizarFisica(req, res) {
  const { id } = req.params;
  const {
    nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
    data_nascimento, estado_civil_id, profissao_id,
    genero_id, nacionalidade_id, nome_pai, nome_mae,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
    telefones = [], emails = []
  } = req.body;

  // Transação: dados principais + telefones + e-mails + auditoria gravam juntos ou nada
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Busca dados atuais para auditoria
    const [antes] = await conn.execute('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
    if (!antes.length) { await conn.rollback(); return naoEncontrado(res, 'Pessoa não encontrada'); }

    await conn.execute(
      `UPDATE pessoas_fisicas SET
         nome=?, cpf=?, rg=?, rg_orgao=?, pis=?, ctps_numero=?, ctps_serie=?,
         data_nascimento=?, estado_civil_id=?, profissao_id=?,
         genero_id=?, nacionalidade_id=?, nome_pai=?, nome_mae=?,
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
        genero_id || null, nacionalidade_id || null, nome_pai || null, nome_mae || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null,
        req.usuario.id,   // alterado_por — id de quem fez o update
        id
      ]
    );

    // Telefones e e-mails: a tela de edição carrega a lista COMPLETA (via buscarFisica),
    // então regrava exatamente o que está no formulário — o que o usuário vê é o que fica salvo.
    await conn.execute('DELETE FROM telefones_pf WHERE pessoa_id = ?', [id]);
    for (const tel of telefones) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [id, tel.numero, tel.tipo || 'celular', tel.principal ? 1 : 0]
        );
      }
    }
    await conn.execute('DELETE FROM emails_pf WHERE pessoa_id = ?', [id]);
    for (const em of emails) {
      if (em.email) {
        await conn.execute(
          'INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [id, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'editar', id, antes[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pessoa atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    // Trava de unicidade: editar o CPF para um que já existe em outra pessoa cai aqui.
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Este CPF já está cadastrado em outra pessoa');
    return erroInterno(res, err);
  } finally {
    conn.release();
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
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes], [testemunhas], [peritos]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocreu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
      // Testemunha é sempre pessoa física (FK em audiencia_testemunhas com ON DELETE RESTRICT). Sem esta
      // checagem, excluir uma testemunha caía no erro genérico do banco em vez de avisar o motivo ao usuário.
      pool.execute('SELECT COUNT(*) AS total FROM audiencia_testemunhas WHERE pessoa_id = ?',                       [id]),
      // Perito do processo (processo_perito) é ligação polimórfica SEM chave estrangeira em pessoa_id.
      // Sem esta checagem, apagar uma pessoa que é perito deixaria um registro órfão em processo_perito.
      pool.execute('SELECT COUNT(*) AS total FROM processo_perito WHERE tipo_pessoa = ? AND pessoa_id = ?',         ['fisica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);
    if (testemunhas[0].total > 0)  vinculos.push(`${testemunhas[0].total} audiência(s) como testemunha`);
    if (peritos[0].total > 0)      vinculos.push(`${peritos[0].total} perícia(s) como perito`);

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
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes], [peritos]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocreu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
      // Perito polimórfico SEM chave estrangeira — sem esta checagem, apagar a empresa deixaria órfão em processo_perito.
      pool.execute('SELECT COUNT(*) AS total FROM processo_perito WHERE tipo_pessoa = ? AND pessoa_id = ?',         ['juridica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);
    if (peritos[0].total > 0)      vinculos.push(`${peritos[0].total} perícia(s) como perito`);

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

// POST /api/pessoas/juridicas/unificar — Une cadastros DUPLICADOS de uma empresa
// em um único (o "principal"): move TODOS os vínculos dos duplicados para o
// principal e depois apaga os duplicados. Tudo dentro de UMA transação.
//
// Vínculos de uma empresa (conferidos na estrutura do banco — mover TODOS p/ não deixar órfão):
//   - Por (tipo_pessoa='juridica', pessoa_id): tbltituloprocautor, tbltituloprocreu,
//     historico_atendimento, log_comunicacoes, processo_perito.
//   - Por coluna própria (tipo+id): pericia (perito_tipo/perito_id), acordo_parcela
//     (parceria_pessoa_tipo/parceria_pessoa_id).
//   - "Filhos" do cadastro (por pessoa_id): telefones_pj, emails_pj.
async function unificarJuridicas(req, res) {
  const principalId = parseInt(req.body.principal_id);
  // Remove repetidos, valores inválidos e o próprio principal da lista de duplicados
  let duplicados = Array.isArray(req.body.duplicados_ids) ? req.body.duplicados_ids.map(Number) : [];
  duplicados = [...new Set(duplicados.filter(x => x && x !== principalId))];

  if (!principalId)          return erro(res, 'Cadastro principal é obrigatório');
  if (duplicados.length === 0) return erro(res, 'Selecione ao menos um cadastro duplicado diferente do principal');

  // Confere que TODOS os cadastros (principal + duplicados) existem em pessoas_juridicas
  const idsTodos = [principalId, ...duplicados];
  const phTodos  = idsTodos.map(() => '?').join(',');
  const [existentes] = await pool.execute(
    `SELECT id FROM pessoas_juridicas WHERE id IN (${phTodos})`, idsTodos
  );
  if (existentes.length !== idsTodos.length) {
    return erro(res, 'Algum cadastro selecionado não foi encontrado');
  }

  const dupPh = duplicados.map(() => '?').join(','); // placeholders para os duplicados

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) PARTES do processo (autor e réu): move os duplicados para o principal e,
    //    em seguida, remove partes repetidas que a fusão possa ter gerado no MESMO
    //    processo (mantém o registro de menor id).
    for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ?
          WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
      await conn.execute(
        `DELETE t FROM ${tabela} t
           JOIN ${tabela} t2
             ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
            AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
          WHERE t.tipo_pessoa = 'juridica' AND t.pessoa_id = ?`,
        [principalId]
      );
    }

    // 2) PERITO do processo (processo_perito, por tipo+id): move e remove repetição no
    //    MESMO processo (a fusão pode deixar o mesmo perito 2x no processo).
    await conn.execute(
      `UPDATE processo_perito SET pessoa_id = ?
        WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM processo_perito t
         JOIN processo_perito t2
           ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
          AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.tipo_pessoa = 'juridica' AND t.pessoa_id = ?`,
      [principalId]
    );

    // 3) Vínculos por (tipo+id) sem repetição a tratar: histórico e comunicações — só mover.
    for (const tabela of ['historico_atendimento', 'log_comunicacoes']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ?
          WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 4) Perito de PERÍCIA e PARCEIRO de acordo (colunas próprias; 1 por linha — só mover).
    await conn.execute(
      `UPDATE pericia SET perito_id = ?
        WHERE perito_tipo = 'juridica' AND perito_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `UPDATE acordo_parcela SET parceria_pessoa_id = ?
        WHERE parceria_pessoa_tipo = 'juridica' AND parceria_pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );

    // 5) "Filhos" do cadastro (telefones e e-mails): move para o principal p/ não
    //    perder contatos (esses não têm tipo_pessoa; pertencem só à empresa).
    for (const tabela of ['telefones_pj', 'emails_pj']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 6) Apaga os cadastros duplicados (agora sem nenhum vínculo)
    await conn.execute(`DELETE FROM pessoas_juridicas WHERE id IN (${dupPh})`, duplicados);

    // 7) Auditoria dentro da MESMA transação (falha aqui desfaz tudo)
    await auditoria.registrar(
      req.usuario.id, 'pessoas_juridicas', 'unificar', principalId, null,
      { unificados: duplicados }, conn
    );

    await conn.commit();
    return sucesso(res, { principal_id: principalId, unificados: duplicados.length },
      `${duplicados.length} cadastro(s) unificado(s) no principal com sucesso`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ---- UNIFICAR PESSOAS FÍSICAS DUPLICADAS (só admin/superadmin) ----
// Move TODOS os vínculos dos duplicados para o principal e apaga os duplicados, em 1 transação.
// Vínculos da pessoa física (conferidos no banco — mover todos p/ NÃO deixar órfão):
//   - Por (tipo_pessoa='fisica', pessoa_id): tbltituloprocautor, tbltituloprocreu,
//     historico_atendimento, log_comunicacoes, processo_perito.
//   - Por coluna própria (tipo+id): pericia (perito_tipo/perito_id), acordo_parcela
//     (parceria_pessoa_tipo/parceria_pessoa_id).
//   - FK diretas (por pessoa_id): audiencia_testemunhas, telefones_pf, emails_pf.
// TRAVA DE CPF: CPFs diferentes = pessoas diferentes -> bloqueia. O principal HERDA o CPF
// se estiver sem (só um dos selecionados pode ter CPF, pois cpf é UNIQUE no banco).
async function unificarFisicas(req, res) {
  const principalId = parseInt(req.body.principal_id);
  let duplicados = Array.isArray(req.body.duplicados_ids) ? req.body.duplicados_ids.map(Number) : [];
  duplicados = [...new Set(duplicados.filter(x => x && x !== principalId))];

  if (!principalId)            return erro(res, 'Cadastro principal é obrigatório');
  if (duplicados.length === 0) return erro(res, 'Selecione ao menos um cadastro duplicado diferente do principal');

  // Carrega id + cpf de todos os selecionados (confere existência e alimenta a trava de CPF).
  const idsTodos = [principalId, ...duplicados];
  const phTodos  = idsTodos.map(() => '?').join(',');
  const [regs] = await pool.execute(
    `SELECT id, cpf FROM pessoas_fisicas WHERE id IN (${phTodos})`, idsTodos
  );
  if (regs.length !== idsTodos.length) {
    return erro(res, 'Algum cadastro selecionado não foi encontrado');
  }

  // TRAVA DE CPF: dois ou mais CPFs diferentes preenchidos = pessoas diferentes.
  const cpfsDistintos = [...new Set(regs.map(r => (r.cpf || '').trim()).filter(Boolean))];
  if (cpfsDistintos.length > 1) {
    return erro(res, 'Estes cadastros têm CPFs diferentes e não podem ser unificados — CPFs diferentes indicam pessoas diferentes.');
  }
  const cpfGrupo     = cpfsDistintos[0] || null;                                       // único CPF do grupo (se houver)
  const cpfPrincipal = (regs.find(r => r.id === principalId)?.cpf || '').trim() || null; // CPF atual do principal

  const dupPh = duplicados.map(() => '?').join(',');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) PARTES (autor e réu): move + remove repetição no MESMO processo (mantém menor id).
    for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
      await conn.execute(
        `DELETE t FROM ${tabela} t
           JOIN ${tabela} t2 ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
             AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
          WHERE t.tipo_pessoa = 'fisica' AND t.pessoa_id = ?`,
        [principalId]
      );
    }

    // 2) PERITO do processo (processo_perito): move + remove repetição no mesmo processo.
    await conn.execute(
      `UPDATE processo_perito SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM processo_perito t
         JOIN processo_perito t2 ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
           AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.tipo_pessoa = 'fisica' AND t.pessoa_id = ?`,
      [principalId]
    );

    // 3) TESTEMUNHA (audiencia_testemunhas, FK direta): move + remove repetição na mesma audiência.
    await conn.execute(
      `UPDATE audiencia_testemunhas SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM audiencia_testemunhas t
         JOIN audiencia_testemunhas t2 ON t.audiencia_id = t2.audiencia_id
           AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.pessoa_id = ?`,
      [principalId]
    );

    // 4) Vínculos por (tipo+id) sem repetição a tratar: histórico e comunicações — só mover.
    for (const tabela of ['historico_atendimento', 'log_comunicacoes']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 5) Perito de PERÍCIA e PARCEIRO de acordo (coluna própria; 1 por linha — só mover).
    await conn.execute(
      `UPDATE pericia SET perito_id = ? WHERE perito_tipo = 'fisica' AND perito_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `UPDATE acordo_parcela SET parceria_pessoa_id = ? WHERE parceria_pessoa_tipo = 'fisica' AND parceria_pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );

    // 6) Telefones e e-mails (FK por pessoa_id): move para o principal.
    for (const tabela of ['telefones_pf', 'emails_pf']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 7) Apaga os cadastros duplicados (agora sem nenhum vínculo). Isso LIBERA o CPF único.
    await conn.execute(`DELETE FROM pessoas_fisicas WHERE id IN (${dupPh})`, duplicados);

    // 8) HERANÇA DE CPF: se o principal estava sem CPF e o grupo tinha um, grava agora
    //    (só é possível depois do delete acima, que libera o índice UNIQUE do CPF).
    if (!cpfPrincipal && cpfGrupo) {
      await conn.execute(`UPDATE pessoas_fisicas SET cpf = ? WHERE id = ?`, [cpfGrupo, principalId]);
    }

    // 9) Auditoria dentro da MESMA transação (falha aqui desfaz tudo).
    await auditoria.registrar(
      req.usuario.id, 'pessoas_fisicas', 'unificar', principalId, null,
      { unificados: duplicados, cpf_herdado: (!cpfPrincipal && cpfGrupo) ? cpfGrupo : null }, conn
    );

    await conn.commit();
    return sucesso(res, { principal_id: principalId, unificados: duplicados.length },
      `${duplicados.length} cadastro(s) unificado(s) no principal com sucesso`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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

    // Filtro de busca abrangente (mesma condição reutilizada na exportação — ver condBuscaJuridica)
    if (busca) {
      const f = condBuscaJuridica(busca);
      where += f.cond;
      params.push(...f.params);
    }

    // Nota: LIMIT e OFFSET inseridos diretamente (sanitizados com parseInt — MySQL 8 não aceita ? em LIMIT/OFFSET)
    const [rows] = await pool.execute(
      `SELECT pj.id, pj.razao_social, pj.nome_fantasia, pj.cnpj,
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
    razao_social, nome_fantasia, cnpj, inscricao_estadual,
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
         (razao_social, nome_fantasia, cnpj, inscricao_estadual,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        razao_social.trim(), nome_fantasia || null,
        cnpj?.replace(/\D/g, '') || null, inscricao_estadual || null,
        cep || null, logradouro || null,
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

    // Auditoria participa da MESMA transação (tudo ou nada): grava antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'criar', pessoaId, null, null, conn);
    await conn.commit();         // Grava tudo de uma vez — empresa + telefones + e-mails + auditoria
    return sucesso(res, { id: pessoaId }, 'Pessoa jurídica cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// GET /api/pessoas/juridicas/:id — Busca uma empresa com telefones e e-mails (para a tela de edição)
async function buscarJuridica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Pessoa jurídica não encontrada');
    const pessoa = rows[0];

    const [telefones] = await pool.execute(
      'SELECT * FROM telefones_pj WHERE pessoa_id = ? ORDER BY principal DESC, id ASC', [id]
    );
    const [emails] = await pool.execute(
      'SELECT * FROM emails_pj WHERE pessoa_id = ? ORDER BY principal DESC, id ASC', [id]
    );

    return sucesso(res, { ...pessoa, telefones, emails });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pessoas/juridicas/:id — Atualiza uma pessoa jurídica.
// (Esta função FALTAVA: a edição de empresa caía por engano na atualização de PF e dava erro.)
// A tela de edição agora carrega a lista COMPLETA de telefones/e-mails (via buscarJuridica),
// então aqui regravamos exatamente o que está no formulário. NÃO mexe em inscrição estadual
// (não há campo na tela para ela — gravá-la apagaria o valor existente).
async function atualizarJuridica(req, res) {
  const { id } = req.params;
  const {
    razao_social, nome_fantasia, cnpj,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
    telefones = [], emails = []
  } = req.body;

  if (!razao_social) return erro(res, 'A razão social é obrigatória');

  // Transação: dados principais + telefones + e-mails + auditoria gravam juntos ou nada
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [antes] = await conn.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [id]);
    if (!antes.length) { await conn.rollback(); return naoEncontrado(res, 'Pessoa jurídica não encontrada'); }

    await conn.execute(
      `UPDATE pessoas_juridicas SET
         razao_social=?, nome_fantasia=?, cnpj=?,
         cep=?, logradouro=?, numero=?, complemento=?, bairro=?,
         cidade=?, estado=?, observacoes=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [
        razao_social.trim(), nome_fantasia || null, cnpj?.replace(/\D/g, '') || null,
        cep || null, logradouro || null, numero || null, complemento || null, bairro || null,
        cidade || null, estado || null, observacoes || null,
        req.usuario.id, id
      ]
    );

    // Regrava telefones e e-mails conforme o formulário (que carregou a lista completa)
    await conn.execute('DELETE FROM telefones_pj WHERE pessoa_id = ?', [id]);
    for (const tel of telefones) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [id, tel.numero, tel.tipo || 'comercial', tel.principal ? 1 : 0]
        );
      }
    }
    await conn.execute('DELETE FROM emails_pj WHERE pessoa_id = ?', [id]);
    for (const em of emails) {
      if (em.email) {
        await conn.execute(
          'INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [id, em.email, em.principal ? 1 : 0]
        );
      }
    }

    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'editar', id, antes[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pessoa jurídica atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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
      generos:        'genero',
      estados_civis:  'estado_civil',
      profissoes:     'profissao',
      nacionalidades: 'nacionalidade',
    };

    const tabela = tabelas[tipo];
    if (!tabela) return erro(res, 'Tipo inválido. Use: generos, estados_civis, profissoes ou nacionalidades');

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
    const [estados_civis]  = await pool.execute('SELECT * FROM estado_civil ORDER BY nome');
    const [generos]        = await pool.execute('SELECT * FROM genero ORDER BY nome');
    const [profissoes]     = await pool.execute('SELECT * FROM profissao ORDER BY nome');
    const [nacionalidades] = await pool.execute('SELECT * FROM nacionalidade ORDER BY nome');

    return sucesso(res, { estados_civis, generos, profissoes, nacionalidades });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// EXPORTAÇÃO PARA EXCEL (.xlsx) — Pessoas Físicas e Jurídicas
// Exporta a MESMA busca da listagem (sem paginação). Os campos vêm
// da tela (checkboxes) e são validados contra uma LISTA BRANCA: nome de
// coluna NUNCA é montado a partir de texto cru do request (segurança).
// ============================================================

// Lista branca de campos exportáveis de PESSOA FÍSICA (ordem = ordem das colunas no Excel).
const CAMPOS_PF = {
  nome:            { header: 'Nome',               width: 32, sql: 'pf.nome' },
  cpf:             { header: 'CPF',                width: 16, sql: 'pf.cpf' },
  rg:              { header: 'RG',                 width: 14, sql: 'pf.rg' },
  rg_orgao:        { header: 'Órgão RG',           width: 12, sql: 'pf.rg_orgao' },
  pis:             { header: 'PIS',                width: 16, sql: 'pf.pis' },
  ctps_numero:     { header: 'CTPS Nº',            width: 14, sql: 'pf.ctps_numero' },
  ctps_serie:      { header: 'CTPS Série',         width: 12, sql: 'pf.ctps_serie' },
  nome_pai:        { header: 'Nome do pai',        width: 28, sql: 'pf.nome_pai' },
  nome_mae:        { header: 'Nome da mãe',        width: 28, sql: 'pf.nome_mae' },
  data_nascimento: { header: 'Data de nascimento', width: 16, sql: 'pf.data_nascimento', data: true },
  estado_civil:    { header: 'Estado civil',       width: 16, sql: 'ec.nome', join: 'LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id' },
  profissao:       { header: 'Profissão',          width: 22, sql: 'pr.nome', join: 'LEFT JOIN profissao pr ON pf.profissao_id = pr.id' },
  genero:          { header: 'Gênero',             width: 12, sql: 'g.nome',   join: 'LEFT JOIN genero g ON pf.genero_id = g.id' },
  nacionalidade:   { header: 'Nacionalidade',      width: 16, sql: 'nac.nome', join: 'LEFT JOIN nacionalidade nac ON pf.nacionalidade_id = nac.id' },
  cep:             { header: 'CEP',                width: 10, sql: 'pf.cep' },
  logradouro:      { header: 'Logradouro',         width: 30, sql: 'pf.logradouro' },
  numero:          { header: 'Número',             width: 8,  sql: 'pf.numero' },
  complemento:     { header: 'Complemento',        width: 18, sql: 'pf.complemento' },
  bairro:          { header: 'Bairro',             width: 18, sql: 'pf.bairro' },
  cidade:          { header: 'Cidade',             width: 18, sql: 'pf.cidade' },
  estado:          { header: 'UF',                 width: 6,  sql: 'pf.estado' },
  telefone:        { header: 'Telefone',           width: 16, sql: '(SELECT t.numero FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.ativo = 1 ORDER BY t.principal DESC, t.id ASC LIMIT 1)' },
  email:           { header: 'E-mail',             width: 28, sql: '(SELECT e.email FROM emails_pf e WHERE e.pessoa_id = pf.id AND e.ativo = 1 ORDER BY e.principal DESC, e.id ASC LIMIT 1)' },
  observacoes:     { header: 'Observações',        width: 40, sql: 'pf.observacoes' },
};

// Lista branca de campos exportáveis de PESSOA JURÍDICA.
const CAMPOS_PJ = {
  razao_social:        { header: 'Razão social',       width: 32, sql: 'pj.razao_social' },
  nome_fantasia:       { header: 'Nome fantasia',      width: 28, sql: 'pj.nome_fantasia' },
  cnpj:                { header: 'CNPJ',               width: 20, sql: 'pj.cnpj' },
  inscricao_estadual:  { header: 'Inscrição estadual', width: 18, sql: 'pj.inscricao_estadual' },
  cep:                 { header: 'CEP',                width: 10, sql: 'pj.cep' },
  logradouro:          { header: 'Logradouro',         width: 30, sql: 'pj.logradouro' },
  numero:              { header: 'Número',             width: 8,  sql: 'pj.numero' },
  complemento:         { header: 'Complemento',        width: 18, sql: 'pj.complemento' },
  bairro:              { header: 'Bairro',             width: 18, sql: 'pj.bairro' },
  cidade:              { header: 'Cidade',             width: 18, sql: 'pj.cidade' },
  estado:              { header: 'UF',                 width: 6,  sql: 'pj.estado' },
  telefone:            { header: 'Telefone',           width: 16, sql: '(SELECT t.numero FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.ativo = 1 ORDER BY t.principal DESC, t.id ASC LIMIT 1)' },
  email:               { header: 'E-mail',             width: 28, sql: '(SELECT e.email FROM emails_pj e WHERE e.pessoa_id = pj.id AND e.ativo = 1 ORDER BY e.principal DESC, e.id ASC LIMIT 1)' },
  observacoes:         { header: 'Observações',        width: 40, sql: 'pj.observacoes' },
};

// Monta o arquivo .xlsx a partir das linhas + a lista branca de campos escolhidos.
async function gerarExcelPessoas(res, { rows, ordem, mapa, aba, nomeArquivo }) {
  const ExcelJS = require('exceljs');               // require lazy: não derruba o boot se faltar a lib
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(aba);
  ws.columns = ordem.map(k => ({ header: mapa[k].header, key: k, width: mapa[k].width }));
  ws.getRow(1).font = { bold: true };
  const fmtData = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
  for (const r of rows) {
    const linha = {};
    for (const k of ordem) linha[k] = mapa[k].data ? fmtData(r[k]) : (r[k] == null ? '' : r[k]);
    ws.addRow(linha);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  await wb.xlsx.write(res);
  res.end();
}

// GET /api/pessoas/fisicas/exportar — exporta a busca atual (ou tudo) em Excel
async function exportarFisicas(req, res) {
  try {
    const { busca, campos } = req.query;
    // valida os campos pedidos contra a lista branca; mantém a ordem canônica do mapa
    const pedidos = (campos ? String(campos).split(',') : []);
    let ordem = Object.keys(CAMPOS_PF).filter(k => pedidos.includes(k));
    if (!ordem.length) ordem = ['nome'];

    const selectParts = ordem.map(k => `${CAMPOS_PF[k].sql} AS ${k}`);
    const joins = [...new Set(ordem.map(k => CAMPOS_PF[k].join).filter(Boolean))].join(' ');

    let where = 'WHERE pf.ativo = 1';
    const params = [];
    if (busca) { const f = condBuscaFisica(busca); where += f.cond; params.push(...f.params); }

    const [rows] = await pool.execute(
      `SELECT ${selectParts.join(', ')} FROM pessoas_fisicas pf ${joins} ${where} ORDER BY pf.nome ASC LIMIT 50000`,
      params
    );

    const [y, m, d] = hojeBrasilia().split('-');
    await gerarExcelPessoas(res, { rows, ordem, mapa: CAMPOS_PF, aba: 'Pessoas Físicas', nomeArquivo: `Pessoas Físicas - ${d}-${m}-${y}.xlsx` });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/juridicas/exportar — exporta a busca atual (ou tudo) em Excel
async function exportarJuridicas(req, res) {
  try {
    const { busca, campos } = req.query;
    const pedidos = (campos ? String(campos).split(',') : []);
    let ordem = Object.keys(CAMPOS_PJ).filter(k => pedidos.includes(k));
    if (!ordem.length) ordem = ['razao_social'];

    const selectParts = ordem.map(k => `${CAMPOS_PJ[k].sql} AS ${k}`);
    const joins = [...new Set(ordem.map(k => CAMPOS_PJ[k].join).filter(Boolean))].join(' ');

    let where = 'WHERE pj.ativo = 1';
    const params = [];
    if (busca) { const f = condBuscaJuridica(busca); where += f.cond; params.push(...f.params); }

    const [rows] = await pool.execute(
      `SELECT ${selectParts.join(', ')} FROM pessoas_juridicas pj ${joins} ${where} ORDER BY pj.razao_social ASC LIMIT 50000`,
      params
    );

    const [y, m, d] = hojeBrasilia().split('-');
    await gerarExcelPessoas(res, { rows, ordem, mapa: CAMPOS_PJ, aba: 'Pessoas Jurídicas', nomeArquivo: `Pessoas Jurídicas - ${d}-${m}-${y}.xlsx` });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/:tipo/:id/processos — Lista os processos de uma pessoa (física ou jurídica)
// Junta os papéis de AUTOR e RÉU sem repetir o mesmo processo. Usado ao clicar na "Qtde Proc".
// NÃO filtra por processo ativo, para bater exatamente com a contagem mostrada na coluna.
async function processosDaPessoa(req, res) {
  try {
    const { tipo: tipoParam, id } = req.params;
    // O parâmetro da rota é 'fisicas'/'juridicas'; nas tabelas de partes é 'fisica'/'juridica'
    const tipo = tipoParam === 'juridicas' ? 'juridica'
               : tipoParam === 'fisicas'   ? 'fisica'
               : null;
    if (!tipo) return erro(res, 'Tipo de pessoa inválido');

    const [rows] = await pool.execute(
      `SELECT
         pr.id, pr.numProc,
         pr.NomeTituloProc                       AS titulo,
         LPAD(pa.numPasta, 4, '0')               AS pasta_numero_fmt,
         sp.nome                                 AS status_nome,
         tp.nome                                 AS tipo_nome,
         v.abrev_nome                            AS vara_abrev_nome,
         v.nome                                  AS vara_nome,
         f.abrev_nome                            AS forum_abrev_nome,
         f.nome                                  AS forum_nome
       FROM tblproc pr
       JOIN tblpasta pa            ON pr.pasta_id   = pa.id
       LEFT JOIN tblvara v         ON pr.vara_id    = v.id
       LEFT JOIN tblforum f        ON v.forum_id    = f.id
       LEFT JOIN tbltipoproc tp    ON pr.tipo_id    = tp.id
       LEFT JOIN tblstatusproc sp  ON pr.status_id  = sp.id
       WHERE pr.id IN (
               SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?
               UNION
               SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = ? AND pessoa_id = ?
             )
       ORDER BY pa.numPasta DESC, pr.id DESC`,
      [tipo, id, tipo, id]
    );

    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  listarFisicas, buscarFisica, criarFisica, atualizarFisica, excluirFisica, unificarFisicas, adicionarHistorico,
  listarJuridicas, buscarJuridica, criarJuridica, atualizarJuridica, excluirJuridica, unificarJuridicas, buscarAuxiliares, buscarPorCPF, criarAuxiliar,
  processosDaPessoa, exportarFisicas, exportarJuridicas
};
