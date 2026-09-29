// Testes do cadastro/remarcação de perícia com banco SIMULADO (nenhum MySQL é acessado).
// Cobrem: aviso "já existe perícia agendada", remarcação feita no cadastro
// e a opção "Marcar como remarcada" (só troca o status).
const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../../src/config/database');
const ctrl = require('../../src/controllers/periciasController');

// ---------- banco simulado ----------
let sqls;          // tudo que passou por pool.execute
let connSqls;      // tudo que passou por conn.execute (dentro da transação)
let eventos;       // begin / commit / rollback
let respostas;     // regras: [{ casa: /regex/, retorna: [rows] }]

function preparar(regras = []) {
  sqls = []; connSqls = []; eventos = []; respostas = regras;
  pool.execute = async (sql, params = []) => {
    sqls.push({ sql, params });
    for (const r of respostas) if (r.casa.test(sql)) return [r.retorna];
    return [[]];
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => { eventos.push('begin'); },
    commit:           async () => { eventos.push('commit'); },
    rollback:         async () => { eventos.push('rollback'); },
    release:          () => {},
    execute: async (sql, params = []) => {
      connSqls.push({ sql, params });
      if (/^\s*INSERT INTO pericia\b/i.test(sql)) return [{ insertId: 500 }];
      return [{ affectedRows: 1 }];
    },
  });
}

function resposta() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

const admin = { id: 1, nivel: 1, nome: 'Admin' };
const comum = { id: 9, nivel: 3, nome: 'Comum' };   // sem permissão (tabela permissoes simulada vazia)

function corpoNovaPericia(extra = {}) {
  return { processo_id: 10, tipo_pericia_id: 2, data: '2026-10-20', hora: '14:30', local: 'Fórum Central', ...extra };
}

const AGENDADA_EXISTENTE = { casa: /DATE_FORMAT\(data/i, retorna: [{ id: 77, data: '2026-10-19', hora: '14:30' }] };
const antiga = (o = {}) => ({ casa: /SELECT id, processo_id, tipo_pericia_id, status FROM pericia/i,
  retorna: [{ id: 77, processo_id: 10, tipo_pericia_id: 2, status: 'agendada', ...o }] });

const atualizouAntiga = () => connSqls.find(q => /UPDATE pericia SET status = 'remarcada'/i.test(q.sql));
const inseriuNova = () => connSqls.find(q => /^\s*INSERT INTO pericia\b/i.test(q.sql));

// ---------- aviso de perícia já agendada ----------
test('cadastrar perícia do mesmo tipo no mesmo processo já agendado devolve o aviso e NÃO grava', async () => {
  preparar([AGENDADA_EXISTENTE]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia(), usuario: admin }, res);

  assert.equal(res.code, 409);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.detalhes.codigo, 'PERICIA_AGENDADA_EXISTENTE');
  assert.deepEqual(res.body.detalhes.pericias, [{ id: 77, data: '2026-10-19', hora: '14:30' }]);
  assert.equal(inseriuNova(), undefined, 'não pode inserir perícia quando só há o aviso');
  assert.deepEqual(eventos, []);
});

test('a checagem olha somente perícias AGENDADAS do mesmo processo e do mesmo tipo', async () => {
  preparar([AGENDADA_EXISTENTE]);
  await ctrl.criar({ body: corpoNovaPericia(), usuario: admin }, resposta());
  const consulta = sqls.find(q => /DATE_FORMAT\(data/i.test(q.sql));
  assert.match(consulta.sql, /processo_id = \?/);
  assert.match(consulta.sql, /tipo_pericia_id = \?/);
  assert.match(consulta.sql, /status = 'agendada'/);
  assert.deepEqual(consulta.params, [10, 2]);
});

test('sem perícia agendada do mesmo tipo, o cadastro segue normalmente', async () => {
  preparar([]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia(), usuario: admin }, res);
  assert.equal(res.code, 201);
  assert.ok(inseriuNova());
  assert.equal(atualizouAntiga(), undefined, 'nenhuma perícia vira remarcada sem confirmação');
  assert.deepEqual(eventos, ['begin', 'commit']);
});

test('"Não, é outra perícia" (confirmar_nova) cadastra sem perguntar de novo', async () => {
  preparar([AGENDADA_EXISTENTE]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ confirmar_nova: true }), usuario: admin }, res);
  assert.equal(res.code, 201);
  assert.ok(inseriuNova());
  assert.equal(atualizouAntiga(), undefined);
});

test('perícia sem tipo definido não dispara o aviso', async () => {
  preparar([AGENDADA_EXISTENTE]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ tipo_pericia_id: null }), usuario: admin }, res);
  assert.equal(res.code, 201);
});

// ---------- remarcação feita no cadastro ----------
test('confirmar remarcação: antiga vira remarcada e a nova é criada na MESMA transação', async () => {
  preparar([antiga()]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 77, motivo_remarcacao: 'Pedido do perito' }), usuario: admin }, res);

  assert.equal(res.code, 201);
  assert.ok(inseriuNova());
  const up = atualizouAntiga();
  assert.ok(up, 'a antiga precisa ser marcada como remarcada');
  assert.deepEqual(up.params.slice(0, 1), ['Pedido do perito']);
  assert.equal(up.params[2], 77);
  assert.ok(connSqls.some(q => /auditoria_pericia/.test(q.sql) && q.params.includes(77)), 'histórico da antiga');
  assert.deepEqual(eventos, ['begin', 'commit']);
});

test('remarcação exige motivo', async () => {
  preparar([antiga()]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 77, motivo_remarcacao: '   ' }), usuario: admin }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /motivo/i);
  assert.equal(inseriuNova(), undefined);
});

test('remarcação recusa perícia que não está mais agendada', async () => {
  preparar([antiga({ status: 'cancelada' })]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 77, motivo_remarcacao: 'x' }), usuario: admin }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /não pode ser remarcada/i);
  assert.equal(inseriuNova(), undefined);
});

test('remarcação recusa perícia de OUTRO processo', async () => {
  preparar([antiga({ processo_id: 99 })]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 77, motivo_remarcacao: 'x' }), usuario: admin }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /outro processo/i);
  assert.equal(inseriuNova(), undefined);
});

test('remarcação de perícia inexistente devolve 404', async () => {
  preparar([{ casa: /SELECT id, processo_id, tipo_pericia_id, status FROM pericia/i, retorna: [] }]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 999, motivo_remarcacao: 'x' }), usuario: admin }, res);
  assert.equal(res.code, 404);
});

test('remarcar no cadastro exige permissão de alterar perícias', async () => {
  preparar([antiga()]);
  const res = resposta();
  await ctrl.criar({ body: corpoNovaPericia({ remarcar_pericia_id: 77, motivo_remarcacao: 'x' }), usuario: comum }, res);
  assert.equal(res.code, 403);
  assert.equal(inseriuNova(), undefined);
});

// ---------- "Marcar como remarcada" ----------
const statusDe = (status) => ({ casa: /SELECT status FROM pericia WHERE id/i, retorna: [{ status }] });

test('marcar como remarcada troca só o status, grava histórico e NÃO cria perícia nova', async () => {
  preparar([statusDe('agendada')]);
  const res = resposta();
  await ctrl.marcarRemarcada({ params: { id: 77 }, body: { motivo: 'Nova já cadastrada' }, usuario: admin }, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  const up = atualizouAntiga();
  assert.ok(up);
  assert.equal(up.params[0], 'Nova já cadastrada');
  assert.equal(up.params[2], 77);
  assert.ok(connSqls.some(q => /INSERT INTO auditoria_pericia/.test(q.sql) && /remarcada/.test(q.sql)));
  assert.equal(inseriuNova(), undefined, 'não pode criar perícia nova');
  assert.deepEqual(eventos, ['begin', 'commit']);
});

test('marcar como remarcada exige motivo', async () => {
  preparar([statusDe('agendada')]);
  const res = resposta();
  await ctrl.marcarRemarcada({ params: { id: 77 }, body: { motivo: '  ' }, usuario: admin }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /motivo/i);
  assert.equal(atualizouAntiga(), undefined);
});

test('marcar como remarcada recusa perícia que não está agendada', async () => {
  for (const status of ['realizada', 'cancelada', 'remarcada']) {
    preparar([statusDe(status)]);
    const res = resposta();
    await ctrl.marcarRemarcada({ params: { id: 77 }, body: { motivo: 'x' }, usuario: admin }, res);
    assert.equal(res.code, 400, status);
    assert.equal(atualizouAntiga(), undefined, status);
  }
});

test('marcar como remarcada: perícia inexistente devolve 404 e sem permissão devolve 403', async () => {
  preparar([{ casa: /SELECT status FROM pericia WHERE id/i, retorna: [] }]);
  let res = resposta();
  await ctrl.marcarRemarcada({ params: { id: 1 }, body: { motivo: 'x' }, usuario: admin }, res);
  assert.equal(res.code, 404);

  preparar([statusDe('agendada')]);
  res = resposta();
  await ctrl.marcarRemarcada({ params: { id: 77 }, body: { motivo: 'x' }, usuario: comum }, res);
  assert.equal(res.code, 403);
  assert.equal(atualizouAntiga(), undefined);
});

test('a rota "marcar-remarcada" está registrada com permissão de alterar perícias', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const rotas = fs.readFileSync(path.join(__dirname, '../../src/routes/index.js'), 'utf8');
  assert.match(rotas, /router\.put\('\/pericias\/:id\/marcar-remarcada'[^\n]*verificarPermissao\('pericias','alterar'\)[^\n]*marcarRemarcada/);
});
