// ============================================================
// SERVIÇO DE INTEGRAÇÃO COM O CNJ / DJEN (ComunicaAPI — PJe)
// ------------------------------------------------------------
// Consulta as comunicações (intimações, editais...) do Diário de Justiça
// Eletrônico Nacional pela OAB do advogado, num período de datas.
// Contrato real (verificado contra o servidor de produção):
//   GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
//   params: numeroOab, ufOab,
//           dataDisponibilizacaoInicio (YYYY-MM-DD), dataDisponibilizacaoFim (YYYY-MM-DD),
//           pagina, itensPorPagina
//   resposta: { status, message, count, items: [ {
//       id, data_disponibilizacao, siglaTribunal, tipoComunicacao, nomeOrgao,
//       numero_processo, numeroprocessocommascara, texto, hash, numeroComunicacao,
//       destinatarios: [...], destinatarioadvogados: [ { advogado: { numero_oab, uf_oab } } ]
//   } ] }
//
// A consulta é PÚBLICA (não exige chave nem login). A lista de OABs a consultar
// e a URL ficam em configuracoes_integracoes (modulo='cnj'), NUNCA no código.
// ============================================================

const axios = require('axios');

// Endereço oficial da ComunicaAPI. Fica também na configuração (pode ser sobrescrito),
// mas guardamos o padrão aqui para o caso de a config vir sem URL.
const URL_PADRAO_CNJ = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

const ITENS_POR_PAGINA = 100;   // por página na API do CNJ
const MAX_PAGINAS      = 50;    // trava de segurança: até 5.000 comunicações por OAB/período

// Busca as comunicações de UMA OAB num período. Percorre as páginas até acabar.
// Retorna sempre um array (vazio se não houver). Lança erro com mensagem amigável
// em caso de falha de comunicação com o CNJ.
async function buscarComunicacoes({ url, numeroOab, ufOab, dataInicio, dataFim }) {
  const base = url || URL_PADRAO_CNJ;
  if (!numeroOab || !ufOab)     throw new Error('OAB (número e UF) é obrigatória');
  if (!dataInicio || !dataFim)  throw new Error('Informe o período (início e fim)');

  const todos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    let resp;
    try {
      resp = await axios.get(base, {
        params: {
          numeroOab,
          ufOab,
          dataDisponibilizacaoInicio: dataInicio,
          dataDisponibilizacaoFim: dataFim,
          pagina,
          itensPorPagina: ITENS_POR_PAGINA,
        },
        headers: { Accept: 'application/json' },
        timeout: 30000,
      });
    } catch (e) {
      // Erro de rede/HTTP do CNJ — repassa uma mensagem clara.
      const detalhe = e.response ? `HTTP ${e.response.status}` : (e.code || e.message);
      throw new Error('Falha ao consultar o CNJ (' + detalhe + ')');
    }

    const dados = resp.data || {};
    const itens = Array.isArray(dados.items) ? dados.items : [];
    todos.push(...itens);

    // Última página: veio menos que o tamanho cheio (ou nada).
    if (itens.length < ITENS_POR_PAGINA) break;
  }
  return todos;
}

module.exports = { buscarComunicacoes, URL_PADRAO_CNJ };
