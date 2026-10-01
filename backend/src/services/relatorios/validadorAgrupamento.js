// ============================================================
// RELATÓRIOS — valida o AGRUPAMENTO e os TOTAIS de uma receita.
// O sistema "inteligente": só deixa agrupar o que agrupa e só deixa somar o que é número.
// ============================================================
const L = require('./limites');
const { FUNCOES, PASSOS_DATA, ehData, agrupavel } = require('./tipos');
const { campoPermitido } = require('./catalogo');

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const tem = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);

// Devolve { agrupar, metricas, ordemGrupo } normalizados; problemas vão para `erros`
function validarAgrupamento(r, assunto, ctx, erros) {
  const campoUsavel = (chave) => tem(assunto.campos, chave) && campoPermitido(ctx, assunto.campos[chave]);

  const agrupar = [];
  const listaGrupos = Array.isArray(r.agrupar) ? r.agrupar : [];
  if (listaGrupos.length > L.MAX_AGRUPAR) erros.push(`Agrupe por no máximo ${L.MAX_AGRUPAR} campos.`);
  for (const g of listaGrupos.slice(0, L.MAX_AGRUPAR)) {
    if (!ehObjeto(g) || !campoUsavel(g.campo)) { erros.push('Campo de agrupamento indisponível.'); continue; }
    const campo = assunto.campos[g.campo];
    if (!agrupavel(campo)) { erros.push(`Não faz sentido agrupar por "${campo.rotulo}".`); continue; }
    if (agrupar.some(x => x.campo === g.campo)) { erros.push(`"${campo.rotulo}" foi escolhido duas vezes no agrupamento.`); continue; }
    const item = { campo: g.campo };
    if (ehData(campo.tipo)) {
      item.passo = g.passo === undefined ? 'mes' : g.passo;
      if (!tem(PASSOS_DATA, item.passo)) { erros.push(`Agrupamento de "${campo.rotulo}": escolha dia, semana, mês ou ano.`); continue; }
    }
    agrupar.push(item);
  }

  const metricas = [];
  const listaMetricas = Array.isArray(r.metricas) ? r.metricas : [];
  if (listaMetricas.length > L.MAX_METRICAS) erros.push(`No máximo ${L.MAX_METRICAS} totais.`);
  for (const m of listaMetricas.slice(0, L.MAX_METRICAS)) {
    if (!ehObjeto(m) || !tem(FUNCOES, m.funcao)) { erros.push('Total inválido.'); continue; }
    const f = FUNCOES[m.funcao];
    let item = { funcao: m.funcao };
    if (!f.semCampo) {
      if (!campoUsavel(m.campo)) { erros.push(`${f.rotulo}: campo indisponível.`); continue; }
      const campo = assunto.campos[m.campo];
      if (!f.aceita(campo.tipo)) { erros.push(`Não dá para calcular ${f.rotulo.toLowerCase()} de "${campo.rotulo}".`); continue; }
      item = { funcao: m.funcao, campo: m.campo };
    }
    if (metricas.some(x => x.funcao === item.funcao && x.campo === item.campo)) continue; // repetido: ignora
    metricas.push(item);
  }
  if (agrupar.length && !metricas.length) metricas.push({ funcao: 'contagem' }); // agrupar sem total não mostra nada

  // ordem dos grupos: 'g1'/'g2' (campo do grupo) ou 'm1'... (um dos totais)
  let ordemGrupo = null;
  if (r.ordemGrupo !== undefined && r.ordemGrupo !== null) {
    const por = ehObjeto(r.ordemGrupo) ? String(r.ordemGrupo.por) : '';
    const m = /^([gm])(\d+)$/.exec(por);
    const limite = m && (m[1] === 'g' ? agrupar.length : metricas.length);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > limite) erros.push('Ordem dos grupos inválida.');
    else ordemGrupo = { por, direcao: r.ordemGrupo.direcao === 'desc' ? 'desc' : 'asc' };
  }
  return { agrupar, metricas, ordemGrupo };
}

module.exports = { validarAgrupamento };
