const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const banco = require('../src/config/database');
const { autenticar, apenasAdmin, apenasSuper } = require('../src/middleware/auth');
const { verificarPermissao } = require('../src/middleware/permissoes');

process.env.JWT_SECRET = 'segredo-de-testes-com-mais-de-trinta-e-dois-caracteres';

function resposta() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

test('autenticação recusa ausência de token antes de consultar o banco', async () => {
  const res = resposta();
  let avancou = false;
  await autenticar({ headers: {} }, res, () => { avancou = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(avancou, false);
});

test('autenticação recusa token de sessão substituída', async () => {
  const original = banco.pool.execute;
  banco.pool.execute = async () => [[{ nivel: 2, tipo: 'advogado', ver_todos_processos: 0, sessao_atual: 'nova' }]];
  try {
    const token = jwt.sign({ id: 9, sessao: 'antiga' }, process.env.JWT_SECRET);
    const res = resposta();
    await autenticar({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('não deveria avançar'));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.codigo, 'SESSAO_ENCERRADA');
  } finally {
    banco.pool.execute = original;
  }
});

test('níveis administrativos e permissão granular usam 403 sem encerrar sessão', async () => {
  const adminRes = resposta();
  apenasAdmin({ usuario: { nivel: 2 } }, adminRes, () => assert.fail('não deveria avançar'));
  assert.equal(adminRes.statusCode, 403);

  const superRes = resposta();
  apenasSuper({ usuario: { nivel: 1 } }, superRes, () => assert.fail('não deveria avançar'));
  assert.equal(superRes.statusCode, 403);

  const original = banco.pool.execute;
  banco.pool.execute = async () => [[{ permitido: 0 }]];
  try {
    const res = resposta();
    await verificarPermissao('pessoas', 'visualizar')({ usuario: { id: 3, nivel: 2 } }, res, () => assert.fail('não deveria avançar'));
    assert.equal(res.statusCode, 403);
  } finally {
    banco.pool.execute = original;
  }
});
