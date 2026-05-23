// ============================================================
// CONTROLLER DE DOCUMENTOS E MODELOS
// Geração de Word e PDF com variáveis automáticas
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { gerarPDF, substituirVariaveis } = require('../services/pdfService');
const { gerarDocumentoDoModelo } = require('../services/docxService');

// GET /api/documentos/modelos — Lista modelos disponíveis
async function listarModelos(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT m.id, m.nome, m.descricao, m.ativo, m.criado_em, u.nome AS criado_por_nome
       FROM modelo_documento m
       LEFT JOIN usuarios u ON m.criado_por = u.id
       WHERE m.ativo = 1
       ORDER BY m.nome ASC`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/documentos/modelos/:id — Busca modelo completo
async function buscarModelo(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM modelo_documento WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado');
    return sucesso(res, rows[0]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/modelos — Cria modelo
async function criarModelo(req, res) {
  try {
    const { nome, descricao, conteudo } = req.body;
    if (!nome || !conteudo) return erro(res, 'Nome e conteúdo são obrigatórios');

    const [result] = await pool.execute(
      'INSERT INTO modelo_documento (nome, descricao, conteudo, criado_por) VALUES (?, ?, ?, ?)',
      [nome.trim(), descricao || null, conteudo, req.usuario.id]
    );
    return sucesso(res, { id: result.insertId }, 'Modelo criado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/documentos/modelos/:id — Atualiza modelo
async function atualizarModelo(req, res) {
  try {
    const { nome, descricao, conteudo } = req.body;
    await pool.execute(
      'UPDATE modelo_documento SET nome=?, descricao=?, conteudo=? WHERE id=?',
      [nome, descricao || null, conteudo, req.params.id]
    );
    return sucesso(res, null, 'Modelo atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/gerar — Gera documento a partir de modelo
async function gerar(req, res) {
  try {
    const { modelo_id, processo_id, pasta_id, formato = 'pdf' } = req.body;

    if (!modelo_id) return erro(res, 'Modelo é obrigatório');

    // Busca o modelo
    const [modelos] = await pool.execute(
      'SELECT * FROM modelo_documento WHERE id = ? AND ativo = 1', [modelo_id]
    );
    if (!modelos.length) return naoEncontrado(res, 'Modelo não encontrado');
    const modelo = modelos[0];

    // Monta as variáveis automáticas
    const variaveis = {};

    const [escritorio] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
    variaveis.nome_escritorio = escritorio[0]?.nome || '';
    variaveis.data_hoje = new Date().toLocaleDateString('pt-BR');

    // Busca dados do usuário logado
    variaveis.nome_advogado = req.usuario.nome;

    // Busca dados do processo/pasta se informados
    if (processo_id) {
      const [proc] = await pool.execute(
        `SELECT pr.numero, v.nome AS vara, f.nome AS forum,
                pa.titulo AS pasta_titulo, pa.area_direito,
                CASE pa.tipo_pessoa
                  WHEN 'fisica' THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = pa.cliente_id)
                  WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = pa.cliente_id)
                END AS cliente_nome,
                CASE pa.tipo_pessoa
                  WHEN 'fisica' THEN (SELECT pf.cpf FROM pessoas_fisicas pf WHERE pf.id = pa.cliente_id)
                  ELSE ''
                END AS cpf_cliente,
                CASE pa.tipo_pessoa
                  WHEN 'fisica' THEN (SELECT pf.endereco FROM pessoas_fisicas pf WHERE pf.id = pa.cliente_id)
                  ELSE ''
                END AS endereco_cliente
         FROM processo pr
         JOIN pasta pa ON pr.pasta_id = pa.id
         LEFT JOIN vara v ON pr.vara_id = v.id
         LEFT JOIN forum f ON v.forum_id = f.id
         WHERE pr.id = ?`,
        [processo_id]
      );

      if (proc.length) {
        variaveis.numero_processo = proc[0].numero || '';
        variaveis.vara            = proc[0].vara || '';
        variaveis.forum           = proc[0].forum || '';
        variaveis.nome_cliente    = proc[0].cliente_nome || '';
        variaveis.cpf_cliente     = proc[0].cpf_cliente || '';
      }
    }

    // Gera o arquivo no formato solicitado
    let buffer;
    let contentType;
    let filename;

    if (formato === 'docx') {
      buffer = await gerarDocumentoDoModelo(modelo.conteudo, variaveis, modelo.nome);
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = `${modelo.nome}.docx`;
    } else {
      const conteudo = substituirVariaveis(modelo.conteudo, variaveis);
      buffer = await gerarPDF(conteudo, modelo.nome);
      contentType = 'application/pdf';
      filename = `${modelo.nome}.pdf`;
    }

    // Salva log da geração
    await pool.execute(
      `INSERT INTO log_documentos_gerados (modelo_id, processo_id, pasta_id, formato, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [modelo_id, processo_id || null, pasta_id || null, formato, req.usuario.id]
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listarModelos, buscarModelo, criarModelo, atualizarModelo, gerar };
