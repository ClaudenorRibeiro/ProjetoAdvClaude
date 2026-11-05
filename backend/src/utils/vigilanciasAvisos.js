// AVISO DE POSSÍVEL RECURSO (pedido do usuário, 05/11/2026; porte do NovoJud-saas). Quando chega uma publicação nova
// (AASP/CNJ), ou um andamento novo do DataJud, num processo com vigilância AGUARDANDO e o texto parece falar de recurso,
// os usuários da vigilância recebem um aviso no sino. É só um alerta para o advogado conferir: nunca cria prazo nem muda
// a vigilância. Melhor esforço: qualquer falha aqui NUNCA derruba quem importou a publicação ou sincronizou o DataJud.
const { pool } = require('../config/database');
const { criarNotificacao } = require('../services/notificacaoService');
const { pareceRecurso } = require('./vigilanciasPalavras');

const soDigitos = (t) => String(t || '').replace(/\D/g, '');

// Todas as vigilâncias aguardando (poucas no sistema), com o processo e os usuários ativos a avisar.
async function vigilanciasEmEspera() {
  const [linhas] = await pool.execute(
    `SELECT v.id, pr.id AS processo_id, pr.numProc, t.nome AS tipo_nome
       FROM vigilancia v
       JOIN tblproc pr ON pr.id = v.processo_id
       JOIN vigilancia_tipo t ON t.id = v.tipo_id
      WHERE v.situacao = 'aguardando'`
  );
  if (!linhas.length) return [];
  const [avisados] = await pool.query(
    `SELECT vu.vigilancia_id, u.id
       FROM vigilancia_usuario vu JOIN usuarios u ON u.id = vu.usuario_id
      WHERE u.ativo = 1 AND vu.vigilancia_id IN (?)`,
    [linhas.map((l) => l.id)]
  );
  return linhas.map((l) => ({
    processoId: l.processo_id,
    numero: l.numProc,
    tipo: l.tipo_nome,
    usuarios: avisados.filter((a) => a.vigilancia_id === l.id).map((a) => a.id),
  }));
}

async function avisar(v, de) {
  const processo = v.numero || 'sem número';
  const mensagem = `Possível recurso da parte contrária no processo ${processo} (vigilância: ${v.tipo}). Confira ${de}.`;
  for (const usuarioId of v.usuarios) await criarNotificacao(usuarioId, null, mensagem);
}

// Publicações recém-importadas: lista de { numero_processo, texto }.
async function avisarPublicacoes(itens) {
  try {
    const candidatos = (itens || []).filter((i) => pareceRecurso(i.texto) && soDigitos(i.numero_processo) !== '');
    if (!candidatos.length) return;
    const vigilancias = await vigilanciasEmEspera();
    for (const v of vigilancias) {
      if (soDigitos(v.numero) === '') continue;
      const achou = candidatos.some((i) => soDigitos(i.numero_processo) === soDigitos(v.numero));
      if (achou) await avisar(v, 'a publicação');
    }
  } catch (err) {
    console.error('Erro ao avisar vigilâncias (publicações):', err.message);
  }
}

// Andamentos novos do DataJud de UM processo (as descrições).
async function avisarAndamentos(processoId, descricoes) {
  try {
    if (!Array.isArray(descricoes) || !descricoes.some(pareceRecurso)) return;
    const vigilancias = await vigilanciasEmEspera();
    for (const v of vigilancias) if (v.processoId === Number(processoId)) await avisar(v, 'o andamento');
  } catch (err) {
    console.error('Erro ao avisar vigilâncias (andamentos):', err.message);
  }
}

module.exports = { avisarPublicacoes, avisarAndamentos };
