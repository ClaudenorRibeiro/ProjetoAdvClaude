// AVISOS AOS CLIENTES — a tela de conferência: quem vê, quem decide, enviar por e-mail/SMS/WhatsApp, descartar, editar o texto, histórico.
// A regra mais importante: NENHUM aviso sai duas vezes. Se duas pessoas clicam ao mesmo tempo, o banco obedece uma só e a outra recebe o aviso de que já foi decidido.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste } = require('../support/testDatabase');
const { iniciarSmtpFalso } = require('../support/smtpFalso');
const F = require('../support/avisosFixtures');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const avisos = require('../../src/avisos');

let app; let smtp; let sms; let admin; let senhaAceita = true;
const api = (u) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${u.token}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${u.token}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${u.token}`),
});
const emailsPara = (e) => smtp.registro.mensagens.filter(m => m.para.includes(e));
const decodificar = (m) => Buffer.from(m.dados.split(/\r?\n\r?\n/).slice(1).join('\n').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
const permissaoAvisos = (...modulos) => modulos.map(m => ['avisos', m, 'visualizar']);

// Um cliente e um aviso de perícia "agendada" pendente (a tela de conferência segura o envio).
async function umAviso({ cliente = {}, modulo = 'pericia' } = {}) {
  await F.limparAvisos(); await F.desligarClientes(); smtp.registro.mensagens.length = 0; sms.enviados.length = 0; sms.falhar = false; senhaAceita = true;
  await F.configurar({ avisos_pericia_mostrar: 1, avisos_audiencia_mostrar: 1, avisos_parabens_mostrar: 1 });
  await F.ligarComtele(true);
  const c = await F.cliente(cliente);
  await F.ligarAoProcesso(c);
  const id = modulo === 'pericia' ? await F.criarPericia({ data: F.dia(6) }) : await F.criarAudiencia({ data: F.dia(6) });
  await avisos.registrarEvento({ modulo, tipo: 'agendada', id });
  const [aviso] = await F.avisos();
  return { c, aviso, id };
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  smtp = await iniciarSmtpFalso({ aceitarSenha: () => senhaAceita });
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 's'; process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
  await F.semearCalendario();
  sms = F.smsFalso();
  admin = await F.usuario({ nivel: 1 });
});
test.after(async () => { sms.restaurar(); await smtp.parar(); require('node-cron').getTasks().forEach(t => t.stop()); await pool.end(); });

test('quem vê o quê: sem login = 401; sem permissão a lista vem vazia e agir dá 403; com permissão de UM módulo só vê (e só decide) aquele; permissão negada não conta; administrador vê tudo', async () => {
  const { aviso } = await umAviso();
  const audiencia = await F.criarAudiencia({ data: F.dia(7) });
  await avisos.registrarEvento({ modulo: 'audiencia', tipo: 'agendada', id: audiencia });
  const doAud = (await F.avisos("WHERE modulo = 'audiencia'"))[0];
  for (const [metodo, caminho] of [['get', '/api/avisos'], ['get', '/api/avisos/contagem'], ['get', '/api/avisos/historico'], ['post', '/api/avisos/atualizar'], ['put', `/api/avisos/${aviso.id}`], ['post', `/api/avisos/${aviso.id}/enviar`], ['post', `/api/avisos/${aviso.id}/descartar`]]) {
    assert.equal((await request(app)[metodo](caminho).send({})).status, 401, `${metodo} ${caminho}`);
  }
  const semNada = await F.usuario();
  const lista = await api(semNada).get('/api/avisos');
  assert.deepEqual([lista.status, lista.body.dados.itens.length, lista.body.dados.modulos], [200, 0, []]);
  assert.equal((await api(semNada).get('/api/avisos/contagem')).body.dados.total, 0);
  for (const r of [await api(semNada).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] }), await api(semNada).post(`/api/avisos/${aviso.id}/descartar`).send({}), await api(semNada).put(`/api/avisos/${aviso.id}`).send({ texto: 'x' }), await api(semNada).post('/api/avisos/atualizar').send()]) {
    assert.equal(r.status, 403);
  }
  const soPericia = await F.usuario({ permissoes: permissaoAvisos('pericia') });
  const dela = await api(soPericia).get('/api/avisos');
  assert.deepEqual(dela.body.dados.itens.map(i => i.modulo), ['pericia']);
  assert.deepEqual(dela.body.dados.modulos, ['pericia']);
  assert.equal((await api(soPericia).get('/api/avisos/contagem')).body.dados.total, 1);
  assert.equal((await api(soPericia).post(`/api/avisos/${doAud.id}/descartar`).send({})).status, 403, 'aviso de outro módulo');
  assert.equal((await F.avisos('WHERE id = ?', [doAud.id]))[0].status, 'pendente');
  const negada = await F.usuario();
  await F.sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'avisos', 'pericia', 'visualizar', 0)", [negada.id]);
  assert.deepEqual((await api(negada).get('/api/avisos')).body.dados.modulos, []);
  const tudo = await api(admin).get('/api/avisos');
  assert.deepEqual(tudo.body.dados.itens.map(i => i.modulo).sort(), ['audiencia', 'pericia']);
  assert.deepEqual(tudo.body.dados.modulos.sort(), ['audiencia', 'parabens', 'pericia']);
});

test('a lista traz cliente, processo e os canais de cada cliente já marcados como disponíveis: e-mail se tem, SMS só com Comtele ativa e número marcado, WhatsApp se tem número marcado', async () => {
  const { c } = await umAviso();
  let item = (await api(admin).get('/api/avisos')).body.dados.itens[0];
  assert.deepEqual([item.cliente_nome, item.processo_numero, item.tipo, item.status], [c.nome, '0000001-01.2026.5.15.0001', 'agendada', 'pendente']);
  assert.deepEqual(item.canais, { email: { disponivel: true, destino: c.email }, sms: { disponivel: true, destino: c.numero }, whatsapp: { disponivel: true, destino: c.numero } });
  await F.ligarComtele(false);
  item = (await api(admin).get('/api/avisos')).body.dados.itens[0];
  assert.deepEqual([item.canais.sms.disponivel, item.canais.sms.destino], [false, null], 'sem Comtele a opção de SMS não existe');
  assert.equal((await api(admin).get('/api/avisos')).body.dados.sms_ativo, false);
  await F.ligarComtele(true);
  await F.sql('UPDATE emails_pf SET ativo = 0 WHERE pessoa_id = ?', [c.id]);
  await F.sql('UPDATE telefones_pf SET whatsapp = 0 WHERE pessoa_id = ?', [c.id]);
  item = (await api(admin).get('/api/avisos')).body.dados.itens[0];
  assert.deepEqual([item.canais.email.disponivel, item.canais.sms.disponivel, item.canais.whatsapp.disponivel], [false, true, false]);
});

test('enviar por e-mail, SMS e WhatsApp: cada canal sai uma vez, o aviso vira "enviado" por quem decidiu, tudo fica no log e na auditoria, e o WhatsApp devolve número e texto para a tela abrir a conversa', async () => {
  const { c, aviso } = await umAviso();
  const r = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email', 'sms', 'whatsapp'] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.entries(r.body.dados.resultados).map(([k, v]) => [k, v.ok]), [['email', true], ['sms', true], ['whatsapp', true]]);
  assert.deepEqual(r.body.dados.whatsapp, { numero: c.numero, texto: aviso.texto });
  assert.equal(emailsPara(c.email).length, 1);
  assert.deepEqual(sms.enviados, [{ numero: c.numero, mensagem: aviso.texto }]);
  const [depois] = await F.avisos();
  assert.deepEqual([depois.status, depois.modo, depois.decidido_por], ['enviado', 'tela', admin.id]);
  const log = await F.sql('SELECT canal, enviado, usuario_id, aviso_id FROM log_comunicacoes ORDER BY id');
  assert.deepEqual(log.map(l => [l.canal, l.enviado, l.usuario_id, l.aviso_id]), [['email', 1, admin.id, aviso.id], ['sms', 1, admin.id, aviso.id], ['whatsapp', 1, admin.id, aviso.id]]);
  assert.equal((await F.sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'avisos_cliente' AND acao = 'enviar' AND registro_id = ?", [aviso.id]))[0].n, 1);
  assert.equal((await F.sql('SELECT comunicado_enviado FROM pericia WHERE id = ?', [depois.pericia_id]))[0].comunicado_enviado, 1);
  const hist = await api(admin).get('/api/avisos/historico');
  assert.deepEqual(hist.body.dados.map(h => [h.id, h.status, h.decidido_por_nome]), [[aviso.id, 'enviado', admin.nome]]);
});

test('o texto e o assunto editados na tela são os que saem (e ficam gravados como editados); texto vazio ou grande demais é recusado sem enviar nada', async () => {
  const { c, aviso } = await umAviso();
  for (const ruim of [{ texto: '' }, { texto: '   ' }, { texto: 'x'.repeat(2001) }, { assunto: '' }, { assunto: 'a'.repeat(201) }, { texto: 5 }]) {
    const r = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'], ...ruim });
    assert.equal(r.status, 400, JSON.stringify(ruim));
  }
  assert.equal((await F.avisos())[0].status, 'pendente', 'recusado = continua na lista');
  assert.equal(smtp.registro.mensagens.length, 0);
  const r = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'], assunto: 'Assunto da secretária', texto: 'Texto escrito pela secretária' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(decodificar(emailsPara(c.email)[0]), /Texto escrito pela secret/);
  const [depois] = await F.avisos();
  assert.deepEqual([depois.assunto, depois.texto, depois.texto_editado], ['Assunto da secretária', 'Texto escrito pela secretária', 1]);
});

test('canal que o cliente não tem, canais vazios ou inventados: aviso de erro e o aviso CONTINUA na lista; SMS sem Comtele ativa não é aceito', async () => {
  const { aviso } = await umAviso({ cliente: { email: false, whatsapp: false } });
  for (const [canais, trecho] of [[['email'], /e-mail/], [['whatsapp'], /WhatsApp/]]) {
    const r = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais });
    assert.deepEqual([r.status, trecho.test(r.body.mensagem)], [400, true], JSON.stringify(r.body));
  }
  for (const canais of [[], undefined, ['telegram'], 'email', ['email', 5]]) assert.equal((await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais })).status, 400);
  await F.ligarComtele(false);
  const semComtele = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['sms'] });
  assert.equal(semComtele.status, 400);
  assert.match(semComtele.body.mensagem, /SMS/);
  const [depois] = await F.avisos();
  assert.equal(depois.status, 'pendente');
  assert.equal(depois.decidido_por, null);
  assert.equal(smtp.registro.mensagens.length + sms.enviados.length, 0);
});

test('se NENHUM canal conseguir enviar, o aviso volta para a lista com o motivo (nada se perde) e pode ser tentado de novo; se um canal falhar e outro der certo, o aviso é dado como enviado', async () => {
  const { c, aviso } = await umAviso();
  senhaAceita = false;
  const falhou = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] });
  senhaAceita = true;
  assert.equal(falhou.status, 502);
  assert.match(falhou.body.mensagem, /continua na lista/);
  let [depois] = await F.avisos();
  assert.deepEqual([depois.status, depois.decidido_por], ['pendente', null]);
  assert.match(depois.motivo_status, /Falha no envio/);
  sms.falhar = true;
  const parcial = await api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email', 'sms'] });
  assert.equal(parcial.status, 200, JSON.stringify(parcial.body));
  assert.deepEqual([parcial.body.dados.resultados.email.ok, parcial.body.dados.resultados.sms.ok], [true, false]);
  [depois] = await F.avisos();
  assert.equal(depois.status, 'enviado');
  assert.equal(emailsPara(c.email).length, 1);
});

test('DUAS PESSOAS AO MESMO TEMPO: só uma é obedecida; a outra recebe "este aviso acabou de ser enviado" e pede a lista nova; o cliente recebe UM e-mail só — nunca dois', async () => {
  const { c, aviso } = await umAviso();
  const outra = await F.usuario({ nivel: 1 });
  const [a, b] = await Promise.all([
    api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] }),
    api(outra).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] }),
  ]);
  const status = [a.status, b.status].sort();
  assert.deepEqual(status, [200, 409], `${a.status} / ${b.status}`);
  const perdedor = a.status === 409 ? a : b;
  assert.match(perdedor.body.mensagem, /acabou de ser enviado|está sendo enviado/);
  assert.equal(perdedor.body.detalhes?.atualizar, true, 'a tela sabe que precisa atualizar a lista');
  assert.equal(emailsPara(c.email).length, 1, 'um único e-mail');
  assert.equal((await F.sql('SELECT COUNT(*) AS n FROM log_comunicacoes WHERE aviso_id = ?', [aviso.id]))[0].n, 1);
  // depois que acabou: tentar de novo avisa quem foi e que já foi enviado
  const tarde = await api(outra).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] });
  assert.equal(tarde.status, 409);
  assert.match(tarde.body.mensagem, /acabou de ser enviado por Pessoa/);
});

test('enviar x descartar ao mesmo tempo: vence um só; descartar vale para todos, quem chega depois é avisado, e o descartado nunca é enviado', async () => {
  const { c, aviso } = await umAviso();
  const outra = await F.usuario({ nivel: 1 });
  const [env, des] = await Promise.all([
    api(admin).post(`/api/avisos/${aviso.id}/enviar`).send({ canais: ['email'] }),
    api(outra).post(`/api/avisos/${aviso.id}/descartar`).send({ motivo: 'Cliente já foi avisado por telefone' }),
  ]);
  assert.deepEqual([env.status, des.status].sort(), [200, 409]);
  const [depois] = await F.avisos();
  assert.equal(depois.status, env.status === 200 ? 'enviado' : 'descartado');
  assert.equal(emailsPara(c.email).length, env.status === 200 ? 1 : 0);
  // descartado: não dá para enviar nem descartar de novo
  const { aviso: segundo } = await umAviso();
  assert.equal((await api(admin).post(`/api/avisos/${segundo.id}/descartar`).send({ motivo: 'Não precisa' })).status, 200);
  const [d] = await F.avisos();
  assert.deepEqual([d.status, d.modo, d.motivo_status, d.decidido_por], ['descartado', 'tela', 'Não precisa', admin.id]);
  const depoisEnvio = await api(outra).post(`/api/avisos/${segundo.id}/enviar`).send({ canais: ['email'] });
  assert.equal(depoisEnvio.status, 409);
  assert.match(depoisEnvio.body.mensagem, /acabou de ser descartado/);
  assert.equal((await api(outra).post(`/api/avisos/${segundo.id}/descartar`).send({})).status, 409);
  assert.equal(smtp.registro.mensagens.length, 0);
  assert.equal((await F.sql("SELECT COUNT(*) AS n FROM logs_auditoria WHERE tabela = 'avisos_cliente' AND acao = 'descartar' AND registro_id = ?", [segundo.id]))[0].n, 1);
});

test('editar o texto: só aviso pendente; depois de enviado/descartado a edição é recusada; id que não existe ou não é número = 404; "Atualizar a lista" roda a rotina e devolve o resumo', async () => {
  const { aviso } = await umAviso();
  const ok = await api(admin).put(`/api/avisos/${aviso.id}`).send({ assunto: 'Novo assunto', texto: 'Novo texto' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual((await F.avisos()).map(x => [x.assunto, x.texto, x.texto_editado]), [['Novo assunto', 'Novo texto', 1]]);
  assert.equal((await api(admin).put(`/api/avisos/${aviso.id}`).send({ texto: '' })).status, 400);
  assert.equal((await api(admin).post(`/api/avisos/${aviso.id}/descartar`).send({})).status, 200);
  assert.equal((await api(admin).put(`/api/avisos/${aviso.id}`).send({ texto: 'tarde demais' })).status, 409);
  for (const id of [999999, 'abc', '12abc', '-1']) {
    assert.equal((await api(admin).post(`/api/avisos/${id}/enviar`).send({ canais: ['email'] })).status, 404, `id ${id}`);
  }
  const atualizar = await api(admin).post('/api/avisos/atualizar').send();
  assert.equal(atualizar.status, 200);
  assert.deepEqual(Object.keys(atualizar.body.dados).sort(), ['aniversarios', 'enviadosSozinhos', 'lembretes']);
});
