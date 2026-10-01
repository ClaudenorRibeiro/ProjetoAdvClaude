// ============================================================
// RELATÓRIOS — tipos de campo e operadores permitidos em cada um
// Fonte única: a tela recebe esta lista pelo /relatorios/catalogo.
// aridade: nenhum | um | dois | lista | periodo
// ============================================================

const OPERADORES = {
  texto: {
    contem:     { rotulo: 'contém',           aridade: 'um' },
    nao_contem: { rotulo: 'não contém',       aridade: 'um' },
    igual:      { rotulo: 'é igual a',        aridade: 'um' },
    diferente:  { rotulo: 'é diferente de',   aridade: 'um' },
    comeca_com: { rotulo: 'começa com',       aridade: 'um' },
    vazio:      { rotulo: 'está vazio',       aridade: 'nenhum' },
    nao_vazio:  { rotulo: 'não está vazio',   aridade: 'nenhum' },
  },
  numero: {
    igual:       { rotulo: 'é igual a',       aridade: 'um' },
    diferente:   { rotulo: 'é diferente de',  aridade: 'um' },
    maior:       { rotulo: 'maior que',       aridade: 'um' },
    maior_igual: { rotulo: 'maior ou igual a', aridade: 'um' },
    menor:       { rotulo: 'menor que',       aridade: 'um' },
    menor_igual: { rotulo: 'menor ou igual a', aridade: 'um' },
    entre:       { rotulo: 'entre',           aridade: 'dois' },
    vazio:       { rotulo: 'está vazio',      aridade: 'nenhum' },
    nao_vazio:   { rotulo: 'não está vazio',  aridade: 'nenhum' },
  },
  data: {
    igual:      { rotulo: 'é',                aridade: 'um' },
    antes:      { rotulo: 'antes de',         aridade: 'um' },
    depois:     { rotulo: 'depois de',        aridade: 'um' },
    entre:      { rotulo: 'entre',            aridade: 'dois' },
    no_periodo: { rotulo: 'no período',       aridade: 'periodo' },
    vazio:      { rotulo: 'está vazio',       aridade: 'nenhum' },
    nao_vazio:  { rotulo: 'não está vazio',   aridade: 'nenhum' },
  },
  lista: {
    em:        { rotulo: 'é um destes',       aridade: 'lista' },
    nao_em:    { rotulo: 'não é nenhum destes', aridade: 'lista' },
    vazio:     { rotulo: 'está vazio',        aridade: 'nenhum' },
    nao_vazio: { rotulo: 'não está vazio',    aridade: 'nenhum' },
  },
  booleano: {
    verdadeiro: { rotulo: 'é sim',            aridade: 'nenhum' },
    falso:      { rotulo: 'é não',            aridade: 'nenhum' },
  },
};
OPERADORES.datahora = OPERADORES.data; // datahora filtra pela DATA (ignora a hora)

const TIPOS = Object.keys(OPERADORES);

function operadoresDoTipo(tipo) { return OPERADORES[tipo] || {}; }

module.exports = { OPERADORES, TIPOS, operadoresDoTipo };
