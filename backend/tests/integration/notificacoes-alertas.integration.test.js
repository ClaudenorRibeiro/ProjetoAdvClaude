// Teste de servidor de NOTIFICAÇÕES (o sino) e ALERTAS (e-mails e avisos automáticos): quem recebe, quando, quantas vezes, e o que nunca pode se perder.
// Um erro aqui deixa um prazo vencer sem ninguém ser avisado — e ninguém percebe, porque o aviso que falta não aparece em lugar nenhum.
// E-mail: servidor SMTP falso local (nada sai para a internet). Os avisos automáticos (que o relógio dispara) são chamados direto, sem esperar a hora.
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
const alertas = require('../../src/services/alertasService');
const cal = require('../../src/services/calendarioService');
const { hojeBrasilia } = require('../../src/utils/helpers');

let app; let smtp; let SEQ = 0; let senhaAceita = true;
const HOJE = hojeBrasilia();
const dia = (n) => hojeBrasilia(n);
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
async function novoUsuario({ nivel = 2, ativo = 1, email = true, notifTela = 1, notifEmail = 1, nome = null } = {}) {
  SEQ += 1;
  const login = `nt${SEQ}x${crypto.randomBytes(3).toString('hex')}`;
  const sessao = crypto.randomBytes(12).toString('hex');
  const r = await sql(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, sessao_atual, notif_tela, notif_email) VALUES (?, ?, ?, ?, 'advogado', ?, ?, ?, ?, ?)`,
    [nome || `Pessoa ${login}`, login, bcrypt.hashSync('Senha@Forte1', 4), email ? `${login}@example.invalid` : null, nivel, ativo, sessao, notifTela, notifEmail]);
  const token = jwt.sign({ id: r.insertId, nome: nome || `Pessoa ${login}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { id: r.insertId, login, token, email: email ? `${login}@example.invalid` : null, nome: nome || `Pessoa ${login}` };
}
const como = (u) => ({
  get: (p) => request(app).get(p).set('Authorization', `Bearer ${u.token}`),
  post: (p) => request(app).post(p).set('Authorization', `Bearer ${u.token}`),
  put: (p) => request(app).put(p).set('Authorization', `Bearer ${u.token}`),
  del: (p) => request(app).delete(p).set('Authorization', `Bearer ${u.token}`),
});
const notif = (usuarioId, so = '') => sql(`SELECT * FROM notificacoes WHERE usuario_id = ? ${so} ORDER BY id`, [usuarioId]);
// Lê o texto de um e-mail recebido pelo servidor falso (desfaz a codificação do e-mail).
function textoDoEmail(msg) {
  const [cab, ...resto] = msg.dados.split(/\r?\n\r?\n/);
  const corpo = resto.join('\n\n');
  if (/content-transfer-encoding:\s*base64/i.test(cab)) return Buffer.from(corpo.replace(/\s+/g, ''), 'base64').toString('utf8');
  return Buffer.from(corpo.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
}
// Assunto do e-mail já decodificado (o cabeçalho vem em pedaços "=?UTF-8?Q?...?=").
const assuntoDoEmail = (msg) => {
  const m = msg.dados.match(/^Subject:\s*(.*(?:\r?\n[ \t].*)*)/mi);
  if (!m) return '';
  const bruto = m[1].replace(/\r?\n[ \t]/g, '').replace(/\?=\s*=\?UTF-8\?Q\?/gi, '');
  return bruto.replace(/=\?UTF-8\?Q\?(.*?)\?=/gi, (_, q) => Buffer.from(q.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'));
};
const limparEmails = () => { smtp.registro.mensagens.length = 0; };
const emailsPara = (endereco) => smtp.registro.mensagens.filter(m => m.para.includes(endereco));
let F = {};

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  smtp = await iniciarSmtpFalso({ aceitarSenha: () => senhaAceita });
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 's'; process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
  // Calendário em volta de hoje (dias úteis = segunda a sexta), para contar "dias úteis antes".
  const linhas = [];
  for (let n = -10; n <= 60; n += 1) {
    const d = new Date(Date.parse(`${dia(n)}T12:00:00Z`));
    linhas.push([dia(n), d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 0 : 1]);
  }
  const conn = await conectarBancoTeste();
  try { await conn.query('INSERT INTO calendario (data, dia_util) VALUES ? ON DUPLICATE KEY UPDATE dia_util = VALUES(dia_util)', [linhas]); } finally { await conn.end(); }
  F.admin = { id: 1, token: jwt.sign({ id: 1, nome: 'Administrador de Testes', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
  F.admin.email = 'admteste@example.invalid';
  F.semPermissao = { id: 3, token: jwt.sign({ id: 3, nome: 'Usuário sem Permissão', nivel: 2, tipo: 'advogado', sessao: 'sessao-sem-permissao' }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
});
test.after(async () => {
  await smtp.parar();
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ============================================================ O SINO (rotas)
test('o sino: sem login = 401 nas 4 rotas; quem não tem permissão de módulo nenhum também usa o sino', async () => {
  for (const [metodo, caminho] of [['get', '/api/notificacoes'], ['get', '/api/notificacoes/todas'], ['get', '/api/notificacoes/contagem'], ['put', '/api/notificacoes/marcar-lidas']]) {
    assert.equal((await request(app)[metodo](caminho)).status, 401, `${metodo} ${caminho}`);
  }
  const u = await novoUsuario();
  for (const [metodo, caminho] of [['get', '/api/notificacoes'], ['get', '/api/notificacoes/todas'], ['get', '/api/notificacoes/contagem'], ['put', '/api/notificacoes/marcar-lidas']]) {
    assert.equal((await como(u)[metodo](caminho)).status, 200, `${metodo} ${caminho} sem permissão de módulo`);
  }
});

test('o sino: contagem, lista e histórico mostram SÓ as notificações da própria pessoa; a lista traz só as não lidas e o histórico traz as lidas também', async () => {
  const a = await novoUsuario(); const b = await novoUsuario();
  await sql("INSERT INTO notificacoes (usuario_id, mensagem, lida) VALUES (?, 'A nao lida 1', 0), (?, 'A nao lida 2', 0), (?, 'A lida', 1), (?, 'B nao lida', 0)", [a.id, a.id, a.id, b.id]);
  const c = await como(a).get('/api/notificacoes/contagem');
  assert.equal(c.body.dados.total, 2);
  assert.equal(typeof c.body.dados.sobrecarga, 'boolean');
  assert.equal((await como(b).get('/api/notificacoes/contagem')).body.dados.total, 1);
  const lista = (await como(a).get('/api/notificacoes')).body.dados;
  assert.deepEqual(lista.map(n => n.mensagem).sort(), ['A nao lida 1', 'A nao lida 2']);
  const todas = (await como(a).get('/api/notificacoes/todas')).body.dados;
  assert.deepEqual(todas.map(n => n.mensagem).sort(), ['A lida', 'A nao lida 1', 'A nao lida 2']);
  assert.deepEqual(todas.find(n => n.mensagem === 'A lida').lida, 1);
  assert.ok(!JSON.stringify(todas).includes('B nao lida'), 'nada de outra pessoa');
});

test('o sino: a mais nova vem primeiro — inclusive quando duas chegam no mesmo segundo (vale o número de cadastro) —, a lista corta em 20 e o histórico em 50', async () => {
  const u = await novoUsuario();
  const mesmoSegundo = '2026-01-01 10:00:00';
  for (const m of ['primeira', 'segunda', 'terceira']) await sql('INSERT INTO notificacoes (usuario_id, mensagem, criado_em) VALUES (?, ?, ?)', [u.id, m, mesmoSegundo]);
  const lista = (await como(u).get('/api/notificacoes')).body.dados;
  assert.deepEqual(lista.map(n => n.mensagem), ['terceira', 'segunda', 'primeira'], 'empate no mesmo segundo: a que entrou por último aparece primeiro');
  const v = await novoUsuario();
  for (let i = 1; i <= 55; i += 1) await sql('INSERT INTO notificacoes (usuario_id, mensagem) VALUES (?, ?)', [v.id, `n${i}`]);
  assert.equal((await como(v).get('/api/notificacoes')).body.dados.length, 20);
  assert.equal((await como(v).get('/api/notificacoes/todas')).body.dados.length, 50);
  assert.equal((await como(v).get('/api/notificacoes/contagem')).body.dados.total, 55, 'a contagem é de TODAS as não lidas, não só das 20 mostradas');
});

test('o sino: uma notificação de prazo traz o vencimento, o tipo do prazo e o número do processo', async () => {
  const u = await novoUsuario();
  const tipo = (await sql("INSERT INTO tipo_prazo (nome) VALUES ('Tipo Sino')")).insertId;
  const sub = (await sql('INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, ?)', [tipo, 'Contestação Sino'])).insertId;
  const prazo = (await sql("INSERT INTO prazos_processo (processo_id, subtipo_id, data_inicio, data_vencimento, criado_por) VALUES (1, ?, ?, ?, 1)", [sub, dia(0), dia(5)])).insertId;
  await sql("INSERT INTO notificacoes (usuario_id, prazo_id, mensagem) VALUES (?, ?, 'Do prazo')", [u.id, prazo]);
  const n = (await como(u).get('/api/notificacoes')).body.dados[0];
  assert.equal(n.subtipo_nome, 'Contestação Sino');
  assert.equal(String(n.data_vencimento).slice(0, 10), dia(5));
  assert.equal(n.processo_numero, '0000001-01.2026.5.15.0001');
});

test('o sino: "marcar como lidas" marca só as da própria pessoa, zera a contagem, pode repetir, e as lidas continuam no histórico', async () => {
  const a = await novoUsuario(); const b = await novoUsuario();
  await sql("INSERT INTO notificacoes (usuario_id, mensagem) VALUES (?, 'a1'), (?, 'a2'), (?, 'b1')", [a.id, a.id, b.id]);
  assert.equal((await como(a).put('/api/notificacoes/marcar-lidas')).status, 200);
  assert.equal((await como(a).get('/api/notificacoes/contagem')).body.dados.total, 0);
  assert.equal((await como(a).get('/api/notificacoes')).body.dados.length, 0);
  assert.equal((await como(a).get('/api/notificacoes/todas')).body.dados.length, 2);
  assert.equal((await como(b).get('/api/notificacoes/contagem')).body.dados.total, 1, 'a notificação do outro continua não lida');
  assert.equal((await como(a).put('/api/notificacoes/marcar-lidas')).status, 200);
});

// ============================================================ QUEM CRIA NOTIFICAÇÃO (prazo e tarefa)
const corpoPrazo = (extra = {}) => ({ processo_id: 1, descricao: 'Prazo do sino', data_inicio: dia(0), data_final: dia(10), quantidade: 10, tipo_dias: 'corridos', ...extra });

test('prazo delegado: a pessoa recebe o aviso no sino e o e-mail; quem delega a si mesmo não recebe nada; as preferências (sino/e-mail) valem', async () => {
  const a = await novoUsuario(); const semSino = await novoUsuario({ notifTela: 0 }); const semMail = await novoUsuario({ notifEmail: 0 }); const semEndereco = await novoUsuario({ email: false });
  limparEmails();
  const r = await como(F.admin).post('/api/prazos').send(corpoPrazo({ descricao: 'Recurso Ordinário', delegado_para: a.id }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const n = await notif(a.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].mensagem, `Novo prazo atribuído a você: Recurso Ordinário — vence em ${dia(10)}`);
  assert.equal(n[0].prazo_id, r.body.dados.id);
  assert.equal(n[0].lida, 0);
  const mails = emailsPara(a.email);
  assert.equal(mails.length, 1);
  assert.match(assuntoDoEmail(mails[0]), /Novo prazo atribu/);
  assert.match(textoDoEmail(mails[0]), /Recurso Ordin/);
  // preferências
  limparEmails();
  await como(F.admin).post('/api/prazos').send(corpoPrazo({ delegado_para: semSino.id }));
  assert.equal((await notif(semSino.id)).length, 0, 'notif_tela desligado: sem sino');
  assert.equal(emailsPara(semSino.email).length, 1, '...mas o e-mail sai');
  await como(F.admin).post('/api/prazos').send(corpoPrazo({ delegado_para: semMail.id }));
  assert.equal((await notif(semMail.id)).length, 1, 'notif_email desligado: o sino sai');
  assert.equal(emailsPara(semMail.email).length, 0, '...e o e-mail não');
  await como(F.admin).post('/api/prazos').send(corpoPrazo({ delegado_para: semEndereco.id }));
  assert.equal((await notif(semEndereco.id)).length, 1, 'sem e-mail cadastrado: só o sino, sem erro');
  // delegar para si mesmo
  const antes = (await notif(1)).length;
  limparEmails();
  assert.equal((await como(F.admin).post('/api/prazos').send(corpoPrazo({ delegado_para: 1 }))).status, 201);
  assert.equal((await notif(1)).length, antes);
  assert.equal(emailsPara(F.admin.email).length, 0);
});

test('prazo delegado: o texto digitado entra no e-mail como TEXTO (um "<" ou "&" não vira marcação), e prazo sem delegado não avisa ninguém', async () => {
  const a = await novoUsuario({ nome: 'Ana <b>Negrito</b> & Cia' });
  limparEmails();
  await como(F.admin).post('/api/prazos').send(corpoPrazo({ descricao: 'Prazo <img src=x onerror=alert(1)> & mais', delegado_para: a.id }));
  const html = textoDoEmail(emailsPara(a.email)[0]);
  assert.ok(!/<img src=x/.test(html), 'a marcação digitada não pode chegar crua ao e-mail');
  assert.ok(!/<b>Negrito/.test(html), 'nome do destinatário também escapado');
  assert.match(html, /&lt;img src=x/);
  const antes = (await sql('SELECT COUNT(*) AS n FROM notificacoes'))[0].n;
  limparEmails();
  assert.equal((await como(F.admin).post('/api/prazos').send(corpoPrazo())).status, 201);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM notificacoes'))[0].n, antes);
  assert.equal(smtp.registro.mensagens.length, 0);
});

test('prazo delegado com descrição de 1.000 letras (o máximo que o prazo aceita): o aviso do sino AINDA chega, cortado para caber (a coluna guarda 300) — nunca se perde em silêncio', async () => {
  const a = await novoUsuario();
  const longa = 'D'.repeat(1000);
  const r = await como(F.admin).post('/api/prazos').send(corpoPrazo({ descricao: longa, delegado_para: a.id }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const n = await notif(a.id);
  assert.equal(n.length, 1, 'a notificação não pode sumir');
  assert.ok(n[0].mensagem.length <= 300);
  assert.match(n[0].mensagem, /^Novo prazo atribuído a você: D+/);
});

test('concluir prazo: o criador é avisado no sino SÓ se pediu o aviso ao criar e se não foi ele mesmo quem concluiu; cancelar não avisa', async () => {
  const criador = await novoUsuario(); const fazedor = await novoUsuario();
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'prazos', NULL, 'visualizar', 1), (?, 'prazos', NULL, 'cadastrar', 1)", [criador.id, criador.id]);
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'prazos', NULL, 'visualizar', 1)", [fazedor.id]);
  const criar = async (extra) => (await como(criador).post('/api/prazos').send(corpoPrazo({ delegado_para: fazedor.id, ...extra }))).body.dados.id;
  const pedido = await criar({ descricao: 'Com aviso', notificar_conclusao: true });
  const semPedido = await criar({ descricao: 'Sem aviso' });
  const cancelado = await criar({ descricao: 'Cancelado', notificar_conclusao: true });
  { const r = await como(fazedor).put(`/api/prazos/${semPedido}/status`).send({ status: 'concluido' }); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  assert.equal((await notif(criador.id)).length, 0, 'não pediu o aviso: nada');
  assert.equal((await como(fazedor).put(`/api/prazos/${cancelado}/status`).send({ status: 'cancelado', motivo_cancelamento: 'Desistência' })).status, 200);
  assert.equal((await notif(criador.id)).length, 0, 'cancelar não avisa');
  assert.equal((await como(fazedor).put(`/api/prazos/${pedido}/status`).send({ status: 'concluido' })).status, 200);
  const n = await notif(criador.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].mensagem, `O prazo "Com aviso" foi concluído por ${fazedor.nome}`);
  assert.equal(n[0].prazo_id, pedido);
  // o próprio criador conclui o seu: não se avisa a si mesmo
  const proprio = await criar({ descricao: 'Eu mesmo', notificar_conclusao: true, delegado_para: criador.id });
  assert.equal((await como(criador).put(`/api/prazos/${proprio}/status`).send({ status: 'concluido' })).status, 200);
  assert.equal((await notif(criador.id)).length, 1);
});

test('concluir prazo com descrição de 1.000 letras e aviso pedido: a CONCLUSÃO funciona e o aviso chega (cortado) — um texto longo não pode impedir de concluir', async () => {
  const criador = await novoUsuario(); const fazedor = await novoUsuario();
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'prazos', NULL, 'visualizar', 1), (?, 'prazos', NULL, 'cadastrar', 1)", [criador.id, criador.id, ]);
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'prazos', NULL, 'visualizar', 1)", [fazedor.id]);
  const id = (await como(criador).post('/api/prazos').send(corpoPrazo({ descricao: 'L'.repeat(1000), delegado_para: fazedor.id, notificar_conclusao: true }))).body.dados.id;
  const r = await como(fazedor).put(`/api/prazos/${id}/status`).send({ status: 'concluido' });
  assert.equal(r.status, 200, `concluir: ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal((await sql('SELECT status FROM prazos_processo WHERE id = ?', [id]))[0].status, 'concluido');
  const n = await notif(criador.id);
  assert.equal(n.length, 1);
  assert.ok(n[0].mensagem.length <= 300);
});

test('concluir tarefa: o criador é avisado só se pediu e se não foi ele mesmo; reabrir e concluir de novo não repete mal; tarefa de título com 300 letras ainda conclui e avisa (cortado)', async () => {
  const criador = await novoUsuario(); const fazedor = await novoUsuario();
  for (const u of [criador, fazedor]) await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'tarefas', NULL, 'visualizar', 1), (?, 'tarefas', NULL, 'cadastrar', 1)", [u.id, u.id]);
  const criar = async (extra) => { const r = await como(criador).post('/api/tarefas').send({ titulo: 'Tarefa sino', processo_id: 1, data_vencimento: dia(3), atribuida_para: fazedor.id, ...extra }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.dados.id; };
  const sem = await criar({ titulo: 'Sem pedido' });
  assert.equal((await como(fazedor).put(`/api/tarefas/${sem}/concluir`).send()).status, 200);
  assert.equal((await notif(criador.id)).length, 0);
  const com = await criar({ titulo: 'Com pedido', notificar_conclusao: true });
  assert.equal((await como(fazedor).put(`/api/tarefas/${com}/concluir`).send()).status, 200);
  const n = await notif(criador.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].mensagem, `A tarefa "Com pedido" foi concluída por ${fazedor.nome}`);
  assert.equal(n[0].tarefa_id, com);
  const propria = await criar({ titulo: 'Propria', notificar_conclusao: true, atribuida_para: criador.id });
  assert.equal((await como(criador).put(`/api/tarefas/${propria}/concluir`).send()).status, 200);
  assert.equal((await notif(criador.id)).length, 1, 'não se avisa a si mesmo');
  const longa = await criar({ titulo: 'T'.repeat(300), notificar_conclusao: true });
  const r = await como(fazedor).put(`/api/tarefas/${longa}/concluir`).send();
  assert.equal(r.status, 200, `concluir tarefa de título longo: ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal((await sql('SELECT concluida FROM tarefas WHERE id = ?', [longa]))[0].concluida, 1);
  const todas = await notif(criador.id);
  assert.equal(todas.length, 2);
  assert.ok(todas.every(x => x.mensagem.length <= 300));
});

test('excluir o prazo ou a tarefa leva as notificações junto (sem notificação órfã apontando para algo que não existe mais)', async () => {
  const u = await novoUsuario();
  const prazo = (await como(F.admin).post('/api/prazos').send(corpoPrazo({ descricao: 'Vai sumir', delegado_para: u.id }))).body.dados.id;
  assert.equal((await notif(u.id)).length, 1);
  assert.equal((await como(F.admin).del(`/api/prazos/${prazo}`)).status, 200);
  assert.equal((await notif(u.id)).length, 0);
  const tarefa = (await sql("INSERT INTO tarefas (titulo, processo_id, data_vencimento, criado_por, atribuida_para) VALUES ('Tarefa sino', 1, ?, 1, ?)", [dia(2), u.id])).insertId;
  await sql("INSERT INTO notificacoes (usuario_id, tarefa_id, mensagem) VALUES (?, ?, 'da tarefa')", [u.id, tarefa]);
  assert.equal((await como(F.admin).del(`/api/tarefas/${tarefa}`)).status, 200);
  assert.equal((await notif(u.id)).length, 0);
});

// ============================================================ ALERTAS DE PRAZO POR E-MAIL (o relógio dispara)
async function prazoDireto({ venc, status = 'aberto', descricao = 'Prazo do alerta', delegado = null }) {
  return (await sql('INSERT INTO prazos_processo (processo_id, descricao, data_inicio, data_vencimento, status, delegado_para, criado_por) VALUES (1, ?, ?, ?, ?, ?, 1)', [descricao, dia(-20), venc, status, delegado])).insertId;
}
async function configurarAlertas({ emails, atrasado = 1 }) {
  await sql('UPDATE configuracoes_escritorio SET alerta_emails = ?, alerta_atrasado_ativo = ?', [emails, atrasado]);
}
const apagarPrazosDeTeste = () => sql('DELETE FROM prazos_processo WHERE criado_por = 1 AND descricao LIKE ?', ['%do alerta%']);

test('alerta de prazos: sem destinatário cadastrado não envia nada e não dá erro', async () => {
  await apagarPrazosDeTeste();
  await prazoDireto({ venc: HOJE });
  await configurarAlertas({ emails: '' });
  limparEmails();
  await alertas.executarAlertasPrazos();
  await configurarAlertas({ emails: null });
  await alertas.executarAlertasPrazos();
  assert.equal(smtp.registro.mensagens.length, 0);
});

test('alerta de prazos PENDENTES HOJE: só os que vencem hoje e não estão concluídos/cancelados — com processo, prazo e responsável; ontem e amanhã não entram', async () => {
  await apagarPrazosDeTeste();
  const resp = await novoUsuario({ nome: 'Responsavel Alerta' });
  await prazoDireto({ venc: HOJE, descricao: 'Vence hoje do alerta', delegado: resp.id });
  await prazoDireto({ venc: HOJE, status: 'concluido', descricao: 'Concluido do alerta' });
  await prazoDireto({ venc: HOJE, status: 'cancelado', descricao: 'Cancelado do alerta' });
  await prazoDireto({ venc: dia(1), descricao: 'Amanha do alerta' });
  await prazoDireto({ venc: dia(-1), descricao: 'Ontem do alerta' });
  await configurarAlertas({ emails: 'alerta1@example.invalid', atrasado: 0 });
  limparEmails();
  await alertas.executarAlertasPrazos();
  const m = emailsPara('alerta1@example.invalid');
  assert.equal(m.length, 1, 'um e-mail de pendentes (atrasados está desligado)');
  assert.match(assuntoDoEmail(m[0]), /PRAZO PENDENTE HOJE/);
  const html = textoDoEmail(m[0]);
  assert.match(html, /Vence hoje do alerta/);
  assert.match(html, /0000001-01\.2026\.5\.15\.0001/);
  assert.match(html, /Responsavel Alerta/);
  for (const fora of ['Concluido do alerta', 'Cancelado do alerta', 'Amanha do alerta', 'Ontem do alerta']) assert.ok(!html.includes(fora), `${fora} não pode aparecer`);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM log_emails WHERE para = 'alerta1@example.invalid' AND status = 'sucesso'"))[0].n, 1, 'fica registrado em log_emails');
});

test('alerta de prazos ATRASADOS: só com a opção ligada; traz os dias de atraso certos; não traz os de hoje, os concluídos nem os cancelados', async () => {
  await apagarPrazosDeTeste();
  await prazoDireto({ venc: dia(-3), descricao: 'Atrasado 3 do alerta' });
  await prazoDireto({ venc: dia(-1), descricao: 'Atrasado 1 do alerta' });
  await prazoDireto({ venc: dia(-5), status: 'concluido', descricao: 'Concluido velho do alerta' });
  await prazoDireto({ venc: dia(-5), status: 'cancelado', descricao: 'Cancelado velho do alerta' });
  await prazoDireto({ venc: HOJE, descricao: 'De hoje do alerta' });
  await configurarAlertas({ emails: 'alerta2@example.invalid', atrasado: 0 });
  limparEmails();
  await alertas.executarAlertasPrazos();
  assert.ok(!emailsPara('alerta2@example.invalid').some(m => /ATRASADO/.test(assuntoDoEmail(m))), 'opção desligada: sem e-mail de atrasados');
  await configurarAlertas({ emails: 'alerta2@example.invalid', atrasado: 1 });
  limparEmails();
  await alertas.executarAlertasPrazos();
  const atrasado = emailsPara('alerta2@example.invalid').find(m => /ATRASADO/.test(assuntoDoEmail(m)));
  assert.ok(atrasado, 'e-mail de atrasados enviado');
  const html = textoDoEmail(atrasado);
  assert.match(html, /Atrasado 3 do alerta/);
  assert.match(html, /Atrasado 1 do alerta/);
  assert.match(html, />3d</);
  assert.match(html, />1d</);
  for (const fora of ['Concluido velho do alerta', 'Cancelado velho do alerta', 'De hoje do alerta']) assert.ok(!html.includes(fora), `${fora} não pode aparecer no atrasados`);
});

test('alerta de prazos: sem nenhum prazo pendente nem atrasado, NÃO manda e-mail vazio; texto digitado no prazo entra escapado; vários destinatários recebem um e-mail cada', async () => {
  await apagarPrazosDeTeste();
  await configurarAlertas({ emails: 'alerta3@example.invalid', atrasado: 1 });
  limparEmails();
  await alertas.executarAlertasPrazos();
  assert.equal(smtp.registro.mensagens.length, 0, 'nada a avisar = nada enviado');
  await prazoDireto({ venc: HOJE, descricao: '<script>alert(1)</script> do alerta & cia' });
  await configurarAlertas({ emails: ' alerta4@example.invalid , alerta5@example.invalid ,, ', atrasado: 0 });
  limparEmails();
  await alertas.executarAlertasPrazos();                                   // 2 destinatários: o envio coletivo espaça 5 s entre eles
  assert.equal(emailsPara('alerta4@example.invalid').length, 1);
  assert.equal(emailsPara('alerta5@example.invalid').length, 1);
  const html = textoDoEmail(emailsPara('alerta4@example.invalid')[0]);
  assert.ok(!html.includes('<script>alert(1)'), 'a marcação digitada não pode chegar crua ao e-mail');
  assert.match(html, /&lt;script&gt;/);
});

test('alerta de prazos: se o servidor de e-mail recusar, o disparo não derruba nada, fica registrado como falha, e o alerta sai quando o e-mail voltar', async () => {
  await apagarPrazosDeTeste();
  await prazoDireto({ venc: HOJE, descricao: 'Falha de envio do alerta' });
  await configurarAlertas({ emails: 'alerta6@example.invalid', atrasado: 0 });
  senhaAceita = false;
  limparEmails();
  try { await alertas.executarAlertasPrazos(); } finally { senhaAceita = true; }
  assert.equal(emailsPara('alerta6@example.invalid').length, 0);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM log_emails WHERE para = 'alerta6@example.invalid' AND status = 'falha'"))[0].n, 1);
  await alertas.executarAlertasPrazos();                                   // sem trava diária: o próximo disparo tenta de novo
  assert.equal(emailsPara('alerta6@example.invalid').length, 1);
});

// ============================================================ AVISO DE IDADE (sino dos administradores)
test('aviso de idade: ao completar a idade, TODOS os administradores ativos recebem no sino (e só eles), uma única vez; quem ainda não completou, pessoa inativa e sem nascimento não avisam', async () => {
  const adm2 = await novoUsuario({ nivel: 1 }); const admInativo = await novoUsuario({ nivel: 1, ativo: 0 }); const comum = await novoUsuario({ nivel: 2 });
  const nascido = (anos, dias = 0) => { const d = new Date(Date.parse(`${HOJE}T12:00:00Z`)); d.setUTCFullYear(d.getUTCFullYear() - anos); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
  const pessoa = async (nome, nasc, ativo = 1) => (await sql('INSERT INTO pessoas_fisicas (nome, data_nascimento, ativo) VALUES (?, ?, ?)', [nome, nasc, ativo])).insertId;
  const aviso = async (pessoaId, idade) => (await sql('INSERT INTO pessoas_avisos_idade (pessoa_id, idade) VALUES (?, ?)', [pessoaId, idade])).insertId;
  const hojeFaz18 = await pessoa('Faz Dezoito Hoje', nascido(18));
  const faltaUmDia = await pessoa('Falta Um Dia', nascido(18, 1));
  const jaPassou = await pessoa('Ja Passou Dos Dezoito', nascido(30));
  const inativa = await pessoa('Pessoa Inativa Idade', nascido(18), 0);
  const semNasc = await pessoa('Sem Nascimento Idade', null);
  const ids = { hojeFaz18: await aviso(hojeFaz18, 18), faltaUmDia: await aviso(faltaUmDia, 18), jaPassou: await aviso(jaPassou, 18), inativa: await aviso(inativa, 18), semNasc: await aviso(semNasc, 18) };
  await alertas.verificarAvisosIdade();
  const doAdm = (await notif(1)).map(n => n.mensagem);
  assert.ok(doAdm.includes('Faz Dezoito Hoje completou 18 anos — confira a representação legal nos processos.'));
  assert.ok(doAdm.some(m => m.startsWith('Ja Passou Dos Dezoito completou 18 anos')), 'quem já passou da idade (sistema ficou parado) também é avisado');
  assert.ok(!doAdm.some(m => /Falta Um Dia|Pessoa Inativa Idade|Sem Nascimento Idade/.test(m)));
  for (const a of [adm2]) assert.deepEqual((await notif(a.id)).map(n => n.mensagem).sort(), doAdm.slice().sort(), 'todo administrador ativo recebe os mesmos avisos');
  assert.equal((await notif(admInativo.id)).length, 0, 'administrador inativo não recebe');
  assert.equal((await notif(comum.id)).length, 0, 'usuário comum não recebe');
  assert.equal((await notif(1))[0].pessoa_id !== null, true, 'o aviso aponta para a pessoa');
  const marcados = await sql('SELECT id FROM pessoas_avisos_idade WHERE avisado_em IS NOT NULL ORDER BY id');
  assert.deepEqual(marcados.map(r => r.id), [ids.hojeFaz18, ids.jaPassou]);
  // segunda rodada: nada se repete
  const antes = (await notif(1)).length;
  await alertas.verificarAvisosIdade();
  assert.equal((await notif(1)).length, antes);
});

test('aviso de idade: se não houver nenhum administrador ativo, o aviso NÃO é dado como enviado (continua pendente para quando houver)', async () => {
  const pessoa = (await sql("INSERT INTO pessoas_fisicas (nome, data_nascimento) VALUES ('Pessoa Sem Admin', DATE_SUB(CURDATE(), INTERVAL 21 YEAR))")).insertId;
  const aviso = (await sql('INSERT INTO pessoas_avisos_idade (pessoa_id, idade) VALUES (?, 21)', [pessoa])).insertId;
  const admins = await sql('SELECT id FROM usuarios WHERE nivel <= 1 AND ativo = 1');
  try {
    for (const a of admins) await sql('UPDATE usuarios SET ativo = 0 WHERE id = ?', [a.id]);
    await alertas.verificarAvisosIdade();
    assert.equal((await sql('SELECT avisado_em FROM pessoas_avisos_idade WHERE id = ?', [aviso]))[0].avisado_em, null);
  } finally {
    for (const a of admins) await sql('UPDATE usuarios SET ativo = 1 WHERE id = ?', [a.id]);
  }
  await alertas.verificarAvisosIdade();
  assert.ok((await sql('SELECT avisado_em FROM pessoas_avisos_idade WHERE id = ?', [aviso]))[0].avisado_em, 'com administrador de volta, o aviso sai');
});

// ============================================================ AVISO DE PENDÊNCIA DE DOCUMENTOS
async function pendencia({ tipoPessoa = 'fisica', nomeCliente = 'Cliente Pendencia', status = 'aberta', responsaveis, itens = 2 }) {
  const pessoaId = tipoPessoa === 'fisica'
    ? (await sql('INSERT INTO pessoas_fisicas (nome) VALUES (?)', [nomeCliente])).insertId
    : (await sql('INSERT INTO pessoas_juridicas (razao_social) VALUES (?)', [nomeCliente])).insertId;
  const pend = (await sql('INSERT INTO pendencia_documento (tipo_pessoa, pessoa_id, status, criado_por) VALUES (?, ?, ?, 1)', [tipoPessoa, pessoaId, status])).insertId;
  for (let i = 0; i < itens; i += 1) {
    const tipoDoc = await sql('INSERT INTO tipo_documento_pendencia (nome) VALUES (?)', [`Doc ${crypto.randomBytes(4).toString('hex')}`]);
    await sql('INSERT INTO pendencia_documento_item (pendencia_id, tipo_documento_id) VALUES (?, ?)', [pend, tipoDoc.insertId]);
  }
  const linhas = [];
  for (const r of responsaveis) linhas.push((await sql('INSERT INTO pendencia_documento_responsavel (pendencia_id, usuario_id, avisar_sino, avisar_email, data_aviso) VALUES (?, ?, ?, ?, ?)',
    [pend, r.usuario.id, r.sino ?? 1, r.email ?? 0, r.data ?? HOJE])).insertId);
  return { pend, pessoaId, linhas };
}
const avisadoEm = async (linha) => (await sql('SELECT avisado_em FROM pendencia_documento_responsavel WHERE id = ?', [linha]))[0].avisado_em;

test('aviso de pendência de documentos: sino para quem escolheu sino, uma única vez; data futura, pendência resolvida/cancelada e responsável inativo não avisam; empresa também (sem vínculo de pessoa física)', async () => {
  const sino = await novoUsuario(); const futuro = await novoUsuario(); const inativo = await novoUsuario({ ativo: 0 }); const ontem = await novoUsuario();
  const p1 = await pendencia({ nomeCliente: 'Maria Sino Pendencia', responsaveis: [{ usuario: sino }] });
  const p2 = await pendencia({ nomeCliente: 'Futuro Pendencia', responsaveis: [{ usuario: futuro, data: dia(3) }] });
  const p3 = await pendencia({ nomeCliente: 'Resolvida Pendencia', status: 'resolvida', responsaveis: [{ usuario: futuro }] });
  const p4 = await pendencia({ nomeCliente: 'Inativo Pendencia', responsaveis: [{ usuario: inativo }] });
  const p5 = await pendencia({ nomeCliente: 'Empresa Pendencia Ltda', tipoPessoa: 'juridica', responsaveis: [{ usuario: sino }] });
  const p6 = await pendencia({ nomeCliente: 'Atrasada Pendencia', responsaveis: [{ usuario: ontem, data: dia(-4) }] });
  await alertas.verificarAvisosPendenciaDocumento();
  const n = await notif(sino.id);
  assert.equal(n.length, 2);
  const pf = n.find(x => /Maria Sino Pendencia/.test(x.mensagem)); const pj = n.find(x => /Empresa Pendencia Ltda/.test(x.mensagem));
  assert.match(pf.mensagem, /Documentos pendentes de Maria Sino Pendencia — \d+ documento\(s\) ainda não entregue\(s\)/);
  assert.equal(pf.pessoa_id, p1.pessoaId);
  assert.equal(pj.pessoa_id, null);
  assert.ok(await avisadoEm(p1.linhas[0]));
  assert.equal(await avisadoEm(p2.linhas[0]), null, 'data futura: ainda não');
  assert.equal(await avisadoEm(p3.linhas[0]), null, 'resolvida: não');
  assert.equal(await avisadoEm(p4.linhas[0]), null, 'responsável inativo: não');
  assert.equal((await notif(futuro.id)).length + (await notif(inativo.id)).length, 0);
  assert.equal((await notif(ontem.id)).length, 1, 'data que já passou (sistema parado) avisa no primeiro dia');
  assert.ok(await avisadoEm(p6.linhas[0]));
  await alertas.verificarAvisosPendenciaDocumento();
  assert.equal((await notif(sino.id)).length, 2, 'segunda rodada não repete');
});

test('aviso de pendência — SÓ e-mail: só vale se o e-mail SAIR; se falhar, fica pendente para tentar de novo; o texto do cliente entra escapado no e-mail', async () => {
  const resp = await novoUsuario();
  const p = await pendencia({ nomeCliente: 'Cliente <i>Italico</i> Pendencia', responsaveis: [{ usuario: resp, sino: 0, email: 1 }] });
  senhaAceita = false; limparEmails();
  try { await alertas.verificarAvisosPendenciaDocumento(); } finally { senhaAceita = true; }
  assert.equal(await avisadoEm(p.linhas[0]), null, 'e-mail falhou: continua pendente');
  assert.equal((await notif(resp.id)).length, 0, 'e não vira sino por conta própria');
  await alertas.verificarAvisosPendenciaDocumento();
  const m = emailsPara(resp.email);
  assert.equal(m.length, 1);
  assert.match(assuntoDoEmail(m[0]), /Pend.ncia de documentos/);
  assert.ok(!textoDoEmail(m[0]).includes('<i>Italico</i>'), 'marcação digitada no nome do cliente não pode chegar crua ao e-mail');
  assert.ok(await avisadoEm(p.linhas[0]));
  assert.equal((await notif(resp.id)).length, 0, 'só e-mail: sem sino');
});

test('aviso de pendência — sino + e-mail: o sino sai e o e-mail vai junto; e quem escolheu SÓ e-mail mas não tem e-mail cadastrado NÃO pode ser dado como avisado sem receber nada', async () => {
  const dois = await novoUsuario(); const semEmail = await novoUsuario({ email: false });
  const p1 = await pendencia({ nomeCliente: 'Cliente Dois Canais', responsaveis: [{ usuario: dois, sino: 1, email: 1 }] });
  const p2 = await pendencia({ nomeCliente: 'Cliente Sem Email Resp', responsaveis: [{ usuario: semEmail, sino: 0, email: 1 }] });
  limparEmails();
  await alertas.verificarAvisosPendenciaDocumento();
  assert.equal((await notif(dois.id)).length, 1);
  assert.equal(emailsPara(dois.email).length, 1);
  assert.ok(await avisadoEm(p1.linhas[0]));
  const recebeu = (await notif(semEmail.id)).length > 0;
  const marcado = !!(await avisadoEm(p2.linhas[0]));
  assert.ok(recebeu || !marcado, 'ou o aviso chegou por algum canal, ou continua pendente — nunca "avisado" sem ninguém ter recebido nada');
});

// ============================================================ COMUNICADO DE PERÍCIA AO CLIENTE (alerta automático)
test('alerta de perícia: no dia certo (N dias úteis antes) o cliente recebe o comunicado, uma única vez; perícia que não está agendada, já comunicada ou de outro dia não dispara; cliente sem e-mail não é dado como comunicado', async () => {
  await sql("UPDATE configuracoes_escritorio SET dias_alerta_pericia = 2");
  let dataCerta = null;
  for (let n = 1; n <= 20 && !dataCerta; n += 1) if ((await cal.diasUteisAntes(dia(n), 2)) === HOJE) dataCerta = dia(n);
  assert.ok(dataCerta, 'o calendário de teste precisa ter uma data cujo alerta (2 dias úteis antes) cai hoje');
  const autor = (await sql("INSERT INTO pessoas_fisicas (nome) VALUES ('Cliente Pericia Alerta')")).insertId;
  await sql("INSERT INTO emails_pf (pessoa_id, email, principal, ativo) VALUES (?, 'cliente.pericia@example.invalid', 1, 1)", [autor]);
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [autor]);
  const pericia = async (data, status = 'agendada', comunicado = 0) => (await sql("INSERT INTO pericia (processo_id, data, hora, status, comunicado_enviado, criado_por) VALUES (1, ?, '09:00:00', ?, ?, 1)", [data, status, comunicado])).insertId;
  const certa = await pericia(dataCerta);
  const cancelada = await pericia(dataCerta, 'cancelada');
  const jaComunicada = await pericia(dataCerta, 'agendada', 1);
  const outroDia = await pericia(dia(30));
  limparEmails();
  await alertas.verificarAlertasPericias();
  const m = emailsPara('cliente.pericia@example.invalid');
  assert.equal(m.length, 1, 'só a perícia certa gera comunicado');
  assert.match(assuntoDoEmail(m[0]), /Comunicado de Per/);
  const estado = async (id) => (await sql('SELECT comunicado_enviado FROM pericia WHERE id = ?', [id]))[0].comunicado_enviado;
  assert.equal(await estado(certa), 1);
  assert.equal(await estado(cancelada), 0);
  assert.equal(await estado(outroDia), 0);
  assert.equal(await estado(jaComunicada), 1);
  limparEmails();
  await alertas.verificarAlertasPericias();
  assert.equal(smtp.registro.mensagens.length, 0, 'segunda rodada não repete');
  // cliente sem e-mail: nada sai e a perícia NÃO é dada como comunicada
  await sql("UPDATE emails_pf SET ativo = 0 WHERE pessoa_id = ?", [autor]);
  const semMail = await pericia(dataCerta);
  await alertas.verificarAlertasPericias();
  assert.equal((await sql('SELECT comunicado_enviado FROM pericia WHERE id = ?', [semMail]))[0].comunicado_enviado, 0);
});
