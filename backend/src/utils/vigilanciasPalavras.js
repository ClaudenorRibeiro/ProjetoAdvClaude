// PALAVRAS QUE SUGEREM QUE A PARTE CONTRÁRIA RECORREU. É só uma pista para o usuário conferir (nunca cria prazo sozinha).
// Igual ao NovoJud-saas (porte de 05/11/2026).
//
// PARA MUDAR: basta acrescentar ou tirar uma frase em uma das duas listas abaixo (uma por linha, entre aspas simples,
// terminando com vírgula). Pode escrever com acento e maiúscula: o sistema ignora os dois.
//
// LISTA 1: frases que mostram que o recurso foi apresentado ou recebido. Se o texto tiver uma delas, avisa.
const FRASES_QUE_AVISAM = [
  // o recurso foi apresentado
  'interposto recurso',
  'recurso interposto',
  'interposição de recurso',
  'interpôs recurso',
  'apelação interposta',
  'interpôs apelação',
  // o recurso foi recebido ou juntado
  'recebo a apelação',
  'recebo o recurso',
  'recebida a apelação',
  'juntada de apelação',
  'juntada de recurso',
  'razões de apelação',
  // a outra parte é chamada para responder
  'contrarrazões',
  'contra-razões',
  'contra razões',
  'contrarrazoar',
  // tipos de recurso
  'recurso adesivo',
  'recurso inominado',
  'recurso ordinário',
  'recurso de revista',
  'recurso de apelação',
  'recurso especial',
  'recurso extraordinário',
  // quem recorre e quem responde
  'apelante',
  'apelado',
  'recorrente',
  'recorrido',
  // os autos sobem ao tribunal
  'subam os autos',
  'remessa dos autos ao tribunal',
];

// LISTA 2: frases comuns em sentença que falam de recurso sem que ele tenha sido feito. O sistema APAGA estas frases
// do texto antes de procurar a lista 1, para elas não gerarem aviso falso.
const FRASES_QUE_SAO_IGNORADAS = [
  'cabe recurso',
  'caberá recurso',
  'cabível recurso',
  'cabe recurso inominado',
  'prazo para recurso',
  'prazo de recurso',
  'prazo recursal',
  'passível de recurso',
  'sem prejuízo de recurso',
  'desta decisão cabe recurso',
];

const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const AVISAM = FRASES_QUE_AVISAM.map(normalizar);
const IGNORADAS = FRASES_QUE_SAO_IGNORADAS.map(normalizar);

function pareceRecurso(texto) {
  let t = normalizar(texto);
  for (const frase of IGNORADAS) t = t.split(frase).join(' ');
  return AVISAM.some((p) => t.includes(p));
}

module.exports = { FRASES_QUE_AVISAM, FRASES_QUE_SAO_IGNORADAS, pareceRecurso };
