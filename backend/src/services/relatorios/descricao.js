// ============================================================
// RELATÓRIOS — descreve em português os filtros de uma receita
// (usado na aba "Informações" do Excel; a tela monta os seus próprios rótulos).
// ============================================================
const { operadoresDoTipo, PASSOS_DATA, ehData } = require('./tipos');
const { rotuloDaMetrica } = require('./agrupamento');
const { PERIODOS } = require('./datasRelativas');
const { opcoesDoCampo } = require('./catalogo');

function formatarData(v) {
  if (typeof v === 'string') return v.split('-').reverse().join('/');
  const d = Number(v.dias || 0);
  return d === 0 ? 'hoje' : `hoje ${d > 0 ? '+' : '-'} ${Math.abs(d)} dias`;
}

async function descreverCondicao(campo, c, ctx) {
  const op = operadoresDoTipo(campo.tipo)[c.operador];
  const aridade = op.aridade;
  let valor = '';
  if (aridade === 'um') valor = campo.tipo.startsWith('data') ? formatarData(c.valor) : String(c.valor);
  else if (aridade === 'dois') valor = c.valor.map(v => (campo.tipo.startsWith('data') ? formatarData(v) : v)).join(' e ');
  else if (aridade === 'periodo') valor = PERIODOS[c.valor].rotulo;
  else if (aridade === 'lista') {
    const opcoes = await opcoesDoCampo(campo, ctx);
    valor = c.valor.map(v => opcoes.find(o => String(o.valor) === String(v))?.rotulo || v).join(', ');
  }
  return `${campo.rotulo} ${op.rotulo}${valor ? ` ${valor}` : ''}`;
}

async function descreverGrupo(no, assunto, ctx, nivel = 0) {
  const linhas = [];
  const prefixo = '  '.repeat(nivel);
  for (const item of no.itens) {
    if (item.itens) {
      linhas.push(`${prefixo}${item.op === 'OU' ? 'Qualquer uma destas:' : 'Todas estas:'}`);
      linhas.push(...await descreverGrupo(item, assunto, ctx, nivel + 1));
    } else {
      linhas.push(prefixo + await descreverCondicao(assunto.campos[item.campo], item, ctx));
    }
  }
  return linhas;
}

async function descreverFiltros(assunto, receita, ctx) {
  if (!receita.filtros.itens.length) return ['(nenhum filtro)'];
  const cabeca = receita.filtros.op === 'OU' ? 'Qualquer uma destas condições:' : 'Todas estas condições:';
  return [cabeca, ...await descreverGrupo(receita.filtros, assunto, ctx, 1)];
}

// "Responsável; Vencimento (mês)"  e  "Quantidade; Média de Quantidade de dias"
function descreverAgrupamento(assunto, receita) {
  const grupos = receita.agrupar.map(g => {
    const c = assunto.campos[g.campo];
    return ehData(c.tipo) ? `${c.rotulo} (${PASSOS_DATA[g.passo].toLowerCase()})` : c.rotulo;
  });
  return { agrupadoPor: grupos.join('; ') || '(sem agrupamento: só o total geral)', totais: receita.metricas.map(m => rotuloDaMetrica(m, assunto)).join('; ') };
}

module.exports = { descreverFiltros, descreverAgrupamento };
