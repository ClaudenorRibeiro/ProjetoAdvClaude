// ============================================================
// RELATÓRIOS — transforma UMA condição já validada em SQL com parâmetros (?)
// O valor do usuário NUNCA entra no texto do SQL.
// ============================================================
const { resolverData, resolverPeriodo } = require('./datasRelativas');
const { escaparLike } = require('../../utils/helpers');


function condicaoSql(campo, operador, valor, hoje) {
  const expr = campo.exprFiltro || campo.expr;
  const dataExpr = campo.tipo === 'datahora' ? `DATE(${expr})` : expr;

  switch (operador) {
    case 'vazio':     return campo.tipo === 'texto'
      ? { sql: `(${expr} IS NULL OR ${expr} = '')`, params: [] }
      : { sql: `${expr} IS NULL`, params: [] };
    case 'nao_vazio': return campo.tipo === 'texto'
      ? { sql: `(${expr} IS NOT NULL AND ${expr} <> '')`, params: [] }
      : { sql: `${expr} IS NOT NULL`, params: [] };
    case 'verdadeiro': return { sql: `${expr} = 1`, params: [] };
    case 'falso':      return { sql: `(${expr} = 0 OR ${expr} IS NULL)`, params: [] };
    default: break;
  }

  if (campo.tipo === 'texto') {
    switch (operador) {
      case 'contem':     return { sql: `${expr} LIKE ?`,     params: [`%${escaparLike(valor)}%`] };
      case 'nao_contem': return { sql: `(${expr} NOT LIKE ? OR ${expr} IS NULL)`, params: [`%${escaparLike(valor)}%`] };
      case 'comeca_com': return { sql: `${expr} LIKE ?`,     params: [`${escaparLike(valor)}%`] };
      case 'igual':      return { sql: `${expr} = ?`,        params: [valor] };
      case 'diferente':  return { sql: `(${expr} <> ? OR ${expr} IS NULL)`, params: [valor] };
      default: break;
    }
  }

  if (campo.tipo === 'numero') {
    const mapa = { igual: '=', diferente: '<>', maior: '>', maior_igual: '>=', menor: '<', menor_igual: '<=' };
    if (mapa[operador]) return { sql: `${expr} ${mapa[operador]} ?`, params: [valor] };
    if (operador === 'entre') return { sql: `${expr} BETWEEN ? AND ?`, params: [valor[0], valor[1]] };
  }

  if (campo.tipo === 'data' || campo.tipo === 'datahora') {
    switch (operador) {
      case 'igual':  return { sql: `${dataExpr} = ?`, params: [resolverData(valor, hoje)] };
      case 'antes':  return { sql: `${dataExpr} < ?`, params: [resolverData(valor, hoje)] };
      case 'depois': return { sql: `${dataExpr} > ?`, params: [resolverData(valor, hoje)] };
      case 'entre':  return { sql: `${dataExpr} BETWEEN ? AND ?`, params: [resolverData(valor[0], hoje), resolverData(valor[1], hoje)] };
      case 'no_periodo': { const [de, ate] = resolverPeriodo(valor, hoje); return { sql: `${dataExpr} BETWEEN ? AND ?`, params: [de, ate] }; }
      default: break;
    }
  }

  if (campo.tipo === 'lista') {
    const marcas = valor.map(() => '?').join(', ');
    if (operador === 'em')     return { sql: `${expr} IN (${marcas})`, params: valor };
    if (operador === 'nao_em') return { sql: `(${expr} NOT IN (${marcas}) OR ${expr} IS NULL)`, params: valor };
  }

  throw new Error(`Operador não tratado: ${campo.tipo}/${operador}`);
}

module.exports = { condicaoSql, escaparLike };
