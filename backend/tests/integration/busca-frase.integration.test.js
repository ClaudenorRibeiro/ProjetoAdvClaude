// Campo "Pesquisar" de Audiências, Perícias e Prazos (peça única backend/src/utils/buscaFrase.js).
// Contra MySQL real isolado: a FRASE inteira vale como um bloco, sem diferenciar acento e maiúscula, "%" e "_" são texto,
// busca inválida dá aviso (nunca erro interno), vale junto com os outros filtros e o total acompanha. Em Prazos, o número do
// processo digitado só com dígitos continua achando o gravado com máscara (comportamento do campo antigo).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin;
const F = {};
const emitir = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (caminho) => request(app).get(caminho).set('Authorization', `Bearer ${admin}`);
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const ids = (r) => (r.body.dados.registros || []).map(x => x.id).sort((a, b) => a - b);
const so = (...lista) => [...lista].sort((a, b) => a - b);

// Cada módulo tem a sua rota; o mesmo conjunto de checagens roda nas três.
const MODULOS = [
  { nome: 'audiencias', rota: '/api/audiencias' },
  { nome: 'pericias', rota: '/api/pericias' },
  { nome: 'prazos', rota: '/api/prazos' },
];
const buscar = (modulo, termo, extra = '') => get(`${modulo.rota}?busca=${encodeURIComponent(termo)}&limite=100${extra}`);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');

  // Duas pastas e dois processos: "A" com partes José (autor) e Owens Illinois (ré, empresa com fantasia), "B" com Maria e Banco Zeta.
  const pastaA = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (42, 1)')).insertId;
  const pastaB = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (9001, 1)')).insertId;
  const proc = async (pasta, numero, titulo) => (await sql(
    'INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, ?, 1, 1, 1, 1)', [pasta, numero, titulo])).insertId;
  F.procA = await proc(pastaA, '1111111-11.2026.5.15.0001', 'Título Alfa contra Beta');
  F.procB = await proc(pastaB, '2222222-22.2026.5.15.0002', 'Título Gama contra Delta');

  const pf = async (nome) => (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES (?, ?)", [nome, String(Math.floor(Math.random() * 1e11)).padStart(11, '0')])).insertId;
  const pj = async (razao, fantasia) => (await sql("INSERT INTO pessoas_juridicas (razao_social, nome_fantasia) VALUES (?, ?)", [razao, fantasia])).insertId;
  const jose = await pf('José da Silva Autor');
  const maria = await pf('Maria Souza Autora');
  const owens = await pj('Owens Illinois do Brasil Ltda', 'Vidros Cristal');
  const zeta = await pj('Banco Zeta S/A', 'Zeta Bank');
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'fisica', ?), (?, 'fisica', ?)", [F.procA, jose, F.procB, maria]);
  await sql("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'juridica', ?), (?, 'juridica', ?)", [F.procA, owens, F.procB, zeta]);

  const forum = (await sql("INSERT INTO tblforum (nome) VALUES ('Fórum Central Teste')")).insertId;
  const vara = (await sql("INSERT INTO tblvara (forum_id, nome) VALUES (?, '3ª Vara do Trabalho Busca')", [forum])).insertId;
  const tipoAud1 = (await sql("INSERT INTO tipo_audiencia (nome) VALUES ('Una Busca')")).insertId;
  const tipoAud2 = (await sql("INSERT INTO tipo_audiencia (nome) VALUES ('Julgamento Busca')")).insertId;
  const aud = async (proc, tipo, modalidade, dia, status = 'agendada', varaId = null) => (await sql(
    'INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id, status, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [proc, tipo, dia, '10:00:00', modalidade, varaId, status])).insertId;
  F.aud1 = await aud(F.procA, tipoAud1, 'virtual', '2099-03-02');
  F.aud2 = await aud(F.procB, tipoAud2, 'presencial', '2099-03-03', 'agendada', vara);
  F.aud3 = await aud(F.procA, tipoAud2, 'presencial', '2099-03-04', 'cancelada');

  const tipoPer1 = (await sql("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Médica Busca', 1)")).insertId;
  const tipoPer2 = (await sql("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Engenharia Busca', 1)")).insertId;
  const perito = await pf('Dr. João Peritus Médico');
  const per = async (proc, tipo, local, peritoId, status = 'agendada') => (await sql(
    "INSERT INTO pericia (processo_id, tipo_pericia_id, data, hora, local, perito_tipo, perito_id, status, criado_por) VALUES (?, ?, '2099-03-02', '10:00:00', ?, ?, ?, ?, 1)",
    [proc, tipo, local, peritoId ? 'fisica' : null, peritoId, status])).insertId;
  F.per1 = await per(F.procA, tipoPer1, 'Clínica São José Local', perito);
  F.per2 = await per(F.procB, tipoPer2, 'Canteiro de obras 100% concluído', null);
  F.per3 = await per(F.procA, tipoPer2, 'Escritório Central', null, 'cancelada');

  const tipoPrazo = (await sql("INSERT INTO tipo_prazo (nome) VALUES ('Recursal Busca')")).insertId;
  const sub1 = (await sql("INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, 'Embargos Busca')", [tipoPrazo])).insertId;
  const sub2 = (await sql("INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, 'Contestação Busca')", [tipoPrazo])).insertId;
  const prazo = async (proc, sub, descricao, dia) => (await sql(
    "INSERT INTO prazos_processo (processo_id, subtipo_id, descricao, data_inicio, data_vencimento, criado_por) VALUES (?, ?, ?, '2099-03-01', ?, 1)",
    [proc, sub, descricao, dia])).insertId;
  F.pz1 = await prazo(F.procA, sub1, 'Apresentar recurso ordinário', '2099-04-01');
  F.pz2 = await prazo(F.procB, sub2, 'Preparar defesa com 50% de desconto', '2099-04-02');
  F.pz3 = await prazo(F.procA, sub2, 'Manifestação sobre laudo', '2099-04-03');
});
test.after(async () => pool.end());

test('partes do processo (autor e réu, física e empresa, inclusive nome fantasia), sem diferenciar acento e maiúscula', async () => {
  const quais = {
    'José da Silva': { audiencias: so(F.aud1, F.aud3), pericias: so(F.per1, F.per3), prazos: so(F.pz1, F.pz3) },   // autor pessoa física do processo A
    'JOSE DA SILVA': { audiencias: so(F.aud1, F.aud3), pericias: so(F.per1, F.per3), prazos: so(F.pz1, F.pz3) },   // sem acento e em maiúsculas
    'owens': { audiencias: so(F.aud1, F.aud3), pericias: so(F.per1, F.per3), prazos: so(F.pz1, F.pz3) },          // réu empresa (razão social)
    'vidros cristal': { audiencias: so(F.aud1, F.aud3), pericias: so(F.per1, F.per3), prazos: so(F.pz1, F.pz3) },  // nome fantasia da empresa
    'Souza': { audiencias: so(F.aud2), pericias: so(F.per2), prazos: so(F.pz2) },                                  // autora do processo B
    'zeta bank': { audiencias: so(F.aud2), pericias: so(F.per2), prazos: so(F.pz2) },
  };
  const falhas = [];
  for (const m of MODULOS) {
    for (const [termo, esperado] of Object.entries(quais)) {
      const r = await buscar(m, termo);
      if (r.status !== 200) { falhas.push(`${m.nome} "${termo}": status ${r.status} ${JSON.stringify(r.body)}`); continue; }
      const obtido = ids(r);
      if (JSON.stringify(obtido) !== JSON.stringify(esperado[m.nome])) falhas.push(`${m.nome} "${termo}": esperado ${esperado[m.nome]} e veio ${obtido}`);
      if (Number(r.body.dados.total) !== esperado[m.nome].length) falhas.push(`${m.nome} "${termo}": total ${r.body.dados.total}`);
    }
  }
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('título, número do processo, número da pasta (com e sem zeros à esquerda)', async () => {
  const falhas = [];
  const casos = [
    ['Título Alfa', 'A'], ['gama contra', 'B'],
    ['1111111-11.2026', 'A'],           // número do processo como gravado
    ['0042', 'A'], ['42', 'A'], ['9001', 'B'],
  ];
  const doProc = (m, p) => (m.nome === 'audiencias' ? (p === 'A' ? so(F.aud1, F.aud3) : so(F.aud2))
    : m.nome === 'pericias' ? (p === 'A' ? so(F.per1, F.per3) : so(F.per2)) : (p === 'A' ? so(F.pz1, F.pz3) : so(F.pz2)));
  for (const m of MODULOS) {
    for (const [termo, p] of casos) {
      const obtido = ids(await buscar(m, termo));
      if (JSON.stringify(obtido) !== JSON.stringify(doProc(m, p))) falhas.push(`${m.nome} "${termo}": esperado processo ${p} (${doProc(m, p)}) e veio ${obtido}`);
    }
  }
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('campos próprios de cada tela: Audiências (tipo, modalidade, vara, fórum), Perícias (tipo, perito, local), Prazos (descrição, tipo, subtipo)', async () => {
  const falhas = [];
  const confere = async (modulo, termo, esperado) => {
    const obtido = ids(await buscar(modulo, termo));
    if (JSON.stringify(obtido) !== JSON.stringify(esperado)) falhas.push(`${modulo.nome} "${termo}": esperado ${esperado} e veio ${obtido}`);
  };
  const [aud, per, pzo] = MODULOS;
  await confere(aud, 'una busca', so(F.aud1));
  await confere(aud, 'JULGAMENTO', so(F.aud2, F.aud3));
  await confere(aud, 'virtual', so(F.aud1));
  await confere(aud, 'Presencial', so(F.aud2, F.aud3));
  await confere(aud, '3ª vara', so(F.aud2));
  await confere(aud, 'forum central', so(F.aud2));                       // sem acento acha "Fórum"
  await confere(per, 'médica busca', so(F.per1));
  await confere(per, 'medica', so(F.per1));                              // sem acento
  await confere(per, 'peritus', so(F.per1));                             // nome do perito
  await confere(per, 'são josé local', so(F.per1));                      // local, com acento
  await confere(per, 'sao jose local', so(F.per1));                      // local, sem acento
  await confere(pzo, 'recurso ordinário', so(F.pz1));
  await confere(pzo, 'recurso ordinario', so(F.pz1));
  await confere(pzo, 'embargos', so(F.pz1));                             // subtipo
  await confere(pzo, 'recursal', so(F.pz1, F.pz2, F.pz3));               // tipo do prazo
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('a frase vale INTEIRA como um bloco: "silva autor" acha, "autor silva" e "silva maria" não', async () => {
  const falhas = [];
  for (const m of MODULOS) {
    const inteiro = ids(await buscar(m, 'da Silva Autor'));
    const trocada = ids(await buscar(m, 'Autor Silva'));
    const duasPalavrasDeLugaresDiferentes = ids(await buscar(m, 'Silva Maria'));
    if (inteiro.length === 0) falhas.push(`${m.nome}: "da Silva Autor" não achou`);
    if (trocada.length !== 0) falhas.push(`${m.nome}: "Autor Silva" (ordem trocada) não devia achar nada e achou ${trocada}`);
    if (duasPalavrasDeLugaresDiferentes.length !== 0) falhas.push(`${m.nome}: "Silva Maria" não devia achar nada e achou ${duasPalavrasDeLugaresDiferentes}`);
  }
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('"%" e "_" são procurados como texto; sem resultado dá lista vazia e total 0', async () => {
  const falhas = [];
  for (const m of MODULOS) {
    const sem = await buscar(m, 'xyzinexistente');
    if (ids(sem).length !== 0 || Number(sem.body.dados.total) !== 0) falhas.push(`${m.nome}: busca sem resultado devia dar 0`);
    const tudoOuNada = ids(await buscar(m, '%'));
    if (m.nome === 'pericias') {
      if (JSON.stringify(tudoOuNada) !== JSON.stringify(so(F.per2))) falhas.push(`pericias "%": esperado só a do local "100% concluído" e veio ${tudoOuNada}`);
    } else if (m.nome === 'prazos') {
      if (JSON.stringify(tudoOuNada) !== JSON.stringify(so(F.pz2))) falhas.push(`prazos "%": esperado só o "50% de desconto" e veio ${tudoOuNada}`);
    } else if (tudoOuNada.length !== 0) falhas.push(`audiencias "%": não devia achar nada e achou ${tudoOuNada}`);
    const sublinhado = ids(await buscar(m, '_'));
    if (sublinhado.length !== 0) falhas.push(`${m.nome} "_": não devia achar nada (só há "_" em modalidade trocado por espaço) e achou ${sublinhado}`);
  }
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('a pesquisa vale junto com os outros filtros e o total acompanha', async () => {
  const falhas = [];
  const [aud, per, pzo] = MODULOS;
  const a = await buscar(aud, 'José da Silva', '&status=agendada');
  if (JSON.stringify(ids(a)) !== JSON.stringify(so(F.aud1)) || Number(a.body.dados.total) !== 1) falhas.push(`audiencias + status: ${ids(a)} total ${a.body.dados.total}`);
  const b = await buscar(aud, 'José da Silva', '&data_de=2099-03-03&data_ate=2099-03-31');
  if (JSON.stringify(ids(b)) !== JSON.stringify(so(F.aud3))) falhas.push(`audiencias + datas: ${ids(b)}`);
  const c = await buscar(per, 'José da Silva', '&status=cancelada');
  if (JSON.stringify(ids(c)) !== JSON.stringify(so(F.per3))) falhas.push(`pericias + status: ${ids(c)}`);
  const d = await buscar(pzo, 'Silva', `&processo_id=${F.procB}`);
  if (ids(d).length !== 0) falhas.push(`prazos + processo B: "Silva" não devia achar nada no processo B e achou ${ids(d)}`);
  const e = await buscar(pzo, 'Embargos', `&processo_id=${F.procA}`);
  if (JSON.stringify(ids(e)) !== JSON.stringify(so(F.pz1))) falhas.push(`prazos + processo A: ${ids(e)}`);
  // paginação: com limite 1 a lista vem com 1 linha e o total continua o total da busca
  const pag = await get('/api/audiencias?busca=' + encodeURIComponent('José da Silva') + '&limite=1');
  if (pag.body.dados.registros.length !== 1 || Number(pag.body.dados.total) !== 2) falhas.push(`audiencias paginada: ${pag.body.dados.registros.length} linhas, total ${pag.body.dados.total}`);
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('busca inválida (lista, objeto ou acima de 200 caracteres) dá aviso 400, nunca erro interno; vazia ou só espaços é "sem busca"', async () => {
  const falhas = [];
  for (const m of MODULOS) {
    for (const [rotulo, consulta] of [['lista', 'busca[]=a&busca[]=b'], ['objeto', 'busca[x]=a'], ['201 letras', `busca=${'a'.repeat(201)}`]]) {
      const r = await get(`${m.rota}?${consulta}`);
      if (r.status !== 400 || !/busca/i.test(String(r.body.mensagem || ''))) falhas.push(`${m.nome} ${rotulo}: status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    }
    const limite = await get(`${m.rota}?busca=${'a'.repeat(200)}`);
    if (limite.status !== 200) falhas.push(`${m.nome}: 200 letras devia passar e deu ${limite.status}`);
    const todas = await get(`${m.rota}?limite=100`);
    const vazia = await get(`${m.rota}?busca=&limite=100`);
    const espacos = await get(`${m.rota}?busca=%20%20%20&limite=100`);
    if (vazia.status !== 200 || espacos.status !== 200 || ids(vazia).length !== ids(todas).length || ids(espacos).length !== ids(todas).length) falhas.push(`${m.nome}: busca vazia/só espaços devia trazer tudo`);
  }
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});

test('Prazos: o número do processo digitado só com dígitos acha o gravado com máscara (comportamento do campo antigo), e pontuação diferente também', async () => {
  const falhas = [];
  for (const termo of ['1111111112026', '111111111', '1111111-11', '1111111 11.2026']) {
    const obtido = ids(await buscar(MODULOS[2], termo));
    if (JSON.stringify(obtido) !== JSON.stringify(so(F.pz1, F.pz3))) falhas.push(`prazos "${termo}": esperado ${so(F.pz1, F.pz3)} e veio ${obtido}`);
  }
  const poucos = ids(await buscar(MODULOS[2], '33'));       // menos de 3 dígitos não usa a regra do número, e "33" não está em nada
  if (poucos.length !== 0) falhas.push(`prazos "33": achou ${poucos}`);
  assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`);
});
