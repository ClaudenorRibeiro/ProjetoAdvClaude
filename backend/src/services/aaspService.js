// ============================================================
// SERVIÇO DE INTEGRAÇÃO COM A AASP (API de Intimações)
// ------------------------------------------------------------
// Consulta as intimações/publicações de um dia na API oficial da AASP.
// Contrato real (Swagger AASP):
//   GET <url>/api/Associado/intimacao/json
//   params: chave (fornecida pela AASP), data (dd/mm/aaaa), diferencial (boolean)
//   resposta: { intimacoes: [ { textoPublicacao, numeroUnicoProcesso, titulo,
//                               cabecalho, numeroPublicacao, numeroArquivo,
//                               jornal: { dataDisponibilizacao_Publicacao, ... } } ] }
//
// Usamos diferencial=false (traz SEMPRE o dia inteiro). A deduplicação é feita
// no nosso lado, comparando o texto da publicação. NÃO usamos diferencial=true
// porque ele "esconde" o que já foi consultado e perderíamos publicações numa
// segunda busca do mesmo dia.
//
// A "chave" E a "URL" da AASP são configuração do escritório — ficam em
// configuracoes_integracoes (Configurações → Integrações), NUNCA no código nem no .env.
// ============================================================

const axios = require('axios');

// Converte 'YYYY-MM-DD' (data do seletor) para 'dd/mm/aaaa' (formato exigido pela AASP).
function dataParaAASP(dataISO) {
  const [a, m, d] = String(dataISO).slice(0, 10).split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : '';
}

// Busca as intimações de um dia. Retorna sempre um array (vazio se não houver).
// A URL e a chave vêm da configuração (Configurações → Integrações), não do código.
// Lança erro com mensagem amigável em caso de falha de comunicação/credencial.
async function buscarIntimacoes(chave, dataISO, url) {
  const dataBR = dataParaAASP(dataISO);
  if (!url)   throw new Error('URL da AASP não configurada');
  if (!chave) throw new Error('Chave da AASP não informada');
  if (!dataBR) throw new Error('Data inválida');

  let resp;
  try {
    resp = await axios.get(url, {
      params: { chave, data: dataBR, diferencial: 'false' },
      headers: { Accept: 'application/json' },
      timeout: 30000,
    });
  } catch (e) {
    // Erro de rede/HTTP da AASP — repassa uma mensagem clara.
    const detalhe = e.response ? `HTTP ${e.response.status}` : (e.code || e.message);
    throw new Error('Falha ao consultar a AASP (' + detalhe + ')');
  }

  const dados = resp.data || {};
  return Array.isArray(dados.intimacoes) ? dados.intimacoes : [];
}

module.exports = { buscarIntimacoes, dataParaAASP };
