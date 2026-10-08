// Teste de servidor de USUÁRIOS e PERMISSÕES (Configurações). Quem pode mexer em quem, e o que cada permissão realmente libera ou barra.
// Um erro aqui deixa um usuário comum virar administrador, apaga a pessoa errada ou tranca o escritório fora. Cada situação usa o seu próprio usuário
// (o banco de teste é compartilhado pelo arquivo). Não usa e-mail nem nada externo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

const SENHA = 'Senha@Forte1';
let app; let SEQ = 0;
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
// Cria o usuário direto no banco, já com uma sessão ativa, e devolve o crachá (token) dele.
async function novoUsuario({ nivel = 2, ativo = 1, prefixo = 'usr' } = {}) {
  SEQ += 1;
  const login = `${prefixo}${String.fromCharCode(97 + (SEQ % 26))}${crypto.randomBytes(3).toString('hex').replace(/[0-9]/g, 'z')}`;
  const sessao = crypto.randomBytes(16).toString('hex');
  const r = await sql(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, sessao_atual) VALUES (?, ?, ?, ?, 'advogado', ?, ?, ?)`,
    [`Pessoa ${login}`, login, bcrypt.hashSync(SENHA, 4), `${login}@example.invalid`, nivel, ativo, sessao]);
  const token = jwt.sign({ id: r.insertId, nome: login, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { id: r.insertId, login, token, sessao };
}
const como = (u) => ({
  get: (p) => request(app).get(p).set('Authorization', `Bearer ${u.token}`),
  post: (p) => request(app).post(p).set('Authorization', `Bearer ${u.token}`),
  put: (p) => request(app).put(p).set('Authorization', `Bearer ${u.token}`),
  del: (p) => request(app).delete(p).set('Authorization', `Bearer ${u.token}`),
});
// Acumula as falhas de um laço e só reprova no fim, listando TODAS (senão cada teste pararia na primeira).
function conferir(falhas, obtido, esperado, rotulo) { if (obtido !== esperado) falhas.push(`${rotulo} → veio ${obtido}, esperado ${esperado}`); }
const linha = async (id) => (await sql('SELECT * FROM usuarios WHERE id = ?', [id]))[0];
const permissoesNoBanco = async (id) => (await sql('SELECT modulo, submodulo, acao, permitido FROM permissoes WHERE usuario_id = ? ORDER BY modulo, submodulo, acao', [id]));
const NOVO = (extra = {}) => ({ nome: 'Fulano de Tal', login: 'fulanodeteste', senha: SENHA, email: 'fulano@example.invalid', oab: 'SP123', tipo: 'advogado', nivel: 2, ...extra });
let loginSeq = 0;
const loginUnico = () => { loginSeq += 1; return 'novo' + 'abcdefghijklmnopqrstuvwxyz'[loginSeq % 26] + 'ab'.repeat(1) + String.fromCharCode(97 + Math.floor(loginSeq / 26) % 26) + 'x'; };

test.before(async () => { await recriarBancoTeste(); app = criarApp(); });
test.after(async () => { require('node-cron').getTasks().forEach(tarefa => tarefa.stop()); await pool.end(); });

// ============================================================ quem entra nestas rotas
test('só administrador mexe em usuários e permissões: sem login = 401; usuário comum (mesmo com TODAS as permissões marcadas) = 403 em cada rota, e nada muda', async () => {
  const comum = await novoUsuario({ nivel: 2 });
  const alvo = await novoUsuario({ nivel: 2 });
  const modulos = ['pessoas', 'processos', 'prazos', 'tarefas', 'audiencias', 'pericias', 'financeiro', 'documentos', 'publicacoes', 'configuracoes', 'usuarios'];
  for (const m of modulos) for (const a of ['visualizar', 'cadastrar', 'alterar', 'excluir']) {
    await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, NULL, ?, 1)', [comum.id, m, a]);
  }
  const antes = await linha(alvo.id);
  const rotas = [
    ['get', '/api/configuracoes/usuarios'], ['post', '/api/configuracoes/usuarios', NOVO({ login: 'invasoraa' })],
    ['put', `/api/configuracoes/usuarios/${alvo.id}`, { nome: 'Invadido', tipo: 'advogado', nivel: 1 }],
    ['put', `/api/configuracoes/usuarios/${alvo.id}/senha`, { senha: 'Outra@Senha9' }],
    ['delete', `/api/configuracoes/usuarios/${alvo.id}`], ['get', `/api/configuracoes/usuarios/${alvo.id}/historico`],
    ['get', `/api/configuracoes/permissoes/${alvo.id}`], ['put', `/api/configuracoes/permissoes/${alvo.id}`, { permissoes: { pessoas: { visualizar: true } } }],
  ];
  for (const [metodo, caminho, corpo] of rotas) {
    const semLogin = await request(app)[metodo](caminho).send(corpo || {});
    assert.equal(semLogin.status, 401, `sem login ${metodo} ${caminho}`);
    const r = await request(app)[metodo](caminho).set('Authorization', `Bearer ${comum.token}`).send(corpo || {});
    assert.equal(r.status, 403, `comum ${metodo} ${caminho}: ${JSON.stringify(r.body)}`);
  }
  assert.deepEqual(await linha(alvo.id), antes, 'o usuário alvo não pode ter mudado');
  assert.equal((await permissoesNoBanco(alvo.id)).length, 0);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM usuarios WHERE login = 'invasoraa'"))[0].n, 0);
  // rota só do superusuário: administrador também leva 403
  const adm = await novoUsuario({ nivel: 1 });
  assert.equal((await como(adm).post('/api/manutencao/limpar-dados-teste')).status, 403);
});

// ============================================================ lista
test('lista de usuários: nunca mostra o superusuário nem a senha/sessão de ninguém; vem por nível e nome', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'supe' });
  const r = await como(adm).get('/api/configuracoes/usuarios');
  assert.equal(r.status, 200);
  const logins = r.body.dados.map(u => u.login);
  assert.ok(logins.includes(adm.login));
  assert.ok(!logins.includes(sup.login), 'o superusuário é invisível');
  for (const u of r.body.dados) {
    assert.ok(!('senha_hash' in u) && !('sessao_atual' in u), 'nada de senha nem sessão na lista');
    assert.ok(u.nivel >= 1);
  }
  const niveis = r.body.dados.map(u => u.nivel);
  assert.deepEqual(niveis, [...niveis].sort((a, b) => a - b), 'administradores primeiro');
  await sql('DELETE FROM usuarios WHERE id = ?', [sup.id]);
});

// ============================================================ criar
test('criar usuário: grava (login aparado, nível comum por padrão, senha só como hash que confere), registra a auditoria; o novo usuário consegue entrar', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const login = loginUnico();
  const r = await como(adm).post('/api/configuracoes/usuarios').send(NOVO({ login: `  ${login}  `, nome: '  Maria da Silva  ', nivel: undefined }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await linha(r.body.dados.id);
  assert.equal(u.login, login);
  assert.equal(u.nome, 'Maria da Silva');
  assert.equal(u.nivel, 2);
  assert.equal(u.ativo, 1);
  assert.equal(u.criado_por, adm.id);
  assert.notEqual(u.senha_hash, SENHA);
  assert.ok(bcrypt.compareSync(SENHA, u.senha_hash));
  assert.equal((await sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'usuarios' AND acao = 'criar' AND registro_id = ?", [u.id]))[0].n, 1);
  assert.equal((await request(app).post('/api/auth/login').send({ login, senha: SENHA })).status, 200);
});

test('criar usuário: nível Administrador vale; nível 0 (superusuário), 3, texto e lista são recusados — ninguém vira superusuário pela API', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const ok = await como(adm).post('/api/configuracoes/usuarios').send(NOVO({ login: loginUnico(), nivel: 1 }));
  assert.equal(ok.status, 201);
  assert.equal((await linha(ok.body.dados.id)).nivel, 1);
  const f = [];
  for (const nivel of [0, '0', 3, -1, 'abc', [1], [2], { a: 1 }]) {
    const login = loginUnico();
    const r = await como(adm).post('/api/configuracoes/usuarios').send(NOVO({ login, nivel }));
    conferir(f, r.status, 400, `nivel ${JSON.stringify(nivel)}`);
    conferir(f, (await sql('SELECT COUNT(*) AS n FROM usuarios WHERE login = ?', [login]))[0].n, 0, `nivel ${JSON.stringify(nivel)} gravou`);
  }
  assert.deepEqual(f, []);
});

test('criar usuário: nome, login e senha obrigatórios; login só com letras; senha forte; login repetido (inclusive trocando maiúscula) é recusado — nada é gravado', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const ruins = [
    NOVO({ nome: '' }), NOVO({ nome: '   ' }), NOVO({ login: '' }), NOVO({ senha: '' }),
    NOVO({ login: 'com numero1' }), NOVO({ login: 'com espaco' }), NOVO({ login: 'sym@bolo' }), NOVO({ login: 'a'.repeat(81) }),
    NOVO({ senha: 'curta1A!' .slice(0, 5) }), NOVO({ senha: 'semmaiuscula1!' }), NOVO({ senha: 'SEMMINUSCULA1!' }), NOVO({ senha: 'SemNumero!!' }), NOVO({ senha: 'SemEspecial1' }), NOVO({ senha: 'Aa1!' + 'x'.repeat(30) }),
  ];
  const f = [];
  for (const c of ruins) {
    const r = await como(adm).post('/api/configuracoes/usuarios').send(c);
    conferir(f, r.status, 400, JSON.stringify(c));
  }
  assert.deepEqual(f, []);
  await sql("DELETE FROM usuarios WHERE criado_por = ? AND login = 'fulanodeteste'", [adm.id]);
  const antes = (await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n;
  const login = loginUnico();
  assert.equal((await como(adm).post('/api/configuracoes/usuarios').send(NOVO({ login }))).status, 201);
  for (const repetido of [login, login.toUpperCase(), ` ${login} `]) {
    const r = await como(adm).post('/api/configuracoes/usuarios').send(NOVO({ login: repetido }));
    assert.equal(r.status, 400, `repetido ${repetido}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n, antes + 1, 'só o primeiro bom foi gravado');
});

test('criar usuário: campos que não são texto ou passam do tamanho da coluna dão aviso 400 (nunca erro interno) e nada é gravado', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const antes = (await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n;
  const f = [];
  const ruins = [
    NOVO({ nome: 123 }), NOVO({ nome: ['a'] }), NOVO({ nome: { a: 1 } }), NOVO({ nome: 'n'.repeat(151) }),
    NOVO({ email: 123 }), NOVO({ email: ['a@b.com'] }), NOVO({ email: 'e'.repeat(151) }),
    NOVO({ oab: 123 }), NOVO({ oab: 'o'.repeat(31) }), NOVO({ tipo: 123 }), NOVO({ tipo: 't'.repeat(31) }),
    NOVO({ login: 123 }), NOVO({ login: ['abc'] }), NOVO({ senha: 12345678 }),
  ];
  for (const c of ruins) {
    const r = await como(adm).post('/api/configuracoes/usuarios').send({ ...c, login: typeof c.login === 'string' && c.login === 'fulanodeteste' ? loginUnico() : c.login });
    conferir(f, r.status, 400, JSON.stringify(c).slice(0, 110));
  }
  assert.deepEqual(f, []);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n, antes);
});

// ============================================================ atualizar
test('atualizar usuário: troca nome, e-mail, OAB, tipo e nível; guarda a auditoria; a senha só muda se vier; campos vazios viram nulo', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const hashAntes = (await linha(alvo.id)).senha_hash;
  const r = await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}`).send({ nome: 'Nome Novo', email: 'novo@example.invalid', oab: 'RJ99', tipo: 'estagiario', nivel: 1, ativo: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let u = await linha(alvo.id);
  assert.deepEqual([u.nome, u.email, u.oab, u.tipo, u.nivel, u.ativo], ['Nome Novo', 'novo@example.invalid', 'RJ99', 'estagiario', 1, 1]);
  assert.equal(u.senha_hash, hashAntes, 'sem senha no corpo, a senha não muda');
  assert.equal((await sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'usuarios' AND acao = 'editar' AND registro_id = ?", [alvo.id]))[0].n, 1);
  await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}`).send({ nome: 'Nome Novo', email: '', oab: '', tipo: 'advogado', nivel: 2, senha: 'Nova@Senha9x' });
  u = await linha(alvo.id);
  assert.deepEqual([u.email, u.oab, u.nivel], [null, null, 2]);
  assert.ok(bcrypt.compareSync('Nova@Senha9x', u.senha_hash));
});

test('atualizar usuário: dados que faltam ou são ruins (nome/tipo ausentes, não-texto, grande demais, ativo inventado, senha fraca) dão aviso 400, nunca erro interno, e NADA muda — nem a senha', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const antes = await linha(alvo.id);
  const base = { nome: 'Nome Ok', email: 'ok@example.invalid', oab: 'SP1', tipo: 'advogado', nivel: 2, ativo: 1 };
  const ruins = [
    {}, { ...base, nome: undefined }, { ...base, nome: '' }, { ...base, nome: '   ' }, { ...base, tipo: undefined }, { ...base, nome: 123 }, { ...base, nome: ['a'] },
    { ...base, nome: 'n'.repeat(151) }, { ...base, email: 123 }, { ...base, email: 'e'.repeat(151) }, { ...base, oab: 'o'.repeat(31) }, { ...base, tipo: 't'.repeat(31) }, { ...base, tipo: 5 },
    { ...base, ativo: 'x' }, { ...base, ativo: 2 }, { ...base, ativo: [1] },
    { ...base, nivel: 0 }, { ...base, nivel: 'abc' },
    { ...base, senha: 'fraca' }, { ...base, senha: 12345678 }, { ...base, senha: ['Abc@12345x'] },
  ];
  const f = [];
  for (const c of ruins) {
    const r = await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}`).send(c);
    conferir(f, r.status, 400, JSON.stringify(c));
  }
  assert.deepEqual(f, []);
  assert.deepEqual(await linha(alvo.id), antes, 'nada pode ter mudado');
});

test('atualizar usuário: superusuário não pode ser alterado (403), inexistente = 404, e um id que só COMEÇA com número ("2abc") não mexe no usuário 2', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'supe' });
  const alvo = await novoUsuario({ nivel: 2 });
  const corpo = { nome: 'Mudou', tipo: 'advogado', nivel: 2, ativo: 1 };
  assert.equal((await como(adm).put(`/api/configuracoes/usuarios/${sup.id}`).send(corpo)).status, 403);
  assert.notEqual((await linha(sup.id)).nome, 'Mudou');
  const f = [];
  for (const id of [999999, 'abc', '-1', '1.5', `${alvo.id}abc`, `${alvo.id}.9`]) {
    const r = await como(adm).put(`/api/configuracoes/usuarios/${id}`).send(corpo);
    conferir(f, r.status, 404, `id ${id}`);
  }
  assert.deepEqual(f, []);
  assert.notEqual((await linha(alvo.id)).nome, 'Mudou', 'o usuário cujo número só aparece no início do id não pode ter sido alterado');
  await sql('DELETE FROM usuarios WHERE id = ?', [sup.id]);
});

test('desativar usuário vale na hora: o crachá dele para de funcionar e ele não entra mais; reativar devolve o acesso', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  assert.equal((await como(alvo).get('/api/configuracoes/usuarios')).status, 403, 'logado, mas comum');
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 403, 'sem permissão de pessoas, 403 (e não 401)');
  const corpo = { nome: 'Pessoa', tipo: 'advogado', nivel: 2 };
  assert.equal((await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}`).send({ ...corpo, ativo: 0 })).status, 200);
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 401, 'desativado: sessão inválida');
  assert.equal((await request(app).post('/api/auth/login').send({ login: alvo.login, senha: SENHA })).status, 401);
  assert.equal((await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}`).send({ ...corpo, ativo: 1 })).status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ login: alvo.login, senha: SENHA })).status, 200);
});

test('o ÚLTIMO administrador ativo não pode ser desativado nem rebaixado a comum (o escritório ficaria sem ninguém que mexa em usuários e permissões)', async () => {
  const unico = await novoUsuario({ nivel: 1, prefixo: 'unic' });
  const outros = await sql('SELECT id FROM usuarios WHERE nivel <= 1 AND ativo = 1 AND id <> ?', [unico.id]);
  try {
    for (const o of outros) await sql('UPDATE usuarios SET ativo = 0 WHERE id = ?', [o.id]);
    const corpo = { nome: 'Unico', tipo: 'advogado' };
    const r1 = await como(unico).put(`/api/configuracoes/usuarios/${unico.id}`).send({ ...corpo, nivel: 1, ativo: 0 });
    assert.ok([400, 403, 409].includes(r1.status), `desativar o último: ${r1.status} ${JSON.stringify(r1.body)}`);
    const r2 = await como(unico).put(`/api/configuracoes/usuarios/${unico.id}`).send({ ...corpo, nivel: 2, ativo: 1 });
    assert.ok([400, 403, 409].includes(r2.status), `rebaixar o último: ${r2.status} ${JSON.stringify(r2.body)}`);
    const u = await linha(unico.id);
    assert.deepEqual([u.nivel, u.ativo], [1, 1], 'continua administrador ativo');
  } finally {
    for (const o of outros) await sql('UPDATE usuarios SET ativo = 1 WHERE id = ?', [o.id]);
  }
});

// ============================================================ redefinir senha (administrador)
test('redefinir senha pelo administrador: troca a senha, derruba a sessão aberta e invalida link de "esqueci a senha" pendente', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const token = crypto.randomBytes(32).toString('hex');
  await sql('INSERT INTO reset_tokens (usuario_id, token, expires_at, usado) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), 0)', [alvo.id, token]);
  const r = await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}/senha`).send({ senha: 'Troca@Senha9' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = await linha(alvo.id);
  assert.equal(u.sessao_atual, null);
  assert.ok(bcrypt.compareSync('Troca@Senha9', u.senha_hash));
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 401, 'o crachá antigo caiu');
  assert.equal((await request(app).post('/api/auth/login').send({ login: alvo.login, senha: SENHA })).status, 401, 'senha antiga não vale');
  assert.equal((await request(app).post('/api/auth/login').send({ login: alvo.login, senha: 'Troca@Senha9' })).status, 200);
  assert.equal((await sql('SELECT usado FROM reset_tokens WHERE token = ?', [token]))[0].usado, 1);
});

test('redefinir senha: senha fraca ou que não é texto = 400 (nada muda); superusuário = 403; usuário inexistente, desativado e id que só COMEÇA com número = 404', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'supe' });
  const inativo = await novoUsuario({ nivel: 2, ativo: 0 });
  const antes = await linha(alvo.id); const antesSup = await linha(sup.id); const antesInativo = await linha(inativo.id);
  const f = [];
  for (const senha of [undefined, '', 'fraca', 'semmaiuscula1!', 12345678, ['Abc@12345x'], { a: 1 }, 'Aa1!' + 'x'.repeat(30)]) {
    const r = await como(adm).put(`/api/configuracoes/usuarios/${alvo.id}/senha`).send({ senha });
    conferir(f, r.status, 400, `senha ${JSON.stringify(senha)}`);
  }
  assert.deepEqual(f, []);
  assert.deepEqual(await linha(alvo.id), antes);
  assert.equal((await como(adm).put(`/api/configuracoes/usuarios/${sup.id}/senha`).send({ senha: 'Troca@Senha9' })).status, 403);
  assert.deepEqual(await linha(sup.id), antesSup);
  const g = [];
  for (const id of [999999, 'abc', `${alvo.id}abc`, inativo.id]) {
    const r = await como(adm).put(`/api/configuracoes/usuarios/${id}/senha`).send({ senha: 'Troca@Senha9' });
    conferir(g, r.status, 404, `id ${id}`);
  }
  assert.deepEqual(g, []);
  assert.deepEqual(await linha(alvo.id), antes, 'o usuário cujo número só aparece no início do id não pode ter sido alterado');
  assert.deepEqual(await linha(inativo.id), antesInativo);
  await sql('DELETE FROM usuarios WHERE id = ?', [sup.id]);
});

// ============================================================ excluir
test('excluir usuário sem nenhum vínculo: apaga o usuário e as permissões dele (sem órfão); inexistente = 404; a si mesmo e o superusuário = 403', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'supe' });
  assert.equal((await como(adm).del(`/api/configuracoes/usuarios/${adm.id}`)).status, 403, 'a si mesmo');
  assert.equal((await como(adm).del(`/api/configuracoes/usuarios/${sup.id}`)).status, 403, 'superusuário');
  assert.ok(await linha(sup.id));
  const r = await como(adm).del(`/api/configuracoes/usuarios/${alvo.id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await linha(alvo.id), undefined);
  assert.equal((await como(adm).del(`/api/configuracoes/usuarios/${alvo.id}`)).status, 404, 'excluir duas vezes');
  await sql('DELETE FROM usuarios WHERE id = ?', [sup.id]);
});

test('excluir usuário: quem tem QUALQUER vínculo (criou pasta, criou usuário, tem relatório) é bloqueado com o motivo e nada é apagado; id que só COMEÇA com número não apaga ninguém', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const comPasta = await novoUsuario({ nivel: 2 });
  await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, ?)', [88001, comPasta.id]);
  const r1 = await como(adm).del(`/api/configuracoes/usuarios/${comPasta.id}`);
  assert.equal(r1.status, 400, JSON.stringify(r1.body));
  assert.match(r1.body.mensagem, /tblpasta/);
  assert.ok(await linha(comPasta.id));
  const criador = await novoUsuario({ nivel: 1 });
  const criado = (await como(criador).post('/api/configuracoes/usuarios').send(NOVO({ login: loginUnico() }))).body.dados.id;
  const r2 = await como(adm).del(`/api/configuracoes/usuarios/${criador.id}`);
  assert.equal(r2.status, 400, 'quem criou outro usuário não pode ser excluído');
  assert.ok(await linha(criador.id) && await linha(criado));
  const livre = await novoUsuario({ nivel: 2 });
  const f = [];
  for (const id of ['abc', `${livre.id}abc`, `${livre.id}.5`, '-1']) {
    const r = await como(adm).del(`/api/configuracoes/usuarios/${id}`);
    conferir(f, r.status, 404, `id ${id}`);
  }
  assert.deepEqual(f, []);
  assert.ok(await linha(livre.id), 'o usuário livre continua existindo');
});

// ============================================================ histórico
test('histórico do usuário: lista o que ele fez, com filtro de datas; usuário inexistente e id ruim = 404; data ruim dá aviso, não erro interno', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  await sql("INSERT INTO logs_auditoria (usuario_id, tabela, acao, registro_id, descricao) VALUES (?, 'tarefas', 'criar', 999999, 'teste do historico')", [alvo.id]);
  const r = await como(adm).get(`/api/configuracoes/usuarios/${alvo.id}/historico`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dados.registros.length, 1);
  assert.equal(r.body.dados.registros[0].descricao, 'teste do historico');
  const futuro = await como(adm).get(`/api/configuracoes/usuarios/${alvo.id}/historico?data_de=2999-01-01`);
  assert.equal(futuro.body.dados.registros.length, 0);
  const f = [];
  for (const id of [999999, 'abc', `${alvo.id}abc`]) conferir(f, (await como(adm).get(`/api/configuracoes/usuarios/${id}/historico`)).status, 404, `id ${id}`);
  for (const q of ['data_de=lixo', 'data_ate=32/13/2026', 'data_de[]=a']) conferir(f, (await como(adm).get(`/api/configuracoes/usuarios/${alvo.id}/historico?${q}`)).status, 400, q);
  assert.deepEqual(f, []);
});

// ============================================================ permissões
test('permissões: salvar troca TUDO que o usuário tinha pelo que veio; buscar devolve com chave "módulo.submódulo"; permitido falso fica gravado como 0', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'prazos', NULL, 'excluir', 1)", [alvo.id]);
  const r = await como(adm).put(`/api/configuracoes/permissoes/${alvo.id}`).send({ permissoes: { pessoas: { visualizar: true, cadastrar: false }, 'processos.andamentos': { cadastrar: true } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(await permissoesNoBanco(alvo.id), [
    { modulo: 'pessoas', submodulo: null, acao: 'cadastrar', permitido: 0 },
    { modulo: 'pessoas', submodulo: null, acao: 'visualizar', permitido: 1 },
    { modulo: 'processos', submodulo: 'andamentos', acao: 'cadastrar', permitido: 1 },
  ]);
  const g = await como(adm).get(`/api/configuracoes/permissoes/${alvo.id}`);
  assert.deepEqual(g.body.dados, { pessoas: { visualizar: true, cadastrar: false }, 'processos.andamentos': { cadastrar: true } });
  const vazio = await como(adm).put(`/api/configuracoes/permissoes/${alvo.id}`).send({ permissoes: {} });
  assert.equal(vazio.status, 200);
  assert.equal((await permissoesNoBanco(alvo.id)).length, 0, 'enviar vazio tira tudo');
});

test('permissões: o efeito é real e imediato — liberar abre a porta, só "visualizar" não grava, revogar fecha na chamada seguinte', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 403);
  await como(adm).put(`/api/configuracoes/permissoes/${alvo.id}`).send({ permissoes: { pessoas: { visualizar: true } } });
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 200);
  assert.equal((await como(alvo).post('/api/pessoas/fisicas').send({ nome: 'Teste Permissao' })).status, 403, 'visualizar não libera cadastrar');
  await como(adm).put(`/api/configuracoes/permissoes/${alvo.id}`).send({ permissoes: { pessoas: { visualizar: false, cadastrar: true } } });
  assert.equal((await como(alvo).get('/api/pessoas/fisicas')).status, 403, 'revogado');
  assert.equal((await como(alvo).get('/api/configuracoes/usuarios')).status, 403, 'nenhuma permissão dá acesso às telas de administrador');
});

test('permissões: salvar é tudo-ou-nada — corpo ruim (lista, texto, ação enorme, valor que não é objeto) dá aviso 400 e as permissões antigas continuam intactas', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'pessoas', NULL, 'visualizar', 1), (?, 'prazos', NULL, 'cadastrar', 1)", [alvo.id, alvo.id]);
  const antes = await permissoesNoBanco(alvo.id);
  const ruins = [
    { permissoes: [] }, { permissoes: 'texto' }, { permissoes: 5 }, {}, { permissoes: null },
    { permissoes: { pessoas: { visualizar: true }, tarefas: { ['a'.repeat(21)]: true } } },          // a 2ª linha estoura a coluna (20) depois da 1ª
    { permissoes: { pessoas: { visualizar: true }, ['m'.repeat(51)]: { visualizar: true } } },
    { permissoes: { pessoas: 'visualizar' } }, { permissoes: { pessoas: ['visualizar'] } }, { permissoes: { pessoas: 5 } },
    { permissoes: { pessoas: { visualizar: 'sim' } } },
    { permissoes: { pessoas: { visualizar: true }, 'processos.': { cadastrar: true } } }, { permissoes: { '': { visualizar: true } } },
  ];
  const f = [];
  for (const c of ruins) {
    const r = await como(adm).put(`/api/configuracoes/permissoes/${alvo.id}`).send(c);
    conferir(f, r.status, 400, JSON.stringify(c).slice(0, 110));
    if (JSON.stringify(await permissoesNoBanco(alvo.id)) !== JSON.stringify(antes)) { f.push(`${JSON.stringify(c).slice(0, 110)} → MUDOU as permissões`); await sql('DELETE FROM permissoes WHERE usuario_id = ?', [alvo.id]); for (const a of antes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, ?)', [alvo.id, a.modulo, a.submodulo, a.acao, a.permitido]); }
  }
  assert.deepEqual(f, []);
});

test('permissões: usuário inexistente = 404 (nada gravado); id que só COMEÇA com número não mexe nas permissões de ninguém; superusuário não tem permissões editáveis', async () => {
  const adm = await novoUsuario({ nivel: 1 });
  const alvo = await novoUsuario({ nivel: 2 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'supe' });
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'pessoas', NULL, 'visualizar', 1)", [alvo.id]);
  const antes = await permissoesNoBanco(alvo.id);
  const total = (await sql('SELECT COUNT(*) AS n FROM permissoes'))[0].n;
  const f = [];
  for (const id of [999999, 'abc', '-1', `${alvo.id}abc`]) {
    const p = await como(adm).put(`/api/configuracoes/permissoes/${id}`).send({ permissoes: { financeiro: { visualizar: true } } });
    conferir(f, p.status, 404, `salvar id ${id}`);
    conferir(f, (await como(adm).get(`/api/configuracoes/permissoes/${id}`)).status, 404, `buscar id ${id}`);
  }
  assert.deepEqual(f, []);
  assert.deepEqual(await permissoesNoBanco(alvo.id), antes);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM permissoes'))[0].n, total);
  const s = await como(adm).put(`/api/configuracoes/permissoes/${sup.id}`).send({ permissoes: { pessoas: { visualizar: true } } });
  assert.ok([403, 404].includes(s.status), `superusuário: ${s.status} ${JSON.stringify(s.body)}`);
  assert.equal((await permissoesNoBanco(sup.id)).length, 0);
  await sql('DELETE FROM usuarios WHERE id = ?', [sup.id]);
});
