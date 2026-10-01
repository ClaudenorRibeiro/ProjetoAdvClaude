// ============================================================
// RELATÓRIOS — EXECUTOR: roda a consulta e entrega as linhas já "legíveis"
// (sim/não, rótulos de status etc.). Nada é guardado: sai direto para a tela ou para o arquivo.
// ============================================================
const { pool } = require('../../config/database');
const L = require('./limites');
const { montarConsulta, montarContagem } = require('./montador');

async function contar(assunto, receita, ctx) {
  const q = montarContagem(assunto, receita, ctx);
  const [rows] = await pool.execute(q.sql, q.params);
  return Number(rows[0].total);
}

// Converte o valor cru do banco para o que a tela/arquivo mostram
function converterLinha(assunto, receita, linha) {
  const saida = { __pasta_id: linha.__pasta_id ?? null };
  for (const chave of receita.colunas) {
    const campo = assunto.campos[chave];
    let v = linha[chave];
    if (v === undefined || v === null) v = null;
    else if (campo.tipo === 'booleano') v = Number(v) === 1;
    else if (campo.rotulosValor) v = campo.rotulosValor[v] ?? v;
    saida[chave] = v;
  }
  return saida;
}

async function lerLinhas(assunto, receita, ctx, { limite, offset }) {
  const q = montarConsulta(assunto, receita, ctx, { limite, offset });
  const [rows] = await pool.execute(q.sql, q.params);
  return rows.map(r => converterLinha(assunto, receita, r));
}

function descreverColunas(assunto, receita) {
  return receita.colunas.map(chave => {
    const c = assunto.campos[chave];
    return { chave, rotulo: c.rotulo, tipo: c.tipo, formato: c.formato || null };
  });
}

// Uma página para a tela. Só navega até LIMITE_TELA linhas; o total real é informado.
async function executarPagina(assunto, receita, ctx, { pagina = 1, limite = L.POR_PAGINA_PADRAO } = {}) {
  const lim = Math.max(1, Math.min(parseInt(limite, 10) || L.POR_PAGINA_PADRAO, L.POR_PAGINA_MAX));
  const pag = Math.max(1, parseInt(pagina, 10) || 1);
  const offset = (pag - 1) * lim;
  const total = await contar(assunto, receita, ctx);
  const visiveis = Math.min(total, L.LIMITE_TELA);
  const restante = Math.max(0, visiveis - offset);
  const linhas = restante > 0 ? await lerLinhas(assunto, receita, ctx, { limite: Math.min(lim, restante), offset }) : [];
  return {
    colunas: descreverColunas(assunto, receita),
    linhas, total, pagina: pag, limite: lim,
    limiteTela: L.LIMITE_TELA, truncado: total > L.LIMITE_TELA,
  };
}

module.exports = { contar, lerLinhas, executarPagina, descreverColunas };
