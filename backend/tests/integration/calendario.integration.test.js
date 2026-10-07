// Teste de servidor do CALENDÁRIO: dias úteis, feriados e o cálculo de prazos. Um erro aqui calcula prazo errado — e prazo errado só aparece quando vence.
// Os valores esperados foram contados À MÃO no calendário de 2026/2027 (março/2026 começa num domingo), não copiados do código:
//   mar/2026: seg 2, sex 6, sáb 7, seg 9, ter 10 | abr/2026: qui 2, sex 3 (Sexta-feira Santa), seg 6, seg 20, ter 21 (Tiradentes), qua 22, qui 23
//   dez/2026: qua 30, qui 31 | jan/2027: sex 1, seg 4, ter 5
// Regra do sistema (lida no código e confirmada pelo teste): a data de início conta como dia 1 SE for dia útil; senão a contagem começa no próximo dia útil.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const cal = require('../../src/services/calendarioService');

let app; let admin; let comum;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (p, t = admin) => request(app).get(p).set('Authorization', `Bearer ${t}`);
const post = (p, t = admin) => request(app).post(p).set('Authorization', `Bearer ${t}`);
const del = (p, t = admin) => request(app).delete(p).set('Authorization', `Bearer ${t}`);
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const diaUtilNoBanco = async (data) => (await sql('SELECT dia_util FROM calendario WHERE data = ?', [data]))[0]?.dia_util;
// cria o feriado pela API (o caminho que o administrador usa) e devolve o id
async function feriado(data, descricao = 'Feriado de teste', tipo) {
  const r = await post('/api/configuracoes/feriados').send({ data, descricao, ...(tipo ? { tipo } : {}) });
  assert.equal(r.status, 201, `criar feriado ${data}: ${JSON.stringify(r.body)}`);
  return (await sql('SELECT id FROM feriados WHERE data = ? ORDER BY id DESC LIMIT 1', [data]))[0].id;
}
async function limparFeriados() {
  await sql('DELETE FROM feriados');
  await sql(`UPDATE calendario SET dia_util = IF(DAYOFWEEK(data) IN (1, 7), 0, 1) WHERE data >= '2026-03-01'`);
}
const venc = async (inicio, qtd, tipo) => (await get(`/api/prazos/calcular?data_inicio=${inicio}&quantidade=${qtd}&tipo_dias=${tipo}`)).body.dados?.data_final;

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  comum = token(2, 2, 'sessao-usuario');
  // Calendário completo de 01/03/2026 a 31/12/2027: sábado e domingo não são úteis, o resto é.
  const linhas = [];
  for (let d = new Date(Date.UTC(2026, 2, 1)); d <= new Date(Date.UTC(2027, 11, 31)); d.setUTCDate(d.getUTCDate() + 1)) {
    const semana = d.getUTCDay();
    linhas.push([d.toISOString().slice(0, 10), semana === 0 || semana === 6 ? 0 : 1]);
  }
  const conn = await conectarBancoTeste();
  try { await conn.query('INSERT INTO calendario (data, dia_util) VALUES ? ON DUPLICATE KEY UPDATE dia_util = VALUES(dia_util)', [linhas]); } finally { await conn.end(); }
});
test.after(async () => {
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ============================================================ prazo em DIAS ÚTEIS
test('dias úteis: a data de início conta como dia 1 quando é útil; fim de semana é pulado; início em dia não útil começa no próximo útil', async () => {
  assert.equal(await venc('2026-03-02', 5, 'uteis'), '2026-03-06');      // seg → sex
  assert.equal(await venc('2026-03-06', 3, 'uteis'), '2026-03-10');      // sex(1) seg(2) ter(3)
  assert.equal(await venc('2026-03-02', 1, 'uteis'), '2026-03-02');      // 1 dia útil = o próprio dia
  assert.equal(await venc('2026-03-07', 1, 'uteis'), '2026-03-09');      // sábado não conta: começa na segunda
  assert.equal(await venc('2026-03-08', 2, 'uteis'), '2026-03-10');      // domingo: seg(1) ter(2)
  assert.equal(await venc('2026-03-02', 10, 'uteis'), '2026-03-13');     // 2 semanas inteiras
  assert.equal(await venc('2026-03-02', 11, 'uteis'), '2026-03-16');
});

test('dias úteis com FERIADO cadastrado: o feriado é pulado, e depois de removido o cálculo volta ao normal', async () => {
  try {
    const sextaSanta = await feriado('2026-04-03', 'Sexta-feira Santa');
    await feriado('2026-04-21', 'Tiradentes');
    assert.equal(await diaUtilNoBanco('2026-04-03'), 0);
    assert.equal(await venc('2026-04-02', 2, 'uteis'), '2026-04-06');    // qui(1), sex feriado, seg(2)
    assert.equal(await venc('2026-04-20', 3, 'uteis'), '2026-04-23');    // seg(1), ter feriado, qua(2), qui(3)
    assert.equal(await venc('2026-04-03', 1, 'uteis'), '2026-04-06');    // começa NO feriado: vai para a segunda
    assert.equal(await venc('2026-04-02', 2, 'corridos'), '2026-04-03'); // corridos ignoram feriado
    const r = await del(`/api/configuracoes/feriados/${sextaSanta}`);
    assert.equal(r.status, 200);
    assert.equal(await diaUtilNoBanco('2026-04-03'), 1);                 // dia de semana volta a ser útil
    assert.equal(await venc('2026-04-02', 2, 'uteis'), '2026-04-03');
    assert.equal(await venc('2026-04-20', 3, 'uteis'), '2026-04-23');    // o outro feriado continua valendo
  } finally { await limparFeriados(); }
});

test('dias úteis atravessando a virada do ano com feriado no dia 1º', async () => {
  try {
    await feriado('2027-01-01', 'Confraternização Universal');
    assert.equal(await venc('2026-12-30', 4, 'uteis'), '2027-01-05');    // qua(1) qui(2) [sex feriado] seg(3) ter(4)
    assert.equal(await venc('2026-12-30', 2, 'uteis'), '2026-12-31');
  } finally { await limparFeriados(); }
});

test('dias CORRIDOS: o dia de início é o dia 1, e vale em virada de mês, de ano e de ano bissexto', async () => {
  assert.equal(await venc('2026-03-02', 10, 'corridos'), '2026-03-11');
  assert.equal(await venc('2026-03-02', 1, 'corridos'), '2026-03-02');
  assert.equal(await venc('2026-01-30', 3, 'corridos'), '2026-02-01');
  assert.equal(await venc('2028-02-27', 3, 'corridos'), '2028-02-29');   // 2028 é bissexto
  assert.equal(await venc('2027-02-27', 3, 'corridos'), '2027-03-01');   // 2027 não é
  assert.equal(await venc('2027-12-30', 5, 'corridos'), '2028-01-03');
  assert.equal(await venc('2026-03-07', 3, 'corridos'), '2026-03-09');   // corridos contam sábado e domingo
});

test('quantidade e calendário: faltando calendário avisa claro (422); quantidade negativa avisa; sem dados = 400', async () => {
  const sem = await get('/api/prazos/calcular?data_inicio=2027-12-20&quantidade=100&tipo_dias=uteis');
  assert.equal(sem.status, 422);
  assert.match(sem.body.mensagem, /dias úteis cadastrados/);
  const negativa = await get('/api/prazos/calcular?data_inicio=2026-03-02&quantidade=-3&tipo_dias=uteis');
  assert.equal(negativa.status, 422);
  assert.match(negativa.body.mensagem, /maior que zero/);
  assert.equal((await get('/api/prazos/calcular?data_inicio=2026-03-02&quantidade=3')).status, 400);
  assert.equal((await get('/api/prazos/calcular?quantidade=3&tipo_dias=uteis')).status, 400);
  assert.equal((await get('/api/prazos/calcular?data_inicio=2026-03-02&quantidade=99999999&tipo_dias=uteis')).status, 422);
  assert.equal((await get('/api/prazos/calcular?data_inicio=2026-03-02', T_semToken())).status, 401);
});
const T_semToken = () => 'token-invalido';

// ============================================================ cálculo INVERSO (data final → quantidade)
test('cálculo inverso: a quantidade calculada a partir da data final devolve exatamente a quantidade original (úteis, com feriados, qualquer dia de início)', async () => {
  try {
    await feriado('2026-04-03', 'Sexta-feira Santa');
    await feriado('2026-04-21', 'Tiradentes');
    await feriado('2026-05-01', 'Dia do Trabalho');
    const falhas = [];
    for (let dia = 0; dia < 62; dia += 1) {                              // todo dia de 01/03 a 01/05/2026, inclusive fins de semana e feriados
      const d = new Date(Date.UTC(2026, 2, 1 + dia)); const inicio = d.toISOString().slice(0, 10);
      for (const qtd of [1, 2, 3, 5, 10, 15, 20]) {
        const final = await cal.calcularVencimento(inicio, qtd, 'uteis');
        const volta = await cal.calcularQuantidade(inicio, final, 'uteis');
        if (volta !== qtd) falhas.push(`${inicio} +${qtd} úteis = ${final}, volta ${volta}`);
      }
    }
    assert.deepEqual(falhas, []);
    assert.equal((await get('/api/prazos/calcular-dias?data_inicio=2026-04-02&data_final=2026-04-06&tipo_dias=uteis')).body.dados.quantidade, 2);
    assert.equal((await get('/api/prazos/calcular-dias?data_inicio=2026-04-02&data_final=2026-04-06&tipo_dias=corridos')).body.dados.quantidade, 5);
    assert.equal((await get('/api/prazos/calcular-dias?data_inicio=2026-03-02&data_final=2026-03-02&tipo_dias=corridos')).body.dados.quantidade, 1);
    assert.equal((await get('/api/prazos/calcular-dias?data_inicio=2026-03-10&data_final=2026-03-02&tipo_dias=uteis')).body.dados.quantidade, null);   // final antes do início
    assert.equal((await get('/api/prazos/calcular-dias?data_inicio=2026-03-02&data_final=2026-03-06')).status, 400);
  } finally { await limparFeriados(); }
});

// ============================================================ funções do serviço
test('próximo dia útil, "N dias úteis antes" e dia útil: casos de fim de semana, feriado e fora do calendário', async () => {
  try {
    await feriado('2026-04-03', 'Sexta-feira Santa');
    assert.equal(await cal.ehDiaUtil('2026-03-02'), true);
    assert.equal(await cal.ehDiaUtil('2026-03-07'), false);
    assert.equal(await cal.ehDiaUtil('2026-04-03'), false);
    assert.equal(await cal.ehDiaUtil('2035-05-05'), false);              // fora do calendário: não é considerado útil
    assert.equal(await cal.proximoDiaUtil('2026-03-02'), '2026-03-02');  // já é útil: devolve ele mesmo
    assert.equal(await cal.proximoDiaUtil('2026-03-07'), '2026-03-09');  // sábado → segunda
    assert.equal(await cal.proximoDiaUtil('2026-04-03'), '2026-04-06');  // feriado de sexta + fim de semana → segunda
    assert.equal(await cal.proximoDiaUtil('2010-01-01'), '2010-01-01');  // fora do calendário: devolve a própria data
    assert.equal(await cal.diasUteisAntes('2026-03-09', 1), '2026-03-06');
    assert.equal(await cal.diasUteisAntes('2026-03-09', 3), '2026-03-04');
    assert.equal(await cal.diasUteisAntes('2026-04-06', 1), '2026-04-02');   // pula o feriado de sexta e o fim de semana
    assert.equal(await cal.diasUteisAntes('2026-03-07', 1), '2026-03-06');   // a data em si nunca entra
    assert.equal(await cal.diasUteisAntes('2026-01-05', 3), null);           // não há dias úteis suficientes antes
    assert.equal(await cal.contarDiasUteis('2026-03-02', '2026-03-09'), 5);  // início incluso, fim excluso: seg a sex
  } finally { await limparFeriados(); }
});

// ============================================================ rotas do calendário
test('"é dia útil?": diz o motivo (sábado, domingo ou o nome do feriado) e exige a data', async () => {
  try {
    await feriado('2026-04-21', 'Tiradentes');
    const util = await get('/api/calendario/dia-util?data=2026-03-02');
    assert.deepEqual(util.body.dados, { dia_util: true, descricao: null });
    assert.deepEqual((await get('/api/calendario/dia-util?data=2026-03-07')).body.dados, { dia_util: false, descricao: 'sábado' });
    assert.deepEqual((await get('/api/calendario/dia-util?data=2026-03-08')).body.dados, { dia_util: false, descricao: 'domingo' });
    assert.deepEqual((await get('/api/calendario/dia-util?data=2026-04-21')).body.dados, { dia_util: false, descricao: 'Tiradentes' });
    assert.equal((await get('/api/calendario/dia-util')).status, 400);
    assert.equal((await get('/api/calendario/dia-util?data=2026-03-02', 'invalido')).status, 401);
  } finally { await limparFeriados(); }
});

test('período em dias úteis (rota usada pelos prazos): começa no próximo dia útil, valida a data e a quantidade', async () => {
  try {
    await feriado('2026-04-03', 'Sexta-feira Santa');
    const a = await get('/api/calendario/periodo-util?data=2026-04-03&quantidade=2');
    assert.deepEqual(a.body.dados, { data_inicial: '2026-04-06', data_final: '2026-04-07' });
    const b = await get('/api/calendario/periodo-util?data=2026-03-07&quantidade=1');
    assert.deepEqual(b.body.dados, { data_inicial: '2026-03-09', data_final: '2026-03-09' });
    for (const ruim of ['data=2026-3-7&quantidade=2', 'data=abc&quantidade=2', 'quantidade=2', 'data=2026-03-02&quantidade=0', 'data=2026-03-02&quantidade=-1',
      'data=2026-03-02&quantidade=366', 'data=2026-03-02&quantidade=abc', 'data=2026-03-02&quantidade=1.5', 'data=2026-03-02']) {
      assert.equal((await get(`/api/calendario/periodo-util?${ruim}`)).status, 400, ruim);
    }
    assert.equal((await get('/api/calendario/periodo-util?data=2026-03-02&quantidade=365')).status, 200);
  } finally { await limparFeriados(); }
});

// ============================================================ feriados (cadastro)
test('feriados: só o administrador cadastra e remove; lista por ano; cadastrar marca o dia no calendário e remover devolve (dia de semana)', async () => {
  try {
    assert.equal((await post('/api/configuracoes/feriados', comum).send({ data: '2026-04-03', descricao: 'X' })).status, 403);
    assert.equal((await post('/api/configuracoes/feriados').send({ descricao: 'sem data' })).status, 400);
    assert.equal((await post('/api/configuracoes/feriados').send({ data: '2026-04-03' })).status, 400);
    const id = await feriado('2026-04-03', '  Sexta-feira Santa  ', 'nacional');
    const outro = await feriado('2027-04-02', 'Sexta-feira Santa 2027');
    const lista = (await get('/api/configuracoes/feriados')).body.dados;
    assert.deepEqual(lista.map(f => f.data.slice(0, 10)), ['2026-04-03', '2027-04-02']);
    assert.equal(lista[0].descricao, 'Sexta-feira Santa');                               // sem espaços nas pontas
    assert.equal(lista[0].tipo, 'nacional');
    assert.equal(lista[0].criado_por_nome, 'Administrador de Testes');
    assert.deepEqual((await get('/api/configuracoes/feriados?ano=2027')).body.dados.map(f => f.id), [outro]);
    assert.deepEqual((await get('/api/configuracoes/feriados?ano=2030')).body.dados, []);
    assert.equal((await del(`/api/configuracoes/feriados/${id}`, comum)).status, 403);
    assert.equal(await diaUtilNoBanco('2026-04-03'), 0);                                 // 403 não mexeu em nada
    assert.equal((await del(`/api/configuracoes/feriados/${id}`)).status, 200);
    assert.equal(await diaUtilNoBanco('2026-04-03'), 1);
    assert.equal((await del(`/api/configuracoes/feriados/${id}`)).status, 404);          // já removido
    assert.equal((await del('/api/configuracoes/feriados/999999')).status, 404);
    assert.equal((await del('/api/configuracoes/feriados/abc')).status, 404);
  } finally { await limparFeriados(); }
});

test('feriado que cai num sábado: remover NÃO transforma o sábado em dia útil', async () => {
  try {
    const id = await feriado('2026-03-07', 'Feriado num sábado');
    assert.equal(await diaUtilNoBanco('2026-03-07'), 0);
    assert.equal((await del(`/api/configuracoes/feriados/${id}`)).status, 200);
    assert.equal(await diaUtilNoBanco('2026-03-07'), 0);
    const dom = await feriado('2026-03-08', 'Feriado num domingo');
    assert.equal((await del(`/api/configuracoes/feriados/${dom}`)).status, 200);
    assert.equal(await diaUtilNoBanco('2026-03-08'), 0);
  } finally { await limparFeriados(); }
});

test('feriado cadastrado fora do período do calendário não quebra (e remover também não)', async () => {
  try {
    const id = await feriado('2040-01-01', 'Feriado distante');
    assert.equal(await diaUtilNoBanco('2040-01-01'), undefined);
    assert.equal((await del(`/api/configuracoes/feriados/${id}`)).status, 200);
  } finally { await limparFeriados(); }
});

// ----- Os 3 testes abaixo conferem comportamentos que, pela leitura do código, podem estar errados. Se reprovarem, é achado para combinar com o usuário.
test('DOIS feriados no mesmo dia: remover um deles NÃO pode transformar o dia em útil enquanto o outro ainda existe', async () => {
  try {
    const nacional = await feriado('2026-04-21', 'Tiradentes (nacional)');
    await feriado('2026-04-21', 'Tiradentes (cadastro repetido)');
    assert.equal(await diaUtilNoBanco('2026-04-21'), 0);
    assert.equal((await del(`/api/configuracoes/feriados/${nacional}`)).status, 200);
    assert.equal(await diaUtilNoBanco('2026-04-21'), 0, 'o dia voltou a ser útil mesmo com outro feriado cadastrado nele');
    assert.equal(await venc('2026-04-20', 2, 'uteis'), '2026-04-22');                    // seg(1), ter feriado, qua(2)
  } finally { await limparFeriados(); }
});

test('feriado com dado ruim (data que não existe, descrição que não é texto, textos longos demais) dá aviso 400, nunca "Erro interno"', async () => {
  const antes = (await sql('SELECT COUNT(*) AS n FROM feriados'))[0].n;
  const ruins = [{ data: 'abc', descricao: 'x' }, { data: '2026-13-45', descricao: 'x' }, { data: '2026-02-30', descricao: 'x' }, { data: 20260403, descricao: 'x' },
    { data: ['2026-04-03'], descricao: 'x' }, { data: '2026-04-03', descricao: 123 }, { data: '2026-04-03', descricao: ['a'] }, { data: '2026-04-03', descricao: 'x'.repeat(201) },
    { data: '2026-04-03', descricao: 'ok', tipo: 'x'.repeat(31) }, { data: '2026-04-03', descricao: '   ' }];
  const resultado = [];
  for (const corpo of ruins) {
    const r = await post('/api/configuracoes/feriados').send(corpo);
    if (r.status !== 400) resultado.push(`${JSON.stringify(corpo).slice(0, 70)} → ${r.status}`);
  }
  await limparFeriados();
  assert.deepEqual(resultado, [], 'estes casos não deram aviso 400');
  assert.equal((await sql('SELECT COUNT(*) AS n FROM feriados'))[0].n, antes);
});

test('"é dia útil?" com data que não é uma data não responde "feriado": avisa 400', async () => {
  for (const ruim of ['abc', '2026-13-45', '2026-02-30', '03/04/2026', '']) {
    const r = await get(`/api/calendario/dia-util?data=${encodeURIComponent(ruim)}`);
    assert.equal(r.status, 400, `data "${ruim}" → ${r.status} ${JSON.stringify(r.body)}`);
  }
});

// ============================================================ "Prazos de hoje"
test('prazos que vencem hoje: só os de hoje, que não estão concluídos/cancelados, e só os do usuário (ou sem responsável)', async () => {
  const [{ hoje, amanha }] = await sql("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d') AS amanha");
  const prazo = async (venc, status, delegado, descricao) => (await sql(
    `INSERT INTO prazos_processo (processo_id, descricao, data_inicio, data_vencimento, status, delegado_para, criado_por) VALUES (1, ?, ?, ?, ?, ?, 1)`,
    [descricao, hoje, venc, status, delegado])).insertId;
  const meu = await prazo(hoje, 'aberto', 1, 'hoje meu');
  const livre = await prazo(hoje, 'aberto', null, 'hoje sem responsável');
  await prazo(hoje, 'concluido', 1, 'hoje concluído');
  await prazo(hoje, 'cancelado', 1, 'hoje cancelado');
  await prazo(hoje, 'aberto', 2, 'hoje de outro usuário');
  await prazo(amanha, 'aberto', 1, 'amanhã');
  const r = await get('/api/prazos/hoje');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.dados.map(p => p.id).sort(), [meu, livre].sort());
  assert.equal(r.body.dados[0].processo_numero, '0000001-01.2026.5.15.0001');
  const doOutro = await get('/api/prazos/hoje', comum);
  assert.deepEqual(doOutro.body.dados.map(p => p.descricao).sort(), ['hoje de outro usuário', 'hoje sem responsável']);
  assert.equal((await get('/api/prazos/hoje', 'invalido')).status, 401);
});

// ============================================================ o prazo gravado usa o calendário
test('criar prazo só com a quantidade: o vencimento gravado respeita fim de semana e feriado; a data final digitada manda; sem calendário avisa', async () => {
  try {
    await feriado('2026-04-03', 'Sexta-feira Santa');
    const criar = (corpo) => post('/api/prazos').send({ processo_id: 1, descricao: 'prazo do calendário', ...corpo });
    const a = await criar({ data_inicio: '2026-04-02', quantidade: 2, tipo_dias: 'uteis' });
    assert.equal(a.status, 201);
    assert.equal(a.body.dados.data_vencimento, '2026-04-06');
    assert.equal((await sql('SELECT DATE_FORMAT(data_vencimento, "%Y-%m-%d") AS v FROM prazos_processo WHERE id = ?', [a.body.dados.id]))[0].v, '2026-04-06');
    const b = await criar({ data_inicio: '2026-04-02', quantidade: 2, tipo_dias: 'corridos' });
    assert.equal(b.body.dados.data_vencimento, '2026-04-03');
    const c = await criar({ data_inicio: '2026-04-02', quantidade: 2, tipo_dias: 'uteis', data_final: '2026-04-30' });
    assert.equal(c.body.dados.data_vencimento, '2026-04-30');                              // a data final digitada é a que vale
    const d = await criar({ data_inicio: '2027-12-20', quantidade: 100, tipo_dias: 'uteis' });
    assert.equal(d.status, 422);
    assert.equal((await criar({ data_inicio: '2026-04-02' })).status, 400);
  } finally { await limparFeriados(); await sql("DELETE FROM prazos_processo WHERE descricao = 'prazo do calendário'"); }
});
