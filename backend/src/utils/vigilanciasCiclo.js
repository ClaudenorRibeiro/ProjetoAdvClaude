// O CICLO DE VIDA da VIGILÂNCIA DO PROCESSO (pedido do usuário, 05/11/2026; porte do NovoJud-saas; generalizada para
// Tarefas em 06/11/2026): um lembrete SEM DATA que fica de olho num processo (ex.: "Recurso adesivo" — o escritório
// não quer recorrer da sentença, mas precisa ser avisado se a OUTRA parte recorrer). Situação: aguardando (vigiando;
// BLOQUEIA arquivar e excluir o processo) ou encerrada (acabou; fica só como histórico, sai junto com o processo se
// ele for excluído).
// Ao cadastrar um PRAZO ou uma TAREFA no processo, o usuário é PERGUNTADO se este registro é por causa da vigilância
// (ver `resolverVigilanciasDoRegistro`, chamada pelo cadastro "normal" dos dois — a ata NÃO pergunta). As funções
// deste arquivo rodam DENTRO da transação de quem chama.
const auditoria = require('../middleware/auditoria');

// Encerra a vigilância (o usuário tirou, ou ela foi encerrada pelo cadastro de um prazo/tarefa). Devolve false se já
// estava encerrada (nada é alterado); true se encerrou agora.
async function encerrarVigilancia(conn, { vigilanciaId, usuarioId, motivo, prazoId, tarefaId }) {
  const [rows] = await conn.execute(
    'SELECT id, situacao FROM vigilancia WHERE id = ? FOR UPDATE', [vigilanciaId]
  );
  if (!rows.length) return { naoEncontrada: true };
  if (rows[0].situacao === 'encerrada') return { jaEncerrada: true };
  await conn.execute(
    `UPDATE vigilancia SET situacao = 'encerrada', encerrada_por = ?, encerrada_em = NOW(), motivo_encerramento = ?
      WHERE id = ?`,
    [usuarioId, motivo || null, vigilanciaId]
  );
  await auditoria.registrar(
    usuarioId, 'vigilancia', 'encerrar', vigilanciaId, null,
    { motivo: motivo || null, ...(prazoId ? { prazo_id: prazoId } : {}), ...(tarefaId ? { tarefa_id: tarefaId } : {}) }, conn
  );
  return { encerrou: true };
}

// Antes de gravar um prazo ou tarefa novo no processo: se há vigilância aguardando, o usuário precisa dizer se este
// registro a encerra. Sem a resposta (`resposta === undefined`) devolve { aviso } (409, "PERGUNTAR_VIGILANCIAS", com a
// lista); com a resposta (lista de ids, pode ser vazia = "não encerrar nenhuma") devolve { encerrar: [ids] }.
// `assunto`: 'prazo' ou 'tarefa' — só muda o texto da pergunta mostrada ao usuário.
async function resolverVigilanciasDoRegistro(conn, processoId, resposta, assunto = 'prazo') {
  const [vivas] = await conn.execute(
    `SELECT v.id, t.nome AS tipo_nome
       FROM vigilancia v JOIN vigilancia_tipo t ON t.id = v.tipo_id
      WHERE v.processo_id = ? AND v.situacao = 'aguardando'
      ORDER BY v.id FOR UPDATE`,
    [processoId]
  );
  if (!vivas.length) return { encerrar: [] };
  if (resposta === undefined) {
    const esta = assunto === 'tarefa' ? 'Esta tarefa' : 'Este prazo';
    return {
      aviso: {
        status: 409,
        mensagem: vivas.length === 1
          ? `Este processo está com a vigilância "${vivas[0].tipo_nome}". ${esta} é por causa dela? Se sim, a vigilância será encerrada.`
          : `Este processo está com vigilâncias. ${esta} é por causa de alguma delas? Se sim, ela será encerrada.`,
        detalhes: {
          codigo: 'PERGUNTAR_VIGILANCIAS',
          vigilancias: vivas.map((v) => ({ id: v.id, tipo_nome: v.tipo_nome })),
        },
      },
    };
  }
  if (!Array.isArray(resposta)) {
    return { aviso: { status: 400, mensagem: 'Vigilâncias a encerrar: lista inválida.' } };
  }
  const escolhidas = [...new Set(resposta.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  if (escolhidas.length !== resposta.length) {
    return { aviso: { status: 400, mensagem: 'Vigilância inválida.' } };
  }
  for (const id of escolhidas) {
    if (!vivas.some((v) => v.id === id)) {
      return { aviso: { status: 409, mensagem: 'Uma das vigilâncias escolhidas não está mais aguardando neste processo.' } };
    }
  }
  return { encerrar: escolhidas };
}

module.exports = { encerrarVigilancia, resolverVigilanciasDoRegistro };
