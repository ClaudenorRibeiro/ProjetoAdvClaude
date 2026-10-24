// Aviso diário de andamentos do DataJud — O RESUMO DA MANHÃ: quem recebe, por qual canal, de quais processos, só os tipos
// importantes, cada andamento avisado uma vez só (mesmo com dois resumos ao mesmo tempo), falha de e-mail que não desfaz o
// sino, e os horários (resumo no horário configurado e recuperação ao ligar).
const test = require('node:test');
const assert = require('node:assert/strict');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { pool } = require('../../src/config/database');
const email = require('../../src/utils/email');
const { enviarResumoDeAndamentos } = require('../../src/andamentosDatajud/resumo');
const { htmlDoResumo, assuntoDoResumo, mensagemDoSino } = require('../../src/andamentosDatajud/resumoHtml');
const { resumoSeForAHora, resumoDeRecuperacao, _zerarParaTeste } = require('../../src/andamentosDatajud/agendamento');

async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];

let seqPasta = 8000; let seqHash = 0;
async function novoProcesso({ responsavel = null, titulo = 'A X B' } = {}) {
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [seqPasta += 1])).insertId;
  const id = (await sql('INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, status_id, ativo, responsavel_id, criado_por) VALUES (?, ?, ?, 1, 1, ?, 1)',
    [pasta, `0000${seqPasta}-00.2026.8.26.0100`, titulo, responsavel])).insertId;
  return { id, pasta: seqPasta };
}
const novidade = async (processoId, descricao = 'Juntada de petição', codigo = 67, dia = '2026-10-23') =>
  (await sql("INSERT INTO andamento_processual (processo_id, data, descricao, fonte, codigo_movimento, hash_movimento, novidade_em) VALUES (?, ?, ?, 'datajud', ?, ?, NOW())",
    [processoId, dia, descricao, codigo, `h${String(seqHash += 1).padStart(6, '0')}`.padEnd(40, '0')])).insertId;
const sinos = (usuario) => sql("SELECT mensagem, destino FROM notificacoes WHERE usuario_id = ? AND destino = 'novidades-processos'", [usuario]);
const canal = (id, c, escopo = 'todos') => sql('UPDATE usuarios SET datajud_aviso_canal = ?, datajud_aviso_escopo = ? WHERE id = ?', [c, escopo, id]);

const enviados = [];
const original = email.enviarEmail;
test.before(async () => {
  await recriarBancoTeste();
  email.enviarEmail = async (o) => { enviados.push(o); };
});
test.after(async () => { email.enviarEmail = original; await pool.end(); });
test.beforeEach(async () => {
  enviados.length = 0;
  await sql('DELETE FROM notificacoes');
  await sql('DELETE FROM andamento_processual');
  await sql('DELETE FROM datajud_tipos_andamento');
  await sql('DELETE FROM processo_oabs');
  await sql('DELETE FROM tblproc');
  await sql("UPDATE usuarios SET datajud_aviso_canal = 'nenhum', datajud_aviso_escopo = 'meus', ativo = 1");
  await sql("UPDATE configuracoes_escritorio SET datajud_aviso_modo = 'todos', datajud_aviso_horario = '07:30'");
});

test('sino: cada pessoa recebe UM aviso que leva a "Novidades dos processos"; cada andamento entra num resumo uma vez só', async () => {
  const p1 = await novoProcesso(); const p2 = await novoProcesso();
  await novidade(p1.id); await novidade(p1.id, 'Outro movimento', 51); await novidade(p2.id);
  await canal(2, 'sino');
  const r = await enviarResumoDeAndamentos();
  assert.deepEqual(r, { andamentos: 3, pessoas: 1 });
  const avisos = await sinos(2);
  assert.deepEqual(avisos, [{ mensagem: '2 processos com andamentos novos. Veja em Novidades dos processos.', destino: 'novidades-processos' }]);
  assert.equal((await sql('SELECT 1 FROM andamento_processual WHERE avisado_em IS NULL')).length, 0);
  assert.deepEqual(await enviarResumoDeAndamentos(), { andamentos: 0, pessoas: 0 }, 'segundo resumo não repete nada');
  assert.equal((await sinos(2)).length, 1);
  assert.equal((await sinos(3)).length, 0, 'quem escolheu "nenhum" não recebe');
  assert.equal(enviados.length, 0, 'canal "sino" não manda e-mail, mesmo a pessoa tendo e-mail cadastrado');
});

test('e-mail e "ambos": o texto vem do CNJ e do cadastro, então é escapado; quem não tem e-mail não quebra nada', async () => {
  const p = await novoProcesso({ titulo: 'Maria <b>& João' });
  await novidade(p.id, 'Juntada <script>alert(1)</script> de petição');
  await canal(2, 'email'); await canal(3, 'ambos');
  await sql('UPDATE usuarios SET email = NULL WHERE id = 3');
  let r = await enviarResumoDeAndamentos();
  assert.equal(r.pessoas, 2);
  assert.equal(enviados.length, 1, 'só quem tem e-mail');
  const e = enviados[0];
  assert.equal(e.para, 'usuteste@example.invalid');
  assert.equal(e.assunto, 'Andamentos novos em 1 processo');
  assert.ok(e.html.includes('&lt;script&gt;') && !e.html.includes('<script>'));
  assert.ok(e.html.includes('Maria &lt;b&gt;&amp; João'));
  assert.ok(e.html.includes(`Pasta ${seqPasta}`));
  assert.equal((await sinos(2)).length, 0, 'canal "e-mail" não põe no sino');
  assert.equal((await sinos(3)).length, 1, 'canal "ambos" põe no sino mesmo sem e-mail');
});

test('"meus" = processos em que a pessoa é a responsável ou está nas OABs; "todos" vê tudo', async () => {
  const meu = await novoProcesso({ responsavel: 2 });
  const daOab = await novoProcesso();
  await sql('INSERT INTO processo_oabs (processo_id, usuario_id, criado_por) VALUES (?, 2, 1)', [daOab.id]);
  const dos3 = await novoProcesso({ responsavel: 3 });
  for (const p of [meu, daOab, dos3]) await novidade(p.id);
  await canal(2, 'sino', 'meus'); await canal(3, 'sino', 'meus'); await canal(1, 'sino', 'todos');
  const r = await enviarResumoDeAndamentos();
  assert.equal(r.pessoas, 3);
  assert.match((await sinos(2))[0].mensagem, /^2 processos/);
  assert.match((await sinos(3))[0].mensagem, /^1 processo com/);
  assert.match((await sinos(1))[0].mensagem, /^3 processos/);
});

test('modo "só importantes": avisa só os tipos marcados (os outros são dados como avisados e nunca viram aviso)', async () => {
  const p = await novoProcesso();
  await novidade(p.id, 'Importante', 51); await novidade(p.id, 'Rotina', 67);
  await sql("INSERT INTO datajud_tipos_andamento (codigo, nome, importante) VALUES (51, 'Conclusão', 1), (67, 'Juntada', 0)");
  await sql("UPDATE configuracoes_escritorio SET datajud_aviso_modo = 'importantes'");
  await canal(2, 'email');
  const r = await enviarResumoDeAndamentos();
  assert.equal(r.andamentos, 1);
  assert.ok(enviados[0].html.includes('Importante') && !enviados[0].html.includes('Rotina'));
  assert.equal((await sql('SELECT 1 FROM andamento_processual WHERE avisado_em IS NULL')).length, 0);
  // só andamentos de tipo comum: nada é enviado
  const q = await novoProcesso(); await novidade(q.id, 'Rotina 2', 67); enviados.length = 0;
  assert.deepEqual(await enviarResumoDeAndamentos(), { andamentos: 0, pessoas: 0 });
  assert.equal(enviados.length, 0);
});

test('dois resumos ao mesmo tempo: cada pessoa recebe UM aviso só (o primeiro que reserva leva)', async () => {
  for (let i = 0; i < 5; i += 1) await novidade((await novoProcesso()).id);
  await canal(2, 'sino'); await canal(3, 'sino');
  const [a, b] = await Promise.all([enviarResumoDeAndamentos(), enviarResumoDeAndamentos()]);
  assert.equal(a.andamentos + b.andamentos, 10, 'cada andamento foi avisado para as duas pessoas, uma vez');
  assert.equal((await sinos(2)).length, 1);
  assert.equal((await sinos(3)).length, 1);
});

test('o e-mail que não sai não desfaz o aviso do sino nem a reserva dos andamentos', async () => {
  await novidade((await novoProcesso()).id);
  await canal(2, 'ambos');
  email.enviarEmail = async () => { throw new Error('SMTP fora do ar'); };
  try {
    const r = await enviarResumoDeAndamentos();
    assert.equal(r.pessoas, 1);
  } finally { email.enviarEmail = async (o) => { enviados.push(o); }; }
  assert.equal((await sinos(2)).length, 1);
  assert.equal((await sql('SELECT 1 FROM andamento_processual WHERE avisado_em IS NULL')).length, 0);
});

test('usuário desativado não recebe; falha no meio não deixa andamento reservado sem aviso', async () => {
  await novidade((await novoProcesso()).id);
  await canal(2, 'sino');
  await sql('UPDATE usuarios SET ativo = 0 WHERE id = 2');
  assert.deepEqual(await enviarResumoDeAndamentos(), { andamentos: 0, pessoas: 0 });
  // o aviso do sino falha (tabela de notificações indisponível): a reserva desfaz junto
  await sql('UPDATE usuarios SET ativo = 1 WHERE id = 2');
  await novidade((await novoProcesso()).id, 'Chegou depois');
  await sql('RENAME TABLE notificacoes TO notificacoes_fora');
  try { await assert.rejects(enviarResumoDeAndamentos()); } finally { await sql('RENAME TABLE notificacoes_fora TO notificacoes'); }
  assert.equal((await sql('SELECT 1 FROM andamento_processual WHERE avisado_em IS NULL')).length, 1, 'continua esperando o próximo resumo');
  assert.deepEqual((await enviarResumoDeAndamentos()).pessoas, 1);
});

test('texto do e-mail: no máximo 30 processos e 3 andamentos por processo, com o "e mais" certo', () => {
  const nov = Array.from({ length: 35 }, (_, i) => ({ processoId: i, numPasta: i + 1, numero: `N${i}`, titulo: `T${i}`,
    andamentos: Array.from({ length: i === 0 ? 5 : 1 }, (_, k) => ({ data: '2026-10-23', descricao: `mov ${i}-${k}` })) }));
  const html = htmlDoResumo(nov, 'Escritório <X>');
  assert.equal((html.match(/<strong>Pasta /g) || []).length, 30);
  assert.ok(html.includes('e mais 2</li>') && html.includes('e mais 5 processo(s)'));
  assert.ok(html.includes('23/10/2026') && html.includes('Escritório &lt;X&gt;'));
  assert.equal(assuntoDoResumo(1), 'Andamentos novos em 1 processo');
  assert.equal(assuntoDoResumo(2), 'Andamentos novos em 2 processos');
  assert.match(mensagemDoSino(1), /^1 processo com andamentos novos/);
});

test('horários: o resumo sai no horário configurado (uma vez por dia) e é recuperado ao ligar o servidor', async () => {
  _zerarParaTeste();
  const p = await novoProcesso(); await novidade(p.id);
  await canal(2, 'sino');
  assert.equal(await resumoSeForAHora('2026-10-24T07:29:00'), false);
  assert.equal((await sinos(2)).length, 0);
  assert.equal(await resumoSeForAHora('2026-10-24T07:30:10'), true);
  assert.equal((await sinos(2)).length, 1);
  await novidade(p.id, 'Mais um', 51);
  assert.equal(await resumoSeForAHora('2026-10-24T07:30:40'), false, 'no mesmo dia não roda de novo');
  assert.equal((await sinos(2)).length, 1);
  assert.equal(await resumoSeForAHora('2026-10-25T07:30:00'), true, 'no dia seguinte roda');
  assert.equal((await sinos(2)).length, 2);

  // horário configurado: 09:15
  _zerarParaTeste();
  await sql("UPDATE configuracoes_escritorio SET datajud_aviso_horario = '09:15'");
  await novidade(p.id, 'De novo', 52);
  assert.equal(await resumoSeForAHora('2026-10-26T07:30:00'), false);
  assert.equal(await resumoSeForAHora('2026-10-26T09:15:00'), true);

  // recuperação: servidor ligou depois do horário e o resumo de hoje não rodou; antes do horário não faz nada
  _zerarParaTeste();
  await novidade(p.id, 'Chegou de madrugada', 53);
  assert.equal(await resumoDeRecuperacao('2026-10-27T08:00:00'), false);
  assert.equal(await resumoDeRecuperacao('2026-10-27T10:00:00'), true);
  assert.equal(await resumoDeRecuperacao('2026-10-27T10:05:00'), false, 'já rodou hoje');
});
