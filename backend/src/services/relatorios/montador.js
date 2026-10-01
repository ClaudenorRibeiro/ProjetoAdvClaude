// ============================================================
// RELATÓRIOS — MONTADOR: transforma uma receita JÁ VALIDADA em SQL.
// Só usa expressões do catálogo; todo valor do usuário vai em parâmetros (?).
// Só entra no SQL a junção (JOIN) que a receita realmente usa.
// ============================================================
const L = require('./limites');
const { condicaoSql } = require('./condicoes');

// Junções necessárias: as pedidas + dependências + as obrigatórias, na ordem do catálogo
function resolverJuncoes(assunto, pedidas) {
  const precisa = new Set(pedidas);
  assunto.juncoes.filter(j => j.obrigatoria).forEach(j => precisa.add(j.id));
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const j of assunto.juncoes) {
      if (precisa.has(j.id)) (j.depende || []).forEach(d => { if (!precisa.has(d)) { precisa.add(d); mudou = true; } });
    }
  }
  return assunto.juncoes.filter(j => precisa.has(j.id)).map(j => j.sql).join(' ');
}

function sqlFiltros(no, assunto, hoje, acumulo) {
  const partes = no.itens.map(item => {
    if (item.itens) return sqlFiltros(item, assunto, hoje, acumulo);
    const campo = assunto.campos[item.campo];
    (campo.juncoes || []).forEach(j => acumulo.juncoes.add(j));
    const c = condicaoSql(campo, item.operador, item.valor, hoje);
    acumulo.params.push(...c.params);
    return c.sql;
  });
  return `(${partes.join(no.op === 'OU' ? ' OR ' : ' AND ')})`;
}

// Parte comum: FROM + JOINs + WHERE (visibilidade E filtros)
function base(assunto, receita, ctx, juncoesExtras) {
  const acumulo = { juncoes: new Set(juncoesExtras), params: [] };
  const where = [];
  const vis = assunto.visibilidade(ctx);
  if (vis) { where.push(vis.sql); acumulo.params.push(...vis.params); (vis.juncoes || []).forEach(j => acumulo.juncoes.add(j)); }
  if (receita.filtros.itens.length) where.push(sqlFiltros(receita.filtros, assunto, ctx.hoje, acumulo));
  return { acumulo, where };
}

const DICA = `/*+ MAX_EXECUTION_TIME(${L.TEMPO_MAX_MS}) */`;

function montarContagem(assunto, receita, ctx) {
  const { acumulo, where } = base(assunto, receita, ctx, []);
  const joins = resolverJuncoes(assunto, acumulo.juncoes);
  return {
    sql: `SELECT ${DICA} COUNT(*) AS total FROM ${assunto.from} ${joins}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
    params: acumulo.params,
  };
}

function montarConsulta(assunto, receita, ctx, { limite, offset }) {
  const lim = Math.max(1, Math.min(parseInt(limite, 10) || L.POR_PAGINA_PADRAO, L.LOTE_EXPORTACAO));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const juncoes = new Set();
  const usar = (campo) => (campo.juncoes || []).forEach(j => juncoes.add(j));

  const colunas = receita.colunas.map(chave => {
    const campo = assunto.campos[chave];
    usar(campo);
    return `${campo.expr} AS \`${chave}\``;
  });
  colunas.push(`${assunto.pk} AS \`__id\``);   // identifica a linha (para ações como "Parabenizar")
  if (assunto.linkPasta) {   // assuntos sem pasta (ex.: Pessoas) não têm link para abrir
    colunas.push(`${assunto.linkPasta.expr} AS \`__pasta_id\``);
    assunto.linkPasta.juncoes.forEach(j => juncoes.add(j));
  }

  const criterios = receita.ordem.length ? receita.ordem : assunto.ordemPadrao;
  const ordem = criterios.map(o => {
    const campo = assunto.campos[o.campo];
    usar(campo);
    return `${campo.ordemExpr || campo.expr} ${o.direcao === 'desc' ? 'DESC' : 'ASC'}`;
  });
  ordem.push(`${assunto.pk} ASC`); // desempate fixo: a paginação não repete nem perde linha

  const { acumulo, where } = base(assunto, receita, ctx, juncoes);
  const joins = resolverJuncoes(assunto, acumulo.juncoes);
  return {
    sql: `SELECT ${DICA} ${colunas.join(', ')} FROM ${assunto.from} ${joins}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ordem.join(', ')} LIMIT ${lim} OFFSET ${off}`,
    params: acumulo.params,
  };
}

module.exports = { montarConsulta, montarContagem, resolverJuncoes, base, DICA };
