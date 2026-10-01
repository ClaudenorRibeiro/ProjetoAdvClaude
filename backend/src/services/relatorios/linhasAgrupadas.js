// ============================================================
// RELATÓRIOS — monta as LINHAS do resultado agrupado (funções puras, fáceis de testar):
// ordena os grupos, intercala os subtotais e fecha com o total geral.
// ============================================================
const { ehData } = require('./tipos');

// nulos sempre por último (em qualquer direção); datas/números pela chave, textos pelo nome mostrado
function comparar(a, b, usarRotulo, dir = 1) {
  const [x, y] = usarRotulo ? [a.rotulo, b.rotulo] : [a.chave, b.chave];
  if ((a.chave === null) !== (b.chave === null)) return a.chave === null ? 1 : -1;
  if (a.chave === null) return 0;
  if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
  return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * dir;
}

const direcao = (d) => (d === 'desc' ? -1 : 1);

// folhas: [{ chaves:[..], rotulos:[..], valores:[..] }]; subtotais: idem com 1 chave; total: { valores }
function montarLinhas({ assunto, agrupar, ordemGrupo, folhas, subtotais, total }) {
  const usaRotulo = agrupar.map(g => !ehData(assunto.campos[g.campo].tipo) && assunto.campos[g.campo].tipo !== 'numero');
  const noItem = (linha, i) => ({ chave: linha.chaves[i], rotulo: linha.rotulos[i] });
  const porGrupo = (i, d = 1) => (a, b) => comparar(noItem(a, i), noItem(b, i), usaRotulo[i], d);

  const por = ordemGrupo?.por || null;
  const dir = direcao(ordemGrupo?.direcao);
  const m = por && por[0] === 'm' ? Number(por.slice(1)) - 1 : null;
  const g = por && por[0] === 'g' ? Number(por.slice(1)) - 1 : null;
  const porMetrica = (a, b) => {
    const x = a.valores[m]; const y = b.valores[m];
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    return typeof x === 'number' && typeof y === 'number' ? (x - y) * dir : String(x).localeCompare(String(y)) * dir;
  };

  const linhas = [];
  if (agrupar.length === 1) {
    const cmp = m !== null ? porMetrica : porGrupo(0, g === 0 ? dir : 1);
    [...folhas].sort(cmp).forEach(f => linhas.push({ tipo: 'grupo', nivel: 1, ...f }));
  } else if (agrupar.length === 2) {
    const blocos = subtotais.map(s => ({ s, filhos: folhas.filter(f => f.chaves[0] === s.chaves[0]) }));
    const cmpBloco = m !== null ? (a, b) => porMetrica(a.s, b.s) : (a, b) => porGrupo(0, g === 0 ? dir : 1)(a.s, b.s);
    const cmpFilho = m !== null ? porMetrica : porGrupo(1, g === 1 ? dir : 1);
    blocos.sort(cmpBloco).forEach(({ s, filhos }) => {
      filhos.sort(cmpFilho).forEach(f => linhas.push({ tipo: 'grupo', nivel: 2, ...f }));
      linhas.push({ tipo: 'subtotal', nivel: 1, ...s });
    });
  }
  linhas.push({ tipo: 'total', nivel: 0, chaves: [], rotulos: [], valores: total.valores });
  return linhas;
}

module.exports = { montarLinhas, comparar };
