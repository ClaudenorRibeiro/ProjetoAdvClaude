// Plano de testes de Processos — passo C6 (ver PLANO-TESTES-PROCESSOS.md): o servidor das AUDIÊNCIAS usadas na aba Audiências da pasta.
// Contra MySQL real isolado: listar (filtros, limite), criar, editar, cancelar, remarcar, excluir, histórico, entradas inválidas,
// permissões e auditoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin;
const F = {};
const emitir = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = (token = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${token}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${token}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${token}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${token}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const hist = (id) => sql('SELECT campo_alterado, valor_anterior, valor_novo FROM auditoria_audiencia WHERE audiencia_id = ? ORDER BY id', [id]);

let seq = 100;
async function criarUsuario(rotulo, nivel, permissoes) {
  seq += 1;
  const id = (await sql(
    `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (?, ?, 'x', ?, 'advogado', ?, 1, 0, ?, 0, 0)`,
    [`Usuário ${rotulo}`, `u${seq}`, `u${seq}@example.invalid`, nivel, `sessao-${seq}`])).insertId;
  for (const [m, s, a] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return { id, token: emitir(id, nivel, `sessao-${seq}`) };
}

function juntar() {
  const falhas = [];
  return { checar: (ok, texto) => { if (!ok) falhas.push(texto); }, fim: () => assert.equal(falhas.length, 0, `\n${falhas.join('\n')}`) };
}
// dias úteis de verdade (segunda a sexta) bem no futuro, para não esbarrar em "data passada" nem em fim de semana
const util = (n) => { const d = new Date('2099-03-02T12:00:00Z'); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) k++; } return d.toISOString().slice(0, 10); };
const corpo = (extra = {}) => ({ processo_id: F.proc, tipo_audiencia_id: 1, data: util(1), hora: '10:00', modalidade: 'presencial', responsaveis: [], testemunhas: [], ...extra });
async function nova(extra = {}, token = admin) {
  const r = await api(token).post('/api/audiencias').send(corpo(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const aud = (id) => um("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM audiencia WHERE id = ?", [id]);
const nAud = () => total('SELECT COUNT(*) AS n FROM audiencia');

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  await sql('DELETE FROM audiencia');
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6201, 1)')).insertId;
  const proc = async (num, ativo = 1) => (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'PROCESSO DE AUDIENCIAS', 1, 1, ?, 1)", [pasta, num, ativo])).insertId;
  F.proc = await proc('0000021-00.2026.5.15.0001');
  F.outro = await proc('0000022-00.2026.5.15.0001');
  F.inativo = await proc('0000023-00.2026.5.15.0001', 0);
});
test.after(async () => pool.end());

test('criar: grava os campos, tira espaços das pontas da observação, só guarda plataforma/link se for virtual, só guarda vara se for presencial/virtual, registra "cadastrado" no histórico', async () => {
  const t = juntar();
  const p = await nova({ observacoes: '  Levar documentos  ', plataforma_virtual: 'Zoom', link_virtual: 'https://x.test/a' });
  const a = await aud(p);
  t.checar(a.processo_id === F.proc && a.tipo_audiencia_id === 1 && a.dia === util(1) && a.hm === '10:00' && a.modalidade === 'presencial' && a.status === 'agendada' && a.observacoes === 'Levar documentos', `presencial: ${JSON.stringify(a)}`);
  t.checar(a.plataforma_virtual === null && a.link_virtual === null, 'presencial guardou plataforma/link');
  const v = await aud(await nova({ hora: '11:00', modalidade: 'virtual', plataforma_virtual: 'Zoom', link_virtual: 'https://x.test/a' }));
  t.checar(v.plataforma_virtual === 'Zoom' && v.link_virtual === 'https://x.test/a', `virtual: ${JSON.stringify(v)}`);
  const h = await hist(p);
  t.checar(h.length === 1 && h[0].campo_alterado === 'cadastrado', `histórico da criação: ${JSON.stringify(h)}`);
  t.fim();
});

test('criar: dados obrigatórios e de verdade — processo, tipo, data, hora, modalidade, textos, vínculos — nada gravado e nunca erro interno', async () => {
  const t = juntar();
  const antes = await nAud();
  const casos = [
    ['sem processo', { processo_id: undefined }], ['processo texto', { processo_id: 'abc' }], ['processo negativo', { processo_id: -1 }],
    ['processo inexistente', { processo_id: 999999 }], ['processo excluído (inativo)', { processo_id: F.inativo }],
    ['sem tipo', { tipo_audiencia_id: undefined }], ['tipo texto', { tipo_audiencia_id: 'abc' }], ['tipo inexistente', { tipo_audiencia_id: 999999 }],
    ['sem data', { data: undefined }], ['data 2099-02-30', { data: '2099-02-30' }], ['data texto', { data: 'amanhã' }], ['data número', { data: 20990301 }], ['data lista', { data: ['2099-03-02'] }],
    ['sem hora', { hora: undefined }], ['hora 25:00', { hora: '25:00' }], ['hora texto', { hora: 'dez' }], ['hora número', { hora: 10 }], ['hora 10:75', { hora: '10:75' }],
    ['modalidade inventada', { modalidade: 'holograma' }],
    ['observação número', { observacoes: 123 }], ['observação lista', { observacoes: ['x'] }], ['observação objeto', { observacoes: { a: 1 } }],
    ['plataforma com 101 letras', { modalidade: 'virtual', plataforma_virtual: 'p'.repeat(101) }], ['plataforma número', { modalidade: 'virtual', plataforma_virtual: 5 }],
    ['link com 501 letras', { modalidade: 'virtual', link_virtual: 'l'.repeat(501) }], ['link lista', { modalidade: 'virtual', link_virtual: ['x'] }],
    ['testemunhas não é lista', { testemunhas: 'abc' }], ['testemunhas objeto', { testemunhas: { a: 1 } }],
    ['vara inexistente', { vara_id: 999999 }], ['vara texto', { vara_id: 'abc' }],
    ['responsável inexistente', { responsaveis: ['usuario:999999'] }], ['responsável sem formato', { responsaveis: ['abc'] }], ['responsáveis não é lista', { responsaveis: 'usuario:1' }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().post('/api/audiencias').send(corpo({ hora: '09:30', ...extra }));
    t.checar([400, 404, 409, 422].includes(r.status), `${rotulo} → ${r.status} ${msg(r)} (esperado 400/404/409/422)`);
  }
  t.checar(await nAud() === antes, `foram gravadas ${await nAud() - antes} audiência(s) inválida(s)`);
  t.fim();
});

test('criar: dois eventos ativos no mesmo processo, dia e hora = 409; cancelado libera o horário', async () => {
  const t = juntar();
  const a = await nova({ data: util(2), hora: '14:00' });
  const dup = await api().post('/api/audiencias').send(corpo({ data: util(2), hora: '14:00' }));
  t.checar(dup.status === 409, `duplicada → ${dup.status}`);
  const outroProc = await api().post('/api/audiencias').send(corpo({ processo_id: F.outro, data: util(2), hora: '14:00' }));
  t.checar(outroProc.status === 201, `mesmo horário em outro processo → ${outroProc.status}`);
  await api().put(`/api/audiencias/${a}/cancelar`).send({ motivo: 'Teste' });
  const livre = await api().post('/api/audiencias').send(corpo({ data: util(2), hora: '14:00' }));
  t.checar(livre.status === 201, `horário de audiência cancelada → ${livre.status}`);
  t.fim();
});

test('editar: altera, grava o histórico campo a campo (sem registrar mudança que não houve, nem por espaços na observação), 404 se não existe, id texto = 404, recusa entradas inválidas', async () => {
  const t = juntar();
  const id = await nova({ data: util(3), hora: '09:00', observacoes: 'Original' });
  const base = { tipo_audiencia_id: 1, data: util(3), hora: '09:00', modalidade: 'presencial', observacoes: 'Original', responsaveis: [], testemunhas: [] };
  const semMudar = await api().put(`/api/audiencias/${id}`).send({ ...base, observacoes: '  Original  ' });
  t.checar(semMudar.status === 200, `salvar sem mudar → ${semMudar.status} ${msg(semMudar)}`);
  t.checar((await hist(id)).length === 1, `salvar sem mudar criou histórico: ${JSON.stringify(await hist(id))}`);
  const r = await api().put(`/api/audiencias/${id}`).send({ ...base, tipo_audiencia_id: 2, data: util(4), hora: '15:30', modalidade: 'virtual', plataforma_virtual: 'Teams', link_virtual: 'https://t.test', observacoes: ' Nova obs ' });
  t.checar(r.status === 200, `editar → ${r.status} ${msg(r)}`);
  const a = await aud(id);
  t.checar(a.tipo_audiencia_id === 2 && a.dia === util(4) && a.hm === '15:30' && a.modalidade === 'virtual' && a.plataforma_virtual === 'Teams' && a.observacoes === 'Nova obs', `campos: ${JSON.stringify(a)}`);
  const campos = (await hist(id)).map(x => x.campo_alterado).sort();
  t.checar(JSON.stringify(campos) === JSON.stringify(['cadastrado', 'data', 'hora', 'link_virtual', 'modalidade', 'observacoes', 'plataforma_virtual', 'tipo_audiencia_id']), `histórico: ${JSON.stringify(campos)}`);
  const fantasma = await api().put('/api/audiencias/999999').send(base);
  t.checar(fantasma.status === 404, `inexistente → ${fantasma.status}`);
  const txt = await api().put('/api/audiencias/abc').send(base);
  t.checar([400, 404].includes(txt.status), `id texto → ${txt.status}`);
  for (const [rotulo, extra] of [['data impossível', { data: '2099-02-30' }], ['hora 25:00', { hora: '25:00' }], ['modalidade inventada', { modalidade: 'x' }], ['tipo inexistente', { tipo_audiencia_id: 999999 }], ['observação número', { observacoes: 5 }], ['link 501', { modalidade: 'virtual', link_virtual: 'l'.repeat(501) }], ['testemunhas texto', { testemunhas: 'a' }]]) {
    const e = await api().put(`/api/audiencias/${id}`).send({ ...base, data: util(4), hora: '15:30', ...extra });
    t.checar([400, 404, 409, 422].includes(e.status), `editar com ${rotulo} → ${e.status} (esperado 400/404/409/422)`);
  }
  t.checar((await aud(id)).hm === '15:30', 'edição inválida alterou a audiência');
  t.fim();
});

test('editar: audiência cancelada, remarcada, realizada ou com acordo não pode ser editada; para outro horário já ocupado = 409', async () => {
  const t = juntar();
  const c = await nova({ data: util(5), hora: '09:00' });
  await api().put(`/api/audiencias/${c}/cancelar`).send({ motivo: 'x' });
  const e1 = await api().put(`/api/audiencias/${c}`).send({ ...corpo({ data: util(5), hora: '09:00' }) });
  t.checar(e1.status === 400, `cancelada → ${e1.status}`);
  const r = await nova({ data: util(6), hora: '09:00' });
  await sql("UPDATE audiencia SET status = 'realizada' WHERE id = ?", [r]);
  t.checar((await api().put(`/api/audiencias/${r}`).send(corpo({ data: util(6), hora: '09:00' }))).status === 400, 'realizada foi editada');
  const x = await nova({ data: util(7), hora: '09:00' });
  const y = await nova({ data: util(7), hora: '10:00' });
  t.checar((await api().put(`/api/audiencias/${y}`).send(corpo({ data: util(7), hora: '09:00' }))).status === 409, 'mover para horário ocupado não deu 409');
  t.fim();
});

test('cancelar: motivo obrigatório e de verdade (vazio, espaços, número, lista, mais de 300) — nada muda; cancela, guarda motivo e histórico; já cancelada / inexistente / id texto recusados', async () => {
  const t = juntar();
  const id = await nova({ data: util(8), hora: '09:00' });
  for (const motivo of [undefined, null, '', '   ', 5, ['a'], { a: 1 }, 'm'.repeat(301)]) {
    const r = await api().put(`/api/audiencias/${id}/cancelar`).send({ motivo });
    t.checar(r.status === 400, `motivo=${JSON.stringify(motivo)?.slice(0, 20)} → ${r.status} (esperado 400)`);
  }
  t.checar((await aud(id)).status === 'agendada', 'motivo inválido cancelou');
  const ok = await api().put(`/api/audiencias/${id}/cancelar`).send({ motivo: '  Parte doente  ' });
  t.checar(ok.status === 200, `cancelar → ${ok.status} ${msg(ok)}`);
  const a = await aud(id);
  t.checar(a.status === 'cancelada' && a.motivo_status === 'Parte doente', `estado: ${a.status} / ${a.motivo_status}`);
  t.checar((await hist(id)).some(x => x.campo_alterado === 'status' && x.valor_novo === 'cancelada'), 'sem histórico do cancelamento');
  t.checar((await api().put(`/api/audiencias/${id}/cancelar`).send({ motivo: 'de novo' })).status === 400, 'cancelou duas vezes');
  t.checar((await api().put('/api/audiencias/999999/cancelar').send({ motivo: 'x' })).status === 404, 'inexistente');
  t.checar([400, 404].includes((await api().put('/api/audiencias/abc/cancelar').send({ motivo: 'x' })).status), 'id texto');
  t.fim();
});

test('remarcar: cria a nova, marca a antiga como remarcada com o motivo, histórico nas duas; motivo inválido ou nova inválida não muda nada (a antiga continua agendada)', async () => {
  const t = juntar();
  const id = await nova({ data: util(9), hora: '09:00' });
  const antes = await nAud();
  for (const motivo of [undefined, '', '   ', 5, ['a'], 'm'.repeat(301)]) {
    const r = await api().put(`/api/audiencias/${id}/remarcar`).send(corpo({ data: util(10), hora: '09:00', motivo }));
    t.checar(r.status === 400, `motivo=${JSON.stringify(motivo)?.slice(0, 20)} → ${r.status} (esperado 400)`);
  }
  for (const [rotulo, extra] of [['data impossível', { data: '2099-02-30' }], ['hora 25:00', { hora: '25:00' }], ['processo inexistente', { processo_id: 999999 }], ['tipo inexistente', { tipo_audiencia_id: 999999 }]]) {
    const r = await api().put(`/api/audiencias/${id}/remarcar`).send(corpo({ data: util(10), hora: '09:00', motivo: 'ok', ...extra }));
    t.checar([400, 404, 409, 422].includes(r.status), `remarcar com ${rotulo} → ${r.status} (esperado 400/404/409/422)`);
  }
  t.checar(await nAud() === antes && (await aud(id)).status === 'agendada', 'remarcação inválida mudou algo');
  const ok = await api().put(`/api/audiencias/${id}/remarcar`).send(corpo({ data: util(10), hora: '11:00', motivo: ' Pedido da parte ' }));
  t.checar(ok.status === 200, `remarcar → ${ok.status} ${msg(ok)}`);
  const velha = await aud(id); const nova1 = await aud(ok.body.dados.id);
  t.checar(velha.status === 'remarcada' && velha.motivo_status === 'Pedido da parte', `antiga: ${velha.status}/${velha.motivo_status}`);
  t.checar(nova1.status === 'agendada' && nova1.dia === util(10) && nova1.hm === '11:00' && nova1.processo_id === F.proc, `nova: ${JSON.stringify(nova1)}`);
  t.checar((await hist(id)).some(x => x.campo_alterado === 'status' && x.valor_novo === 'remarcada'), 'sem histórico na antiga');
  t.checar((await hist(nova1.id)).some(x => x.campo_alterado === 'cadastrado'), 'sem histórico na nova');
  t.checar((await api().put(`/api/audiencias/${id}/remarcar`).send(corpo({ data: util(12), hora: '09:00', motivo: 'x' }))).status === 400, 'remarcou uma já remarcada');
  t.checar((await api().put('/api/audiencias/999999/remarcar').send(corpo({ motivo: 'x' }))).status === 404, 'inexistente');
  t.fim();
});

test('excluir: agendada some com o histórico; cancelada/remarcada só administrador e sem ata/testemunha; inexistente e id texto = 404; 403 sem a permissão', async () => {
  const t = juntar();
  const comum = await criarUsuario('comum', 3, [['audiencias', null, 'visualizar'], ['audiencias', null, 'excluir'], ['audiencias', null, 'alterar']]);
  const a = await nova({ data: util(13), hora: '09:00' });
  t.checar((await api().delete(`/api/audiencias/${a}`).send()).status === 200, 'excluir agendada');
  t.checar(await total('SELECT COUNT(*) AS n FROM audiencia WHERE id = ?', [a]) === 0 && (await hist(a)).length === 0, 'sobrou audiência ou histórico');
  const c = await nova({ data: util(13), hora: '10:00' });
  await api().put(`/api/audiencias/${c}/cancelar`).send({ motivo: 'x' });
  const rc = await api(comum.token).delete(`/api/audiencias/${c}`).send(); t.checar([400, 403].includes(rc.status), `comum excluiu cancelada → ${rc.status} ${msg(rc)}`);
  t.checar((await api().delete(`/api/audiencias/${c}`).send()).status === 200, 'admin não excluiu cancelada');
  t.checar((await api().delete('/api/audiencias/999999').send()).status === 404, 'inexistente');
  t.checar([400, 404].includes((await api().delete('/api/audiencias/abc').send()).status), 'id texto');
  t.fim();
});

test('histórico e detalhe: ordem cronológica, nome de quem fez; audiência inexistente ou id texto = 404 (não "lista vazia")', async () => {
  const t = juntar();
  const id = await nova({ data: util(14), hora: '09:00' });
  await api().put(`/api/audiencias/${id}`).send({ tipo_audiencia_id: 1, data: util(14), hora: '09:30', modalidade: 'presencial', responsaveis: [], testemunhas: [] });
  const r = await api().get(`/api/audiencias/${id}/historico`);
  t.checar(r.status === 200 && r.body.dados.map(x => x.campo_alterado).join() === 'cadastrado,hora', `histórico: ${JSON.stringify(r.body.dados?.map(x => x.campo_alterado))}`);
  t.checar(r.body.dados.every(x => x.usuario_nome), 'faltou o nome de quem fez');
  t.checar((await api().get('/api/audiencias/999999/historico')).status === 404, 'histórico de inexistente');
  t.checar((await api().get('/api/audiencias/999999')).status === 404, 'detalhe de inexistente');
  t.checar([400, 404].includes((await api().get('/api/audiencias/abc')).status), 'detalhe com id texto');
  t.checar([400, 404].includes((await api().get('/api/audiencias/abc/historico')).status), 'histórico com id texto');
  t.fim();
});

test('listar: filtros (processo, status, datas), total, página negativa/lixo sem erro interno, e mais de 100 audiências do mesmo processo vêm em páginas completas', async () => {
  const t = juntar();
  await sql('DELETE FROM audiencia');
  const ids = [await nova({ data: util(20), hora: '09:00' }), await nova({ data: util(21), hora: '09:00' }), await nova({ processo_id: F.outro, data: util(22), hora: '09:00' })];
  await api().put(`/api/audiencias/${ids[1]}/cancelar`).send({ motivo: 'x' });
  const lista = async (q) => (await api().get(`/api/audiencias?${q}`)).body.dados;
  t.checar((await lista(`processo_id=${F.proc}`)).registros.length === 2, 'por processo');
  t.checar((await lista(`processo_id=${F.proc}&status=agendada`)).registros.length === 1, 'por status');
  t.checar((await lista(`data_de=${util(21)}&data_ate=${util(21)}`)).registros.length === 1, 'por intervalo');
  t.checar((await lista('')).total === 3, 'total');
  t.checar((await api().get('/api/audiencias?pagina=-5')).status === 200, 'página negativa');
  t.checar((await api().get('/api/audiencias?pagina=abc&limite=xyz')).status === 200, 'página/limite lixo');
  await sql('DELETE FROM audiencia');
  const valores = Array.from({ length: 130 }, (_, i) => `(${F.proc}, 1, '2099-06-${String(1 + (i % 28)).padStart(2, '0')}', '${String(8 + Math.floor(i / 28)).padStart(2, '0')}:00:00', 'presencial', 1)`).join(',');
  await sql(`INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, criado_por) VALUES ${valores}`);
  const p1 = await lista(`processo_id=${F.proc}&limite=100`);
  t.checar(p1.registros.length === 100 && p1.total === 130, `pág.1 = ${p1.registros.length} de ${p1.total}`);
  const p2 = await lista(`processo_id=${F.proc}&limite=100&pagina=2`);
  t.checar(p2.registros.length === 30, `pág.2 = ${p2.registros.length}`);
  await sql('DELETE FROM audiencia');
  t.fim();
});

test('permissões: sem visualizar/cadastrar/alterar/excluir = 403 em cada ação e nada muda', async () => {
  const t = juntar();
  const id = await nova({ data: util(25), hora: '09:00' });
  const nada = await criarUsuario('nada', 3, []);
  const ver = await criarUsuario('ver', 3, [['audiencias', null, 'visualizar']]);
  t.checar((await api(nada.token).get('/api/audiencias')).status === 403, 'listar sem permissão');
  t.checar((await api(ver.token).get('/api/audiencias')).status === 200, 'listar com permissão');
  t.checar((await api(ver.token).get(`/api/audiencias/${id}/historico`)).status === 200, 'histórico com visualizar');
  t.checar((await api(ver.token).post('/api/audiencias').send(corpo({ hora: '16:00' }))).status === 403, 'criar sem cadastrar');
  t.checar((await api(ver.token).put(`/api/audiencias/${id}`).send(corpo({ data: util(25), hora: '09:00' }))).status === 403, 'editar sem alterar');
  t.checar((await api(ver.token).put(`/api/audiencias/${id}/cancelar`).send({ motivo: 'x' })).status === 403, 'cancelar sem alterar');
  t.checar((await api(ver.token).put(`/api/audiencias/${id}/remarcar`).send(corpo({ data: util(26), motivo: 'x' }))).status === 403, 'remarcar sem alterar');
  t.checar((await api(ver.token).delete(`/api/audiencias/${id}`).send()).status === 403, 'excluir sem excluir');
  t.checar((await aud(id)).status === 'agendada', 'algo mudou sem permissão');
  t.fim();
});
