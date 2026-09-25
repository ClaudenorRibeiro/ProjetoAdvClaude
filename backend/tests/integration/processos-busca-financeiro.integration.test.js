// Cobre a busca de pasta usada pelo Financeiro (Financeiro.js): filtro "só pastas com
// lançamento" (apenasComFinanceiro) e busca por VALOR exato (parcela ou lançamento).
// A pasta/processo #1 já vem do seed (semearDadosBase) SEM nenhuma movimentação
// financeira — serve de controle para confirmar que ela fica de fora quando o filtro
// está ligado, e continua aparecendo quando NENHUMA tela manda o filtro (Perícias,
// Prazos, Processos, Relatórios, Tarefas — nenhuma delas manda apenasComFinanceiro).
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
let pastaComFinanceiroId;

function token(id, nivel, sessao) {
  return jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function requisicao(comToken = admin) {
  return { get: p => request(app).get(p).set('Authorization', `Bearer ${comToken}`) };
}

async function executar(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');

  // Segunda pasta/processo, COM lançamento financeiro (a #1 do seed fica sem, de controle).
  const pasta = await executar("INSERT INTO tblpasta (numPasta, area_direito, criado_por) VALUES (9002, 'Testes', 1)");
  pastaComFinanceiroId = pasta.insertId;
  const proc = await executar(
    `INSERT INTO tblproc (pasta_id, numProc, cliente_polo, NomeTituloProc, tipo_id, status_id, ativo, criado_por)
     VALUES (?, '0000002-02.2026.5.15.0002', 'autor', 'PROCESSO COM FINANCEIRO', 1, 1, 1, 1)`,
    [pastaComFinanceiroId]
  );
  await executar(
    `INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, usuario_id)
     VALUES (?, '2026-01-05', 'Lançamento de teste', 'entrada', 1234.56, 1)`,
    [proc.insertId]
  );
});

test.after(async () => pool.end());

test('apenasComFinanceiro=1 só traz pastas com lançamento/acordo/alvará', async () => {
  const resp = await requisicao().get('/api/processos/pastas?apenasComFinanceiro=1&limite=50');
  assert.equal(resp.status, 200);
  const ids = resp.body.dados.registros.map(r => r.id);
  assert.equal(ids.includes(pastaComFinanceiroId), true);
  assert.equal(ids.includes(1), false); // pasta #1 do seed não tem nenhuma movimentação
});

test('sem o parâmetro (outras telas), continua trazendo TODAS as pastas — comportamento antigo preservado', async () => {
  const resp = await requisicao().get('/api/processos/pastas?limite=50');
  assert.equal(resp.status, 200);
  const ids = resp.body.dados.registros.map(r => r.id);
  assert.equal(ids.includes(pastaComFinanceiroId), true);
  assert.equal(ids.includes(1), true);
});

test('busca por valor exato ("1.234,56") encontra o processo com esse lançamento', async () => {
  const resp = await requisicao().get('/api/processos/pastas?busca=1.234,56&limite=50');
  assert.equal(resp.status, 200);
  const ids = resp.body.dados.registros.map(r => r.id);
  assert.equal(ids.includes(pastaComFinanceiroId), true);
  assert.equal(ids.length, 1); // não pega nada além dessa pasta
});

test('busca por valor diferente ("999,00") não encontra nada', async () => {
  const resp = await requisicao().get('/api/processos/pastas?busca=999,00&limite=50');
  assert.equal(resp.status, 200);
  assert.equal(resp.body.dados.registros.length, 0);
});
