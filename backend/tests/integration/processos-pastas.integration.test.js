// Plano de testes de Processos — passo A2 (ver PLANO-TESTES-PROCESSOS.md).
// Servidor, contra MySQL real isolado: listar pastas (busca, filtros, etiquetas, paginação), buscar uma pasta
// completa e renumerar (conflitos, histórico, corrida entre duas renumerações).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin; let usuario;
const F = {};
const P = {};   // processos/pastas criados no preparo

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
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const listar = (qs = '', t = admin) => api(t).get(`/api/processos/pastas?limite=100${qs ? '&' + qs : ''}`);
const numeros = (r) => r.body.dados.registros.map(x => Number(x.numPasta));
const buscar = async (termo, t = admin) => numeros(await listar(`busca=${encodeURIComponent(termo)}`, t));

async function novoProc(numPasta, extra = {}) {
  const r = await api().post('/api/processos').send({
    numPasta, NomeTituloProc: `PROCESSO ${numPasta}`, tipo_id: 1, status_id: 1, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autorPF }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reuPJ }], ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario');
  F.autorPF = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Mariana Autora Silva', '52998224725')")).insertId;
  F.reuPF = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Roberto Réu Santos', '11144477735')")).insertId;
  F.reuPJ = (await sql("INSERT INTO pessoas_juridicas (razao_social, nome_fantasia, cnpj) VALUES ('Comércio Zeta Ltda', 'Zeta Lojas', '11222333000181')")).insertId;
  F.autorPJ = (await sql("INSERT INTO pessoas_juridicas (razao_social, nome_fantasia, cnpj) VALUES ('Indústria Ômega SA', 'Ômega Fábrica', '44555666000199')")).insertId;
  await sql("INSERT INTO telefones_pf (pessoa_id, numero) VALUES (?, '11988887777')", [F.autorPF]);
  await sql("INSERT INTO telefones_pf (pessoa_id, numero) VALUES (?, '21977776666')", [F.reuPF]);
  await sql("INSERT INTO telefones_pj (pessoa_id, numero) VALUES (?, '1133334444')", [F.reuPJ]);
  await sql("INSERT INTO telefones_pj (pessoa_id, numero) VALUES (?, '1144445555')", [F.autorPJ]);
  F.tipo2 = (await sql("INSERT INTO tbltipoproc (nome, codTipoProc, ativo) VALUES ('Administrativo', 'A', 1)")).insertId;
  F.status2 = (await sql("INSERT INTO tblstatusproc (nome, ativo) VALUES ('Suspenso', 1)")).insertId;
  F.assunto1 = (await sql("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Horas extras', 1)")).insertId;
  F.assunto2 = (await sql("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Indenização', 1)")).insertId;
  F.assuntoInativo = (await sql("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto desativado', 0)")).insertId;
  F.forum = (await sql("INSERT INTO tblforum (nome, cidade, uf, ativo) VALUES ('Fórum Central', 'Campinas', 'SP', 1)")).insertId;
  F.vara = (await sql("INSERT INTO tblvara (forum_id, nome, abrev_nome, ativo) VALUES (?, '1ª Vara do Trabalho', '1ª VT', 1)", [F.forum])).insertId;
  F.freela = (await sql("INSERT INTO advogados_freela (nome, oab) VALUES ('Advogado Avulso', 'SP 123456')")).insertId;

  // Pasta 10: processo trabalhista (autor PF x réu PJ), assuntos (um ativo e um desativado), OABs, perito, vara.
  P.a = await novoProc(10, { NomeTituloProc: 'ALFA CAUSA TRABALHISTA', numProc: '1111111-11.2026.5.15.0011', protocolo: 'PROT-ALFA',
    vara_id: F.vara, responsavel_id: 2, assuntos: [F.assunto1, F.assuntoInativo],
    oabs: [{ tipo: 'usuario', id: 2 }, { tipo: 'freela', id: F.freela }], peritos: [{ tipo_pessoa: 'fisica', pessoa_id: F.reuPF }] });
  // Pasta 20: dois processos (tipos diferentes, mesmo status).
  P.b = await novoProc(20, { NomeTituloProc: 'BETA CAUSA CIVEL', numProc: '2222222-22.2026.5.15.0022', tipo_id: F.tipo2, status_id: F.status2,
    autores: [{ tipo_pessoa: 'juridica', pessoa_id: F.autorPJ }], reus: [{ tipo_pessoa: 'fisica', pessoa_id: F.reuPF }], assuntos: [F.assunto2], cliente_polo: 'reu' });
  P.c = await novoProc(20, { NomeTituloProc: 'BETA RECURSO', numProc: '2222223-22.2026.5.15.0023', protocolo: 'PROT-BETA', tipo_id: 1, status_id: F.status2,
    pasta_existente_confirmada: true });   // segundo processo na mesma pasta: o usuário confirmou
  // Pasta 30: só processo INATIVO (a pasta não aparece).
  P.d = await novoProc(30, { NomeTituloProc: 'GAMA INATIVA', numProc: '3333333-33.2026.5.15.0033' });
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [P.d.id]);
  // Pasta 42: com valor em parcela de acordo e em lançamento da conta corrente.
  P.e = await novoProc(42, { NomeTituloProc: 'DELTA COM DINHEIRO', numProc: '4444444-44.2026.5.15.0044' });
  const acordo = (await sql("INSERT INTO acordo (processo_id, valor_total, qtd_parcelas, data_primeira) VALUES (?, 1234.56, 1, '2026-01-05')", [P.e.id])).insertId;
  await sql("INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto) VALUES (?, 1, '2026-01-05', 1234.56)", [acordo]);
  await sql("INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, usuario_id) VALUES (?, '2026-01-05', 'lançamento', 'entrada', 777.77, 1)", [P.e.id]);
  // Etiquetas: pessoais (cada usuário vê só a dele) e do escritório (por processo).
  await sql('INSERT INTO pastas_etiquetas (pasta_id, usuario_id, slot) VALUES (?, 1, 1)', [P.a.pastaId]);
  await sql('INSERT INTO pastas_etiquetas (pasta_id, usuario_id, slot) VALUES (?, 2, 4)', [P.b.pastaId]);
  await sql('INSERT INTO processos_etiquetas_escritorio (processo_id, slot) VALUES (?, 2)', [P.e.id]);
  await sql('INSERT INTO processos_etiquetas_escritorio (processo_id, slot) VALUES (?, 3)', [P.b.id]);
});
test.after(async () => pool.end());

// ------------------------------------------------------------------ listar
test('listar: só pastas com processo ativo, da maior para a menor, com o resumo de cada uma', async () => {
  const r = await listar();
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.dados).sort(), ['registros', 'total']);
  assert.deepEqual(numeros(r), [99001, 42, 20, 10]);                      // a 30 (só inativo) não aparece
  assert.equal(r.body.dados.total, 4);
  const p10 = r.body.dados.registros.find(x => Number(x.numPasta) === 10);
  assert.deepEqual({ t: p10.titulo_proc, n: p10.num_proc, prot: p10.protocolo, tipo: p10.tipo_nome, st: p10.status_nome, qtd: Number(p10.total_processos) },
    { t: 'ALFA CAUSA TRABALHISTA', n: '1111111-11.2026.5.15.0011', prot: 'PROT-ALFA', tipo: 'Judicial', st: 'Ativo', qtd: 1 });
  const p20 = r.body.dados.registros.find(x => Number(x.numPasta) === 20);
  assert.equal(p20.titulo_proc, 'BETA RECURSO');                          // o processo mais recente da pasta
  assert.equal(Number(p20.total_processos), 2);
  assert.equal(p20.tipo_nome, null);                                      // tipos diferentes → não mostra
  assert.equal(p20.status_nome, 'Suspenso');                              // mesmo status → mostra
  assert.ok(p10.criado_em && p10.id);
});

test('listar: pasta com os processos só inativados some; ao reativar volta (e a vazia nunca aparece)', async () => {
  const vazia = (await sql("INSERT INTO tblpasta (numPasta, criado_por) VALUES (7777, 1)")).insertId;
  assert.ok(!(await buscar('')).includes(7777), `pasta vazia ${vazia} apareceu`);
  assert.ok(!(await buscar('GAMA')).includes(30));
  await sql('UPDATE tblproc SET ativo = 1 WHERE id = ?', [P.d.id]);
  assert.deepEqual(await buscar('GAMA'), [30]);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [P.d.id]);
});

test('listar: paginação (limite, página, total) e valores inválidos viram o padrão, nunca erro', async () => {
  const todas = [99001, 42, 20, 10];
  const p1 = await api().get('/api/processos/pastas?limite=2&pagina=1');
  assert.deepEqual(numeros(p1), todas.slice(0, 2)); assert.equal(p1.body.dados.total, 4);
  assert.deepEqual(numeros(await api().get('/api/processos/pastas?limite=2&pagina=2')), todas.slice(2));
  assert.deepEqual(numeros(await api().get('/api/processos/pastas?limite=2&pagina=3')), []);          // além do fim
  assert.equal((await api().get('/api/processos/pastas')).body.dados.registros.length, 4);              // padrão 20
  for (const qs of ['limite=0', 'limite=abc', 'limite=-5', 'pagina=0', 'pagina=-1', 'pagina=abc', 'limite=1000', 'pagina=1.5', 'limite=2&pagina=', 'pagina=99999999999999999999', 'limite=99999999999999999999']) {
    const r = await api().get(`/api/processos/pastas?${qs}`);
    assert.equal(r.status, 200, `${qs} → ${r.status} ${JSON.stringify(r.body)}`);
    if (!qs.includes('99999999999999999999') || qs.startsWith('limite')) assert.ok(r.body.dados.registros.length >= 1, qs);   // página gigante: lista vazia é o certo
  }
});

// ------------------------------------------------------------------ busca
test('busca: número da pasta, título, número do processo e protocolo', async () => {
  assert.deepEqual(await buscar('42'), [42]);
  assert.deepEqual(await buscar('0042'), [42]);                            // com os zeros
  assert.deepEqual(await buscar('99001'), [99001]);
  assert.deepEqual(await buscar('ALFA'), [10]);
  assert.deepEqual(await buscar('alfa causa'), [10]);                      // sem diferenciar maiúscula
  assert.deepEqual(await buscar('BETA'), [20]);
  assert.deepEqual(await buscar('2222223-22'), [20]);                      // número do processo (parte)
  assert.deepEqual(await buscar('PROT-ALFA'), [10]);
  assert.deepEqual(await buscar('PROT-BETA'), [20]);
  assert.deepEqual(await buscar('texto que não existe em lugar nenhum'), []);
  assert.equal((await listar('busca=ALFA')).body.dados.total, 1);          // total acompanha o filtro
});

test('busca: nome, CPF/CNPJ (com ou sem pontuação) e telefone de autores e réus, físicos e jurídicos', async () => {
  // a autora Mariana e a ré Zeta estão nos processos das pastas 10, 20 e 42 (os que o preparo criou com as partes padrão)
  assert.deepEqual(await buscar('Mariana'), [42, 20, 10]);                 // autor PF
  assert.deepEqual(await buscar('529.982.247-25'), [42, 20, 10]);          // CPF formatado
  assert.deepEqual(await buscar('52998224725'), [42, 20, 10]);
  assert.deepEqual(await buscar('(11) 98888-7777'), [42, 20, 10]);         // telefone formatado
  assert.deepEqual(await buscar('Zeta'), [42, 20, 10]);                    // réu PJ (razão social)
  assert.deepEqual(await buscar('Zeta Lojas'), [42, 20, 10]);              // nome fantasia
  assert.deepEqual(await buscar('11.222.333/0001-81'), [42, 20, 10]);      // CNPJ formatado
  assert.deepEqual(await buscar('1133334444'), [42, 20, 10]);              // telefone PJ
  assert.deepEqual(await buscar('Ômega'), [20]);                           // autor PJ
  assert.deepEqual(await buscar('44.555.666/0001-99'), [20]);
  assert.deepEqual(await buscar('Roberto'), [20]);                         // réu PF só na pasta 20 (na 10 ele é perito, que não entra na busca)
  assert.deepEqual(await buscar('21977776666'), [20]);
});

test('busca: valor em dinheiro exato (parcela de acordo e lançamento); só com vírgula; outro valor não acha', async () => {
  assert.deepEqual(await buscar('1.234,56'), [42]);                        // parcela do acordo
  assert.deepEqual(await buscar('1234,56'), [42]);
  assert.deepEqual(await buscar('777,77'), [42]);                          // lançamento da conta corrente
  assert.deepEqual(await buscar('999,00'), []);
  assert.deepEqual(await buscar('1234.56'), []);                           // sem vírgula não é valor (e não é número de pasta/CNJ)
});

test('busca: só conta processo ATIVO; o processo inativo não faz a pasta aparecer pelo título dele', async () => {
  assert.deepEqual(await buscar('GAMA INATIVA'), []);
  assert.deepEqual(await buscar('3333333-33'), []);
  assert.deepEqual(await buscar('0030'), []);                              // nem pelo número da pasta (pasta sem processo ativo)
});

test('busca: curingas % e _ são procurados como texto, não como "qualquer coisa"', async () => {
  assert.deepEqual(await buscar('%'), [], 'o curinga % trouxe tudo');
  assert.deepEqual(await buscar('%%'), [], 'o curinga %% trouxe tudo');
  assert.deepEqual(await buscar('_'), [], 'o curinga _ trouxe tudo');
  assert.deepEqual(await buscar('AL_A'), [], 'o curinga _ casou uma letra qualquer (ALFA)');
  assert.deepEqual(await buscar('A%A'), [], 'o curinga % casou qualquer trecho');
});

// ------------------------------------------------------------------ filtros
test('filtros: assunto (só ativos, lista com lixo), pastas com financeiro e combinação de filtros', async () => {
  assert.deepEqual(numeros(await listar(`assuntos=${F.assunto1}`)), [10]);
  assert.deepEqual(numeros(await listar(`assuntos=${F.assunto2}`)), [20]);
  assert.deepEqual(numeros(await listar(`assuntos=${F.assunto1},${F.assunto2}`)).sort((a, b) => a - b), [10, 20]);   // qualquer um dos dois
  assert.deepEqual(numeros(await listar(`assuntos=${F.assuntoInativo}`)), []);                    // assunto desativado não filtra
  assert.deepEqual(numeros(await listar(`assuntos=abc,-1,0,,${F.assunto2}`)), [20]);              // lixo ignorado
  assert.equal((await listar('assuntos=abc')).body.dados.total, 4);                                // só lixo = sem filtro
  assert.deepEqual(numeros(await listar('apenasComFinanceiro=1')), [42]);
  assert.deepEqual(numeros(await listar('apenasComFinanceiro=true')), [42]);
  assert.equal((await listar('apenasComFinanceiro=0')).body.dados.total, 4);
  assert.deepEqual(numeros(await listar(`busca=${encodeURIComponent('Ômega')}&assuntos=${F.assunto1}`)), []);   // E, não OU
  assert.deepEqual(numeros(await listar(`busca=${encodeURIComponent('Ômega')}&assuntos=${F.assunto2}`)), [20]);
  assert.deepEqual(numeros(await listar(`busca=Mariana&assuntos=${F.assunto1}`)), [10]);
});

test('filtros: etiqueta pessoal é de cada usuário; etiqueta do escritório só quando TODOS os processos da pasta têm a mesma', async () => {
  const pessoal = (r) => Object.fromEntries(r.body.dados.registros.map(x => [Number(x.numPasta), x.etiqueta_pessoal]));
  assert.deepEqual(numeros(await listar('etiqueta=1')), [10]);                       // o admin marcou a pasta 10
  assert.deepEqual(numeros(await listar('etiqueta=4')), []);                         // a 4 é do usuário 2, não do admin
  assert.deepEqual(numeros(await listar('etiqueta=4', usuario)), [20]);
  assert.deepEqual(numeros(await listar('etiqueta=1', usuario)), []);
  assert.equal(pessoal(await listar())[10], 1); assert.equal(pessoal(await listar())[20], null);
  assert.equal(pessoal(await listar('', usuario))[20], 4); assert.equal(pessoal(await listar('', usuario))[10], null);
  assert.equal((await listar('etiqueta=9')).body.dados.total, 4);                    // slot inválido = sem filtro
  assert.equal((await listar('etiqueta=0')).body.dados.total, 4);
  // escritório: pasta 42 tem um processo com a etiqueta 2 → derivada 2; pasta 20 tem 2 processos e só um marcado → nenhuma
  const esc = (r) => Object.fromEntries(r.body.dados.registros.map(x => [Number(x.numPasta), x.etiqueta_escritorio]));
  assert.equal(esc(await listar())[42], 2); assert.equal(esc(await listar())[20], null);
  assert.deepEqual(numeros(await listar('etiquetaEscritorio=2')), [42]);
  assert.deepEqual(numeros(await listar('etiquetaEscritorio=3')), []);
  await sql('INSERT INTO processos_etiquetas_escritorio (processo_id, slot) VALUES (?, 3)', [P.c.id]);   // agora os 2 da pasta 20 têm a 3
  assert.deepEqual(numeros(await listar('etiquetaEscritorio=3')), [20]);
  assert.equal(esc(await listar())[20], 3);
  await sql('UPDATE processos_etiquetas_escritorio SET slot = 5 WHERE processo_id = ?', [P.c.id]);        // mistura de etiquetas → nenhuma
  assert.deepEqual(numeros(await listar('etiquetaEscritorio=3')), []);
  assert.equal(esc(await listar())[20], null);
  await sql('DELETE FROM processos_etiquetas_escritorio WHERE processo_id = ?', [P.c.id]);
});

// ------------------------------------------------------------------ buscar uma pasta
test('buscar pasta: processos ativos com partes, peritos, assuntos ativos, OABs, vara, fórum, responsável e etiqueta', async () => {
  const r = await api().get(`/api/processos/pastas/${P.a.pastaId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.dados;
  assert.equal(Number(d.numPasta), 10); assert.equal(d.processos.length, 1);
  const p = d.processos[0];
  assert.deepEqual({ t: p.NomeTituloProc, vara: p.vara_nome, forum: p.forum_nome, cidade: p.forum_cidade, uf: p.forum_uf, tipo: p.tipo_nome, st: p.status_nome, resp: p.responsavel_nome },
    { t: 'ALFA CAUSA TRABALHISTA', vara: '1ª Vara do Trabalho', forum: 'Fórum Central', cidade: 'Campinas', uf: 'SP', tipo: 'Judicial', st: 'Ativo', resp: 'Usuário de Testes' });
  assert.deepEqual(p.autores.map(a => [a.tipo_pessoa, a.nome]), [['fisica', 'Mariana Autora Silva']]);
  assert.deepEqual(p.reus.map(a => [a.tipo_pessoa, a.nome]), [['juridica', 'Comércio Zeta Ltda']]);
  assert.deepEqual(p.peritos.map(a => a.nome), ['Roberto Réu Santos']);
  assert.deepEqual(p.assuntos.map(a => a.nome), ['Horas extras']);                 // o assunto desativado não aparece
  assert.deepEqual(p.oabs.map(o => [o.tipo, o.nome]).sort(), [['freela', 'Advogado Avulso'], ['usuario', 'Usuário de Testes']]);
  assert.equal(p.oabs.find(o => o.tipo === 'freela').oab, 'SP 123456');
  // pasta com 2 processos: o mais novo primeiro; processo inativo não vem
  const b = (await api().get(`/api/processos/pastas/${P.b.pastaId}`)).body.dados;
  assert.deepEqual(b.processos.map(x => x.NomeTituloProc), ['BETA RECURSO', 'BETA CAUSA CIVEL']);
  assert.equal(b.processos[1].etiqueta_escritorio, 3);
  assert.deepEqual(b.processos[1].autores.map(a => a.nome), ['Indústria Ômega SA']);
  assert.equal(b.processos[1].reus[0].nome, 'Roberto Réu Santos');
  const dInativa = (await api().get(`/api/processos/pastas/${P.d.pastaId}`)).body.dados;
  assert.deepEqual(dInativa.processos, []);                                         // pasta existe, sem processo ativo
});

test('buscar pasta: inexistente e id inválido dão 404; sem login 401', async () => {
  assert.equal((await api().get('/api/processos/pastas/999999')).status, 404);
  assert.equal((await api().get('/api/processos/pastas/abc')).status, 404);
  assert.equal((await request(app).get(`/api/processos/pastas/${P.a.pastaId}`)).status, 401);
});

// ------------------------------------------------------------------ renumerar
test('renumerar: troca o número, libera o antigo, registra a auditoria e a busca acompanha', async () => {
  const { pastaId } = await novoProc(55);
  const r = await api().put(`/api/processos/pastas/${pastaId}/renumerar`).send({ numPasta: 56 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dados.numPasta, 56);
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [pastaId])).numPasta, 56);
  assert.equal((await sql("SELECT * FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'renumerar' AND registro_id = ?", [pastaId])).length, 1);
  assert.deepEqual(await buscar('PROCESSO 55'), [56]);                               // o título tem 55, a pasta agora é 56
  assert.ok(!(await buscar('0055')).includes(55));                                    // o número antigo não existe mais
  assert.equal((await api().get('/api/processos/pastas/checar?numPasta=55')).body.dados.emUso, false);
  // número de 5 dígitos ou mais é aceito (e a busca acha o número inteiro)
  assert.equal((await api().put(`/api/processos/pastas/${pastaId}/renumerar`).send({ numPasta: 12345 })).status, 200);
  assert.deepEqual(await buscar('12345'), [12345]);
  assert.equal((await api().put(`/api/processos/pastas/${pastaId}/renumerar`).send({ numPasta: '77' })).status, 200);   // texto numérico
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [pastaId])).numPasta, 77);
});

test('renumerar: recusa número igual ao atual, em uso (com processo ativo), inválido e pasta inexistente', async () => {
  const a = await novoProc(60); const b = await novoProc(61);
  const put = (id, numPasta) => api().put(`/api/processos/pastas/${id}/renumerar`).send({ numPasta });
  const igual = await put(a.pastaId, 60);
  assert.equal(igual.status, 400); assert.match(msg(igual), /já possui este número/);
  const emUso = await put(a.pastaId, 61);
  assert.equal(emUso.status, 400); assert.match(msg(emUso), /O número 0061 já pertence a outra pasta/);
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [a.pastaId])).numPasta, 60);   // nada mudou
  for (const ruim of [0, -3, '', 'abc', null, undefined]) {
    const r = await put(a.pastaId, ruim);
    assert.equal(r.status, 400, `numPasta=${JSON.stringify(ruim)} → ${r.status}`); assert.match(msg(r), /Número de pasta inválido/);
  }
  assert.equal((await put(999999, 9999)).status, 404);
  assert.equal((await put('abc', 9999)).status, 404);
  assert.equal(await total('SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = ? AND registro_id = ?', ['tblpasta', a.pastaId]), 0);   // recusa não deixa histórico
});

test('renumerar: número de pasta TOTALMENTE vazia é reaproveitado (a vazia sai, etiqueta junto, auditoria); com algo preso nela é recusado com o motivo e nada muda', async () => {
  const put = (id, numPasta) => api().put(`/api/processos/pastas/${id}/renumerar`).send({ numPasta });
  const pasta = (num, area = null) => sql('INSERT INTO tblpasta (numPasta, area_direito, criado_por) VALUES (?, ?, 1)', [num, area]).then(r => r.insertId);
  const a = await novoProc(130);

  // 1) totalmente vazia (com etiqueta pessoal): libera o número
  const vazia = await pasta(131);
  await sql('INSERT INTO pastas_etiquetas (pasta_id, usuario_id, slot) VALUES (?, 1, 1)', [vazia]);
  const ok = await put(a.pastaId, 131);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [a.pastaId])).numPasta, 131);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE id = ?', [vazia]), 0, 'a pasta vazia não saiu');
  assert.equal(await total('SELECT COUNT(*) AS n FROM pastas_etiquetas WHERE pasta_id = ?', [vazia]), 0, 'sobrou etiqueta da pasta vazia');
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 131'), 1);
  assert.equal(await total("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'excluir' AND registro_id = ?", [vazia]), 1, 'a remoção da vazia não deixou auditoria');
  assert.equal(await total("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'renumerar' AND registro_id = ?", [a.pastaId]), 1);
  // os processos da pasta renumerada seguem com ela
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ?', [a.pastaId]), 1);

  // 2) vazia de processos ativos mas com algo preso: recusa, diz o motivo, e a pasta continua
  const comArea = await pasta(132, 'Trabalhista');
  const r1 = await put(a.pastaId, 132);
  assert.equal(r1.status, 400); assert.match(msg(r1), /O número 0132 pertence a uma pasta sem processos ativos, mas ela tem a área do direito preenchida \(Trabalhista\)\. Escolha outro número\./);
  const comTarefa = await pasta(133);
  await sql("INSERT INTO tarefas (titulo, criado_por, pasta_id) VALUES ('Tarefa presa', 1, ?)", [comTarefa]);
  const r2 = await put(a.pastaId, 133);
  assert.equal(r2.status, 400); assert.match(msg(r2), /O número 0133 pertence a uma pasta sem processos ativos, mas ela tem 1 tarefa\(s\) ligada\(s\)\. Escolha outro número\./);
  const comInativo = await pasta(134);
  await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000134-00.2026.5.15.0001', 'INATIVO', 1, 1, 0, 1)", [comInativo]);
  const r3 = await put(a.pastaId, 134);
  assert.equal(r3.status, 400); assert.match(msg(r3), /O número 0134 pertence a uma pasta sem processos ativos, mas ela ainda guarda 1 processo\(s\) inativado\(s\)\. Escolha outro número\./);
  const espacos = await pasta(135, '   ');                                  // área só com espaços = vazia
  assert.equal((await put(a.pastaId, 135)).status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE id = ?', [espacos]), 0);
  // nada foi apagado nos casos recusados
  for (const idp of [comArea, comTarefa, comInativo]) assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE id = ?', [idp]), 1, `a pasta ${idp} foi apagada indevidamente`);
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [a.pastaId])).numPasta, 135);                // as recusas não mudaram a pasta
  assert.equal(await total("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'excluir' AND registro_id IN (?, ?, ?)", [comArea, comTarefa, comInativo]), 0);
});

test('renumerar: pasta vazia e criação de processo no MESMO número ao mesmo tempo — ou o processo entra na pasta ou a troca vence, nunca os dois e nunca erro interno', async () => {
  const a = await novoProc(140);
  await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (141, 1)');
  const dados = { numPasta: 141, NomeTituloProc: 'CORRIDA VAZIA', tipo_id: 1, status_id: 1, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autorPF }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reuPJ }] };
  const respostas = await Promise.all([
    api().put(`/api/processos/pastas/${a.pastaId}/renumerar`).send({ numPasta: 141 }),
    api().post('/api/processos').send(dados),
  ]);
  assert.ok(respostas.every(r => r.status < 500), JSON.stringify(respostas.map(r => [r.status, r.body.mensagem])));
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 141'), 1, 'duas pastas com o mesmo número');
  // se o processo novo entrou na pasta 141 (antes da troca), a troca foi recusada; se a troca venceu, o processo criou a pasta 141 nova (a velha saiu)
  const trocou = respostas[0].status === 200;
  const pastaDo141 = await um('SELECT id FROM tblpasta WHERE numPasta = 141');
  if (trocou) assert.equal(pastaDo141.id, a.pastaId, 'a troca venceu mas a pasta 141 não é a renumerada');
  else assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ?', [pastaDo141.id]), 1);
});

test('renumerar: número com letras, decimal ou notação científica NÃO é aceito como se fosse outro número', async () => {
  const { pastaId } = await novoProc(70);
  for (const ruim of ['12abc', '12.7', '1e3', '0x10', 12.7, '9999999999']) {
    const r = await api().put(`/api/processos/pastas/${pastaId}/renumerar`).send({ numPasta: ruim });
    assert.equal(r.status, 400, `numPasta=${JSON.stringify(ruim)} foi aceito → ${r.status}`);
    assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [pastaId])).numPasta, 70, `${JSON.stringify(ruim)} mudou a pasta`);
  }
  // espaços nas pontas são ignorados
  assert.equal((await api().put(`/api/processos/pastas/${pastaId}/renumerar`).send({ numPasta: ' 15 ' })).status, 200);
  assert.equal((await um('SELECT numPasta FROM tblpasta WHERE id = ?', [pastaId])).numPasta, 15);
});

test('renumerar: duas renumerações ao mesmo tempo para o MESMO número — só uma vence, a outra recebe aviso (não erro interno)', async () => {
  const a = await novoProc(80); const b = await novoProc(81);
  const respostas = await Promise.all([
    api().put(`/api/processos/pastas/${a.pastaId}/renumerar`).send({ numPasta: 90 }),
    api().put(`/api/processos/pastas/${b.pastaId}/renumerar`).send({ numPasta: 90 }),
  ]);
  const status = respostas.map(r => r.status).sort();
  assert.deepEqual(status, [200, 400], `respostas: ${JSON.stringify(respostas.map(r => [r.status, r.body.mensagem]))}`);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 90'), 1);
});

test('criar: dois usuários pegam o MESMO número de pasta ao mesmo tempo — só um fica com ela; o outro recebe aviso para escolher outra', async () => {
  const dados = (n) => ({ numPasta: 95, NomeTituloProc: `CORRIDA ${n}`, tipo_id: 1, status_id: 1, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autorPF }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reuPJ }] });
  const respostas = await Promise.all([api().post('/api/processos').send(dados(1)), api().post('/api/processos').send(dados(2))]);
  assert.deepEqual(respostas.map(r => r.status).sort(), [201, 409], JSON.stringify(respostas.map(r => [r.status, r.body.mensagem])));
  const perdeu = respostas.find(r => r.status === 409);
  assert.match(msg(perdeu), /pasta.*já está em uso.*Escolha outro número/i);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 95'), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = (SELECT id FROM tblpasta WHERE numPasta = 95)'), 1);   // só o vencedor gravou
});

test('criar: pasta que já tem processo ativo exige a confirmação do usuário; com ela entra na mesma pasta; pasta vazia dispensa', async () => {
  const dados = (n, extra = {}) => ({ numPasta: 96, NomeTituloProc: `PASTA EM USO ${n}`, tipo_id: 1, status_id: 1, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autorPF }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reuPJ }], ...extra });
  const primeiro = await api().post('/api/processos').send(dados(1));
  assert.equal(primeiro.status, 201);
  const semConfirmar = await api().post('/api/processos').send(dados(2));
  assert.equal(semConfirmar.status, 409);
  assert.match(msg(semConfirmar), /A pasta nº 0096 já está em uso\. Escolha outro número de pasta\./);
  for (const falso of ['true', 1, 'sim', null]) {                                             // só o booleano true vale
    assert.equal((await api().post('/api/processos').send(dados(2, { pasta_existente_confirmada: falso }))).status, 409, JSON.stringify(falso));
  }
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ?', [primeiro.body.dados.pasta_id]), 1);   // nada gravado nas recusas
  const confirmado = await api().post('/api/processos').send(dados(3, { pasta_existente_confirmada: true }));
  assert.equal(confirmado.status, 201);
  assert.equal(confirmado.body.dados.pasta_id, primeiro.body.dados.pasta_id);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ?', [primeiro.body.dados.pasta_id]), 2);
  // a confirmação não atrapalha pasta nova nem pasta vazia
  assert.equal((await api().post('/api/processos').send(dados(4, { numPasta: 97, pasta_existente_confirmada: true }))).status, 201);
  await sql('UPDATE tblproc SET ativo = 0 WHERE pasta_id = ?', [primeiro.body.dados.pasta_id]);                              // pasta ficou vazia
  assert.equal((await api().post('/api/processos').send(dados(5))).status, 201);                                             // vazia: qualquer um pega, sem confirmar
  // pasta escolhida pelo id (criar dentro de uma pasta aberta na tela) continua funcionando sem confirmação
  assert.equal((await api().post('/api/processos').send(dados(6, { numPasta: undefined, pasta_id: primeiro.body.dados.pasta_id }))).status, 201);
});
