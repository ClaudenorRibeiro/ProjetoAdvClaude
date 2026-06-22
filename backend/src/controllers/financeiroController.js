// ============================================================
// CONTROLLER FINANCEIRO (reescrito 15/06/2026 — do zero)
// Modelo POR PROCESSO:
//  - conta_corrente: entradas/saídas de um processo (estilo extrato bancário)
//  - acordo + acordo_parcela: acordo parcelado, parcelas com honorário/parceria por linha
//  - baixa: marcar parcela recebida gera uma ENTRADA na conta corrente, vinculada à parcela
// Tudo que escreve em mais de um lugar usa transação (BEGIN/COMMIT/ROLLBACK) + auditoria.
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { hojeBrasilia } = require('../utils/helpers');
const { proximoDiaUtil } = require('../services/calendarioService');
const auditoria = require('../middleware/auditoria');

// ---------- helpers de cálculo ----------
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Soma N meses a uma data 'YYYY-MM-DD', mantendo o dia (com clamp no último dia do mês).
function somarMeses(dataStr, n) {
  const [y, m, d] = String(dataStr).slice(0, 10).split('-').map(Number);
  const base = new Date(y, (m - 1) + n, 1);            // 1º dia do mês alvo
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);                  // evita "31 de fevereiro"
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${base.getFullYear()}-${mm}-${dd}`;
}

// Recalcula honorário, líquido e parceria de UMA parcela a partir dos campos crus.
// Regra acordada: parceria incide sobre o HONORÁRIO (não sobre o bruto, não mexe no líquido do cliente).
function calcularValoresParcela(p) {
  const bruto = round2(p.valor_bruto);
  const honorTipo = ['percent', 'fixo', 'sem'].includes(p.honor_tipo) ? p.honor_tipo : 'percent';

  let honorPct = null;
  let honorValor = 0;
  if (honorTipo === 'percent') {
    honorPct = Number(p.honor_percentual) || 0;
    honorValor = round2(bruto * honorPct / 100);
  } else if (honorTipo === 'fixo') {
    honorValor = round2(p.honor_valor);
  } // 'sem' => 0
  if (honorValor > bruto) honorValor = bruto;          // honorário nunca passa do bruto
  const liquido = round2(bruto - honorValor);

  // Parceria opcional (só quando há pessoa selecionada)
  const temParceria = !!p.parceria_pessoa_id;
  const parcTipo = temParceria ? (['percent', 'fixo'].includes(p.parceria_tipo) ? p.parceria_tipo : 'percent') : null;
  let parcPct = null;
  let parcValor = null;
  if (temParceria) {
    if (parcTipo === 'fixo') {
      parcValor = round2(p.parceria_valor);
    } else {
      parcPct = Number(p.parceria_percentual) || 0;
      parcValor = round2(honorValor * parcPct / 100);
    }
  }

  return {
    valor_bruto: bruto,
    honor_tipo: honorTipo,
    honor_percentual: honorTipo === 'percent' ? honorPct : null,
    honor_valor: honorValor,
    valor_liquido: liquido,
    parceria_pessoa_tipo: temParceria ? (p.parceria_pessoa_tipo || null) : null,
    parceria_pessoa_id: temParceria ? p.parceria_pessoa_id : null,
    parceria_tipo: parcTipo,
    parceria_percentual: parcTipo === 'percent' ? parcPct : null,
    parceria_valor: parcValor,
    observacao: p.observacao ? String(p.observacao).trim() : null,
  };
}

// ============================================================
// CONTA CORRENTE (por processo)
// ============================================================

// GET /api/financeiro/processo/:processoId — extrato + saldo
async function buscarContaCorrente(req, res) {
  try {
    const { processoId } = req.params;
    const { data_de, data_ate } = req.query;
    const params = [processoId];
    let where = 'WHERE cc.processo_id = ?';
    if (data_de)  { where += ' AND cc.data >= ?'; params.push(data_de); }
    if (data_ate) { where += ' AND cc.data <= ?'; params.push(data_ate); }

    const [lancamentos] = await pool.execute(
      `SELECT cc.*, u.nome AS usuario_nome
       FROM conta_corrente cc
       JOIN usuarios u ON cc.usuario_id = u.id
       ${where}
       ORDER BY cc.data ASC, cc.id ASC`,
      params
    );

    // Saldo acumulado: entrada soma, saída subtrai
    let saldo = 0;
    const comSaldo = lancamentos.map(l => {
      saldo += (l.tipo === 'entrada' ? 1 : -1) * parseFloat(l.valor);
      return { ...l, saldo_acumulado: round2(saldo) };
    });

    return sucesso(res, { lancamentos: comSaldo, saldo_total: round2(saldo) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/processo/:processoId/lancamento — nova entrada/saída manual
async function lancar(req, res) {
  const { processoId } = req.params;
  const { data, descricao, valor, tipo } = req.body;

  if (!descricao || !descricao.trim()) return erro(res, 'Descrição é obrigatória');
  if (!valor || Number(valor) <= 0)     return erro(res, 'Valor deve ser maior que zero');
  if (!['entrada', 'saida'].includes(tipo)) return erro(res, 'Tipo deve ser "entrada" ou "saida"');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, origem, usuario_id)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
      [processoId, data || hojeBrasilia(), descricao.trim(), tipo, round2(valor), req.usuario.id]
    );
    await logCC(conn, result.insertId, req.usuario.id, 'criado', null, null, 'Lançamento criado');
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'criar', result.insertId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: result.insertId }, 'Lançamento registrado', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/lancamento/:id — edita um lançamento MANUAL (os de acordo são intocáveis aqui)
async function editarLancamento(req, res) {
  const { id } = req.params;
  const { data, descricao, valor, tipo } = req.body;

  if (!descricao || !descricao.trim()) return erro(res, 'Descrição é obrigatória');
  if (!valor || Number(valor) <= 0)     return erro(res, 'Valor deve ser maior que zero');
  if (!['entrada', 'saida'].includes(tipo)) return erro(res, 'Tipo deve ser "entrada" ou "saida"');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM conta_corrente WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Lançamento não encontrado'); }
    if (rows[0].origem === 'acordo') {
      await conn.rollback();
      return erro(res, 'Este lançamento veio de uma parcela de acordo. Desfaça o recebimento da parcela para alterá-lo.');
    }
    const novo = { data: data || rows[0].data, descricao: descricao.trim(), tipo, valor: round2(valor) };
    // Registra no histórico cada campo que mudou (campo a campo, De → Para)
    for (const [k, label] of CAMPOS_CC) {
      if (normCC(k, rows[0][k]) !== normCC(k, novo[k])) {
        await logCC(conn, id, req.usuario.id, 'editado', label, fmtCC(k, rows[0][k]), fmtCC(k, novo[k]));
      }
    }
    await conn.execute(
      `UPDATE conta_corrente SET data = ?, descricao = ?, tipo = ?, valor = ? WHERE id = ?`,
      [novo.data, novo.descricao, novo.tipo, novo.valor, id]
    );
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'atualizar', id, rows[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Lançamento atualizado');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/financeiro/lancamento/:id — exclui lançamento MANUAL
async function excluirLancamento(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM conta_corrente WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Lançamento não encontrado'); }
    if (rows[0].origem === 'acordo') {
      await conn.rollback();
      return erro(res, 'Este lançamento veio de uma parcela de acordo. Desfaça o recebimento da parcela para removê-lo.');
    }
    await conn.execute('DELETE FROM conta_corrente WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'excluir', id, rows[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Lançamento removido');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// ACORDO + PARCELAS
// ============================================================

// GET /api/financeiro/processo/:processoId/acordos — lista acordos do processo (com resumo)
async function listarAcordos(req, res) {
  try {
    const { processoId } = req.params;
    const [acordos] = await pool.execute(
      `SELECT a.*,
              (SELECT COUNT(*) FROM acordo_parcela ap WHERE ap.acordo_id = a.id) AS total_parcelas_real,
              (SELECT COUNT(*) FROM acordo_parcela ap WHERE ap.acordo_id = a.id AND ap.status = 'pago') AS parcelas_pagas,
              (SELECT COALESCE(SUM(ap.valor_bruto),0) FROM acordo_parcela ap WHERE ap.acordo_id = a.id AND ap.status = 'pago') AS total_recebido,
              -- Número na ordem de criação dentro do processo, POR TIPO (Acordo 1,2.. / Alvará 1,2..).
              -- Mesma numeração usada nas descrições da conta corrente.
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo
       FROM acordo a
       WHERE a.processo_id = ?
       ORDER BY a.id DESC`,
      [processoId]
    );
    return sucesso(res, acordos);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/acordo/previa — gera a TABELA de parcelas (datas em dia útil),
// SEM salvar. Alimenta o modal editável. Body: { valor_total, qtd_parcelas, data_primeira, honor_percentual }
async function gerarPreviaParcelas(req, res) {
  try {
    const { valor_total, qtd_parcelas, data_primeira, honor_percentual } = req.body;
    const total = round2(valor_total);
    const qtd = parseInt(qtd_parcelas, 10);
    if (!total || total <= 0) return erro(res, 'Valor total deve ser maior que zero');
    if (!qtd || qtd < 1)      return erro(res, 'Quantidade de parcelas inválida');
    if (!data_primeira)       return erro(res, 'Data da primeira parcela é obrigatória');

    const pct = honor_percentual != null && honor_percentual !== '' ? Number(honor_percentual) : 30; // padrão 30%

    // Divide o total: todas iguais (round2) e a ÚLTIMA absorve a diferença de centavos
    const base = round2(total / qtd);
    const parcelas = [];
    for (let i = 0; i < qtd; i++) {
      const bruto = i === qtd - 1 ? round2(total - base * (qtd - 1)) : base;
      const venc = await proximoDiaUtil(somarMeses(data_primeira, i));
      const calc = calcularValoresParcela({
        valor_bruto: bruto, honor_tipo: 'percent', honor_percentual: pct,
      });
      parcelas.push({ numero: i + 1, vencimento: venc, status: 'pendente', ...calc });
    }
    return sucesso(res, { valor_total: total, qtd_parcelas: qtd, parcelas });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/processo/:processoId/acordo — cria acordo + parcelas (tabela já editada)
async function criarAcordo(req, res) {
  const { processoId } = req.params;
  const { descricao, valor_total, qtd_parcelas, data_primeira, parcelas, tipo } = req.body;
  const tipoAcordo = tipo === 'alvara' ? 'alvara' : 'acordo';   // mesma estrutura serve a acordo e alvará

  if (!Array.isArray(parcelas) || !parcelas.length) return erro(res, 'Informe as parcelas');
  if (!valor_total || Number(valor_total) <= 0)      return erro(res, 'Valor total inválido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [a] = await conn.execute(
      `INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [processoId, tipoAcordo, descricao || null, round2(valor_total), parseInt(qtd_parcelas, 10) || parcelas.length,
       data_primeira || parcelas[0].vencimento, req.usuario.id]
    );
    const acordoId = a.insertId;
    await inserirParcelas(conn, acordoId, parcelas, req.usuario.id);
    await auditoria.registrar(req.usuario.id, 'acordo', 'criar', acordoId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: acordoId }, 'Acordo criado com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ---- Histórico por parcela (auditoria_parcela) ----
// Registra um evento da parcela. Para 'editada' usa campo/valores; para os demais usa só o resumo em valor_novo.
async function logParcela(conn, parcelaId, usuarioId, acao, campo, antes, novo) {
  await conn.execute(
    `INSERT INTO auditoria_parcela (parcela_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [parcelaId, acao, campo || null,
     antes === null || antes === undefined ? null : String(antes),
     novo  === null || novo  === undefined ? null : String(novo), usuarioId]
  );
}

// Campos da parcela rastreados no histórico de edição (chave + rótulo amigável)
const CAMPOS_HIST = [
  ['vencimento', 'Vencimento'], ['valor_bruto', 'Valor bruto'], ['honor_tipo', 'Tipo de honorário'],
  ['honor_percentual', 'Honorário (%)'], ['honor_valor', 'Honorário (R$)'], ['observacao', 'Observação'],
  ['parceria_tipo', 'Tipo da parceria'], ['parceria_percentual', 'Parceria (%)'], ['parceria_valor', 'Parceria (R$)'],
];

// Normaliza um valor de campo para comparação (números arredondados, data só YYYY-MM-DD)
function normCmp(campo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (['valor_bruto', 'honor_valor', 'parceria_valor', 'honor_percentual', 'parceria_percentual'].includes(campo)) {
    return String(round2(Number(v)));
  }
  if (campo === 'vencimento') return String(v).slice(0, 10);
  return String(v);
}

// Formata um valor de campo para EXIBIÇÃO no histórico (legível)
function fmtAudit(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (['valor_bruto', 'honor_valor', 'parceria_valor'].includes(campo)) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (['honor_percentual', 'parceria_percentual'].includes(campo)) return Number(v) + '%';
  if (campo === 'vencimento') return String(v).slice(0, 10).split('-').reverse().join('/');
  if (campo === 'honor_tipo') return { percent: 'Percentual', fixo: 'Fixo', sem: 'Sem honorário' }[v] || v;
  return String(v);
}

// ---- Histórico da CONTA CORRENTE (auditoria_conta_corrente) ----
async function logCC(conn, lancamentoId, usuarioId, acao, campo, antes, novo) {
  await conn.execute(
    `INSERT INTO auditoria_conta_corrente (lancamento_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [lancamentoId, acao, campo || null,
     antes === null || antes === undefined ? null : String(antes),
     novo  === null || novo  === undefined ? null : String(novo), usuarioId]
  );
}
const CAMPOS_CC = [['data', 'Data'], ['descricao', 'Descrição'], ['tipo', 'Tipo'], ['valor', 'Valor']];
function normCC(campo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (campo === 'valor') return String(round2(Number(v)));
  if (campo === 'data') return String(v).slice(0, 10);
  return String(v);
}
function fmtCC(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'valor') return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (campo === 'tipo') return v === 'entrada' ? 'Entrada' : 'Saída';
  if (campo === 'data') return String(v).slice(0, 10).split('-').reverse().join('/');
  return String(v);
}

// Insere a lista de parcelas (recalculando os valores no backend — nunca confia na conta do front).
// Registra o evento 'criada' no histórico de cada parcela.
async function inserirParcelas(conn, acordoId, parcelas, usuarioId) {
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    const v = calcularValoresParcela(p);
    const [r] = await conn.execute(
      `INSERT INTO acordo_parcela
        (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor,
         valor_liquido, observacao, parceria_pessoa_tipo, parceria_pessoa_id, parceria_tipo,
         parceria_percentual, parceria_valor, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [acordoId, p.numero || (i + 1), p.vencimento,
       v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido, v.observacao,
       v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor]
    );
    await logParcela(conn, r.insertId, usuarioId, 'criada', null, null, `Parcela ${p.numero || (i + 1)} criada`);
  }
}

// GET /api/financeiro/acordo/:id — acordo + parcelas
async function buscarAcordo(req, res) {
  try {
    const { id } = req.params;
    const [acordo] = await pool.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!acordo.length) return naoEncontrado(res, 'Acordo não encontrado');
    const [parcelas] = await pool.execute(
      `SELECT ap.*,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.recebimento_forma_id) AS recebimento_forma_nome
       FROM acordo_parcela ap WHERE ap.acordo_id = ? ORDER BY ap.numero ASC`,
      [id]
    );
    return sucesso(res, { ...acordo[0], parcelas });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/financeiro/acordo/:id — atualiza acordo + regrava parcelas.
// Bloqueado se houver parcela já recebida (desfaça o recebimento antes).
async function atualizarAcordo(req, res) {
  const { id } = req.params;
  const { descricao, valor_total, qtd_parcelas, data_primeira, parcelas } = req.body;
  if (!Array.isArray(parcelas) || !parcelas.length) return erro(res, 'Informe as parcelas do acordo');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT id FROM acordo WHERE id = ?', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }

    const [pagas] = await conn.execute(
      `SELECT COUNT(*) AS n FROM acordo_parcela WHERE acordo_id = ? AND status = 'pago'`, [id]
    );
    if (pagas[0].n > 0) {
      await conn.rollback();
      return erro(res, 'Há parcelas já recebidas. Desfaça os recebimentos antes de editar o acordo.');
    }

    await conn.execute(
      `UPDATE acordo SET descricao = ?, valor_total = ?, qtd_parcelas = ?, data_primeira = ?,
              alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [descricao || null, round2(valor_total), parseInt(qtd_parcelas, 10) || parcelas.length,
       data_primeira || parcelas[0].vencimento, req.usuario.id, id]
    );

    // Diff das parcelas — MANTÉM os IDs p/ preservar o histórico de cada parcela:
    //  existente sem correspondente no payload → DELETE (histórico cai por cascade)
    //  payload com id existente → UPDATE + registra cada campo alterado
    //  payload sem id → INSERT (parcela nova) + registra 'criada'
    const [existentes] = await conn.execute('SELECT * FROM acordo_parcela WHERE acordo_id = ?', [id]);
    const incomingIds = parcelas.filter(p => p.id).map(p => Number(p.id));
    for (const ex of existentes) {
      if (!incomingIds.includes(Number(ex.id))) await conn.execute('DELETE FROM acordo_parcela WHERE id = ?', [ex.id]);
    }

    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i];
      const v = calcularValoresParcela(p);
      const numero = p.numero || (i + 1);
      const ex = p.id ? existentes.find(e => Number(e.id) === Number(p.id)) : null;
      if (ex) {
        const novo = { ...v, vencimento: p.vencimento };
        for (const [k, label] of CAMPOS_HIST) {
          if (normCmp(k, ex[k]) !== normCmp(k, novo[k])) {
            await logParcela(conn, ex.id, req.usuario.id, 'editada', label, fmtAudit(k, ex[k]), fmtAudit(k, novo[k]));
          }
        }
        // Mudança de parceiro (resolve nomes para ficar legível)
        if (String(ex.parceria_pessoa_id || '') !== String(v.parceria_pessoa_id || '')) {
          const antesNome = await resolverNomePessoa(conn, ex.parceria_pessoa_tipo, ex.parceria_pessoa_id);
          const novoNome  = await resolverNomePessoa(conn, v.parceria_pessoa_tipo, v.parceria_pessoa_id);
          await logParcela(conn, ex.id, req.usuario.id, 'editada', 'Parceiro', antesNome || '—', novoNome || '—');
        }
        await conn.execute(
          `UPDATE acordo_parcela SET numero=?, vencimento=?, valor_bruto=?, honor_tipo=?, honor_percentual=?,
             honor_valor=?, valor_liquido=?, observacao=?, parceria_pessoa_tipo=?, parceria_pessoa_id=?,
             parceria_tipo=?, parceria_percentual=?, parceria_valor=? WHERE id=?`,
          [numero, p.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
           v.observacao, v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual,
           v.parceria_valor, ex.id]
        );
      } else {
        const [r] = await conn.execute(
          `INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual,
             honor_valor, valor_liquido, observacao, parceria_pessoa_tipo, parceria_pessoa_id, parceria_tipo,
             parceria_percentual, parceria_valor, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
          [id, numero, p.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
           v.observacao, v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor]
        );
        await logParcela(conn, r.insertId, req.usuario.id, 'criada', null, null, `Parcela ${numero} criada`);
      }
    }
    await auditoria.registrar(req.usuario.id, 'acordo', 'atualizar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo atualizado');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/financeiro/acordo/:id — exclui acordo (CASCADE nas parcelas). Bloqueado se houver parcela paga.
async function excluirAcordo(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }
    const [pagas] = await conn.execute(
      `SELECT COUNT(*) AS n FROM acordo_parcela WHERE acordo_id = ? AND status = 'pago'`, [id]
    );
    if (pagas[0].n > 0) {
      await conn.rollback();
      return erro(res, 'Há parcelas já recebidas. Desfaça os recebimentos antes de excluir o acordo.');
    }
    await conn.execute('DELETE FROM acordo WHERE id = ?', [id]); // CASCADE remove as parcelas
    await auditoria.registrar(req.usuario.id, 'acordo', 'excluir', id, ac[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo excluído');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/acordo/:id/cancelar — cancela o acordo e as parcelas PENDENTES (as pagas permanecem).
// Cancelamento é DEFINITIVO; o acordo vira registro permanente (não edita/exclui mais). Exige motivo.
async function cancelarAcordo(req, res) {
  const { id } = req.params;
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) return erro(res, 'Informe o motivo do cancelamento');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }
    if (ac[0].status === 'cancelado') { await conn.rollback(); return erro(res, 'Acordo já está cancelado'); }

    // Cancela apenas as parcelas PENDENTES; cada uma registra o evento + motivo no histórico
    const [pendentes] = await conn.execute(
      `SELECT id FROM acordo_parcela WHERE acordo_id = ? AND status = 'pendente'`, [id]
    );
    for (const p of pendentes) {
      await logParcela(conn, p.id, req.usuario.id, 'cancelada', null, null, `Cancelada — ${motivo.trim()}`);
      await conn.execute(`UPDATE acordo_parcela SET status = 'cancelada' WHERE id = ?`, [p.id]);
    }
    await conn.execute(
      `UPDATE acordo SET status = 'cancelado', alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [req.usuario.id, id]
    );
    await auditoria.registrar(req.usuario.id, 'acordo', 'cancelar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo cancelado');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// BAIXA — recebimento de parcela vira lançamento(s) na conta corrente
// Modelo "P&L do escritório": ENTRADA = honorário (sempre, mesmo R$ 0); SAÍDA = repasse da parceria (se houver).
// O bruto e o líquido do cliente NÃO entram na conta corrente (ficam na parcela p/ relatórios).
// ============================================================

// Resolve o nome da pessoa (PF razão/nome ou PJ razão social) — usado na descrição do repasse de parceria
async function resolverNomePessoa(conn, tipo, pessoaId) {
  if (!pessoaId) return null;
  const sql = tipo === 'juridica'
    ? 'SELECT razao_social AS nome FROM pessoas_juridicas WHERE id = ?'
    : 'SELECT nome FROM pessoas_fisicas WHERE id = ?';
  const [r] = await conn.execute(sql, [pessoaId]);
  return r.length ? r[0].nome : null;
}

// PUT /api/financeiro/parcela/:id/pagar — registra o RECEBIMENTO do réu (réu → escritório).
// Captura a data, a forma de pagamento e a identificação no extrato. A conta corrente
// continua igual: lança o honorário (entrada) e o repasse da parceria (saída).
async function pagarParcela(req, res) {
  const { id } = req.params;
  const { recebido_em, recebimento_forma_id, recebimento_identificacao } = req.body;
  // Normaliza os campos do recebimento (forma é opcional no backend; a tela exige)
  const formaId = (recebimento_forma_id != null && recebimento_forma_id !== '' && !isNaN(parseInt(recebimento_forma_id, 10)))
    ? parseInt(recebimento_forma_id, 10) : null;
  const identificacao = (recebimento_identificacao && String(recebimento_identificacao).trim())
    ? String(recebimento_identificacao).trim() : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT ap.*, a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas
       FROM acordo_parcela ap
       JOIN acordo a ON ap.acordo_id = a.id WHERE ap.id = ?`, [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status === 'pago') { await conn.rollback(); return erro(res, 'Parcela já está recebida'); }

    const dataPg = recebido_em || hojeBrasilia();

    // Número do acordo na ordem de criação DENTRO do processo (1, 2, 3...).
    // Derivado do próprio id (auto_increment): conta quantos acordos do processo foram criados até este.
    // Permite identificar a qual acordo a parcela pertence quando o processo tem mais de um.
    const [accNum] = await conn.execute(
      'SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND tipo = ? AND id <= ?',
      [parc.processo_id, parc.acordo_tipo, parc.acordo_id]
    );
    const numeroAcordo = accNum[0].n;
    const palavraAcordo = parc.acordo_tipo === 'alvara' ? 'alvará' : 'acordo';  // texto na conta corrente

    // ENTRADA = honorário do escritório. Lançada SEMPRE (mesmo R$ 0), pois registra que não houve
    // honorário naquela parcela; a observação da parcela explica o motivo.
    const honor = Number(parc.honor_valor) || 0;
    const descHonor = `Honor - parc ${parc.numero}/${parc.total_parcelas} do ${palavraAcordo} ${numeroAcordo}` + (parc.observacao ? ` (${parc.observacao})` : '');
    await conn.execute(
      `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id)
       VALUES (?, ?, ?, ?, 'entrada', ?, 'acordo', ?)`,
      [parc.processo_id, id, dataPg, descHonor, honor, req.usuario.id]
    );

    // SAÍDA = repasse da parceria (só quando há parceiro e valor > 0)
    const parceria = Number(parc.parceria_valor) || 0;
    if (parc.parceria_pessoa_id && parceria > 0) {
      const nomeParceiro = await resolverNomePessoa(conn, parc.parceria_pessoa_tipo, parc.parceria_pessoa_id);
      await conn.execute(
        `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id)
         VALUES (?, ?, ?, ?, 'saida', ?, 'acordo', ?)`,
        [parc.processo_id, id, dataPg,
         `Repasse parceria${nomeParceiro ? ' ' + nomeParceiro : ''} — parc ${parc.numero}/${parc.total_parcelas} do ${palavraAcordo} ${numeroAcordo}`,
         parceria, req.usuario.id]
      );
    }

    await conn.execute(
      `UPDATE acordo_parcela
         SET status = 'pago', recebido_em = ?, recebimento_forma_id = ?, recebimento_identificacao = ?
       WHERE id = ?`,
      [dataPg, formaId, identificacao, id]
    );
    await logParcela(conn, id, req.usuario.id, 'recebida', null, null, `Recebida em ${String(dataPg).slice(0,10).split('-').reverse().join('/')}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'pagar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Parcela recebida');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/desfazer — apaga os lançamentos da parcela e volta para pendente
async function desfazerPagamento(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status !== 'pago') { await conn.rollback(); return erro(res, 'Parcela não está recebida'); }
    // Não dá para desfazer o recebimento enquanto houver repasse baseado nele:
    // o usuário precisa desfazer o(s) repasse(s) (cliente/parceiro) primeiro.
    if (parc.repasse_cliente_em || parc.repasse_parceiro_em) {
      await conn.rollback();
      return erro(res, 'Desfaça os repasses (cliente/parceiro) antes de desfazer o recebimento');
    }

    // Remove TODOS os lançamentos gerados por esta parcela (entrada do honorário + eventual saída da parceria)
    await conn.execute('DELETE FROM conta_corrente WHERE parcela_id = ?', [id]);
    await conn.execute(
      `UPDATE acordo_parcela
         SET status = 'pendente', recebido_em = NULL, recebimento_forma_id = NULL, recebimento_identificacao = NULL
       WHERE id = ?`, [id]
    );
    await logParcela(conn, id, req.usuario.id, 'recebimento-desfeito', null, null, 'Recebimento desfeito');
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'desfazer-pagamento', id, parc, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Recebimento desfeito');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/financeiro/parcela/:id/historico — eventos da parcela (criada/editada/recebida/desfeita)
async function buscarHistoricoParcela(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.acao, ap.campo_alterado, ap.valor_anterior, ap.valor_novo, ap.criado_em,
              u.nome AS usuario_nome
       FROM auditoria_parcela ap
       LEFT JOIN usuarios u ON ap.usuario_id = u.id
       WHERE ap.parcela_id = ?
       ORDER BY ap.criado_em ASC, ap.id ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// REPASSES — pagamento do escritório ao cliente e/ou ao parceiro.
// Acontecem DEPOIS do recebimento do réu, em datas e formas independentes
// (cliente e parceiro podem ser repassados em momentos/ordens diferentes).
// NÃO tocam na conta corrente: o resultado do escritório (honorário/parceria)
// já foi lançado no recebimento; aqui só registramos o pagamento ao beneficiário.
// ============================================================

// Mapa controlado tipo -> colunas (evita repetição e blinda contra injeção:
// os nomes de coluna saem SEMPRE deste whitelist, nunca do req).
const COLS_REPASSE = {
  cliente:  { em: 'repasse_cliente_em',  forma: 'repasse_cliente_forma_id',  por: 'repasse_cliente_por',  rotulo: 'cliente' },
  parceiro: { em: 'repasse_parceiro_em', forma: 'repasse_parceiro_forma_id', por: 'repasse_parceiro_por', rotulo: 'parceiro' },
};

// PUT /api/financeiro/parcela/:id/repasse — registra o repasse ao cliente OU ao parceiro.
// Body: { tipo: 'cliente'|'parceiro', data, forma_id }
async function registrarRepasse(req, res) {
  const { id } = req.params;
  const { tipo, data, forma_id } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const dataRep = data || hojeBrasilia();
  const formaId = (forma_id != null && forma_id !== '' && !isNaN(parseInt(forma_id, 10))) ? parseInt(forma_id, 10) : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status !== 'pago') { await conn.rollback(); return erro(res, 'Registre o recebimento do réu antes de repassar'); }
    if (tipo === 'parceiro' && !parc.parceria_pessoa_id) { await conn.rollback(); return erro(res, 'Esta parcela não tem parceria'); }
    if (parc[cfg.em]) { await conn.rollback(); return erro(res, `Repasse ao ${cfg.rotulo} já registrado`); }

    await conn.execute(`UPDATE acordo_parcela SET ${cfg.em} = ?, ${cfg.forma} = ?, ${cfg.por} = ? WHERE id = ?`,
      [dataRep, formaId, req.usuario.id, id]);

    // Resolve o nome da forma para gravar legível no histórico (regra: nomes na escrita)
    let formaNome = '';
    if (formaId) {
      const [f] = await conn.execute('SELECT nome FROM forma_pagamento WHERE id = ?', [formaId]);
      formaNome = f.length ? f[0].nome : '';
    }
    const dataBR = String(dataRep).slice(0, 10).split('-').reverse().join('/');
    await logParcela(conn, id, req.usuario.id, `repasse-${cfg.rotulo}`, null, null,
      `Repasse ao ${cfg.rotulo} em ${dataBR}${formaNome ? ' (' + formaNome + ')' : ''}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', `repasse-${cfg.rotulo}`, id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse ao ${cfg.rotulo} registrado`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/repasse/desfazer — desfaz o repasse ao cliente OU ao parceiro.
// Body: { tipo: 'cliente'|'parceiro' }
async function desfazerRepasse(req, res) {
  const { id } = req.params;
  const { tipo } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    if (!rows[0][cfg.em]) { await conn.rollback(); return erro(res, `Não há repasse ao ${cfg.rotulo} para desfazer`); }

    await conn.execute(`UPDATE acordo_parcela SET ${cfg.em} = NULL, ${cfg.forma} = NULL, ${cfg.por} = NULL WHERE id = ?`, [id]);
    await logParcela(conn, id, req.usuario.id, `repasse-${cfg.rotulo}-desfeito`, null, null, `Repasse ao ${cfg.rotulo} desfeito`);
    // logs_auditoria.acao é varchar(20): manter a ação global curta (o detalhe vai no histórico da parcela acima)
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'desfazer-repasse', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse ao ${cfg.rotulo} desfeito`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/financeiro/repasses-pendentes — worklist GLOBAL: parcelas já recebidas do réu
// que ainda têm repasse pendente (ao cliente e/ou ao parceiro).
async function listarRepassesPendentes(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.numero, ap.recebido_em, ap.valor_liquido,
              ap.parceria_pessoa_id, ap.parceria_valor,
              ap.repasse_cliente_em, ap.repasse_parceiro_em,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela ap
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       WHERE ap.status = 'pago'
         AND (
           (ap.valor_liquido > 0 AND ap.repasse_cliente_em IS NULL)
           OR (ap.parceria_pessoa_id IS NOT NULL AND ap.repasse_parceiro_em IS NULL)
         )
       ORDER BY ap.recebido_em ASC, p.numProc ASC, ap.numero ASC`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/repasses-concluidos — repasses JÁ FEITOS (consulta/desfazer/histórico).
// Traz a data, a forma de pagamento e quem fez cada repasse. LIMIT defensivo.
async function listarRepassesConcluidos(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.numero, ap.valor_liquido, ap.parceria_pessoa_id, ap.parceria_valor,
              ap.repasse_cliente_em, ap.repasse_parceiro_em,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.repasse_cliente_forma_id)  AS repasse_cliente_forma_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.repasse_parceiro_forma_id) AS repasse_parceiro_forma_nome,
              uc.nome AS repasse_cliente_por_nome,
              up.nome AS repasse_parceiro_por_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela ap
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       LEFT JOIN usuarios uc ON ap.repasse_cliente_por  = uc.id
       LEFT JOIN usuarios up ON ap.repasse_parceiro_por = up.id
       WHERE ap.repasse_cliente_em IS NOT NULL OR ap.repasse_parceiro_em IS NOT NULL
       ORDER BY GREATEST(COALESCE(ap.repasse_cliente_em,'1900-01-01'), COALESCE(ap.repasse_parceiro_em,'1900-01-01')) DESC,
                p.numProc ASC, ap.numero ASC
       LIMIT 300`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// CONSULTA / RELATÓRIO do financeiro — busca de parcelas (acordo/alvará) por múltiplos filtros.
// Só LEITURA. Base: acordo_parcela (tem bruto/honorário/líquido/parceria/vencimento/status).
// ============================================================

// FROM + JOINs comuns à listagem, ao total e à exportação (fonte única).
const CONSULTA_FROM = `
  FROM acordo_parcela ap
  JOIN acordo a    ON ap.acordo_id = a.id
  JOIN tblproc p   ON a.processo_id = p.id
  JOIN tblpasta pa ON p.pasta_id = pa.id`;

// SELECT das colunas exibidas (mesma lista p/ tela e Excel).
const CONSULTA_SELECT = `SELECT ap.id, ap.numero, ap.vencimento, ap.valor_bruto, ap.honor_valor, ap.valor_liquido,
       ap.parceria_valor, ap.status, ap.recebido_em,
       a.tipo AS acordo_tipo,
       (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas,
       (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
       CASE ap.parceria_pessoa_tipo
         WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
         WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
         ELSE NULL END AS parceria_nome,
       p.numProc, p.NomeTituloProc, pa.numPasta` + CONSULTA_FROM;

// Monta o WHERE dinâmico parametrizado (só entra a condição do filtro preenchido).
function montarFiltroConsulta(q) {
  const cond = ['1=1'];
  const params = [];
  const like = v => `%${String(v).trim()}%`;

  if (q.venc_de)  { cond.push('ap.vencimento >= ?'); params.push(q.venc_de); }
  if (q.venc_ate) { cond.push('ap.vencimento <= ?'); params.push(q.venc_ate); }

  // Faixa de valor sobre o campo escolhido (whitelist — o nome da coluna nunca vem cru do request)
  const campoValor = { bruto: 'ap.valor_bruto', liquido: 'ap.valor_liquido', honorario: 'ap.honor_valor' }[q.valor_campo];
  if (campoValor) {
    if (q.valor_de  !== undefined && q.valor_de  !== '') { cond.push(`${campoValor} >= ?`); params.push(Number(q.valor_de)); }
    if (q.valor_ate !== undefined && q.valor_ate !== '') { cond.push(`${campoValor} <= ?`); params.push(Number(q.valor_ate)); }
  }

  if (q.num_processo) { cond.push('p.numProc LIKE ?'); params.push(like(q.num_processo)); }
  if (q.pasta) { const n = parseInt(q.pasta, 10); if (!isNaN(n)) { cond.push('pa.numPasta = ?'); params.push(n); } }
  if (q.status && ['pendente', 'pago', 'cancelada'].includes(q.status)) { cond.push('ap.status = ?'); params.push(q.status); }

  if (q.parceiro) {
    cond.push(`((ap.parceria_pessoa_tipo='fisica'   AND EXISTS(SELECT 1 FROM pessoas_fisicas   pf WHERE pf.id=ap.parceria_pessoa_id AND pf.nome LIKE ?))
             OR (ap.parceria_pessoa_tipo='juridica' AND EXISTS(SELECT 1 FROM pessoas_juridicas pj WHERE pj.id=ap.parceria_pessoa_id AND pj.razao_social LIKE ?)))`);
    params.push(like(q.parceiro), like(q.parceiro));
  }
  if (q.autor) {
    cond.push(`EXISTS(SELECT 1 FROM tbltituloprocautor ta
                 LEFT JOIN pessoas_fisicas   pf ON ta.tipo_pessoa='fisica'   AND ta.pessoa_id=pf.id
                 LEFT JOIN pessoas_juridicas pj ON ta.tipo_pessoa='juridica' AND ta.pessoa_id=pj.id
               WHERE ta.proc_id=p.id AND (pf.nome LIKE ? OR pj.razao_social LIKE ?))`);
    params.push(like(q.autor), like(q.autor));
  }
  if (q.reu) {
    cond.push(`EXISTS(SELECT 1 FROM tbltituloprocreu tr
                 LEFT JOIN pessoas_fisicas   pf ON tr.tipo_pessoa='fisica'   AND tr.pessoa_id=pf.id
                 LEFT JOIN pessoas_juridicas pj ON tr.tipo_pessoa='juridica' AND tr.pessoa_id=pj.id
               WHERE tr.proc_id=p.id AND (pf.nome LIKE ? OR pj.razao_social LIKE ?))`);
    params.push(like(q.reu), like(q.reu));
  }
  return { where: cond.join(' AND '), params };
}

// GET /api/financeiro/consulta — lista paginada + totais (SUM sobre TODO o conjunto filtrado)
async function consultarFinanceiro(req, res) {
  try {
    const { where, params } = montarFiltroConsulta(req.query);
    const limitInt  = parseInt(req.query.limite) || 50;
    const offsetInt = ((parseInt(req.query.pagina) || 1) - 1) * limitInt;

    const [rows] = await pool.execute(
      `${CONSULTA_SELECT} WHERE ${where} ORDER BY ap.vencimento ASC, p.numProc ASC LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );
    const [tot] = await pool.execute(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(ap.valor_bruto),0)    AS soma_bruto,
              COALESCE(SUM(ap.honor_valor),0)    AS soma_honorario,
              COALESCE(SUM(ap.valor_liquido),0)  AS soma_liquido,
              COALESCE(SUM(ap.parceria_valor),0) AS soma_parceria
       ${CONSULTA_FROM} WHERE ${where}`,
      params
    );
    return sucesso(res, {
      registros: rows,
      total: tot[0].total,
      totais: { bruto: tot[0].soma_bruto, honorario: tot[0].soma_honorario, liquido: tot[0].soma_liquido, parceria: tot[0].soma_parceria },
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/consulta/exportar — mesma consulta (sem paginação) em Excel (.xlsx)
async function exportarConsultaFinanceiro(req, res) {
  try {
    const { where, params } = montarFiltroConsulta(req.query);
    const [rows] = await pool.execute(
      `${CONSULTA_SELECT} WHERE ${where} ORDER BY ap.vencimento ASC, p.numProc ASC LIMIT 50000`, params
    );

    const ExcelJS = require('exceljs');               // require lazy: não derruba o boot se faltar a lib
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Financeiro');
    ws.columns = [
      { header: 'Pasta', key: 'pasta', width: 10 },
      { header: 'Processo', key: 'numProc', width: 26 },
      { header: 'Partes (Autor × Réu)', key: 'partes', width: 42 },
      { header: 'Origem', key: 'origem', width: 14 },
      { header: 'Parcela', key: 'parcela', width: 10 },
      { header: 'Vencimento', key: 'venc', width: 12 },
      { header: 'Bruto', key: 'bruto', width: 14 },
      { header: 'Honorário', key: 'honor', width: 14 },
      { header: 'Líquido', key: 'liquido', width: 14 },
      { header: 'Parceria', key: 'parceria', width: 14 },
      { header: 'Parceiro', key: 'parceiro', width: 26 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };

    const fmtData = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
    const labelStatus = s => s === 'pago' ? 'Recebida' : s === 'cancelada' ? 'Cancelada' : 'Pendente';
    const tipoLabel = t => t === 'alvara' ? 'Alvará' : 'Acordo';
    let tBruto = 0, tHon = 0, tLiq = 0, tPar = 0;
    for (const r of rows) {
      tBruto += Number(r.valor_bruto || 0); tHon += Number(r.honor_valor || 0);
      tLiq += Number(r.valor_liquido || 0); tPar += Number(r.parceria_valor || 0);
      ws.addRow({
        pasta: String(r.numPasta).padStart(4, '0'),
        numProc: r.numProc || '',
        partes: r.NomeTituloProc || '',
        origem: `${tipoLabel(r.acordo_tipo)} ${r.numero_acordo}`,
        parcela: `${r.numero}/${r.total_parcelas}`,
        venc: fmtData(r.vencimento),
        bruto: Number(r.valor_bruto || 0),
        honor: Number(r.honor_valor || 0),
        liquido: Number(r.valor_liquido || 0),
        parceria: Number(r.parceria_valor || 0),
        parceiro: r.parceria_nome || '',
        status: labelStatus(r.status),
      });
    }
    const linhaTotal = ws.addRow({ partes: 'TOTAIS', bruto: tBruto, honor: tHon, liquido: tLiq, parceria: tPar });
    linhaTotal.font = { bold: true };
    ['bruto', 'honor', 'liquido', 'parceria'].forEach(k => { ws.getColumn(k).numFmt = '#,##0.00'; });

    const [y, m, d] = hojeBrasilia().split('-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Consulta financeira - ${d}-${m}-${y}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/lancamento/:id/historico — eventos do lançamento (criado/editado)
async function buscarHistoricoLancamento(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT a.id, a.acao, a.campo_alterado, a.valor_anterior, a.valor_novo, a.criado_em,
              u.nome AS usuario_nome
       FROM auditoria_conta_corrente a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.lancamento_id = ?
       ORDER BY a.criado_em ASC, a.id ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  // conta corrente
  buscarContaCorrente, lancar, editarLancamento, excluirLancamento,
  // acordo
  listarAcordos, gerarPreviaParcelas, criarAcordo, buscarAcordo, atualizarAcordo, excluirAcordo, cancelarAcordo,
  // baixa (recebimento do réu)
  pagarParcela, desfazerPagamento,
  // repasses (ao cliente / parceiro) + worklists
  registrarRepasse, desfazerRepasse, listarRepassesPendentes, listarRepassesConcluidos,
  // consulta / relatório
  consultarFinanceiro, exportarConsultaFinanceiro,
  // histórico
  buscarHistoricoParcela, buscarHistoricoLancamento,
};
