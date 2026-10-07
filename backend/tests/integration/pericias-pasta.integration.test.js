// Plano de testes de Processos — passo C7 (ver PLANO-TESTES-PROCESSOS.md): o servidor das PERÍCIAS usadas na aba Perícias da pasta.
// Contra MySQL real isolado: listar (filtros, limite), criar (incl. "já existe agendada"), editar, realizada, cancelar, remarcar,
// marcar como remarcada, excluir, histórico, entradas inválidas, permissões e auditoria.
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
const hist = (id) => sql('SELECT campo_alterado, valor_anterior, valor_novo FROM auditoria_pericia WHERE pericia_id = ? ORDER BY id', [id]);

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
const util = (n) => { const d = new Date('2099-03-02T12:00:00Z'); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) k++; } return d.toISOString().slice(0, 10); };
const corpo = (extra = {}) => ({ processo_id: F.proc, tipo_pericia_id: F.tipoA, data: util(1), hora: '10:00', local: 'IML Central', ...extra });
async function nova(extra = {}, token = admin) {
  const r = await api(token).post('/api/pericias').send(corpo({ confirmar_nova: true, ...extra }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
const per = (id) => um("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM pericia WHERE id = ?", [id]);
const nPer = () => total('SELECT COUNT(*) AS n FROM pericia');

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (6301, 1)')).insertId;
  const proc = async (num, ativo = 1) => (await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'PROCESSO DE PERICIAS', 1, 1, ?, 1)", [pasta, num, ativo])).insertId;
  F.proc = await proc('0000031-00.2026.5.15.0001');
  F.outro = await proc('0000032-00.2026.5.15.0001');
  F.inativo = await proc('0000033-00.2026.5.15.0001', 0);
  F.tipoA = (await sql("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Médica C7', 1)")).insertId;
  F.tipoB = (await sql("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Engenharia C7', 1)")).insertId;
  F.perito = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Perito C7', '11144477735')")).insertId;
});
test.after(async () => pool.end());

test('criar: grava os campos (local aparado, perito, responsável, hora), registra "cadastrado" no histórico; sem hora vale (hora é opcional)', async () => {
  const t = juntar();
  const id = await nova({ local: '  IML Central  ', perito_id: F.perito, responsavel_id: 'usuario:1', cep: '13000-000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Campinas', estado: 'SP' });
  const p = await per(id);
  t.checar(p.processo_id === F.proc && p.tipo_pericia_id === F.tipoA && p.dia === util(1) && p.hm === '10:00' && p.local === 'IML Central' && p.status === 'agendada' && p.perito_id === F.perito && p.perito_tipo === 'fisica' && p.responsavel_id === 1 && p.cidade === 'Campinas' && p.criado_por === 1, `campos: ${JSON.stringify(p)}`);
  const h = await hist(id);
  t.checar(h.length === 1 && h[0].campo_alterado === 'cadastrado', `histórico: ${JSON.stringify(h)}`);
  const semHora = await per(await nova({ hora: undefined, tipo_pericia_id: F.tipoB }));
  t.checar(semHora.hora === null, 'sem hora deveria guardar vazio');
  t.fim();
});

test('criar: sem nenhum local (nem réu nem manual) é recusado com mensagem clara; processo e data obrigatórios', async () => {
  const t = juntar();
  const antes = await nPer();
  const r1 = await api().post('/api/pericias').send(corpo({ local: undefined, confirmar_nova: true }));
  t.checar(r1.status === 400 && /local/i.test(msg(r1)), `sem local → ${r1.status} ${msg(r1)}`);
  t.checar((await api().post('/api/pericias').send(corpo({ processo_id: undefined, confirmar_nova: true }))).status === 400, 'sem processo');
  t.checar((await api().post('/api/pericias').send(corpo({ data: undefined, confirmar_nova: true }))).status === 400, 'sem data');
  t.checar(await nPer() === antes, 'gravou perícia inválida');
  t.fim();
});

test('criar: dados de verdade — processo, tipo, data, hora, textos (tamanho das colunas), perito, responsável — nada gravado e nunca erro interno', async () => {
  const t = juntar();
  const antes = await nPer();
  const casos = [
    ['processo texto', { processo_id: 'abc' }], ['processo negativo', { processo_id: -1 }], ['processo inexistente', { processo_id: 999999 }], ['processo excluído (inativo)', { processo_id: F.inativo }],
    ['tipo texto', { tipo_pericia_id: 'abc' }], ['tipo inexistente', { tipo_pericia_id: 999999 }],
    ['data 2099-02-30', { data: '2099-02-30' }], ['data texto', { data: 'amanhã' }], ['data número', { data: 20990301 }], ['data lista', { data: ['2099-03-02'] }],
    ['hora 25:00', { hora: '25:00' }], ['hora texto', { hora: 'dez' }], ['hora número', { hora: 10 }], ['hora 10:75', { hora: '10:75' }],
    ['local com 301 letras', { local: 'l'.repeat(301) }], ['local número', { local: 123 }], ['local lista', { local: ['x'] }],
    ['cep com 10 letras', { cep: '1'.repeat(10) }], ['logradouro com 201', { logradouro: 'l'.repeat(201) }], ['número com 21', { numero: 'n'.repeat(21) }],
    ['complemento com 101', { complemento: 'c'.repeat(101) }], ['bairro com 101', { bairro: 'b'.repeat(101) }], ['cidade com 101', { cidade: 'c'.repeat(101) }], ['estado com 3 letras', { estado: 'SPX' }], ['estado número', { estado: 12 }],
    ['perito inexistente', { perito_id: 999999 }], ['perito texto', { perito_id: 'abc' }],
    ['responsável inexistente', { responsavel_id: 'usuario:999999' }], ['responsável sem formato', { responsavel_id: 'abc' }], ['responsável número', { responsavel_id: 5 }],
    ['assistente inexistente', { assistente_tecnico_id: 'usuario:999999' }], ['assistente sem formato', { assistente_tecnico_id: 'abc' }],
  ];
  for (const [rotulo, extra] of casos) {
    const r = await api().post('/api/pericias').send(corpo({ confirmar_nova: true, hora: '09:30', ...extra }));
    t.checar([400, 404, 409, 422].includes(r.status), `${rotulo} → ${r.status} ${msg(r)} (esperado 400/404/409/422)`);
  }
  t.checar(await nPer() === antes, `foram gravadas ${await nPer() - antes} perícia(s) inválida(s)`);
  t.fim();
});

test('criar: já existe perícia agendada do mesmo tipo = 409 com a lista; "é outra perícia" cria; "é remarcação" cria e marca a antiga como remarcada (motivo obrigatório)', async () => {
  const t = juntar();
  const velha = await nova({ tipo_pericia_id: F.tipoB, data: util(3) });
  const dup = await api().post('/api/pericias').send(corpo({ tipo_pericia_id: F.tipoB, data: util(4) }));
  t.checar(dup.status === 409 && dup.body.detalhes?.codigo === 'PERICIA_AGENDADA_EXISTENTE' && dup.body.detalhes.pericias.some(x => x.id === velha), `duplicada → ${dup.status} ${JSON.stringify(dup.body).slice(0, 200)}`);
  const sem = await api().post('/api/pericias').send(corpo({ tipo_pericia_id: F.tipoB, data: util(4), remarcar_pericia_id: velha }));
  t.checar(sem.status === 400, `remarcação sem motivo → ${sem.status}`);
  for (const motivo of [5, ['a'], 'm'.repeat(301)]) {
    const r = await api().post('/api/pericias').send(corpo({ tipo_pericia_id: F.tipoB, data: util(4), remarcar_pericia_id: velha, motivo_remarcacao: motivo }));
    t.checar(r.status === 400, `motivo da remarcação ${JSON.stringify(motivo).slice(0, 15)} → ${r.status}`);
  }
  t.checar((await per(velha)).status === 'agendada', 'motivo inválido mexeu na antiga');
  const ok = await api().post('/api/pericias').send(corpo({ tipo_pericia_id: F.tipoB, data: util(4), remarcar_pericia_id: velha, motivo_remarcacao: ' Pedido do perito ' }));
  t.checar(ok.status === 201, `remarcação → ${ok.status} ${msg(ok)}`);
  const v = await per(velha);
  t.checar(v.status === 'remarcada' && v.motivo_status === 'Pedido do perito', `antiga: ${v.status}/${v.motivo_status}`);
  t.checar((await hist(velha)).some(x => x.campo_alterado === 'status' && x.valor_novo === 'remarcada'), 'sem histórico na antiga');
  const outra = await api().post('/api/pericias').send(corpo({ tipo_pericia_id: F.tipoB, data: util(5), confirmar_nova: true }));
  t.checar(outra.status === 201, `é outra perícia → ${outra.status}`);
  t.fim();
});

test('editar: altera os campos e o HISTÓRICO registra campo a campo (e não registra o que não mudou); 404 se não existe; id texto = 404; entradas inválidas recusadas', async () => {
  const t = juntar();
  const id = await nova({ tipo_pericia_id: F.tipoA, data: util(6), hora: '09:00', local: 'Local Antigo' });
  const base = { tipo_pericia_id: F.tipoA, data: util(6), hora: '09:00', local: 'Local Antigo' };
  const semMudar = await api().put(`/api/pericias/${id}`).send({ ...base, local: '  Local Antigo  ' });
  t.checar(semMudar.status === 200, `salvar sem mudar → ${semMudar.status} ${msg(semMudar)}`);
  t.checar((await hist(id)).length === 1, `salvar sem mudar mexeu no histórico: ${JSON.stringify(await hist(id))}`);
  const r = await api().put(`/api/pericias/${id}`).send({ ...base, tipo_pericia_id: F.tipoB, data: util(7), hora: '14:30', local: ' Local Novo ', perito_id: F.perito, responsavel_id: 'usuario:1' });
  t.checar(r.status === 200, `editar → ${r.status} ${msg(r)}`);
  const p = await per(id);
  t.checar(p.tipo_pericia_id === F.tipoB && p.dia === util(7) && p.hm === '14:30' && p.local === 'Local Novo' && p.perito_id === F.perito && p.responsavel_id === 1, `campos: ${JSON.stringify(p)}`);
  const campos = (await hist(id)).map(x => x.campo_alterado);
  for (const c of ['data', 'hora', 'local', 'tipo_pericia_id', 'perito_id']) t.checar(campos.includes(c), `o histórico não registrou a mudança de "${c}" (registrou: ${campos.join(', ')})`);
  t.checar((await api().put('/api/pericias/999999').send(base)).status === 404, 'inexistente');
  t.checar([400, 404].includes((await api().put('/api/pericias/abc').send(base)).status), 'id texto');
  for (const [rotulo, extra] of [['data impossível', { data: '2099-02-30' }], ['hora 25:00', { hora: '25:00' }], ['tipo inexistente', { tipo_pericia_id: 999999 }], ['local 301', { local: 'l'.repeat(301) }], ['estado 3 letras', { estado: 'SPX' }], ['perito inexistente', { perito_id: 999999 }], ['responsável sem formato', { responsavel_id: 'abc' }], ['sem nenhum local', { local: '' }]]) {
    const e = await api().put(`/api/pericias/${id}`).send({ ...base, data: util(7), hora: '14:30', local: 'Local Novo', ...extra });
    t.checar([400, 404, 409, 422].includes(e.status), `editar com ${rotulo} → ${e.status} (esperado 400/404/409/422)`);
  }
  t.checar((await per(id)).hm === '14:30' && (await per(id)).local === 'Local Novo', 'edição inválida alterou a perícia');
  t.fim();
});

test('editar: perícia cancelada, remarcada ou realizada não pode ser editada (só agendada ou aguardando data)', async () => {
  const t = juntar();
  for (const st of ['cancelada', 'remarcada', 'realizada']) {
    const id = await nova({ data: util(8) });
    await sql('UPDATE pericia SET status = ? WHERE id = ?', [st, id]);
    const r = await api().put(`/api/pericias/${id}`).send(corpo({ data: util(9), local: 'Outro' }));
    t.checar(r.status === 400, `editar ${st} → ${r.status} (esperado 400)`);
  }
  const ag = await nova({ data: util(8), hora: '08:00' });
  await sql("UPDATE pericia SET status = 'aguardando_data', data = NULL WHERE id = ?", [ag]);
  const r = await api().put(`/api/pericias/${ag}`).send(corpo({ data: util(10), local: 'Com data agora' }));
  t.checar(r.status === 200 && (await per(ag)).status === 'agendada', `informar a data: ${r.status} ${(await per(ag)).status}`);
  t.fim();
});

test('marcar realizada: só agendada; histórico; inexistente/id texto = 404', async () => {
  const t = juntar();
  const id = await nova({ data: util(11) });
  t.checar((await api().put(`/api/pericias/${id}/realizada`).send()).status === 200, 'realizar');
  t.checar((await per(id)).status === 'realizada' && (await hist(id)).some(x => x.valor_novo === 'realizada'), 'estado/histórico');
  t.checar((await api().put(`/api/pericias/${id}/realizada`).send()).status === 400, 'realizar duas vezes');
  t.checar((await api().put('/api/pericias/999999/realizada').send()).status === 404, 'inexistente');
  t.checar([400, 404].includes((await api().put('/api/pericias/abc/realizada').send()).status), 'id texto');
  t.fim();
});

test('cancelar e marcar como remarcada: motivo obrigatório e de verdade (vazio, espaços, número, lista, >300) — nada muda; ok grava motivo e histórico; só agendada', async () => {
  const t = juntar();
  for (const [rota, estado, texto] of [['cancelar', 'cancelada', 'Perito faltou'], ['marcar-remarcada', 'remarcada', 'Nova já cadastrada']]) {
    const id = await nova({ data: util(12), tipo_pericia_id: F.tipoB });
    for (const motivo of [undefined, null, '', '   ', 5, ['a'], { a: 1 }, 'm'.repeat(301)]) {
      const r = await api().put(`/api/pericias/${id}/${rota}`).send({ motivo });
      t.checar(r.status === 400, `${rota} motivo=${JSON.stringify(motivo)?.slice(0, 15)} → ${r.status} (esperado 400)`);
    }
    t.checar((await per(id)).status === 'agendada', `${rota}: motivo inválido mudou o status`);
    const ok = await api().put(`/api/pericias/${id}/${rota}`).send({ motivo: `  ${texto}  ` });
    t.checar(ok.status === 200, `${rota} → ${ok.status} ${msg(ok)}`);
    const p = await per(id);
    t.checar(p.status === estado && p.motivo_status === texto, `${rota}: ${p.status}/${p.motivo_status}`);
    t.checar((await hist(id)).some(x => x.campo_alterado === 'status' && x.valor_novo === estado), `${rota}: sem histórico`);
    t.checar((await api().put(`/api/pericias/${id}/${rota}`).send({ motivo: 'de novo' })).status === 400, `${rota} duas vezes`);
    t.checar((await api().put(`/api/pericias/999999/${rota}`).send({ motivo: 'x' })).status === 404, `${rota} inexistente`);
    t.checar([400, 404].includes((await api().put(`/api/pericias/abc/${rota}`).send({ motivo: 'x' })).status), `${rota} id texto`);
  }
  t.fim();
});

test('remarcar: cria a nova (copia local/perito/responsável), a antiga vira remarcada com o motivo; motivo, data e hora inválidos não mudam nada', async () => {
  const t = juntar();
  const id = await nova({ data: util(13), hora: '09:00', perito_id: F.perito, local: 'Local da Perícia', tipo_pericia_id: F.tipoB });
  const antes = await nPer();
  for (const [rotulo, extra] of [['sem motivo', { motivo: '' }], ['motivo número', { motivo: 5 }], ['motivo 301', { motivo: 'm'.repeat(301) }], ['sem nova data', { nova_data: undefined }], ['data impossível', { nova_data: '2099-02-30' }], ['data texto', { nova_data: 'amanhã' }], ['data número', { nova_data: 20990301 }], ['hora 25:00', { nova_hora: '25:00' }], ['hora texto', { nova_hora: 'dez' }]]) {
    const r = await api().put(`/api/pericias/${id}/remarcar`).send({ motivo: 'ok', nova_data: util(14), nova_hora: '10:00', ...extra });
    t.checar(r.status === 400, `remarcar ${rotulo} → ${r.status} (esperado 400)`);
  }
  t.checar(await nPer() === antes && (await per(id)).status === 'agendada', 'remarcação inválida mudou algo');
  const ok = await api().put(`/api/pericias/${id}/remarcar`).send({ motivo: ' Pedido da parte ', nova_data: util(14), nova_hora: '10:30' });
  t.checar(ok.status === 200, `remarcar → ${ok.status} ${msg(ok)}`);
  const v = await per(id); const n = await per(ok.body.dados.nova_pericia_id);
  t.checar(v.status === 'remarcada' && v.motivo_status === 'Pedido da parte', `antiga: ${v.status}/${v.motivo_status}`);
  t.checar(n.status === 'agendada' && n.dia === util(14) && n.hm === '10:30' && n.local === 'Local da Perícia' && n.perito_id === F.perito && n.tipo_pericia_id === F.tipoB, `nova: ${JSON.stringify(n)}`);
  t.checar((await hist(n.id)).some(x => /remarca/i.test(x.valor_novo || '')), 'sem histórico na nova');
  t.checar((await api().put(`/api/pericias/${id}/remarcar`).send({ motivo: 'x', nova_data: util(15) })).status === 400, 'remarcou uma já remarcada');
  t.checar((await api().put('/api/pericias/999999/remarcar').send({ motivo: 'x', nova_data: util(15) })).status === 404, 'inexistente');
  t.fim();
});

test('excluir: agendada some com o histórico; cancelada/remarcada não podem (histórico); inexistente e id texto = 404; 403 sem a permissão', async () => {
  const t = juntar();
  const comum = await criarUsuario('comum', 3, [['pericias', null, 'visualizar'], ['pericias', null, 'alterar']]);
  const a = await nova({ data: util(16) });
  t.checar((await api(comum.token).delete(`/api/pericias/${a}`).send()).status === 403, 'sem permissão de excluir');
  t.checar((await api().delete(`/api/pericias/${a}`).send()).status === 200, 'excluir agendada');
  t.checar(await total('SELECT COUNT(*) AS n FROM pericia WHERE id = ?', [a]) === 0 && (await hist(a)).length === 0, 'sobrou perícia ou histórico');
  for (const rota of ['cancelar', 'marcar-remarcada']) {
    const c = await nova({ data: util(17), tipo_pericia_id: F.tipoB });
    await api().put(`/api/pericias/${c}/${rota}`).send({ motivo: 'x' });
    t.checar((await api().delete(`/api/pericias/${c}`).send()).status === 400, `excluir depois de ${rota}`);
  }
  t.checar((await api().delete('/api/pericias/999999').send()).status === 404, 'inexistente');
  t.checar([400, 404].includes((await api().delete('/api/pericias/abc').send()).status), 'id texto');
  t.fim();
});

test('histórico e detalhe: ordem cronológica e nome de quem fez; perícia inexistente ou id texto = 404 (não "lista vazia")', async () => {
  const t = juntar();
  const id = await nova({ data: util(18) });
  await api().put(`/api/pericias/${id}`).send(corpo({ data: util(18), hora: '11:00' }));
  const r = await api().get(`/api/pericias/${id}/historico`);
  t.checar(r.status === 200 && r.body.dados[0].campo_alterado === 'cadastrado' && r.body.dados.every(x => x.usuario_nome), `histórico: ${JSON.stringify(r.body.dados)}`);
  t.checar((await api().get('/api/pericias/999999/historico')).status === 404, 'histórico de inexistente');
  t.checar((await api().get('/api/pericias/999999')).status === 404, 'detalhe de inexistente');
  t.checar([400, 404].includes((await api().get('/api/pericias/abc')).status), 'detalhe com id texto');
  t.checar([400, 404].includes((await api().get('/api/pericias/abc/historico')).status), 'histórico com id texto');
  t.fim();
});

test('listar: filtros (processo, status, datas), total, página negativa/lixo sem erro interno, e mais de 100 do mesmo processo em páginas completas', async () => {
  const t = juntar();
  await sql('DELETE FROM pericia');
  const a = await nova({ data: util(20) }); await nova({ data: util(21) }); await nova({ processo_id: F.outro, data: util(22) });
  await api().put(`/api/pericias/${a}/cancelar`).send({ motivo: 'x' });
  const lista = async (q) => (await api().get(`/api/pericias?${q}`)).body.dados;
  t.checar((await lista(`processo_id=${F.proc}`)).registros.length === 2, 'por processo');
  t.checar((await lista(`processo_id=${F.proc}&status=agendada`)).registros.length === 1, 'por status');
  t.checar((await lista(`data_de=${util(21)}&data_ate=${util(21)}`)).registros.length === 1, 'por intervalo');
  t.checar((await lista('')).total === 3, 'total');
  t.checar((await api().get('/api/pericias?pagina=-5')).status === 200, 'página negativa');
  t.checar((await api().get('/api/pericias?pagina=abc&limite=xyz')).status === 200, 'página/limite lixo');
  await sql('DELETE FROM pericia');
  const valores = Array.from({ length: 130 }, (_, i) => `(${F.proc}, '2098-06-${String(1 + (i % 28)).padStart(2, '0')}', 'IML', 1)`).join(',');
  await sql(`INSERT INTO pericia (processo_id, data, local, criado_por) VALUES ${valores}`);
  const p1 = await lista(`processo_id=${F.proc}&limite=100`);
  t.checar(p1.registros.length === 100 && p1.total === 130, `pág.1 = ${p1.registros.length} de ${p1.total}`);
  t.checar((await lista(`processo_id=${F.proc}&limite=100&pagina=2`)).registros.length === 30, 'pág.2');
  await sql('DELETE FROM pericia');
  t.fim();
});

test('permissões: sem visualizar/cadastrar/alterar/excluir = 403 em cada ação e nada muda', async () => {
  const t = juntar();
  const id = await nova({ data: util(25) });
  const nada = await criarUsuario('nada', 3, []);
  const ver = await criarUsuario('ver', 3, [['pericias', null, 'visualizar']]);
  t.checar((await api(nada.token).get('/api/pericias')).status === 403, 'listar sem permissão');
  t.checar((await api(ver.token).get('/api/pericias')).status === 200, 'listar com permissão');
  t.checar((await api(ver.token).get(`/api/pericias/${id}/historico`)).status === 200, 'histórico com visualizar');
  t.checar((await api(ver.token).post('/api/pericias').send(corpo({ data: util(26) }))).status === 403, 'criar sem cadastrar');
  t.checar((await api(ver.token).put(`/api/pericias/${id}`).send(corpo({ data: util(25) }))).status === 403, 'editar sem alterar');
  for (const [rota, dados] of [['realizada', {}], ['cancelar', { motivo: 'x' }], ['remarcar', { motivo: 'x', nova_data: util(26) }], ['marcar-remarcada', { motivo: 'x' }], ['comunicado', {}]]) {
    t.checar((await api(ver.token)[rota === 'comunicado' ? 'post' : 'put'](`/api/pericias/${id}/${rota}`).send(dados)).status === 403, `${rota} sem alterar`);
  }
  t.checar((await api(ver.token).delete(`/api/pericias/${id}`).send()).status === 403, 'excluir sem excluir');
  t.checar((await per(id)).status === 'agendada', 'algo mudou sem permissão');
  t.fim();
});

test('endereço do perito (sugestão de local da perícia): só perito (profissão "Perícia…"), com o endereço por extenso e o aviso de endereço incompleto; id ruim = 404; precisa de login e de permissão de Perícias', async () => {
  const t = juntar();
  const prof = (await sql("INSERT INTO profissao (nome) VALUES ('Perícia Médica C7')")).insertId;
  const completo = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, profissao_id, cep, logradouro, numero, complemento, bairro, cidade, estado) VALUES ('Perito Com Consultório', '39053344705', ?, '13015-001', 'Rua do Consultório', '45', 'Sala 3', 'Centro', 'Campinas', 'SP')", [prof])).insertId;
  const incompleto = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, profissao_id, logradouro, bairro, cidade, estado) VALUES ('Perito Sem Número', '52998224725', ?, 'Rua Sem Número', 'Centro', 'Campinas', 'SP')", [prof])).insertId;
  const inativo = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, profissao_id, ativo) VALUES ('Perito Inativo', '16899535009', ?, 0)", [prof])).insertId;
  const ok = await api().get(`/api/pericias/perito-endereco/${completo}`);
  t.checar(ok.status === 200 && ok.body.dados.nome === 'Perito Com Consultório' && ok.body.dados.endereco_incompleto === false, `completo: ${ok.status} ${JSON.stringify(ok.body.dados)}`);
  t.checar(ok.body.dados.endereco_completo === 'Rua do Consultório, 45 - Sala 3 - Centro - Campinas/SP - 13015-001', `endereço por extenso: ${ok.body.dados.endereco_completo}`);
  t.checar(ok.body.dados.cep === '13015-001' && ok.body.dados.logradouro === 'Rua do Consultório' && ok.body.dados.numero === '45' && ok.body.dados.complemento === 'Sala 3' && ok.body.dados.estado === 'SP', 'campos do endereço');
  const inc = await api().get(`/api/pericias/perito-endereco/${incompleto}`);
  t.checar(inc.status === 200 && inc.body.dados.endereco_incompleto === true, `incompleto: ${inc.status} ${JSON.stringify(inc.body.dados)}`);
  t.checar((await api().get(`/api/pericias/perito-endereco/${F.perito}`)).status === 404, 'pessoa que não é perito (sem profissão "Perícia") = 404');
  t.checar((await api().get(`/api/pericias/perito-endereco/${inativo}`)).status === 404, 'perito inativo = 404');
  for (const ruim of ['abc', '-1', '0', '99999999999999999999', '999999']) t.checar((await api().get(`/api/pericias/perito-endereco/${ruim}`)).status === 404, `id ${ruim} = 404`);
  t.checar((await request(app).get(`/api/pericias/perito-endereco/${completo}`)).status === 401, 'sem login = 401');
  const nada = await criarUsuario('semperm', 3, []);
  const ver = await criarUsuario('soperiver', 3, [['pericias', null, 'visualizar']]);
  t.checar((await api(nada.token).get(`/api/pericias/perito-endereco/${completo}`)).status === 403, 'sem permissão de Perícias = 403');
  t.checar((await api(ver.token).get(`/api/pericias/perito-endereco/${completo}`)).status === 200, 'só "ver Perícias" (sem Pessoas) basta');
  t.fim();
});
