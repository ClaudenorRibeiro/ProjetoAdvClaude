// Aviso diário de andamentos do DataJud — A CONSULTA NOTURNA (e o botão "Atualizar DataJud", que usa o mesmo caminho de gravação).
// Contra MySQL real isolado e um CNJ FALSO local: quais processos são pedidos, lotes, tentativas, tribunal que recusa, resposta
// grande demais, primeira leitura só como base, novidades, corte de 6 meses, não encontrado e a fila.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { iniciarCnjFalso, numeroCnj, comMascara, diasAtras, movimento, esperaFalsa } = require('../support/cnjFalso');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { consultarDataJud } = require('../../src/andamentosDatajud/consultaNoturna');
const { enfileirarConsultaNoturna, aguardarFila } = require('../../src/andamentosDatajud/fila');

let app; let admin; let cnj;
const token = jwt.sign({ id: 1, nome: 'Teste', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];

let seqPasta = 7000;
async function novoProcesso(numero, { status = 1, ativo = 1, pasta = null } = {}) {
  const pastaId = pasta || (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [seqPasta += 1])).insertId;
  return (await sql(
    'INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, status_id, ativo, criado_por) VALUES (?, ?, ?, ?, ?, 1)',
    [pastaId, numero, `PROCESSO ${numero}`, status, ativo]
  )).insertId;
}
const andamentosDe = (id) => sql("SELECT descricao, DATE_FORMAT(data,'%Y-%m-%d') AS dia, novidade_em, avisado_em FROM andamento_processual WHERE processo_id = ? AND fonte = 'datajud' ORDER BY data, id", [id]);
const processo = (id) => um("SELECT datajud_atualizado_cnj, datajud_qtd_movimentos, DATE_FORMAT(datajud_ultima_movimentacao,'%Y-%m-%d') AS ultima, datajud_nao_encontrado_em, datajud_sincronizado_em FROM tblproc WHERE id = ?", [id]);
const rodar = (extra = {}) => consultarDataJud({ esperar: esperaFalsa(), pausaEntreLotesMs: 0, ...extra });

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token;
  cnj = await iniciarCnjFalso();
  await sql('UPDATE tblproc SET ativo = 0');   // o processo semeado pelo banco de teste não entra nas contas destes testes
  await sql("INSERT INTO tblstatusproc (id, nome, encerra_processo, ativo, criado_por) VALUES (2, 'Arquivado', 1, 1, 1)");
});
test.after(async () => { await cnj.fechar(); await pool.end(); });

test.beforeEach(async () => {
  cnj.estado.chamadas.length = 0;
  cnj.estado.processos.clear();
  cnj.estado.status = () => 200;
  cnj.estado.grandeSeMaisDe = null;
  await sql('DELETE FROM andamento_processual');
  await sql('DELETE FROM datajud_tipos_andamento');
  await sql('DELETE FROM tblproc');
  await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'datajud'");
  await sql("INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes) VALUES ('datajud', 1, ?)", [JSON.stringify({ url: cnj.url, apikey: 'chave-do-teste' })]);
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'nenhum'");
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'sino' WHERE id = 2");
});

test('não consulta o CNJ se o DataJud está desligado ou se ninguém quer receber o aviso', async () => {
  await novoProcesso(comMascara(numeroCnj(1)));
  await sql("UPDATE configuracoes_integracoes SET ativo = 0 WHERE modulo = 'datajud'");
  assert.equal(await rodar(), null);
  await sql("UPDATE configuracoes_integracoes SET ativo = 1 WHERE modulo = 'datajud'");
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'nenhum'");
  assert.equal(await rodar(), null);
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'sino', ativo = 0 WHERE id = 2");     // quem recebe precisa estar ativo
  assert.equal(await rodar(), null);
  await sql('UPDATE usuarios SET ativo = 1 WHERE id = 2');
  assert.equal(cnj.estado.chamadas.length, 0, 'nada foi pedido ao CNJ');
});

test('pede só os processos certos: ativos, que não encerram, de tribunal coberto, ainda não consultados hoje', async () => {
  const bom = numeroCnj(11);
  const ontem = numeroCnj(12);
  const naoAchadoHa8 = numeroCnj(13);
  const aprontar = async (n, extra) => { const id = await novoProcesso(comMascara(n), extra); return id; };
  await aprontar(bom);
  const idOntem = await aprontar(ontem);
  await sql("UPDATE tblproc SET datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?", [idOntem]);
  const idOito = await aprontar(naoAchadoHa8);
  await sql('UPDATE tblproc SET datajud_nao_encontrado_em = DATE_SUB(CURDATE(), INTERVAL 8 DAY), datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id = ?', [idOito]);
  // os que NÃO entram:
  await aprontar(numeroCnj(14), { status: 2 });                                  // arquivado (encerra)
  await aprontar(numeroCnj(15), { ativo: 0 });                                   // inativo
  await novoProcesso(null);                                                       // sem número
  await aprontar(numeroCnj(16, '3', '00'));                                       // tribunal superior: não coberto
  const hoje = await aprontar(numeroCnj(17));
  await sql('UPDATE tblproc SET datajud_sincronizado_em = NOW() WHERE id = ?', [hoje]);   // já consultado hoje
  const achouOntem = await aprontar(numeroCnj(18));
  await sql('UPDATE tblproc SET datajud_nao_encontrado_em = DATE_SUB(CURDATE(), INTERVAL 3 DAY), datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id = ?', [achouOntem]);   // não achado há 3 dias: espera a semana
  const r = await rodar();
  assert.equal(r.processos, 3);
  assert.deepEqual(cnj.estado.chamadas.flatMap((c) => c.numeros).sort(), [bom, ontem, naoAchadoHa8].sort());
  assert.ok(cnj.estado.chamadas.every((c) => c.auth === 'APIKey chave-do-teste'), 'usa a chave do escritório');
});

test('o mesmo número em duas pastas (apenso) é pedido UMA vez e vale para as duas linhas', async () => {
  const n = numeroCnj(21);
  const a = await novoProcesso(comMascara(n));
  const b = await novoProcesso(comMascara(n));
  cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição', diasAtras(5))], atualizado: '2026-10-01T10:00:00.000Z' });
  const r = await rodar();
  assert.equal(r.processos, 2);
  assert.deepEqual(cnj.estado.chamadas.map((c) => c.numeros), [[n]]);
  assert.equal((await andamentosDe(a)).length, 1);
  assert.equal((await andamentosDe(b)).length, 1, 'cada linha tem o seu andamento');
});

test('primeira leitura é só a base (sem novidade); a noite seguinte grava só o que é novo e marca como novidade', async () => {
  const n = numeroCnj(31);
  const id = await novoProcesso(comMascara(n));
  cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição', diasAtras(40)), movimento(51, 'Conclusão', diasAtras(20))], atualizado: '2026-09-01T10:00:00.000Z' });
  let r = await rodar();
  assert.equal(r.novos, 0, 'primeira leitura não avisa');
  let lista = await andamentosDe(id);
  assert.equal(lista.length, 2);
  assert.ok(lista.every((a) => a.novidade_em === null));
  const p = await processo(id);
  assert.deepEqual({ qtd: p.datajud_qtd_movimentos, atual: p.datajud_atualizado_cnj, ultima: p.ultima }, { qtd: 2, atual: '2026-09-01T10:00:00.000Z', ultima: diasAtras(20) });

  // outra noite: um movimento novo
  await sql('UPDATE tblproc SET datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [id]);
  cnj.estado.processos.get(n).movimentos.push(movimento(67, 'Juntada de petição', diasAtras(1)));
  cnj.estado.processos.get(n).atualizado = '2026-10-23T10:00:00.000Z';
  r = await rodar();
  assert.equal(r.novos, 1);
  lista = await andamentosDe(id);
  assert.equal(lista.length, 3);
  assert.deepEqual(lista.map((a) => a.novidade_em !== null), [false, false, true]);
  assert.equal((await processo(id)).ultima, diasAtras(1));
  assert.equal((await um('SELECT quantidade FROM datajud_tipos_andamento WHERE codigo = 67')).quantidade, 1);

  // mais uma noite SEM mudança no CNJ: nada é regravado
  await sql('UPDATE tblproc SET datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [id]);
  const antes = await sql('SELECT COUNT(*) AS n FROM andamento_processual');
  r = await rodar();
  assert.equal(r.novos, 0);
  assert.deepEqual(await sql('SELECT COUNT(*) AS n FROM andamento_processual'), antes);
});

test('o banco só guarda 6 meses de DataJud: movimento mais velho não entra, mas o dia do último movimento fica no processo', async () => {
  const n = numeroCnj(41);
  const id = await novoProcesso(comMascara(n));
  cnj.estado.processos.set(n, { movimentos: [
    movimento(26, 'Distribuição muito antiga', diasAtras(400)),
    movimento(51, 'Conclusão antiga', diasAtras(200)),
    movimento(67, 'Juntada recente', diasAtras(30)),
  ], atualizado: '2026-09-20T10:00:00.000Z' });
  await rodar();
  const lista = await andamentosDe(id);
  assert.deepEqual(lista.map((a) => a.descricao), ['Juntada recente']);
  assert.equal((await processo(id)).ultima, diasAtras(30));
  // um processo que só tem movimentos antigos: nenhum andamento, mas o dia do último fica guardado
  const m = numeroCnj(42);
  const outro = await novoProcesso(comMascara(m));
  cnj.estado.processos.set(m, { movimentos: [movimento(26, 'Só antigo', diasAtras(300))], atualizado: '2025-12-01T10:00:00.000Z' });
  await rodar();
  assert.equal((await andamentosDe(outro)).length, 0);
  assert.equal((await processo(outro)).ultima, diasAtras(300));
});

test('lotes pequenos, um de cada vez, com pausa entre eles', async () => {
  const numeros = [51, 52, 53, 54, 55].map((i) => numeroCnj(i));
  for (const n of numeros) await novoProcesso(comMascara(n));
  const espera = esperaFalsa();
  const r = await consultarDataJud({ esperar: espera, tamanhoDoLote: 2 });
  assert.equal(r.processos, 5);
  assert.deepEqual(cnj.estado.chamadas.map((c) => c.numeros.length), [2, 2, 1]);
  assert.equal(espera.pedidos.filter((ms) => ms === 2000).length, 3, 'uma pausa de 2 s depois de cada lote');
});

test('o CNJ recusa (429): espera 1 minuto e tenta de novo, até 3 vezes; aquele tribunal fica para a noite seguinte e os outros seguem', async () => {
  const sp = numeroCnj(61, '8', '26');
  const trt = numeroCnj(62, '5', '15');
  const idSp = await novoProcesso(comMascara(sp));
  for (const i of [63, 64, 65]) await novoProcesso(comMascara(numeroCnj(i)));        // mais lotes do mesmo tribunal: nenhum é pedido depois da recusa
  const idTrt = await novoProcesso(comMascara(trt));
  cnj.estado.processos.set(trt, { movimentos: [movimento(26, 'Distribuição', diasAtras(3))], atualizado: '2026-10-20T10:00:00.000Z' });
  cnj.estado.status = (c) => (c.alias === 'api_publica_tjsp' ? 429 : 200);
  const espera = esperaFalsa();
  const r = await consultarDataJud({ esperar: espera, pausaEntreLotesMs: 0, tamanhoDoLote: 2 });
  assert.equal(cnj.estado.chamadas.filter((c) => c.alias === 'api_publica_tjsp').length, 3, 'três tentativas no primeiro lote e nenhum lote seguinte');
  assert.deepEqual(espera.pedidos.filter((ms) => ms === 60000), [60000, 60000]);
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0], /api_publica_tjsp.*HTTP 429/);
  assert.equal((await processo(idSp)).datajud_sincronizado_em, null, 'não marca o dia: tenta de novo na próxima noite');
  assert.equal((await andamentosDe(idTrt)).length, 1, 'o outro tribunal foi gravado');
});

test('chave recusada (401) não insiste: uma tentativa só', async () => {
  await novoProcesso(comMascara(numeroCnj(71)));
  cnj.estado.status = () => 401;
  const espera = esperaFalsa();
  const r = await consultarDataJud({ esperar: espera, pausaEntreLotesMs: 0 });
  assert.equal(cnj.estado.chamadas.length, 1);
  assert.deepEqual(espera.pedidos, []);
  assert.match(r.falhas[0], /HTTP 401/);
});

test('resposta grande demais: o lote é dividido ao meio até caber', async () => {
  const numeros = [81, 82, 83, 84].map((i) => numeroCnj(i));
  const ids = [];
  for (const n of numeros) ids.push(await novoProcesso(comMascara(n)));
  for (const n of numeros) cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição', diasAtras(2))], atualizado: '2026-10-22T10:00:00.000Z' });
  cnj.estado.grandeSeMaisDe = 1;       // só aceita pedido de UM processo
  const r = await rodar();
  assert.equal(r.falhas.length, 0, JSON.stringify(r.falhas));
  for (const id of ids) assert.equal((await andamentosDe(id)).length, 1);
  assert.deepEqual(cnj.estado.chamadas.map((c) => c.numeros.length), [4, 2, 1, 1, 2, 1, 1]);
});

test('o CNJ não ter o processo marca o dia; só volta a pedir depois de 7 dias', async () => {
  const n = numeroCnj(91);
  const id = await novoProcesso(comMascara(n));
  let r = await rodar();
  assert.equal(r.naoEncontrados, 1);
  assert.notEqual((await processo(id)).datajud_nao_encontrado_em, null);
  cnj.estado.chamadas.length = 0;
  await sql('UPDATE tblproc SET datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id = ?', [id]);   // dias depois: ainda espera
  r = await rodar();
  assert.equal(cnj.estado.chamadas.length, 0);
  await sql('UPDATE tblproc SET datajud_nao_encontrado_em = DATE_SUB(CURDATE(), INTERVAL 8 DAY), datajud_sincronizado_em = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id = ?', [id]);
  cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição', diasAtras(1))], atualizado: '2026-10-23T10:00:00.000Z' });
  r = await rodar();
  assert.equal(cnj.estado.chamadas.length, 1);
  assert.equal((await processo(id)).datajud_nao_encontrado_em, null, 'achou: a marca some');
  assert.equal((await andamentosDe(id)).length, 1);
});

test('a fila não deixa a consulta entrar duas vezes, e a consulta anda sozinha', async () => {
  const n = numeroCnj(95);
  const id = await novoProcesso(comMascara(n));
  cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição', diasAtras(1))], atualizado: '2026-10-23T10:00:00.000Z' });
  const opcoes = { esperar: esperaFalsa(), pausaEntreLotesMs: 0 };
  assert.equal(enfileirarConsultaNoturna(opcoes), true);
  assert.equal(enfileirarConsultaNoturna(opcoes), false, 'já está na fila');
  await aguardarFila();
  assert.equal(cnj.estado.chamadas.length, 1);
  assert.equal((await processo(id)).datajud_qtd_movimentos, 1);
  assert.equal(enfileirarConsultaNoturna(opcoes), true, 'depois de terminar, pode entrar de novo');
  await aguardarFila();
});

test('o botão "Atualizar DataJud" usa o mesmo caminho: base na primeira vez, novidade depois, e respeita os 6 meses', async () => {
  const n = numeroCnj(97);
  const id = await novoProcesso(comMascara(n));
  cnj.estado.processos.set(n, { movimentos: [movimento(26, 'Distribuição antiga', diasAtras(300)), movimento(51, 'Conclusão', diasAtras(10))], atualizado: '2026-10-14T10:00:00.000Z' });
  const botao = (corpo = { forcar: true }) => request(app).post(`/api/andamento/${id}/sincronizar`).set('Authorization', `Bearer ${admin}`).send(corpo);
  let r = await botao();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dados.datajud.tipo, 'ok');
  let lista = await andamentosDe(id);
  assert.deepEqual(lista.map((a) => [a.descricao, a.novidade_em]), [['Conclusão', null]]);
  cnj.estado.processos.get(n).movimentos.push(movimento(67, 'Juntada', diasAtras(1)));
  cnj.estado.processos.get(n).atualizado = '2026-10-23T10:00:00.000Z';
  r = await botao();
  assert.equal(r.body.dados.novos, 1);
  lista = await andamentosDe(id);
  assert.deepEqual(lista.map((a) => [a.descricao, a.novidade_em !== null]), [['Conclusão', false], ['Juntada', true]]);
  // o CNJ não ter o processo: a resposta é "vazio" e o dia fica marcado
  cnj.estado.processos.delete(n);
  r = await botao();
  assert.equal(r.body.dados.datajud.tipo, 'vazio');
  assert.notEqual((await processo(id)).datajud_nao_encontrado_em, null);
});
