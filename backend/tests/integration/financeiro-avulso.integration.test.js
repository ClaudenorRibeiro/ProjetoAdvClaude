// Recebimento AVULSO (financeiro): valor combinado à parte que o cliente pagará depois. Usa a estrutura de
// acordo/parcelas (tipo 'avulso'), mas TODO o valor é do escritório: sem repasse ao cliente, sem multa e
// sem etiqueta "Acordo"; parceiro opcional (valor fixo ou %). Também cobre a Consulta (filtro Origem e as
// MULTAS por atraso) e o assunto de Relatórios "Financeiro — multas por atraso".
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

let app; let admin; let semPermissao;
const F = {};

const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const msg = (r) => String(r.body.mensagem || '');
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };

const mesesDepois = (data, n) => { const [a, m, d] = data.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1 + n, d)); return t.toISOString().slice(0, 10); };

// Avulso de R$ 1.000 em 3 vezes (o servidor decide honorário/cliente/multa: mandamos de propósito valores "errados").
async function novoAvulso({ parceria = false, parcelas = 3, valor = 1000, primeira = '2027-05-05' } = {}) {
  const por = Math.round((valor / parcelas) * 100) / 100;
  const lista = Array.from({ length: parcelas }, (_, i) => ({
    numero: i + 1, vencimento: mesesDepois(primeira, i), valor_bruto: i === parcelas - 1 ? Math.round((valor - por * (parcelas - 1)) * 100) / 100 : por,
    honor_tipo: 'percent', honor_percentual: 30, multa_percentual: 10,
    ...(parceria ? { parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'percent', parceria_percentual: 50 } : {}),
  }));
  const r = await api().post('/api/financeiro/processo/1/acordo').send({
    tipo: 'avulso', descricao: 'Honorários combinados à parte', valor_total: valor, qtd_parcelas: parcelas, data_primeira: primeira, parcelas: lista,
    beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.clienteId, beneficiario_cliente_conta_id: F.contaClienteId,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const parcs = await sql('SELECT id FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [r.body.dados.id]);
  return { acordoId: r.body.dados.id, parcelas: parcs.map(p => p.id) };
}
const receber = (id) => api().put(`/api/financeiro/parcela/${id}/pagar`)
  .send({ recebido_em: '2027-05-06', recebimento_forma_id: F.formaAmbos, recebimento_conta_financeira_id: F.contaBanco, recebimento_identificacao: 'PIX-AV' });

test.before(async () => {
  await recriarBancoTeste();
  F.banco = (await sql("INSERT INTO instituicao_financeira (nome, ativo) VALUES ('Banco de Teste', 1)")).insertId;
  F.contaBanco = (await sql("INSERT INTO conta_financeira (instituicao_financeira_id, nome, tipo, ativo, principal) VALUES (?, 'Conta principal', 'bancaria', 1, 1)", [F.banco])).insertId;
  F.formaAmbos = 1;
  F.clienteId = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Beneficiário', '52998224725')")).insertId;
  F.parceiroId = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro Advogado', '11144477735')")).insertId;
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [F.clienteId]);
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); semPermissao = token(3, 2, 'sessao-sem-permissao');
  const c1 = await api().post(`/api/financeiro/beneficiario/fisica/${F.clienteId}/conta`).send({ instituicao_financeira_id: F.banco, agencia: '0001', numero: '12345', digito: '6', principal: true });
  F.contaClienteId = c1.body.dados.id;
  const c2 = await api().post(`/api/financeiro/beneficiario/fisica/${F.parceiroId}/conta`).send({ instituicao_financeira_id: F.banco, chave_pix: 'parceiro@example.invalid' });
  F.contaParceiroId = c2.body.dados.id;
});
test.after(async () => pool.end());

test('avulso: a prévia divide o valor, com honorário de 100% (nada para o cliente) e sem multa, mesmo que o corpo peça outra coisa', async () => {
  const previa = await api().post('/api/financeiro/acordo/previa').send({ tipo: 'avulso', valor_total: 1000, qtd_parcelas: 3, data_primeira: '2027-05-05', honor_percentual: 30, multa_percentual: 10 });
  assert.equal(previa.status, 200, JSON.stringify(previa.body));
  const p = previa.body.dados.parcelas;
  assert.deepEqual(p.map(x => x.valor_bruto), [333.33, 333.33, 333.34]);
  assert.deepEqual(p.map(x => x.honor_valor), [333.33, 333.33, 333.34]);
  assert.deepEqual(p.map(x => x.valor_liquido), [0, 0, 0]);
  assert.ok(p.every(x => x.multa_percentual === null));
  // o acordo comum continua com 30% e a multa do juiz
  const comum = await api().post('/api/financeiro/acordo/previa').send({ valor_total: 100, qtd_parcelas: 1, data_primeira: '2027-05-05', honor_percentual: 30, multa_percentual: 10 });
  assert.deepEqual([comum.body.dados.parcelas[0].honor_valor, comum.body.dados.parcelas[0].multa_percentual], [30, 10]);
});

test('avulso: cria parcelado em 3 vezes; o servidor força honorário 100%, sem cliente e sem multa; numeração própria "Avulso 1"', async () => {
  const { acordoId, parcelas } = await novoAvulso();
  const ac = await um('SELECT tipo, valor_total, qtd_parcelas, beneficiario_cliente_id, beneficiario_cliente_conta_id FROM acordo WHERE id = ?', [acordoId]);
  assert.deepEqual({ ...ac, valor_total: Number(ac.valor_total) }, { tipo: 'avulso', valor_total: 1000, qtd_parcelas: 3, beneficiario_cliente_id: null, beneficiario_cliente_conta_id: null });
  const linhas = await sql('SELECT valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido, multa_percentual, repasse_cliente_pessoa_id FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [acordoId]);
  assert.equal(linhas.length, 3);
  assert.deepEqual(linhas.map(l => Number(l.valor_bruto)), [333.33, 333.33, 333.34]);
  for (const l of linhas) {
    assert.equal(l.honor_tipo, 'percent'); assert.equal(Number(l.honor_percentual), 100);
    assert.equal(Number(l.honor_valor), Number(l.valor_bruto)); assert.equal(Number(l.valor_liquido), 0);
    assert.equal(l.multa_percentual, null); assert.equal(l.repasse_cliente_pessoa_id, null);
  }
  const lista = (await api().get('/api/financeiro/processo/1/acordos')).body.dados.find(a => a.id === acordoId);
  assert.deepEqual([lista.tipo, lista.numero_acordo, lista.total_parcelas_real], ['avulso', 1, 3]);
  // outro avulso é "Avulso 2"; a contagem não se mistura com a de acordos
  const outro = await novoAvulso({ parcelas: 1 });
  const lista2 = (await api().get('/api/financeiro/processo/1/acordos')).body.dados.find(a => a.id === outro.acordoId);
  assert.equal(lista2.numero_acordo, 2);
  assert.equal(parcelas.length, 3);
});

test('avulso: receber entra UMA vez no extrato como "recebimento avulso"; não há repasse ao cliente; o parceiro recebe a parte dele', async () => {
  const { parcelas } = await novoAvulso({ parceria: true, parcelas: 2, valor: 1000 });
  const [primeira] = parcelas;
  const ps = await um('SELECT parceria_valor, valor_liquido FROM acordo_parcela WHERE id = ?', [primeira]);
  assert.deepEqual([Number(ps.parceria_valor), Number(ps.valor_liquido)], [250, 0]);       // 50% de R$ 500 (todo o valor é "honorário")
  assert.equal((await receber(primeira)).status, 200);
  const entrada = await um("SELECT tipo, valor, descricao FROM conta_corrente WHERE parcela_id = ? AND origem = 'recebimento'", [primeira]);
  assert.deepEqual([entrada.tipo, Number(entrada.valor)], ['entrada', 500]);
  assert.match(entrada.descricao, /do recebimento avulso \d+/);

  const cliente = await api().put(`/api/financeiro/parcela/${primeira}/repasse`).send({ tipo: 'cliente', data: '2027-05-07', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco });
  assert.equal(cliente.status, 400); assert.match(msg(cliente), /Não há valor de repasse ao cliente/);
  const pend = (await api().get('/api/financeiro/repasses-pendentes')).body.dados.filter(x => Number(x.id) === primeira);
  assert.equal(pend.length, 1);                                                             // só falta o parceiro

  const parceiro = await api().put(`/api/financeiro/parcela/${primeira}/repasse`).send({ tipo: 'parceiro', data: '2027-05-08', forma_id: F.formaAmbos, conta_financeira_id: F.contaBanco, conta_bancaria_id: F.contaParceiroId });
  assert.equal(parceiro.status, 200, JSON.stringify(parceiro.body));
  assert.equal(Number((await um("SELECT valor FROM conta_corrente WHERE parcela_id = ? AND origem = 'rep_parceiro'", [primeira])).valor), 250);
  assert.ok(!(await api().get('/api/financeiro/repasses-pendentes')).body.dados.some(x => Number(x.id) === primeira), 'ciclo concluído sai dos pendentes');
});

test('avulso sem parceiro: depois de receber não sobra repasse nenhum', async () => {
  const { parcelas } = await novoAvulso({ parcelas: 1, valor: 300 });
  assert.equal((await receber(parcelas[0])).status, 200);
  assert.ok(!(await api().get('/api/financeiro/repasses-pendentes')).body.dados.some(x => Number(x.id) === parcelas[0]));
});

test('avulso: não aceita multa por atraso; parcela do acordo comum continua aceitando', async () => {
  const { parcelas } = await novoAvulso({ parcelas: 1, valor: 100 });
  const r = await api().post(`/api/financeiro/parcela/${parcelas[0]}/multa`).send({ percentual_juiz: 10, valor_bruto: 10, vencimento: '2027-06-05' });
  assert.equal(r.status, 400); assert.match(msg(r), /Recebimento avulso não tem multa/);
  assert.equal((await um('SELECT COUNT(*) AS n FROM acordo_parcela_multa WHERE parcela_id = ?', [parcelas[0]])).n, 0);
});

test('avulso: editar mantém honorário 100%, sem cliente e deixa trocar valor, datas e parceria das parcelas pendentes', async () => {
  const { acordoId, parcelas } = await novoAvulso({ parcelas: 2, valor: 600 });
  const atual = (await api().get(`/api/financeiro/acordo/${acordoId}`)).body.dados;
  assert.equal(atual.tipo, 'avulso');
  const corpo = {
    descricao: 'Mudou', valor_total: 700, qtd_parcelas: 2, data_primeira: '2027-05-05',
    beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.clienteId,
    parcelas: [
      { id: parcelas[0], numero: 1, vencimento: '2027-05-05', valor_bruto: 300, honor_tipo: 'sem' },
      { id: parcelas[1], numero: 2, vencimento: '2027-06-05', valor_bruto: 400, honor_tipo: 'fixo', honor_valor: 1,
        parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'fixo', parceria_valor: 100 },
    ],
  };
  const r = await api().put(`/api/financeiro/acordo/${acordoId}`).send(corpo);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const linhas = await sql('SELECT valor_bruto, honor_tipo, honor_valor, valor_liquido, parceria_valor FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [acordoId]);
  assert.deepEqual(linhas.map(l => [Number(l.valor_bruto), l.honor_tipo, Number(l.honor_valor), Number(l.valor_liquido), l.parceria_valor === null ? null : Number(l.parceria_valor)]),
    [[300, 'percent', 300, 0, null], [400, 'percent', 400, 0, 100]]);
  assert.equal((await um('SELECT beneficiario_cliente_id AS c FROM acordo WHERE id = ?', [acordoId])).c, null);
  // parceria acima do valor da parcela continua recusada
  const alta = await api().put(`/api/financeiro/acordo/${acordoId}`).send({ ...corpo, parcelas: [corpo.parcelas[0], { ...corpo.parcelas[1], parceria_valor: 401 }] });
  assert.equal(alta.status, 422);
});

test('o acordo comum NÃO é afetado: honorário 30%, cliente padrão gravado e multa aceita; etiqueta "Acordo" só vale para acordo', async () => {
  const r = await api().post('/api/financeiro/processo/1/acordo').send({
    descricao: 'Acordo comum', valor_total: 100, qtd_parcelas: 1, data_primeira: '2027-05-05',
    parcelas: [{ numero: 1, vencimento: '2027-05-05', valor_bruto: 100, honor_tipo: 'percent', honor_percentual: 30 }],
    beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.clienteId,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ac = await um('SELECT tipo, beneficiario_cliente_id AS c FROM acordo WHERE id = ?', [r.body.dados.id]);
  assert.deepEqual([ac.tipo, ac.c], ['acordo', F.clienteId]);
  assert.equal(Number((await um('SELECT valor_liquido AS l FROM acordo_parcela WHERE acordo_id = ?', [r.body.dados.id])).l), 70);
  // tipo desconhecido vira acordo (nunca grava texto solto)
  const estranho = await api().post('/api/financeiro/processo/1/acordo').send({ tipo: 'qualquer', valor_total: 50, qtd_parcelas: 1, data_primeira: '2027-05-05', parcelas: [{ numero: 1, vencimento: '2027-05-05', valor_bruto: 50, honor_tipo: 'sem' }] });
  assert.equal((await um('SELECT tipo FROM acordo WHERE id = ?', [estranho.body.dados.id])).tipo, 'acordo');
  // a etiqueta "Acordo" da pasta vale pelo STATUS do processo (etiqueta-acordo.integration.test.js), não pelo acordo lançado
});

// ------------------------------------------------------------------ Consulta
const consulta = (q) => api().get(`/api/financeiro/consulta?${new URLSearchParams(q)}`);

test('consulta: filtro Origem separa acordo, alvará e avulso; os totais acompanham o filtro', async () => {
  await sql('DELETE FROM acordo');             // começa limpo: só os registros deste teste
  const av = await novoAvulso({ parcelas: 2, valor: 1000, primeira: '2031-05-05' });
  const comum = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 200, qtd_parcelas: 1, data_primeira: '2031-05-05',
    parcelas: [{ numero: 1, vencimento: '2031-05-05', valor_bruto: 200, honor_tipo: 'percent', honor_percentual: 30 }] });
  const alv = await api().post('/api/financeiro/processo/1/acordo').send({ tipo: 'alvara', valor_total: 80, qtd_parcelas: 1, data_primeira: '2031-05-05',
    parcelas: [{ numero: 1, vencimento: '2031-05-05', valor_bruto: 80, honor_tipo: 'sem' }] });
  const nossa = { venc_de: '2031-01-01', venc_ate: '2031-12-31' };
  const ids = async (origem) => (await consulta({ ...nossa, ...(origem ? { origem } : {}) })).body.dados.registros;

  assert.equal((await ids()).length, 4);
  const soAvulso = await ids('avulso');
  assert.equal(soAvulso.length, 2);
  assert.ok(soAvulso.every(x => x.acordo_tipo === 'avulso' && x.linha_tipo === 'parcela'));
  assert.deepEqual((await ids('acordo')).map(x => x.acordo_tipo), ['acordo']);
  assert.deepEqual((await ids('alvara')).map(x => x.acordo_tipo), ['alvara']);
  const tot = (await consulta({ ...nossa, origem: 'avulso' })).body.dados;
  assert.deepEqual([tot.total, Number(tot.totais.bruto), Number(tot.totais.liquido), Number(tot.totais.honorario)], [2, 1000, 0, 1000]);
  assert.equal((await ids('inexistente')).length, 4);                   // origem fora da lista é ignorada
  assert.equal(av.parcelas.length + 2, 4);
  assert.ok(comum.body.ok && alv.body.ok);
});

test('consulta: origem "multa" lista as MULTAS por atraso (mesmos filtros), com totais próprios e o Excel acompanha', async () => {
  await sql('DELETE FROM acordo');
  const a1 = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 1000, qtd_parcelas: 1, data_primeira: '2032-03-10',
    parcelas: [{ numero: 1, vencimento: '2032-03-10', valor_bruto: 1000, honor_tipo: 'percent', honor_percentual: 30,
      parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiroId, parceria_tipo: 'percent', parceria_percentual: 50 }] });
  const parcela = (await um('SELECT id FROM acordo_parcela WHERE acordo_id = ?', [a1.body.dados.id])).id;
  const m = await api().post(`/api/financeiro/parcela/${parcela}/multa`).send({ percentual_juiz: 10, valor_bruto: 100, vencimento: '2032-04-10', repasse_cliente_habilitado: true, repasse_parceiro_habilitado: true });
  assert.equal(m.status, 201, JSON.stringify(m.body));

  const nossa = { venc_de: '2032-04-01', venc_ate: '2032-04-30', origem: 'multa' };
  const r = (await consulta(nossa)).body.dados;
  assert.equal(r.total, 1);
  const linha = r.registros[0];
  assert.deepEqual([linha.linha_tipo, linha.acordo_tipo, Number(linha.numero), Number(linha.valor_bruto), Number(linha.honor_valor), Number(linha.valor_liquido), Number(linha.parceria_valor), linha.status, linha.parceria_nome],
    ['multa', 'acordo', 1, 100, 30, 70, 15, 'pendente', 'Parceiro Advogado']);
  assert.deepEqual([Number(r.totais.bruto), Number(r.totais.parceria)], [100, 15]);
  // as parcelas (sem origem) continuam sem trazer a multa; a data da PARCELA (março) não casa com a da multa (abril)
  assert.equal((await consulta({ venc_de: '2032-04-01', venc_ate: '2032-04-30' })).body.dados.total, 0);
  // filtros valem para a multa: status, valor, parceiro, processo
  assert.equal((await consulta({ ...nossa, status: 'pago' })).body.dados.total, 0);
  assert.equal((await consulta({ ...nossa, valor_campo: 'bruto', valor_de: '100', valor_ate: '100' })).body.dados.total, 1);
  assert.equal((await consulta({ ...nossa, parceiro: 'Parceiro Adv' })).body.dados.total, 1);
  assert.equal((await consulta({ ...nossa, num_processo: '9999999' })).body.dados.total, 0);
  // recebida muda o status na consulta
  assert.equal((await api().put(`/api/financeiro/parcela/${parcela}/multa/receber`).send({ recebido_em: '2032-04-11', recebimento_forma_id: F.formaAmbos, recebimento_conta_financeira_id: F.contaBanco })).status, 200);
  assert.equal((await consulta({ ...nossa, status: 'pago' })).body.dados.total, 1);

  const x = await api().get(`/api/financeiro/consulta/exportar?${new URLSearchParams(nossa)}`).buffer(true).parse(binario);
  assert.equal(x.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.body);
  const ws = wb.getWorksheet('Financeiro');
  const l = ws.getRow(2).values.slice(1);
  assert.match(l[3], /^Multa — Acordo \d+$/);
  assert.deepEqual([l[6], l[7], l[8], l[9], l[11]], [100, 30, 70, 15, 'Recebida']);
  assert.equal(ws.rowCount, 3);                                           // cabeçalho + 1 multa + totais
});

test('consulta/exportar: avulso aparece como "Avulso N" no Excel', async () => {
  await sql('DELETE FROM acordo');
  await novoAvulso({ parcelas: 1, valor: 250, primeira: '2033-02-10' });
  const q = new URLSearchParams({ venc_de: '2033-01-01', venc_ate: '2033-12-31', origem: 'avulso' });
  const x = await api().get(`/api/financeiro/consulta/exportar?${q}`).buffer(true).parse(binario);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.body);
  const l = wb.getWorksheet('Financeiro').getRow(2).values.slice(1);
  assert.match(l[3], /^Avulso \d+$/);
  assert.deepEqual([l[6], l[7], l[8]], [250, 250, 0]);
  assert.equal((await api(semPermissao).get('/api/financeiro/consulta?origem=multa')).status, 403);
});

// ------------------------------------------------------------------ Relatórios
const rodar = (corpo, t = admin) => api(t).post('/api/relatorios/executar').send(corpo);
const filtro = (campo, operador, valor = null) => ({ op: 'E', itens: [{ campo, operador, valor }] });

test('relatórios: parcelas ganham a origem "Recebimento avulso" e o assunto "multas por atraso" lista as multas do escritório', async () => {
  await sql('DELETE FROM acordo');
  const av = await novoAvulso({ parcelas: 2, valor: 1000, primeira: '2034-01-10' });
  const a1 = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 500, qtd_parcelas: 1, data_primeira: '2024-01-10',
    parcelas: [{ numero: 1, vencimento: '2024-01-10', valor_bruto: 500, honor_tipo: 'percent', honor_percentual: 20 }] });
  const parcela = (await um('SELECT id FROM acordo_parcela WHERE acordo_id = ?', [a1.body.dados.id])).id;
  await api().post(`/api/financeiro/parcela/${parcela}/multa`).send({ percentual_juiz: 10, valor_bruto: 50, vencimento: '2024-02-10', repasse_cliente_habilitado: true });
  // segunda multa, com vencimento no futuro: não é "vencida"
  const a2 = await api().post('/api/financeiro/processo/1/acordo').send({ valor_total: 100, qtd_parcelas: 1, data_primeira: '2099-01-10',
    parcelas: [{ numero: 1, vencimento: '2099-01-10', valor_bruto: 100, honor_tipo: 'sem' }] });
  const parcela2 = (await um('SELECT id FROM acordo_parcela WHERE acordo_id = ?', [a2.body.dados.id])).id;
  await api().post(`/api/financeiro/parcela/${parcela2}/multa`).send({ percentual_juiz: 5, valor_bruto: 5, vencimento: '2099-02-10' });

  const catalogo = (await api().get('/api/relatorios/catalogo')).body.dados.assuntos;
  const parcCat = catalogo.find(a => a.chave === 'financeiro_parcelas');
  assert.deepEqual(parcCat.campos.find(c => c.chave === 'tipo_origem').opcoes.map(o => o.valor), ['acordo', 'alvara', 'avulso']);
  assert.ok(catalogo.some(a => a.chave === 'financeiro_multas'));

  const r = await rodar({ receita: { assunto: 'financeiro_parcelas', colunas: ['origem', 'parcela', 'valor_bruto', 'valor_liquido'], filtros: filtro('tipo_origem', 'em', ['avulso']), ordem: [{ campo: 'vencimento', direcao: 'asc' }] }, limite: 50 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.dados.linhas.map(l => [l.origem, l.valor_bruto, l.valor_liquido]), [['Avulso 1', 500, 0], ['Avulso 1', 500, 0]]);
  assert.equal(av.parcelas.length, 2);

  const m = await rodar({ receita: { assunto: 'financeiro_multas', colunas: ['pasta', 'origem', 'parcela', 'vencimento', 'valor_bruto', 'valor_liquido', 'status', 'vencida'], filtros: { op: 'E', itens: [] }, ordem: [{ campo: 'vencimento', direcao: 'asc' }] }, limite: 50 });
  assert.equal(m.status, 200, JSON.stringify(m.body));
  assert.equal(m.body.dados.total, 2);
  const [linha, futura] = m.body.dados.linhas;
  assert.deepEqual([linha.origem, linha.valor_bruto, linha.valor_liquido, linha.status, linha.vencida], ['Acordo 1', 50, 40, 'Pendente', true]);
  assert.deepEqual([futura.valor_bruto, futura.vencida], [5, false]);

  // agrupar e somar por status: o total bate com a tabela
  const g = await rodar({ receita: { assunto: 'financeiro_multas', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor_bruto' }] } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.deepEqual(g.body.dados.linhas.find(l => l.tipo === 'total').valores.map(Number), [2, 55]);

  // permissão do Financeiro vale para o assunto novo
  assert.equal((await rodar({ receita: { assunto: 'financeiro_multas', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [] } }, semPermissao)).status, 403);
});
