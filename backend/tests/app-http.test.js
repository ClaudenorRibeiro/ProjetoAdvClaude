const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-de-testes-com-mais-de-trinta-e-dois-caracteres';
const { criarApp } = require('../src/app');

test('aplicação responde 404 padronizado e inclui headers de segurança', async () => {
  const resposta = await request(criarApp()).get('/rota-inexistente').expect(404);
  assert.deepEqual(resposta.body, { ok: false, mensagem: 'Rota não encontrada' });
  assert.equal(resposta.headers['x-content-type-options'], 'nosniff');
  assert.equal(resposta.headers['x-frame-options'], 'SAMEORIGIN');
});

test('rota protegida recusa chamada sem token', async () => {
  const resposta = await request(criarApp()).get('/api/dashboard').expect(401);
  assert.equal(resposta.body.ok, false);
  assert.match(resposta.body.mensagem, /token/i);
});

test('corpo JSON acima do limite é recusado sem expor erro técnico', async () => {
  const grande = 'x'.repeat(10 * 1024 * 1024 + 1);
  const erroOriginal = console.error;
  console.error = () => {};
  let resposta;
  try {
    resposta = await request(criarApp()).post('/api/auth/login').send({ login: grande, senha: 'x' });
  } finally {
    console.error = erroOriginal;
  }
  assert.equal(resposta.status, 413);
  assert.deepEqual(resposta.body, { ok: false, mensagem: 'O conteúdo enviado excede o limite permitido de 10 MB.' });
});
