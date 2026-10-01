// ============================================================
// RELATÓRIOS — respostas das perguntas feitas na hora de rodar ("perguntar ao abrir").
// Só entram em condições que a receita marcou com perguntar:true; o resultado ainda passa
// pelo validador completo (a resposta nunca fura as regras).
// ============================================================
const { ErroRelatorio } = require('./erros');

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// parametros: [{ caminho: [i, j, ...], valor }]  (índices dentro de filtros.itens)
function aplicarParametros(receita, parametros) {
  if (parametros === undefined || parametros === null) return receita;
  if (!Array.isArray(parametros) || parametros.length > 25) throw new ErroRelatorio('Respostas inválidas.');
  const copia = JSON.parse(JSON.stringify(receita));
  for (const p of parametros) {
    if (!ehObjeto(p) || !Array.isArray(p.caminho) || !p.caminho.length) throw new ErroRelatorio('Respostas inválidas.');
    let no = copia.filtros;
    for (const i of p.caminho) {
      if (!ehObjeto(no) || !Array.isArray(no.itens) || !Number.isInteger(i) || !no.itens[i]) throw new ErroRelatorio('Resposta para uma pergunta que não existe.');
      no = no.itens[i];
    }
    if (no.itens || no.perguntar !== true) throw new ErroRelatorio('Esta condição não é uma pergunta do relatório.');
    no.valor = p.valor;
  }
  return copia;
}

// Receita para listar os ITENS de um grupo: a mesma receita, sem agrupar, com o grupo como filtro extra
function receitaDoDetalhe(receita, condicoesGrupo) {
  const filtrosOriginais = receita.filtros.itens.length ? [receita.filtros] : [];
  return { ...receita, agrupar: [], metricas: [], ordemGrupo: null, filtros: { op: 'E', itens: [...filtrosOriginais, ...condicoesGrupo] } };
}

const temAgrupamento = (receita) => receita.agrupar.length > 0 || receita.metricas.length > 0;

module.exports = { aplicarParametros, receitaDoDetalhe, temAgrupamento };
