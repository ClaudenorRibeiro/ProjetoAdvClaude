// ============================================================
// GRAVAR OS MOVIMENTOS QUE VIERAM DO DATAJUD — a regra ÚNICA, usada pelo botão "Atualizar DataJud" e pela consulta
// noturna. Só entra o que tem até 6 MESES (o banco nunca guarda mais que isso do DataJud: a limpeza apaga o resto e,
// sem este corte, a próxima consulta traria tudo de volta). Movimento já gravado não entra de novo (impressão digital
// única). O que entra DEPOIS da primeira leitura do processo é "novidade" (merece aviso); a primeira leitura é só a base.
// ============================================================
const datajud = require('../services/datajudService');

const LIMITE_DESCRICAO = 1000;
const LIMITE_NOME_DO_TIPO = 150;

// O dia (AAAA-MM-DD) de 6 meses atrás: o que for anterior não é guardado.
async function corteDosSeisMeses(exec) {
  const [linhas] = await exec.execute("SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-%d') AS corte");
  return linhas[0].corte;
}

// Quantos movimentos vieram e o dia do mais recente (AAAA-MM-DD; null se nenhum tem data legível).
function resumirMovimentos(movimentos) {
  let ultimaData = null;
  for (const m of movimentos) {
    const dia = (datajud.parseDataHora(m && m.dataHora) || {}).data || null;
    if (dia !== null && (ultimaData === null || dia > ultimaData)) ultimaData = dia;
  }
  return { quantidade: movimentos.length, ultimaData };
}

// Anota na lista de tipos os códigos que chegaram (um por código do CNJ; tipo novo entra desmarcado e como "novo").
async function anotarTipos(conn, tipos) {
  for (const [codigo, t] of tipos) {
    await conn.execute(
      `INSERT INTO datajud_tipos_andamento (codigo, nome, quantidade) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantidade = quantidade + ?`,
      [codigo, t.nome, t.vezes, t.vezes]
    );
  }
}

// Grava, DENTRO da transação da conexão recebida, os movimentos novos dos últimos 6 meses.
// `novidade` = marca como novidade (ainda não avisada). Devolve quantos entraram.
async function gravarMovimentosNovos(conn, processoId, movimentos, { hoje, corte, novidade }) {
  const candidatos = new Map();
  for (const m of movimentos) {
    if (!m || typeof m !== 'object' || (m.nome == null && m.codigo == null)) continue;
    const dh = datajud.parseDataHora(m.dataHora);
    const data = dh ? dh.data : hoje;
    if (data < corte) continue;
    const codigoNum = m.codigo == null ? NaN : Number(m.codigo);
    const nome = typeof m.nome === 'string' ? m.nome.trim() : '';
    candidatos.set(datajud.hashMovimento(processoId, m), {
      codigo: Number.isInteger(codigoNum) ? codigoNum : null,
      nome: (nome === '' ? `Movimento ${codigoNum}` : nome).slice(0, LIMITE_NOME_DO_TIPO),
      descricao: datajud.descricaoMovimento(m).slice(0, LIMITE_DESCRICAO),
      data,
      dataHora: dh ? dh.dataHora : null,
    });
  }
  if (candidatos.size === 0) return 0;

  const hashes = [...candidatos.keys()];
  const [existentes] = await conn.execute(
    `SELECT hash_movimento FROM andamento_processual
      WHERE processo_id = ? AND fonte = 'datajud' AND hash_movimento IN (${hashes.map(() => '?').join(',')})`,
    [processoId, ...hashes]
  );
  const jaTem = new Set(existentes.map((r) => r.hash_movimento));
  let novos = 0;
  const tipos = new Map();
  for (const [hash, c] of candidatos) {
    if (jaTem.has(hash)) continue;
    // INSERT IGNORE + índice UNIQUE(hash_movimento) = trava dura contra duplicidade (outro pedido gravou o mesmo agora)
    const [r] = await conn.execute(
      `INSERT IGNORE INTO andamento_processual
         (processo_id, data, data_hora, descricao, fonte, codigo_movimento, hash_movimento, criado_por, novidade_em)
       VALUES (?, ?, ?, ?, 'datajud', ?, ?, NULL, ${novidade ? 'NOW()' : 'NULL'})`,
      [processoId, c.data, c.dataHora, c.descricao, c.codigo, hash]
    );
    if (!r.affectedRows) continue;
    novos += 1;
    if (c.codigo !== null) {
      const t = tipos.get(c.codigo) || { nome: c.nome, vezes: 0 };
      t.vezes += 1;
      tipos.set(c.codigo, t);
    }
  }
  await anotarTipos(conn, tipos);
  return novos;
}

module.exports = { corteDosSeisMeses, resumirMovimentos, gravarMovimentosNovos, LIMITE_DESCRICAO };
