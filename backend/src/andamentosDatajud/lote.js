// ============================================================
// DATAJUD EM LOTE (a consulta noturna)
// ------------------------------------------------------------
// Pede ao CNJ VÁRIOS processos de um tribunal num pedido só. Medido com o CNJ de verdade em 22/10/2026 (teste do
// usuário): um processo por pedido leva ~15 s (inviável); 100 de uma vez levam ~6 s; pedidos em paralelo recebem 429
// (o servidor deles rejeita por falta de capacidade, não por um limite por minuto). Por isso: lotes pequenos, UM por
// vez, e espera antes de tentar de novo.
// ============================================================
const axios = require('axios');
const { URL_PADRAO_DATAJUD, APIKEY_PADRAO_DATAJUD, atualizacaoDoAchado } = require('../services/datajudService');

const TAMANHO_DO_LOTE = 50;
const TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 60000;
const TEMPO_DO_PEDIDO_MS = 90000;
const TAMANHO_MAXIMO_DA_RESPOSTA = 5 * 1024 * 1024;

const esperarDeVerdade = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// O CNJ (ou a rede) recusou o lote. `grande` = a resposta passou do limite de tamanho: dá para tentar com menos processos.
class LoteRecusado extends Error {
  constructor(mensagem, grande = false) {
    super(mensagem);
    this.name = 'LoteRecusado';
    this.grande = grande;
  }
}

// O que o CNJ tem de cada número pedido (só dígitos): Map(numero -> { movimentos, atualizado }). Número que não veio
// não está no resultado. O mesmo número pode aparecer em mais de um grau: os movimentos são juntados.
function lerAchados(corpo) {
  const achados = corpo && corpo.hits && Array.isArray(corpo.hits.hits) ? corpo.hits.hits : [];
  const mapa = new Map();
  for (const a of achados) {
    const fonte = a && a._source;
    const numero = fonte && typeof fonte.numeroProcesso === 'string' ? fonte.numeroProcesso.replace(/\D/g, '') : '';
    if (!numero) continue;
    const atual = mapa.get(numero) || { movimentos: [], atualizado: null };
    if (Array.isArray(fonte.movimentos)) atual.movimentos.push(...fonte.movimentos);
    const atualizado = atualizacaoDoAchado(a);
    if (atualizado !== null && (atual.atualizado === null || atualizado > atual.atualizado)) atual.atualizado = atualizado;
    mapa.set(numero, atual);
  }
  return mapa;
}

async function buscarLote({ url, apikey, alias, numeros }, esperar = esperarDeVerdade) {
  const endpoint = `${(url || URL_PADRAO_DATAJUD).replace(/\/+$/, '')}/${alias}/_search`;
  const corpo = { query: { terms: { numeroProcesso: [...numeros] } }, size: Math.min(numeros.length * 3, 1000) };
  const cabecalhos = { Authorization: `APIKey ${apikey || APIKEY_PADRAO_DATAJUD}`, 'Content-Type': 'application/json' };
  let motivo = 'sem resposta';
  let grande = false;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await axios.post(endpoint, corpo, {
        headers: cabecalhos,
        timeout: TEMPO_DO_PEDIDO_MS,
        maxContentLength: TAMANHO_MAXIMO_DA_RESPOSTA,
        maxBodyLength: TAMANHO_MAXIMO_DA_RESPOSTA,
        validateStatus: () => true,
      });
      if (resposta.status >= 200 && resposta.status < 300) return lerAchados(resposta.data);
      motivo = `HTTP ${resposta.status}`;
      // 4xx que não é "calma" (chave recusada, pedido inválido) não melhora com nova tentativa
      if (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429) break;
    } catch (erro) {
      grande = /maxContentLength/i.test(String(erro && erro.message));
      motivo = grande ? 'resposta grande demais' : 'sem resposta';
      if (grande) break; // repetir o mesmo pedido não adianta: quem chamou divide o lote
    }
    if (tentativa < TENTATIVAS) await esperar(ESPERA_ENTRE_TENTATIVAS_MS);
  }
  throw new LoteRecusado(`O DataJud recusou o pedido do tribunal ${alias} (${motivo})`, grande);
}

module.exports = { buscarLote, LoteRecusado, TAMANHO_DO_LOTE, esperarDeVerdade, lerAchados };
