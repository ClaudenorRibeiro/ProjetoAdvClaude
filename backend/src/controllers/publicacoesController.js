// ============================================================
// CONTROLLER DE PUBLICAÇÕES AASP
// Consulta, salvamento incremental e gestão de publicações
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const axios = require('axios');

// GET /api/publicacoes — Lista publicações salvas com filtros
async function listar(req, res) {
  try {
    const { data, oab, tratada, pagina = 1, limite = 50 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (data)    { where += ' AND p.data_publicacao = ?'; params.push(data); }
    if (oab)     { where += ' AND p.oab = ?';            params.push(oab); }
    if (tratada !== undefined) { where += ' AND p.tratada = ?'; params.push(tratada); }

    const limitInt  = parseInt(limite) || 50;
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;

    const [rows] = await pool.execute(
      `SELECT p.id, p.data_publicacao, p.oab, p.numero_processo,
              p.texto, p.tratada, p.tratada_em,
              u.nome AS tratada_por_nome
       FROM publicacoes p
       LEFT JOIN usuarios u ON p.tratada_por = u.id
       ${where}
       ORDER BY p.data_publicacao DESC, p.id DESC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM publicacoes p ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/publicacoes/buscar-aasp — Consulta publicações na AASP e salva no banco
async function buscarNaAAsp(req, res) {
  try {
    const { data } = req.body;
    if (!data) return erro(res, 'Data é obrigatória');

    // Busca credenciais e OABs cadastradas nas configurações
    const [config] = await pool.execute(
      `SELECT configuracoes FROM configuracoes_integracoes WHERE modulo = 'aasp' AND ativo = 1`
    );

    if (!config.length || !config[0].configuracoes) {
      return erro(res, 'Integração AASP não está configurada. Acesse Configurações > Integrações.', 400);
    }

    const cfg = typeof config[0].configuracoes === 'string'
      ? JSON.parse(config[0].configuracoes)
      : config[0].configuracoes;

    const oabs = cfg.oabs || [];
    if (!oabs.length) return erro(res, 'Nenhum número de OAB cadastrado nas configurações');

    // Verifica se já existem publicações para essa data
    const [existentes] = await pool.execute(
      'SELECT id, numero_processo FROM publicacoes WHERE data_publicacao = ?', [data]
    );
    const processosExistentes = new Set(existentes.map(p => p.numero_processo));

    let novasPublicacoes = 0;

    // Consulta a API da AASP para cada OAB cadastrada
    for (const oab of oabs) {
      try {
        const response = await axios.get(`${cfg.api_url || process.env.AASP_API_URL}/publicacoes`, {
          headers: { Authorization: `Bearer ${cfg.token || process.env.AASP_TOKEN}` },
          params: { oab, data },
          timeout: 30000,
        });

        const publicacoes = response.data?.publicacoes || [];

        // Salva apenas as publicações novas (não sobrescreve as existentes)
        for (const pub of publicacoes) {
          const chave = pub.numero_processo || `${oab}_${pub.id}`;
          if (!processosExistentes.has(chave)) {
            await pool.execute(
              `INSERT INTO publicacoes (data_publicacao, oab, numero_processo, texto)
               VALUES (?, ?, ?, ?)`,
              [data, oab, pub.numero_processo || null, pub.texto || pub.conteudo || '']
            );
            processosExistentes.add(chave);
            novasPublicacoes++;
          }
        }
      } catch (apiErr) {
        // Loga erro da OAB específica mas continua para as demais
        console.error(`Erro ao buscar publicações para OAB ${oab}:`, apiErr.message);
      }
    }

    return sucesso(res, { novas: novasPublicacoes, total_salvas: existentes.length + novasPublicacoes },
      `${novasPublicacoes} nova(s) publicação(ões) adicionada(s)`);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/publicacoes/:id/tratar — Marca publicação como tratada
async function marcarTratada(req, res) {
  try {
    const { id } = req.params;
    const [exists] = await pool.execute('SELECT id FROM publicacoes WHERE id = ?', [id]);
    if (!exists.length) return naoEncontrado(res, 'Publicação não encontrada');

    await pool.execute(
      'UPDATE publicacoes SET tratada=1, tratada_por=?, tratada_em=NOW() WHERE id=?',
      [req.usuario.id, id]
    );
    return sucesso(res, null, 'Publicação marcada como tratada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/publicacoes/:id — Exclui publicação
async function excluir(req, res) {
  const { id } = req.params;
  const [pub] = await pool.execute(
    'SELECT data_publicacao FROM publicacoes WHERE id = ?', [id]
  );
  if (!pub.length) return naoEncontrado(res, 'Publicação não encontrada');

  // Transação: DELETE da publicação + INSERT no log — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM publicacoes WHERE id = ?', [id]);

    // Registra no log de exclusões dentro da mesma transação
    await conn.execute(
      `INSERT INTO log_publicacoes (usuario_id, quantidade, data_publicacao)
       VALUES (?, 1, ?)`,
      [req.usuario.id, pub[0].data_publicacao]
    );

    await conn.commit();         // Exclui publicação + registra log de uma vez
    return sucesso(res, null, 'Publicação excluída');
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

module.exports = { listar, buscarNaAAsp, marcarTratada, excluir };
