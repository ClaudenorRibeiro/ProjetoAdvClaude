// AVISOS AOS CLIENTES — o que acontece QUANDO o fato ocorre (perícia/audiência cadastrada, remarcada ou cancelada) e o envio SOZINHO
// (quando "mostrar antes de enviar" está desligado). Um aviso errado chega ao cliente sem ninguém conferir; um aviso que falta deixa o cliente no escuro.
// Poucos dados por situação: um processo, um ou dois clientes, um evento. E-mail por SMTP falso local; SMS por boneco (nada sai para fora).
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
const limparEmails = () => { smtp.registro.mensagens.length = 0; };
const emailsPara = (endereco) => smtp.registro.mensagens.filter(m => m.para.includes(endereco));
const textoDoEmail = (m) => Buffer.from(m.dados.split(/\r?\n\r?\n/).slice(1).join('\n').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
const diaUtil = (a) => { let n = a; while ([0, 6].includes(new Date(Date.parse(`${F.dia(n)}T12:00:00Z`)).getUTCDay())) n += 1; return F.dia(n); };
const api = (u) => ({ get: p => request(app).get(p).set('Authorization', `Bearer ${u.token}`), post: p => request(app).post(p).set('Authorization', `Bearer ${u.token}`), put: p => request(app).put(p).set('Authorization', `Bearer ${u.token}`) });

async function recomecar() {
  await F.limparAvisos(); await F.desligarClientes(); limparEmails(); sms.enviados.length = 0; sms.falhar = false; senhaAceita = true;
  await F.configurar({ avisos_pericia_mostrar: 1, avisos_audiencia_mostrar: 1, avisos_parabens_mostrar: 1 });
  await F.ligarComtele(false);
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
test.after(async () => {
  sms.restaurar();
  await smtp.parar();
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

test('perícia agendada: nasce UM aviso por cliente do processo, pendente, com o texto certo; repetir não duplica; evento passado e processo sem cliente não geram nada', async () => {
  await recomecar();
  const a = await F.cliente({ nome: 'Maria Souza Aviso' }); const b = await F.cliente({ nome: 'José Lima Aviso' });
  await F.ligarAoProcesso(a); await F.ligarAoProcesso(b);
  const data = F.dia(5);
  const pericia = await F.criarPericia({ data, hora: '09:30' });
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia });
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia });
  const lista = await F.avisos();
  assert.equal(lista.length, 2, 'um por cliente, sem duplicar');
  const doMaria = lista.find(x => x.cliente_id === a.id);
  assert.deepEqual([doMaria.modulo, doMaria.tipo, doMaria.status, doMaria.pericia_id, doMaria.cliente_tipo, doMaria.data_evento], ['pericia', 'agendada', 'pendente', pericia, 'fisica', data]);
  assert.match(doMaria.texto, /^Olá, Maria\./);
  assert.match(doMaria.texto, /0000001-01\.2026\.5\.15\.0001/);
  assert.ok(doMaria.texto.includes(data.split('-').reverse().join('/')) && doMaria.texto.includes('09:30') && doMaria.texto.includes('Fórum Central'));
  assert.match(doMaria.assunto, /^Perícia agendada — Proc\./);
  assert.equal(smtp.registro.mensagens.length, 0, 'na tela de conferência NADA sai sozinho');
  // evento que já passou: não avisa
  await F.limparAvisos();
  const passada = await F.criarPericia({ data: F.dia(-2) });
  assert.deepEqual(await avisos.registrarEvento({ modulo: 'pericia', tipo: 'cancelada', id: passada }), []);
  // processo sem cliente: nada, e sem erro
  await F.desligarClientes();
  assert.deepEqual(await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia }), []);
  assert.equal((await F.avisos()).length, 0);
});

test('os quatro tipos de perícia dizem a coisa certa (agendada, remarcada, cancelada, lembrete) e a audiência virtual traz o link; ato sem comparecimento não gera aviso', async () => {
  await recomecar();
  const c = await F.cliente({ nome: 'Ana Prado Aviso' });
  await F.ligarAoProcesso(c);
  const pericia = await F.criarPericia({ data: F.dia(6) });
  for (const tipo of ['agendada', 'remarcada', 'cancelada']) await avisos.registrarEvento({ modulo: 'pericia', tipo, id: pericia });
  const porTipo = Object.fromEntries((await F.avisos()).map(x => [x.tipo, x]));
  assert.match(porTipo.agendada.texto, /foi agendada uma perícia/);
  assert.match(porTipo.remarcada.texto, /REMARCADA/);
  assert.match(porTipo.cancelada.texto, /CANCELADA/);
  assert.match(porTipo.cancelada.assunto, /^Perícia cancelada/);
  await F.limparAvisos();
  const virtual = await F.criarAudiencia({ data: F.dia(7), modalidade: 'virtual' });
  await F.sql("UPDATE audiencia SET plataforma_virtual = 'Teams', link_virtual = 'https://exemplo.invalid/sala' WHERE id = ?", [virtual]);
  await avisos.registrarEvento({ modulo: 'audiencia', tipo: 'agendada', id: virtual });
  const [aud] = await F.avisos();
  assert.equal(aud.modulo, 'audiencia');
  assert.match(aud.texto, /videoconferência \(Teams\), link: https:\/\/exemplo\.invalid\/sala/);
  const ato = await F.criarAudiencia({ data: F.dia(8), modalidade: 'sem_comparecimento' });
  assert.deepEqual(await avisos.registrarEvento({ modulo: 'audiencia', tipo: 'agendada', id: ato }), []);
  assert.equal((await F.avisos()).length, 1, 'só a audiência virtual');
});

test('envio SOZINHO (tela desligada): e-mail e SMS saem uma vez só, WhatsApp nunca; fica registrado com o aviso, o aviso vira "enviado/automatico" e a perícia vira "comunicada"', async () => {
  await recomecar();
  await F.configurar({ avisos_pericia_mostrar: 0 });
  await F.ligarComtele(true);
  const c = await F.cliente({ nome: 'Carla Dias Aviso' });
  await F.ligarAoProcesso(c);
  const pericia = await F.criarPericia({ data: F.dia(4) });
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia });
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia });
  const [aviso] = await F.avisos();
  assert.deepEqual([aviso.status, aviso.modo, aviso.decidido_por], ['enviado', 'automatico', null]);
  assert.equal(emailsPara(c.email).length, 1);
  assert.match(textoDoEmail(emailsPara(c.email)[0]), /Olá, Carla\./);
  assert.equal(sms.enviados.length, 1);
  assert.equal(sms.enviados[0].numero, c.numero);
  const log = await F.sql('SELECT canal, enviado, aviso_id, pessoa_id FROM log_comunicacoes ORDER BY id');
  assert.deepEqual(log.map(l => [l.canal, l.enviado, l.aviso_id, l.pessoa_id]), [['email', 1, aviso.id, c.id], ['sms', 1, aviso.id, c.id]]);
  assert.equal((await F.sql('SELECT comunicado_enviado FROM pericia WHERE id = ?', [pericia]))[0].comunicado_enviado, 1);
});

test('envio SOZINHO sem Comtele ativa: só o e-mail sai (o SMS nem é tentado); cliente que só tem WhatsApp ou nada continua na lista, com o motivo', async () => {
  await recomecar();
  await F.configurar({ avisos_audiencia_mostrar: 0 });
  const comEmail = await F.cliente({ nome: 'Com Email Aviso' }); const soZap = await F.cliente({ nome: 'So Zap Aviso', email: false, sms: false });
  await F.ligarAoProcesso(comEmail); await F.ligarAoProcesso(soZap);
  const aud = await F.criarAudiencia({ data: F.dia(5) });
  await avisos.registrarEvento({ modulo: 'audiencia', tipo: 'agendada', id: aud });
  const lista = await F.avisos();
  const dele = lista.find(x => x.cliente_id === comEmail.id); const zap = lista.find(x => x.cliente_id === soZap.id);
  assert.equal(dele.status, 'enviado');
  assert.equal(emailsPara(comEmail.email).length, 1);
  assert.equal(sms.enviados.length, 0, 'sem Comtele ativa não há SMS');
  assert.equal(zap.status, 'pendente');
  assert.match(zap.motivo_status, /Sem canal para envio automático/);
});

test('envio SOZINHO que falha: o aviso volta para a lista com o erro e sai quando o servidor de e-mail volta; um canal que deu certo NÃO é repetido', async () => {
  await recomecar();
  await F.configurar({ avisos_pericia_mostrar: 0 });
  await F.ligarComtele(true);
  const c = await F.cliente({ nome: 'Falha Aviso' });
  await F.ligarAoProcesso(c);
  const pericia = await F.criarPericia({ data: F.dia(4) });
  senhaAceita = false; sms.falhar = true;
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: pericia });
  let [aviso] = await F.avisos();
  assert.equal(aviso.status, 'pendente');
  assert.match(aviso.motivo_status, /Falha no envio automático/);
  senhaAceita = true;                                                      // o e-mail volta, o SMS continua fora
  await avisos.gerarAvisos();
  [aviso] = await F.avisos();
  assert.equal(aviso.status, 'enviado');
  assert.equal(emailsPara(c.email).length, 1);
  sms.falhar = false;
  await avisos.gerarAvisos();                                              // nada a repetir: o aviso já está enviado
  assert.equal(emailsPara(c.email).length, 1);
  assert.equal(sms.enviados.length, 0);
  const falhas = await F.sql("SELECT canal FROM log_comunicacoes WHERE enviado = 0 AND aviso_id = ? ORDER BY id", [aviso.id]);
  assert.deepEqual(falhas.map(x => x.canal), ['email', 'sms', 'sms'], 'as tentativas que falharam ficam registradas (o SMS foi tentado de novo porque ainda não tinha saído)');
});

test('pelas telas de verdade: cadastrar perícia e audiência cria o aviso; cancelar a perícia cria o de cancelamento e invalida o de agendamento; o botão manual "Comunicar cliente" baixa o aviso pendente', async () => {
  await recomecar();
  const c = await F.cliente({ nome: 'Rota Aviso' });
  await F.ligarAoProcesso(c);
  const tipo = (await F.sql("SELECT id FROM tipo_pericia LIMIT 1"))[0].id;
  const data = diaUtil(6);
  const criada = await api(admin).post('/api/pericias').send({ processo_id: 1, tipo_pericia_id: tipo, data, hora: '10:00', local: 'IML Central', confirmar_nova: true });
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  const id = criada.body.dados.id;
  let lista = await F.avisos();
  assert.deepEqual(lista.map(x => [x.modulo, x.tipo, x.status]), [['pericia', 'agendada', 'pendente']]);
  assert.equal(emailsPara(c.email).length, 0, 'a tela de conferência segura o envio');
  // botão manual: o cliente é avisado na hora e o aviso pendente equivalente baixa sozinho
  const manual = await api(admin).post(`/api/pericias/${id}/comunicado`).send();
  assert.equal(manual.status, 200, JSON.stringify(manual.body));
  assert.equal(emailsPara(c.email).length, 1);
  lista = await F.avisos();
  assert.deepEqual([lista[0].status, lista[0].modo], ['enviado', 'manual']);
  // cancelar: nasce o aviso de cancelamento
  const cancelada = await api(admin).put(`/api/pericias/${id}/cancelar`).send({ motivo: 'Perito indisponível' });
  assert.equal(cancelada.status, 200, JSON.stringify(cancelada.body));
  lista = await F.avisos();
  assert.deepEqual(lista.map(x => [x.tipo, x.status]), [['agendada', 'enviado'], ['cancelada', 'pendente']]);
  // audiência
  const aud = await api(admin).post('/api/audiencias').send({ processo_id: 1, tipo_audiencia_id: 1, data: diaUtil(9), hora: '15:00', modalidade: 'presencial', responsaveis: [], testemunhas: [] });
  assert.equal(aud.status, 201, JSON.stringify(aud.body));
  assert.deepEqual((await F.avisos("WHERE modulo = 'audiencia'")).map(x => [x.tipo, x.status]), [['agendada', 'pendente']]);
  // remarcar a audiência: o aviso da data antiga deixa de valer e nasce o da nova
  const remarcada = await api(admin).put(`/api/audiencias/${aud.body.dados.id}/remarcar`).send({ processo_id: 1, tipo_audiencia_id: 1, data: diaUtil(12), hora: '16:00', modalidade: 'presencial', responsaveis: [], testemunhas: [], motivo: 'Pauta do juiz' });
  assert.equal(remarcada.status, 200, JSON.stringify(remarcada.body));
  const doAud = await F.avisos("WHERE modulo = 'audiencia'");
  assert.deepEqual(doAud.map(x => [x.tipo, x.status]), [['agendada', 'cancelado'], ['remarcada', 'pendente']]);
});
