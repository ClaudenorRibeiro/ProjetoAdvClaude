// Pasta com 5 dígitos ou mais (a do banco de teste é a 99001): o LPAD do MySQL CORTAVA o número em 4
// dígitos (99001 virava 9900), então a busca pelo número inteiro não achava a pasta. Aqui se confere que
// o número inteiro é achado, que a pasta curta continua com zeros à esquerda (0042) e que a regra única
// do SQL (utils/helpers: pastaFormatadaSql) devolve o texto certo nos dois casos.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { pastaFormatadaSql } = require('../../src/utils/helpers');

let app;
let admin;
let pastaCurtaId;

async function executar(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const buscar = (termo) => request(app).get(`/api/processos/pastas?busca=${encodeURIComponent(termo)}&limite=50`)
  .set('Authorization', `Bearer ${admin}`);
const numeros = (resp) => resp.body.dados.registros.map(r => Number(r.numPasta)).sort((a, b) => a - b);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = jwt.sign({ id: 1, nome: 'Teste 1', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  // pasta curta (42) com um processo ativo; a pasta 99001 já vem do banco de teste
  pastaCurtaId = (await executar("INSERT INTO tblpasta (numPasta, criado_por) VALUES (42, 1)")).insertId;
  await executar(
    `INSERT INTO tblproc (pasta_id, numProc, cliente_polo, NomeTituloProc, tipo_id, status_id, ativo, criado_por)
     VALUES (?, '0000042-02.2026.5.15.0042', 'autor', 'PROCESSO DA PASTA CURTA', 1, 1, 1, 1)`, [pastaCurtaId]);
});

test.after(async () => pool.end());

test('busca pelo número inteiro da pasta de 5 dígitos (99001) acha a pasta; parte do número também', async () => {
  const inteiro = await buscar('99001');
  assert.equal(inteiro.status, 200);
  assert.deepEqual(numeros(inteiro), [99001]);                 // só a 99001, nunca a pasta 42
  assert.deepEqual(numeros(await buscar('9900')), [99001]);    // parte do número continua achando
  assert.deepEqual(numeros(await buscar('001')), [99001]);
});

test('pasta curta continua com zeros à esquerda: "0042" e "42" acham a pasta 42, e a 99001 não aparece', async () => {
  assert.deepEqual(numeros(await buscar('0042')), [42]);
  assert.deepEqual(numeros(await buscar('42')), [42]);
});

test('regra do SQL: 42 vira 0042, 1000 e 99001 ficam inteiros, nulo continua nulo', async () => {
  const [linhas] = await pool.execute(
    `SELECT ${pastaFormatadaSql('pa')} AS f FROM tblpasta pa WHERE pa.numPasta IN (42, 99001) ORDER BY pa.numPasta`);
  assert.deepEqual(linhas.map(l => l.f), ['0042', '99001']);
  const [lim] = await pool.execute("SELECT ? AS a, ? AS b", [1, 2]);   // só garante a conexão viva
  assert.equal(lim.length, 1);
  const [casos] = await pool.execute(
    `SELECT ${pastaFormatadaSql('x')} AS f FROM (SELECT 999 AS numPasta UNION ALL SELECT 1000 UNION ALL SELECT 12345 UNION ALL SELECT NULL) x`);
  assert.deepEqual(casos.map(c => c.f), ['0999', '1000', '12345', null]);
});
