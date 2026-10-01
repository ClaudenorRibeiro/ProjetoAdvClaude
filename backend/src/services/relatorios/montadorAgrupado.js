// ============================================================
// RELATÓRIOS — SQL do resultado AGRUPADO. Quatro consultas, todas com o MESMO filtro/visibilidade:
//   contagemGrupos (quantos grupos há), folhas (um por grupo), subtotais (por 1º nível) e total geral.
// Subtotais e total são consultas próprias: média/mínimo/máximo saem exatos, não "aproximados dos filhos".
// ============================================================
const { base, DICA, resolverJuncoes } = require('./montador');
const { expressaoGrupo, expressaoMetrica } = require('./agrupamento');

function montarAgrupado(assunto, receita, ctx) {
  const juncoes = new Set();
  const usar = (campo) => (campo.juncoes || []).forEach(j => juncoes.add(j));

  const grupos = receita.agrupar.map((g, i) => {
    const campo = assunto.campos[g.campo];
    usar(campo);
    return { n: i + 1, ...expressaoGrupo(campo, g.passo) };
  });
  const metricas = receita.metricas.map((m, i) => {
    if (m.campo) usar(assunto.campos[m.campo]);
    return `${expressaoMetrica(m, assunto)} AS m${i + 1}`;
  });

  const { acumulo, where } = base(assunto, receita, ctx, juncoes);
  const joins = resolverJuncoes(assunto, acumulo.juncoes);
  const de = `FROM ${assunto.from} ${joins}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const params = acumulo.params;

  const colunasGrupo = (n) => grupos.slice(0, n).flatMap(g => [`${g.chave} AS g${g.n}`, ...(g.rotulo ? [`${g.rotulo} AS g${g.n}_l`] : [])]);
  const agrupadoPor = (n) => grupos.slice(0, n).map(g => `g${g.n}`).join(', ');
  const consulta = (n) => ({
    sql: `SELECT ${DICA} ${[...colunasGrupo(n), ...metricas].join(', ')} ${de}${n ? ` GROUP BY ${agrupadoPor(n)}` : ''}`,
    params,
  });

  return {
    contagemGrupos: grupos.length ? {
      sql: `SELECT ${DICA} COUNT(*) AS total FROM (SELECT ${grupos.map(g => `${g.chave} AS g${g.n}`).join(', ')} ${de} GROUP BY ${agrupadoPor(grupos.length)}) grupos_`,
      params,
    } : null,
    folhas: grupos.length ? consulta(grupos.length) : null,
    subtotais: grupos.length === 2 ? consulta(1) : null,
    total: consulta(0),
  };
}

module.exports = { montarAgrupado };
