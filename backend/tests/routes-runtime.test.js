const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-de-testes-com-mais-de-trinta-e-dois-caracteres';
const { criarApp } = require('../src/app');

const publicas = new Set([
  'GET /public/info', 'POST /auth/login', 'POST /auth/criar-admin',
  'POST /auth/esqueci-senha', 'GET /auth/validar-token/:token', 'POST /auth/redefinir-senha',
]);

function inventario() {
  const conteudo = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf8');
  return conteudo.split(/\r?\n/).map(linha => {
    const m = linha.match(/router\.(get|post|put|patch|delete)\('([^']+)'/);
    return m ? { metodo: m[1], caminho: m[2], id: `${m[1].toUpperCase()} ${m[2]}` } : null;
  }).filter(Boolean);
}

function caminhoExecutavel(caminho) {
  return `/api${caminho.replace(/:([A-Za-z_]+)/g, (_, nome) => nome === 'token' ? 'token-invalido' : '1')}`;
}

test('todas as rotas protegidas recusam chamadas reais sem token', async () => {
  const app = criarApp();
  const falhas = [];
  for (const rota of inventario().filter(r => !publicas.has(r.id))) {
    const resposta = await request(app)[rota.metodo](caminhoExecutavel(rota.caminho)).send({});
    if (resposta.status !== 401) falhas.push({ rota: rota.id, status: resposta.status, corpo: resposta.body });
  }
  assert.deepEqual(falhas, []);
});
