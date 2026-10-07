// Teste de servidor de PUBLICAÇÕES — sem chamar AASP, CNJ nem IA de verdade (as respostas dessas fontes são simuladas aqui;
// a IA usa o modo "mock" que o próprio sistema já tem). E-mail: servidor SMTP falso local.
// Regras que este arquivo protege:
//   - BUSCADOR (quem tem publicacoes/cadastrar, ou administrador) vê tudo; quem NÃO é buscador só vê o que foi atribuído a ele;
//   - tratar/atribuir/excluir/importar/e-mail respeitam quem pode; excluir NUNCA apaga publicação tratada nem passa da aba (fonte);
//   - excluir em lote apaga exatamente o que a lista mostra e não deixa registro órfão;
//   - importar não duplica (AASP por processo/dia; CNJ por id) e falha da fonte não grava nada pela metade.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { iniciarSmtpFalso } = require('../support/smtpFalso');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const aaspService = require('../../src/services/aaspService');
const cnjService = require('../../src/services/cnjService');
const iaService = require('../../src/services/iaService');

const PROC_CADASTRADO = '0000001-01.2026.5.15.0001';   // o processo que o banco de testes já tem
let app; let smtp;
const T = {};          // tokens por papel
const U = {};          // ids dos usuários
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (p, t = T.admin) => request(app).get(p).set('Authorization', `Bearer ${t}`);
const post = (p, t = T.admin) => request(app).post(p).set('Authorization', `Bearer ${t}`);
const put = (p, t = T.admin) => request(app).put(p).set('Authorization', `Bearer ${t}`);
const del = (p, t = T.admin) => request(app).delete(p).set('Authorization', `Bearer ${t}`);
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
let SEQ = 0;
// Cria uma publicação direto no banco (cada uma com texto único).
async function nova(extra = {}) {
  SEQ += 1;
  const d = { fonte: 'aasp', data: '2026-03-15', numero_processo: null, texto: `Texto da publicação de teste ${SEQ}`, tratada: 0, tribunal: null, id_cnj: null, ...extra };
  const r = await sql(
    `INSERT INTO publicacoes (fonte, id_cnj, data_publicacao, numero_processo, tribunal, texto, texto_hash, escritorio, tratada)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [d.fonte, d.id_cnj, d.data, d.numero_processo, d.tribunal, d.texto, crypto.createHash('sha256').update(d.texto + SEQ).digest('hex'), d.tratada]);
  return r.insertId;
}
async function criarUsuario(login, nivel, permissoes) {
  const sessao = `sessao-${login}`;
  const r = await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0)`, [`Usuário ${login}`, login, `${login}@example.invalid`, nivel, sessao]);
  for (const acao of permissoes) await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'publicacoes', NULL, ?, 1)", [r.insertId, acao]);
  U[login] = r.insertId;
  T[login] = token(r.insertId, nivel, sessao);
}
const ids = (r) => (r.body.dados.registros || []).map(x => x.id);
async function configurarIntegracao(modulo, ativo, configuracoes) {
  await sql(`INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE ativo = VALUES(ativo), configuracoes = VALUES(configuracoes)`, [modulo, ativo, JSON.stringify(configuracoes)]);
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  T.admin = token(1, 1, 'sessao-admin');
  T.semPermissao = token(3, 2, 'sessao-sem-permissao');
  U.admin = 1;
  // buscador comum (tem "cadastrar"), recebedor (só visualiza), recebedor com "alterar", e quem só visualiza e exclui
  await criarUsuario('buscador', 2, ['visualizar', 'cadastrar', 'alterar', 'excluir']);
  await criarUsuario('recebedor', 2, ['visualizar']);
  await criarUsuario('recebedor_alterar', 2, ['visualizar', 'alterar']);
  await criarUsuario('recebedor_excluir', 2, ['visualizar', 'excluir']);
  smtp = await iniciarSmtpFalso();
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.porta);
  process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 's'; process.env.EMAIL_FROM = 'Escritório Teste <envio@example.invalid>';
});
test.after(async () => {
  await smtp.parar();
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ============================================================ lista, filtros, ordem e paginação
test('lista: só a fonte da aba, mais recente primeiro, com total, e a paginação não repete nem perde ninguém', async () => {
  const a = await nova({ data: '2026-04-01', texto: 'lista A' });
  const b = await nova({ data: '2026-04-03', texto: 'lista B' });
  const c = await nova({ data: '2026-04-02', texto: 'lista C' });
  const cnj = await nova({ fonte: 'cnj', data: '2026-04-02', texto: 'lista CNJ', id_cnj: 700001, tribunal: 'TRT15' });
  const aasp = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&fonte=aasp');
  assert.equal(aasp.status, 200);
  assert.deepEqual(ids(aasp), [b, c, a]);                    // data desc
  assert.equal(aasp.body.dados.total, 3);
  const doCnj = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&fonte=cnj');
  assert.deepEqual(ids(doCnj), [cnj]);
  assert.equal(doCnj.body.dados.registros[0].tribunal, 'TRT15');
  const asc = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&ordenar=data&direcao=asc');
  assert.deepEqual(ids(asc), [a, c, b]);
  const p1 = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&limite=2&pagina=1');
  const p2 = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&limite=2&pagina=2');
  assert.deepEqual([...ids(p1), ...ids(p2)], [b, c, a]);
  assert.equal(p2.body.dados.total, 3);
  // ordenar por coluna que não existe não vira SQL solto: cai na ordem padrão
  const ruim = await get('/api/publicacoes?dataInicio=2026-04-01&dataFim=2026-04-03&ordenar=texto;DROP&direcao=asc');
  assert.equal(ruim.status, 200);
  assert.deepEqual(ids(ruim), [b, c, a]);
});

test('lista: filtros de período (e a trava de 3 meses), status, pesquisa por texto/processo, e % e _ são letras comuns', async () => {
  const t = await nova({ data: '2026-05-10', numero_processo: '5555555-55.2026.5.15.0055', texto: 'desconto de 50% no prazo' });
  const u = await nova({ data: '2026-05-20', texto: 'outro texto qualquer', tratada: 1 });
  const dia = await get('/api/publicacoes?dataInicio=2026-05-10&dataFim=2026-05-10');
  assert.deepEqual(ids(dia), [t]);
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&tratada=1')), [u]);
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&tratada=0')), [t]);
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&busca=5555555')), [t]);
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&busca=outro texto')), [u]);
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&busca=50%25')), [t]);   // "50%" literal
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&busca=%25')), [t]);     // só "%": não vira "tudo"
  assert.deepEqual(ids(await get('/api/publicacoes?dataInicio=2026-05-01&dataFim=2026-05-31&busca=_')), []);        // "_" literal não casa tudo
  const longo = await get('/api/publicacoes?busca=' + 'x'.repeat(201));
  assert.equal(longo.status, 400);
  assert.equal((await get('/api/publicacoes?busca[]=a')).status, 400);
  const passa = await get('/api/publicacoes?dataInicio=2026-01-01&dataFim=2026-04-02');   // 3 meses e 1 dia
  assert.equal(passa.status, 400);
  assert.match(passa.body.mensagem, /3 meses/);
  assert.equal((await get('/api/publicacoes?dataInicio=2026-01-01&dataFim=2026-04-01')).status, 200);               // exatamente 3 meses
  for (const ruimPag of ['pagina=-5&limite=abc', 'pagina=0&limite=0', 'limite=99999']) assert.equal((await get(`/api/publicacoes?${ruimPag}`)).status, 200, ruimPag);
});

test('lista: marca a publicação repetida no mesmo dia, o processo cadastrado e a que o usuário já leu', async () => {
  const a = await nova({ data: '2026-06-05', numero_processo: PROC_CADASTRADO });
  const b = await nova({ data: '2026-06-05', numero_processo: '00000010120265150001' });      // o mesmo processo, sem pontuação
  const c = await nova({ data: '2026-06-05', numero_processo: '8888888-88.2026.5.15.0088' });
  const d = await nova({ data: '2026-06-06', numero_processo: PROC_CADASTRADO });             // outro dia: não é repetida
  assert.equal((await post(`/api/publicacoes/${c}/marcar-lida`)).status, 200);
  const r = await get('/api/publicacoes?dataInicio=2026-06-05&dataFim=2026-06-06');
  const por = Object.fromEntries(r.body.dados.registros.map(x => [x.id, x]));
  assert.deepEqual([por[a].duplicada, por[b].duplicada, por[c].duplicada, por[d].duplicada].map(Number), [1, 1, 0, 0]);
  assert.deepEqual([por[a].processo_cadastrado, por[c].processo_cadastrado].map(Number), [1, 0]);
  assert.deepEqual([por[c].lida, por[a].lida].map(Number), [1, 0]);
  // marcar como lida duas vezes não duplica nem dá erro; a leitura é INDIVIDUAL de cada usuário
  assert.equal((await post(`/api/publicacoes/${c}/marcar-lida`)).status, 200);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes_lidas WHERE publicacao_id = ?', [c]))[0].n, 1);
  const outro = await get('/api/publicacoes?dataInicio=2026-06-05&dataFim=2026-06-06', T.buscador);
  assert.equal(outro.body.dados.registros.find(x => x.id === c).lida, 0);
});

// ============================================================ visibilidade, atribuir e tratar
test('quem NÃO é buscador só vê o que foi atribuído a ele; o status é o pessoal dele; o buscador recorta com "Atribuídas a mim"', async () => {
  const x = await nova({ data: '2026-07-01', numero_processo: PROC_CADASTRADO });
  const y = await nova({ data: '2026-07-01', numero_processo: '7777777-77.2026.5.15.0077' });
  const periodo = '?dataInicio=2026-07-01&dataFim=2026-07-01';
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}`, T.recebedor)), []);
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}`, T.buscador)).sort(), [x, y].sort());
  const at = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor] });
  assert.equal(at.status, 200);
  assert.deepEqual([at.body.dados.adicionados, at.body.dados.removidos], [1, 0]);
  const dele = await get(`/api/publicacoes${periodo}`, T.recebedor);
  assert.deepEqual(ids(dele), [x]);
  assert.equal(dele.body.dados.registros[0].atribuida_a_mim, true);
  assert.equal(dele.body.dados.registros[0].pode_agir, true);
  assert.equal(dele.body.dados.registros[0].tratada, 0);            // o status é o PESSOAL (a global já virou "tratada" pelo buscador)
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}&escopo=minhas`, T.buscador)), []);
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}&escopo=minhas`, T.recebedor)), [x]);
  // o recebedor trata a dele: muda só a linha dele
  const tratar = await put(`/api/publicacoes/${x}/tratar`, T.recebedor).send({ tratada: true });
  assert.equal(tratar.status, 200);
  assert.equal((await sql('SELECT tratada FROM publicacao_usuario WHERE publicacao_id = ? AND usuario_id = ?', [x, U.recebedor]))[0].tratada, 1);
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}&tratada=1`, T.recebedor)), [x]);
  assert.deepEqual(ids(await get(`/api/publicacoes${periodo}&tratada=0`, T.recebedor)), []);
  const reabre = await put(`/api/publicacoes/${x}/tratar`, T.recebedor).send({ tratada: false });
  assert.equal(reabre.body.mensagem, 'Publicação reaberta');
  assert.equal((await sql('SELECT tratada FROM publicacao_usuario WHERE publicacao_id = ? AND usuario_id = ?', [x, U.recebedor]))[0].tratada, 0);
  // quem não recebeu a publicação não trata, mesmo com "alterar"
  assert.equal((await put(`/api/publicacoes/${y}/tratar`, T.recebedor).send({ tratada: true })).status, 403);
  assert.equal((await put(`/api/publicacoes/${y}/tratar`, T.recebedor_alterar).send({ tratada: true })).status, 403);
});

test('acesso individual (ver, histórico, marcar como lida, IA): o não-buscador só acessa a atribuída a ele; "alterar" não amplia a leitura', async () => {
  const x = await nova({ data: '2026-07-02', texto: 'confidencial X' });
  const y = await nova({ data: '2026-07-02', texto: 'confidencial Y' });
  await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor] });
  for (const rota of [`/api/publicacoes/${y}`, `/api/publicacoes/${y}/historico`]) {
    assert.equal((await get(rota, T.recebedor)).status, 403, rota);
    assert.equal((await get(rota, T.recebedor_alterar)).status, 403, `${rota} (com alterar)`);
    assert.equal((await get(rota, T.buscador)).status, 200, `${rota} (buscador)`);
  }
  assert.equal((await post(`/api/publicacoes/${y}/marcar-lida`, T.recebedor)).status, 403);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes_lidas WHERE publicacao_id = ? AND usuario_id = ?', [y, U.recebedor]))[0].n, 0);
  const meu = await get(`/api/publicacoes/${x}`, T.recebedor);
  assert.equal(meu.status, 200);
  assert.equal(meu.body.dados.texto, 'confidencial X');
  assert.equal((await post(`/api/publicacoes/${x}/marcar-lida`, T.recebedor)).status, 200);
  const hist = await get(`/api/publicacoes/${x}/historico`, T.recebedor);
  assert.deepEqual(hist.body.dados.direcionada_usuarios, ['Usuário recebedor']);
  assert.deepEqual(Object.keys(hist.body.dados.acoes).sort(), ['audiencias', 'compromissos', 'prazos', 'tarefas']);
  assert.equal((await get('/api/publicacoes/999999')).status, 404);
  assert.equal((await get('/api/publicacoes/999999/historico')).status, 404);
});

test('atribuir: só buscador; adiciona e remove avisando no sino; sem ninguém a publicação volta a pendente; quem já tratou não sai', async () => {
  const x = await nova({ data: '2026-07-03', numero_processo: PROC_CADASTRADO });
  assert.equal((await put(`/api/publicacoes/${x}/atribuir`, T.recebedor).send({ usuario_ids: [U.recebedor] })).status, 403);
  assert.equal((await put(`/api/publicacoes/${x}/atribuir`, T.recebedor_alterar).send({ usuario_ids: [U.recebedor] })).status, 403);
  assert.equal((await put('/api/publicacoes/999999/atribuir').send({ usuario_ids: [U.recebedor] })).status, 404);
  const contarAvisos = async (trecho) => (await sql('SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id IN (?, ?) AND mensagem LIKE ?', [U.recebedor, U.recebedor_alterar, `%${trecho}%`]))[0].n;
  const avisosAntes = await contarAvisos('foi atribuída a você');
  const um = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor, U.recebedor_alterar, U.recebedor, 'abc', -1, 999999] });
  assert.equal(um.status, 200);
  assert.deepEqual([um.body.dados.adicionados, um.body.dados.removidos], [2, 0]);        // repetido, "abc", negativo e usuário que não existe são ignorados
  const pub = (await sql('SELECT tratada, direcionada_por FROM publicacoes WHERE id = ?', [x]))[0];
  assert.deepEqual([pub.tratada, pub.direcionada_por], [1, 1]);                          // atribuiu = o buscador resolveu a triagem
  assert.equal((await contarAvisos('foi atribuída a você')) - avisosAntes, 2);          // um aviso para cada pessoa adicionada
  const ultimo = (await sql("SELECT mensagem FROM notificacoes WHERE usuario_id = ? AND mensagem LIKE '%foi atribuída a você%' ORDER BY id DESC LIMIT 1", [U.recebedor]))[0];
  assert.match(ultimo.mensagem, new RegExp(`Publicação de 03/07/2026 — processo ${PROC_CADASTRADO.replace(/\./g, '\\.')} foi atribuída a você`));
  const lista = await get(`/api/publicacoes/${x}/atribuicoes`);
  assert.deepEqual(lista.body.dados.map(l => l.usuario_id).sort(), [U.recebedor, U.recebedor_alterar].sort());
  // sem mudança = nada a fazer
  const igual = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor, U.recebedor_alterar] });
  assert.equal(igual.body.mensagem, 'Nada para alterar.');
  // um deles trata e fica protegido; o outro sai e é avisado
  await put(`/api/publicacoes/${x}/tratar`, T.recebedor).send({ tratada: true });
  const protegido = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [] });
  assert.equal(protegido.status, 200);
  assert.deepEqual([protegido.body.dados.removidos, protegido.body.dados.protegidos], [1, ['Usuário recebedor']]);
  assert.match((await sql("SELECT mensagem FROM notificacoes WHERE usuario_id = ? AND mensagem LIKE '%deixou de estar atribuída%'", [U.recebedor_alterar]))[0].mensagem, /deixou de estar atribuída a você/);
  const soProtegido = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [] });
  assert.equal(soProtegido.status, 400);                                                 // tentar tirar só quem já tratou é recusado
  assert.match(soProtegido.body.mensagem, /já tratou esta publicação/);
  // quem tratou volta a "pendente" só se alguém reabrir e depois tudo for removido
  await put(`/api/publicacoes/${x}/tratar`, T.recebedor).send({ tratada: false });
  const vazio = await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [] });
  assert.equal(vazio.body.dados.removidos, 1);
  const volta = (await sql('SELECT tratada, tratada_por, direcionada_por FROM publicacoes WHERE id = ?', [x]))[0];
  assert.deepEqual([volta.tratada, volta.tratada_por, volta.direcionada_por], [0, null, null]);
});

test('tratar: processo não cadastrado nunca vira tratada; "sem ação" exige o motivo; reabrir sempre pode; buscador mexe no selo global', async () => {
  const semProc = await nova({ data: '2026-07-04', numero_processo: '6666666-66.2026.5.15.0066' });
  const semNumero = await nova({ data: '2026-07-04' });
  const cad = await nova({ data: '2026-07-04', numero_processo: PROC_CADASTRADO });
  for (const p of [semProc, semNumero]) {
    const r = await put(`/api/publicacoes/${p}/tratar`).send({ tratada: true });
    assert.equal(r.status, 400, `publicação ${p}`);
    assert.match(r.body.mensagem, /processo não está cadastrado/);
    assert.equal((await sql('SELECT tratada FROM publicacoes WHERE id = ?', [p]))[0].tratada, 0);
  }
  const semMotivo = await put(`/api/publicacoes/${cad}/tratar`).send({ tratada: true, sem_acao: true });
  assert.equal(semMotivo.status, 400);
  assert.match(semMotivo.body.mensagem, /motivo/);
  const comEspacos = await put(`/api/publicacoes/${cad}/tratar`).send({ tratada: true, sem_acao: true, motivo: '   ' });
  assert.equal(comEspacos.status, 400);
  const ok = await put(`/api/publicacoes/${cad}/tratar`).send({ tratada: true, sem_acao: true, motivo: '  Já resolvido por telefone  ' });
  assert.equal(ok.status, 200);
  const g = (await sql('SELECT tratada, tratada_por, motivo_sem_acao FROM publicacoes WHERE id = ?', [cad]))[0];
  assert.deepEqual([g.tratada, g.tratada_por, g.motivo_sem_acao], [1, 1, 'Já resolvido por telefone']);
  const lista = await get('/api/publicacoes?dataInicio=2026-07-04&dataFim=2026-07-04');
  assert.equal(lista.body.dados.registros.find(r => r.id === cad).motivo_sem_acao, 'Já resolvido por telefone');
  const reabre = await put(`/api/publicacoes/${cad}/tratar`).send({ tratada: false });
  assert.equal(reabre.status, 200);
  const g2 = (await sql('SELECT tratada, tratada_por, motivo_sem_acao FROM publicacoes WHERE id = ?', [cad]))[0];
  assert.deepEqual([g2.tratada, g2.tratada_por, g2.motivo_sem_acao], [0, null, null]);
  assert.equal((await put('/api/publicacoes/999999/tratar').send({ tratada: false })).status, 404);
  // tratar automático (ao criar prazo/tarefa) não pede motivo
  assert.equal((await put(`/api/publicacoes/${cad}/tratar`).send({ tratada: true })).status, 200);
  // buscador com "alterar" age em qualquer uma; buscador SEM "alterar" não age em publicação que não é dele
  const ba = await criarUsuarioSemAlterar();
  assert.equal((await put(`/api/publicacoes/${semNumero}/tratar`, ba).send({ tratada: false })).status, 403);
});
async function criarUsuarioSemAlterar() {
  if (!T.buscador_sem_alterar) await criarUsuario('buscador_sem_alterar', 2, ['visualizar', 'cadastrar']);
  return T.buscador_sem_alterar;
}

// ============================================================ excluir
test('excluir: só buscador com permissão de excluir; apaga os vínculos junto, registra no log; publicação tratada é preservada', async () => {
  const x = await nova({ data: '2026-08-01' });
  await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor] });
  // atribuir já marca como tratada para o buscador; para poder excluir é preciso reabrir
  assert.equal((await del(`/api/publicacoes/${x}`)).status, 400);
  assert.match((await del(`/api/publicacoes/${x}`)).body.mensagem, /tratadas não podem ser excluídas/);
  await put(`/api/publicacoes/${x}/tratar`).send({ tratada: false });
  await post(`/api/publicacoes/${x}/marcar-lida`);
  await sql('INSERT INTO publicacoes_etiquetas (publicacao_id, usuario_id, slot) VALUES (?, 1, 2)', [x]);
  assert.equal((await del(`/api/publicacoes/${x}`, T.recebedor)).status, 403);
  assert.equal((await del(`/api/publicacoes/${x}`, T.recebedor_excluir)).status, 403);        // tem "excluir" mas não é buscador
  assert.equal((await del(`/api/publicacoes/${x}`, T.semPermissao)).status, 403);
  const antesLog = (await sql('SELECT COUNT(*) AS n FROM log_publicacoes'))[0].n;
  const r = await del(`/api/publicacoes/${x}`);
  assert.equal(r.status, 200);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [x]))[0].n, 0);
  for (const tabela of ['publicacao_usuario', 'publicacoes_lidas', 'publicacoes_etiquetas']) {
    assert.equal((await sql(`SELECT COUNT(*) AS n FROM ${tabela} WHERE publicacao_id = ?`, [x]))[0].n, 0, `${tabela} ficou com registro órfão`);
  }
  const log = (await sql('SELECT usuario_id, quantidade, DATE_FORMAT(data_publicacao, "%Y-%m-%d") AS dia FROM log_publicacoes ORDER BY id DESC LIMIT 1'))[0];
  assert.deepEqual([(await sql('SELECT COUNT(*) AS n FROM log_publicacoes'))[0].n - antesLog, log.usuario_id, log.quantidade, log.dia], [1, 1, 1, '2026-08-01']);
  assert.equal((await del(`/api/publicacoes/${x}`)).status, 404);
  const tratada = await nova({ data: '2026-08-01', tratada: 1 });
  assert.equal((await del(`/api/publicacoes/${tratada}`)).status, 400);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [tratada]))[0].n, 1);
});

test('excluir em lote: por seleção só apaga pendentes da MESMA aba; "todas" apaga exatamente o que a lista mostra; nada de tratadas; sem órfãos e com log', async () => {
  const a1 = await nova({ data: '2026-09-01', texto: 'lote alfa 1' });
  const a2 = await nova({ data: '2026-09-01', texto: 'lote alfa 2' });
  const a3 = await nova({ data: '2026-09-02', texto: 'lote beta 3' });
  const tr = await nova({ data: '2026-09-01', texto: 'lote tratada', tratada: 1 });
  const c1 = await nova({ fonte: 'cnj', data: '2026-09-01', texto: 'lote cnj', id_cnj: 800001 });
  await sql('INSERT INTO publicacao_usuario (publicacao_id, usuario_id) VALUES (?, ?)', [a1, U.recebedor]);
  await sql('INSERT INTO publicacoes_lidas (publicacao_id, usuario_id) VALUES (?, 1)', [a1]);
  assert.equal((await post('/api/publicacoes/excluir-lote', T.recebedor).send({ fonte: 'aasp', ids: [a1] })).status, 403);
  assert.equal((await post('/api/publicacoes/excluir-lote', T.recebedor_excluir).send({ fonte: 'aasp', ids: [a1] })).status, 403);
  assert.equal((await post('/api/publicacoes/excluir-lote').send({ fonte: 'aasp', ids: [] })).status, 400);
  assert.equal((await post('/api/publicacoes/excluir-lote').send({ fonte: 'aasp', ids: ['abc', -1, 0] })).status, 400);
  // seleção: pede a1, a tratada e a do CNJ (que é de outra aba) — só a1 sai
  const sel = await post('/api/publicacoes/excluir-lote').send({ fonte: 'aasp', ids: [a1, tr, c1, 'abc'] });
  assert.equal(sel.status, 200);
  assert.equal(sel.body.dados.excluidas, 1);
  assert.deepEqual((await sql('SELECT id FROM publicacoes WHERE id IN (?, ?, ?, ?, ?) ORDER BY id', [a1, a2, a3, tr, c1])).map(r => r.id), [a2, a3, tr, c1]);
  for (const tabela of ['publicacao_usuario', 'publicacoes_lidas']) assert.equal((await sql(`SELECT COUNT(*) AS n FROM ${tabela} WHERE publicacao_id = ?`, [a1]))[0].n, 0, `${tabela} órfão`);
  // "todas" com o mesmo filtro da lista (dia 2026-09-01 + busca "alfa"): sai o que a lista mostra
  const filtro = { fonte: 'aasp', todas: true, dataInicio: '2026-09-01', dataFim: '2026-09-02', busca: 'lote' };
  const mostrados = ids(await get('/api/publicacoes?dataInicio=2026-09-01&dataFim=2026-09-02&busca=lote&tratada=0')).sort();
  assert.deepEqual(mostrados, [a2, a3].sort());
  const antesLog = (await sql('SELECT COUNT(*) AS n FROM log_publicacoes'))[0].n;
  const todas = await post('/api/publicacoes/excluir-lote').send({ ...filtro, tratada: '0' });
  assert.equal(todas.body.dados.excluidas, 2);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM log_publicacoes'))[0].n - antesLog, 2);   // uma linha de log por dia apagado
  assert.deepEqual((await sql('SELECT id FROM publicacoes WHERE id IN (?, ?, ?, ?, ?) ORDER BY id', [a1, a2, a3, tr, c1])).map(r => r.id), [tr, c1]);   // a tratada e a do CNJ ficam
  const nada = await post('/api/publicacoes/excluir-lote').send({ ...filtro, tratada: '0' });
  assert.equal(nada.body.dados.excluidas, 0);
  // busca que não é texto NUNCA vira "sem filtro" (apagaria mais do que a tela mostra)
  const viva = await nova({ data: '2026-09-05', texto: 'não pode ser apagada' });
  const ruim = await post('/api/publicacoes/excluir-lote').send({ fonte: 'aasp', todas: true, busca: ['a'] });
  assert.equal(ruim.status, 400);
  const longa = await post('/api/publicacoes/excluir-lote').send({ fonte: 'aasp', todas: true, busca: 'x'.repeat(201) });
  assert.equal(longa.status, 400);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [viva]))[0].n, 1);
});

// ============================================================ importar (fontes simuladas)
test('importar AASP: sem integração avisa sem erro; importa e NÃO duplica (processo/dia, com ou sem pontuação); fonte que falha não grava nada', async () => {
  const original = aaspService.buscarIntimacoes;
  const item = (processo, texto, numPub, extra = {}) => ({ textoPublicacao: texto, numeroUnicoProcesso: processo, titulo: 'Tit', cabecalho: 'Cab', numeroPublicacao: numPub, numeroArquivo: 7, jornal: { dataDisponibilizacao_Publicacao: '2026-10-10T00:00:00' }, ...extra });
  try {
    await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'aasp'");
    assert.deepEqual((await get('/api/publicacoes/aasp/status')).body.dados, { configurado: false });
    const sem = await post('/api/publicacoes/importar').send({ data: '2026-10-10' });
    assert.equal(sem.status, 200);
    assert.equal(sem.body.dados.configurado, false);
    await configurarIntegracao('aasp', 1, { chave: 'chave-de-teste', url: 'https://aasp.exemplo.invalid' });
    assert.deepEqual((await get('/api/publicacoes/aasp/status')).body.dados, { configurado: true });
    assert.equal((await post('/api/publicacoes/importar').send({})).status, 400);
    let chamada = null;
    aaspService.buscarIntimacoes = async (chave, data, url) => { chamada = { chave, data, url }; return [
      item('4444444-44.2026.5.15.0044', 'Texto do processo 44', 11),
      item('4444444-44.2026.5.15.0044', 'Texto repetido do processo 44 no mesmo lote', 12),
      item('4444445-44.2026.5.15.0045', '   ', 13),                                    // texto vazio: ignorado
      item(null, 'Sem número de processo, com nº de publicação', 14),
      item(null, 'Outro sem número de processo', 15),
    ]; };
    const r1 = await post('/api/publicacoes/importar').send({ data: '2026-10-10' });
    assert.equal(r1.status, 200);
    assert.deepEqual(chamada, { chave: 'chave-de-teste', data: '2026-10-10', url: 'https://aasp.exemplo.invalid' });
    assert.deepEqual([r1.body.dados.novas, r1.body.dados.recebidas], [3, 5]);
    const gravadas = await sql("SELECT numero_processo, numero_publicacao, fonte, importada_por FROM publicacoes WHERE data_publicacao = '2026-10-10' ORDER BY id");
    assert.equal(gravadas.length, 3);
    assert.ok(gravadas.every(g => g.fonte === 'aasp' && g.importada_por === 1));
    // rodar o mesmo dia de novo não traz nada novo; o mesmo processo SEM pontuação também é barrado
    aaspService.buscarIntimacoes = async () => [item('44444444420265150044', 'Mesmo processo, sem pontuação', 21), item(null, 'Sem número de processo, com nº de publicação', 14)];
    const r2 = await post('/api/publicacoes/importar').send({ data: '2026-10-10' });
    assert.equal(r2.body.dados.novas, 0);
    assert.equal((await sql("SELECT COUNT(*) AS n FROM publicacoes WHERE data_publicacao = '2026-10-10'"))[0].n, 3);
    // um dia diferente com o mesmo processo entra
    aaspService.buscarIntimacoes = async () => [item('4444444-44.2026.5.15.0044', 'Outro dia', 31, { jornal: { dataDisponibilizacao_Publicacao: '2026-10-11T00:00:00' } })];
    assert.equal((await post('/api/publicacoes/importar').send({ data: '2026-10-11' })).body.dados.novas, 1);
    // nada encontrado
    aaspService.buscarIntimacoes = async () => [];
    assert.equal((await post('/api/publicacoes/importar').send({ data: '2026-10-12' })).body.dados.novas, 0);
    // a fonte falhou: aviso claro, nada gravado
    const antes = (await sql('SELECT COUNT(*) AS n FROM publicacoes'))[0].n;
    aaspService.buscarIntimacoes = async () => { throw new Error('A AASP não respondeu'); };
    const falha = await post('/api/publicacoes/importar').send({ data: '2026-10-13' });
    assert.equal(falha.status, 400);
    assert.match(falha.body.mensagem, /AASP não respondeu/);
    assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes'))[0].n, antes);
    // só quem pode BAIXAR (cadastrar) importa
    assert.equal((await post('/api/publicacoes/importar', T.recebedor).send({ data: '2026-10-10' })).status, 403);
    aaspService.buscarIntimacoes = async () => [];
    assert.equal((await post('/api/publicacoes/importar', T.buscador).send({ data: '2026-10-14' })).status, 200);
  } finally { aaspService.buscarIntimacoes = original; }
});

test('importar CNJ: confere o período (até 3 meses); sem integração avisa; não duplica pelo id do CNJ, mesmo vindo por duas OABs; fonte que falha não grava nada', async () => {
  const original = cnjService.buscarComunicacoes;
  const com = (id, texto, extra = {}) => ({ id, texto, siglaTribunal: 'TRT15', numeroprocessocommascara: '3333333-33.2026.5.15.0033', tipoComunicacao: 'Intimação', nomeOrgao: '1ª Vara', numeroComunicacao: 5, hash: 'h' + id, data_disponibilizacao: '2026-11-03', ...extra });
  try {
    await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'cnj'");
    assert.deepEqual((await get('/api/publicacoes/cnj/status')).body.dados, { configurado: false, qtdOabs: 0 });
    const periodo = { dataInicio: '2026-11-01', dataFim: '2026-11-30' };
    assert.equal((await post('/api/publicacoes/cnj/importar').send({ dataInicio: '2026-11-01' })).status, 400);
    assert.equal((await post('/api/publicacoes/cnj/importar').send({ dataInicio: '2026-11-30', dataFim: '2026-11-01' })).status, 400);
    assert.equal((await post('/api/publicacoes/cnj/importar').send({ dataInicio: '2026-01-01', dataFim: '2026-05-01' })).status, 400);
    const sem = await post('/api/publicacoes/cnj/importar').send(periodo);
    assert.equal(sem.body.dados.configurado, false);
    await configurarIntegracao('cnj', 1, { url: 'https://cnj.exemplo.invalid', oabs: [{ numero: '123', uf: 'sp' }, { numero: '456', uf: 'RJ' }, { numero: '', uf: 'MG' }] });
    assert.deepEqual((await get('/api/publicacoes/cnj/status')).body.dados, { configurado: true, qtdOabs: 2 });
    const chamadas = [];
    cnjService.buscarComunicacoes = async (arg) => { chamadas.push(arg); return arg.numeroOab === '123'
      ? [com(900001, 'Comunicação 1'), com(900002, 'Comunicação 2')]
      : [com(900002, 'Comunicação 2'), com(900003, 'Comunicação 3'), com(900004, '  ')]; };      // a 900002 volta pela 2ª OAB; a 900004 não tem texto
    const r1 = await post('/api/publicacoes/cnj/importar').send(periodo);
    assert.equal(r1.status, 200);
    assert.deepEqual(chamadas.map(c => [c.numeroOab, c.ufOab, c.dataInicio, c.dataFim]), [['123', 'SP', '2026-11-01', '2026-11-30'], ['456', 'RJ', '2026-11-01', '2026-11-30']]);   // a OAB sem número é ignorada; UF vai em maiúsculas
    assert.deepEqual([r1.body.dados.novas, r1.body.dados.recebidas], [3, 5]);
    const g = await sql("SELECT id_cnj, oab, tribunal, fonte FROM publicacoes WHERE fonte = 'cnj' AND id_cnj BETWEEN 900001 AND 900004 ORDER BY id_cnj");
    assert.deepEqual(g.map(x => [x.id_cnj, x.oab]), [[900001, '123/SP'], [900002, '123/SP'], [900003, '456/RJ']]);   // fica com a OAB que trouxe primeiro
    const r2 = await post('/api/publicacoes/cnj/importar').send(periodo);
    assert.equal(r2.body.dados.novas, 0);
    assert.equal((await sql("SELECT COUNT(*) AS n FROM publicacoes WHERE fonte = 'cnj' AND id_cnj BETWEEN 900001 AND 900004"))[0].n, 3);
    // o mesmo texto/processo na AASP não conta como repetido do CNJ (fontes independentes)
    assert.equal((await sql("SELECT COUNT(*) AS n FROM publicacoes WHERE fonte = 'aasp' AND id_cnj IS NOT NULL"))[0].n, 0);
    const antes = (await sql('SELECT COUNT(*) AS n FROM publicacoes'))[0].n;
    cnjService.buscarComunicacoes = async () => { throw new Error('O CNJ não respondeu'); };
    const falha = await post('/api/publicacoes/cnj/importar').send(periodo);
    assert.equal(falha.status, 400);
    assert.match(falha.body.mensagem, /CNJ não respondeu/);
    assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes'))[0].n, antes);
    assert.equal((await post('/api/publicacoes/cnj/importar', T.recebedor).send(periodo)).status, 403);
  } finally { cnjService.buscarComunicacoes = original; }
});

// ============================================================ e-mail
test('enviar por e-mail: só quem pode agir; manda a publicação inteira, escapa HTML, registra cada envio e informa as falhas', async () => {
  const x = await nova({ data: '2026-12-01', numero_processo: '2222222-22.2026.5.15.0022', texto: 'Intimação <script>alert(1)</script> & prazo de 5 dias', tribunal: 'TRT15' });
  const y = await nova({ data: '2026-12-01', texto: 'outra' });
  await sql("INSERT INTO advogados_freela (nome, email) VALUES ('Freela Com Email', 'freela@example.invalid'), ('Freela Sem Email', NULL)");
  const fr = await sql("SELECT id, nome FROM advogados_freela WHERE nome IN ('Freela Com Email', 'Freela Sem Email')");
  const idFr = Object.fromEntries(fr.map(f => [f.nome, f.id]));
  await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor] });
  const corpo = { destinatarios: [{ tipo: 'usuario', id: 1 }, { tipo: 'freela', id: idFr['Freela Com Email'] }, { tipo: 'freela', id: idFr['Freela Sem Email'] },
    { tipo: 'outro', email: 'avulso@example.invalid' }, { tipo: 'outro', email: 'isto-nao-e-email' }, { tipo: 'usuario', id: 999999 }], mensagem: 'Olá, <b>veja</b>\n\n\n\n\n\nObrigado' };
  assert.equal((await post(`/api/publicacoes/${y}/enviar-email`, T.recebedor).send(corpo)).status, 403);          // não é dele
  assert.equal((await post(`/api/publicacoes/${x}/enviar-email`).send({ destinatarios: [] })).status, 400);
  assert.equal((await post('/api/publicacoes/999999/enviar-email').send(corpo)).status, 404);
  const antesMsgs = smtp.registro.mensagens.length;
  const r = await post(`/api/publicacoes/${x}/enviar-email`, T.recebedor).send(corpo);                         // o recebedor atribuído pode
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.enviados, 3);                                                                        // usuário 1 + freela com e-mail + avulso
  assert.deepEqual(r.body.dados.falhas.map(f => f.motivo).sort(), ['e-mail inválido', 'não encontrado', 'sem e-mail']);
  const msgs = smtp.registro.mensagens.slice(antesMsgs);
  assert.deepEqual(msgs.map(m => m.para[0]).sort(), ['admteste@example.invalid', 'avulso@example.invalid', 'freela@example.invalid']);
  const dados = msgs[0].dados.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));   // desfaz a codificação do e-mail
  assert.ok(!/<script>alert/.test(dados), 'o texto da publicação não pode entrar como HTML');
  assert.match(dados, /2222222-22\.2026\.5\.15\.0022/);
  const logs = await sql('SELECT para, status, publicacao_id FROM log_emails WHERE publicacao_id = ? ORDER BY id', [x]);
  assert.deepEqual(logs.map(l => l.status), ['sucesso', 'sucesso', 'sucesso']);
  const hist = (await get(`/api/publicacoes/${x}/historico`)).body.dados;
  assert.equal(hist.emails.length, 3);
  assert.ok(!/\n{5,}/.test(hist.emails[0].mensagem), 'no máximo 3 linhas em branco seguidas');
  const nenhum = await post(`/api/publicacoes/${x}/enviar-email`).send({ destinatarios: [{ tipo: 'outro', email: 'isto-nao-e-email' }] });
  assert.equal(nenhum.status, 400);
  const lista = (await get('/api/publicacoes/destinatarios-email')).body.dados;
  assert.ok(lista.usuarios.some(u => u.id === 1) && lista.freelancers.some(f => f.nome === 'Freela Com Email'));
  assert.ok(lista.usuarios.every(u => u.id !== 0));
  const dir = (await get('/api/publicacoes/usuarios')).body.dados;
  assert.ok(dir.length >= 4 && dir.every(u => u.id && u.nome));
});

// ============================================================ IA (modo simulação do próprio sistema)
test('IA: sem configuração fica desligada; no modo simulação devolve sugestão só de quem pode ver a publicação; nunca dá erro', async () => {
  const x = await nova({ data: '2026-12-05', texto: 'Intime-se para manifestação em 5 dias.' });
  const y = await nova({ data: '2026-12-05', texto: 'outra' });
  await put(`/api/publicacoes/${x}/atribuir`).send({ usuario_ids: [U.recebedor] });
  await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'ia'");
  iaService.limparCacheIa();
  assert.deepEqual((await get('/api/publicacoes/ia-status')).body.dados.habilitada, false);
  const desligada = await post(`/api/publicacoes/${x}/sugestoes-ia`);
  assert.equal(desligada.status, 200);
  assert.deepEqual(desligada.body.dados.sugestoes, []);
  await configurarIntegracao('ia', 1, { provedor: 'mock' });
  iaService.limparCacheIa();
  try {
    const st = (await get('/api/publicacoes/ia-status')).body.dados;
    assert.deepEqual([st.habilitada, st.provedor], [true, 'mock']);
    const ok = await post(`/api/publicacoes/${x}/sugestoes-ia`, T.recebedor);
    assert.equal(ok.status, 200);
    assert.match(ok.body.dados.sugestoes[0].titulo, /SIMULACAO IA/);
    const alheia = await post(`/api/publicacoes/${y}/sugestoes-ia`, T.recebedor);                // não é dele: não manda o texto para a IA
    assert.equal(alheia.status, 200);
    assert.deepEqual([alheia.body.dados.sugestoes, alheia.body.dados.ia], [[], false]);
    const inexistente = await post('/api/publicacoes/999999/sugestoes-ia');
    assert.equal(inexistente.status, 200);
    assert.deepEqual(inexistente.body.dados.sugestoes, []);
  } finally { await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'ia'"); iaService.limparCacheIa(); }
});

// ============================================================ permissões e entradas ruins
test('permissões: sem login = 401; sem permissão = 403 em todas as rotas de Publicações; quem só visualiza não importa, não atribui e não exclui', async () => {
  const x = await nova({ data: '2026-12-10' });
  const gets = ['/api/publicacoes', `/api/publicacoes/${x}`, `/api/publicacoes/${x}/historico`, '/api/publicacoes/aasp/status', '/api/publicacoes/cnj/status',
    '/api/publicacoes/usuarios', '/api/publicacoes/ia-status', '/api/publicacoes/destinatarios-email'];
  for (const rota of gets) {
    assert.equal((await get(rota, T.semPermissao)).status, 403, `GET ${rota}`);
    assert.equal((await request(app).get(rota)).status, 401, `GET ${rota} sem login`);
  }
  assert.equal((await get(`/api/publicacoes/${x}/atribuicoes`, T.recebedor)).status, 403);                    // atribuições: só buscador
  for (const [metodo, rota] of [['post', '/api/publicacoes/importar'], ['post', '/api/publicacoes/cnj/importar'], ['put', `/api/publicacoes/${x}/atribuir`],
    ['post', '/api/publicacoes/excluir-lote'], ['delete', `/api/publicacoes/${x}`]]) {
    const r = await request(app)[metodo](rota).set('Authorization', `Bearer ${T.recebedor}`).send({ data: '2026-12-10', dataInicio: '2026-12-01', dataFim: '2026-12-10', ids: [x], usuario_ids: [] });
    assert.equal(r.status, 403, `${metodo.toUpperCase()} ${rota}`);
  }
  assert.equal((await sql('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [x]))[0].n, 1);
});

test('id que não é número, ou que não existe, nunca dá "Erro interno" (500) em nenhuma rota com id', async () => {
  const rotas = [['get', '/api/publicacoes/abc'], ['get', '/api/publicacoes/abc/historico'], ['get', '/api/publicacoes/abc/atribuicoes'], ['post', '/api/publicacoes/abc/marcar-lida'],
    ['put', '/api/publicacoes/abc/atribuir'], ['put', '/api/publicacoes/abc/tratar'], ['delete', '/api/publicacoes/abc'], ['post', '/api/publicacoes/abc/enviar-email'], ['post', '/api/publicacoes/abc/sugestoes-ia'],
    ['get', '/api/publicacoes/99999999999999999999'], ['post', '/api/publicacoes/-1/marcar-lida'], ['put', '/api/publicacoes/1e3/tratar']];
  for (const [metodo, rota] of rotas) {
    const r = await request(app)[metodo](rota).set('Authorization', `Bearer ${T.admin}`).send({ tratada: false, usuario_ids: [], destinatarios: [{ tipo: 'usuario', id: 1 }] });
    assert.ok(r.status < 500, `${metodo.toUpperCase()} ${rota} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  }
});
