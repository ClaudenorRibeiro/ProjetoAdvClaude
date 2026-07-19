// ============================================================
// MIDDLEWARE DE AUDITORIA
// Registra automaticamente ações importantes no banco
// ============================================================

const { pool } = require('../config/database');

// ------------------------------------------------------------
// Descrição legível do registro (coluna "Registro" do histórico)
// Mapa tabela -> coluna "amigável". TODAS as colunas foram conferidas
// contra a estrutura real do banco (estrutura_banco.sql). O PK é `id`
// em todas elas.
// ------------------------------------------------------------
const DESCRICAO_MAPA = {
  tblproc:              { coluna: 'numProc',      prefixo: 'Processo ' },
  tblpasta:             { coluna: 'numPasta',     prefixo: 'Pasta ' },
  tarefas:              { coluna: 'titulo',       prefixo: 'Tarefa: ' },
  prazos_processo:      { coluna: 'descricao',    prefixo: 'Prazo: ' },
  pessoas_fisicas:      { coluna: 'nome',         prefixo: '' },
  pessoas_juridicas:    { coluna: 'razao_social', prefixo: '' },
  pericia:              { coluna: 'data',         prefixo: 'Perícia ',   data: true },
  audiencia:            { coluna: 'data',         prefixo: 'Audiência ', data: true },
  conta_corrente:       { coluna: 'descricao',    prefixo: 'Lançamento: ' },
  acordo:               { coluna: 'descricao',    prefixo: 'Acordo: ' },
  acordo_parcela:       { coluna: 'numero',       prefixo: 'Parcela nº ' },
  andamento_processual: { coluna: 'descricao',    prefixo: 'Andamento: ' },
  tblforum:             { coluna: 'nome',         prefixo: 'Fórum: ' },
  tblvara:              { coluna: 'nome',         prefixo: 'Vara: ' },
  usuarios:             { coluna: 'nome',         prefixo: 'Usuário: ' },
};

// Descrições fixas (não dependem de um registro específico)
const DESCRICAO_FIXA = {
  configuracoes_escritorio: 'Escritório',
  sistema:                  'Limpeza de dados de teste',
};

// Monta um texto legível ("Processo 123", "João da Silva"...) para gravar junto
// do log. NUNCA lança: qualquer falha vira null e o histórico apenas cai no "#id"
// de sempre — a operação principal segue intacta. Usa o mesmo executor (a conexão
// da transação, quando houver) para enxergar linhas recém-criadas na própria
// transação; é uma leitura simples por PK, que não trava a transação.
async function montarDescricao(executor, tabela, registroId, dadosAntigos) {
  try {
    if (DESCRICAO_FIXA[tabela]) return DESCRICAO_FIXA[tabela];
    const map = DESCRICAO_MAPA[tabela];
    if (!map || registroId == null) return null;

    // 1) Lê o valor na própria tabela do módulo (sem filtrar por 'ativo', para
    //    resolver também exclusões lógicas). Nome de tabela/coluna vêm de uma
    //    whitelist fixa (não do request) — sem risco de injeção.
    const colExpr = map.data
      ? `DATE_FORMAT(\`${map.coluna}\`, '%d/%m/%Y')`
      : `\`${map.coluna}\``;
    const [rows] = await executor.execute(
      `SELECT ${colExpr} AS val FROM \`${tabela}\` WHERE id = ? LIMIT 1`,
      [registroId]
    );
    let valor = rows.length ? rows[0].val : null;

    // 2) Se o registro já não existe (exclusão física) mas o chamador guardou os
    //    dados antigos, usa o valor de lá.
    if ((valor == null || valor === '') && dadosAntigos && dadosAntigos[map.coluna] != null) {
      valor = dadosAntigos[map.coluna];
    }

    if (valor == null || valor === '') return null;
    const texto = `${map.prefixo}${valor}`;
    return texto.length > 255 ? texto.slice(0, 255) : texto;
  } catch (_) {
    // Auditoria descritiva é "best effort" — nunca derruba a operação principal.
    return null;
  }
}

// Registra uma ação no log de auditoria
// tabela: tabela afetada (ex: 'processos', 'prazos')
// acao:   o que foi feito ('criar', 'editar', 'excluir')
// registroId: ID do registro afetado
// dadosAntigos: dados antes da alteração (para edições)
// dadosNovos: dados após a alteração
// conn: conexão de transação OPCIONAL — quando informada, o INSERT participa
//       da transação do chamador e uma falha provoca rollback (tudo ou nada);
//       sem ela, mantém o comportamento tolerante (auditoria não derruba a operação)
async function registrar(usuarioId, tabela, acao, registroId, dadosAntigos = null, dadosNovos = null, conn = null) {
  const executor = conn || pool;
  // Texto legível do registro (nunca lança — em caso de falha, vem null e o
  // histórico mostra "#id"). Fica FORA do try/catch do INSERT de propósito.
  const descricao = await montarDescricao(executor, tabela, registroId, dadosAntigos);
  try {
    await executor.execute(
      `INSERT INTO logs_auditoria
        (usuario_id, tabela, acao, registro_id, descricao, dados_antigos, dados_novos, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        usuarioId,
        tabela,
        acao,
        registroId,
        descricao,
        dadosAntigos ? JSON.stringify(dadosAntigos) : null,
        dadosNovos   ? JSON.stringify(dadosNovos)   : null,
      ]
    );
  } catch (err) {
    // Dentro de transação: repropaga para o chamador fazer rollback
    if (conn) throw err;
    // Standalone: não lança — falha na auditoria não derruba a operação principal
    console.error('Erro ao registrar auditoria:', err.message);
  }
}

module.exports = { registrar };
