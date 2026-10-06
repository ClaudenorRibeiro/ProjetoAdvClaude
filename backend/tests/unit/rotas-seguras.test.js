// Rede de segurança das rotas: um erro dentro de um handler assíncrono NÃO pode derrubar o servidor (Express 4 não captura sozinho).
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { protegerRotas, seguro, comIdNumerico } = require('../../src/utils/rotasSeguras');

function montar() {
  const router = protegerRotas(express.Router());
  router.get('/assincrono-quebra', async (req) => { const nome = req.query.nome; if (!nome.trim()) return; });   // TypeError fora de try/catch
  router.get('/rejeita', async () => { throw new Error('falha qualquer'); });
  router.get('/sincrono-quebra', () => { throw new Error('falha síncrona'); });
  router.get('/promessa-rejeitada', () => Promise.reject(new Error('rejeitada')));
  router.get('/ok', async (req, res) => res.json({ ok: true }));
  router.post('/corpo', async (req, res) => res.json({ tam: req.body.nome.trim().length }));
  router.get('/com-middleware', (req, res, next) => { req.marca = 'passou'; next(); }, async (req, res) => res.json({ marca: req.marca }));
  router.get('/array', [(req, res, next) => next(), async () => { throw new Error('dentro de array'); }]);
  const sub = protegerRotas(express.Router());
  sub.get('/x', async () => { throw new Error('no sub-roteador'); });
  router.use('/sub', sub);
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use((err, req, res, next) => res.status(500).json({ ok: false, mensagem: 'Erro interno no servidor', origem: String(err.message) }));   // handler de erro (4 parâmetros)
  return app;
}

test('erro dentro de handler assíncrono, síncrono ou promessa rejeitada vira resposta 500 e o servidor continua respondendo', async () => {
  const app = montar();
  const silencio = console.error; console.error = () => {};
  try {
    for (const rota of ['/api/assincrono-quebra', '/api/rejeita', '/api/sincrono-quebra', '/api/promessa-rejeitada', '/api/array', '/api/sub/x']) {
      const r = await request(app).get(rota);
      assert.equal(r.status, 500, rota); assert.equal(r.body.ok, false, rota);
    }
    const r = await request(app).post('/api/corpo').send({ nome: 5 });                     // o caso real: nome que não é texto
    assert.equal(r.status, 500);
    assert.equal((await request(app).get('/api/ok')).status, 200);                        // continua de pé e atendendo
    assert.equal((await request(app).get('/api/com-middleware')).body.marca, 'passou');    // middlewares encadeados funcionam
    assert.equal((await request(app).post('/api/corpo').send({ nome: ' ab ' })).body.tam, 2);
  } finally { console.error = silencio; }
});

test('seguro: não mexe em handler de erro (4 parâmetros), em sub-roteador nem em valor que não é função', () => {
  const erroHandler = (err, req, res, next) => {};
  assert.equal(seguro(erroHandler), erroHandler);
  assert.equal(seguro('/caminho'), '/caminho');
  const sub = express.Router();
  assert.equal(seguro(sub), sub);
  const [a, b] = seguro([(req, res, next) => next(), '/x']);
  assert.equal(typeof a, 'function'); assert.equal(b, '/x');
});

test('comIdNumerico: id só de dígitos segue para a rota; "abc", negativo, decimal, vazio e número gigante viram 404 sem chamar a rota', async () => {
  const app = express();
  let chamadas = 0;
  app.get('/item/:id', comIdNumerico((req, res) => { chamadas++; res.json({ ok: true, id: req.params.id }); }, 'Item não encontrado'));
  app.get('/outro/:codigo', comIdNumerico((req, res) => res.json({ ok: true }), 'Outro não encontrado', 'codigo'));
  assert.equal((await request(app).get('/item/42')).status, 200);
  for (const ruim of ['abc', '-1', '1.5', '0x10', '99999999999999999999', '12abc']) {
    const r = await request(app).get(`/item/${ruim}`);
    assert.equal(r.status, 404, ruim);
    assert.equal(r.body.mensagem, 'Item não encontrado');
  }
  assert.equal(chamadas, 1);
  assert.equal((await request(app).get('/outro/7')).status, 200);
  assert.equal((await request(app).get('/outro/x')).status, 404);
});
