// ============================================================
// SERVIÇO DE INTEGRAÇÃO COM O DATAJUD (API Pública do CNJ)
// ------------------------------------------------------------
// Consulta os MOVIMENTOS (tramitação) de um processo na Base Nacional de
// Dados do Poder Judiciário (DataJud). É o que alimenta a aba "Andamentos"
// de forma automática, ao lado dos andamentos lançados à mão.
//
// Contrato real (verificado na Wiki oficial do DataJud):
//   POST https://api-publica.datajud.cnj.jus.br/<alias_do_tribunal>/_search
//   headers: Authorization: APIKey <chave pública do CNJ>
//   body:    { "query": { "match": { "numeroProcesso": "<20 dígitos>" } } }
//   resposta: { hits: { hits: [ { _source: {
//                 numeroProcesso, dadosBasicos..., movimentos: [
//                   { codigo, nome, dataHora, complementosTabelados } ]
//              } } ] } }
//
// O <alias_do_tribunal> é descoberto a partir do PRÓPRIO número CNJ
// (campos .J.TR. — segmento do Judiciário + região/UF). Mapeamento conferido
// contra a lista oficial de índices e a Resolução CNJ 65/2008.
//
// A URL e a CHAVE ficam em configuracoes_integracoes (modulo='datajud'),
// NUNCA no código nem no .env. A chave pública pode ser trocada pelo CNJ a
// qualquer momento, por isso é editável em Configurações → Integrações.
// ============================================================

const axios = require('axios');
const crypto = require('crypto');

// Endereço-base oficial e chave pública atual do CNJ — usados só como PADRÃO
// (o valor efetivo é sempre o que estiver salvo na configuração do escritório).
const URL_PADRAO_DATAJUD    = 'https://api-publica.datajud.cnj.jus.br';
const APIKEY_PADRAO_DATAJUD = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

// Justiça Estadual (J=8): código do TR (2 dígitos) -> sufixo do alias do DataJud.
// Conferido contra a lista oficial de índices (atenção: DF = 'dft').
const UF_ESTADUAL = {
  '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce',
  '07': 'dft', '08': 'es', '09': 'go', '10': 'ma', '11': 'mt', '12': 'ms',
  '13': 'mg', '14': 'pa', '15': 'pb', '16': 'pr', '17': 'pe', '18': 'pi',
  '19': 'rj', '20': 'rn', '21': 'rs', '22': 'ro', '23': 'rr', '24': 'sc',
  '25': 'se', '26': 'sp', '27': 'to',
};

// A partir do número CNJ (com ou sem máscara) descobre o alias do índice do
// DataJud. Formato NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos). Retorna null quando
// o segmento não é suportado nesta versão (eleitoral/militar/superiores).
function aliasDoTribunal(numProc) {
  const dig = String(numProc || '').replace(/\D/g, '');
  if (dig.length !== 20) return null;
  const J  = dig.slice(13, 14);   // segmento do Judiciário
  const TR = dig.slice(14, 16);   // tribunal / região
  if (J === '4') { const n = parseInt(TR, 10); return (n >= 1 && n <= 6)  ? `api_publica_trf${n}` : null; }
  if (J === '5') { const n = parseInt(TR, 10); return (n >= 1 && n <= 24) ? `api_publica_trt${n}` : null; }
  if (J === '8') { const uf = UF_ESTADUAL[TR]; return uf ? `api_publica_tj${uf}` : null; }
  return null;
}

// Converte a dataHora do DataJud (ISO "2024-01-15T13:22:00.000Z" ou compacta)
// em { data: 'YYYY-MM-DD', dataHora: 'YYYY-MM-DD HH:MM:SS' }. Retorna null se inválida.
function parseDataHora(valor) {
  const dig = String(valor || '').replace(/\D/g, ''); // YYYYMMDDHHMMSS...
  if (dig.length < 8) return null;
  const Y = dig.slice(0, 4), Mo = dig.slice(4, 6), D = dig.slice(6, 8);
  const H = dig.slice(8, 10) || '00', Mi = dig.slice(10, 12) || '00', S = dig.slice(12, 14) || '00';
  const data = `${Y}-${Mo}-${D}`;
  return { data, dataHora: `${data} ${H}:${Mi}:${S}` };
}

// Monta a descrição do andamento a partir do movimento: o nome padronizado +
// os complementos tabelados (quando houver). Ex.: "Conclusão — para decisão".
function descricaoMovimento(mov) {
  const base = String(mov.nome || ('Movimento ' + (mov.codigo || ''))).trim();
  const comps = Array.isArray(mov.complementosTabelados)
    ? mov.complementosTabelados.map(c => (c && c.nome ? String(c.nome).trim() : '')).filter(Boolean)
    : [];
  return comps.length ? `${base} — ${comps.join(', ')}` : base;
}

// "Impressão digital" única de um movimento (para dedup). Inclui o id do processo,
// então nunca colide entre processos diferentes. Usa o nome CRU (não a descrição
// enriquecida), para o dedup não mudar caso um complemento passe a existir depois.
function hashMovimento(processoId, mov) {
  const base = `${processoId}|${mov.codigo || ''}|${mov.dataHora || ''}|${mov.nome || ''}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}

// Busca os movimentos de UM processo no DataJud. Retorna sempre um objeto
// { suportado, movimentos }. Lança erro com mensagem amigável só em falha de
// comunicação/credencial (para a tela poder avisar sem quebrar).
async function buscarMovimentos({ url, apikey, numProc }) {
  const alias = aliasDoTribunal(numProc);
  if (!alias) return { suportado: false, movimentos: [] };

  const dig      = String(numProc).replace(/\D/g, '');
  const base     = (url || URL_PADRAO_DATAJUD).replace(/\/+$/, '');
  const chave    = apikey || APIKEY_PADRAO_DATAJUD;
  const endpoint = `${base}/${alias}/_search`;

  let resp;
  try {
    resp = await axios.post(
      endpoint,
      { query: { match: { numeroProcesso: dig } }, size: 1 },
      {
        headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
  } catch (e) {
    const detalhe = e.response ? `HTTP ${e.response.status}` : (e.code || e.message);
    throw new Error('Falha ao consultar o DataJud (' + detalhe + ')');
  }

  const hits  = resp.data && resp.data.hits && resp.data.hits.hits;
  const fonte = Array.isArray(hits) && hits[0] && hits[0]._source ? hits[0]._source : null;
  const movimentos = fonte && Array.isArray(fonte.movimentos) ? fonte.movimentos : [];
  return { suportado: true, movimentos };
}

module.exports = {
  buscarMovimentos,
  aliasDoTribunal,
  parseDataHora,
  descricaoMovimento,
  hashMovimento,
  URL_PADRAO_DATAJUD,
  APIKEY_PADRAO_DATAJUD,
};
