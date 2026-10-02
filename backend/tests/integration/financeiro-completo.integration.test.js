// Financeiro — rotas e regras que os outros testes não cobriam, contra MySQL real:
// formas de pagamento, contas do escritório, beneficiários e suas contas, acordos (prévia, listar, buscar,
// editar, cancelar, excluir), recebimento, repasses (cliente/parceiro, bancário/em mãos), multa por atraso
// (ciclo completo), repasses pendentes/concluídos, consulta/exportação Excel, histórico e permissões.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const ExcelJS = require('exceljs');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin; let usuario; let semPermissao;
const F = {};   // identificadores criados em test.before

const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const msg = (r) => String(r.body.mensagem || '');

// Acordo de 1 parcela de R$ 1.000: honorário 30% (300), líquido 700; parceria opcional de 50% do honorário (150).
async function novoAcordo({ parceria = false, cliente = true, valor = 1000, parcelas = 1, tipo } = {}) {
  const por = Math.round((valor / parcelas) * 100) / 100;
  const lista = Array.from({ length: parcelas }, (_, i) => ({
    numero: i + 1, vencimento: `2026-0${i + 1}-05`, valor_bruto: por, honor_tipo: 'percent', honor_percentual: 30,
    ...(parceria ? { parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'percent', parceria_percentual: 50 } : {}),
  }));
  const corpo = { descricao: 'Acordo do teste', valor_total: por * parcelas, qtd_parcelas: parcelas, data_primeira: '2026-01-05', parcelas: lista, tipo,
    ...(cliente ? { beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.clienteId, beneficiario_cliente_conta_id: F.contaClienteId } : {}) };
  const r = await api().post('/api/financeiro/processo/1/acordo').send(corpo);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const parcs = await sql('SELECT id FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [r.body.dados.id]);
  return { acordoId: r.body.dados.id, parcelaId: parcs[0].id, parcelas: parcs.map(p => p.id) };
}
const receber = (id, extra = {}) => api().put(`/api/financeiro/parcela/${id}/pagar`)
  .send({ recebido_em: '2026-01-06', recebimento_forma_id: F.formaAmbos, recebimento_conta_financeira_id: F.contaBanco, recebimento_identificacao: 'PIX-1', ...extra });
const repasseCliente = (id, extra = {}) => api().put(`/api/financeiro/parcela/${id}/repasse`)
  .send({ tipo: 'cliente', data: '2026-01-07', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco, ...extra });

test.before(async () => {
  await recriarBancoTeste();
  const banco = await sql("INSERT INTO instituicao_financeira (nome, ativo) VALUES ('Banco de Teste', 1)");
  F.banco = banco.insertId;
  F.contaBanco = (await sql("INSERT INTO conta_financeira (instituicao_financeira_id, nome, tipo, ativo, principal) VALUES (?, 'Conta principal', 'bancaria', 1, 1)", [F.banco])).insertId;
  F.caixa = (await sql("INSERT INTO conta_financeira (nome, tipo, ativo, principal) VALUES ('Caixa físico', 'especie', 1, 0)")).insertId;
  F.formaAmbos = 1;   // semeada pelo banco de teste (uso "ambos")
  F.formaEspecie = (await sql("INSERT INTO forma_pagamento (nome, uso_permitido) VALUES ('Dinheiro', 'especie')")).insertId;
  F.formaFinanceira = (await sql("INSERT INTO forma_pagamento (nome, uso_permitido) VALUES ('Transferência bancária', 'financeira')")).insertId;
  F.clienteId = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Beneficiário', '52998224725')")).insertId;
  F.parceiroId = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro Advogado', '11144477735')")).insertId;
  F.semCpfId = (await sql("INSERT INTO pessoas_fisicas (nome) VALUES ('Pessoa Sem Documento')")).insertId;
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [F.clienteId]);
  await sql("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [F.semCpfId]);
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); semPermissao = token(3, 2, 'sessao-sem-permissao');
  // contas bancárias dos beneficiários (pela própria rota de cadastro rápido)
  const c1 = await api().post(`/api/financeiro/beneficiario/fisica/${F.clienteId}/conta`).send({ instituicao_financeira_id: F.banco, agencia: '0001', numero: '12345', digito: '6', principal: true });
  assert.equal(c1.status, 201, JSON.stringify(c1.body)); F.contaClienteId = c1.body.dados.id;
  const c2 = await api().post(`/api/financeiro/beneficiario/fisica/${F.parceiroId}/conta`).send({ instituicao_financeira_id: F.banco, chave_pix: 'parceiro@example.invalid' });
  assert.equal(c2.status, 201, JSON.stringify(c2.body)); F.contaParceiroId = c2.body.dados.id;
});
test.after(async () => pool.end());

// ------------------------------------------------------------------ formas de pagamento
test('formas de pagamento: listar, criar, atualizar, desativar; nome vazio/duplicado recusados; só administrador altera', async () => {
  const lista = await api().get('/api/financeiro/formas-pagamento');
  assert.equal(lista.status, 200);
  assert.ok(lista.body.dados.some(f => f.nome === 'Dinheiro' && f.uso_permitido === 'especie'));

  assert.equal((await api().post('/api/financeiro/formas-pagamento').send({ nome: '  ', uso_permitido: 'ambos' })).status, 400);
  assert.match(msg(await api().post('/api/financeiro/formas-pagamento').send({ nome: 'Cheque' })), /onde esta forma pode ser usada/);
  assert.match(msg(await api().post('/api/financeiro/formas-pagamento').send({ nome: 'Dinheiro', uso_permitido: 'especie' })), /Já existe/);

  const criada = await api().post('/api/financeiro/formas-pagamento').send({ nome: 'Cheque', uso_permitido: 'ambos' });
  assert.equal(criada.status, 201);
  const id = criada.body.dados.id;
  assert.equal((await api().put(`/api/financeiro/formas-pagamento/${id}`).send({ nome: 'Cheque nominal', uso_permitido: 'financeira' })).status, 200);
  assert.deepEqual(await um('SELECT nome, uso_permitido FROM forma_pagamento WHERE id = ?', [id]), { nome: 'Cheque nominal', uso_permitido: 'financeira' });
  assert.match(msg(await api().put(`/api/financeiro/formas-pagamento/${id}`).send({ nome: 'Dinheiro', uso_permitido: 'ambos' })), /Já existe/);

  assert.equal((await api(usuario).post('/api/financeiro/formas-pagamento').send({ nome: 'X', uso_permitido: 'ambos' })).status, 403);
  assert.equal((await api(usuario).put(`/api/financeiro/formas-pagamento/${id}`).send({ nome: 'X', uso_permitido: 'ambos' })).status, 403);
  assert.equal((await api(usuario).delete(`/api/financeiro/formas-pagamento/${id}`)).status, 403);

  assert.equal((await api().delete(`/api/financeiro/formas-pagamento/${id}`)).status, 200);
  assert.equal((await um('SELECT ativo FROM forma_pagamento WHERE id = ?', [id])).ativo, 0);          // desativa, não apaga
  assert.ok(!(await api().get('/api/financeiro/formas-pagamento')).body.dados.some(f => f.id === id));
});

// ------------------------------------------------------------------ contas do escritório
test('contas do escritório: listar (principal primeiro), criar banco e caixa, validações, principal única, desativar e proteger o último caixa', async () => {
  const lista = (await api().get('/api/financeiro/contas-escritorio')).body.dados;
  assert.equal(lista[0].id, F.contaBanco);                                  // a principal vem primeiro
  assert.equal(lista[0].instituicao_nome, 'Banco de Teste');

  assert.match(msg(await api().post('/api/financeiro/contas-escritorio').send({ nome: '  ', tipo: 'bancaria', instituicao_financeira_id: F.banco })), /Dê um nome/);
  assert.match(msg(await api().post('/api/financeiro/contas-escritorio').send({ nome: 'Sem banco', tipo: 'bancaria' })), /instituição financeira/);
  assert.equal((await api().post('/api/financeiro/contas-escritorio').send({ nome: 'Banco inativo', tipo: 'bancaria', instituicao_financeira_id: 99999 })).status, 422);
  assert.equal((await api().post('/api/financeiro/contas-escritorio').send({ nome: 'Dígito ruim', tipo: 'bancaria', instituicao_financeira_id: F.banco, digito: 'ABCDEFG' })).status, 422);

  const nova = await api().post('/api/financeiro/contas-escritorio').send({ nome: 'Conta reserva', tipo: 'bancaria', instituicao_financeira_id: F.banco, agencia: '9', numero: '8', digito: '7', chave_pix: 'reserva@example.invalid' });
  assert.equal(nova.status, 201);
  assert.match(msg(await api().post('/api/financeiro/contas-escritorio').send({ nome: 'Conta reserva', tipo: 'bancaria', instituicao_financeira_id: F.banco })), /Já existe uma conta/);

  // tornar a nova principal tira a marca da antiga
  assert.equal((await api().put(`/api/financeiro/contas-escritorio/${nova.body.dados.id}`).send({ nome: 'Conta reserva', tipo: 'bancaria', instituicao_financeira_id: F.banco, principal: true })).status, 200);
  assert.deepEqual((await sql('SELECT id FROM conta_financeira WHERE principal = 1 AND ativo = 1')).map(c => c.id), [nova.body.dados.id]);
  assert.equal((await api().put('/api/financeiro/contas-escritorio/99999').send({ nome: 'Fantasma', tipo: 'especie' })).status, 404);

  // permissões: só administrador mexe
  assert.equal((await api(usuario).post('/api/financeiro/contas-escritorio').send({ nome: 'X', tipo: 'especie' })).status, 403);
  assert.equal((await api(usuario).delete(`/api/financeiro/contas-escritorio/${nova.body.dados.id}`)).status, 403);

  // desativar: histórico preservado, sai da lista; o único caixa físico não pode ser desativado
  assert.equal((await api().delete(`/api/financeiro/contas-escritorio/${nova.body.dados.id}`)).status, 200);
  assert.equal((await um('SELECT ativo, principal FROM conta_financeira WHERE id = ?', [nova.body.dados.id])).ativo, 0);
  assert.equal((await api().delete(`/api/financeiro/contas-escritorio/${nova.body.dados.id}`)).status, 404);
  const bloqueio = await api().delete(`/api/financeiro/contas-escritorio/${F.caixa}`);
  assert.equal(bloqueio.status, 422); assert.match(msg(bloqueio), /caixa físico/);
  const virarBanco = await api().put(`/api/financeiro/contas-escritorio/${F.caixa}`).send({ nome: 'Caixa físico', tipo: 'bancaria', instituicao_financeira_id: F.banco });
  assert.equal(virarBanco.status, 422); assert.match(msg(virarBanco), /ao menos um caixa/);
  await sql('UPDATE conta_financeira SET principal = 1 WHERE id = ?', [F.contaBanco]);          // devolve a principal para os demais testes
  await sql('UPDATE conta_financeira SET principal = 0 WHERE id <> ?', [F.contaBanco]);
});

// ------------------------------------------------------------------ beneficiários e contas
test('beneficiários do processo e contas de cada um: listar, cadastro rápido, terceiro, duplicada reativa, validações', async () => {
  const benef = (await api().get('/api/financeiro/processo/1/beneficiarios')).body.dados;
  assert.deepEqual(benef.map(b => b.nome).sort(), ['Cliente Beneficiário', 'Pessoa Sem Documento']);
  assert.equal((await api().get('/api/financeiro/processo/abc/beneficiarios')).status, 400);

  const contas = (await api().get(`/api/financeiro/beneficiario/contas?tipo=fisica&pessoa_id=${F.clienteId}`)).body.dados;
  assert.equal(contas.length, 1);
  assert.equal(contas[0].titular, 'Cliente Beneficiário');                                    // conta própria usa os dados da pessoa
  assert.equal(contas[0].documento_titular, '52998224725');
  assert.equal((await api().get('/api/financeiro/beneficiario/contas?tipo=xyz&pessoa_id=1')).status, 400);

  const cria = (corpo, pessoa = F.clienteId) => api().post(`/api/financeiro/beneficiario/fisica/${pessoa}/conta`).send(corpo);
  assert.match(msg(await cria({ agencia: '1' })), /instituição financeira/);
  assert.match(msg(await cria({ instituicao_financeira_id: 99999 })), /não está ativa/);
  assert.match(msg(await cria({ instituicao_financeira_id: F.banco, digito: 'ABCDEFG' })), /./);            // dígito fora do limite é recusado
  assert.match(msg(await cria({ instituicao_financeira_id: F.banco, agencia: '5', numero: '5' }, F.semCpfId)), /CPF\/CNPJ cadastrado ou a conta deve ser marcada como de terceiro/);
  assert.equal((await cria({ instituicao_financeira_id: F.banco }, 999999)).status, 404);
  assert.equal((await api().post('/api/financeiro/beneficiario/xyz/1/conta').send({ instituicao_financeira_id: F.banco })).status, 400);

  const terceiro = await cria({ instituicao_financeira_id: F.banco, agencia: '5', numero: '5', conta_terceiro: true, titular: 'Titular Terceiro', documento_titular: '111.444.777-35' }, F.semCpfId);
  assert.equal(terceiro.status, 201);
  const gravada = await um('SELECT titular, documento_titular, conta_terceiro FROM contas_bancarias_pf WHERE id = ?', [terceiro.body.dados.id]);
  assert.deepEqual(gravada, { titular: 'Titular Terceiro', documento_titular: '11144477735', conta_terceiro: 1 });

  // mesma conta de novo: reativa a existente (não duplica) e a marca como principal
  const repetida = await cria({ instituicao_financeira_id: F.banco, agencia: '0001', numero: '12345', digito: '6', principal: true });
  assert.equal(repetida.body.dados.id, F.contaClienteId);
  assert.equal((await um('SELECT COUNT(*) AS n FROM contas_bancarias_pf WHERE pessoa_id = ?', [F.clienteId])).n, 1);

  // permissão: quem não pode alterar Pessoas não cadastra conta
  assert.equal((await api(semPermissao).post(`/api/financeiro/beneficiario/fisica/${F.clienteId}/conta`).send({ instituicao_financeira_id: F.banco })).status, 403);
});

// ------------------------------------------------------------------ acordos
test('acordo: prévia divide o total (última parcela absorve os centavos), vencimentos em dia útil, validações', async () => {
  const previa = await api().post('/api/financeiro/acordo/previa').send({ valor_total: 100, qtd_parcelas: 3, data_primeira: '2026-01-05', honor_percentual: 20, multa_percentual: 10 });
  assert.equal(previa.status, 200);
  const p = previa.body.dados.parcelas;
  assert.deepEqual(p.map(x => x.valor_bruto), [33.33, 33.33, 33.34]);
  assert.equal(Math.round(p.reduce((s, x) => s + x.valor_bruto, 0) * 100), 10000);
  assert.deepEqual(p.map(x => x.honor_valor), [6.67, 6.67, 6.67]);                      // 20% de cada parcela
  assert.ok(p.every(x => x.multa_percentual === 10 && x.status === 'pendente'));
  assert.equal(p[0].vencimento, '2026-01-05');                                          // segunda-feira útil
  assert.match(p[1].vencimento, /^2026-02-/);
  assert.match(msg(await api().post('/api/financeiro/acordo/previa').send({ valor_total: 0, qtd_parcelas: 2, data_primeira: '2026-01-05' })), /maior que zero/);
  assert.match(msg(await api().post('/api/financeiro/acordo/previa').send({ valor_total: 10, qtd_parcelas: 0, data_primeira: '2026-01-05' })), /Quantidade de parcelas/);
  assert.match(msg(await api().post('/api/financeiro/acordo/previa').send({ valor_total: 10, qtd_parcelas: 2 })), /Data da primeira parcela/);
});

test('acordo: criar com parceria e beneficiário, listar, buscar, e recusar dados inválidos', async () => {
  const sem = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 100, parcelas: [] });
  assert.match(msg(sem), /Informe as parcelas/);
  assert.match(msg(await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 0, parcelas: [{ vencimento: '2026-01-05', valor_bruto: 1 }] })), /Valor total inválido/);
  // parceria fixa maior que o honorário é recusada
  const parceriaGrande = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 100, parcelas: [{ vencimento: '2026-01-05', valor_bruto: 100, honor_tipo: 'percent', honor_percentual: 10, parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'fixo', parceria_valor: 50 }] });
  assert.equal(parceriaGrande.status, 422); assert.match(msg(parceriaGrande), /parceria .* não pode ser maior que o honorário/);
  // conta de outra pessoa como destino do cliente é recusada
  const contaAlheia = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 100, beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.parceiroId, beneficiario_cliente_conta_id: F.contaClienteId, parcelas: [{ vencimento: '2026-01-05', valor_bruto: 100 }] });
  assert.equal(contaAlheia.status, 422); assert.match(msg(contaAlheia), /não pertence à pessoa/);

  const { acordoId, parcelaId } = await novoAcordo({ parceria: true, parcelas: 2 });
  const parc = await um('SELECT * FROM acordo_parcela WHERE id = ?', [parcelaId]);
  assert.deepEqual({ bruto: Number(parc.valor_bruto), honor: Number(parc.honor_valor), liq: Number(parc.valor_liquido), parceria: Number(parc.parceria_valor) }, { bruto: 500, honor: 150, liq: 350, parceria: 75 });
  assert.equal(parc.repasse_cliente_pessoa_id, F.clienteId);

  const lista = (await api().get('/api/financeiro/processo/1/acordos')).body.dados;
  assert.ok(lista.some(a => a.id === acordoId));
  const detalhe = await api().get(`/api/financeiro/acordo/${acordoId}`);
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.body.dados.parcelas.length, 2);
  assert.equal(Number(detalhe.body.dados.valor_total), 1000);
  assert.equal((await api().get('/api/financeiro/acordo/999999')).status, 404);
});

test('acordo: editar (recalcula, soma precisa bater), parcela recebida não muda, e as regras de cancelar e excluir', async () => {
  const { acordoId, parcelas: [p1, p2] } = await novoAcordo({ parcelas: 2, cliente: false });
  const atual = (await api().get(`/api/financeiro/acordo/${acordoId}`)).body.dados;
  const montar = (valores) => ({ descricao: 'Editado', valor_total: valores.reduce((s, v) => s + v, 0), qtd_parcelas: valores.length, data_primeira: '2026-01-05',
    parcelas: valores.map((v, i) => ({ id: atual.parcelas[i]?.id, numero: i + 1, vencimento: `2026-0${i + 1}-05`, valor_bruto: v, honor_tipo: 'percent', honor_percentual: 10 })) });

  assert.equal((await api().put(`/api/financeiro/acordo/${acordoId}`).send({ ...montar([600, 400]), valor_total: 999 })).status, 422);       // soma não bate
  assert.match(msg(await api().put(`/api/financeiro/acordo/${acordoId}`).send({ parcelas: [] })), /Informe as parcelas/);
  assert.equal((await api().put('/api/financeiro/acordo/999999').send(montar([1]))).status, 404);
  assert.equal((await api().put(`/api/financeiro/acordo/${acordoId}`).send(montar([600, 400]))).status, 200);
  const recalculada = await um('SELECT valor_bruto, honor_valor, valor_liquido FROM acordo_parcela WHERE id = ?', [p1]);
  assert.deepEqual({ b: Number(recalculada.valor_bruto), h: Number(recalculada.honor_valor), l: Number(recalculada.valor_liquido) }, { b: 600, h: 60, l: 540 });
  assert.equal((await um('SELECT descricao FROM acordo WHERE id = ?', [acordoId])).descricao, 'Editado');

  // parcela recebida: não pode ser alterada nem removida; o acordo não pode ser excluído
  assert.equal((await receber(p1)).status, 200);
  const mudaPaga = await api().put(`/api/financeiro/acordo/${acordoId}`).send(montar([700, 300]));
  assert.equal(mudaPaga.status, 422); assert.match(msg(mudaPaga), /já foi recebida e não pode ser alterada/);
  const removePaga = await api().put(`/api/financeiro/acordo/${acordoId}`).send({ ...montar([400]), parcelas: [{ id: p2, numero: 1, vencimento: '2026-02-05', valor_bruto: 400, honor_tipo: 'sem' }] });
  assert.equal(removePaga.status, 422); assert.match(msg(removePaga), /já foi recebida e não pode ser removida/);
  const excluiPaga = await api().delete(`/api/financeiro/acordo/${acordoId}`);
  assert.equal(excluiPaga.status, 400); assert.match(msg(excluiPaga), /Desfaça os recebimentos antes de excluir/);

  // cancelar: exige motivo; cancela só as pendentes; as pagas ficam
  assert.match(msg(await api().put(`/api/financeiro/acordo/${acordoId}/cancelar`).send({ motivo: '  ' })), /motivo do cancelamento/);
  assert.equal((await api().put('/api/financeiro/acordo/999999/cancelar').send({ motivo: 'x' })).status, 404);
  assert.equal((await api().put(`/api/financeiro/acordo/${acordoId}/cancelar`).send({ motivo: 'Réu quitou por fora' })).status, 200);
  assert.deepEqual((await sql('SELECT status FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [acordoId])).map(x => x.status), ['pago', 'cancelada']);
  assert.equal((await um('SELECT status FROM acordo WHERE id = ?', [acordoId])).status, 'cancelado');
  assert.match(msg(await api().put(`/api/financeiro/acordo/${acordoId}/cancelar`).send({ motivo: 'de novo' })), /já está cancelado/);
  assert.match(msg(await api().delete(`/api/financeiro/acordo/${acordoId}`)), /registro permanente/);
  const hist = (await api().get(`/api/financeiro/parcela/${p2}/historico`)).body.dados;
  assert.ok(hist.some(h => h.acao === 'cancelada' && /Réu quitou por fora/.test(JSON.stringify(h))));
  // parcela cancelada não pode ser recebida
  assert.match(msg(await receber(p2)), /cancelada e não pode ser recebida/);
  // acordo cancelado não pode mais ser editado
  const editaCancelado = await api().put(`/api/financeiro/acordo/${acordoId}`).send(montar([600, 400]));
  assert.equal(editaCancelado.status, 400); assert.match(msg(editaCancelado), /registro permanente e não pode ser editado/);
  assert.deepEqual((await sql('SELECT status FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [acordoId])).map(x => x.status), ['pago', 'cancelada']);   // nada mudou
});

test('acordo: excluir sem recebimentos apaga o acordo e as parcelas junto (sem órfãos); inexistente dá 404', async () => {
  const { acordoId, parcelas } = await novoAcordo({ parcelas: 3, cliente: false });
  assert.equal((await api().delete(`/api/financeiro/acordo/${acordoId}`)).status, 200);
  assert.equal((await um('SELECT COUNT(*) AS n FROM acordo WHERE id = ?', [acordoId])).n, 0);
  assert.equal((await um('SELECT COUNT(*) AS n FROM acordo_parcela WHERE id IN (?, ?, ?)', parcelas)).n, 0);
  assert.equal((await api().delete(`/api/financeiro/acordo/${acordoId}`)).status, 404);
});

// ------------------------------------------------------------------ receber parcela
test('receber parcela: exige conta e forma compatíveis, não repete, desfazer limpa tudo e a parcela volta a pendente', async () => {
  const { parcelaId } = await novoAcordo();
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/pagar`).send({ recebido_em: '2026-01-06', recebimento_forma_id: F.formaAmbos })), /conta ou o caixa em espécie/);
  assert.match(msg(await receber(parcelaId, { recebimento_forma_id: null })), /forma de recebimento ou pagamento/);
  // forma só de dinheiro não serve para conta bancária; forma só financeira não serve para o caixa
  const dinheiroNoBanco = await receber(parcelaId, { recebimento_forma_id: F.formaEspecie });
  assert.equal(dinheiroNoBanco.status, 422); assert.match(msg(dinheiroNoBanco), /não é compatível com a conta ou caixa/);
  assert.equal((await receber(parcelaId, { recebimento_forma_id: F.formaFinanceira, recebimento_conta_financeira_id: F.caixa })).status, 422);
  assert.equal((await receber(parcelaId, { recebimento_conta_financeira_id: 99999 })).status, 422);
  assert.equal((await um('SELECT status FROM acordo_parcela WHERE id = ?', [parcelaId])).status, 'pendente');   // nada foi gravado nas recusas
  assert.equal((await um('SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ?', [parcelaId])).n, 0);

  // dinheiro no caixa físico é aceito
  assert.equal((await receber(parcelaId, { recebimento_forma_id: F.formaEspecie, recebimento_conta_financeira_id: F.caixa, recebimento_identificacao: '' })).status, 200);
  const paga = await um('SELECT status, recebido_em, recebimento_conta_financeira_id FROM acordo_parcela WHERE id = ?', [parcelaId]);
  assert.equal(paga.status, 'pago'); assert.equal(paga.recebimento_conta_financeira_id, F.caixa);
  const entrada = await um("SELECT tipo, valor, conta_financeira_id, origem FROM conta_corrente WHERE parcela_id = ?", [parcelaId]);
  assert.deepEqual({ ...entrada, valor: Number(entrada.valor) }, { tipo: 'entrada', valor: 1000, conta_financeira_id: F.caixa, origem: 'recebimento' });
  assert.match(msg(await receber(parcelaId)), /já está recebida/);
  assert.equal((await api().put('/api/financeiro/parcela/999999/pagar').send({})).status, 404);

  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({})).status, 200);
  const volta = await um('SELECT status, recebido_em, recebimento_forma_id, recebimento_conta_financeira_id FROM acordo_parcela WHERE id = ?', [parcelaId]);
  assert.deepEqual(volta, { status: 'pendente', recebido_em: null, recebimento_forma_id: null, recebimento_conta_financeira_id: null });
  assert.equal((await um('SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ?', [parcelaId])).n, 0);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({})), /./);          // desfazer duas vezes é recusado
  const hist = (await api().get(`/api/financeiro/parcela/${parcelaId}/historico`)).body.dados;
  assert.ok(hist.length >= 3, 'criada, recebida e recebimento desfeito aparecem no histórico da parcela');
  assert.equal((await api().get('/api/financeiro/parcela/999999/historico')).status, 200);
});

// ------------------------------------------------------------------ repasses
test('repasse ao cliente: só depois de receber, destino e forma obrigatórios, conta bancária ou em mãos, não repete, desfazer', async () => {
  const { parcelaId } = await novoAcordo();
  assert.match(msg(await repasseCliente(parcelaId)), /Registre o recebimento do réu antes de repassar/);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/repasse`).send({ tipo: 'outro' })), /Tipo de repasse inválido/);
  assert.equal((await receber(parcelaId)).status, 200);

  assert.equal((await repasseCliente(parcelaId, { conta_financeira_id: null })).status, 422);
  assert.equal((await repasseCliente(parcelaId, { forma_id: null })).status, 422);
  assert.equal((await repasseCliente(parcelaId, { forma_id: F.formaEspecie })).status, 422);                    // dinheiro não serve para conta bancária
  assert.equal((await repasseCliente(parcelaId, { conta_bancaria_id: F.contaParceiroId })).status, 422);       // conta de outra pessoa
  assert.match(msg(await repasseCliente(parcelaId, { observacao: 'x'.repeat(1001) })), /no máximo 1\.000 caracteres/);
  assert.equal((await um('SELECT repasse_cliente_em FROM acordo_parcela WHERE id = ?', [parcelaId])).repasse_cliente_em, null);

  assert.equal((await repasseCliente(parcelaId, { observacao: 'Pago pela recepção' })).status, 200);
  const rep = await um('SELECT repasse_cliente_destino_tipo, repasse_cliente_destino_snapshot, repasse_cliente_observacao, repasse_cliente_conta_financeira_id FROM acordo_parcela WHERE id = ?', [parcelaId]);
  assert.equal(rep.repasse_cliente_destino_tipo, 'bancaria');
  assert.equal(rep.repasse_cliente_observacao, 'Pago pela recepção');
  const snap = JSON.parse(rep.repasse_cliente_destino_snapshot);
  assert.deepEqual({ titular: snap.titular, doc: snap.documento_titular, agencia: snap.agencia, numero: snap.numero }, { titular: 'Cliente Beneficiário', doc: '52998224725', agencia: '0001', numero: '12345' });
  const saida = await um("SELECT tipo, valor, origem FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_cliente'", [parcelaId]);
  assert.deepEqual({ ...saida, valor: Number(saida.valor) }, { tipo: 'saida', valor: 700, origem: 'rep_cliente' });          // repassa o líquido (1000 − 30%)
  assert.match(msg(await repasseCliente(parcelaId)), /já registrado/);

  // a conta do beneficiário muda depois: o snapshot gravado NÃO muda (imutável)
  await sql('UPDATE contas_bancarias_pf SET numero = ? WHERE id = ?', ['99999', F.contaClienteId]);
  assert.equal(JSON.parse((await um('SELECT repasse_cliente_destino_snapshot AS s FROM acordo_parcela WHERE id = ?', [parcelaId])).s).numero, '12345');
  await sql('UPDATE contas_bancarias_pf SET numero = ? WHERE id = ?', ['12345', F.contaClienteId]);

  // desfazer repasse: apaga a saída, limpa os campos; o recebimento continua
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/repasse/desfazer`).send({ tipo: 'cliente' })).status, 200);
  assert.equal((await um("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_cliente'", [parcelaId])).n, 0);
  assert.equal((await um('SELECT status, repasse_cliente_em, repasse_cliente_destino_snapshot FROM acordo_parcela WHERE id = ?', [parcelaId])).repasse_cliente_em, null);
  assert.equal((await um('SELECT status FROM acordo_parcela WHERE id = ?', [parcelaId])).status, 'pago');
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/repasse/desfazer`).send({ tipo: 'cliente' })), /Não há repasse ao cliente para desfazer/);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/repasse/desfazer`).send({ tipo: 'x' })), /Tipo de repasse inválido/);
});

test('repasse em mãos (caixa + dinheiro) e ao parceiro; listas de repasses pendentes e concluídos acompanham', async () => {
  const { parcelaId } = await novoAcordo({ parceria: true });
  assert.equal((await receber(parcelaId)).status, 200);
  const pendentes = (await api().get('/api/financeiro/repasses-pendentes')).body.dados;
  assert.ok(pendentes.some(x => Number(x.id) === parcelaId), 'parcela recebida aparece nos repasses pendentes');

  // em mãos: exige caixa em espécie e forma de dinheiro; o beneficiário vem da parcela
  const emMaosComBanco = await repasseCliente(parcelaId, { destino_tipo: 'em_maos', forma_id: F.formaFinanceira });
  assert.equal(emMaosComBanco.status, 422); assert.match(msg(emMaosComBanco), /não é compatível com a conta ou caixa/);
  assert.equal((await repasseCliente(parcelaId, { destino_tipo: 'em_maos', forma_id: F.formaEspecie, conta_financeira_id: F.caixa })).status, 200);
  const emMaos = JSON.parse((await um('SELECT repasse_cliente_destino_snapshot AS s FROM acordo_parcela WHERE id = ?', [parcelaId])).s);
  assert.deepEqual({ destino: emMaos.destino, titular: emMaos.titular }, { destino: 'em_maos', titular: 'Cliente Beneficiário' });
  assert.match((await um("SELECT descricao FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_cliente'", [parcelaId])).descricao, /em mãos/);

  // parceiro: 50% do honorário (300) = 150; conta do parceiro é a escolhida
  const parceiro = await api().put(`/api/financeiro/parcela/${parcelaId}/repasse`).send({ tipo: 'parceiro', data: '2026-01-08', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco, conta_bancaria_id: F.contaParceiroId });
  assert.equal(parceiro.status, 200, JSON.stringify(parceiro.body));
  const saidaParceiro = await um("SELECT valor FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_parceiro'", [parcelaId]);
  assert.equal(Number(saidaParceiro.valor), 150);
  const aindaPendentes = (await api().get('/api/financeiro/repasses-pendentes')).body.dados;
  assert.ok(!aindaPendentes.some(x => Number(x.id) === parcelaId), 'com cliente e parceiro repassados, a parcela sai dos pendentes');
  const concluidos = (await api().get('/api/financeiro/repasses-concluidos')).body.dados;
  assert.ok(concluidos.some(x => Number(x.id) === parcelaId), 'repasses feitos aparecem nos concluídos');

  // parcela sem parceria não aceita repasse ao parceiro
  const { parcelaId: semParceria } = await novoAcordo();
  await receber(semParceria);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${semParceria}/repasse`).send({ tipo: 'parceiro', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco })), /não tem parceria/);
  // desfazer parceiro
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/repasse/desfazer`).send({ tipo: 'parceiro' })).status, 200);
  assert.equal((await um("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_parceiro'", [parcelaId])).n, 0);
});

test('desfazer recebimento da parcela é bloqueado enquanto houver repasse feito', async () => {
  const { parcelaId } = await novoAcordo();
  await receber(parcelaId); await repasseCliente(parcelaId);
  const bloqueio = await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({});
  assert.equal(bloqueio.status, 400); assert.match(msg(bloqueio), /Desfaça os repasses \(cliente\/parceiro\) antes de desfazer o recebimento/);
  assert.equal((await um('SELECT status FROM acordo_parcela WHERE id = ?', [parcelaId])).status, 'pago');
  assert.match(msg(await api().put(`/api/financeiro/parcela/${(await novoAcordo()).parcelaId}/desfazer`).send({})), /Parcela não está recebida/);
});

// ------------------------------------------------------------------ multa por atraso
test('multa: lançar, editar, bloqueio do recebimento da parcela, receber, repassar, desfazer e remover — ciclo completo', async () => {
  const { acordoId, parcelaId } = await novoAcordo({ parceria: true });
  const base = { percentual_juiz: 10, valor_bruto: 100, vencimento: '2026-02-05', repasse_cliente_habilitado: true, repasse_parceiro_habilitado: true };
  const multa = (corpo, metodo = 'post') => api()[metodo](`/api/financeiro/parcela/${parcelaId}/multa`).send(corpo);

  // validações do lançamento
  assert.match(msg(await multa({ ...base, vencimento: '' })), /informe a data em que a multa deve ser paga/);
  assert.match(msg(await multa({ ...base, valor_bruto: 0 })), /valor bruto maior que zero/);
  assert.equal((await api().post('/api/financeiro/parcela/999999/multa').send(base)).status, 404);
  const { parcelaId: semParceria } = await novoAcordo();
  const parceiroSemParceria = await api().post(`/api/financeiro/parcela/${semParceria}/multa`).send(base);
  assert.equal(parceiroSemParceria.status, 422); assert.match(msg(parceiroSemParceria), /não tem parceria/);

  // lançar: herda honorário (30%) e parceria (50% do honorário) da parcela; ainda não mexe na conta corrente
  assert.equal((await multa(base)).status, 201);
  const lancada = await um('SELECT * FROM acordo_parcela_multa WHERE parcela_id = ?', [parcelaId]);
  assert.deepEqual({ bruto: Number(lancada.valor_bruto), honor: Number(lancada.honor_valor), liq: Number(lancada.valor_liquido), parceria: Number(lancada.parceria_valor), status: lancada.status },
    { bruto: 100, honor: 30, liq: 70, parceria: 15, status: 'pendente' });
  assert.equal((await um("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND origem = 'multa'", [parcelaId])).n, 0);
  assert.match(msg(await multa(base)), /Já existe uma multa lançada/);

  // com multa lançada e não recebida, a parcela não pode ser recebida
  const bloqueada = await receber(parcelaId);
  assert.equal(bloqueada.status, 400); assert.match(msg(bloqueada), /multa lançada nesta parcela e ainda não recebida/);

  // editar recalcula
  assert.equal((await multa({ ...base, valor_bruto: 200 }, 'put')).status, 200);
  assert.deepEqual({ b: Number((await um('SELECT valor_bruto FROM acordo_parcela_multa WHERE parcela_id = ?', [parcelaId])).valor_bruto), l: Number((await um('SELECT valor_liquido FROM acordo_parcela_multa WHERE parcela_id = ?', [parcelaId])).valor_liquido) }, { b: 200, l: 140 });
  assert.equal((await api().put('/api/financeiro/parcela/999999/multa').send(base)).status, 404);

  // receber a multa: exige conta e forma; gera a entrada separada no extrato
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/multa/receber`).send({ recebido_em: '2026-02-06', recebimento_forma_id: F.formaAmbos })).status, 422);
  assert.equal((await api().put(`/api/financeiro/parcela/${semParceria}/multa/receber`).send({})).status, 404);                       // sem multa
  const recebida = await api().put(`/api/financeiro/parcela/${parcelaId}/multa/receber`).send({ recebido_em: '2026-02-06', recebimento_forma_id: F.formaAmbos, recebimento_conta_financeira_id: F.contaBanco, recebimento_identificacao: 'PIX-MULTA' });
  assert.equal(recebida.status, 200, JSON.stringify(recebida.body));
  const entrada = await um("SELECT tipo, valor, origem FROM conta_corrente WHERE parcela_id = ? AND origem = 'multa'", [parcelaId]);
  assert.deepEqual({ ...entrada, valor: Number(entrada.valor) }, { tipo: 'entrada', valor: 200, origem: 'multa' });
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/multa/receber`).send({ recebimento_forma_id: F.formaAmbos, recebimento_conta_financeira_id: F.contaBanco })), /já está recebida/);

  // depois de recebida: não edita, não remove, e o acordo não pode ser excluído
  assert.match(msg(await multa(base, 'put')), /já foi recebida e não pode mais ser editada/);
  assert.match(msg(await api().delete(`/api/financeiro/parcela/${parcelaId}/multa`)), /Desfaça o recebimento da multa antes de removê-la/);
  assert.match(msg(await api().delete(`/api/financeiro/acordo/${acordoId}`)), /Há multa lançada e\/ou recebida/);

  // repasses da multa: cliente (líquido 140) e parceiro (parceria 30), cada um uma vez
  const repMulta = (corpo) => api().put(`/api/financeiro/parcela/${parcelaId}/multa/repasse`).send({ data: '2026-02-07', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco, ...corpo });
  assert.match(msg(await repMulta({ tipo: 'x' })), /Tipo de repasse inválido/);
  assert.equal((await repMulta({ tipo: 'cliente' })).status, 200);
  assert.equal(Number((await um("SELECT valor FROM conta_corrente WHERE parcela_id = ? AND origem = 'multa_rep_cli'", [parcelaId])).valor), 140);
  assert.match(msg(await repMulta({ tipo: 'cliente' })), /já registrado/);
  assert.equal((await repMulta({ tipo: 'parceiro', conta_bancaria_id: F.contaParceiroId })).status, 200);
  assert.equal(Number((await um("SELECT valor FROM conta_corrente WHERE parcela_id = ? AND origem = 'multa_rep_par'", [parcelaId])).valor), 30);

  // não dá para desfazer o recebimento da multa com repasses feitos; desfaz os repasses e depois o recebimento
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/multa/desfazer`).send({})), /Desfaça os repasses da multa/);
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/multa/repasse/desfazer`).send({ tipo: 'cliente' })).status, 200);
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/multa/repasse/desfazer`).send({ tipo: 'parceiro' })).status, 200);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/multa/repasse/desfazer`).send({ tipo: 'cliente' })), /Não há repasse da multa ao cliente para desfazer/);
  assert.equal((await um("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND origem IN ('multa_rep_cli','multa_rep_par')", [parcelaId])).n, 0);

  // com a multa recebida, a parcela pode ser recebida, mas o recebimento dela não pode ser desfeito antes do da multa
  assert.equal((await receber(parcelaId)).status, 200);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({})), /Desfaça o recebimento da multa antes de desfazer o recebimento da parcela/);
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({})).status, 400);
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/multa/desfazer`).send({})).status, 200);
  assert.equal((await um("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND origem = 'multa'", [parcelaId])).n, 0);
  assert.match(msg(await api().put(`/api/financeiro/parcela/${parcelaId}/multa/desfazer`).send({})), /A multa não está recebida/);
  assert.equal((await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({})).status, 200);

  // remover a multa pendente; depois dela não existir, receber/editar dão 404
  assert.equal((await api().delete(`/api/financeiro/parcela/${parcelaId}/multa`)).status, 200);
  assert.equal((await um('SELECT COUNT(*) AS n FROM acordo_parcela_multa WHERE parcela_id = ?', [parcelaId])).n, 0);
  assert.equal((await multa(base, 'put')).status, 404);
  assert.equal((await api().delete(`/api/financeiro/parcela/${parcelaId}/multa`)).status, 404);

  // multa só em parcela ainda não recebida
  await receber(parcelaId);
  assert.match(msg(await multa(base)), /Só é possível lançar multa em uma parcela ainda não recebida/);
  const hist = JSON.stringify((await api().get(`/api/financeiro/parcela/${parcelaId}/historico`)).body.dados);
  assert.match(hist, /multa-lancada/); assert.match(hist, /multa-recebida|multa/);
});

// ------------------------------------------------------------------ consulta e exportação
async function acordoDaConsulta() {
  // Acordo bem identificável (valor e datas únicos) para os filtros não pegarem os dados dos outros testes
  const r = await api().post('/api/financeiro/processo/1/acordo').send({
    descricao: 'Acordo da consulta', valor_total: 7777.77, qtd_parcelas: 1, data_primeira: '2027-03-10',
    parcelas: [{ numero: 1, vencimento: '2027-03-10', valor_bruto: 7777.77, honor_tipo: 'percent', honor_percentual: 20, parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'percent', parceria_percentual: 25 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (await um('SELECT id FROM acordo_parcela WHERE acordo_id = ?', [r.body.dados.id])).id;
}
const consulta = (q) => api().get(`/api/financeiro/consulta?${new URLSearchParams(q)}`);

test('consulta: cada filtro (datas, faixa de valor por campo, processo, pasta, status, parceiro, autor, réu), totais, paginação e entradas maliciosas', async () => {
  const parcelaId = await acordoDaConsulta();
  const nossa = { venc_de: '2027-03-01', venc_ate: '2027-03-31' };
  const ids = async (q) => (await consulta({ ...nossa, ...q })).body.dados.registros.map(x => x.id);

  assert.deepEqual(await ids({}), [parcelaId]);
  assert.deepEqual(await ids({ venc_de: '2027-03-11' }), []);
  assert.deepEqual(await ids({ venc_ate: '2027-03-09' }), []);
  // faixa de valor: bruto 7777.77, honorário 20% = 1555.55, líquido 6222.22
  assert.deepEqual(await ids({ valor_campo: 'bruto', valor_de: '7777', valor_ate: '7778' }), [parcelaId]);
  assert.deepEqual(await ids({ valor_campo: 'bruto', valor_de: '7778' }), []);
  assert.deepEqual(await ids({ valor_campo: 'honorario', valor_de: '1555', valor_ate: '1556' }), [parcelaId]);
  assert.deepEqual(await ids({ valor_campo: 'liquido', valor_ate: '6000' }), []);
  assert.deepEqual(await ids({ valor_campo: 'liquido', valor_de: '6222.22', valor_ate: '6222.22' }), [parcelaId]);
  assert.deepEqual(await ids({ valor_campo: 'coluna_inexistente', valor_de: '999999' }), [parcelaId]);       // campo fora da lista é ignorado
  // processo, pasta, status
  assert.deepEqual(await ids({ num_processo: '0000001-01' }), [parcelaId]);
  assert.deepEqual(await ids({ num_processo: '9999999' }), []);
  assert.deepEqual(await ids({ pasta: '99001' }), [parcelaId]);
  assert.deepEqual(await ids({ pasta: '1' }), []);
  assert.deepEqual(await ids({ status: 'pendente' }), [parcelaId]);
  assert.deepEqual(await ids({ status: 'pago' }), []);
  assert.deepEqual(await ids({ status: 'qualquer' }), [parcelaId]);                                         // status fora da lista é ignorado
  // pessoas
  assert.deepEqual(await ids({ parceiro: 'Parceiro Adv' }), [parcelaId]);
  assert.deepEqual(await ids({ parceiro: 'Ninguém assim' }), []);
  assert.deepEqual(await ids({ autor: 'Cliente Benef' }), [parcelaId]);
  assert.deepEqual(await ids({ autor: 'Sem Documento' }), []);
  assert.deepEqual(await ids({ reu: 'Sem Documento' }), [parcelaId]);
  assert.deepEqual(await ids({ reu: 'Cliente Benef' }), []);
  // recebida muda o filtro de status
  await receber(parcelaId);
  assert.deepEqual(await ids({ status: 'pago' }), [parcelaId]);
  assert.deepEqual(await ids({ status: 'pendente' }), []);
  await api().put(`/api/financeiro/parcela/${parcelaId}/desfazer`).send({});

  // totais somam todo o conjunto filtrado; os campos da linha vêm calculados
  const resp = (await consulta(nossa)).body.dados;
  assert.equal(resp.total, 1);
  assert.deepEqual({ b: Number(resp.totais.bruto), h: Number(resp.totais.honorario), l: Number(resp.totais.liquido), p: Number(resp.totais.parceria) }, { b: 7777.77, h: 1555.55, l: 6222.22, p: 388.89 });
  assert.equal(resp.registros[0].parceria_nome, 'Parceiro Advogado');

  // paginação: limite máximo de 100 por página, página fora do intervalo vem vazia mas com o total
  const todas = (await consulta({ limite: '1000' })).body.dados;
  assert.ok(todas.registros.length <= 100);
  assert.ok(todas.total >= 1);
  const pagina2 = (await consulta({ ...nossa, limite: '1', pagina: '2' })).body.dados;
  assert.deepEqual([pagina2.registros.length, pagina2.total], [0, 1]);

  // texto malicioso é só texto: nada quebra e nada vaza
  for (const lixo of ["' OR 1=1 --", "%' ; DROP TABLE acordo; --", '\\']) {
    const r = await consulta({ ...nossa, parceiro: lixo, autor: lixo, reu: lixo, num_processo: lixo });
    assert.equal(r.status, 200); assert.equal(r.body.dados.total, 0);
  }
  assert.ok((await um('SELECT COUNT(*) AS n FROM acordo')).n > 0);
});

test('exportar consulta para Excel: arquivo legível, cabeçalho, linha do acordo, totais e mesmos filtros da tela', async () => {
  const filtros = { venc_de: '2027-03-01', venc_ate: '2027-03-31' };
  const r = await api().get(`/api/financeiro/consulta/exportar?${new URLSearchParams(filtros)}`).buffer(true).parse((res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /spreadsheetml\.sheet/);
  assert.match(r.headers['content-disposition'], /Consulta financeira - \d{2}-\d{2}-\d{4}\.xlsx/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
  const ws = wb.getWorksheet('Financeiro');
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Pasta', 'Processo', 'Partes (Autor × Réu)', 'Origem', 'Parcela', 'Vencimento', 'Bruto', 'Honorário', 'Líquido', 'Parceria', 'Parceiro', 'Status']);
  const linha = ws.getRow(2).values.slice(1);
  assert.match(linha[3], /^Acordo \d+$/);                                       // o número é a ordem do acordo no processo
  assert.deepEqual([linha[0], linha[1], linha[4], linha[5], linha[10], linha[11]], ['99001', '0000001-01.2026.5.15.0001', '1/1', '10/03/2027', 'Parceiro Advogado', 'Pendente']);
  assert.deepEqual([linha[6], linha[7], linha[8], linha[9]], [7777.77, 1555.55, 6222.22, 388.89]);        // números de verdade, não texto
  const totais = ws.getRow(3).values.slice(1);
  assert.equal(totais[2], 'TOTAIS'); assert.deepEqual(totais.slice(6, 10), [7777.77, 1555.55, 6222.22, 388.89]);
  // filtro que não acha nada: só cabeçalho + totais zerados
  const vazio = await api().get('/api/financeiro/consulta/exportar?venc_de=2031-01-01').buffer(true).parse((res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(vazio.body);
  assert.equal(wb2.getWorksheet('Financeiro').rowCount, 2);
  assert.equal((await api(semPermissao).get('/api/financeiro/consulta/exportar')).status, 403);
});

// ------------------------------------------------------------------ permissões
test('permissões: sem login 401; sem permissão de Financeiro 403 em TODAS as rotas; áreas de administrador recusam usuário comum', async () => {
  const rotas = [
    ['get', '/api/financeiro/processo/1'], ['post', '/api/financeiro/processo/1/lancamento'], ['put', '/api/financeiro/lancamento/1'],
    ['get', '/api/financeiro/lancamento/1/historico'], ['delete', '/api/financeiro/lancamento/1'],
    ['get', '/api/financeiro/processo/1/beneficiarios'], ['get', '/api/financeiro/beneficiario/contas?tipo=fisica&pessoa_id=1'],
    ['get', '/api/financeiro/contas-escritorio'], ['get', '/api/financeiro/processo/1/acordos'], ['post', '/api/financeiro/acordo/previa'],
    ['post', '/api/financeiro/processo/1/acordo'], ['get', '/api/financeiro/acordo/1'], ['put', '/api/financeiro/acordo/1'],
    ['delete', '/api/financeiro/acordo/1'], ['put', '/api/financeiro/acordo/1/cancelar'], ['put', '/api/financeiro/parcela/1/pagar'],
    ['put', '/api/financeiro/parcela/1/desfazer'], ['post', '/api/financeiro/parcela/1/multa'], ['put', '/api/financeiro/parcela/1/multa'],
    ['delete', '/api/financeiro/parcela/1/multa'], ['put', '/api/financeiro/parcela/1/multa/receber'], ['put', '/api/financeiro/parcela/1/multa/desfazer'],
    ['put', '/api/financeiro/parcela/1/multa/repasse'], ['put', '/api/financeiro/parcela/1/multa/repasse/desfazer'],
    ['get', '/api/financeiro/repasses-pendentes'], ['get', '/api/financeiro/repasses-concluidos'], ['get', '/api/financeiro/consulta'],
    ['get', '/api/financeiro/consulta/exportar'], ['put', '/api/financeiro/parcela/1/repasse'], ['put', '/api/financeiro/parcela/1/repasse/desfazer'],
    ['get', '/api/financeiro/parcela/1/historico'],
  ];
  for (const [metodo, rota] of rotas) {
    assert.equal((await request(app)[metodo](rota)).status, 401, `sem login ${metodo.toUpperCase()} ${rota}`);
    assert.equal((await api(semPermissao)[metodo](rota).send({})).status, 403, `sem permissão ${metodo.toUpperCase()} ${rota}`);
  }
  const soAdmin = [
    ['post', '/api/financeiro/contas-escritorio'], ['put', '/api/financeiro/contas-escritorio/1'], ['delete', '/api/financeiro/contas-escritorio/1'],
    ['post', '/api/financeiro/formas-pagamento'], ['put', '/api/financeiro/formas-pagamento/1'], ['delete', '/api/financeiro/formas-pagamento/1'],
    ['post', '/api/financeiro/instituicoes-financeiras'], ['put', '/api/financeiro/instituicoes-financeiras/1'], ['delete', '/api/financeiro/instituicoes-financeiras/1'],
  ];
  for (const [metodo, rota] of soAdmin) assert.equal((await api(usuario)[metodo](rota).send({ nome: 'x' })).status, 403, `usuário comum ${metodo.toUpperCase()} ${rota}`);
});
