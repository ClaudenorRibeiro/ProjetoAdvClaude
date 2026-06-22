// ============================================================
// SERVIÇO DE ANÁLISE DE MODELOS .docx
// ------------------------------------------------------------
// Lê um arquivo .docx (em memória) e extrai as variáveis {{tag}}
// usadas nele. Com base no catálogo central (variaveisDocumento),
// separa variáveis conhecidas/desconhecidas e deriva os "blocos
// exigidos" (quais âncoras conseguem preencher o modelo).
//
// Observação técnica: o Word pode quebrar "{{nome_cliente}}" em vários
// trechos (runs) dentro do XML. Por isso, antes de procurar as tags,
// removemos as marcações XML — assim os pedaços do texto se juntam e
// a variável reaparece inteira.
// ============================================================

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { TAGS_CONHECIDAS, BLOCO_DE_TAG, TAGS_PARTE } = require('../config/variaveisDocumento');

// Partes do .docx que contêm texto visível (corpo, cabeçalhos e rodapés).
const PARTES_TEXTO = /word\/(document|header\d*|footer\d*)\.xml$/;

// Verifica se o buffer é um .docx válido (um .docx é um zip com word/document.xml).
function ehDocxValido(buffer) {
  try {
    const zip = new PizZip(buffer);
    return !!zip.file('word/document.xml');
  } catch {
    return false;
  }
}

// Extrai a lista de variáveis {{tag}} encontradas no documento (sem repetição).
function extrairVariaveis(buffer) {
  const zip = new PizZip(buffer);
  let texto = '';

  // Junta o texto de todas as partes relevantes, removendo as tags XML
  // (assim runs separados pelo Word se reconectam).
  Object.keys(zip.files).forEach(nome => {
    if (PARTES_TEXTO.test(nome)) {
      const xml = zip.files[nome].asText();
      texto += ' ' + xml.replace(/<[^>]+>/g, '');
    }
  });

  // Desfaz as entidades XML básicas (ex.: &amp; -> &).
  texto = texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

  // Captura {{ tag }} aceitando espaços internos; tag só com letras/números/_.
  const encontradas = new Set();
  const re = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    encontradas.add(m[1]);
  }
  return [...encontradas];
}

// Analisa o .docx: retorna as variáveis usadas, separadas em conhecidas/
// desconhecidas, e os blocos exigidos (sem 'escritorio', que é sempre disponível).
function analisar(buffer) {
  const variaveis = extrairVariaveis(buffer);
  const conhecidas = [];
  const desconhecidas = [];
  const blocos = new Set();

  variaveis.forEach(v => {
    if (TAGS_CONHECIDAS.has(v)) {
      conhecidas.push(v);
      const bloco = BLOCO_DE_TAG[v];
      // 'escritorio' está sempre disponível, então não conta como bloco exigido.
      if (bloco && bloco !== 'escritorio') blocos.add(bloco);
    } else {
      desconhecidas.push(v);
    }
  });

  return { variaveis, conhecidas, desconhecidas, blocos: [...blocos] };
}

// Analisa um modelo "Documento de partes" (multipessoas). Aqui as variáveis válidas
// são as DA PESSOA (dentro de {{#autores}}/{{#reus}}) + 'tipo' (sub-região de telefones)
// + as do escritório (ver TAGS_PARTE). Os marcadores de seção ({{#autores}}, {{/autores}},
// {{#telefones}}…) NÃO são capturados por extrairVariaveis (contêm # e /), então não viram
// "desconhecidas". Não há "blocos exigidos" aqui (sempre autores/réus), por isso blocos: [].
function analisarMultipessoas(buffer) {
  const variaveis = extrairVariaveis(buffer);
  const conhecidas = [];
  const desconhecidas = [];
  variaveis.forEach(v => {
    if (TAGS_PARTE.has(v)) conhecidas.push(v);
    else desconhecidas.push(v);
  });
  return { variaveis, conhecidas, desconhecidas, blocos: [] };
}

// Preenche um modelo .docx (buffer) substituindo os {{marcadores}} pelos valores em `dados`.
// `dados` é um objeto plano { tag: valor }. Marcadores sem valor viram string vazia
// (nullGetter), nunca "undefined" nem erro. Retorna o Buffer do .docx preenchido.
function preencher(buffer, dados) {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' }, // mesmos delimitadores do catálogo
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',                    // variável ausente -> vazio (não quebra)
  });
  doc.render(dados);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { ehDocxValido, extrairVariaveis, analisar, analisarMultipessoas, preencher };
