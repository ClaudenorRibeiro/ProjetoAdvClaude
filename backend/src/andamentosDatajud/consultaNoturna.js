// ============================================================
// A CONSULTA NOTURNA DO DATAJUD. Pede ao CNJ os processos ativos em lotes pequenos, um lote por vez, e grava o que
// mudou (os andamentos novos ficam marcados como novidade para o resumo da manhã). Só consulta se o DataJud está ligado
// E há pelo menos uma pessoa para receber o aviso (senão seria gastar o CNJ à toa). Um tribunal que recusa o pedido
// 3 vezes fica de lado até a noite seguinte; os outros seguem.
// ============================================================
const { pool } = require('../config/database');
const { hojeBrasilia } = require('../utils/helpers');
const { buscarLote, LoteRecusado, TAMANHO_DO_LOTE, esperarDeVerdade } = require('./lote');
const { aplicarRespostaDoProcesso, marcarNaoEncontrado } = require('./aplicar');
const { processosParaConsultar } = require('./selecionar');

const PAUSA_PADRAO_MS = 2000;

// Pede o lote; se a resposta vier grande demais, divide ao meio (até um processo só) e junta as respostas.
async function pedirDividindoSePreciso(base, numeros, esperar) {
  try {
    return await buscarLote({ ...base, numeros }, esperar);
  } catch (erro) {
    if (!(erro instanceof LoteRecusado) || !erro.grande || numeros.length < 2) throw erro;
    const meio = Math.ceil(numeros.length / 2);
    const primeira = await pedirDividindoSePreciso(base, numeros.slice(0, meio), esperar);
    const segunda = await pedirDividindoSePreciso(base, numeros.slice(meio), esperar);
    return new Map([...primeira, ...segunda]);
  }
}

async function lerIntegracao() {
  const [rows] = await pool.execute("SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'datajud'");
  if (!rows.length || !rows[0].ativo) return null;
  const c = rows[0].configuracoes;
  const cfg = c ? (typeof c === 'string' ? JSON.parse(c) : c) : {};
  return {
    url: typeof cfg.url === 'string' ? cfg.url.trim() : '',
    apikey: typeof cfg.apikey === 'string' ? cfg.apikey.trim() : '',
  };
}

// Devolve null (nada a fazer) ou { processos, novos, naoEncontrados, falhas }.
async function consultarDataJud({ esperar = esperarDeVerdade, tamanhoDoLote = TAMANHO_DO_LOTE, pausaEntreLotesMs = PAUSA_PADRAO_MS } = {}) {
  const integracao = await lerIntegracao();
  if (!integracao) return null;
  const [quem] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios WHERE ativo = 1 AND datajud_aviso_canal <> 'nenhum'");
  if (Number(quem[0].total) === 0) return null;

  const hoje = hojeBrasilia();
  const resultado = { processos: 0, novos: 0, naoEncontrados: 0, falhas: [] };
  for (const { alias, numeros } of await processosParaConsultar()) {
    const todos = [...numeros];
    for (let i = 0; i < todos.length; i += tamanhoDoLote) {
      const fatia = todos.slice(i, i + tamanhoDoLote);
      let achados;
      try {
        achados = await pedirDividindoSePreciso({ ...integracao, alias }, fatia.map(([n]) => n), esperar);
      } catch (erro) {
        resultado.falhas.push(erro instanceof LoteRecusado ? erro.message : String(erro && erro.message));
        break; // este tribunal fica para a próxima noite
      }
      for (const [numero, ids] of fatia) {
        const resposta = achados.get(numero);
        for (const id of ids) {
          resultado.processos += 1;
          try {
            if (resposta === undefined) {
              await marcarNaoEncontrado(id);
              resultado.naoEncontrados += 1;
            } else {
              resultado.novos += (await aplicarRespostaDoProcesso(id, resposta, hoje)).novidades;
            }
          } catch (erro) {
            resultado.falhas.push(`processo ${id}: ${erro && erro.message}`);
          }
        }
      }
      await esperar(pausaEntreLotesMs);
    }
  }
  return resultado;
}

module.exports = { consultarDataJud, pedirDividindoSePreciso };
