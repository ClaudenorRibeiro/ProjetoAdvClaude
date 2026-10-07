// Teste de servidor de LOGIN, SESSÃO, SENHA e "ESQUECI A SENHA". Quem entra e quem não entra: um erro aqui deixa alguém ver o que não deve,
// ou tranca o escritório fora. E-mail: servidor SMTP falso local (nada sai para a internet). Cada situação usa o seu próprio usuário, porque o limite
// de tentativas de login é por login e a sessão é única por usuário (entrar de novo derruba a anterior).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { iniciarSmtpFalso } = require('../support/smtpFalso');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

const SENHA = 'Senha@Forte1';
let app; let smtp; let SEQ = 0;
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
// Cria um usuário direto no banco (hash barato: o que se testa é a regra do sistema, não o custo do bcrypt).
async function novoUsuario({ nivel = 2, ativo = 1, email = undefined, senha = SENHA, prefixo = 'usr' } = {}) {
  SEQ += 1;
  const login = `${prefixo}${SEQ}x${crypto.randomBytes(3).toString('hex')}`;
  const r = await sql(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo) VALUES (?, ?, ?, ?, 'advogado', ?, ?)`,
    [`Pessoa ${login}`, login, bcrypt.hashSync(senha, 4), email === undefined ? `${login}@example.invalid` : email, nivel, ativo]);
  return { id: r.insertId, login, senha };
}
const entrar = (login, senha, extra = {}) => request(app).post('/api/auth/login').send({ login, senha, ...extra });
const comToken = (t) => ({ get: (p) => request(app).get(p).set('Authorization', `Bearer ${t}`), post: (p) => request(app).post(p).set('Authorization', `Bearer ${t}`), put: (p) => request(app).put(p).set('Authorization', `Bearer ${t}`) });
async function logar(u) { const r = await entrar(u.login, u.senha); assert.equal(r.status, 200, `login de ${u.login}: ${JSON.stringify(r.body)}`); return r.body.dados; }

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  smtp = await iniciarSmtpFalso();
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 's'; process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
  process.env.FRONTEND_URL = 'http://127.0.0.1:4173';
});
test.after(async () => {
  await smtp.parar();
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ============================================================ login
test('login certo: devolve o token, a chave da sessão, os dados do usuário, as permissões e o tempo de inatividade — e nunca o hash da senha', async () => {
  const u = await novoUsuario({ nivel: 2 });
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'pessoas', NULL, 'visualizar', 1), (?, 'processos', 'andamentos', 'cadastrar', 0)", [u.id, u.id]);
  const r = await entrar(u.login, u.senha);
  assert.equal(r.status, 200);
  const d = r.body.dados;
  assert.equal(d.usuario.id, u.id);
  assert.equal(d.usuario.login, u.login);
  assert.equal(d.usuario.nivel, 2);
  assert.deepEqual(d.permissoes, { pessoas: { visualizar: true }, 'processos.andamentos': { cadastrar: false } });
  assert.ok(d.tempo_inatividade_min >= 15);
  assert.ok(typeof d.sessao === 'string' && d.sessao.length >= 32);
  const carga = jwt.verify(d.token, process.env.JWT_SECRET);
  assert.deepEqual([carga.id, carga.nivel, carga.sessao], [u.id, 2, d.sessao]);
  assert.ok(!JSON.stringify(r.body).includes('senha_hash') && !JSON.stringify(r.body).includes('$2'), 'o hash da senha não pode sair na resposta');
  const linha = (await sql('SELECT ultimo_acesso, sessao_atual FROM usuarios WHERE id = ?', [u.id]))[0];
  assert.ok(linha.ultimo_acesso);
  assert.equal(linha.sessao_atual, d.sessao);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE usuario_id = ? AND tabela = 'acesso' AND acao = 'login'", [u.id]))[0].n, 1);
  // espaços em volta do login não atrapalham
  assert.equal((await entrar(`  ${u.login}  `, u.senha)).status, 200);
});

test('login errado: senha errada, login que não existe e usuário desativado recebem a MESMA resposta (não revela quem existe); campos vazios = 400', async () => {
  const ok = await novoUsuario();
  const inativo = await novoUsuario({ ativo: 0 });
  const respostas = [await entrar(ok.login, 'SenhaErrada1!'), await entrar('ninguem-com-esse-login', SENHA), await entrar(inativo.login, inativo.senha)];
  for (const r of respostas) assert.equal(r.status, 401);
  assert.deepEqual([...new Set(respostas.map(r => r.body.mensagem))], ['Login ou senha incorretos']);
  assert.equal((await entrar('', SENHA)).status, 400);
  assert.equal((await entrar(ok.login, '')).status, 400);
  assert.equal((await request(app).post('/api/auth/login').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/login')).status, 400);
});

test('sistema ainda sem setup concluído: usuário comum não entra (403) e o superusuário entra', async () => {
  const comum = await novoUsuario({ nivel: 2 });
  const sup = await novoUsuario({ nivel: 0, prefixo: 'sup' });
  await sql('UPDATE configuracoes_escritorio SET setup_concluido = 0');
  try {
    const r = await entrar(comum.login, comum.senha);
    assert.equal(r.status, 403);
    assert.match(r.body.mensagem, /ainda não foi configurado/);
    assert.equal((await entrar(sup.login, sup.senha)).status, 200);
  } finally { await sql('UPDATE configuracoes_escritorio SET setup_concluido = 1'); }
  assert.equal((await entrar(comum.login, comum.senha)).status, 200);
});

// ============================================================ sessão única e token
test('sessão única: entrar em OUTRO navegador derruba o primeiro; o MESMO navegador (mesma chave) mantém as duas abas', async () => {
  const u = await novoUsuario();
  const a = await logar(u);
  assert.equal((await comToken(a.token).get('/api/auth/verificar')).status, 200);
  const b = await logar(u);                                                       // outro navegador: não manda a chave
  assert.notEqual(b.sessao, a.sessao);
  const derrubada = await comToken(a.token).get('/api/auth/verificar');
  assert.equal(derrubada.status, 401);
  assert.equal(derrubada.body.codigo, 'SESSAO_ENCERRADA');
  assert.equal((await comToken(b.token).get('/api/auth/verificar')).status, 200);
  // mesma chave (aba irmã do mesmo navegador): as duas continuam valendo
  const c = (await entrar(u.login, u.senha, { sessao: b.sessao })).body.dados;
  assert.equal(c.sessao, b.sessao);
  assert.equal((await comToken(b.token).get('/api/auth/verificar')).status, 200);
  assert.equal((await comToken(c.token).get('/api/auth/verificar')).status, 200);
  // chave inventada não vale como identidade: gera uma nova e derruba as outras
  const d = (await entrar(u.login, u.senha, { sessao: 'chave-inventada' })).body.dados;
  assert.notEqual(d.sessao, 'chave-inventada');
  assert.equal((await comToken(b.token).get('/api/auth/verificar')).status, 401);
});

test('usuário desativado ou rebaixado perde o acesso NA HORA (sem esperar o token vencer)', async () => {
  const adm = await novoUsuario({ nivel: 1, prefixo: 'adm' });
  const t = (await logar(adm)).token;
  assert.equal((await comToken(t).get('/api/configuracoes/usuarios')).status, 200);
  await sql('UPDATE usuarios SET nivel = 2 WHERE id = ?', [adm.id]);
  assert.equal((await comToken(t).get('/api/configuracoes/usuarios')).status, 403);          // rebaixado: a rota de administrador fecha na hora (403, sem derrubar a sessão)
  assert.equal((await comToken(t).get('/api/auth/verificar')).status, 200);
  await sql('UPDATE usuarios SET ativo = 0 WHERE id = ?', [adm.id]);
  assert.equal((await comToken(t).get('/api/auth/verificar')).status, 401);                   // desativado: sai
  await sql('DELETE FROM usuarios WHERE id = ?', [adm.id]);
  assert.equal((await comToken(t).get('/api/auth/verificar')).status, 401);                   // apagado: sai
});

test('token ruim nunca dá "Erro interno": ausente, lixo, assinatura errada, vencido e sem identificador do usuário', async () => {
  const u = await novoUsuario();
  const valido = (await logar(u)).token;
  const assinaturaErrada = jwt.sign({ id: u.id, nivel: 2, sessao: 'x' }, 'outra-chave-secreta-qualquer-com-mais-de-32-caracteres');
  const vencido = jwt.sign({ id: u.id, nivel: 2, sessao: 'x' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const semId = jwt.sign({ nivel: 2, sessao: 'x' }, process.env.JWT_SECRET);
  const idLixo = jwt.sign({ id: { $gt: 0 }, nivel: 0, sessao: 'x' }, process.env.JWT_SECRET);
  const semSessao = jwt.sign({ id: u.id, nivel: 2 }, process.env.JWT_SECRET);
  const nivelFalso = jwt.sign({ id: u.id, nivel: 0, sessao: 'x' }, process.env.JWT_SECRET);   // o token diz "superusuário", o banco diz comum
  for (const [nome, t] of Object.entries({ lixo: 'abc', assinaturaErrada, vencido, semId, idLixo, semSessao, nivelFalso })) {
    const r = await request(app).get('/api/auth/verificar').set('Authorization', `Bearer ${t}`);
    assert.equal(r.status, 401, nome);
  }
  assert.equal((await request(app).get('/api/auth/verificar')).status, 401);
  assert.equal((await request(app).get('/api/auth/verificar').set('Authorization', 'Basic abc')).status, 401);
  // com a chave de sessão certa, o nível do TOKEN não manda: vale o do banco
  const sessao = (await sql('SELECT sessao_atual FROM usuarios WHERE id = ?', [u.id]))[0].sessao_atual;
  const nivelMentido = jwt.sign({ id: u.id, nivel: 0, sessao }, process.env.JWT_SECRET);
  const r = await comToken(nivelMentido).get('/api/configuracoes/usuarios');
  assert.equal(r.status, 403);
  assert.equal((await comToken(valido).get('/api/auth/verificar')).status, 200);              // e o token verdadeiro continua valendo
});

test('logout registra a saída (e o motivo "inatividade"); sem token não registra', async () => {
  const u = await novoUsuario();
  const t = (await logar(u)).token;
  assert.equal((await comToken(t).post('/api/auth/logout').send({})).status, 200);
  assert.equal((await comToken(t).post('/api/auth/logout').send({ motivo: 'inatividade' })).status, 200);
  const logs = await sql("SELECT descricao FROM logs_auditoria WHERE usuario_id = ? AND acao = 'logout' ORDER BY id", [u.id]);
  assert.deepEqual(logs.map(l => l.descricao), ['Logout do sistema', 'Logout por inatividade']);
  assert.equal((await request(app).post('/api/auth/logout').send({})).status, 401);
});

test('limite de tentativas: depois de 10 erros o login fica bloqueado (até com a senha certa), sem atrapalhar os outros usuários', async () => {
  const alvo = await novoUsuario();
  const outro = await novoUsuario();
  for (let i = 0; i < 10; i += 1) assert.equal((await entrar(alvo.login, 'Errada@123')).status, 401);
  const bloqueado = await entrar(alvo.login, alvo.senha);
  assert.equal(bloqueado.status, 429);
  assert.match(bloqueado.body.mensagem, /Muitas tentativas/);
  assert.equal((await entrar(outro.login, outro.senha)).status, 200);                           // o limite é por login
});

// ============================================================ entradas ruins no login
test('login com dado que não é texto (número, lista, objeto) dá aviso 400/401 — nunca "Erro interno"', async () => {
  const u = await novoUsuario();
  const ruins = [{ login: 123, senha: SENHA }, { login: [u.login], senha: SENHA }, { login: { a: 1 }, senha: SENHA }, { login: u.login, senha: 12345678 },
    { login: u.login, senha: [SENHA] }, { login: u.login, senha: { a: 1 } }, { login: true, senha: true }];
  const falhas = [];
  for (const corpo of ruins) {
    const r = await request(app).post('/api/auth/login').send(corpo);
    if (r.status !== 400 && r.status !== 401) falhas.push(`${JSON.stringify(corpo)} → ${r.status}`);
  }
  assert.deepEqual(falhas, [], 'estes casos não deram aviso 400/401');
  assert.equal((await entrar(u.login, u.senha)).status, 200);                                  // e o login normal continua funcionando
});

// ============================================================ verificar e trocar a senha
test('trocar a própria senha: confere a atual, a confirmação e as regras de força; depois a sessão cai e só a nova senha entra', async () => {
  const u = await novoUsuario();
  const t = (await logar(u)).token;
  const trocar = (corpo) => comToken(t).put('/api/auth/trocar-senha').send(corpo);
  assert.equal((await trocar({})).status, 400);
  assert.equal((await trocar({ senha_atual: u.senha, nova_senha: 'Nova@Senha1' })).status, 400);                         // falta a confirmação
  assert.match((await trocar({ senha_atual: u.senha, nova_senha: 'Nova@Senha1', confirmar_senha: 'Outra@Senha1' })).body.mensagem, /não coincidem/);
  const r = await trocar({ senha_atual: 'Errada@123', nova_senha: 'Nova@Senha1', confirmar_senha: 'Nova@Senha1' });
  assert.equal(r.status, 400);
  assert.equal(r.body.mensagem, 'Senha atual incorreta');
  const fracas = [['Ab1!', /mínimo 8/], ['Aa1!' + 'x'.repeat(20), /máximo 20/], ['semmaiuscula1!', /maiúscula/], ['SEMMINUSCULA1!', /minúscula/], ['SemNumero!!', /número/], ['SemEspecial12', /especial/]];
  for (const [fraca, padrao] of fracas) {
    const f = await trocar({ senha_atual: u.senha, nova_senha: fraca, confirmar_senha: fraca });
    assert.equal(f.status, 400, fraca);
    assert.match(f.body.mensagem, padrao, fraca);
  }
  for (const numero of [12345678, ['Nova@Senha1'], { a: 1 }]) assert.ok((await trocar({ senha_atual: u.senha, nova_senha: numero, confirmar_senha: numero })).status < 500);
  assert.equal((await entrar(u.login, u.senha)).status, 200);                                  // nada disso trocou a senha (o login acima derrubou o token t; veja abaixo)
  const t2 = (await logar(u)).token;
  const ok = await comToken(t2).put('/api/auth/trocar-senha').send({ senha_atual: u.senha, nova_senha: 'Nova@Senha1', confirmar_senha: 'Nova@Senha1' });
  assert.equal(ok.status, 200);
  assert.equal((await comToken(t2).get('/api/auth/verificar')).status, 401);                   // a sessão cai
  assert.equal((await entrar(u.login, u.senha)).status, 401);                                  // a senha antiga não vale mais
  assert.equal((await entrar(u.login, 'Nova@Senha1')).status, 200);
  assert.equal((await request(app).put('/api/auth/trocar-senha').send({})).status, 401);
});

test('confirmar a senha (para ações sensíveis): certa = 200, errada = 403 (não derruba a sessão), vazia = 400', async () => {
  const u = await novoUsuario();
  const t = (await logar(u)).token;
  assert.equal((await comToken(t).post('/api/auth/verificar-senha').send({ senha: u.senha })).status, 200);
  const errada = await comToken(t).post('/api/auth/verificar-senha').send({ senha: 'Errada@123' });
  assert.equal(errada.status, 403);
  assert.equal((await comToken(t).get('/api/auth/verificar')).status, 200);                    // continua logado
  assert.equal((await comToken(t).post('/api/auth/verificar-senha').send({})).status, 400);
  assert.ok((await comToken(t).post('/api/auth/verificar-senha').send({ senha: 12345 })).status < 500);
  assert.equal((await request(app).post('/api/auth/verificar-senha').send({ senha: u.senha })).status, 401);
});

// ============================================================ "esqueci a senha" e redefinição
const GENERICA = 'Se o login ou e-mail estiver cadastrado, você receberá um e-mail com o link de redefinição.';
async function tokenDe(u) { return (await sql('SELECT token FROM reset_tokens WHERE usuario_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1', [u.id]))[0]?.token; }
const decodificar = (dados) => dados.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

test('esqueci a senha: a resposta é a MESMA existindo ou não o usuário; o link chega por e-mail e vale 1 hora; um pedido novo invalida o anterior', async () => {
  const u = await novoUsuario();
  const semEmail = await novoUsuario({ email: null });
  const inativo = await novoUsuario({ ativo: 0 });
  const pedidos = [await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: u.login }),
    await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: 'nao-existe-nenhum-usuario' }),
    await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: semEmail.login }),
    await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: inativo.login })];
  for (const r of pedidos) { assert.equal(r.status, 200); assert.equal(r.body.mensagem, GENERICA); }
  assert.equal(await tokenDe(semEmail), undefined);
  assert.equal(await tokenDe(inativo), undefined);
  const t1 = await tokenDe(u);
  assert.match(t1, /^[0-9a-f]{64}$/);
  const linha = (await sql('SELECT TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS min FROM reset_tokens WHERE token = ?', [t1]))[0];
  assert.ok(linha.min >= 58 && linha.min <= 60, `validade de ${linha.min} min`);
  const email = smtp.registro.mensagens.filter(m => m.para.includes(`${u.login}@example.invalid`)).at(-1);
  assert.ok(email, 'o e-mail não chegou');
  assert.match(decodificar(email.dados), new RegExp(`http://127\\.0\\.0\\.1:4173/redefinir-senha\\?token=${t1}`));
  assert.equal(smtp.registro.mensagens.filter(m => m.para.some(p => p.startsWith(semEmail.login) || p.startsWith('nao-existe'))).length, 0);
  // pedir de novo invalida o link anterior e cria outro
  await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: `${u.login}@example.invalid` });   // também aceita o e-mail
  const t2 = await tokenDe(u);
  assert.notEqual(t2, t1);
  assert.equal((await sql('SELECT usado FROM reset_tokens WHERE token = ?', [t1]))[0].usado, 1);
  assert.equal((await request(app).get(`/api/auth/validar-token/${t1}`)).status, 400);
  assert.equal((await request(app).get(`/api/auth/validar-token/${t2}`)).status, 200);
  assert.equal((await request(app).post('/api/auth/esqueci-senha').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: '   ' })).status, 400);
});

test('esqueci a senha: o limite de pedidos (5 em 15 min por login) barra quem martela', async () => {
  const u = await novoUsuario();
  const respostas = [];
  for (let i = 0; i < 6; i += 1) respostas.push(await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: u.login }));
  assert.deepEqual(respostas.map(r => r.status), [200, 200, 200, 200, 200, 429]);
});

test('link de redefinição: valida o link, recusa senha fraca SEM gastar o link, redefine uma única vez e derruba as sessões abertas', async () => {
  const u = await novoUsuario();
  const aberta = (await logar(u)).token;
  await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: u.login });
  const t = await tokenDe(u);
  const valida = await request(app).get(`/api/auth/validar-token/${t}`);
  assert.equal(valida.status, 200);
  assert.equal(valida.body.dados.nome, `Pessoa ${u.login}`);
  assert.equal((await request(app).post('/api/auth/redefinir-senha').send({ token: t })).status, 400);
  assert.equal((await request(app).post('/api/auth/redefinir-senha').send({ senha: 'Nova@Senha1' })).status, 400);
  const fraca = await request(app).post('/api/auth/redefinir-senha').send({ token: t, senha: 'fraca' });
  assert.equal(fraca.status, 400);
  assert.equal((await sql('SELECT usado FROM reset_tokens WHERE token = ?', [t]))[0].usado, 0);          // senha fraca não gasta o link
  const ok = await request(app).post('/api/auth/redefinir-senha').send({ token: t, senha: 'Nova@Senha1' });
  assert.equal(ok.status, 200);
  assert.equal((await comToken(aberta).get('/api/auth/verificar')).status, 401);                          // sessão aberta cai
  assert.equal((await entrar(u.login, u.senha)).status, 401);
  assert.equal((await entrar(u.login, 'Nova@Senha1')).status, 200);
  const de_novo = await request(app).post('/api/auth/redefinir-senha').send({ token: t, senha: 'Outra@Senha1' });
  assert.equal(de_novo.status, 400);                                                                       // o link só vale uma vez
  assert.equal((await entrar(u.login, 'Outra@Senha1')).status, 401);
  assert.equal((await request(app).get(`/api/auth/validar-token/${t}`)).status, 400);
});

test('link vencido, inventado ou de formato estranho: aviso 400 — nunca "Erro interno", e nada é alterado', async () => {
  const u = await novoUsuario();
  await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: u.login });
  const t = await tokenDe(u);
  await sql('UPDATE reset_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE token = ?', [t]);
  assert.equal((await request(app).get(`/api/auth/validar-token/${t}`)).status, 400);
  const venc = await request(app).post('/api/auth/redefinir-senha').send({ token: t, senha: 'Nova@Senha1' });
  assert.equal(venc.status, 400);
  assert.match(venc.body.mensagem, /inválido ou expirado/);
  const hashAntes = (await sql('SELECT senha_hash FROM usuarios WHERE id = ?', [u.id]))[0].senha_hash;
  const ruins = ['abc', 'x'.repeat(200), '0'.repeat(64), '%00', "' OR 1=1 --", '../../etc/passwd'];
  for (const ruim of ruins) assert.equal((await request(app).get(`/api/auth/validar-token/${encodeURIComponent(ruim)}`)).status, 400, ruim);
  assert.equal((await sql('SELECT senha_hash FROM usuarios WHERE id = ?', [u.id]))[0].senha_hash, hashAntes);
  // SEGURANÇA: um token que não é texto (true, número, lista...) NUNCA pode "acertar" o link de OUTRA pessoa.
  // Cria uma vítima com um link válido cujo texto começa com o dígito 1 (o MySQL compara texto com número pelo valor numérico do começo do texto).
  const vitima = await novoUsuario();
  const linkDaVitima = '1' + 'abcdef0123456789'.repeat(4).slice(0, 63);
  await sql('INSERT INTO reset_tokens (usuario_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [vitima.id, linkDaVitima]);
  const hashVitima = (await sql('SELECT senha_hash FROM usuarios WHERE id = ?', [vitima.id]))[0].senha_hash;
  const falhas = [];
  for (const token of ['abc', 123, ['a'], { a: 1 }, true, 1, [1], 1.0, "' OR 1=1 --", [linkDaVitima], '1']) {
    const r = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'Invasor@123' });
    const hashDepois = (await sql('SELECT senha_hash FROM usuarios WHERE id = ?', [vitima.id]))[0].senha_hash;
    if (r.status !== 400 || hashDepois !== hashVitima) falhas.push(`token ${JSON.stringify(token)} → ${r.status}${hashDepois !== hashVitima ? ' (A SENHA DE OUTRA PESSOA FOI TROCADA)' : ''}`);
    if (hashDepois !== hashVitima) await sql('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hashVitima, vitima.id]);
    await sql('UPDATE reset_tokens SET usado = 0 WHERE usuario_id = ?', [vitima.id]);
  }
  assert.deepEqual(falhas, [], 'estes tokens não deram aviso 400');
  assert.equal((await entrar(vitima.login, vitima.senha)).status, 200);                           // a vítima continua entrando com a senha dela
  assert.equal((await sql('SELECT senha_hash FROM usuarios WHERE id = ?', [u.id]))[0].senha_hash, hashAntes);
  const naoTexto = await request(app).post('/api/auth/esqueci-senha').send({ loginOuEmail: ['a'] });
  assert.ok(naoTexto.status >= 400 && naoTexto.status < 500);
});

// ============================================================ primeiro administrador
test('primeiro administrador: só antes do setup e sem nenhum administrador; depois a rota nunca mais cria ninguém', async () => {
  const corpo = { nome: 'Primeiro Admin', login: 'primeiroadmin', senha: 'Admin@Forte1', email: 'primeiro@example.invalid' };
  const post = (c = corpo) => request(app).post('/api/auth/criar-admin').send(c);
  const antes = (await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n;
  assert.equal((await post()).status, 400);                                                       // já existe administrador
  const admins = (await sql('SELECT id FROM usuarios WHERE nivel = 1')).map(a => a.id);
  await sql('UPDATE usuarios SET nivel = 2 WHERE nivel = 1');
  try {
    const concluido = await post();
    assert.equal(concluido.status, 400);                                                          // sem administrador, mas o setup já foi concluído: trava permanente
    assert.match(concluido.body.mensagem, /Administrador já cadastrado/);
    assert.equal((await sql('SELECT COUNT(*) AS n FROM usuarios'))[0].n, antes);
    await sql('UPDATE configuracoes_escritorio SET setup_concluido = 0');
    assert.equal((await post({ login: 'primeiroadmin', senha: corpo.senha })).status, 400);       // falta o nome
    assert.equal((await post({ ...corpo, senha: 'fraca' })).status, 400);
    assert.equal((await post({ ...corpo, login: 'adm teste' })).status < 500, true);
    const criado = await post();
    assert.equal(criado.status, 201);
    const u = (await sql('SELECT nivel, tipo, ativo FROM usuarios WHERE id = ?', [criado.body.dados.id]))[0];
    assert.deepEqual([u.nivel, u.tipo, u.ativo], [1, 'administrador', 1]);
    assert.equal((await post()).status, 400);                                                     // agora já existe
    await sql('DELETE FROM usuarios WHERE id = ?', [criado.body.dados.id]);
  } finally {
    await sql('UPDATE configuracoes_escritorio SET setup_concluido = 1');
    if (admins.length) await sql(`UPDATE usuarios SET nivel = 1 WHERE id IN (${admins.map(() => '?').join(',')})`, admins);
  }
});
