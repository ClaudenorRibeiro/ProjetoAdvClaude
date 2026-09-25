const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const arquivo = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf8');
const linhas = arquivo.split(/\r?\n/).filter(l => /router\.(get|post|put|patch|delete)\(/.test(l));
const publicas = new Set([
  'GET /public/info',
  'POST /auth/login',
  'POST /auth/criar-admin',
  'POST /auth/esqueci-senha',
  'GET /auth/validar-token/:token',
  'POST /auth/redefinir-senha',
]);

function identificar(linha) {
  const m = linha.match(/router\.(get|post|put|patch|delete)\('([^']+)'/);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

test('inventário contém todas as 293 rotas conhecidas', () => {
  assert.equal(linhas.length, 293, 'mudou a quantidade de rotas: revise o contrato de segurança e atualize este teste');
});

test('não existem método e caminho duplicados', () => {
  const ids = linhas.map(identificar);
  assert.equal(ids.includes(null), false, 'há rota que o inventário não conseguiu interpretar');
  assert.equal(new Set(ids).size, ids.length);
});

test('toda rota não pública exige autenticação explicitamente', () => {
  const falhas = linhas
    .map(linha => ({ linha, id: identificar(linha) }))
    .filter(({ id, linha }) => !publicas.has(id) && !/\bautenticar\b/.test(linha));
  assert.deepEqual(falhas, []);
});

test('rotas públicas são uma lista pequena e revisável', () => {
  const encontradas = new Set(linhas.map(identificar).filter(id => publicas.has(id)));
  assert.deepEqual([...encontradas].sort(), [...publicas].sort());
});
