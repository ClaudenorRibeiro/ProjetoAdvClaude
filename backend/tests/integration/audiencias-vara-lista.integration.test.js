// Lista de audiências: devolve a vara (e o fórum) de cada linha e ordena por vara. Contra MySQL real isolado.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let token; const F = {};
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  token = jwt.sign({ id: 1, nome: 'Teste 1', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6301, 1)')).insertId;
  F.proc = (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000301-00.2026.5.15.0001', 'PROCESSO DA VARA', 1, 1, 1, 1)", [pasta])).insertId;
  F.tipo = (await sql("INSERT INTO tipo_audiencia (nome, ativo) VALUES ('Instrução VARA', 1)")).insertId;
  const forum = (await sql("INSERT INTO tblforum (nome, ativo) VALUES ('Foro Central VARA', 1)")).insertId;
  F.varaB = (await sql("INSERT INTO tblvara (nome, abrev_nome, forum_id, ativo) VALUES ('Segunda Vara Cível', '2ª Vara Cível', ?, 1)", [forum])).insertId;
  F.varaA = (await sql("INSERT INTO tblvara (nome, abrev_nome, forum_id, ativo) VALUES ('Primeira Vara Cível', '1ª Vara Cível', ?, 1)", [forum])).insertId;
});
test.after(async () => pool.end());

const nova = (hora, vara) => sql(
  "INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, status, vara_id, criado_por) VALUES (?, ?, '2031-05-05', ?, 'presencial', 'agendada', ?, 1)",
  [F.proc, F.tipo, hora, vara]).then(r => r.insertId);

test('a lista traz a vara e o fórum e ordena por vara (crescente e decrescente)', async () => {
  const b = await nova('09:00:00', F.varaB);
  const a = await nova('10:00:00', F.varaA);
  const consulta = direcao => request(app)
    .get(`/api/audiencias?data_de=2031-05-05&data_ate=2031-05-05&ordenar=vara&direcao=${direcao}&limite=100`)
    .set('Authorization', `Bearer ${token}`);
  const asc = await consulta('ASC');
  assert.equal(asc.status, 200, JSON.stringify(asc.body).slice(0, 200));
  const linhas = asc.body.dados.registros.filter(l => [a, b].includes(l.id));
  assert.deepEqual(linhas.map(l => l.id), [a, b], 'crescente: 1ª Vara antes da 2ª');
  assert.equal(linhas[0].vara_abrev_nome, '1ª Vara Cível');
  assert.equal(linhas[0].vara_forum_nome, 'Foro Central VARA');
  const desc = await consulta('DESC');
  assert.deepEqual(desc.body.dados.registros.filter(l => [a, b].includes(l.id)).map(l => l.id), [b, a], 'decrescente: 2ª Vara antes da 1ª');
});
