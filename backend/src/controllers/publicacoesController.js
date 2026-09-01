// ============================================================
// CONTROLLER DE PUBLICAÇÕES
// ------------------------------------------------------------
// Fonte atual: AASP (API de Intimações). A tela é preparada para outras
// fontes no futuro (coluna `fonte`). Fluxo:
//   - importar: baixa as publicações de UM dia da AASP e salva só as NOVAS
//     (dedup pela "impressão digital"/hash do texto inteiro — fiel: 1 letra
//     diferente já é outra publicação). Quem importa é registrado como leitor.
//   - listar: lista/pesquisa as publicações salvas, respeitando o PAPEL:
//     BUSCADOR (admin/super ou permissão publicacoes/cadastrar) vê TODAS e enxerga
//     o selo de status GLOBAL; quem NÃO é buscador vê SÓ as ATRIBUÍDAS a ele e cada
//     um tem o próprio status "tratada/pendente" (em publicacao_usuario).
//   - atribuir/desatribuir: o BUSCADOR entrega a publicação a 1+ pessoas. Ao
//     atribuir, a publicação vira "tratada" na visão dos buscadores e "pendente"
//     para cada pessoa. Só buscador atribui.
//   - tratar/reabrir: buscador mexe no selo global; recebedor mexe só na linha dele.
//   - excluir: EXCLUSIVO de buscador. histórico: lido das colunas + atribuições.
// ============================================================

const crypto = require('crypto');
const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno, proibido } = require('../utils/response');
const aaspService = require('../services/aaspService');
const cnjService = require('../services/cnjService');
const { enviarEmail } = require('../utils/email');

// "Impressão digital" (SHA-256) do texto EXATO da publicação — base da dedup fiel.
function hashTexto(texto) {
  return crypto.createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

// ── Papéis dentro de Publicações ──────────────────────────────────────────
// "Buscador" = quem pode BAIXAR publicações (permissão publicacoes/cadastrar) ou
// admin/super (nível <= 1). O buscador vê TODAS as publicações e enxerga o selo
// de status GLOBAL da publicação.
// Quem NÃO é buscador só vê as publicações ATRIBUÍDAS a ele e cada um tem o seu
// próprio status "tratada / pendente" (guardado em publicacao_usuario).
async function temPermissaoPublicacoes(usuarioId, acao) {
  const [rows] = await pool.execute(
    "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = 'publicacoes' AND submodulo IS NULL AND acao = ?",
    [usuarioId, acao]
  );
  return rows.length > 0 && Number(rows[0].permitido) === 1;
}
async function ehBuscador(req) {
  if (Number(req.usuario.nivel) <= 1) return true;
  return temPermissaoPublicacoes(req.usuario.id, 'cadastrar');
}
async function podeAlterarPublicacoes(req) {
  if (Number(req.usuario.nivel) <= 1) return true;
  return temPermissaoPublicacoes(req.usuario.id, 'alterar');
}
// A publicação está atribuída a este usuário? (existe linha em publicacao_usuario)
async function estaAtribuidaA(db, publicacaoId, usuarioId) {
  const [rows] = await db.execute(
    'SELECT 1 FROM publicacao_usuario WHERE publicacao_id = ? AND usuario_id = ? LIMIT 1',
    [publicacaoId, usuarioId]
  );
  return rows.length > 0;
}
// Quem pode AGIR numa publicação (criar prazo/tarefa/compromisso, enviar e-mail,
// marcar tratada/reabrir): admin/super, OU tem publicacoes/alterar, OU a publicação
// está atribuída a ele. NÃO cobre excluir — excluir é exclusivo de buscador.
async function podeAgirNaPublicacao(req, publicacaoId) {
  if (await podeAlterarPublicacoes(req)) return true;
  return estaAtribuidaA(pool, publicacaoId, req.usuario.id);
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
    const oabsValidas = cfg.oabs.filter(o => o && o.numero && o.uf);
    return sucesso(res, {
      configurado: !!(cfg.ativo && oabsValidas.length),
      qtdOabs: oabsValidas.length,
    });
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

    // Busca no CNJ para cada OAB configurada e junta tudo. Cada item recebe o rótulo
    // da OAB que o trouxe (número/UF) — é a OAB exibida na coluna da tela. A primeira
    // OAB que trouxe uma comunicação "fica" com ela (o dedup por id_cnj mantém a 1ª).
    let itens = [];
    try {
      for (const o of oabs) {
        const numeroOab = String(o.numero).trim();
        const ufOab     = String(o.uf).trim().toUpperCase();
        const lote = await cnjService.buscarComunicacoes({
          url: cfg.url,
          numeroOab,
          ufOab,
          dataInicio, dataFim,
        });
        const rotuloOab = `${numeroOab}/${ufOab}`;
        for (const it of lote) { if (it && it.__oab == null) it.__oab = rotuloOab; }
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
        oab: it.__oab || null,                    // OAB (número/UF) que trouxe esta publicação
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
             (fonte, id_cnj, data_publicacao, numero_processo, tribunal, oab, titulo, cabecalho,
              numero_publicacao, texto, texto_hash, hash_cnj, escritorio, importada_por)
           VALUES ('cnj', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [c.id_cnj, c.data_publicacao, c.numero_processo, c.tribunal, c.oab, c.titulo, c.cabecalho,
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
function montarFiltroPublicacoes(q, usuario, ehBuscadorFlag) {
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

  if (ehBuscadorFlag) {
    // BUSCADOR (ou admin/super): vê TODAS as publicações da fonte; o status é o
    // selo GLOBAL da publicação.
    if (q.tratada === '0' || q.tratada === '1') { cond.push('p.tratada = ?'); params.push(q.tratada); }
    // "Atribuídas a mim": recorte opcional para o buscador também.
    if (q.escopo === 'minhas') {
      cond.push('EXISTS (SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?)');
      params.push(usuario.id);
    }
  } else {
    // NÃO-BUSCADOR: vê SÓ as publicações ATRIBUÍDAS a ele; o filtro de status
    // (Não tratadas / Tratadas) age na LINHA PESSOAL dele (publicacao_usuario.tratada).
    let sub = 'SELECT 1 FROM publicacao_usuario pu WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?';
    const subParams = [usuario.id];
    if (q.tratada === '0' || q.tratada === '1') { sub += ' AND pu.tratada = ?'; subParams.push(q.tratada); }
    cond.push(`EXISTS (${sub})`);
    params.push(...subParams);
  }

  // Pesquisa por conteúdo (e, de brinde, pelo número do processo). Vale p/ ambos.
  if (q.busca && q.busca.trim()) {
    cond.push('(p.texto LIKE ? OR p.numero_processo LIKE ?)');
    params.push(`%${q.busca.trim()}%`, `%${q.busca.trim()}%`);
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

    // Buscador vê tudo (status global); não-buscador vê só as atribuídas a ele
    // (status pessoal, guardado em publicacao_usuario). `alterar` decide se pode
    // AGIR sem depender de estar atribuída.
    const buscador = await ehBuscador(req);
    const alterar  = await podeAlterarPublicacoes(req);

    let { where, params } = montarFiltroPublicacoes(req.query, req.usuario, buscador);

    // Filtro por etiqueta PESSOAL do usuário logado (só as que ELE marcou com aquela cor).
    const etqSlot = parseInt(req.query.etiqueta);
    if (etqSlot >= 1 && etqSlot <= 5) {
      where += ` AND EXISTS (SELECT 1 FROM publicacoes_etiquetas pe
                             WHERE pe.publicacao_id = p.id AND pe.usuario_id = ? AND pe.slot = ?)`;
      params.push(req.usuario.id, etqSlot);
    }

    // Ordenação: coluna vem da LISTA BRANCA; direção só 'asc'/'desc'. Padrão = Data mais recente.
    const col = COLUNAS_ORDENAR[req.query.ordenar];
    const dir = req.query.direcao === 'asc' ? 'ASC' : (req.query.direcao === 'desc' ? 'DESC' : null);
    const orderBy = (col && dir)
      ? `ORDER BY ${col} ${dir}, p.id ${dir}`
      : 'ORDER BY p.data_publicacao DESC, p.id DESC';

    // direcionada_nomes: lista (resolvida na leitura) dos usuários direcionados.
    // duplicada: 1 quando existe OUTRA publicação do MESMO número de processo, no MESMO dia e na
    //   MESMA fonte (AASP só compara com AASP; CNJ só com CNJ). TODAS as linhas do grupo ficam
    //   marcadas (não só as cópias). Recalculada a cada carregamento: ao excluir as repetidas e
    //   sobrar só uma, ela deixa de ser marcada automaticamente. Número comparado sem pontuação.
    // lida: 1 quando o USUÁRIO LOGADO já abriu esta publicação (individual, via publicacoes_lidas).
    const [rows] = await pool.execute(
      `SELECT p.id, p.fonte, p.data_publicacao, p.numero_processo, p.numero_publicacao,
              p.tribunal, p.oab, p.hash_cnj,
              p.titulo, p.cabecalho, p.texto, p.escritorio, p.tratada, p.tratada_em,
              p.motivo_sem_acao,
              ut.nome AS tratada_por_nome,
              (SELECT GROUP_CONCAT(u.nome SEPARATOR ', ')
                 FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
                WHERE pu.publicacao_id = p.id) AS atribuida_nomes,
              EXISTS (SELECT 1 FROM publicacoes p2
                       WHERE p2.data_publicacao = p.data_publicacao
                         AND p2.fonte = p.fonte
                         AND p2.id <> p.id
                         AND p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                         AND REPLACE(REPLACE(REPLACE(p2.numero_processo,'.',''),'-',''),' ','')
                             = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')) AS duplicada,
              EXISTS (SELECT 1 FROM publicacoes_lidas pl
                       WHERE pl.publicacao_id = p.id AND pl.usuario_id = ?) AS lida,
              -- atribuida_a_mim / tratada_pessoal / motivo_pessoal: a LINHA do usuario
              -- logado em publicacao_usuario. Para quem NAO e buscador, o status exibido
              -- e o "pode agir" saem daqui (cada um tem o seu). Os 3 parametros = id do usuario.
              EXISTS (SELECT 1 FROM publicacao_usuario pu
                       WHERE pu.publicacao_id = p.id AND pu.usuario_id = ?) AS atribuida_a_mim,
              (SELECT pu.tratada FROM publicacao_usuario pu
                WHERE pu.publicacao_id = p.id AND pu.usuario_id = ? LIMIT 1) AS tratada_pessoal,
              (SELECT pu.motivo_sem_acao FROM publicacao_usuario pu
                WHERE pu.publicacao_id = p.id AND pu.usuario_id = ? LIMIT 1) AS motivo_pessoal,
              -- Só AASP: 1 quando já existia OUTRA publicação (mais antiga) desse mesmo dia
              -- ANTES desta ter sido salva — ou seja, esta veio de uma 2ª/3ª/4ª... busca do
              -- dia, não da primeira. Usado para pintar amarelo-claro (1ª busca fica branca).
              (p.fonte = 'aasp' AND EXISTS (
                 SELECT 1 FROM publicacoes p3
                  WHERE p3.data_publicacao = p.data_publicacao
                    AND p3.fonte = 'aasp'
                    AND p3.criado_em < p.criado_em
               )) AS buscada_novamente,
              (SELECT pe.slot FROM publicacoes_etiquetas pe
                WHERE pe.publicacao_id = p.id AND pe.usuario_id = ?) AS etiqueta_pessoal,
              -- Dados do processo cadastrado, quando a publicação casa com uma pasta.
              -- Usados para abrir "Criar Perícia" já com o processo preenchido.
              (SELECT t0.id FROM tblproc t0
                WHERE p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                  AND REPLACE(REPLACE(REPLACE(t0.numProc,'.',''),'-',''),' ','')
                      = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')
                LIMIT 1) AS processo_id,
              (SELECT t0.NomeTituloProc FROM tblproc t0
                WHERE p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                  AND REPLACE(REPLACE(REPLACE(t0.numProc,'.',''),'-',''),' ','')
                      = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')
                LIMIT 1) AS pasta_titulo,
              EXISTS (SELECT 1 FROM tblproc t
                       WHERE p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                         AND REPLACE(REPLACE(REPLACE(t.numProc,'.',''),'-',''),' ','')
                             = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')) AS processo_cadastrado,
              -- cliente_polo: qual polo é o cliente do escritório ('autor' ou 'reu') no processo
              -- casado pelo NÚMERO — exatamente a mesma regra do processo_cadastrado acima
              -- (ignora ponto, traço e espaço). Fica NULL quando o processo não está cadastrado
              -- OU está cadastrado sem o campo preenchido; nesses casos a tela não escreve nada.
              -- LIMIT 1 por segurança: hoje não há número repetido em tblproc, mas também não há
              -- índice único, então isto garante que a consulta nunca quebre se um dia houver.
              (SELECT t2.cliente_polo FROM tblproc t2
                WHERE p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                  AND REPLACE(REPLACE(REPLACE(t2.numProc,'.',''),'-',''),' ','')
                      = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')
                LIMIT 1) AS cliente_polo,
              -- Responsáveis das AÇÕES nascidas desta publicação (prazo/tarefa/compromisso).
              -- Sem pessoa (delegado/atribuído em branco) = "Escritório". Juntados em JS (dedup).
              (SELECT GROUP_CONCAT(DISTINCT COALESCE(ud.nome,'Escritório') SEPARATOR '§')
                 FROM prazos_processo pp LEFT JOIN usuarios ud ON pp.delegado_para = ud.id
                WHERE pp.publicacao_id = p.id) AS resp_prazos,
              (SELECT GROUP_CONCAT(DISTINCT COALESCE(ua.nome,'Escritório') SEPARATOR '§')
                 FROM tarefas t LEFT JOIN usuarios ua ON t.atribuida_para = ua.id
                WHERE t.publicacao_id = p.id) AS resp_tarefas,
              (SELECT GROUP_CONCAT(DISTINCT COALESCE(uc.nome,'Escritório') SEPARATOR '§')
                 FROM agenda_compromisso ac LEFT JOIN usuarios uc ON ac.delegado_para = uc.id
                WHERE ac.publicacao_id = p.id) AS resp_compromissos
       FROM publicacoes p
       LEFT JOIN usuarios ut ON p.tratada_por = ut.id
       ${where}
       ${orderBy}
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      // 5 `?` no SELECT antes do WHERE: lida, atribuida_a_mim, tratada_pessoal,
      // motivo_pessoal, etiqueta_pessoal — todos = id do usuário logado.
      [req.usuario.id, req.usuario.id, req.usuario.id, req.usuario.id, req.usuario.id, ...params]
    );

    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM publicacoes p ${where}`, params
    );

    // Junta os responsáveis das 3 fontes de ação numa lista distinta por publicação.
    const registros = rows.map(r => {
      const nomes = [r.resp_prazos, r.resp_tarefas, r.resp_compromissos]
        .filter(Boolean).join('§').split('§').map(s => s.trim()).filter(Boolean);
      const {
        resp_prazos, resp_tarefas, resp_compromissos,
        tratada_pessoal, motivo_pessoal, atribuida_a_mim,
        ...resto
      } = r;
      // BUSCADOR enxerga o selo global; NÃO-BUSCADOR enxerga a linha pessoal dele.
      const tratadaView = buscador ? resto.tratada : (tratada_pessoal ? 1 : 0);
      const motivoView  = buscador ? resto.motivo_sem_acao : (motivo_pessoal || null);
      // Pode agir (criar prazo/tarefa/compromisso, e-mail, tratar): tem "alterar"
      // OU a publicação está atribuída a ele. (Excluir NÃO entra aqui.)
      const podeAgir = alterar || !!atribuida_a_mim;
      return {
        ...resto,
        tratada: tratadaView,
        motivo_sem_acao: motivoView,
        atribuida_a_mim: !!atribuida_a_mim,
        pode_agir: podeAgir,
        resp_acoes: [...new Set(nomes)].join(', ') || null,
      };
    });

    return sucesso(res, { registros, total: totalRows[0].total });
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

    // Dedup de IMPORTAÇÃO por NÚMERO DE PROCESSO no dia: só entram publicações cujo número de
    // processo AINDA não existe no banco naquele dia (comparado SEM pontuação). Assim, re-rodar o
    // dia não traz processo já salvo, e dentro do mesmo lote entra 1 publicação por processo/dia.
    // Publicações SEM número de processo caem na regra ANTIGA (numeroPublicacao, ou hash no
    // fallback), para não perder nem duplicar. Só afeta a AASP — o CNJ tem sua própria importação.
    // Chave: 'pr:<dia>|<processo sem pontuação>'  |  'np:<dia>|<numeroPublicacao>'  |  'hx:<hash>'.
    const normProc = (v) => (v == null ? '' : String(v).replace(/[.\-\/\s]/g, ''));
    const chaveDedup = (c) =>
      normProc(c.numero_processo)
        ? `pr:${c.data_publicacao}|${normProc(c.numero_processo)}`
        : ((c.numero_publicacao != null && c.numero_publicacao !== '')
            ? `np:${c.data_publicacao}|${c.numero_publicacao}`
            : `hx:${c.hash}`);

    // O que já existe no banco PARA OS DIAS deste lote (processo, numeroPublicacao e hash).
    const dias = [...new Set(candidatos.map(c => c.data_publicacao))];
    const phDias = dias.map(() => '?').join(',');
    const [exist] = await pool.execute(
      `SELECT DATE_FORMAT(data_publicacao,'%Y-%m-%d') AS dia, numero_processo, numero_publicacao, texto_hash
         FROM publicacoes WHERE data_publicacao IN (${phDias})`, dias
    );
    const jaExistem = new Set();
    for (const r of exist) {
      // Chave por PROCESSO (quando houver) — é a que barra reimportar processo já salvo no dia.
      if (normProc(r.numero_processo)) jaExistem.add(`pr:${r.dia}|${normProc(r.numero_processo)}`);
      // Chave antiga (numeroPublicacao/hash) — usada pelas publicações SEM número de processo.
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

// Sanitiza uma lista de IDs de usuário vinda do corpo (inteiros > 0, sem repetição).
function idsUsuarioDoCorpo(body) {
  return [...new Set(
    (Array.isArray(body.usuario_ids) ? body.usuario_ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0)
  )];
}

// GET /api/publicacoes/:id/atribuicoes — quem está atribuído nesta publicação e o
// status (tratada/pendente) de cada um. Usado pelo modal "Atribuir" para começar
// com os já atribuídos marcados e travar quem já tratou.
async function atribuicoesPub(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT pu.usuario_id, u.nome, pu.tratada
         FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
        WHERE pu.publicacao_id = ? ORDER BY u.nome`, [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/publicacoes/:id/atribuir — o BUSCADOR define QUEM fica com a publicação.
// Body: { usuario_ids: [..] } = a lista COMPLETA desejada (pode vir vazia).
//   - Adiciona quem entrou; remove quem saiu — MENOS quem já tratou (esse fica,
//     e o nome dele volta na resposta para a tela avisar).
//   - Enquanto houver pelo menos 1 pessoa: a publicação fica "tratada" na visão
//     dos buscadores (o buscador roteou = resolveu a triagem). NÃO exige processo
//     cadastrado — é status do buscador.
//   - Se NÃO sobrar ninguém: a publicação volta a PENDENTE para o buscador.
//   - Aviso no sino para cada pessoa adicionada e para cada pessoa removida.
async function atribuir(req, res) {
  try {
    if (!(await ehBuscador(req))) {
      return proibido(res, 'Apenas quem pode buscar publicações pode atribuí-las.');
    }
    const { id } = req.params;
    const desejados = idsUsuarioDoCorpo(req.body);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [pub] = await conn.execute(
        'SELECT id, data_publicacao, numero_processo FROM publicacoes WHERE id = ?', [id]
      );
      if (!pub.length) { await conn.rollback(); return naoEncontrado(res, 'Publicação não encontrada'); }

      // Estado atual (com o status pessoal de cada um).
      const [atuais] = await conn.execute(
        `SELECT pu.usuario_id, pu.tratada, u.nome
           FROM publicacao_usuario pu JOIN usuarios u ON pu.usuario_id = u.id
          WHERE pu.publicacao_id = ?`, [id]
      );
      const atuaisIds = new Set(atuais.map(a => a.usuario_id));

      // Só usuários ativos entram na lista desejada.
      let desejadosValidos = [];
      if (desejados.length) {
        const ph = desejados.map(() => '?').join(',');
        const [ok] = await conn.execute(
          `SELECT id FROM usuarios WHERE ativo = 1 AND nivel > 0 AND id IN (${ph})`, desejados
        );
        desejadosValidos = ok.map(u => u.id);
      }
      const desejadosSet = new Set(desejadosValidos);

      const toAdd      = desejadosValidos.filter(uid => !atuaisIds.has(uid));
      const saindo     = atuais.filter(a => !desejadosSet.has(a.usuario_id));
      const toRemove   = saindo.filter(a => !a.tratada).map(a => a.usuario_id);
      const protegidos = saindo.filter(a => a.tratada).map(a => a.nome); // já trataram → ficam

      if (!toAdd.length && !toRemove.length) {
        await conn.rollback();
        if (protegidos.length) {
          // Buscador tentou remover só quem já tratou → bloqueado, com aviso na faixa interna.
          return erro(res, `${protegidos.join(', ')} já tratou esta publicação e não pode ser removido(a).`);
        }
        return sucesso(res, { adicionados: 0, removidos: 0, protegidos: [] }, 'Nada para alterar.');
      }

      for (const uid of toAdd) {
        await conn.execute(
          `INSERT INTO publicacao_usuario (publicacao_id, usuario_id, atribuida_por, atribuida_em)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE atribuida_por = VALUES(atribuida_por), atribuida_em = VALUES(atribuida_em)`,
          [id, uid, req.usuario.id]
        );
      }
      if (toRemove.length) {
        const ph = toRemove.map(() => '?').join(',');
        await conn.execute(
          `DELETE FROM publicacao_usuario WHERE publicacao_id = ? AND usuario_id IN (${ph})`,
          [id, ...toRemove]
        );
      }

      // Quantos sobraram?
      const [rest] = await conn.execute(
        'SELECT COUNT(*) AS n FROM publicacao_usuario WHERE publicacao_id = ?', [id]
      );
      const sobraram = Number(rest[0].n);

      if (sobraram > 0) {
        // Registro de quem mexeu + selo global "tratada" (liga só se ainda não estava,
        // para não sobrescrever um tratada/motivo anterior — ex.: já tinha virado prazo).
        await conn.execute(
          'UPDATE publicacoes SET direcionada_por = ?, direcionada_em = NOW() WHERE id = ?',
          [req.usuario.id, id]
        );
        await conn.execute(
          'UPDATE publicacoes SET tratada = 1, tratada_por = ?, tratada_em = NOW() WHERE id = ? AND tratada = 0',
          [req.usuario.id, id]
        );
      } else {
        // Não sobrou ninguém → volta a PENDENTE para o buscador (limpa selo + registro).
        await conn.execute(
          `UPDATE publicacoes
              SET tratada = 0, tratada_por = NULL, tratada_em = NULL, motivo_sem_acao = NULL,
                  direcionada_por = NULL, direcionada_em = NULL
            WHERE id = ?`, [id]
        );
      }

      // Avisos no sino (dentro da transação).
      const proc   = pub[0].numero_processo ? ` — processo ${pub[0].numero_processo}` : '';
      const dataBR = dataBrPub(pub[0].data_publicacao);
      for (const uid of toAdd) {
        await conn.execute('INSERT INTO notificacoes (usuario_id, mensagem) VALUES (?, ?)',
          [uid, `Publicação de ${dataBR}${proc} foi atribuída a você.`.slice(0, 300)]);
      }
      for (const uid of toRemove) {
        await conn.execute('INSERT INTO notificacoes (usuario_id, mensagem) VALUES (?, ?)',
          [uid, `Publicação de ${dataBR}${proc} deixou de estar atribuída a você.`.slice(0, 300)]);
      }

      await conn.commit();
      const partes = [];
      if (toAdd.length)    partes.push(`${toAdd.length} adicionada(s)`);
      if (toRemove.length) partes.push(`${toRemove.length} removida(s)`);
      let msg = `Atribuição atualizada (${partes.join(', ')}).`;
      if (protegidos.length) msg += ` ${protegidos.join(', ')} já tratou e não foi removido(a).`;
      return sucesso(res, { adicionados: toAdd.length, removidos: toRemove.length, protegidos }, msg);
    } catch (e) {
      await conn.rollback();
      return erroInterno(res, e);
    } finally {
      conn.release();
    }
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/publicacoes/:id/tratar — marca/desmarca como tratada.
// Body: { tratada: bool, sem_acao?: bool, motivo?: string }
//   - sem_acao=true  => marcação MANUAL "Tratada / sem ação": exige o motivo (justificativa).
//   - sem_acao ausente => tratar AUTOMÁTICO (ao criar prazo/tarefa/compromisso): não pede motivo.
async function tratar(req, res) {
  try {
    const { id } = req.params;
    const tratada = !!req.body.tratada;
    const semAcao = !!req.body.sem_acao;
    const motivo  = (req.body.motivo || '').toString().trim();

    // AUTORIZAÇÃO (a rota exige só "visualizar"; a regra de verdade é aqui):
    // precisa poder AGIR nesta publicação — admin/super, OU tem "alterar", OU
    // a publicação está atribuída a ele. Um "só visualizador" não passa.
    if (!(await podeAgirNaPublicacao(req, id))) {
      return proibido(res, 'Você não pode tratar esta publicação.');
    }

    // Marcar como tratada SEM AÇÃO exige justificativa (defesa no servidor, além da tela).
    if (tratada && semAcao && !motivo) {
      return erro(res, 'Informe o motivo para marcar a publicação como tratada sem ação.');
    }
    // Junto com a existência, calcula se o PROCESSO da publicação está cadastrado (tblproc),
    // comparando só os dígitos (ignora a pontuação da máscara nos dois lados).
    const [rows] = await pool.execute(
      `SELECT p.id,
              EXISTS (SELECT 1 FROM tblproc t
                       WHERE p.numero_processo IS NOT NULL AND p.numero_processo <> ''
                         AND REPLACE(REPLACE(REPLACE(t.numProc,'.',''),'-',''),' ','')
                             = REPLACE(REPLACE(REPLACE(p.numero_processo,'.',''),'-',''),' ','')) AS proc_cadastrado
         FROM publicacoes p WHERE p.id = ?`, [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Publicação não encontrada');

    // REGRA: só vira TRATADA se o processo estiver cadastrado no sistema. Sem processo
    // cadastrado, a publicação fica SEMPRE Pendente. (Reabrir é sempre permitido.)
    // Vale tanto para o buscador quanto para o recebedor.
    if (tratada && !rows[0].proc_cadastrado) {
      return erro(res, 'Esta publicação não pode ser tratada: o processo não está cadastrado no sistema. Cadastre o processo — ou exclua a publicação, se não precisar dela.');
    }

    // BUSCADOR mexe no selo GLOBAL da publicação (comportamento de sempre).
    // NÃO-BUSCADOR (recebedor) mexe SÓ na linha DELE em publicacao_usuario.
    const buscador = await ehBuscador(req);
    if (buscador) {
      if (tratada) {
        await pool.execute(
          'UPDATE publicacoes SET tratada = 1, tratada_por = ?, tratada_em = NOW(), motivo_sem_acao = ? WHERE id = ?',
          [req.usuario.id, semAcao ? motivo : null, id]
        );
      } else {
        await pool.execute(
          'UPDATE publicacoes SET tratada = 0, tratada_por = NULL, tratada_em = NULL, motivo_sem_acao = NULL WHERE id = ?', [id]
        );
      }
    } else {
      const [r] = tratada
        ? await pool.execute(
            'UPDATE publicacao_usuario SET tratada = 1, tratada_por = ?, tratada_em = NOW(), motivo_sem_acao = ? WHERE publicacao_id = ? AND usuario_id = ?',
            [req.usuario.id, semAcao ? motivo : null, id, req.usuario.id])
        : await pool.execute(
            'UPDATE publicacao_usuario SET tratada = 0, tratada_por = NULL, tratada_em = NULL, motivo_sem_acao = NULL WHERE publicacao_id = ? AND usuario_id = ?',
            [id, req.usuario.id]);
      if (!r.affectedRows) return proibido(res, 'Esta publicação não está atribuída a você.');
    }
    return sucesso(res, null, tratada ? 'Publicação marcada como tratada' : 'Publicação reaberta');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/publicacoes/usuarios — usuários ativos para o modal de atribuição
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
              p.motivo_sem_acao,
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

    // Atribuições: para quem a publicação foi entregue, quem entregou e quando,
    // e o status (tratada/pendente) de CADA pessoa.
    const [usuarios] = await pool.execute(
      `SELECT u.nome, pu.tratada, pu.tratada_em, pu.atribuida_em,
              ab.nome AS atribuida_por_nome
         FROM publicacao_usuario pu
         JOIN usuarios u ON pu.usuario_id = u.id
         LEFT JOIN usuarios ab ON pu.atribuida_por = ab.id
        WHERE pu.publicacao_id = ? ORDER BY u.nome`, [id]
    );

    // Ações que NASCERAM desta publicação (vínculo publicacao_id nas 3 tabelas).
    // Cada uma sobrevive à exclusão da publicação (FK ON DELETE SET NULL), então aqui
    // só listamos as que ainda existem e ainda apontam para esta publicação.
    // Em cada ação, além dos dados, trazemos para QUEM ela foi direcionada:
    //   Prazo -> delegado_para | Tarefa -> atribuida_para | Compromisso -> delegado_para.
    // Sem usuário específico, o front mostra "Escritório".
    const [prazos] = await pool.execute(
      `SELECT pp.id, pp.data_vencimento, pp.status,
              COALESCE(ps.nome, pp.descricao) AS titulo, pr.numProc AS processo_numero,
              ud.nome AS direcionado_nome
         FROM prazos_processo pp
         LEFT JOIN prazo_subtipo ps ON pp.subtipo_id = ps.id
         LEFT JOIN tblproc pr       ON pp.processo_id = pr.id
         LEFT JOIN usuarios ud      ON pp.delegado_para = ud.id
        WHERE pp.publicacao_id = ?
        ORDER BY pp.data_vencimento ASC, pp.id ASC`, [id]
    );
    const [tarefas] = await pool.execute(
      `SELECT t.id, t.titulo, t.data_vencimento, t.concluida,
              ua.nome AS direcionado_nome
         FROM tarefas t
         LEFT JOIN usuarios ua ON t.atribuida_para = ua.id
        WHERE t.publicacao_id = ? ORDER BY t.id ASC`, [id]
    );
    const [compromissos] = await pool.execute(
      `SELECT c.id, c.titulo, c.data, c.concluido, c.escritorio,
              ud.nome AS direcionado_nome
         FROM agenda_compromisso c
         LEFT JOIN usuarios ud ON c.delegado_para = ud.id
        WHERE c.publicacao_id = ? ORDER BY c.data ASC, c.id ASC`, [id]
    );

    // E-mails enviados desta publicação (lidos da própria log_emails, sem tabela extra).
    const [emails] = await pool.execute(
      `SELECT destinatario_nome, para, mensagem, status, enviado_em
         FROM log_emails WHERE publicacao_id = ? ORDER BY enviado_em DESC`, [id]
    );

    return sucesso(res, {
      ...rows[0],
      direcionada_usuarios: usuarios.map(u => u.nome),
      atribuicoes: usuarios,
      acoes: { prazos, tarefas, compromissos },
      emails,
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/publicacoes/:id — exclui a publicação (vínculos caem por CASCADE) + registra log.
async function excluir(req, res) {
  const { id } = req.params;
  // Excluir é EXCLUSIVO de buscador. Quem só recebe publicações atribuídas nunca exclui.
  if (!(await ehBuscador(req))) {
    return proibido(res, 'Você não pode excluir publicações — apenas trabalhar as que foram atribuídas a você.');
  }
  const [pub] = await pool.execute('SELECT data_publicacao, tratada FROM publicacoes WHERE id = ?', [id]);
  if (!pub.length) return naoEncontrado(res, 'Publicação não encontrada');
  // Publicação tratada é preservada (pode ter originado prazo/tarefa/compromisso).
  // Para excluir, o usuário precisa Reabrir antes.
  if (pub[0].tratada) {
    return erro(res, 'Publicações tratadas não podem ser excluídas. Reabra a publicação antes de excluir.');
  }

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
  // Excluir é EXCLUSIVO de buscador (idem exclusão avulsa).
  if (!(await ehBuscador(req))) {
    return proibido(res, 'Você não pode excluir publicações — apenas trabalhar as que foram atribuídas a você.');
  }
  const todas = !!body.todas;

  // Modo "todas": usa todos os filtros da tela. Modo "seleção": só fonte + visibilidade
  // (as ids escolhidas valem por si, independentemente de data/status/busca da tela).
  let alvoSql, alvoParams;
  if (todas) {
    const { where, params } = montarFiltroPublicacoes(body, req.usuario, true);
    alvoSql = where; alvoParams = params;
  } else {
    const ids = [...new Set(
      (Array.isArray(body.ids) ? body.ids : [])
        .map(Number).filter(n => Number.isInteger(n) && n > 0)
    )];
    if (!ids.length) return erro(res, 'Nenhuma publicação selecionada');
    const { where, params } = montarFiltroPublicacoes({ fonte: body.fonte }, req.usuario, true);
    const ph = ids.map(() => '?').join(',');
    alvoSql = `${where} AND p.id IN (${ph})`;
    alvoParams = [...params, ...ids];
  }

  // Publicações tratadas NUNCA são excluídas (nem em lote) — ficam preservadas para
  // consulta a partir das ações que geraram. Só as pendentes entram na exclusão.
  alvoSql += ' AND p.tratada = 0';

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

// GET /api/publicacoes/:id — devolve UMA publicação para leitura (usado pela ação
// — prazo/tarefa/compromisso — para consultar a publicação que a originou).
async function obter(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT id, fonte, data_publicacao, numero_processo, numero_publicacao,
              tribunal, oab, titulo, cabecalho, texto, hash_cnj, tratada
         FROM publicacoes WHERE id = ?`, [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Publicação não encontrada');
    return sucesso(res, rows[0]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// ENVIO DA PUBLICAÇÃO POR E-MAIL (a usuários do sistema e advogados freelancers)
// ============================================================

// Escapa HTML para embutir o texto da publicação com segurança no corpo do e-mail.
function escaparHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dataBrPub(d) {
  const s = String(d || '').slice(0, 10);
  const [a, m, dia] = s.split('-');
  return (a && m && dia) ? `${dia}/${m}/${a}` : s;
}
function montarHtmlPublicacao(pub, mensagem) {
  const dataBR = dataBrPub(pub.data_publicacao);
  // Mensagem pessoal (opcional) escrita por quem enviou — aparece no topo do corpo.
  // Converte as quebras de linha em <br> (o Outlook ignora white-space:pre-wrap).
  const msgHtml = escaparHtml(mensagem || '').replace(/\r\n|\r|\n/g, '<br>');
  const blocoMsg = mensagem
    ? `<div style="background:#f0f6ff;border:1px solid #cfe0fb;border-radius:6px;padding:12px 14px;margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e3a5f;">${msgHtml}</div>`
    : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
    <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <div style="background:#2d6be4;padding:20px 24px;">
        <h1 style="color:#fff;margin:0;font-size:18px;">Publicação — ${escaparHtml(dataBR)}</h1>
      </div>
      <div style="padding:20px 24px;color:#333;font-size:14px;line-height:1.6;">
        ${blocoMsg}
        <p style="margin:0 0 4px;"><strong>Tribunal:</strong> ${escaparHtml(pub.tribunal || '—')}</p>
        <p style="margin:0 0 4px;"><strong>Processo:</strong> ${escaparHtml(pub.numero_processo || '—')}</p>
        ${pub.numero_publicacao ? `<p style="margin:0 0 4px;"><strong>Nº da publicação:</strong> ${escaparHtml(pub.numero_publicacao)}</p>` : ''}
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
        <div style="white-space:pre-wrap;font-size:13px;line-height:1.7;color:#222;">${escaparHtml(pub.texto)}</div>
      </div>
      <div style="padding:12px 24px;background:#fafafa;color:#999;font-size:11px;">Enviado pelo sistema de advocacia.</div>
    </div>
  </body></html>`;
}

// GET /api/publicacoes/destinatarios-email — usuários ativos + advogados freelancers,
// com nome/OAB/e-mail (o front desabilita quem não tem e-mail).
async function destinatariosEmail(req, res) {
  try {
    const [usuarios] = await pool.execute(
      `SELECT id, nome, oab, email FROM usuarios WHERE ativo = 1 AND nivel > 0 ORDER BY nome`
    );
    const [freelancers] = await pool.execute(
      `SELECT id, nome, oab, email FROM advogados_freela ORDER BY nome`
    );
    return sucesso(res, { usuarios, freelancers });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/publicacoes/:id/enviar-email — envia o conteúdo completo da publicação
// aos destinatários escolhidos. Body: { destinatarios: [{ tipo:'usuario'|'freela', id }] }
// Cada envio é registrado em log_emails com publicacao_id (aparece no histórico).
async function enviarEmailPublicacao(req, res) {
  try {
    const { id } = req.params;
    // AUTORIZAÇÃO (a rota exige só "visualizar"): admin/super, OU tem "alterar",
    // OU a publicação está atribuída a ele.
    if (!(await podeAgirNaPublicacao(req, id))) {
      return proibido(res, 'Você não pode enviar esta publicação por e-mail.');
    }
    const destinatarios = Array.isArray(req.body?.destinatarios) ? req.body.destinatarios : [];
    if (!destinatarios.length) return erro(res, 'Selecione ao menos um destinatário.');

    const [pubRows] = await pool.execute(
      `SELECT id, tribunal, numero_processo, numero_publicacao, data_publicacao, texto
         FROM publicacoes WHERE id = ?`, [id]
    );
    if (!pubRows.length) return naoEncontrado(res, 'Publicação não encontrada');
    const pub = pubRows[0];
    if (!pub.texto || !String(pub.texto).trim()) return erro(res, 'Esta publicação não tem conteúdo para enviar.');

    // Resolve nome + e-mail de cada destinatário selecionado.
    const idsUsuario = [...new Set(destinatarios.filter(d => d.tipo === 'usuario').map(d => Number(d.id)).filter(Boolean))];
    const idsFreela  = [...new Set(destinatarios.filter(d => d.tipo === 'freela').map(d => Number(d.id)).filter(Boolean))];
    const mapa = new Map();
    if (idsUsuario.length) {
      const ph = idsUsuario.map(() => '?').join(',');
      const [us] = await pool.execute(`SELECT id, nome, email FROM usuarios WHERE id IN (${ph})`, idsUsuario);
      us.forEach(u => mapa.set('usuario:' + u.id, { nome: u.nome, email: u.email }));
    }
    if (idsFreela.length) {
      const ph = idsFreela.map(() => '?').join(',');
      const [fr] = await pool.execute(`SELECT id, nome, email FROM advogados_freela WHERE id IN (${ph})`, idsFreela);
      fr.forEach(f => mapa.set('freela:' + f.id, { nome: `${f.nome} (freelancer)`, email: f.email }));
    }

    // No máximo 3 linhas em branco seguidas: colapsa 4+ quebras de linha em 4
    // (4 quebras = 3 linhas em branco). Vale para o e-mail E para o histórico.
    const mensagem = (req.body?.mensagem || '').toString().trim().replace(/\n{4,}/g, '\n\n\n\n');
    const html = montarHtmlPublicacao(pub, mensagem);
    const assunto = `Publicação — processo ${pub.numero_processo || ''} (${dataBrPub(pub.data_publicacao)})`.trim();

    let enviados = 0;
    const falhas = [];
    for (const d of destinatarios) {
      let info;
      if (d.tipo === 'outro') {
        // E-mail avulso digitado à mão (não é usuário nem freelancer).
        const email = String(d.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { falhas.push({ nome: email || 'Outro', motivo: 'e-mail inválido' }); continue; }
        info = { nome: email, email };
      } else {
        info = mapa.get(`${d.tipo}:${Number(d.id)}`);
      }
      if (!info)                              { falhas.push({ nome: `#${d.id}`, motivo: 'não encontrado' }); continue; }
      if (!info.email || !info.email.trim())  { falhas.push({ nome: info.nome, motivo: 'sem e-mail' });     continue; }
      try {
        await enviarEmail({ para: info.email.trim(), assunto, html, publicacaoId: pub.id, destinatarioNome: info.nome, mensagem });
        enviados++;
      } catch (e) {
        falhas.push({ nome: info.nome, motivo: 'falha no envio' });
      }
    }

    if (!enviados) {
      return erro(res, 'Nenhum e-mail foi enviado. Verifique os destinatários e a configuração de e-mail.');
    }
    return sucesso(res, { enviados, falhas }, `${enviados} e-mail(s) enviado(s).`);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/publicacoes/:id/marcar-lida — registra que o usuário logado abriu/leu a publicação.
// Individual (por usuário) e idempotente: a PK composta impede duplicar; abrir de novo não muda nada.
async function marcarLida(req, res) {
  try {
    await pool.execute(
      'INSERT IGNORE INTO publicacoes_lidas (publicacao_id, usuario_id) VALUES (?, ?)',
      [req.params.id, req.usuario.id]
    );
    return sucesso(res, null, 'Publicação marcada como lida');
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  statusAasp, listar, importar, atribuir, atribuicoesPub, tratar, historico, excluir, excluirLote, usuariosParaDirecionar,
  statusCnj, importarCnj, obter, destinatariosEmail, enviarEmailPublicacao, marcarLida,
};
