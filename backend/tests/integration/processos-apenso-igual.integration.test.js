// APENSO EM VÁRIAS PASTAS — o mesmo número tem as mesmas informações (vara/fórum, tipo, instância, assuntos, data de distribuição e
// protocolo); partes, observações, status etc. ficam livres em cada pasta. Mudar um campo compartilhado pede confirmação e vale para todas.
// Servidor contra MySQL real isolado.
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
const NUM = '6000000-00.2026.8.26.0100';
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = () => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${admin}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${admin}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${admin}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const msg = (r) => String(r.body.mensagem || '');
const codigo = (r) => r.body.detalhes?.codigo;

let seq = 0;
const partes = (reu = F.devedora) => ({ autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.credor }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: reu }] });
async function comum() {
  seq += 1;
  const r = await api().post('/api/processos').send({
    numPasta: 8300 + seq, numProc: `IGUAL-COMUM-${seq}`, NomeTituloProc: `COMUM ${seq}`, tipo_id: F.tipoA, status_id: F.aberto, cliente_polo: 'autor', ...partes(),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}
const base = () => ({ vara_id: F.varaA, tipo_id: F.tipoA, instancia_id: F.instA, data_distribuicao: '2026-03-10', protocolo: null, assuntos: [F.assA] });
const corpo = (principal, extra = {}) => ({
  apenso_de_id: principal.id, numProc: NUM, NomeTituloProc: 'EXTRA X ALGUEM', status_id: F.aberto, cliente_polo: '', ...partes(), ...base(), ...extra,
});
const criar = (principal, extra = {}) => api().post('/api/processos').send(corpo(principal, extra));
// corpo completo para editar um apenso já gravado (a tela sempre manda tudo)
async function corpoDeEdicao(id, extra = {}) {
  const [l] = await sql('SELECT * FROM tblproc WHERE id = ?', [id]);
  const assuntos = (await sql('SELECT assunto_id FROM processo_assunto WHERE processo_id = ? ORDER BY assunto_id', [id])).map(a => a.assunto_id);
  return { numProc: l.numProc, protocolo: l.protocolo, NomeTituloProc: l.NomeTituloProc, vara_id: l.vara_id, tipo_id: l.tipo_id, status_id: l.status_id,
    instancia_id: l.instancia_id, data_distribuicao: l.data_distribuicao, observacoes: l.observacoes, cliente_polo: l.cliente_polo, assuntos, ...extra };
}
const editar = async (id, extra = {}) => api().put(`/api/processos/${id}`).send(await corpoDeEdicao(id, extra));
const dadosDe = async (id) => {
  const [l] = await sql('SELECT vara_id, tipo_id, instancia_id, data_distribuicao, protocolo, observacoes, status_id FROM tblproc WHERE id = ?', [id]);
  l.assuntos = (await sql('SELECT assunto_id FROM processo_assunto WHERE processo_id = ? ORDER BY assunto_id', [id])).map(a => a.assunto_id);
  return l;
};
// três pastas com o mesmo apenso, todas iguais
async function tresPastas() {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = await comum(); const r = await criar(p);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    out.push({ id: r.body.dados.id, pastaId: p.pastaId });
  }
  return out;
}
const limpar = () => sql('DELETE FROM processo_assunto WHERE processo_id IN (SELECT id FROM tblproc WHERE apenso_de_id IS NOT NULL)')
  .then(() => sql('DELETE FROM tbltituloprocautor WHERE proc_id IN (SELECT id FROM tblproc WHERE apenso_de_id IS NOT NULL)'))
  .then(() => sql('DELETE FROM tbltituloprocreu WHERE proc_id IN (SELECT id FROM tblproc WHERE apenso_de_id IS NOT NULL)'))
  .then(() => sql('DELETE FROM tblproc WHERE apenso_de_id IS NOT NULL'));

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  F.credor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Credor Igual', '52998224725')")).insertId;
  F.devedora = (await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Devedora Igual Ltda', '11222333000181')")).insertId;
  F.outraDevedora = (await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Outra Devedora Ltda', '22333444000181')")).insertId;
  F.aberto = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo) VALUES ('Em andamento IGL', 0)")).insertId;
  F.forumA = (await sql("INSERT INTO tblforum (nome) VALUES ('Fórum A IGL')")).insertId;
  F.forumB = (await sql("INSERT INTO tblforum (nome) VALUES ('Fórum B IGL')")).insertId;
  F.varaA = (await sql("INSERT INTO tblvara (nome, forum_id) VALUES ('1ª Vara A', ?)", [F.forumA])).insertId;
  F.varaB = (await sql("INSERT INTO tblvara (nome, forum_id) VALUES ('2ª Vara B', ?)", [F.forumB])).insertId;
  F.tipoA = (await sql("INSERT INTO tbltipoproc (nome) VALUES ('Tipo A IGL')")).insertId;
  F.tipoB = (await sql("INSERT INTO tbltipoproc (nome) VALUES ('Tipo B IGL')")).insertId;
  F.instA = (await sql("INSERT INTO tblinstanciaproc (nome) VALUES ('1ª IGL')")).insertId;
  F.instB = (await sql("INSERT INTO tblinstanciaproc (nome) VALUES ('2ª IGL')")).insertId;
  F.assA = (await sql("INSERT INTO tblassuntoproc (nome) VALUES ('Assunto A IGL')")).insertId;
  F.assB = (await sql("INSERT INTO tblassuntoproc (nome) VALUES ('Assunto B IGL')")).insertId;
});
test.after(async () => pool.end());
test.beforeEach(limpar);

test('apenso-por-numero: número que não existe = encontrado false; existente traz os dados, os autores (para sugerir) e as pastas', async () => {
  assert.equal((await api().get(`/api/processos/apenso-por-numero?numero=${encodeURIComponent(NUM)}`)).body.dados.encontrado, false);
  assert.equal((await api().get('/api/processos/apenso-por-numero')).body.dados.encontrado, false);
  assert.equal((await api().get(`/api/processos/apenso-por-numero?numero=${'9'.repeat(60)}`)).body.dados.encontrado, false);
  const p1 = await comum(); const p2 = await comum();
  assert.equal((await criar(p1, { protocolo: 'PROT-1' })).status, 201);
  assert.equal((await criar(p2, { protocolo: 'PROT-1', reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.outraDevedora }] })).status, 201);
  const r = await api().get(`/api/processos/apenso-por-numero?numero=${encodeURIComponent(NUM)}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.dados;
  assert.equal(d.encontrado, true);
  assert.deepEqual([d.vara_id, d.forum_id, d.tipo_id, d.instancia_id, d.data_distribuicao, d.protocolo, d.assuntos], [F.varaA, F.forumA, F.tipoA, F.instA, '2026-03-10', 'PROT-1', [F.assA]]);
  assert.deepEqual(d.autores.map(a => [a.tipo_pessoa, a.pessoa_id, a.nome]), [['fisica', F.credor, 'Credor Igual']]);
  assert.equal(d.pastas.length, 2);
  assert.equal(d.reus, undefined, 'os réus mudam de pasta para pasta: não são devolvidos');
});

test('cadastro: igual ao que já existe passa direto; mudar vara/tipo/assunto pede confirmação (409) e não grava nada', async () => {
  const [a] = await tresPastas();                      // a pasta 1 e outras duas já existem com os mesmos dados
  const p = await comum();
  assert.equal((await criar(p)).status, 201);          // igual: sem aviso
  const q = await comum();
  const antes = (await sql('SELECT COUNT(*) AS n FROM tblproc WHERE apenso_de_id IS NOT NULL'))[0].n;
  const r = await criar(q, { vara_id: F.varaB, assuntos: [F.assA, F.assB] });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(codigo(r), 'CONFIRMAR_ALTERACAO_EM_OUTRAS_PASTAS');
  assert.deepEqual(r.body.detalhes.campos.sort(), ['assuntos', 'vara e fórum']);
  assert.equal(r.body.detalhes.pastas.length, 4);
  assert.match(msg(r), /Alterar .* vai alterar também/);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM tblproc WHERE apenso_de_id IS NOT NULL'))[0].n, antes, 'nada foi gravado');
  assert.deepEqual(await dadosDe(a.id).then(d => [d.vara_id, d.assuntos]), [F.varaA, [F.assA]], 'as outras pastas continuam como estavam');
  // "true" em texto não confirma
  assert.equal((await criar(q, { vara_id: F.varaB, confirmar_outras_pastas: 'true' })).status, 409);
});

test('cadastro confirmado: grava e leva a mesma informação para todas as outras pastas; partes e observações continuam livres', async () => {
  const [a, b] = await tresPastas();
  await sql("UPDATE tblproc SET observacoes = 'obs da pasta A' WHERE id = ?", [a.id]);
  const q = await comum();
  const r = await criar(q, { vara_id: F.varaB, tipo_id: F.tipoB, instancia_id: F.instB, data_distribuicao: '2026-05-01', protocolo: 'PROT-NOVO', assuntos: [F.assB],
    observacoes: 'obs da pasta Q', reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.outraDevedora }], confirmar_outras_pastas: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const esperado = { vara_id: F.varaB, tipo_id: F.tipoB, instancia_id: F.instB, data_distribuicao: '2026-05-01', protocolo: 'PROT-NOVO', assuntos: [F.assB] };
  for (const id of [a.id, b.id, r.body.dados.id]) {
    const d = await dadosDe(id);
    assert.deepEqual({ vara_id: d.vara_id, tipo_id: d.tipo_id, instancia_id: d.instancia_id, data_distribuicao: d.data_distribuicao, protocolo: d.protocolo, assuntos: d.assuntos }, esperado, `apenso ${id}`);
  }
  assert.equal((await dadosDe(a.id)).observacoes, 'obs da pasta A', 'observações não são levadas às outras pastas');
  const reusA = await sql('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [a.id]);
  assert.deepEqual(reusA.map(x => x.pessoa_id), [F.devedora], 'os réus da outra pasta não mudam');
  assert.ok((await sql("SELECT 1 FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'editar'", [a.id])).length >= 1, 'a outra pasta fica no histórico');
});

test('edição: mudar vara/instância/assunto num apenso que está em outras pastas pede confirmação; confirmado, todas ficam iguais', async () => {
  const [a, b, c] = await tresPastas();
  const r = await editar(a.id, { vara_id: F.varaB, instancia_id: F.instB });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(codigo(r), 'CONFIRMAR_ALTERACAO_EM_OUTRAS_PASTAS');
  assert.deepEqual(r.body.detalhes.campos.sort(), ['instância', 'vara e fórum']);
  assert.deepEqual(r.body.detalhes.pastas.map(x => x.id).sort(), [b.pastaId, c.pastaId].sort());
  assert.equal((await dadosDe(a.id)).vara_id, F.varaA, 'nada foi gravado');
  const ok = await editar(a.id, { vara_id: F.varaB, instancia_id: F.instB, confirmar_outras_pastas: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  for (const id of [a.id, b.id, c.id]) { const d = await dadosDe(id); assert.deepEqual([d.vara_id, d.instancia_id], [F.varaB, F.instB], `apenso ${id}`); }
  // assuntos
  assert.equal((await editar(b.id, { assuntos: [F.assB] })).status, 409);
  assert.equal((await editar(b.id, { assuntos: [F.assB], confirmar_outras_pastas: true })).status, 200);
  for (const id of [a.id, b.id, c.id]) assert.deepEqual((await dadosDe(id)).assuntos, [F.assB], `assuntos do apenso ${id}`);
});

test('edição de campo livre (observações, status, partes) não pede confirmação e não mexe nas outras pastas', async () => {
  const [a, b] = await tresPastas();
  const r = await editar(a.id, { observacoes: 'só desta pasta', status_id: F.aberto, reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.outraDevedora }], autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.credor }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await dadosDe(a.id)).observacoes, 'só desta pasta');
  assert.equal((await dadosDe(b.id)).observacoes, null);
  assert.deepEqual((await sql('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [b.id])).map(x => x.pessoa_id), [F.devedora]);
});

test('dados antigos diferentes não são mexidos: só o campo que a pessoa mudou é levado às outras pastas', async () => {
  const [a, b] = await tresPastas();
  await sql('UPDATE tblproc SET vara_id = ?, tipo_id = ? WHERE id = ?', [F.varaB, F.tipoB, b.id]);   // divergência antiga na pasta B
  // editar só observações da pasta A: nenhum aviso, nada vai para B (a divergência continua)
  assert.equal((await editar(a.id, { observacoes: 'x' })).status, 200);
  assert.deepEqual(await dadosDe(b.id).then(d => [d.vara_id, d.tipo_id]), [F.varaB, F.tipoB]);
  // mudar só o protocolo da pasta A: o aviso lista SÓ o protocolo; B recebe o protocolo e mantém a vara/tipo antigos
  const r = await editar(a.id, { protocolo: 'PROT-A' });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body.detalhes.campos, ['número de protocolo']);
  assert.equal((await editar(a.id, { protocolo: 'PROT-A', confirmar_outras_pastas: true })).status, 200);
  assert.deepEqual(await dadosDe(b.id).then(d => [d.protocolo, d.vara_id, d.tipo_id]), ['PROT-A', F.varaB, F.tipoB]);
});

test('protocolo que já existe na outra pasta: nada é gravado em lugar nenhum (volta tudo)', async () => {
  const [a, b] = await tresPastas();
  const pastaB = (await sql('SELECT pasta_id FROM tblproc WHERE id = ?', [b.id]))[0].pasta_id;
  // outro apenso, na pasta B, já usa o protocolo "PROT-X"
  const principalB = (await sql('SELECT apenso_de_id FROM tblproc WHERE id = ?', [b.id]))[0].apenso_de_id;
  const outro = await api().post('/api/processos').send({ ...corpo({ id: principalB }, { numProc: '7000000-00.2026.8.26.0100', protocolo: 'PROT-X' }) });
  assert.equal(outro.status, 201, JSON.stringify(outro.body));
  assert.equal((await sql('SELECT pasta_id FROM tblproc WHERE id = ?', [outro.body.dados.id]))[0].pasta_id, pastaB);
  const r = await editar(a.id, { protocolo: 'PROT-X', confirmar_outras_pastas: true });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(msg(r), /Não foi possível igualar o apenso na pasta .*PROT-X/);
  assert.equal((await dadosDe(a.id)).protocolo, null, 'a própria pasta também não mudou');
  assert.equal((await dadosDe(b.id)).protocolo, null);
});

test('apenso que só existe numa pasta, e processo comum, editam como sempre (sem aviso)', async () => {
  const p = await comum(); const r = await criar(p);
  assert.equal(r.status, 201);
  assert.equal((await editar(r.body.dados.id, { vara_id: F.varaB, tipo_id: F.tipoB, protocolo: 'SOZINHO' })).status, 200);
  const [l] = await sql('SELECT id, vara_id FROM tblproc WHERE id = ?', [p.id]);
  const ed = await api().put(`/api/processos/${l.id}`).send({ numProc: `IGUAL-COMUM-X`, NomeTituloProc: 'COMUM', vara_id: F.varaB, tipo_id: F.tipoA, status_id: F.aberto, autores: partes().autores, reus: partes().reus });
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
});

test('trocar o número de um apenso para um que já existe em outra pasta compara com o que já existe (e pede confirmação se mudar algo)', async () => {
  const [a] = await tresPastas();
  const p = await comum();
  const sozinho = await criar(p, { numProc: '8000000-00.2026.8.26.0100', vara_id: F.varaB });
  assert.equal(sozinho.status, 201);
  const r = await editar(sozinho.body.dados.id, { numProc: NUM });          // passa a ser o apenso NUM, mas com a vara B
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.deepEqual(r.body.detalhes.campos, ['vara e fórum']);
  assert.equal((await dadosDe(a.id)).vara_id, F.varaA);
  assert.equal((await editar(sozinho.body.dados.id, { numProc: NUM, vara_id: F.varaA })).status, 200);   // igual ao que existe: passa
});
