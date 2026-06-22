// ============================================================
// CONTROLLER DE PUBLICAÇÕES
// ------------------------------------------------------------
// Fonte atual: AASP (API de Intimações). A tela é preparada para outras
// fontes no futuro (coluna `fonte`). Fluxo:
//   - importar: baixa as publicações de UM dia da AASP e salva só as NOVAS
//     (dedup pela "impressão digital"/hash do texto inteiro — fiel: 1 letra
//     diferente já é outra publicação). Quem importa é registrado como leitor.
//   - listar: lista/pesquisa as publicações salvas, respeitando a visibilidade
//     (admin vê tudo; demais veem as do escritório + as direcionadas a eles).
//   - direcionar: manda a publicação para o escritório (todos) ou para
//     usuários específicos (um ou vários).
//   - tratar/reabrir, excluir, histórico (lido das colunas — sem tabela extra).
// ============================================================

const crypto = require('crypto');
const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const aaspService = require('../services/aaspService');

// Admin (superusuário ou administrador) enxerga todas as publicações.
function ehAdmin(req) {
  return Number(req.usuario.nivel) <= 1;
}

// "Impressão digital" (SHA-256) do texto EXATO da publicação — base da dedup fiel.
function hashTexto(texto) {
  return crypto.createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

// Lê a configuração da AASP (Configurações → Integrações). Retorna { ativo, chave, url }.
// A URL e a chave são configuração do escritório (nunca ficam no código/.env).
async function lerConfigAasp() {
  const [rows] = await pool.execute(
    `SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'aasp' LIMIT 1`
  );
  if (!rows.length) return { ativo: false, chave: null, url: null };
  const cfg = rows[0].configuracoes
    ? (typeof rows[0].configuracoes === 'string' ? JSON.parse(rows[0].configuracoes) : rows[0].configuracoes)
    : {};
  return { ativo: !!rows[0].ativo, chave: cfg.chave || null, url: cfg.url || null };
}

// GET /api/publicacoes/aasp/status — diz se a AASP está configurada (para a tela avisar).
async function statusAasp(req, res) {
  try {
    const cfg = await lerConfigAasp();
    // Só está "configurado" com integração ativa + chave + URL preenchidas.
    return sucesso(res, { configurado: !!(cfg.ativo && cfg.chave && cfg.url) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/publicacoes — lista/pesquisa publicações salvas (com visibilidade e paginação).
// Filtros: data (data_publicacao exata), tratada ('0'|'1'|''), busca (trecho do conteúdo),
//          escopo ('todas' = tudo que o usuário pode ver | 'minhas' = só as direcionadas a ele).
async function listar(req, res) {
  try {
    const { data, tratada, busca, escopo } = req.query;
    const limitInt  = parseInt(req.query.limite) || 30;
    const offsetInt = ((parseInt(req.query.pagina) || 1) - 1) * limitInt;

    const cond = [];
    const params = [];

    if (data)    { cond.push('p.data_publicacao = ?'); params.push(data); }
    if (tratada === '0' || tratada === '1') { cond.push('p.tratada = ?'); params.push(tratada); }
    // Pesquisa por conteúdo (e, de brinde, pelo número do processo).
    if (busca && busca.trim()) {
      cond.push('(p.texto LIKE ? OR p.numero_processo LIKE ?)');
      params.push(`%${busca.trim()}%`, `%${busca.trim()}%`);
    }

    if (escopo === 'minhas') {
      // "Direcionadas a mim": só as que foram direcionadas pessoalmente ao usuário logado
      // (não traz as gerais do escritório). Vale para qualquer nível, inclusive admin.
      cond.push('EXISTS (SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?)');
      params.push(req.usuario.id);
    } else if (!ehAdmin(req)) {
      // "Todas" (padrão): visibilidade normal — não-admin vê as do escritório OU as direcionadas a ele.
      cond.push('(p.escritorio = 1 OR EXISTS (SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?))');
      params.push(req.usuario.id);
    }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    // direcionada_nomes: lista (resolvida na leitura) dos usuários direcionados.
    // duplicada: 1 quando existe OUTRA publicação de TEXTO idêntico no MESMO dia com id menor.
    //   Assim, num grupo de iguais, todas as cópias ficam marcadas (=pintadas na tela) menos a
    //   mais antiga (a "original"), ajudando o usuário a identificar quais excluir manualmente.
    const [rows] = await pool.execute(
      `SELECT p.id, p.fonte, p.data_publicacao, p.numero_processo, p.numero_publicacao,
              p.titulo, p.cabecalho, p.texto, p.escritorio, p.tratada, p.tratada_em,
              ut.nome AS tratada_por_nome,
              (SELECT GROUP_CONCAT(u.nome SEPARATOR ', ')
                 FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
                WHERE pu.publicacao_id = p.id) AS direcionada_nomes,
              EXISTS (SELECT 1 FROM publicacoes p2
                       WHERE p2.data_publicacao = p.data_publicacao
                         AND p2.texto_hash = p.texto_hash
                         AND p2.id < p.id) AS duplicada
       FROM publicacoes p
       LEFT JOIN usuarios ut ON p.tratada_por = ut.id
       ${where}
       ORDER BY p.data_publicacao DESC, p.id DESC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );

    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM publicacoes p ${where}`, params
    );

    return sucesso(res, { registros: rows, total: totalRows[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/publicacoes/importar — baixa as publicações de um dia da AASP e salva as novas.
// Body: { data: 'YYYY-MM-DD' }
async function importar(req, res) {
  try {
    const { data } = req.body;
    if (!data) return erro(res, 'Informe a data');

    const cfg = await lerConfigAasp();
    if (!cfg.ativo || !cfg.chave || !cfg.url) {
      // Sem AASP configurada (falta ativar, chave ou URL): NÃO é erro — a tela mostra aviso amigável.
      return sucesso(res, { configurado: false }, 'A integração com a AASP não está configurada. Configure em Configurações → Integrações.');
    }

    // Busca na AASP (o serviço já lança mensagem amigável em caso de falha).
    // A URL vem da configuração (Configurações → Integrações), não do código.
    let intimacoes;
    try {
      intimacoes = await aaspService.buscarIntimacoes(cfg.chave, data, cfg.url);
    } catch (e) {
      return erro(res, e.message || 'Falha ao consultar a AASP');
    }

    // Monta a lista de candidatos (com hash do texto) e ignora textos vazios.
    const candidatos = [];
    for (const it of intimacoes) {
      const texto = it.textoPublicacao;
      if (!texto || !String(texto).trim()) continue;
      candidatos.push({
        texto,
        hash: hashTexto(texto),
        numero_processo: it.numeroUnicoProcesso || null,
        titulo: it.titulo || null,
        cabecalho: it.cabecalho || null,
        numero_publicacao: it.numeroPublicacao != null ? String(it.numeroPublicacao) : null,
        numero_arquivo: it.numeroArquivo != null ? String(it.numeroArquivo) : null,
        // Data de disponibilização vem dentro do objeto "jornal"; cai para a data buscada se faltar.
        data_publicacao: (it.jornal && it.jornal.dataDisponibilizacao_Publicacao
          ? String(it.jornal.dataDisponibilizacao_Publicacao).slice(0, 10) : data),
      });
    }

    if (!candidatos.length) {
      return sucesso(res, { configurado: true, novas: 0, recebidas: intimacoes.length },
        'Nenhuma publicação encontrada nesta data.');
    }

    // Dedup de IMPORTAÇÃO por numeroPublicacao (que a AASP garante ÚNICO por dia).
    // Assim TODAS as publicações do dia entram — inclusive textos iguais com numeroPublicacao
    // diferente — e o usuário exclui manualmente as que considerar repetidas. Re-rodar o dia
    // só traz numeroPublicacao que ainda não existem (não duplica nem apaga nada).
    // Quando a AASP NÃO manda numeroPublicacao, caímos no texto (hash) para não reinserir à toa.
    // Chave: 'np:<dia>|<numeroPublicacao>'  ou  'hx:<hash>' (fallback sem numeroPublicacao).
    const chaveDedup = (c) =>
      (c.numero_publicacao != null && c.numero_publicacao !== '')
        ? `np:${c.data_publicacao}|${c.numero_publicacao}`
        : `hx:${c.hash}`;

    // O que já existe no banco PARA OS DIAS deste lote (numeroPublicacao e hash).
    const dias = [...new Set(candidatos.map(c => c.data_publicacao))];
    const phDias = dias.map(() => '?').join(',');
    const [exist] = await pool.execute(
      `SELECT DATE_FORMAT(data_publicacao,'%Y-%m-%d') AS dia, numero_publicacao, texto_hash
         FROM publicacoes WHERE data_publicacao IN (${phDias})`, dias
    );
    const jaExistem = new Set();
    for (const r of exist) {
      jaExistem.add(
        (r.numero_publicacao != null && r.numero_publicacao !== '')
          ? `np:${r.dia}|${r.numero_publicacao}`
          : `hx:${r.texto_hash}`
      );
    }

    // Filtra os novos (e evita duplicar dentro do próprio lote pela mesma chave).
    const novos = [];
    const vistosNoLote = new Set();
    for (const c of candidatos) {
      const k = chaveDedup(c);
      if (jaExistem.has(k) || vistosNoLote.has(k)) continue;
      vistosNoLote.add(k);
      novos.push(c);
    }

    if (!novos.length) {
      return sucesso(res, { configurado: true, novas: 0, recebidas: intimacoes.length },
        'Nenhuma publicação nova (todas já estavam no sistema).');
    }

    // Insere as novas em transação (tudo ou nada). Quem importou = leitor.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const c of novos) {
        await conn.execute(
          `INSERT INTO publicacoes
             (fonte, data_publicacao, numero_processo, titulo, cabecalho,
              numero_publicacao, numero_arquivo, texto, texto_hash, escritorio, importada_por)
           VALUES ('aasp', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [c.data_publicacao, c.numero_processo, c.titulo, c.cabecalho,
           c.numero_publicacao, c.numero_arquivo, c.texto, c.hash, req.usuario.id]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      return erroInterno(res, e);
    } finally {
      conn.release();
    }

    return sucesso(res, { configurado: true, novas: novos.length, recebidas: intimacoes.length },
      `${novos.length} nova(s) publicação(ões) importada(s).`);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/publicacoes/:id/direcionar — direciona ao escritório (todos) ou a usuários específicos.
// Body: { escritorio: true }  OU  { escritorio: false, usuario_ids: [..] }
async function direcionar(req, res) {
  const { id } = req.params;
  const escritorio = !!req.body.escritorio;

  // Sanitiza os IDs de usuário (inteiros>0, sem repetição).
  const usuarioIds = [...new Set(
    (Array.isArray(req.body.usuario_ids) ? req.body.usuario_ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0)
  )];

  if (!escritorio && !usuarioIds.length) {
    return erro(res, 'Escolha "escritório" ou ao menos um usuário');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pub] = await conn.execute('SELECT id FROM publicacoes WHERE id = ?', [id]);
    if (!pub.length) { await conn.rollback(); return naoEncontrado(res, 'Publicação não encontrada'); }

    await conn.execute(
      'UPDATE publicacoes SET escritorio = ?, direcionada_por = ?, direcionada_em = NOW() WHERE id = ?',
      [escritorio ? 1 : 0, req.usuario.id, id]
    );

    // Refaz os vínculos: limpa e (se for direcionada) insere os escolhidos.
    await conn.execute('DELETE FROM publicacao_usuario WHERE publicacao_id = ?', [id]);
    if (!escritorio) {
      for (const uid of usuarioIds) {
        await conn.execute(
          'INSERT INTO publicacao_usuario (publicacao_id, usuario_id) VALUES (?, ?)', [id, uid]
        );
      }
    }

    await conn.commit();
    return sucesso(res, null, escritorio ? 'Direcionada ao escritório' : 'Direcionada aos usuários escolhidos');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/publicacoes/:id/tratar — marca/desmarca como tratada. Body: { tratada: bool }
async function tratar(req, res) {
  try {
    const { id } = req.params;
    const tratada = !!req.body.tratada;
    const [exists] = await pool.execute('SELECT id FROM publicacoes WHERE id = ?', [id]);
    if (!exists.length) return naoEncontrado(res, 'Publicação não encontrada');

    if (tratada) {
      await pool.execute(
        'UPDATE publicacoes SET tratada = 1, tratada_por = ?, tratada_em = NOW() WHERE id = ?',
        [req.usuario.id, id]
      );
    } else {
      await pool.execute(
        'UPDATE publicacoes SET tratada = 0, tratada_por = NULL, tratada_em = NULL WHERE id = ?', [id]
      );
    }
    return sucesso(res, null, tratada ? 'Publicação marcada como tratada' : 'Publicação reaberta');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/publicacoes/usuarios — usuários ativos para o modal de direcionamento
// (exclui o superusuário invisível, nivel 0).
async function usuariosParaDirecionar(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, nome FROM usuarios WHERE ativo = 1 AND nivel > 0 ORDER BY nome`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/publicacoes/:id/historico — histórico montado a partir das colunas (sem tabela extra).
async function historico(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT p.id, p.criado_em, p.escritorio, p.direcionada_em, p.tratada, p.tratada_em,
              ui.nome AS importada_por_nome,
              ud.nome AS direcionada_por_nome,
              ut.nome AS tratada_por_nome
       FROM publicacoes p
       LEFT JOIN usuarios ui ON p.importada_por = ui.id
       LEFT JOIN usuarios ud ON p.direcionada_por = ud.id
       LEFT JOIN usuarios ut ON p.tratada_por = ut.id
       WHERE p.id = ?`, [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Publicação não encontrada');

    const [usuarios] = await pool.execute(
      `SELECT u.nome FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
       WHERE pu.publicacao_id = ? ORDER BY u.nome`, [id]
    );

    return sucesso(res, {
      ...rows[0],
      direcionada_usuarios: usuarios.map(u => u.nome),
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/publicacoes/:id — exclui a publicação (vínculos caem por CASCADE) + registra log.
async function excluir(req, res) {
  const { id } = req.params;
  const [pub] = await pool.execute('SELECT data_publicacao FROM publicacoes WHERE id = ?', [id]);
  if (!pub.length) return naoEncontrado(res, 'Publicação não encontrada');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM publicacoes WHERE id = ?', [id]);
    await conn.execute(
      `INSERT INTO log_publicacoes (usuario_id, quantidade, data_publicacao) VALUES (?, 1, ?)`,
      [req.usuario.id, pub[0].data_publicacao]
    );
    await conn.commit();
    return sucesso(res, null, 'Publicação excluída');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = { statusAasp, listar, importar, direcionar, tratar, historico, excluir, usuariosParaDirecionar };
