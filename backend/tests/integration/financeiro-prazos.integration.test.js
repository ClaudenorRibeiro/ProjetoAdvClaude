const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app;
let admin;
let usuario;
let semPermissao;
let contaEscritorioId;

function token(id, nivel, sessao) {
  return jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function requisicao(comToken = admin) {
  return { get: p => request(app).get(p).set('Authorization', `Bearer ${comToken}`),
    post: p => request(app).post(p).set('Authorization', `Bearer ${comToken}`),
    put: p => request(app).put(p).set('Authorization', `Bearer ${comToken}`),
    delete: p => request(app).delete(p).set('Authorization', `Bearer ${comToken}`) };
}

async function consultar(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}

async function criarAcordo() {
  const resposta = await requisicao().post('/api/financeiro/processo/1/acordo').send({
    descricao: 'Acordo automatizado', valor_total: 100, qtd_parcelas: 1, data_primeira: '2026-01-05',
    parcelas: [{ numero: 1, vencimento: '2026-01-05', valor_bruto: 100, honor_tipo: 'percent', honor_percentual: 30 }],
  });
  assert.equal(resposta.status, 201);
  return resposta.body.dados.id;
}

async function criarPrazo({ delegado_para = null, notificar_conclusao = false, descricao = 'Prazo automatizado' } = {}) {
  const resposta = await requisicao().post('/api/prazos').send({
    processo_id: 1, subtipo_id: 1, descricao, data_inicio: '2026-01-05', data_final: '2026-01-07',
    tipo_dias: 'uteis', delegado_para, notificar_conclusao,
  });
  assert.equal(resposta.status, 201);
  return resposta.body.dados.id;
}

test.before(async () => {
  await recriarBancoTeste();
  const banco = await consultar("INSERT INTO instituicao_financeira (nome, ativo) VALUES ('Banco de Teste', 1)");
  const conta = await consultar('INSERT INTO conta_financeira (instituicao_financeira_id, nome, tipo, ativo, principal) VALUES (?, ?, ?, 1, 1)', [banco.insertId, 'Conta de teste', 'bancaria']);
  contaEscritorioId = conta.insertId;
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  usuario = token(2, 2, 'sessao-usuario');
  semPermissao = token(3, 2, 'sessao-sem-permissao');
});

test.after(async () => pool.end());

test('financeiro: lançamento manual preserva saldo, histórico e exclusão', async () => {
  const criado = await requisicao().post('/api/financeiro/processo/1/lancamento')
    .send({ data: '2026-01-05', descricao: 'Adiantamento', tipo: 'entrada', valor: 150 });
  assert.equal(criado.status, 201);
  const id = criado.body.dados.id;

  const editado = await requisicao().put(`/api/financeiro/lancamento/${id}`)
    .send({ data: '2026-01-06', descricao: 'Adiantamento corrigido', tipo: 'saida', valor: 25 });
  assert.equal(editado.status, 200);
  const conta = await requisicao().get('/api/financeiro/processo/1');
  assert.equal(conta.status, 200);
  assert.equal(Number(conta.body.dados.saldo_total), -25);
  const historico = await requisicao().get(`/api/financeiro/lancamento/${id}/historico`);
  assert.equal(historico.status, 200);
  assert.ok(historico.body.dados.some(h => h.acao === 'criado'));
  assert.ok(historico.body.dados.some(h => h.acao === 'editado'));
  assert.equal((await requisicao().delete(`/api/financeiro/lancamento/${id}`)).status, 200);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM conta_corrente WHERE id = ?', [id]))[0].n, 0);
});

test('financeiro: acordo valida totais, recalcula valores e baixa é atômica', async () => {
  const invalido = await requisicao().post('/api/financeiro/processo/1/acordo').send({
    valor_total: 100, parcelas: [{ vencimento: '2026-01-05', valor_bruto: 90, honor_tipo: 'sem' }],
  });
  assert.equal(invalido.status, 422);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM acordo'))[0].n, 0);

  const acordoId = await criarAcordo();
  const [parcela] = await consultar('SELECT * FROM acordo_parcela WHERE acordo_id = ?', [acordoId]);
  assert.deepEqual({ bruto: Number(parcela.valor_bruto), honor: Number(parcela.honor_valor), liquido: Number(parcela.valor_liquido) },
    { bruto: 100, honor: 30, liquido: 70 });

  const [primeira, segunda] = await Promise.all([
    requisicao().put(`/api/financeiro/parcela/${parcela.id}/pagar`).send({ recebido_em: '2026-01-06', recebimento_forma_id: 1, recebimento_identificacao: 'PIX-TESTE', recebimento_conta_financeira_id: contaEscritorioId }),
    requisicao().put(`/api/financeiro/parcela/${parcela.id}/pagar`).send({ recebido_em: '2026-01-06', recebimento_forma_id: 1, recebimento_conta_financeira_id: contaEscritorioId }),
  ]);
  assert.deepEqual([primeira.status, segunda.status].sort(), [200, 400]);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ?', [parcela.id]))[0].n, 1);
  assert.equal(Number((await consultar('SELECT valor FROM conta_corrente WHERE parcela_id = ?', [parcela.id]))[0].valor), 30);
  assert.equal((await requisicao().put(`/api/financeiro/lancamento/${(await consultar('SELECT id FROM conta_corrente WHERE parcela_id = ?', [parcela.id]))[0].id}`)
    .send({ data: '2026-01-06', descricao: 'Tentativa', tipo: 'entrada', valor: 1 })).status, 400);

  // Sem pessoa/conta de destino o servidor recusa: nunca registra repasse sem rastreabilidade.
  assert.equal((await requisicao().put(`/api/financeiro/parcela/${parcela.id}/repasse`).send({ tipo: 'cliente', data: '2026-01-06', forma_id: 1, conta_financeira_id: contaEscritorioId })).status, 422);
  assert.equal((await requisicao().put(`/api/financeiro/parcela/${parcela.id}/desfazer`).send({})).status, 200);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ?', [parcela.id]))[0].n, 0);
  assert.equal((await consultar('SELECT status FROM acordo_parcela WHERE id = ?', [parcela.id]))[0].status, 'pendente');
});

test('prazos: cálculo de calendário e ciclo de status respeitam escopo e auditoria', async () => {
  const uteis = await requisicao().get('/api/prazos/calcular?data_inicio=2026-01-05&quantidade=3&tipo_dias=uteis');
  assert.equal(uteis.status, 200);
  assert.equal(String(uteis.body.dados.data_final).slice(0, 10), '2026-01-07');
  const corridos = await requisicao().get('/api/prazos/calcular-dias?data_inicio=2026-01-05&data_final=2026-01-07&tipo_dias=corridos');
  assert.equal(corridos.status, 200);
  assert.equal(Number(corridos.body.dados.quantidade), 3);

  const prazoId = await criarPrazo({ delegado_para: 2, notificar_conclusao: true });
  assert.equal((await requisicao(semPermissao).put(`/api/prazos/${prazoId}/status`).send({ status: 'concluido' })).status, 403);
  assert.equal((await requisicao(usuario).put(`/api/prazos/${prazoId}/fazendo`).send({})).status, 200);
  assert.equal((await requisicao(usuario).put(`/api/prazos/${prazoId}/status`).send({ status: 'concluido', observacao: 'Concluído pela bateria' })).status, 200);
  const [prazo] = await consultar('SELECT status, concluido_por, fazendo_por FROM prazos_processo WHERE id = ?', [prazoId]);
  assert.deepEqual({ status: prazo.status, concluido_por: prazo.concluido_por, fazendo_por: prazo.fazendo_por }, { status: 'concluido', concluido_por: 2, fazendo_por: null });
  const historico = await requisicao().get(`/api/prazos/${prazoId}/historico`);
  assert.equal(historico.status, 200);
  assert.ok(historico.body.dados.eventos.some(e => e.tipo === 'status' && /concluído/i.test(e.descricao)));
  assert.equal((await requisicao().put(`/api/prazos/${prazoId}/status`).send({ status: 'cancelado', motivo_cancelamento: 'Não deve aceitar' })).status, 400);
});

test('prazos: exclusão trata vínculos filhos sem apagar a tarefa', async () => {
  const prazoId = await criarPrazo({ descricao: 'Prazo para exclusão' });
  const conn = await conectarBancoTeste();
  let tarefaId;
  try {
    const [tarefa] = await conn.execute("INSERT INTO tarefas (titulo, prazo_id, criado_por) VALUES ('Tarefa vinculada', ?, 1)", [prazoId]);
    tarefaId = tarefa.insertId;
    await conn.execute("INSERT INTO notificacoes (usuario_id, prazo_id, mensagem) VALUES (1, ?, 'Aviso de teste')", [prazoId]);
    await conn.execute("INSERT INTO auditoria_prazo (prazo_id, status_novo, usuario_id) VALUES (?, 'agendado', 1)", [prazoId]);
  } finally { await conn.end(); }
  assert.equal((await requisicao().delete(`/api/prazos/${prazoId}`)).status, 200);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM prazos_processo WHERE id = ?', [prazoId]))[0].n, 0);
  assert.equal((await consultar('SELECT prazo_id FROM tarefas WHERE id = ?', [tarefaId]))[0].prazo_id, null);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM notificacoes WHERE prazo_id = ?', [prazoId]))[0].n, 0);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM auditoria_prazo WHERE prazo_id = ?', [prazoId]))[0].n, 0);
});
