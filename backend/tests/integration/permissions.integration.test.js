const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste } = require('../support/testDatabase');
carregarAmbienteTeste();

const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
let app;
let tokenSemPermissao;

function caminhoExecutavel(caminho) {
  return `/api${caminho.replace(/:([A-Za-z_]+)/g, (_, nome) => nome === 'token' ? 'token-invalido' : '1')}`;
}

function rotasBloqueadasPorPermissao() {
  const conteudo = fs.readFileSync(path.join(__dirname, '../../src/routes/index.js'), 'utf8');
  return conteudo.split(/\r?\n/).map(linha => {
    const m = linha.match(/router\.(get|post|put|patch|delete)\('([^']+)'/);
    if (!m || (!/verificarPermissao\(/.test(linha) && !/\bapenasAdmin\b|\bapenasSuper\b/.test(linha))) return null;
    return { metodo: m[1], caminho: m[2], linha };
  }).filter(Boolean);
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  tokenSemPermissao = jwt.sign(
    { id: 3, nome: 'Usuário sem Permissão', nivel: 2, tipo: 'advogado', sessao: 'sessao-sem-permissao' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.after(async () => pool.end());

test('matriz real de rotas impede usuário comum sem permissão', async () => {
  const falhas = [];
  for (const rota of rotasBloqueadasPorPermissao()) {
    const resposta = await request(app)[rota.metodo](caminhoExecutavel(rota.caminho))
      .set('Authorization', `Bearer ${tokenSemPermissao}`).send({});
    if (resposta.status !== 403) falhas.push({ metodo: rota.metodo, caminho: rota.caminho, status: resposta.status });
  }
  assert.deepEqual(falhas, []);
});

test('limite de tentativas bloqueia força bruta por login', async () => {
  const respostas = [];
  for (let i = 0; i < 11; i += 1) {
    respostas.push(await request(app).post('/api/auth/login').send({ login: 'alvo-forca-bruta', senha: 'errada' }));
  }
  assert.equal(respostas.at(-1).status, 429);
  assert.match(respostas.at(-1).body.mensagem, /muitas tentativas/i);
});
