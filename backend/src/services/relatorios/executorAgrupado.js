// ============================================================
// RELATÓRIOS — EXECUTOR do resultado agrupado: roda as consultas e devolve as linhas prontas
// (grupos, subtotais e total geral). Nada é guardado.
// ============================================================
const { pool } = require('../../config/database');
const L = require('./limites');
const { ErroRelatorio } = require('./erros');
const { montarAgrupado } = require('./montadorAgrupado');
const { rotuloDoGrupo, valorDaMetrica, rotuloDaMetrica } = require('./agrupamento');
const { montarLinhas } = require('./linhasAgrupadas');

const rodar = async (q) => (await pool.execute(q.sql, q.params))[0];

function colunasDoResultado(assunto, receita) {
  return {
    grupos: receita.agrupar.map(g => ({ chave: g.campo, rotulo: assunto.campos[g.campo].rotulo, passo: g.passo || null })),
    metricas: receita.metricas.map((m, i) => ({ chave: `m${i + 1}`, rotulo: rotuloDaMetrica(m, assunto), funcao: m.funcao,
      tipo: m.funcao === 'contagem' ? 'numero' : (m.funcao === 'media' ? 'numero' : assunto.campos[m.campo].tipo),
      formato: m.funcao === 'contagem' ? null : (assunto.campos[m.campo].formato || null) })),
  };
}

function linhaDoBanco(assunto, receita, bruta, nGrupos) {
  const chaves = []; const rotulos = [];
  for (let i = 0; i < nGrupos; i++) {
    const g = receita.agrupar[i];
    const chave = bruta[`g${i + 1}`] ?? null;
    chaves.push(chave);
    rotulos.push(rotuloDoGrupo(assunto.campos[g.campo], g.passo, chave, bruta[`g${i + 1}_l`]));
  }
  return { chaves, rotulos, valores: receita.metricas.map((m, i) => valorDaMetrica(m, assunto, bruta[`m${i + 1}`])) };
}

async function executarAgrupado(assunto, receita, ctx) {
  const q = montarAgrupado(assunto, receita, ctx);
  const n = receita.agrupar.length;
  let totalGrupos = 0;
  let folhas = []; let subtotais = [];
  if (q.contagemGrupos) {
    totalGrupos = Number((await rodar(q.contagemGrupos))[0].total);
    if (totalGrupos > L.LIMITE_TELA) {
      throw new ErroRelatorio(`Este agrupamento gera ${totalGrupos.toLocaleString('pt-BR')} grupos e o máximo é ${L.LIMITE_TELA.toLocaleString('pt-BR')}. Escolha outro campo de agrupamento ou refine os filtros.`);
    }
    folhas = (await rodar(q.folhas)).map(b => linhaDoBanco(assunto, receita, b, n));
    if (q.subtotais) subtotais = (await rodar(q.subtotais)).map(b => linhaDoBanco(assunto, receita, b, 1));
  }
  const totalGeral = linhaDoBanco(assunto, receita, (await rodar(q.total))[0] || {}, 0);
  const linhas = montarLinhas({ assunto, agrupar: receita.agrupar, ordemGrupo: receita.ordemGrupo, folhas, subtotais, total: totalGeral });
  return { modo: 'agrupado', colunas: colunasDoResultado(assunto, receita), linhas, totalGrupos, limiteGrupos: L.LIMITE_TELA };
}

module.exports = { executarAgrupado, colunasDoResultado };
