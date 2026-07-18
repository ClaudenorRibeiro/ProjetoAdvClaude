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
const cnjService = require('../services/cnjService');

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

// Lê a configuração do CNJ/DJEN (Configurações → Integrações). Retorna { ativo, url, oabs }.
// A consulta do CNJ é pública (sem chave); guardamos só a lista de OABs a monitorar e a URL.
async function lerConfigCnj() {
  const [rows] = await pool.execute(
    `SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'cnj' LIMIT 1`
  );
  if (!rows.length) return { ativo: false, url: null, oabs: [] };
  const cfg = rows[0].configuracoes
    ? (typeof rows[0].configuracoes === 'string' ? JSON.parse(rows[0].configuracoes) : rows[0].configuracoes)
    : {};
  const oabs = Array.isArray(cfg.oabs) ? cfg.oabs : [];
  return { ativo: !!rows[0].ativo, url: cfg.url || null, oabs };
}

// GET /api/publicacoes/cnj/status — diz se o CNJ está configurado (ativo + ao menos 1 OAB).
async function statusCnj(req, res) {
  try {
    const cfg = await lerConfigCnj();
    const temOab = cfg.oabs.some(o => o && o.numero && o.uf);
    return sucesso(res, { configurado: !!(cfg.ativo && temOab) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/publicacoes/cnj/importar — baixa as comunicações do DJEN de um PERÍODO,
// para TODAS as OABs configuradas, e salva as novas (fonte='cnj'). Body: { dataInicio, dataFim }.
// Dedup pelo id do CNJ (único por comunicação) — re-rodar o período não duplica.
async function importarCnj(req, res) {
  try {
    const { dataInicio, dataFim } = req.body;
    if (!dataInicio || !dataFim)  return erro(res, 'Informe o período (início e fim)');
    if (dataFim < dataInicio)     return erro(res, 'A data final não pode ser anterior à inicial');
    if (periodoExcede(dataInicio, dataFim)) return erro(res, 'O período de busca não pode passar de 3 meses.');

    const cfg = await lerConfigCnj();
    const oabs = cfg.oabs.filter(o => o && o.numero && o.uf);
    if (!cfg.ativo || !oabs.length) {
      // Sem CNJ configurado: NÃO é erro — a tela mostra aviso amigável.
      return sucesso(res, { configurado: false },
        'A integração com o CNJ não está configurada. Configure em Configurações → Integrações.');
    }

    // Busca no CNJ para cada OAB configurada e junta tudo.
    let itens = [];
    try {
      for (const o of oabs) {
        const lote = await cnjService.buscarComunicacoes({
          url: cfg.url,
          numeroOab: String(o.numero).trim(),
          ufOab: String(o.uf).trim().toUpperCase(),
          dataInicio, dataFim,
        });
        itens = itens.concat(lote);
      }
    } catch (e) {
      return erro(res, e.message || 'Falha ao consultar o CNJ');
    }

    // Monta candidatos com o id do CNJ (chave de dedup). Ignora sem id ou texto vazio.
    const candidatos = [];
    for (const it of itens) {
      const texto = it.texto;
      if (it.id == null || !texto || !String(texto).trim()) continue;
      candidatos.push({
        id_cnj: Number(it.id),
        texto,
        hash: hashTexto(texto),
        tribunal: it.siglaTribunal || null,
        numero_processo: it.numeroprocessocommascara || it.numero_processo || null,
        cabecalho: it.tipoComunicacao || null,   // "tipo" (Intimação, Edital...)
        titulo: it.nomeOrgao || null,             // órgão/vara
        numero_publicacao: it.numeroComunicacao != null ? String(it.numeroComunicacao) : null,
        hash_cnj: it.hash || null,                // usado para baixar a certidão em PDF
        data_publicacao: it.data_disponibilizacao
          ? String(it.data_disponibilizacao).slice(0, 10) : dataInicio,
      });
    }

    if (!candidatos.length) {
      return sucesso(res, { configurado: true, novas: 0, recebidas: itens.length },
        'Nenhuma publicação encontrada neste período.');
    }

    // O que já existe no banco (por id do CNJ), para não reinserir.
    const ids = [...new Set(candidatos.map(c => c.id_cnj))];
    const phIds = ids.map(() => '?').join(',');
    const [exist] = await pool.execute(
      `SELECT id_cnj FROM publicacoes WHERE fonte = 'cnj' AND id_cnj IN (${phIds})`, ids
    );
    const jaExistem = new Set(exist.map(r => Number(r.id_cnj)));

    // Filtra os novos (e evita duplicar dentro do próprio lote — a mesma comunicação
    // pode voltar para mais de uma OAB da lista).
    const novos = [];
    const vistosNoLote = new Set();
    for (const c of candidatos) {
      if (jaExistem.has(c.id_cnj) || vistosNoLote.has(c.id_cnj)) continue;
      vistosNoLote.add(c.id_cnj);
      novos.push(c);
    }

    if (!novos.length) {
      return sucesso(res, { configurado: true, novas: 0, recebidas: itens.length },
        'Nenhuma publicação nova (todas já estavam no sistema).');
    }

    // Insere as novas em transação (tudo ou nada). Quem importou = leitor.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const c of novos) {
        await conn.execute(
          `INSERT INTO publicacoes
             (fonte, id_cnj, data_publicacao, numero_processo, tribunal, titulo, cabecalho,
              numero_publicacao, texto, texto_hash, hash_cnj, escritorio, importada_por)
           VALUES ('cnj', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [c.id_cnj, c.data_publicacao, c.numero_processo, c.tribunal, c.titulo, c.cabecalho,
           c.numero_publicacao, c.texto, c.hash, c.hash_cnj, req.usuario.id]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      return erroInterno(res, e);
    } finally {
      conn.release();
    }

    return sucesso(res, { configurado: true, novas: novos.length, recebidas: itens.length },
      `${novos.length} nova(s) publicação(ões) importada(s).`);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Colunas permitidas na ordenação (LISTA BRANCA — nome de coluna nunca vem solto
// do usuário para dentro do SQL). A tela manda a "chave"; aqui vira a coluna real.
const COLUNAS_ORDENAR = {
  data:        'p.data_publicacao',
  processo:    'p.numero_processo',
  publicacao:  'p.numero_publicacao',   // "Nº Publ." (AASP)
  tribunal:    'p.tribunal',            // (CNJ)
  conteudo:    'LEFT(p.texto, 200)',    // ordena pelos primeiros caracteres — não pesa no texto inteiro
  direcionada: 'p.escritorio',          // por tipo (escritório x específico)
  status:      'p.tratada',
};

// Trava de 3 meses da PESQUISA: true se o período De→Até passar de 3 meses.
function periodoExcede(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return false;
  const ini = new Date(dataInicio + 'T00:00:00');
  const fim = new Date(dataFim + 'T00:00:00');
  if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return false;
  const limite = new Date(ini); limite.setMonth(limite.getMonth() + 3);
  return fim > limite;
}

// Monta o WHERE de listagem/exclusão de publicações a partir dos filtros da tela.
// Usado por listar() E por excluirLote() para ficarem SEMPRE em sincronia (mesmo recorte
// que o usuário vê é o que pode apagar). `q` é o objeto de filtros (req.query ou req.body):
//   { fonte, data, tratada, busca, escopo }. Retorna { where, params, fonte }.
function montarFiltroPublicacoes(q, usuario) {
  const cond = [];
  const params = [];

  // Cada aba age SÓ na sua fonte (telas separadas: AASP x CNJ). Sem o parâmetro
  // `fonte`, mantém o comportamento original (AASP).
  const fonte = q.fonte === 'cnj' ? 'cnj' : 'aasp';
  cond.push('p.fonte = ?'); params.push(fonte);

  // Janela de datas (De/Até). Sem datas = sem filtro de data (mostra tudo, paginado).
  if (q.dataInicio && q.dataFim) { cond.push('p.data_publicacao BETWEEN ? AND ?'); params.push(q.dataInicio, q.dataFim); }
  else if (q.dataInicio)         { cond.push('p.data_publicacao >= ?'); params.push(q.dataInicio); }
  else if (q.dataFim)            { cond.push('p.data_publicacao <= ?'); params.push(q.dataFim); }
  if (q.tratada === '0' || q.tratada === '1') { cond.push('p.tratada = ?'); params.push(q.tratada); }
  // Pesquisa por conteúdo (e, de brinde, pelo número do processo).
  if (q.busca && q.busca.trim()) {
    cond.push('(p.texto LIKE ? OR p.numero_processo LIKE ?)');
    params.push(`%${q.busca.trim()}%`, `%${q.busca.trim()}%`);
  }

  if (q.escopo === 'minhas') {
    // "Direcionadas a mim": só as direcionadas pessoalmente ao usuário logado (não as gerais
    // do escritório). Vale para qualquer nível, inclusive admin.
    cond.push('EXISTS (SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?)');
    params.push(usuario.id);
  } else if (Number(usuario.nivel) > 1) {
    // Visibilidade normal — não-admin vê/apaga as do escritório OU as direcionadas a ele.
    cond.push('(p.escritorio = 1 OR EXISTS (SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?))');
    params.push(usuario.id);
  }
  return { where: 'WHERE ' + cond.join(' AND '), params, fonte };
}

// GET /api/publicacoes — lista/pesquisa publicações salvas (com visibilidade e paginação).
// Filtros: data (data_publicacao exata), tratada ('0'|'1'|''), busca (trecho do conteúdo),
//          escopo ('todas' = tudo que o usuário pode ver | 'minhas' = só as direcionadas a ele).
async function listar(req, res) {
  try {
    const limitInt  = parseInt(req.query.limite) || 30;
    const offsetInt = ((parseInt(req.query.pagina) || 1) - 1) * limitInt;

    // Trava de 3 meses na pesquisa (defesa no servidor, além da tela).
    if (periodoExcede(req.query.dataInicio, req.query.dataFim)) {
      return erro(res, 'O período de pesquisa não pode passar de 3 meses.');
    }

    const { where, params } = montarFiltroPublicacoes(req.query, req.usuario);

    // Ordenação: coluna vem da LISTA BRANCA; direção só 'asc'/'desc'. Padrão = Data mais recente.
    const col = COLUNAS_ORDENAR[req.query.ordenar];
    const dir = req.query.direcao === 'asc' ? 'ASC' : (req.query.direcao === 'desc' ? 'DESC' : null);
    const orderBy = (col && dir)
      ? `ORDER BY ${col} ${dir}, p.id ${dir}`
      : 'ORDER BY p.data_publicacao DESC, p.id DESC';

    // direcionada_nomes: lista (resolvida na leitura) dos usuários direcionados.
    // duplicada: 1 quando existe OUTRA publicação de TEXTO idêntico no MESMO dia com id menor.
    //   Assim, num grupo de iguais, todas as cópias ficam marcadas (=pintadas na tela) menos a
    //   mais antiga (a "original"), ajudando o usuário a identificar quais excluir manualmente.
    const [rows] = await pool.execute(
      `SELECT p.id, p.fonte, p.data_publicacao, p.numero_processo, p.numero_publicacao,
              p.tribunal, p.hash_cnj,
              p.titulo, p.cabecalho, p.texto, p.escritorio, p.tratada, p.tratada_em,
              ut.nome AS tratada_por_nome,
              (SELECT GROUP_CONCAT(u.nome SEPARATOR ', ')
                 FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
                WHERE pu.publicacao_id = p.id) AS direcionada_nomes,
              EXISTS (SELECT 1 FROM publicacoes p2
                       WHERE p2.data_publicacao = p.data_publicacao
                         AND p2.texto_hash = p.texto_hash
                         AND p2.fonte = p.fonte
                         AND p2.id < p.id) AS duplicada
       FROM publicacoes p
       LEFT JOIN usuarios ut ON p.tratada_por = ut.id
       ${where}
       ${orderBy}
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

// POST /api/publicacoes/excluir-lote — exclui VÁRIAS publicações de uma vez (transação).
// Sempre preso à FONTE da aba e à VISIBILIDADE do usuário (reusa o mesmo filtro da listagem).
// Body:
//   { fonte, todas: true, data?, tratada?, busca?, escopo? }  → apaga TODAS as que batem com
//        os filtros atuais (quando não há filtro, é a fonte inteira daquela aba); OU
//   { fonte, ids: [..] }                                       → apaga só as selecionadas.
// Os vínculos em publicacao_usuario caem por CASCADE (sem órfãos). Registra o total no log.
async function excluirLote(req, res) {
  const body = req.body || {};
  const todas = !!body.todas;

  // Modo "todas": usa todos os filtros da tela. Modo "seleção": só fonte + visibilidade
  // (as ids escolhidas valem por si, independentemente de data/status/busca da tela).
  let alvoSql, alvoParams;
  if (todas) {
    const { where, params } = montarFiltroPublicacoes(body, req.usuario);
    alvoSql = where; alvoParams = params;
  } else {
    const ids = [...new Set(
      (Array.isArray(body.ids) ? body.ids : [])
        .map(Number).filter(n => Number.isInteger(n) && n > 0)
    )];
    if (!ids.length) return erro(res, 'Nenhuma publicação selecionada');
    const { where, params } = montarFiltroPublicacoes({ fonte: body.fonte }, req.usuario);
    const ph = ids.map(() => '?').join(',');
    alvoSql = `${where} AND p.id IN (${ph})`;
    alvoParams = [...params, ...ids];
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Quanto será apagado, agrupado por dia (para o log manter o padrão da tabela).
    const [resumo] = await conn.execute(
      `SELECT DATE_FORMAT(p.data_publicacao,'%Y-%m-%d') AS dia, COUNT(*) AS qtd
         FROM publicacoes p ${alvoSql} GROUP BY dia`, alvoParams
    );
    const totalExcluir = resumo.reduce((s, r) => s + Number(r.qtd), 0);
    if (!totalExcluir) {
      await conn.rollback();
      return sucesso(res, { excluidas: 0 }, 'Nenhuma publicação para excluir.');
    }

    // Apaga o recorte (os vínculos de publicacao_usuario caem por CASCADE).
    await conn.execute(`DELETE p FROM publicacoes p ${alvoSql}`, alvoParams);

    // Log: uma linha por dia apagado (usuário + quantidade + data).
    for (const r of resumo) {
      await conn.execute(
        `INSERT INTO log_publicacoes (usuario_id, quantidade, data_publicacao) VALUES (?, ?, ?)`,
        [req.usuario.id, Number(r.qtd), r.dia]
      );
    }

    await conn.commit();
    return sucesso(res, { excluidas: totalExcluir }, `${totalExcluir} publicação(ões) excluída(s).`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = {
  statusAasp, listar, importar, direcionar, tratar, historico, excluir, excluirLote, usuariosParaDirecionar,
  statusCnj, importarCnj,
};
