// ============================================================
// CONTROLLER DE ETIQUETAS (pessoais — por usuário)
// ------------------------------------------------------------
// Etiqueta PESSOAL: cada usuário define até 5 cores/significados por módulo
// (tabela etiquetas_definicoes) e marca registros (tabela {modulo}_etiquetas).
// Só o próprio usuário vê as suas. Genérico por "modulo" para reusar nas telas.
// (A etiqueta DO ESCRITÓRIO virá no Passo 2, em controller/rotas próprias.)
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, erroInterno, proibido } = require('../utils/response');

// Whitelist dos módulos que têm etiqueta PESSOAL e onde cada marcação é gravada.
// tabela/coluna são valores FIXOS daqui (nunca vêm do usuário) — interpolar é seguro.
const MODULOS_PESSOAL = {
  pastas:      { tabela: 'pastas_etiquetas',      coluna: 'pasta_id' },
  publicacoes: { tabela: 'publicacoes_etiquetas', coluna: 'publicacao_id' },
  prazos:      { tabela: 'prazos_etiquetas',      coluna: 'prazo_id' },
  tarefas:     { tabela: 'tarefas_etiquetas',     coluna: 'tarefa_id' },
  audiencias:  { tabela: 'audiencias_etiquetas',  coluna: 'audiencia_id' },
  pericias:    { tabela: 'pericias_etiquetas',    coluna: 'pericia_id' },
};

// GET /api/etiquetas/definicoes/:modulo — as 5 cores/significados do usuário logado.
async function listarDefinicoes(req, res) {
  try {
    const { modulo } = req.params;
    const [rows] = await pool.execute(
      'SELECT slot, cor, significado FROM etiquetas_definicoes WHERE usuario_id = ? AND modulo = ? ORDER BY slot',
      [req.usuario.id, modulo]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/etiquetas/definicoes/:modulo — salva as 5 (regrava tudo do módulo).
// Só entram os slots COM significado (etiqueta sem significado é inútil). Transação.
async function salvarDefinicoes(req, res) {
  const { modulo } = req.params;
  const lista = Array.isArray(req.body?.definicoes) ? req.body.definicoes : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'DELETE FROM etiquetas_definicoes WHERE usuario_id = ? AND modulo = ?',
      [req.usuario.id, modulo]
    );
    for (const d of lista) {
      const slot = Number(d.slot);
      const cor = String(d.cor || '').trim();
      const significado = String(d.significado || '').trim();
      if (slot < 1 || slot > 5 || !cor || !significado) continue; // ignora vazios/ inválidos
      await conn.execute(
        'INSERT INTO etiquetas_definicoes (usuario_id, modulo, slot, cor, significado) VALUES (?, ?, ?, ?, ?)',
        [req.usuario.id, modulo, slot, cor, significado.slice(0, 60)]
      );
    }
    await conn.commit();
    return sucesso(res, { ok: true });
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/etiquetas/marcar — marca/desmarca um registro para o usuário logado.
// body: { modulo, registro_id, slot }. slot vazio/0 = remover a etiqueta.
async function marcar(req, res) {
  try {
    const { modulo, registro_id, slot } = req.body || {};
    const cfg = MODULOS_PESSOAL[modulo];
    if (!cfg) return erro(res, 'Módulo inválido para etiqueta');
    const regId = Number(registro_id);
    if (!regId) return erro(res, 'Registro inválido');

    const s = Number(slot);
    if (!s) {
      await pool.execute(
        `DELETE FROM ${cfg.tabela} WHERE ${cfg.coluna} = ? AND usuario_id = ?`,
        [regId, req.usuario.id]
      );
      return sucesso(res, { slot: null });
    }
    if (s < 1 || s > 5) return erro(res, 'Cor de etiqueta inválida');
    await pool.execute(
      `INSERT INTO ${cfg.tabela} (${cfg.coluna}, usuario_id, slot) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE slot = VALUES(slot)`,
      [regId, req.usuario.id, s]
    );
    return sucesso(res, { slot: s });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// ETIQUETAS DO ESCRITÓRIO (compartilhadas — todos veem a mesma)
// Catálogo definido só pelo admin; aplicar exige permissão (garantidos na rota).
// ============================================================

// Whitelist dos módulos com etiqueta DO ESCRITÓRIO (tabela/coluna FIXAS, seguras).
const MODULOS_ESCRITORIO = {
  processos:         { tabela: 'processos_etiquetas_escritorio',          coluna: 'processo_id' },
  pessoas_fisicas:   { tabela: 'pessoas_fisicas_etiquetas_escritorio',    coluna: 'pessoa_id' },
  pessoas_juridicas: { tabela: 'pessoas_juridicas_etiquetas_escritorio',  coluna: 'pessoa_id' },
};

// Módulo (da marcação) → módulo de PERMISSÃO para aplicar a etiqueta do escritório.
// (PF e PJ compartilham a permissão de "pessoas"; o catálogo também é único "pessoas".)
const PERMISSAO_ESCRITORIO = {
  processos:         'processos',
  pessoas_fisicas:   'pessoas',
  pessoas_juridicas: 'pessoas',
};

// Verifica se o usuário pode APLICAR/trocar/remover a etiqueta do escritório (admin/super sempre).
// Feito aqui (e não no middleware da rota) porque o módulo de permissão varia por módulo.
// A ação exigida é 'alterar' (mexer é ação de MODIFICAÇÃO). Só "Visualizar" = apenas ver a bolinha.
async function podeAplicarEscritorio(req, modulo) {
  if (Number(req.usuario.nivel) <= 1) return true;
  const permMod = PERMISSAO_ESCRITORIO[modulo];
  if (!permMod) return false;
  const [rows] = await pool.execute(
    "SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = ? AND submodulo = 'etiqueta_escritorio' AND acao = 'alterar'",
    [req.usuario.id, permMod]
  );
  return rows.length > 0 && Number(rows[0].permitido) === 1;
}

// GET /api/etiquetas/escritorio/catalogo/:modulo — todos leem (para exibir).
async function listarCatalogo(req, res) {
  try {
    const { modulo } = req.params;
    const [rows] = await pool.execute(
      'SELECT slot, cor, significado FROM etiquetas_escritorio_catalogo WHERE modulo = ? ORDER BY slot',
      [modulo]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/etiquetas/escritorio/catalogo/:modulo — só admin (garantido na rota). Regrava tudo. Transação.
async function salvarCatalogo(req, res) {
  const { modulo } = req.params;
  const lista = Array.isArray(req.body?.definicoes) ? req.body.definicoes : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = ?', [modulo]);
    for (const d of lista) {
      const slot = Number(d.slot);
      const cor = String(d.cor || '').trim();
      const significado = String(d.significado || '').trim();
      if (slot < 1 || slot > 5 || !cor || !significado) continue;
      await conn.execute(
        'INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado) VALUES (?, ?, ?, ?)',
        [modulo, slot, cor, significado.slice(0, 60)]
      );
    }
    await conn.commit();
    return sucesso(res, { ok: true });
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/etiquetas/escritorio/marcar — aplica/remove a etiqueta compartilhada (permissão na rota).
// body: { modulo, registro_id, slot }. slot vazio/0 = remover. Uma por registro (guarda quem marcou).
async function marcarEscritorio(req, res) {
  try {
    const { modulo, registro_id, slot } = req.body || {};
    const cfg = MODULOS_ESCRITORIO[modulo];
    if (!cfg) return erro(res, 'Módulo inválido para etiqueta do escritório');
    if (!(await podeAplicarEscritorio(req, modulo))) {
      return proibido(res, 'Sem permissão para aplicar etiqueta do escritório');
    }
    const regId = Number(registro_id);
    if (!regId) return erro(res, 'Registro inválido');

    const s = Number(slot);
    if (!s) {
      await pool.execute(`DELETE FROM ${cfg.tabela} WHERE ${cfg.coluna} = ?`, [regId]);
      return sucesso(res, { slot: null });
    }
    if (s < 1 || s > 5) return erro(res, 'Cor de etiqueta inválida');
    await pool.execute(
      `INSERT INTO ${cfg.tabela} (${cfg.coluna}, slot, marcado_por) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE slot = VALUES(slot), marcado_por = VALUES(marcado_por), marcado_em = CURRENT_TIMESTAMP`,
      [regId, s, req.usuario.id]
    );
    return sucesso(res, { slot: s });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = { listarDefinicoes, salvarDefinicoes, marcar, listarCatalogo, salvarCatalogo, marcarEscritorio };
