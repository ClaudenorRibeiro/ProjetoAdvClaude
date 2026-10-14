// PROCESSO APENSO — cadastro, números, buscas, audiência/perícia bloqueadas e publicações. Servidor contra MySQL real isolado.
// (Arquivar e excluir o principal ficam em processos-apensos-arquivar.integration.test.js.)
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
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = () => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${admin}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${admin}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${admin}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${admin}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const msg = (r) => String(r.body.mensagem || '');

let seq = 0;
const partes = () => ({
  autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.credor }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.devedora }],
});
async function comum(extra = {}) {
  seq += 1;
  const r = await api().post('/api/processos').send({
    numPasta: 8100 + seq, numProc: `COMUM-${seq}`, NomeTituloProc: `COMUM ${seq}`, tipo_id: 1, status_id: F.aberto, cliente_polo: 'autor', ...partes(), ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}
const corpoApenso = (principal, extra = {}) => ({
  apenso_de_id: principal.id, numProc: '5000000-00.2026.8.26.0100', NomeTituloProc: 'RECUPERAÇÃO JUDICIAL DA DEVEDORA', tipo_id: 1, status_id: F.aberto,
  cliente_polo: 'autor', ...partes(), ...extra,
});
const apenso = (principal, extra = {}) => api().post('/api/processos').send(corpoApenso(principal, extra));

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  F.credor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Credor do Teste', '52998224725')")).insertId;
  F.devedora = (await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Devedora em Recuperação Ltda', '11222333000181')")).insertId;
  F.aberto = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Em andamento APN', 0)")).insertId;
  F.tipoAud = (await sql("INSERT INTO tipo_audiencia (nome) VALUES ('Audiência APN')")).insertId;
  F.tipoPer = (await sql("INSERT INTO tipo_pericia (nome) VALUES ('Perícia APN')")).insertId;
});
test.after(async () => pool.end());

test('cadastro: nasce na pasta do principal, com vínculo, número próprio e histórico', async () => {
  const p = await comum();
  const r = await apenso(p);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.dados.pasta_id, p.pastaId);
  const linha = (await sql('SELECT apenso_de_id, pasta_id, numProc, ativo FROM tblproc WHERE id = ?', [r.body.dados.id]))[0];
  assert.equal(linha.apenso_de_id, p.id); assert.equal(linha.pasta_id, p.pastaId); assert.equal(linha.numProc, '5000000-00.2026.8.26.0100');
  assert.equal((await sql("SELECT * FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'criar'", [r.body.dados.id])).length, 1);
});

test('cadastro: número obrigatório, principal inválido, apenso de apenso e pasta diferente', async () => {
  const p = await comum();
  assert.match(msg(await apenso(p, { numProc: '  ' })), /número do processo do apenso é obrigatório/);
  assert.equal((await apenso(p, { numProc: undefined })).status, 400);
  assert.equal((await apenso({ id: 99999999 })).status, 404);
  assert.equal((await apenso({ id: 'abc' })).status, 400);
  const a = await apenso(p, { numProc: 'AP-X-1' });
  const deApenso = await apenso({ id: a.body.dados.id }, { numProc: 'AP-X-2' });
  assert.equal(deApenso.status, 400); assert.match(msg(deApenso), /não pode ser o processo principal de outro apenso/);
  const outra = await comum();
  assert.match(msg(await apenso(p, { numProc: 'AP-X-3', pasta_id: outra.pastaId })), /sempre na pasta do processo principal/);
  assert.match(msg(await apenso(p, { numProc: 'AP-X-4', numPasta: 8999 })), /sempre na pasta do processo principal/);
  // principal inativo
  const inativo = await comum(); await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [inativo.id]);
  assert.equal((await apenso(inativo, { numProc: 'AP-X-5' })).status, 404);
  // título, autor e réu continuam obrigatórios
  assert.equal((await apenso(p, { numProc: 'AP-X-6', NomeTituloProc: '' })).status, 400);
  assert.equal((await apenso(p, { numProc: 'AP-X-7', autores: [] })).status, 400);
});

test('números: mesmo apenso em várias pastas; nunca repete na pasta nem igual a processo comum', async () => {
  const p1 = await comum(); const p2 = await comum(); const p3 = await comum();
  const num = 'REC-JUD-0001';
  for (const p of [p1, p2, p3]) assert.equal((await apenso(p, { numProc: num })).status, 201);
  assert.equal(await sql('SELECT id FROM tblproc WHERE numProc = ? AND apenso_de_id IS NOT NULL', [num]).then(l => l.length), 3);
  // repetido NA MESMA pasta
  const dup = await apenso(p1, { numProc: num });
  assert.equal(dup.status, 400); assert.match(msg(dup), /já está cadastrado nesta pasta/);
  // um segundo comum da mesma pasta também é "mesma pasta"
  const irmao = await comum({ pasta_id: p1.pastaId, numPasta: undefined, numProc: 'IRMAO-1' });
  assert.match(msg(await apenso(irmao, { numProc: num })), /já está cadastrado nesta pasta/);
  // apenso com o número de um processo comum
  const c = await comum({ numProc: 'NUMERO-DO-COMUM' });
  assert.match(msg(await apenso(p1, { numProc: 'NUMERO-DO-COMUM' })), /número de processo "NUMERO-DO-COMUM" já está cadastrado/);
  // processo comum com o número de um apenso
  const sobre = await api().post('/api/processos').send({ numPasta: 8700, numProc: num, NomeTituloProc: 'COMUM IGUAL AO APENSO', ...partes() });
  assert.equal(sobre.status, 400); assert.match(msg(sobre), /já está cadastrado como apenso em outra pasta/);
  // dois comuns com o mesmo número continuam proibidos
  const dc = await api().post('/api/processos').send({ numPasta: 8701, numProc: 'NUMERO-DO-COMUM', NomeTituloProc: 'DUP', ...partes() });
  assert.equal(dc.status, 400);
  assert.ok(c.id);
});

test('protocolo: do comum é único entre comuns; do apenso é único por pasta e independente do comum', async () => {
  const p1 = await comum({ protocolo: 'PROT-COMUM-1' }); const p2 = await comum();
  assert.equal((await apenso(p1, { numProc: 'AP-PROT-1', protocolo: 'PROT-COMUM-1' })).status, 201);   // apenso pode ter o protocolo de um comum
  assert.equal((await apenso(p2, { numProc: 'AP-PROT-1', protocolo: 'PROT-COMUM-1' })).status, 201);   // e repetir em outra pasta
  const dup = await apenso(p1, { numProc: 'AP-PROT-2', protocolo: 'PROT-COMUM-1' });
  assert.equal(dup.status, 400); assert.match(msg(dup), /protocolo "PROT-COMUM-1" já está cadastrado nesta pasta/);
  const dc = await api().post('/api/processos').send({ numPasta: 8800, protocolo: 'PROT-COMUM-1', NomeTituloProc: 'X', ...partes() });
  assert.equal(dc.status, 400);
});

test('dois apensos de mesmo número cadastrados ao mesmo tempo na mesma pasta: só um vence', async () => {
  const p = await comum();
  const rs = await Promise.all([1, 2, 3].map(() => apenso(p, { numProc: 'CORRIDA-1' })));
  assert.equal(rs.filter(r => r.status === 201).length, 1, JSON.stringify(rs.map(r => r.status)));
  assert.equal((await sql("SELECT id FROM tblproc WHERE numProc = 'CORRIDA-1'")).length, 1);
});

test('edição: vínculo não muda, número do apenso continua obrigatório e a regra de repetidos vale', async () => {
  const p = await comum(); const q = await comum();
  const a = (await apenso(p, { numProc: 'ED-1' })).body.dados.id;
  await apenso(p, { numProc: 'ED-2' });
  const base = { NomeTituloProc: 'EDITADO', tipo_id: 1, status_id: F.aberto, cliente_polo: 'autor', numProc: 'ED-1' };
  assert.equal((await api().put(`/api/processos/${a}`).send(base)).status, 200);
  assert.equal((await api().put(`/api/processos/${a}`).send({ ...base, apenso_de_id: p.id })).status, 200);   // mesmo vínculo: aceito
  const troca = await api().put(`/api/processos/${a}`).send({ ...base, apenso_de_id: q.id });
  assert.equal(troca.status, 400); assert.match(msg(troca), /vínculo de apenso não pode ser alterado/);
  assert.equal((await api().put(`/api/processos/${a}`).send({ ...base, apenso_de_id: null })).status, 400);
  assert.match(msg(await api().put(`/api/processos/${a}`).send({ ...base, numProc: '' })), /número do processo do apenso é obrigatório/);
  assert.match(msg(await api().put(`/api/processos/${a}`).send({ ...base, numProc: 'ED-2' })), /já está cadastrado nesta pasta/);
  // processo comum não vira apenso
  assert.equal((await api().put(`/api/processos/${p.id}`).send({ ...base, numProc: 'COMUM-EDIT', apenso_de_id: q.id })).status, 400);
  // o mesmo número em outra pasta é permitido ao editar
  const b = (await apenso(q, { numProc: 'ED-9' })).body.dados.id;
  assert.equal((await api().put(`/api/processos/${b}`).send({ ...base, numProc: 'ED-1' })).status, 200);
});

test('buscas: o número do apenso acha todas as pastas e as listas marcam o apenso', async () => {
  const p1 = await comum(); const p2 = await comum();
  const a1 = (await apenso(p1, { numProc: 'BUSCA-AP-77' })).body.dados.id;
  const a2 = (await apenso(p2, { numProc: 'BUSCA-AP-77' })).body.dados.id;
  const b = (await api().get('/api/processos/buscar?q=BUSCA-AP-77')).body.dados;
  assert.deepEqual(b.map(x => x.id).sort(), [a1, a2].sort()); assert.ok(b.every(x => x.apenso_de_id));
  assert.equal((await api().get(`/api/processos/${a1}/basico`)).body.dados.apenso_de_id, p1.id);
  assert.equal((await api().get(`/api/processos/${p1.id}/basico`)).body.dados.apenso_de_id, null);
  const lista = (await api().get('/api/processos/pastas?busca=BUSCA-AP-77')).body.dados;
  assert.deepEqual(lista.registros.map(x => x.id).sort(), [p1.pastaId, p2.pastaId].sort());
  const ficha = (await api().get(`/api/processos/pastas/${p1.pastaId}`)).body.dados.processos;
  assert.equal(ficha.length, 2); assert.equal(ficha.find(x => x.id === a1).apenso_de_id, p1.id);
  const daPessoa = (await api().get(`/api/pessoas/fisicas/${F.credor}/processos`)).body.dados;
  assert.equal(daPessoa.find(x => x.id === a1).apenso_de_id, p1.id);
});

test('resumo da pasta ignora os apensos e mostra total_apensos', async () => {
  const st2 = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Outro APN', 0)")).insertId;
  const p = await comum({ NomeTituloProc: 'TITULO DO PRINCIPAL' });
  const numPrincipal = (await sql('SELECT numProc FROM tblproc WHERE id = ?', [p.id]))[0].numProc;
  await apenso(p, { numProc: 'RES-AP-1', NomeTituloProc: 'TITULO DO APENSO', status_id: st2 });
  await apenso(p, { numProc: 'RES-AP-2', NomeTituloProc: 'TITULO DO APENSO 2', status_id: st2 });
  const linha = (await api().get(`/api/processos/pastas?busca=${encodeURIComponent('TITULO DO PRINCIPAL')}`)).body.dados.registros.find(x => x.id === p.pastaId);
  assert.equal(linha.titulo_proc, 'TITULO DO PRINCIPAL'); assert.equal(linha.num_proc, numPrincipal);
  assert.equal(linha.total_processos, 1); assert.equal(linha.total_apensos, 2);
  assert.equal(linha.status_nome, 'Em andamento APN');   // o status dos apensos não entra no resumo
  const n = (await api().get('/api/processos/pastas/checar?numPasta=' + (await sql('SELECT numPasta FROM tblpasta WHERE id = ?', [p.pastaId]))[0].numPasta)).body.dados;
  assert.equal(n.emUso, true);
});

test('audiência e perícia: apenso não pode ter', async () => {
  const p = await comum();
  const a = (await apenso(p, { numProc: 'SEM-AUD-1' })).body.dados.id;
  const aud = await api().post('/api/audiencias').send({ processo_id: a, tipo_audiencia_id: F.tipoAud, data: '2030-05-05', hora: '10:00', modalidade: 'presencial' });
  assert.equal(aud.status, 400); assert.match(msg(aud), /Processo apenso não pode ter audiência/);
  const per = await api().post('/api/pericias').send({ processo_id: a, tipo_pericia_id: F.tipoPer, data: '2030-05-05', hora: '10:00', confirmar_nova: true });
  assert.equal(per.status, 400); assert.match(msg(per), /Processo apenso não pode ter perícia/);
  assert.equal((await sql('SELECT id FROM audiencia WHERE processo_id = ?', [a])).length, 0);
  assert.equal((await sql('SELECT id FROM pericia WHERE processo_id = ?', [a])).length, 0);
  // o principal continua podendo
  const ok = await api().post('/api/audiencias').send({ processo_id: p.id, tipo_audiencia_id: F.tipoAud, data: '2030-05-05', hora: '10:00', modalidade: 'presencial' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test('prazo, tarefa e financeiro funcionam no apenso', async () => {
  const p = await comum();
  const a = (await apenso(p, { numProc: 'COM-FIN-1' })).body.dados.id;
  await sql("INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, criado_por, status) VALUES (?, '2030-01-01', '2030-01-10', 1, 'aberto')", [a]);
  await sql("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa no apenso', ?, 1, 0)", [a]);
  await sql("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, status) VALUES (?, 'acordo', 'Acordo no apenso', 100, 1, '2030-01-05', 'ativo')", [a]);
  const fin = await api().get(`/api/financeiro/processo/${a}`);
  assert.equal(fin.status, 200);
});

test('publicações: o número do apenso traz TODAS as pastas, comum primeiro', async () => {
  const p1 = await comum({ numProc: 'PUB-COMUM-1' }); const p2 = await comum(); const p3 = await comum();
  await apenso(p2, { numProc: 'PUB-AP-1' }); await apenso(p3, { numProc: 'PUB-AP-1' });
  await sql("INSERT INTO publicacoes (fonte, data_publicacao, numero_processo, texto, texto_hash) VALUES ('aasp', CURDATE(), 'PUB-AP-1', 'texto a', REPEAT('a',64)), ('aasp', CURDATE(), 'PUB-COMUM-1', 'texto b', REPEAT('b',64))");
  const reg = (await api().get('/api/publicacoes?fonte=aasp')).body.dados.registros;
  const ap = reg.find(x => x.numero_processo === 'PUB-AP-1');
  assert.equal(ap.processos_vinculados.length, 2); assert.ok(ap.processos_vinculados.every(v => v.apenso === true));
  assert.deepEqual(ap.processos_vinculados.map(v => v.pasta_id).sort(), [p2.pastaId, p3.pastaId].sort());
  assert.equal(ap.processo_cadastrado, 1);
  const co = reg.find(x => x.numero_processo === 'PUB-COMUM-1');
  assert.deepEqual(co.processos_vinculados.map(v => v.processo_id), [p1.id]); assert.equal(co.processos_vinculados[0].apenso, false);
  // mesmo número em comum + apenso não existe (proibido), mas a ordem comum-primeiro vale por consulta
});
