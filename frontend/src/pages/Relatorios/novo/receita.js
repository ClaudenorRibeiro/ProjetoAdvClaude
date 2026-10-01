// ============================================================
// RELATÓRIOS (tela nova) — funções puras sobre a "receita" (sem React, fáceis de testar).
// A receita é só uma lista de escolhas: assunto, colunas, filtros (E/OU) e ordem.
// ============================================================

export const VERSAO_RECEITA = 2;

export function receitaVazia(assunto) {
  return {
    versao: VERSAO_RECEITA,
    assunto: assunto.chave,
    colunas: [...assunto.colunasPadrao],
    filtros: { op: 'E', itens: [] },
    ordem: assunto.ordemPadrao.map(o => ({ ...o })),
    agrupar: [],
    metricas: [],
    ordemGrupo: null,
  };
}

// Receita salva na Fase 1 não tem agrupamento: completa os campos novos
export function normalizarReceita(r) {
  return { agrupar: [], metricas: [], ordemGrupo: null, ...r };
}

export function campoDe(assunto, chave) {
  return assunto?.campos.find(c => c.chave === chave) || null;
}

export function operadorDe(campo, valor) {
  return campo?.operadores.find(o => o.valor === valor) || null;
}

// Valor inicial adequado ao tipo de condição (a tela nunca começa com valor "impossível")
export function valorInicial(aridade, periodos = []) {
  switch (aridade) {
    case 'um': return '';
    case 'dois': return ['', ''];
    case 'lista': return [];
    case 'periodo': return periodos[0]?.valor || '';
    default: return null;
  }
}

export function novaCondicao(assunto, periodos) {
  const campo = assunto.campos[0];
  const operador = campo.operadores[0];
  return { campo: campo.chave, operador: operador.valor, valor: valorInicial(operador.aridade, periodos) };
}

export function trocarCampo(assunto, condicao, novoCampoChave, periodos) {
  const campo = campoDe(assunto, novoCampoChave);
  const operador = campo.operadores[0];
  return { campo: novoCampoChave, operador: operador.valor, valor: valorInicial(operador.aridade, periodos) };
}

export function trocarOperador(campo, condicao, novoOperador, periodos) {
  const antes = operadorDe(campo, condicao.operador);
  const depois = operadorDe(campo, novoOperador);
  // mantém o que o usuário já digitou quando o formato do valor é o mesmo
  const valor = antes?.aridade === depois.aridade ? condicao.valor : valorInicial(depois.aridade, periodos);
  return { ...condicao, operador: novoOperador, valor };
}

// data relativa só vale com o número de dias preenchido
const vazio = (v) => v === '' || v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v) && v.rel === 'hoje' && (v.dias === '' || v.dias === undefined));

// A condição tem tudo o que precisa para ser executada?
export function condicaoCompleta(assunto, condicao) {
  if (condicao.perguntar) return true;   // o valor virá da resposta, na hora de rodar
  const campo = campoDe(assunto, condicao.campo);
  const op = operadorDe(campo, condicao.operador);
  if (!campo || !op) return false;
  switch (op.aridade) {
    case 'nenhum': return true;
    case 'um': return !vazio(condicao.valor);
    case 'dois': return Array.isArray(condicao.valor) && condicao.valor.length === 2 && !condicao.valor.some(vazio);
    case 'lista': return Array.isArray(condicao.valor) && condicao.valor.length > 0;
    case 'periodo': return !vazio(condicao.valor);
    default: return false;
  }
}

export function contarCondicoes(grupo) {
  return grupo.itens.reduce((n, i) => n + (i.itens ? contarCondicoes(i) : 1), 0);
}

export function contarIncompletas(assunto, grupo) {
  return grupo.itens.reduce((n, i) => n + (i.itens ? contarIncompletas(assunto, i) : (condicaoCompleta(assunto, i) ? 0 : 1)), 0);
}

// Atualização imutável de um nó da árvore de filtros, por caminho de índices ([] = raiz)
export function atualizarNo(grupo, caminho, fn) {
  if (caminho.length === 0) return fn(grupo);
  const [i, ...resto] = caminho;
  return { ...grupo, itens: grupo.itens.map((item, idx) => (idx === i ? atualizarNo(item, resto, fn) : item)) };
}

export function validarLocal(assunto, receita) {
  const erros = [];
  if (!receita.colunas.length) erros.push('Escolha ao menos uma coluna.');
  const incompletas = contarIncompletas(assunto, receita.filtros);
  if (incompletas) erros.push(`Há ${incompletas} filtro(s) sem valor. Preencha ou remova.`);
  return erros;
}

// Mantém só o que o servidor aceita (sem grupos vazios nem condições incompletas)
export function limparReceita(assunto, receita) {
  const limpar = (g) => {
    const itens = g.itens
      .map(i => (i.itens ? limpar(i) : (condicaoCompleta(assunto, i) ? i : null)))
      .filter(i => i && (!i.itens || i.itens.length));
    return { op: g.op, itens };
  };
  return { ...receita, filtros: limpar(receita.filtros) };
}

export function mover(lista, de, para) {
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

// ---------- perguntas ("perguntar ao abrir") ----------
// [{ caminho: [i, j], condicao }] — todas as condições marcadas, em qualquer nível
export function perguntasDe(grupo, caminho = []) {
  return grupo.itens.flatMap((item, i) => (item.itens
    ? perguntasDe(item, [...caminho, i])
    : (item.perguntar ? [{ caminho: [...caminho, i], condicao: item }] : [])));
}

// A resposta preenche o que a condição precisa?
export function respostaCompleta(assunto, condicao, valor) {
  return condicaoCompleta(assunto, { ...condicao, perguntar: false, valor });
}

// ---------- agrupar e totalizar ----------
const NOMES_FUNCAO = { contagem: 'Quantidade', soma: 'Soma', media: 'Média', minimo: 'Mínimo', maximo: 'Máximo' };

export function rotuloMetrica(assunto, metrica) {
  return metrica.campo ? `${NOMES_FUNCAO[metrica.funcao]} de ${campoDe(assunto, metrica.campo)?.rotulo || metrica.campo}` : NOMES_FUNCAO[metrica.funcao];
}

// Funções de total que ainda têm algum campo onde fazem sentido neste assunto
export function funcoesDisponiveis(assunto) {
  const lista = [{ valor: 'contagem', rotulo: 'Quantidade' }];
  ['soma', 'media', 'minimo', 'maximo'].forEach(f => {
    if (assunto.campos.some(c => c.funcoes?.some(x => x.valor === f))) lista.push({ valor: f, rotulo: NOMES_FUNCAO[f] });
  });
  return lista;
}

export function camposDaFuncao(assunto, funcao) {
  return assunto.campos.filter(c => c.funcoes?.some(x => x.valor === funcao));
}

export const temAgrupamento = (receita) => (receita.agrupar?.length || 0) > 0 || (receita.metricas?.length || 0) > 0;
