// AVISOS AOS CLIENTES — a rotina diária: LEMBRETES de perícia e audiência (N dias úteis antes, ou no mesmo dia) e PARABÉNS de aniversário.
// O que não pode falhar: o lembrete sair no dia certo, uma vez só, recuperar o atraso se o servidor ficou parado, nunca avisar depois do evento,
// e NÃO duplicar o aviso de "agendada" quando a perícia foi marcada em cima da hora. Datas contadas a partir de "hoje" do banco de teste.
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
const cal = require('../../src/services/calendarioService');

let app; let smtp; let admin;
const emailsPara = (endereco) => smtp.registro.mensagens.filter(m => m.para.includes(endereco));
async function recomecar() {
  await F.limparAvisos(); await F.desligarClientes();
  await F.sql('DELETE FROM pericia'); await F.sql('DELETE FROM audiencia'); await F.sql('DELETE FROM parabens_enviados');
  smtp.registro.mensagens.length = 0;
  await F.configurar({ avisos_pericia_mostrar: 1, avisos_audiencia_mostrar: 1, avisos_parabens_mostrar: 1, dias_alerta_pericia: 2, dias_alerta_audiencia: 3, dias_aviso_parabens: 0 });
  await F.ligarComtele(false);
}
// O lembrete é contado em DIAS ÚTEIS, então só cai num dia útil: se a bateria roda num sábado ou domingo, não existe evento "com lembrete hoje".
// Os testes de lembrete usam como "hoje" o último dia útil (HU; igual ao dia real de segunda a sexta) e passam esse dia para gerarAvisos.
// diaU(n) = n dias a partir de HU; ha(n) = "criado há n dias" já contando os dias de fim de semana entre HU e o dia real.
let HU = F.HOJE; let ATRASO = 0;
const diaU = (n) => F.dia(n - ATRASO);
const ha = (n) => n + ATRASO;
async function descobrirDiaUtil() {
  const [r] = await F.sql('SELECT DATE_FORMAT(MAX(data), \'%Y-%m-%d\') AS d FROM calendario WHERE dia_util = 1 AND data <= ?', [F.HOJE]);
  HU = r.d; ATRASO = Math.round((Date.parse(`${F.HOJE}T12:00:00Z`) - Date.parse(`${HU}T12:00:00Z`)) / 86400000);
}
// Primeiro dia (a partir de amanhã) cujo lembrete de N dias úteis cai em HU.
async function eventoComLembreteHoje(dias) {
  for (let n = 1; n <= 20; n += 1) if ((await cal.diasUteisAntes(diaU(n), dias)) === HU) return diaU(n);
  throw new Error('o calendário de teste não tem uma data cujo lembrete caia no dia útil de hoje');
}
const nascidoHa = (anos, somarDias = 0) => { const d = new Date(`${F.dia(somarDias)}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - anos); return d.toISOString().slice(0, 10); };
const tipos = async (filtro = '', p = []) => (await F.avisos(filtro, p)).map(x => `${x.modulo}:${x.tipo}:${x.status}`);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  smtp = await iniciarSmtpFalso();
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 's'; process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
  await F.semearCalendario();
  await descobrirDiaUtil();
  admin = await F.usuario({ nivel: 1 });
});
test.after(async () => { await smtp.parar(); require('node-cron').getTasks().forEach(tarefa => tarefa.stop()); await pool.end(); });

test('lembrete de perícia: sai no dia certo (2 dias úteis antes), uma vez só, por cliente; ainda não é o dia, perícia cancelada e passada não geram nada', async () => {
  await recomecar();
  const c = await F.cliente({ nome: 'Lia Prado Aviso' });
  await F.ligarAoProcesso(c);
  const dataCerta = await eventoComLembreteHoje(2);
  const certa = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(5) });
  await F.criarPericia({ data: diaU(40), criadoHaDias: ha(5) });                         // lembrete só daqui a semanas
  await F.criarPericia({ data: dataCerta, status: 'cancelada', criadoHaDias: ha(5) });
  await F.criarPericia({ data: diaU(-1), criadoHaDias: ha(9) });                          // já passou
  const r = await avisos.gerarAvisos({ hoje: HU });
  assert.equal(r.lembretes, 1);
  const [aviso] = await F.avisos();
  assert.deepEqual([aviso.modulo, aviso.tipo, aviso.status, aviso.pericia_id, aviso.data_aviso, aviso.data_evento], ['pericia', 'lembrete', 'pendente', certa, HU, dataCerta]);
  assert.match(aviso.texto, /^Olá, Lia\. Lembramos que você tem uma perícia/);
  await avisos.gerarAvisos({ hoje: HU });
  assert.equal((await F.avisos()).length, 1, 'rodar de novo não repete');
});

test('o lembrete só vale se ainda FALTAVA mais tempo quando o evento foi marcado: perícia marcada em cima da hora (ou remarcada hoje) NÃO recebe lembrete junto do aviso de agendada', async () => {
  await recomecar();
  const c = await F.cliente();
  await F.ligarAoProcesso(c);
  const dataCerta = await eventoComLembreteHoje(2);
  const recente = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(0) });          // cadastrada hoje, já dentro do prazo do lembrete
  await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: recente });
  await avisos.gerarAvisos({ hoje: HU });
  assert.deepEqual(await tipos(), ['pericia:agendada:pendente'], 'só o aviso de agendada');
  // perícia marcada com folga: o aviso de "agendada" é de 5 dias atrás, então o lembrete de hoje ainda faz sentido
  await F.limparAvisos();
  const antiga = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(5) });
  await F.sql("INSERT INTO avisos_cliente (modulo, tipo, pericia_id, cliente_tipo, cliente_id, processo_id, data_evento, data_aviso, assunto, texto, status, modo) VALUES ('pericia', 'agendada', ?, ?, ?, 1, ?, DATE_SUB(CURDATE(), INTERVAL ? DAY), 'x', 'x', 'enviado', 'tela')", [antiga, c.tipo, c.id, dataCerta, ha(5)]);
  await F.sql('UPDATE avisos_cliente SET criado_em = DATE_SUB(NOW(), INTERVAL ? DAY)', [ha(5)]);
  await avisos.gerarAvisos({ hoje: HU });
  assert.ok((await tipos()).includes('pericia:lembrete:pendente'), 'marcada com folga: o lembrete sai');
});

test('lembrete "no mesmo dia" (0 dias): perícia de hoje marcada ontem avisa hoje; a de amanhã ainda não; a marcada hoje para hoje não', async () => {
  await recomecar();
  await F.configurar({ dias_alerta_pericia: 0 });
  const c = await F.cliente();
  await F.ligarAoProcesso(c);
  const deHoje = await F.criarPericia({ data: F.HOJE, criadoHaDias: 1 });
  await F.criarPericia({ data: F.dia(1), criadoHaDias: 1 });
  await F.criarPericia({ data: F.HOJE, criadoHaDias: 0 });
  await avisos.gerarAvisos();
  const lista = await F.avisos();
  assert.equal(lista.length, 1);
  assert.deepEqual([lista[0].pericia_id, lista[0].data_aviso], [deHoje, F.HOJE]);
});

test('servidor parado: o lembrete que ficou para trás sai no primeiro dia em que o sistema volta (enquanto a perícia ainda não passou); depois que passa, o aviso pendente expira', async () => {
  await recomecar();
  const c = await F.cliente();
  await F.ligarAoProcesso(c);
  const futura = await F.criarPericia({ data: F.dia(1), criadoHaDias: 20 });          // o dia do lembrete (2 úteis antes) já ficou para trás
  await avisos.gerarAvisos();
  assert.deepEqual((await F.avisos()).map(x => [x.pericia_id, x.tipo, x.status]), [[futura, 'lembrete', 'pendente']]);
  await F.sql("UPDATE pericia SET data = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id = ?", [futura]);   // o tempo passa: a data do evento fica no passado
  await F.sql("UPDATE avisos_cliente SET data_evento = DATE_SUB(CURDATE(), INTERVAL 1 DAY)");
  await avisos.gerarAvisos();
  const [aviso] = await F.avisos();
  assert.equal(aviso.status, 'expirado');
  assert.match(aviso.motivo_status, /data do evento já passou/);
});

test('aviso pendente que não vale mais é cancelado sozinho: perícia remarcada para outra data ou cancelada; excluir a perícia leva o aviso junto (sem aviso órfão)', async () => {
  await recomecar();
  const c = await F.cliente();
  await F.ligarAoProcesso(c);
  const dataCerta = await eventoComLembreteHoje(2);
  const mudou = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(5) });
  const cancelou = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(5) });
  const apagada = await F.criarPericia({ data: dataCerta, criadoHaDias: ha(5) });
  await avisos.gerarAvisos({ hoje: HU });
  assert.equal((await F.avisos()).length, 3);
  await F.sql('UPDATE pericia SET data = DATE_ADD(data, INTERVAL 7 DAY) WHERE id = ?', [mudou]);
  await F.sql("UPDATE pericia SET status = 'cancelada' WHERE id = ?", [cancelou]);
  await F.sql('DELETE FROM pericia WHERE id = ?', [apagada]);
  await avisos.gerarAvisos({ hoje: HU });
  const lista = await F.avisos();
  assert.equal(lista.length, 2, 'o da perícia excluída sumiu junto');
  assert.deepEqual(lista.map(x => [x.pericia_id, x.status]).sort(), [[cancelou, 'cancelado'], [mudou, 'cancelado']].sort());
  assert.match(lista[0].motivo_status, /alterado ou cancelado/);
});

test('lembrete de audiência: 3 dias úteis por padrão, vale audiência adiada, ato sem comparecimento nunca gera aviso, e o texto acompanha a hora quando ninguém editou (e respeita a edição)', async () => {
  await recomecar();
  const c = await F.cliente({ nome: 'Rui Alves Aviso' });
  await F.ligarAoProcesso(c);
  let dataCerta = null;
  for (let n = 1; n <= 20 && !dataCerta; n += 1) if ((await cal.diasUteisAntes(diaU(n), 3)) === HU) dataCerta = diaU(n);
  const normal = await F.criarAudiencia({ data: dataCerta, hora: '14:00', criadoHaDias: ha(6) });
  await F.criarAudiencia({ data: dataCerta, hora: '15:00', status: 'adiada', criadoHaDias: ha(6) });
  await F.criarAudiencia({ data: dataCerta, hora: '09:00', modalidade: 'sem_comparecimento', criadoHaDias: ha(6) });
  await avisos.gerarAvisos({ hoje: HU });
  assert.equal((await F.avisos()).length, 2, 'normal + adiada; o ato sem comparecimento fica de fora');
  const aviso = (await F.avisos()).find(x => x.audiencia_id === normal);
  assert.match(aviso.texto, /14:00/);
  await F.sql("UPDATE audiencia SET hora = '16:30' WHERE id = ?", [normal]);
  await avisos.gerarAvisos({ hoje: HU });
  assert.match((await F.avisos('WHERE id = ?', [aviso.id]))[0].texto, /16:30/, 'sem edição, o texto acompanha a mudança');
  await F.sql("UPDATE avisos_cliente SET texto = 'Texto escrito pela secretária', texto_editado = 1 WHERE id = ?", [aviso.id]);
  await F.sql("UPDATE audiencia SET hora = '17:00' WHERE id = ?", [normal]);
  await avisos.gerarAvisos({ hoje: HU });
  assert.equal((await F.avisos('WHERE id = ?', [aviso.id]))[0].texto, 'Texto escrito pela secretária', 'texto editado na tela nunca é reescrito');
});

test('parabéns: cliente pessoa física que faz aniversário HOJE gera aviso (texto padrão do escritório); amanhã só com 1 dia de antecedência; quem não é cliente, está inativo ou já foi parabenizado não gera', async () => {
  await recomecar();
  const hoje = await F.cliente({ nome: 'Beatriz Nunes Aviso', nascimento: nascidoHa(30) });
  const amanha = await F.cliente({ nome: 'Caio Mota Aviso', nascimento: nascidoHa(40, 1) });
  const inativo = await F.cliente({ nome: 'Inativo Aviso', nascimento: nascidoHa(50) });
  const jaFoi = await F.cliente({ nome: 'Ja Foi Aviso', nascimento: nascidoHa(35) });
  const semProcesso = await F.cliente({ nome: 'Sem Processo Aviso', nascimento: nascidoHa(25) });
  for (const x of [hoje, amanha, inativo, jaFoi]) await F.ligarAoProcesso(x);
  await F.sql('UPDATE pessoas_fisicas SET ativo = 0 WHERE id = ?', [inativo.id]);
  await F.sql("INSERT INTO parabens_enviados (pessoa_id, ano, canal, usuario_id) VALUES (?, YEAR(CURDATE()), 'whatsapp', ?)", [jaFoi.id, admin.id]);
  await avisos.gerarAvisos();
  let lista = await F.avisos();
  assert.deepEqual(lista.map(x => [x.pessoa_fisica_id, x.tipo, x.status]), [[hoje.id, 'aniversario', 'pendente']]);
  assert.equal(lista[0].texto, 'Olá, Beatriz! O escritório Escritório Automatizado deseja a você um feliz aniversário! 🎂');
  assert.equal(lista[0].processo_id, null);
  void semProcesso;
  await F.configurar({ dias_aviso_parabens: 1 });
  await avisos.gerarAvisos();
  lista = await F.avisos();
  assert.deepEqual(lista.map(x => x.pessoa_fisica_id).sort(), [hoje.id, amanha.id].sort(), 'com 1 dia de antecedência o de amanhã entra');
  await avisos.gerarAvisos();
  assert.equal((await F.avisos()).length, 2, 'rodar de novo não repete');
});

test('parabéns: quem foi parabenizado pelo botão manual baixa o aviso pendente; quem deixou de ser cliente ativo cancela; enviado SOZINHO fica registrado como "já parabenizado" (Envio automático)', async () => {
  await recomecar();
  const a = await F.cliente({ nome: 'Manual Aviso', nascimento: nascidoHa(33) });
  const b = await F.cliente({ nome: 'Saiu Aviso', nascimento: nascidoHa(44) });
  await F.ligarAoProcesso(a); await F.ligarAoProcesso(b);
  await avisos.gerarAvisos();
  assert.equal((await F.avisos()).length, 2);
  await F.sql("INSERT INTO parabens_enviados (pessoa_id, ano, canal, usuario_id) VALUES (?, YEAR(CURDATE()), 'email', ?)", [a.id, admin.id]);
  await F.sql('UPDATE pessoas_fisicas SET ativo = 0 WHERE id = ?', [b.id]);
  await avisos.gerarAvisos();
  const lista = await F.avisos();
  assert.deepEqual(lista.map(x => [x.pessoa_fisica_id, x.status, x.modo]).sort(), [[a.id, 'enviado', 'manual'], [b.id, 'cancelado', 'automatico']].sort());
  // modo automático: o e-mail sai e o parabéns conta como enviado neste ano
  await recomecar();
  await F.configurar({ avisos_parabens_mostrar: 0 });
  const c = await F.cliente({ nome: 'Auto Aviso', nascimento: nascidoHa(28) });
  await F.ligarAoProcesso(c);
  await avisos.gerarAvisos();
  assert.equal(emailsPara(c.email).length, 1);
  const registro = await F.sql('SELECT canal, usuario_id FROM parabens_enviados WHERE pessoa_id = ?', [c.id]);
  assert.deepEqual(registro.map(x => [x.canal, x.usuario_id]), [['email', null]]);
  const lido = await request(app).get('/api/pessoas/aniversariantes?filtro=hoje').set('Authorization', `Bearer ${admin.token}`);
  const dela = lido.body.dados.registros.find(x => x.id === c.id);
  assert.equal(dela.ja_parabenizado, true);
  assert.equal(dela.parabens[0].usuario_nome, 'Envio automático');
});
