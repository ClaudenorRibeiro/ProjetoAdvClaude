// Plano de testes de Processos — passo A4 (ver PLANO-TESTES-PROCESSOS.md).
// Servidor, contra MySQL real isolado: login/sessão (401) e permissões (403) em TODAS as rotas de Processos, exatidão de cada
// permissão (matriz: um usuário só com a permissão X é testado em todas as rotas), efeito imediato de revogar/rebaixar/desativar.
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
const chamar = (token, metodo, caminho) => {
  const r = request(app)[metodo](caminho);
  if (token) r.set('Authorization', `Bearer ${token}`);
  return metodo === 'get' || metodo === 'delete' ? r : r.send({});
};
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const emitir = (id, nivel, sessao, extra = {}, opcoes = { expiresIn: '1h' }) =>
  jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao, ...extra }, process.env.JWT_SECRET, opcoes);

// [método, caminho, [módulo, submódulo, ação] exigidos] — ids/rotas escolhidos para que, ao PASSAR da permissão, nada seja alterado
// (corpo vazio → 400 de validação, ou id inexistente → 404).
const P = (acao) => ['processos', null, acao];
const A = (acao) => ['processos', 'assuntos', acao];
const ROTAS = [
  ['get', '/api/processos/pastas', P('visualizar')],
  ['get', '/api/processos/pastas/999999', P('visualizar')],
  ['get', '/api/processos/999999/historico', P('visualizar')],
  ['post', '/api/processos', P('cadastrar')],
  ['put', '/api/processos/999999', P('alterar')],
  ['delete', '/api/processos/999999', P('excluir')],
  ['put', '/api/processos/pastas/999999/renumerar', ['pastas', null, 'alterar']],
  ['get', '/api/processos/parados', ['relatorios', null, 'visualizar']],
  ...['foruns', 'varas', 'tipos', 'status', 'instancias'].flatMap(a => [
    ['post', `/api/processos/auxiliares/${a}`, P('cadastrar')],
    ['put', `/api/processos/auxiliares/${a}/999999`, P('alterar')],
    ['delete', `/api/processos/auxiliares/${a}/999999`, P('excluir')],
  ]),
  ['post', '/api/processos/auxiliares/assuntos', A('cadastrar')],
  ['put', '/api/processos/auxiliares/assuntos/999999', A('alterar')],
  ['delete', '/api/processos/auxiliares/assuntos/999999', A('excluir')],
];
// Rotas que exigem só estar logado (usadas por outros módulos para escolher um processo, por exemplo).
const ROTAS_ABERTAS = [
  ['get', '/api/processos/buscar?q=PROCESSO'], ['get', '/api/processos/1/basico'], ['get', '/api/processos/sugerir-pasta'],
  ['get', '/api/processos/pastas/checar?numPasta=99001'], ['get', '/api/processos/auxiliares'],
];
const chave = (r) => r.join('|');
const EXIGENCIAS = [...new Map(ROTAS.map(r => [chave(r[2]), r[2]])).values()];
const passou = (r) => r.status !== 401 && r.status !== 403;

const U = {};   // usuários de teste: U.so[chave] (só a permissão), U.menos[chave] (todas menos ela, esta negada de forma explícita)
let seq = 100;
async function criarUsuario(rotulo, nivel, permissoes) {
  seq += 1;
  const id = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0)`,
    [`Usuário ${rotulo}`, `u${seq}`, `u${seq}@example.invalid`, nivel, `sessao-${seq}`])).insertId;
  for (const [m, s, a, permitido] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, ?)', [id, m, s, a, permitido]);
  return { id, token: emitir(id, nivel, `sessao-${seq}`), sessao: `sessao-${seq}` };
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  U.admin = { id: 1, token: emitir(1, 1, 'sessao-admin') };
  U.nenhuma = { id: 3, token: emitir(3, 2, 'sessao-sem-permissao') };             // seed: usuário sem nenhuma permissão
  U.super = await criarUsuario('Super', 0, []);
  U.so = {}; U.menos = {};
  for (const e of EXIGENCIAS) {
    U.so[chave(e)] = await criarUsuario(`só ${chave(e)}`, 2, [[e[0], e[1], e[2], 1]]);
    U.menos[chave(e)] = await criarUsuario(`menos ${chave(e)}`, 2, EXIGENCIAS.map(o => [o[0], o[1], o[2], chave(o) === chave(e) ? 0 : 1]));
  }
});
test.after(async () => pool.end());

test('sem login: TODAS as rotas de Processos (protegidas e abertas) respondem 401', async () => {
  for (const [metodo, caminho] of [...ROTAS, ...ROTAS_ABERTAS]) {
    const r = await chamar(null, metodo, caminho);
    assert.equal(r.status, 401, `${metodo.toUpperCase()} ${caminho} → ${r.status}`);
    assert.equal(r.body.ok, false);
  }
});

test('login recusado em qualquer formato: cabeçalho vazio, token mal formado, assinatura errada, vencido, sem chave de sessão, sessão trocada, usuário inexistente', async () => {
  const rota = ['get', '/api/processos/pastas'];
  const casos = [
    ['cabeçalho "Bearer" sem token', () => request(app).get(rota[1]).set('Authorization', 'Bearer'), /não informado/],
    ['cabeçalho sem "Bearer"', () => request(app).get(rota[1]).set('Authorization', 'abc'), /não informado/],
    ['token lixo', () => chamar('lixo.lixo.lixo', ...rota), /inválido ou expirado/],
    ['assinado com outra senha', () => chamar(jwt.sign({ id: 1, nivel: 1, sessao: 'sessao-admin' }, 'outra-senha-qualquer'), ...rota), /inválido ou expirado/],
    ['vencido', () => chamar(emitir(1, 1, 'sessao-admin', {}, { expiresIn: -60 }), ...rota), /inválido ou expirado/],
    ['sem chave de sessão', () => chamar(jwt.sign({ id: 1, nivel: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' }), ...rota), /não é mais válida/],
    ['sessão aberta em outro dispositivo', () => chamar(emitir(1, 1, 'sessao-antiga'), ...rota), /outro dispositivo/],
    ['usuário que não existe', () => chamar(emitir(999999, 1, 'sessao-admin'), ...rota), /não é mais válida/],
    ['token sem id', () => chamar(jwt.sign({ nivel: 1, sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }), ...rota), /não é mais válida/],
    ['token com id que não é número (texto, objeto, lista, zero, negativo)', async () => {
      for (const id of ['abc', { a: 1 }, [1, 2], 0, -5, '', null]) {
        const r = await chamar(jwt.sign({ id, nivel: 1, sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }), ...rota);
        assert.equal(r.status, 401, `id=${JSON.stringify(id)} → ${r.status} ${JSON.stringify(r.body)}`);
      }
      return chamar(jwt.sign({ id: 'abc', nivel: 1, sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }), ...rota);
    }, /não é mais válida/],
    ['id do token como texto numérico ("1") continua valendo, conferindo o banco', async () => {
      const r = await chamar(jwt.sign({ id: '1', nivel: 1, sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }), ...rota);
      assert.equal(r.status, 200, `id "1" → ${r.status}`);
      return chamar(null, ...rota);                                    // o resultado devolvido só serve para o teste comum abaixo (401)
    }, /não informado/],
  ];
  for (const [rotulo, fazer, mensagem] of casos) {
    const r = await fazer();
    assert.equal(r.status, 401, `${rotulo} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.mensagem), mensagem, rotulo);
  }
  const trocada = await chamar(emitir(1, 1, 'sessao-antiga'), ...rota);
  assert.equal(trocada.body.codigo, 'SESSAO_ENCERRADA');                           // a tela usa este código para avisar o usuário
});

test('administrador (nível 1) e superusuário (nível 0) passam por todas as portas de permissão', async () => {
  for (const quem of [U.admin, U.super]) {
    for (const [metodo, caminho] of ROTAS) {
      const r = await chamar(quem.token, metodo, caminho);
      assert.ok(passou(r), `${quem === U.admin ? 'admin' : 'super'} ${metodo.toUpperCase()} ${caminho} → ${r.status} ${JSON.stringify(r.body)}`);
    }
  }
});

test('usuário sem NENHUMA permissão: 403 em todas as rotas protegidas (antes de validar o corpo ou dizer se o id existe) e 200 nas abertas', async () => {
  for (const [metodo, caminho, exige] of ROTAS) {
    const r = await chamar(U.nenhuma.token, metodo, caminho);
    assert.equal(r.status, 403, `${metodo.toUpperCase()} ${caminho} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, false);
    assert.match(String(r.body.mensagem), /Sem permissão para/);
    assert.ok(String(r.body.mensagem).includes(exige[2]), `a mensagem deveria citar a ação "${exige[2]}": ${r.body.mensagem}`);
    assert.equal(r.body.dados, undefined);                                         // nada de dados na recusa
  }
  for (const [metodo, caminho] of ROTAS_ABERTAS) {
    const r = await chamar(U.nenhuma.token, metodo, caminho);
    assert.equal(r.status, 200, `${caminho} (rota aberta a quem está logado) → ${r.status}`);
  }
});

test('exatidão de cada permissão: quem tem SÓ a permissão X passa nas rotas de X e leva 403 em todas as outras (matriz)', async () => {
  const erros = [];
  for (const e of EXIGENCIAS) {
    const usuario = U.so[chave(e)];
    for (const [metodo, caminho, exige] of ROTAS) {
      const r = await chamar(usuario.token, metodo, caminho);
      const devia = chave(exige) === chave(e);
      if (devia && !passou(r)) erros.push(`só ${chave(e)}: ${metodo.toUpperCase()} ${caminho} devia PASSAR e deu ${r.status}`);
      if (!devia && r.status !== 403) erros.push(`só ${chave(e)}: ${metodo.toUpperCase()} ${caminho} devia dar 403 e deu ${r.status}`);
    }
  }
  assert.deepEqual(erros, []);
});

test('permissão NEGADA de forma explícita (permitido = 0) barra a rota, mesmo com todas as outras liberadas (matriz inversa)', async () => {
  const erros = [];
  for (const e of EXIGENCIAS) {
    const usuario = U.menos[chave(e)];
    for (const [metodo, caminho, exige] of ROTAS) {
      const r = await chamar(usuario.token, metodo, caminho);
      const devia = chave(exige) !== chave(e);
      if (devia && !passou(r)) erros.push(`todas menos ${chave(e)}: ${metodo.toUpperCase()} ${caminho} devia PASSAR e deu ${r.status}`);
      if (!devia && r.status !== 403) erros.push(`todas menos ${chave(e)}: ${metodo.toUpperCase()} ${caminho} devia dar 403 e deu ${r.status}`);
    }
  }
  assert.deepEqual(erros, []);
});

test('sub-módulo é separado: "processos" liberado não libera "processos > assuntos", e "assuntos" liberado não libera "processos"', async () => {
  const soModulo = await criarUsuario('só módulo', 2, [['processos', null, 'cadastrar', 1], ['processos', null, 'alterar', 1], ['processos', null, 'excluir', 1]]);
  for (const [m, c] of [['post', '/api/processos/auxiliares/assuntos'], ['put', '/api/processos/auxiliares/assuntos/999999'], ['delete', '/api/processos/auxiliares/assuntos/999999']]) {
    assert.equal((await chamar(soModulo.token, m, c)).status, 403, `${m} ${c} com só o módulo`);
  }
  const soAssuntos = await criarUsuario('só assuntos', 2, [['processos', 'assuntos', 'cadastrar', 1], ['processos', 'assuntos', 'alterar', 1], ['processos', 'assuntos', 'excluir', 1]]);
  for (const [m, c] of [['post', '/api/processos'], ['put', '/api/processos/999999'], ['delete', '/api/processos/999999'], ['post', '/api/processos/auxiliares/tipos']]) {
    assert.equal((await chamar(soAssuntos.token, m, c)).status, 403, `${m} ${c} com só assuntos`);
  }
});

test('o que vale é o cadastro ATUAL no banco: revogar permissão, rebaixar de nível ou desativar o usuário surte efeito na chamada seguinte', async () => {
  const u = await criarUsuario('muda', 2, [['processos', null, 'visualizar', 1]]);
  assert.ok(passou(await chamar(u.token, 'get', '/api/processos/pastas')));
  await sql("UPDATE permissoes SET permitido = 0 WHERE usuario_id = ? AND modulo = 'processos'", [u.id]);          // revogou
  assert.equal((await chamar(u.token, 'get', '/api/processos/pastas')).status, 403);
  await sql("UPDATE permissoes SET permitido = 1 WHERE usuario_id = ? AND modulo = 'processos'", [u.id]);          // devolveu
  assert.ok(passou(await chamar(u.token, 'get', '/api/processos/pastas')));
  await sql("DELETE FROM permissoes WHERE usuario_id = ?", [u.id]);                                                  // linha apagada = sem permissão
  assert.equal((await chamar(u.token, 'get', '/api/processos/pastas')).status, 403);
  // token que AFIRMA ser administrador, mas o cadastro diz nível comum e sem permissão: vale o banco
  const mentiroso = await criarUsuario('mentiroso', 2, []);
  const tokenAdmin = emitir(mentiroso.id, 1, mentiroso.sessao);
  assert.equal((await chamar(tokenAdmin, 'post', '/api/processos')).status, 403, 'o nível do token foi aceito sem conferir o banco');
  // quem foi PROMOVIDO a administrador passa em tudo na hora, e rebaixado volta a ser barrado
  await sql('UPDATE usuarios SET nivel = 1 WHERE id = ?', [mentiroso.id]);
  assert.ok(passou(await chamar(mentiroso.token, 'post', '/api/processos')));
  await sql('UPDATE usuarios SET nivel = 2 WHERE id = ?', [mentiroso.id]);
  assert.equal((await chamar(mentiroso.token, 'post', '/api/processos')).status, 403);
  // desativado: 401 em qualquer rota (inclusive nas abertas); reativado, volta
  await sql('UPDATE usuarios SET ativo = 0 WHERE id = ?', [u.id]);
  for (const [metodo, caminho] of [['get', '/api/processos/pastas'], ['get', '/api/processos/auxiliares']]) {
    assert.equal((await chamar(u.token, metodo, caminho)).status, 401, `desativado em ${caminho}`);
  }
  await sql('UPDATE usuarios SET ativo = 1 WHERE id = ?', [u.id]);
  assert.notEqual((await chamar(u.token, 'get', '/api/processos/auxiliares')).status, 401);
});

test('rotas de leitura da pasta e do processo não devolvem dados a quem só tem outra permissão (nada vaza no corpo da recusa)', async () => {
  const soCadastrar = U.so[chave(P('cadastrar'))];
  for (const caminho of ['/api/processos/pastas', '/api/processos/pastas/1', '/api/processos/1/historico']) {
    const r = await chamar(soCadastrar.token, 'get', caminho);
    assert.equal(r.status, 403, caminho);
    assert.deepEqual(Object.keys(r.body).sort(), ['mensagem', 'ok']);
  }
});

test('a recusa de permissão acontece ANTES de qualquer efeito: nada é gravado quando o usuário não tem a permissão', async () => {
  const antes = {
    proc: Number((await sql('SELECT COUNT(*) AS n FROM tblproc'))[0].n), pastas: Number((await sql('SELECT COUNT(*) AS n FROM tblpasta'))[0].n),
    foruns: Number((await sql('SELECT COUNT(*) AS n FROM tblforum'))[0].n), tipos: Number((await sql('SELECT COUNT(*) AS n FROM tbltipoproc'))[0].n),
    num: (await sql('SELECT numPasta FROM tblpasta WHERE id = 1'))[0].numPasta,
  };
  const corpoProcesso = { numPasta: 7001, NomeTituloProc: 'NÃO PODE GRAVAR', autores: [{ tipo_pessoa: 'fisica', pessoa_id: 1 }], reus: [{ tipo_pessoa: 'fisica', pessoa_id: 1 }] };
  const tentativas = [
    request(app).post('/api/processos').set('Authorization', `Bearer ${U.nenhuma.token}`).send(corpoProcesso),
    request(app).put('/api/processos/1').set('Authorization', `Bearer ${U.nenhuma.token}`).send({ NomeTituloProc: 'ALTERADO' }),
    request(app).delete('/api/processos/1').set('Authorization', `Bearer ${U.nenhuma.token}`),
    request(app).put('/api/processos/pastas/1/renumerar').set('Authorization', `Bearer ${U.nenhuma.token}`).send({ numPasta: 7002 }),
    request(app).post('/api/processos/auxiliares/foruns').set('Authorization', `Bearer ${U.nenhuma.token}`).send({ nome: 'Fórum proibido' }),
    request(app).post('/api/processos/auxiliares/tipos').set('Authorization', `Bearer ${U.nenhuma.token}`).send({ nome: 'Tipo proibido' }),
  ];
  for (const r of await Promise.all(tentativas)) assert.equal(r.status, 403);
  assert.deepEqual({
    proc: Number((await sql('SELECT COUNT(*) AS n FROM tblproc'))[0].n), pastas: Number((await sql('SELECT COUNT(*) AS n FROM tblpasta'))[0].n),
    foruns: Number((await sql('SELECT COUNT(*) AS n FROM tblforum'))[0].n), tipos: Number((await sql('SELECT COUNT(*) AS n FROM tbltipoproc'))[0].n),
    num: (await sql('SELECT numPasta FROM tblpasta WHERE id = 1'))[0].numPasta,
  }, antes);
  assert.equal((await sql('SELECT NomeTituloProc FROM tblproc WHERE id = 1'))[0].NomeTituloProc, 'PROCESSO AUTOMATIZADO');
});
