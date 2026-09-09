// ============================================================
// CONTROLLER DE ETIQUETAS (pessoais — por usuário)
// ------------------------------------------------------------
// Etiqueta PESSOAL: cada usuário define até 5 cores/significados por módulo
// (tabela etiquetas_definicoes) e marca registros (tabela {modulo}_etiquetas).
// Só o próprio usuário vê as suas. Genérico por "modulo" para reusar nas telas.
// (A etiqueta DO ESCRITÓRIO virá no Passo 2, em controller/rotas próprias.)
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, erroInterno, proibido, naoEncontrado } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

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

// Quais slots (1-5) do módulo já estão marcados em algum registro do usuário logado.
// Usado para travar cor/exclusão de uma etiqueta pessoal que já está em uso.
async function slotsEmUsoPessoal(db, usuarioId, modulo) {
  const cfg = MODULOS_PESSOAL[modulo];
  if (!cfg) return new Set();
  const [rows] = await db.execute(
    `SELECT DISTINCT slot FROM ${cfg.tabela} WHERE usuario_id = ?`,
    [usuarioId]
  );
  return new Set(rows.map(r => Number(r.slot)));
}

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

// GET /api/etiquetas/uso/:modulo — quais dos 5 slots o usuário logado já usa em algum registro
// (a tela de Aparência usa isso pra travar a cor/exclusão desses slots).
async function listarSlotsEmUso(req, res) {
  try {
    const { modulo } = req.params;
    const slots = await slotsEmUsoPessoal(pool, req.usuario.id, modulo);
    return sucesso(res, [...slots]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/etiquetas/definicoes/:modulo — salva as 5 (regrava tudo do módulo).
// Só entram os slots COM significado (etiqueta sem significado é inútil). Transação.
// Regra: um slot que já está em uso em algum registro NÃO pode ser removido nem mudar de
// cor — só o significado (nome) pode ser trocado. Se o front tentar remover/mudar a cor de
// um slot em uso, o backend ignora essa parte e mantém a cor/existência antigas (defesa
// mesmo que a tela não tenha travado); devolve quais slots foram protegidos.
async function salvarDefinicoes(req, res) {
  const { modulo } = req.params;
  const lista = Array.isArray(req.body?.definicoes) ? req.body.definicoes : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [atuais] = await conn.execute(
      'SELECT slot, cor, significado FROM etiquetas_definicoes WHERE usuario_id = ? AND modulo = ?',
      [req.usuario.id, modulo]
    );
    const atuaisPorSlot = new Map(atuais.map(d => [Number(d.slot), d]));
    const emUso = await slotsEmUsoPessoal(conn, req.usuario.id, modulo);

    const finalPorSlot = new Map();
    for (const d of lista) {
      const slot = Number(d.slot);
      if (slot < 1 || slot > 5) continue;
      const cor = String(d.cor || '').trim();
      const significado = String(d.significado || '').trim();
      if (!cor || !significado) continue; // ignora vazios/ inválidos
      finalPorSlot.set(slot, { cor, significado: significado.slice(0, 60) });
    }

    const protegidos = [];
    for (const [slot, atual] of atuaisPorSlot) {
      if (!emUso.has(slot)) continue;
      const enviado = finalPorSlot.get(slot);
      if (!enviado) {
        // tentaram remover um slot em uso — mantém como estava
        finalPorSlot.set(slot, { cor: atual.cor, significado: atual.significado });
        protegidos.push(slot);
      } else if (enviado.cor !== atual.cor) {
        // tentaram mudar a cor de um slot em uso — mantém a cor antiga, aceita o novo nome
        finalPorSlot.set(slot, { cor: atual.cor, significado: enviado.significado });
        protegidos.push(slot);
      }
    }

    await conn.execute(
      'DELETE FROM etiquetas_definicoes WHERE usuario_id = ? AND modulo = ?',
      [req.usuario.id, modulo]
    );
    for (const [slot, d] of finalPorSlot) {
      await conn.execute(
        'INSERT INTO etiquetas_definicoes (usuario_id, modulo, slot, cor, significado) VALUES (?, ?, ?, ?, ?)',
        [req.usuario.id, modulo, slot, d.cor, d.significado]
      );
    }
    await conn.commit();
    return sucesso(res, { ok: true, protegidos });
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

// Tabelas de marcação DO ESCRITÓRIO que valem para cada módulo de CATÁLOGO.
// "pessoas" é um único catálogo compartilhado por PF e PJ (2 tabelas de marcação).
const CATALOGO_TABELAS_USO = {
  processos: ['processos_etiquetas_escritorio'],
  pessoas:   ['pessoas_fisicas_etiquetas_escritorio', 'pessoas_juridicas_etiquetas_escritorio'],
};

// Quais slots (1-5) do catálogo já estão marcados em algum registro (qualquer usuário).
async function slotsEmUsoEscritorio(db, modulo) {
  const tabelas = CATALOGO_TABELAS_USO[modulo] || [];
  const slots = new Set();
  for (const tabela of tabelas) {
    const [rows] = await db.execute(`SELECT DISTINCT slot FROM ${tabela}`);
    rows.forEach(r => slots.add(Number(r.slot)));
  }
  return slots;
}

// GET /api/etiquetas/escritorio/catalogo/:modulo — todos leem (para exibir).
// Devolve também status_id/status_nome — só o módulo "processos" usa (etiqueta que,
// ao ser aplicada, passa o status do processo para o status vinculado). Nos demais
// módulos a coluna vem sempre nula.
async function listarCatalogo(req, res) {
  try {
    const { modulo } = req.params;
    const [rows] = await pool.execute(
      `SELECT c.slot, c.cor, c.significado, c.status_id, s.nome AS status_nome
         FROM etiquetas_escritorio_catalogo c
         LEFT JOIN tblstatusproc s ON s.id = c.status_id
        WHERE c.modulo = ?
        ORDER BY c.slot`,
      [modulo]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/etiquetas/escritorio/uso/:modulo — quais dos 5 slots do catálogo já estão em uso
// (tela de Configurações usa isso pra travar a cor/exclusão desses slots).
async function listarSlotsEmUsoEscritorio(req, res) {
  try {
    const { modulo } = req.params;
    const slots = await slotsEmUsoEscritorio(pool, modulo);
    return sucesso(res, [...slots]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/etiquetas/escritorio/catalogo/:modulo — só admin (garantido na rota). Regrava tudo. Transação.
// Mesma regra da etiqueta pessoal: slot em uso não pode ser removido nem mudar de cor,
// só o significado (nome) — o backend protege mesmo que o front não trave.
async function salvarCatalogo(req, res) {
  const { modulo } = req.params;
  const lista = Array.isArray(req.body?.definicoes) ? req.body.definicoes : [];
  // Só o módulo "processos" amarra a etiqueta a um status de processo.
  const permiteStatus = modulo === 'processos';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [atuais] = await conn.execute(
      'SELECT slot, cor, significado, status_id FROM etiquetas_escritorio_catalogo WHERE modulo = ?',
      [modulo]
    );
    const atuaisPorSlot = new Map(atuais.map(d => [Number(d.slot), d]));
    const emUso = await slotsEmUsoEscritorio(conn, modulo);

    const finalPorSlot = new Map();
    for (const d of lista) {
      const slot = Number(d.slot);
      if (slot < 1 || slot > 5) continue;
      const cor = String(d.cor || '').trim();
      const significado = String(d.significado || '').trim();
      if (!cor || !significado) continue;
      let statusId = null;
      if (permiteStatus && d.status_id != null && d.status_id !== '') {
        statusId = Number(d.status_id) || null;
      }
      finalPorSlot.set(slot, { cor, significado: significado.slice(0, 60), status_id: statusId });
    }

    // Valida os status_id informados numa consulta só — status inexistente/inativo
    // vira "sem vínculo" (não derruba o salvamento).
    const idsStatus = [...new Set([...finalPorSlot.values()].map(d => d.status_id).filter(Boolean))];
    if (idsStatus.length) {
      const ph = idsStatus.map(() => '?').join(',');
      const [okRows] = await conn.execute(
        `SELECT id FROM tblstatusproc WHERE id IN (${ph}) AND ativo = 1`,
        idsStatus
      );
      const validos = new Set(okRows.map(r => Number(r.id)));
      for (const d of finalPorSlot.values()) {
        if (d.status_id && !validos.has(d.status_id)) d.status_id = null;
      }
    }

    // Regra do slot em uso: cor e existência ficam travadas (defesa mesmo que o front
    // não trave). O vínculo de status PODE mudar a qualquer momento — ele só vale nas
    // próximas aplicações da etiqueta (não é retroativo).
    const protegidos = [];
    for (const [slot, atual] of atuaisPorSlot) {
      if (!emUso.has(slot)) continue;
      const atualStatusId = atual.status_id ? Number(atual.status_id) : null;
      const enviado = finalPorSlot.get(slot);
      if (!enviado) {
        finalPorSlot.set(slot, { cor: atual.cor, significado: atual.significado, status_id: atualStatusId });
        protegidos.push(slot);
      } else if (enviado.cor !== atual.cor) {
        finalPorSlot.set(slot, { cor: atual.cor, significado: enviado.significado, status_id: enviado.status_id });
        protegidos.push(slot);
      }
    }

    await conn.execute('DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = ?', [modulo]);
    for (const [slot, d] of finalPorSlot) {
      await conn.execute(
        'INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado, status_id) VALUES (?, ?, ?, ?, ?)',
        [modulo, slot, d.cor, d.significado, d.status_id ?? null]
      );
    }
    await conn.commit();
    return sucesso(res, { ok: true, protegidos });
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/etiquetas/escritorio/marcar — aplica/remove a etiqueta compartilhada (permissão na rota).
// body: { modulo, registro_id, slot, motivo_status }. slot vazio/0 = remover. Uma por registro
// (guarda quem marcou). Toda mudança real (a cor mudou de fato) grava uma linha em
// auditoria_etiqueta_escritorio, na MESMA transação — se o histórico falhar, a marcação
// também não vai (tudo ou nada).
//
// ETIQUETA DE PROCESSO COM STATUS VINCULADO: se o módulo é "processos" e a cor que está
// sendo APLICADA (s > 0) tem um status_id no catálogo, o status do processo passa a ser
// esse status, na mesma transação, com registro no histórico de mudança de status
// (motivo_status é OPCIONAL; sem texto grava motivo null + origem "etiqueta_escritorio").
// Regras:
//   - remover a etiqueta (s = 0) ou aplicar cor SEM vínculo NÃO reverte o status;
//   - não é retroativo (só o processo que está recebendo a etiqueta agora é afetado).
async function marcarEscritorio(req, res) {
  const { modulo, registro_id, slot, motivo_status } = req.body || {};
  const cfg = MODULOS_ESCRITORIO[modulo];
  if (!cfg) return erro(res, 'Módulo inválido para etiqueta do escritório');
  if (!(await podeAplicarEscritorio(req, modulo))) {
    return proibido(res, 'Sem permissão para aplicar etiqueta do escritório');
  }
  const regId = Number(registro_id);
  if (!regId) return erro(res, 'Registro inválido');
  const s = Number(slot) || 0;
  if (s < 0 || s > 5) return erro(res, 'Cor de etiqueta inválida');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [atuaisRows] = await conn.execute(`SELECT slot FROM ${cfg.tabela} WHERE ${cfg.coluna} = ?`, [regId]);
    const slotAnterior = atuaisRows.length ? Number(atuaisRows[0].slot) : null;

    if (!s) {
      await conn.execute(`DELETE FROM ${cfg.tabela} WHERE ${cfg.coluna} = ?`, [regId]);
    } else {
      await conn.execute(
        `INSERT INTO ${cfg.tabela} (${cfg.coluna}, slot, marcado_por) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE slot = VALUES(slot), marcado_por = VALUES(marcado_por), marcado_em = CURRENT_TIMESTAMP`,
        [regId, s, req.usuario.id]
      );
    }

    const slotNovo = s || null;
    if (slotAnterior !== slotNovo) {
      await conn.execute(
        `INSERT INTO auditoria_etiqueta_escritorio (modulo, registro_id, slot_anterior, slot_novo, usuario_id)
         VALUES (?, ?, ?, ?, ?)`,
        [modulo, regId, slotAnterior, slotNovo, req.usuario.id]
      );
    }

    // --- Vínculo etiqueta -> status do processo ---
    let statusAplicadoId = null;
    let statusAplicadoNome = null;
    if (modulo === 'processos' && s > 0) {
      const [catRows] = await conn.execute(
        "SELECT status_id FROM etiquetas_escritorio_catalogo WHERE modulo = 'processos' AND slot = ?",
        [s]
      );
      const vincStatusId = catRows.length && catRows[0].status_id ? Number(catRows[0].status_id) : null;
      if (vincStatusId) {
        const [procRows] = await conn.execute(
          'SELECT status_id FROM tblproc WHERE id = ? AND ativo = 1',
          [regId]
        );
        if (!procRows.length) {
          await conn.rollback();
          return naoEncontrado(res, 'Processo não encontrado');
        }
        const statusAnteriorId = procRows[0].status_id ? Number(procRows[0].status_id) : null;
        if (statusAnteriorId !== vincStatusId) {
          await conn.execute(
            'UPDATE tblproc SET status_id = ?, alterado_por = ?, alterado_em = NOW() WHERE id = ?',
            [vincStatusId, req.usuario.id, regId]
          );

          const ids = [statusAnteriorId, vincStatusId].filter(Boolean);
          let nomes = {};
          if (ids.length) {
            const ph = ids.map(() => '?').join(',');
            const [nomeRows] = await conn.execute(
              `SELECT id, nome FROM tblstatusproc WHERE id IN (${ph})`, ids
            );
            nomes = Object.fromEntries(nomeRows.map(r => [Number(r.id), r.nome]));
          }
          // Informar o motivo é OPCIONAL — sem texto, grava null (a origem "etiqueta_escritorio"
          // abaixo já deixa claro no histórico de onde veio a mudança de status).
          const motivo = (motivo_status && String(motivo_status).trim()) || null;

          await auditoria.registrar(req.usuario.id, 'tblproc', 'status', regId, null, {
            campo: 'status_id',
            status_anterior_id: statusAnteriorId,
            status_anterior: statusAnteriorId ? (nomes[statusAnteriorId] || null) : null,
            status_novo_id: vincStatusId,
            status_novo: nomes[vincStatusId] || null,
            motivo,
            origem: 'etiqueta_escritorio',
          }, conn);

          statusAplicadoId = vincStatusId;
          statusAplicadoNome = nomes[vincStatusId] || null;
        }
      }
    }

    await conn.commit();
    return sucesso(res, { slot: slotNovo, status_id: statusAplicadoId, status_nome: statusAplicadoNome });
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/etiquetas/escritorio/historico/:modulo/:registro_id — quem aplicou/trocou/removeu
// a etiqueta do escritório desse registro específico, e quando (mais recente primeiro).
async function historicoEscritorio(req, res) {
  try {
    const { modulo, registro_id } = req.params;
    if (!MODULOS_ESCRITORIO[modulo]) return erro(res, 'Módulo inválido para etiqueta do escritório');
    const regId = Number(registro_id);
    if (!regId) return erro(res, 'Registro inválido');

    const [rows] = await pool.execute(
      `SELECT a.slot_anterior, a.slot_novo, a.criado_em, u.nome AS usuario_nome
       FROM auditoria_etiqueta_escritorio a
       JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.modulo = ? AND a.registro_id = ?
       ORDER BY a.criado_em DESC`,
      [modulo, regId]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  listarDefinicoes, salvarDefinicoes, marcar, listarSlotsEmUso,
  listarCatalogo, salvarCatalogo, marcarEscritorio, listarSlotsEmUsoEscritorio,
  historicoEscritorio,
};
