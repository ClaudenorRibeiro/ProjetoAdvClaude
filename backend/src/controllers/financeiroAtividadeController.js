// ============================================================
// ATIVIDADE DO FINANCEIRO — "quem fez o quê e quando" (consulta única, só leitura)
// Reaproveita o registro geral (logs_auditoria) que todas as ações do Financeiro já gravam; nada novo é gravado.
// Duas portas: a aba "Atividade" do Financeiro (tudo, com filtros) e o "Histórico do acordo" (só aquele acordo e suas parcelas).
// Permissão: financeiro/historico.
// ============================================================
const { pool } = require('../config/database');
const { sucesso, erro, erroInterno } = require('../utils/response');
const { paginacao } = require('../utils/helpers');
const { dataIso, inteiroPositivo } = require('../utils/camposTexto');

const TABELAS = ['conta_corrente', 'acordo', 'acordo_parcela', 'conta_bancaria'];

// Grupos do filtro "Tipo de ação" (condição SQL fixa; nada vem do pedido).
const GRUPOS = {
  lancamentos:  "l.tabela = 'conta_corrente'",
  acordos:      "l.tabela = 'acordo'",
  recebimentos: "(l.tabela = 'acordo_parcela' AND l.acao IN ('pagar', 'desfazer-pagamento', 'multa-pagar', 'multa-desfazer'))",
  repasses:     "(l.tabela = 'acordo_parcela' AND (l.acao LIKE 'repasse-%' OR l.acao = 'desfazer-repasse' OR l.acao LIKE 'multa-rep-%'))",
  multas:       "(l.tabela = 'acordo_parcela' AND l.acao IN ('multa-lancar', 'multa-editar', 'multa-remover'))",
  contas:       "l.tabela = 'conta_bancaria'",
};

// Texto de cada ação gravada (tabela:ação). Ação desconhecida aparece como está.
const ROTULO = {
  'conta_corrente:criar': 'Lançamento criado', 'conta_corrente:atualizar': 'Lançamento editado', 'conta_corrente:excluir': 'Lançamento excluído',
  'acordo:criar': 'Acordo/alvará criado', 'acordo:atualizar': 'Acordo/alvará editado', 'acordo:cancelar': 'Acordo/alvará cancelado', 'acordo:excluir': 'Acordo/alvará excluído',
  'acordo_parcela:pagar': 'Parcela recebida', 'acordo_parcela:desfazer-pagamento': 'Recebimento da parcela desfeito',
  'acordo_parcela:repasse-cliente': 'Repasse ao cliente', 'acordo_parcela:repasse-parceiro': 'Repasse ao parceiro', 'acordo_parcela:desfazer-repasse': 'Repasse desfeito',
  'acordo_parcela:multa-lancar': 'Multa lançada', 'acordo_parcela:multa-editar': 'Multa editada', 'acordo_parcela:multa-remover': 'Multa removida',
  'acordo_parcela:multa-pagar': 'Multa recebida', 'acordo_parcela:multa-desfazer': 'Recebimento da multa desfeito',
  'acordo_parcela:multa-rep-cli': 'Repasse da multa ao cliente', 'acordo_parcela:multa-rep-par': 'Repasse da multa ao parceiro',
  'acordo_parcela:multa-rep-cli-des': 'Repasse da multa ao cliente desfeito', 'acordo_parcela:multa-rep-par-des': 'Repasse da multa ao parceiro desfeito',
  'conta_bancaria:criar': 'Conta bancária cadastrada',
};

// De onde vem cada registro até o processo/pasta: lançamento e acordo apontam para o processo; a parcela, para o acordo.
// Registro já excluído: o processo guardado em dados_antigos. Só leitura, calculado na hora.
const DE_ONDE = `
  FROM logs_auditoria l
  LEFT JOIN usuarios u ON u.id = l.usuario_id
  LEFT JOIN conta_corrente cc ON l.tabela = 'conta_corrente' AND cc.id = l.registro_id
  LEFT JOIN acordo ac ON l.tabela = 'acordo' AND ac.id = l.registro_id
  LEFT JOIN acordo_parcela ap ON l.tabela = 'acordo_parcela' AND ap.id = l.registro_id
  LEFT JOIN acordo ac2 ON ac2.id = ap.acordo_id
  LEFT JOIN tblproc pr ON pr.id = COALESCE(cc.processo_id, ac.processo_id, ac2.processo_id,
       CAST(JSON_UNQUOTE(JSON_EXTRACT(l.dados_antigos, '$.processo_id')) AS UNSIGNED))
  LEFT JOIN tblpasta pa ON pa.id = pr.pasta_id`;

// Monta o filtro a partir do pedido. Devolve { erro } ou { condicoes, params }.
function lerFiltros(query, acordoIdDaRota) {
  const condicoes = [`l.tabela IN (${TABELAS.map(() => '?').join(',')})`];
  const params = [...TABELAS];
  const usuario = inteiroPositivo(query.usuario_id, { rotulo: 'Usuário' });
  if (usuario.erro) return { erro: usuario.erro };
  if (usuario.valor) { condicoes.push('l.usuario_id = ?'); params.push(usuario.valor); }
  for (const [chave, rotulo, sinal] of [['data_de', 'A data inicial', '>='], ['data_ate', 'A data final', '<=']]) {
    const d = dataIso(query[chave], { rotulo });
    if (d.erro) return { erro: d.erro };
    if (d.valor) { condicoes.push(`DATE(l.criado_em) ${sinal} ?`); params.push(d.valor); }
  }
  const grupo = query.grupo;
  if (grupo !== undefined && grupo !== '') {
    if (typeof grupo !== 'string' || !GRUPOS[grupo]) return { erro: 'Tipo de ação inválido' };
    condicoes.push(GRUPOS[grupo]);
  }
  const proc = inteiroPositivo(query.processo_id, { rotulo: 'Processo' });
  if (proc.erro) return { erro: proc.erro };
  if (proc.valor) { condicoes.push('pr.id = ?'); params.push(proc.valor); }
  if (acordoIdDaRota) {   // histórico de UM acordo: o acordo e as parcelas dele
    condicoes.push("((l.tabela = 'acordo' AND l.registro_id = ?) OR (l.tabela = 'acordo_parcela' AND ap.acordo_id = ?))");
    params.push(acordoIdDaRota, acordoIdDaRota);
  }
  return { condicoes, params };
}

async function consultar(req, res, acordoIdDaRota = null) {
  try {
    const f = lerFiltros(req.query || {}, acordoIdDaRota);
    if (f.erro) return erro(res, f.erro);
    const { limite, pagina, offset } = paginacao(req.query, { limitePadrao: 50, limiteMax: 100 });
    const onde = `WHERE ${f.condicoes.join(' AND ')}`;
    const [[tot]] = await pool.execute(`SELECT COUNT(*) AS n ${DE_ONDE} ${onde}`, f.params);
    const [linhas] = await pool.execute(
      `SELECT l.id, l.criado_em, l.usuario_id, u.nome AS usuario_nome, l.tabela, l.acao, l.registro_id, l.descricao,
              pr.id AS processo_id, pr.numProc AS processo_numero, pa.numPasta AS pasta_numero,
              ap.numero AS parcela_numero, COALESCE(ac.tipo, ac2.tipo) AS acordo_tipo
       ${DE_ONDE} ${onde}
       ORDER BY l.criado_em DESC, l.id DESC LIMIT ${limite} OFFSET ${offset}`, f.params);
    const registros = linhas.map(r => ({ ...r, acao_rotulo: ROTULO[`${r.tabela}:${r.acao}`] || r.acao }));
    const resposta = { registros, total: Number(tot.n), pagina, limite };
    if (!acordoIdDaRota) {   // lista de quem já agiu, para o filtro "Usuário"
      const [usuarios] = await pool.execute(
        `SELECT DISTINCT u.id, u.nome FROM logs_auditoria l JOIN usuarios u ON u.id = l.usuario_id
          WHERE l.tabela IN (${TABELAS.map(() => '?').join(',')}) ORDER BY u.nome`, TABELAS);
      resposta.usuarios = usuarios;
    }
    return sucesso(res, resposta);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/atividade
const atividade = (req, res) => consultar(req, res, null);

// GET /api/financeiro/acordo/:id/historico
function atividadeDoAcordo(req, res) {
  if (!/^\d{1,15}$/.test(String(req.params.id))) return res.status(404).json({ ok: false, mensagem: 'Acordo não encontrado' });
  return consultar(req, res, Number(req.params.id));
}

module.exports = { atividade, atividadeDoAcordo };
