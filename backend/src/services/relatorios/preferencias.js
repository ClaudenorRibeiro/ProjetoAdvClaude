// ============================================================
// RELATÓRIOS — preferências de exibição de um relatório salvo (por usuário).
// É a ÚNICA coisa guardada além da receita: como o usuário gosta de ver (linhas por página,
// tabela/gráfico/tabela cruzada, tipo de gráfico). Nunca dados do relatório.
// ============================================================
const L = require('./limites');
const { ErroRelatorio } = require('./erros');

const LINHAS_POR_PAGINA_VALIDAS = [10, 25, 50, 100, 200];
const VISOES = ['tabela', 'grafico', 'cruzada'];
const TIPOS_GRAFICO = ['colunas', 'barras', 'linhas', 'rosca'];
const CHAVES = ['linhas_por_pagina', 'visao', 'grafico'];

function validarGrafico(g) {
  if (g === null || typeof g !== 'object' || Array.isArray(g)) throw new ErroRelatorio('Preferência de gráfico inválida.');
  const saida = {};
  if (g.tipo !== undefined) {
    if (!TIPOS_GRAFICO.includes(g.tipo)) throw new ErroRelatorio('Tipo de gráfico inválido.');
    saida.tipo = g.tipo;
  }
  if (g.metrica !== undefined) {
    const n = /^m([1-9])$/.exec(String(g.metrica));
    if (!n || Number(n[1]) > L.MAX_METRICAS) throw new ErroRelatorio('Total do gráfico inválido.');
    saida.metrica = `m${n[1]}`;
  }
  if (g.empilhado !== undefined) {
    if (typeof g.empilhado !== 'boolean') throw new ErroRelatorio('Preferência de gráfico inválida.');
    saida.empilhado = g.empilhado;
  }
  return saida;
}

// Valida só o que veio; o que não veio fica como estava (o chamador mescla)
function validarPreferencias(bruto) {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) throw new ErroRelatorio('Preferências inválidas.');
  const chaves = Object.keys(bruto);
  if (!chaves.length || chaves.some(k => !CHAVES.includes(k))) throw new ErroRelatorio('Preferências inválidas.');
  const saida = {};
  if (bruto.linhas_por_pagina !== undefined) {
    const n = Number(bruto.linhas_por_pagina);
    if (!LINHAS_POR_PAGINA_VALIDAS.includes(n)) throw new ErroRelatorio('Quantidade de linhas por página inválida.');
    saida.linhas_por_pagina = n;
  }
  if (bruto.visao !== undefined) {
    if (!VISOES.includes(bruto.visao)) throw new ErroRelatorio('Forma de exibição inválida.');
    saida.visao = bruto.visao;
  }
  if (bruto.grafico !== undefined) saida.grafico = validarGrafico(bruto.grafico);
  return saida;
}

// O gráfico novo se mescla ao que já estava (mudar só o tipo não apaga o total escolhido)
function mesclar(atuais, novas) {
  const saida = { ...(atuais || {}), ...novas };
  if (novas.grafico) saida.grafico = { ...((atuais || {}).grafico || {}), ...novas.grafico };
  return saida;
}

module.exports = { validarPreferencias, mesclar, LINHAS_POR_PAGINA_VALIDAS, VISOES, TIPOS_GRAFICO };
