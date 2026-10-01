// Relatórios (Fase 3A) — assuntos Audiências e Perícias contra MySQL real.
// Cada número da API é conferido contra uma consulta escrita à mão (o "gabarito").
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
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };
const receita = (assunto, extra = {}) => ({ assunto, colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });
const rodar = (t, corpo) => req(t).post('/api/relatorios/executar').send(corpo);
const grupos = (r) => Object.fromEntries(r.body.dados.linhas.filter(l => l.tipo === 'grupo').map(l => [String(l.chaves[0]), l.valores[0]]));
const rotulos = (r) => r.body.dados.linhas.filter(l => l.tipo === 'grupo').map(l => l.rotulos[0]);

// data, hora, modalidade, status, tipo, responsável usuário, responsável freela, vara
const AUDIENCIAS = [
  ['2026-01-05', '09:00', 'presencial', 'agendada', 1, 2, null],
  ['2026-01-05', '10:00', 'virtual', 'realizada', 4, 2, null],
  ['2026-01-12', '09:00', 'presencial', 'remarcada', 1, null, 1],
  ['2026-02-02', '14:00', 'presencial', 'agendada', 1, 1, null],
  ['2026-02-03', '14:00', 'sem_comparecimento', 'cancelada', 2, null, null],
];
// data (pode ser nula), hora, status, tipo, perito, assistente usuário, assistente freela, resp. usuário, resp. freela, cidade
const PERICIAS = [
  ['2026-01-20', '10:00', 'agendada', 1, 1, 2, null, 2, null, 'São Paulo'],
  ['2026-01-25', '09:30', 'realizada', 1, 1, null, 1, null, 1, 'Campinas'],
  [null, null, 'aguardando_data', 2, null, null, null, null, null, null],
  ['2026-02-10', '08:00', 'cancelada', 2, null, null, null, 1, null, 'São Paulo'],
];

test.before(async () => {
  await recriarBancoTeste();
  await sql("INSERT INTO advogados_freela (id, nome, criado_por) VALUES (1, 'Freela Teste', 1)");
  await sql("INSERT INTO pessoas_fisicas (id, nome) VALUES (1, 'Perito Teste')");
  await sql("INSERT INTO tipo_pericia (id, nome, ativo) VALUES (1, 'Médica', 1), (2, 'Contábil', 1)");
  for (const [d, h, mod, st, tipo, ru, rf] of AUDIENCIAS) {
    await sql('INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, status, responsavel_id, responsavel_freela_id, criado_por) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)',
      [tipo, d, h, mod, st, ru, rf]);
  }
  const [a1, a2, , a4] = await sql('SELECT id FROM audiencia ORDER BY id');
  await sql('INSERT INTO ata_audiencia (audiencia_id, houve_acordo, valor_acordo, criado_por) VALUES (?, 1, 1000, 1), (?, 0, NULL, 1)', [a2.id, a4.id]);
  await sql('INSERT INTO audiencia_testemunhas (audiencia_id, pessoa_id, polo) VALUES (?, 1, ?)', [a1.id, 'autor']);
  for (const [d, h, st, tipo, perito, au, af, ru, rf, cidade] of PERICIAS) {
    await sql(`INSERT INTO pericia (processo_id, tipo_pericia_id, data, hora, status, perito_tipo, perito_id, assistente_tecnico_id,
               assistente_tecnico_freela_id, responsavel_id, responsavel_freela_id, cidade, criado_por) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [tipo, d, h, st, perito ? 'fisica' : null, perito, au, af, ru, rf, cidade]);
  }
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); semPermissao = token(3, 2, 'sessao-sem-permissao');
});
test.after(async () => pool.end());

test('catálogo: audiências e perícias aparecem só para quem tem permissão no módulo', async () => {
  const a = await req(admin).get('/api/relatorios/catalogo');
  const aud = a.body.dados.assuntos.find(x => x.chave === 'audiencias');
  const per = a.body.dados.assuntos.find(x => x.chave === 'pericias');
  assert.ok(aud && per);
  assert.deepEqual(aud.colunasPadrao.slice(0, 2), ['pasta', 'processo']);
  const resp = aud.campos.find(c => c.chave === 'responsavel');
  assert.ok(resp.opcoes.some(o => o.valor === 'u2') && resp.opcoes.some(o => o.valor === 'f1' && /freelancer/.test(o.rotulo)));
  assert.doesNotMatch(JSON.stringify(a.body), /ata_audiencia|a\.status|pe\.status|EXISTS/);   // nunca vaza SQL
  assert.equal((await req(usuario).get('/api/relatorios/catalogo')).status, 200);
  assert.equal((await rodar(semPermissao, { receita: receita('audiencias') })).status, 403);
  assert.equal((await rodar(semPermissao, { receita: receita('pericias') })).status, 403);
});

test('audiências: lista tudo (como a tela, sem "ver todos") e mostra a pasta formatada', async () => {
  for (const t of [admin, usuario]) {
    const r = await rodar(t, { receita: receita('audiencias', { colunas: ['pasta', 'tipo', 'hora', 'responsavel'], ordem: [{ campo: 'data', direcao: 'asc' }, { campo: 'hora', direcao: 'asc' }] }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.dados.total, 5);
  }
  const r = await rodar(admin, { receita: receita('audiencias', { colunas: ['pasta', 'tipo', 'hora', 'responsavel'], ordem: [{ campo: 'data', direcao: 'asc' }, { campo: 'hora', direcao: 'asc' }] }) });
  const l = r.body.dados.linhas;
  assert.equal(l[0].pasta, '99001');                         // 5 dígitos não são cortados
  assert.deepEqual(l.map(x => x.hora), ['09:00', '10:00', '09:00', '14:00', '14:00']);
  assert.deepEqual(l.map(x => x.responsavel), ['Usuário de Testes', 'Usuário de Testes', 'Freela Teste (freelancer)', 'Administrador de Testes', null]);
});

test('audiências: filtros por status, modalidade e responsável (usuário ou freelancer) batem com o gabarito', async () => {
  const total = async (itens) => (await rodar(admin, { receita: receita('audiencias', { filtros: { op: 'E', itens } }) })).body.dados.total;
  const gab = async (cond, p = []) => Number((await sql(`SELECT COUNT(*) n FROM audiencia a WHERE ${cond}`, p))[0].n);
  assert.equal(await total([{ campo: 'status', operador: 'em', valor: ['agendada'] }]), await gab("a.status = 'agendada'"));
  assert.equal(await total([{ campo: 'modalidade', operador: 'em', valor: ['virtual', 'sem_comparecimento'] }]), 2);
  assert.equal(await total([{ campo: 'responsavel', operador: 'em', valor: ['f1'] }]), await gab('a.responsavel_freela_id = 1'));
  assert.equal(await total([{ campo: 'responsavel', operador: 'em', valor: ['u2', 'u1'] }]), await gab('a.responsavel_id IN (1, 2)'));
  assert.equal(await total([{ campo: 'responsavel', operador: 'vazio', valor: null }]), 1);
  assert.equal(await total([{ campo: 'data', operador: 'entre', valor: ['2026-01-05', '2026-01-12'] }]), 3);
  assert.equal(await total([{ campo: 'hora', operador: 'igual', valor: '14:00' }]), 2);
  // "adiada" foi aposentado na tela: não é oferecido no filtro
  assert.equal((await rodar(admin, { receita: receita('audiencias', { filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: ['adiada'] }] } }) })).status, 422);
});

test('audiências: ata e testemunha (campos calculados) e soma do valor do acordo', async () => {
  const total = async (itens) => (await rodar(admin, { receita: receita('audiencias', { filtros: { op: 'E', itens } }) })).body.dados.total;
  assert.equal(await total([{ campo: 'tem_ata', operador: 'verdadeiro', valor: null }]), 2);
  assert.equal(await total([{ campo: 'tem_ata', operador: 'falso', valor: null }]), 3);
  assert.equal(await total([{ campo: 'houve_acordo', operador: 'verdadeiro', valor: null }]), 1);
  assert.equal(await total([{ campo: 'tem_testemunha', operador: 'verdadeiro', valor: null }]), 1);
  assert.equal(await total([{ campo: 'valor_acordo', operador: 'maior', valor: 500 }]), 1);

  const r = await rodar(admin, { receita: receita('audiencias', { agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor_acordo' }] }) });
  assert.equal(r.status, 200);
  const realizada = r.body.dados.linhas.find(l => l.tipo === 'grupo' && l.chaves[0] === 'realizada');
  assert.deepEqual(realizada.valores, [1, 1000]);
  assert.deepEqual(r.body.dados.linhas.find(l => l.tipo === 'total').valores, [5, 1000]);
});

test('audiências: agrupar por responsável mistura usuários e freelancers sem confundir ids iguais', async () => {
  const r = await rodar(admin, { receita: receita('audiencias', { agrupar: [{ campo: 'responsavel' }] }) });
  assert.equal(r.status, 200);
  assert.deepEqual(grupos(r), { u2: 2, u1: 1, f1: 1, null: 1 });  // usuário 1 e freelancer 1 NÃO se misturam
  assert.ok(rotulos(r).includes('Freela Teste (freelancer)') && rotulos(r).includes('(sem valor)'));
});

test('audiências: agrupar por mês e por tipo; detalhe do grupo abre os itens certos', async () => {
  const r = await rodar(admin, { receita: receita('audiencias', { agrupar: [{ campo: 'data', passo: 'mes' }, { campo: 'tipo' }] }) });
  assert.equal(r.status, 200);
  const gab = await sql("SELECT DATE_FORMAT(data, '%Y-%m') m, COUNT(*) n FROM audiencia GROUP BY m ORDER BY m");
  const sub = r.body.dados.linhas.filter(l => l.tipo === 'subtotal');
  assert.deepEqual(sub.map(s => s.valores[0]), gab.map(g => Number(g.n)));
  const detalhe = await rodar(admin, { receita: receita('audiencias', { agrupar: [{ campo: 'tipo' }] }), grupo: ['1'] });
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.body.dados.total, 3);          // tipo 1 = Julgamento
});

test('audiências: vara e fórum entram só quando pedidos (junções sob demanda)', async () => {
  const r = await rodar(admin, { receita: receita('audiencias', { colunas: ['pasta', 'vara', 'forum'] }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 5);                // LEFT JOIN: audiências sem vara continuam aparecendo
  assert.equal(r.body.dados.linhas[0].vara, null);
});

test('perícias: data vazia (aguardando data), status e agrupamento por mês com "(sem valor)"', async () => {
  const total = async (itens) => (await rodar(admin, { receita: receita('pericias', { filtros: { op: 'E', itens } }) })).body.dados.total;
  assert.equal(await total([]), 4);
  assert.equal(await total([{ campo: 'data', operador: 'vazio', valor: null }]), 1);
  assert.equal(await total([{ campo: 'status', operador: 'em', valor: ['aguardando_data'] }]), 1);

  const r = await rodar(admin, { receita: receita('pericias', { agrupar: [{ campo: 'data', passo: 'mes' }] }) });
  assert.equal(r.status, 200);
  const gab = await sql("SELECT DATE_FORMAT(data, '%Y-%m') m, COUNT(*) n FROM pericia GROUP BY m");
  assert.deepEqual(grupos(r), Object.fromEntries(gab.map(g => [String(g.m), Number(g.n)])));
  assert.equal(rotulos(r).at(-1), '(sem valor)');       // sem data fica sempre por último
});

test('perícias: perito, assistente técnico (usuário ou freelancer) e responsável', async () => {
  const r = await rodar(admin, { receita: receita('pericias', { colunas: ['tipo', 'perito', 'assistente', 'responsavel', 'cidade'], ordem: [{ campo: 'data', direcao: 'asc' }] }) });
  assert.equal(r.status, 200);
  const l = r.body.dados.linhas;
  // ordem crescente de data: a perícia "aguardando data" (sem data) vem primeiro, como na tela
  assert.deepEqual(l.map(x => x.perito), [null, 'Perito Teste', 'Perito Teste', null]);
  assert.deepEqual(l.map(x => x.assistente), [null, 'Usuário de Testes', 'Freela Teste (freelancer)', null]);
  assert.deepEqual(l.map(x => x.responsavel), [null, 'Usuário de Testes', 'Freela Teste (freelancer)', 'Administrador de Testes']);

  const porPerito = await rodar(admin, { receita: receita('pericias', { agrupar: [{ campo: 'perito' }] }) });
  assert.deepEqual(grupos(porPerito), { 'Perito Teste': 2, null: 2 });
  const porCidade = await rodar(admin, { receita: receita('pericias', { agrupar: [{ campo: 'cidade' }] }) });
  assert.deepEqual(grupos(porCidade), { 'São Paulo': 2, Campinas: 1, null: 1 });
});

test('perícias: perguntar ao abrir funciona também nos novos assuntos', async () => {
  const comPergunta = receita('pericias', { filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: null, perguntar: true }] } });
  assert.equal((await rodar(admin, { receita: comPergunta })).status, 422);                      // sem resposta: recusa
  const ok = await rodar(admin, { receita: comPergunta, parametros: [{ caminho: [0], valor: ['cancelada'] }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.dados.total, 1);
});

test('recusas: campo que não agrupa, campo de outro assunto e Excel de audiências', async () => {
  assert.equal((await rodar(admin, { receita: receita('audiencias', { agrupar: [{ campo: 'observacoes' }] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('audiencias', { colunas: ['perito'] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('pericias', { colunas: ['modalidade'] }) })).status, 422);

  const res = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send({ receita: receita('audiencias', { colunas: ['pasta', 'data', 'status', 'valor_acordo'] }), formato: 'xlsx', nome: 'Audiências' });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body);
  const ws = wb.getWorksheet(1);
  assert.equal(ws.rowCount, 1 + 5);
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Pasta', 'Data', 'Status', 'Valor do acordo (ata)']);
});
