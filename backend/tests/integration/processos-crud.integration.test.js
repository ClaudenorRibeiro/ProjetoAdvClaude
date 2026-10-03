// Plano de testes de Processos — passo A1 (ver PLANO-TESTES-PROCESSOS.md).
// Servidor, contra MySQL real isolado: criar, editar, excluir (sem deixar órfãos), histórico e as buscas
// auxiliares (/buscar, /:id/basico, /sugerir-pasta, /pastas/checar, /auxiliares), com validações e entradas inválidas.
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
const um = async (q, p) => (await sql(q, p))[0];
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const soDigitos = (v) => String(v).replace(/\D/g, '');

let seqProc = 0;
// Corpo válido de um processo; `extra` sobrescreve. Cada chamada usa número de pasta e de processo próprios.
function corpo(extra = {}) {
  seqProc += 1;
  return {
    numPasta: 5000 + seqProc,
    numProc: `00${seqProc}0000-00.2026.5.15.${String(seqProc).padStart(4, '0')}`,
    NomeTituloProc: `PROCESSO DO TESTE ${seqProc}`,
    cliente_polo: 'autor',
    tipo_id: 1, status_id: 1,
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autor }],
    reus: [{ tipo_pessoa: 'fisica', pessoa_id: F.reu }],
    ...extra,
  };
}
async function criar(extra = {}) {
  const r = await api().post('/api/processos').send(corpo(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}
const auditoria = (id, acao) => sql("SELECT * FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = ?", [id, acao]);

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  F.autor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Autor do Teste', '52998224725')")).insertId;
  F.reu = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Réu do Teste', '11144477735')")).insertId;
  F.perito = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Perito do Teste', '39053344705')")).insertId;
  F.inativa = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, ativo) VALUES ('Pessoa Desativada', '16899535009', 0)")).insertId;
  F.empresa = (await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Empresa do Teste Ltda', '11222333000181')")).insertId;
  F.freela = (await sql("INSERT INTO advogados_freela (nome, oab) VALUES ('Advogado Avulso', 'SP 123456')")).insertId;
  F.forum = (await sql("INSERT INTO tblforum (nome, ativo) VALUES ('Fórum do Teste', 1)")).insertId;
  F.vara = (await sql("INSERT INTO tblvara (forum_id, nome, ativo) VALUES (?, 'Vara do Teste', 1)", [F.forum])).insertId;
  F.instancia = (await sql("INSERT INTO tblinstanciaproc (nome, ativo) VALUES ('Primeira instância', 1)")).insertId;
  F.assunto1 = (await sql("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Um', 1)")).insertId;
  F.assunto2 = (await sql("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Dois', 1)")).insertId;
  F.status2 = (await sql("INSERT INTO tblstatusproc (nome, ativo) VALUES ('Suspenso', 1)")).insertId;
});
test.after(async () => pool.end());

// ------------------------------------------------------------------ sugerir número da pasta (primeiro: o banco ainda só tem a pasta 99001)
test('sugerir-pasta: próximo livre, buraco aberto por exclusão, pasta vazia reaproveitada ao cadastrar', async () => {
  assert.equal((await api().get('/api/processos/sugerir-pasta')).body.dados.proximo, 1);   // só a 99001 está ocupada: o menor livre é o 1
  const p1 = await criar({ numPasta: 1 }); const p2 = await criar({ numPasta: 2 }); const p3 = await criar({ numPasta: 3 });
  assert.equal((await api().get('/api/processos/sugerir-pasta')).body.dados.proximo, 4);
  // exclui o processo da pasta 2: o número 2 volta a ser sugerido, e a pasta continua existindo (vazia)
  assert.equal((await api().delete(`/api/processos/${p2.id}`)).status, 200);
  assert.equal((await api().get('/api/processos/sugerir-pasta')).body.dados.proximo, 2);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE id = ?', [p2.pastaId]), 1);
  // cadastrar de novo na pasta 2 reaproveita a mesma pasta (não cria outra com o mesmo número)
  const reuso = await criar({ numPasta: 2 });
  assert.equal(reuso.pastaId, p2.pastaId);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 2'), 1);
  // exclui o processo da MENOR pasta ocupada (1): o número dela também deve voltar a ser sugerido
  assert.equal((await api().delete(`/api/processos/${p1.id}`)).status, 200);
  assert.equal((await api().get('/api/processos/sugerir-pasta')).body.dados.proximo, 1, 'a pasta 1 ficou livre e deveria ser sugerida');
  await api().delete(`/api/processos/${p3.id}`); await api().delete(`/api/processos/${reuso.id}`);
});

test('pastas/checar: número inválido, pasta livre, pasta vazia e pasta em uso (com total e título)', async () => {
  for (const q of ['', 'abc', '0', '-3']) {
    const r = await api().get(`/api/processos/pastas/checar?numPasta=${q}`);
    assert.equal(r.status, 200); assert.equal(r.body.dados.emUso, false, `numPasta="${q}"`);
  }
  assert.equal((await api().get('/api/processos/pastas/checar?numPasta=8888')).body.dados.emUso, false);   // não existe
  const { id } = await criar({ numPasta: 6001, NomeTituloProc: 'PROCESSO DA PASTA EM USO' });
  const emUso = (await api().get('/api/processos/pastas/checar?numPasta=6001')).body.dados;
  assert.deepEqual(emUso, { emUso: true, totalProcessos: 1, titulo: 'PROCESSO DA PASTA EM USO' });
  await criar({ pasta_id: (await um('SELECT pasta_id FROM tblproc WHERE id = ?', [id])).pasta_id, NomeTituloProc: 'SEGUNDO DA MESMA PASTA' });
  assert.equal((await api().get('/api/processos/pastas/checar?numPasta=6001')).body.dados.totalProcessos, 2);
  assert.equal((await api().get('/api/processos/pastas/checar?numPasta=6001')).body.dados.titulo, 'SEGUNDO DA MESMA PASTA');   // o mais recente
  // pasta existente mas só com processo inativo = vazia, reaproveitável sem aviso
  await sql('UPDATE tblproc SET ativo = 0 WHERE pasta_id = (SELECT pasta_id FROM (SELECT pasta_id FROM tblproc WHERE id = ?) x)', [id]);
  assert.equal((await api().get('/api/processos/pastas/checar?numPasta=6001')).body.dados.emUso, false);
});

// ------------------------------------------------------------------ criar
test('criar: validações de campos obrigatórios e de valores inválidos (nada é gravado)', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM tblproc');
  const pastasAntes = await total('SELECT COUNT(*) AS n FROM tblpasta');
  const recusa = async (extra, regex) => {
    const r = await api().post('/api/processos').send(corpo(extra));
    assert.equal(r.status, 400, `${JSON.stringify(extra)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), regex, JSON.stringify(extra));
  };
  await recusa({ NomeTituloProc: '' }, /Título do processo é obrigatório/);
  await recusa({ NomeTituloProc: undefined }, /Título do processo é obrigatório/);
  await recusa({ autores: [] }, /ao menos um autor/);
  await recusa({ reus: [] }, /ao menos um réu/);
  await recusa({ numPasta: undefined }, /Número da pasta é obrigatório/);
  await recusa({ numPasta: 0 }, /Número da pasta é obrigatório/);
  await recusa({ numPasta: 'abc' }, /inteiro positivo/);
  await recusa({ numPasta: -5 }, /inteiro positivo/);
  await recusa({ cliente_polo: 'terceiro' }, /Polo do cliente inválido/);
  await recusa({ autores: [{ tipo_pessoa: 'fisica' }] }, /sem pessoa selecionada/);
  await recusa({ autores: [{ tipo_pessoa: 'fisica', pessoa_id: 999999 }] }, /não existe mais ou foi desativada/);
  await recusa({ reus: [{ tipo_pessoa: 'juridica', pessoa_id: 999999 }] }, /não existe mais ou foi desativada/);
  await recusa({ autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.inativa }] }, /não existe mais ou foi desativada/);
  await recusa({ peritos: [{ tipo_pessoa: 'fisica', pessoa_id: 999999 }] }, /não existe mais ou foi desativada/);
  await recusa({ oabs: [{ tipo: 'usuario' }] }, /OAB sem pessoa selecionada/);
  await recusa({ oabs: [{ tipo: 'outro', id: 1 }] }, /OAB sem pessoa selecionada/);
  await recusa({ oabs: [{ tipo: 'usuario', id: 999999 }] }, /não existe mais ou foi desativado/);
  await recusa({ oabs: [{ tipo: 'freela', id: 999999 }] }, /advogados avulsos selecionados/);
  await recusa({ responsavel_id: 999999 }, /Responsável pelo processo não encontrado ou inativo/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc'), antes);                      // nada gravado
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta'), pastasAntes);               // nem pasta nova (rollback inteiro)
});

test('criar: item que não existe mais (vara, tipo, status, instância, assunto, pasta) dá aviso claro (409), sem detalhe técnico e sem gravar', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM tblproc');
  for (const extra of [{ vara_id: 999999 }, { tipo_id: 999999 }, { status_id: 999999 }, { instancia_id: 999999 },
    { assuntos: [999999] }, { numPasta: undefined, pasta_id: 999999 }]) {
    const r = await api().post('/api/processos').send(corpo(extra));
    assert.equal(r.status, 409, `${JSON.stringify(extra)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), /não existe mais.*Recarregue a tela/, JSON.stringify(extra));
    assert.doesNotMatch(JSON.stringify(r.body), /ER_|SQLSTATE|FOREIGN KEY|constraint/i, JSON.stringify(extra));
  }
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc'), antes);
});

test('criar: grava processo, partes, peritos, assuntos e OABs numa transação; limpa espaços; registra auditoria', async () => {
  const dados = corpo({
    numProc: '  0001234-56.2026.5.15.0099  ', protocolo: '  PROT-001  ', cliente_polo: 'reu',
    vara_id: F.vara, instancia_id: F.instancia, data_distribuicao: '2026-02-10', observacoes: 'Observação do teste',
    responsavel_id: 2,
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autor }, { tipo_pessoa: 'juridica', pessoa_id: F.empresa }],
    reus: [{ tipo_pessoa: 'fisica', pessoa_id: F.reu }],
    peritos: [{ tipo_pessoa: 'fisica', pessoa_id: F.perito }],
    assuntos: [F.assunto1, F.assunto2],
    oabs: [{ tipo: 'usuario', id: 2 }, { tipo: 'freela', id: F.freela }],
  });
  const r = await api().post('/api/processos').send(dados);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.dados.id;
  const p = await um('SELECT * FROM tblproc WHERE id = ?', [id]);
  assert.equal(p.numProc, '0001234-56.2026.5.15.0099');            // sem os espaços
  assert.equal(p.protocolo, 'PROT-001');
  assert.deepEqual({ polo: p.cliente_polo, vara: p.vara_id, tipo: p.tipo_id, status: p.status_id, inst: p.instancia_id, resp: p.responsavel_id, ativo: p.ativo, obs: p.observacoes },
    { polo: 'reu', vara: F.vara, tipo: 1, status: 1, inst: F.instancia, resp: 2, ativo: 1, obs: 'Observação do teste' });
  assert.equal(String(p.data_distribuicao.toISOString?.().slice(0, 10) ?? p.data_distribuicao).slice(0, 10), '2026-02-10');
  assert.equal(p.criado_por, 1);
  const pasta = await um('SELECT numPasta FROM tblpasta WHERE id = ?', [r.body.dados.pasta_id]);
  assert.equal(pasta.numPasta, dados.numPasta);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocautor WHERE proc_id = ?', [id]), 2);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocreu WHERE proc_id = ?', [id]), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM processo_perito WHERE proc_id = ?', [id]), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM processo_assunto WHERE processo_id = ?', [id]), 2);
  const oabs = await sql('SELECT usuario_id, freela_id FROM processo_oabs WHERE processo_id = ? ORDER BY id', [id]);
  assert.deepEqual(oabs.map(o => [o.usuario_id, o.freela_id]), [[2, null], [null, F.freela]]);
  assert.equal((await auditoria(id, 'criar')).length, 1);
  // a pasta nova guarda o número pedido; o processo aparece na lista de pastas
  const lista = await api().get(`/api/processos/pastas?busca=${dados.numPasta}`);
  assert.ok(lista.body.dados.registros.some(x => Number(x.numPasta) === dados.numPasta));
});

test('criar: número de processo e protocolo não podem repetir; vazio repete à vontade; pasta existente é reaproveitada', async () => {
  const a = await criar({ numProc: '9000001-00.2026.5.15.0001', protocolo: 'PROT-UNICO' });
  const dupNum = await api().post('/api/processos').send(corpo({ numProc: ' 9000001-00.2026.5.15.0001 ' }));   // até com espaços
  assert.equal(dupNum.status, 400); assert.match(msg(dupNum), /"9000001-00.2026.5.15.0001" já está cadastrado/);
  const dupProt = await api().post('/api/processos').send(corpo({ protocolo: 'PROT-UNICO' }));
  assert.equal(dupProt.status, 400); assert.match(msg(dupProt), /protocolo "PROT-UNICO" já está cadastrado/);
  // sem número/protocolo (vazio ou só espaços) não conta como duplicado
  const v1 = await criar({ numProc: '', protocolo: '   ' }); const v2 = await criar({ numProc: undefined, protocolo: undefined });
  const vazios = await sql('SELECT numProc, protocolo FROM tblproc WHERE id IN (?, ?)', [v1.id, v2.id]);
  assert.deepEqual(vazios.map(x => [x.numProc, x.protocolo]), [[null, null], [null, null]]);
  // número de um processo INATIVO pode ser usado de novo
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [a.id]);
  await criar({ numProc: '9000001-00.2026.5.15.0001' });
  // mesma pasta (carta precatória, recurso): reaproveita pelo número e também pelo id
  const base = await criar({ numPasta: 6100 });
  const semConfirmar = await api().post('/api/processos').send(corpo({ numPasta: 6100 }));    // pasta com processo ativo: exige confirmação
  assert.equal(semConfirmar.status, 409); assert.match(msg(semConfirmar), /pasta nº 6100 já está em uso\. Escolha outro número/);
  const mesmaPorNumero = await criar({ numPasta: 6100, pasta_existente_confirmada: true });
  assert.equal(mesmaPorNumero.pastaId, base.pastaId);
  const mesmaPorId = await criar({ numPasta: undefined, pasta_id: base.pastaId });
  assert.equal(mesmaPorId.pastaId, base.pastaId);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 6100'), 1);
});

// ------------------------------------------------------------------ editar
test('editar: troca campos, substitui partes/assuntos/OABs, preserva o que não vier e registra a auditoria', async () => {
  const { id } = await criar({ assuntos: [F.assunto1], oabs: [{ tipo: 'usuario', id: 2 }], peritos: [{ tipo_pessoa: 'fisica', pessoa_id: F.perito }] });
  const r = await api().put(`/api/processos/${id}`).send({
    numProc: '7000001-00.2026.5.15.0007', protocolo: 'PROT-EDIT', NomeTituloProc: 'TÍTULO EDITADO', cliente_polo: 'reu',
    vara_id: F.vara, tipo_id: 1, status_id: 1, instancia_id: F.instancia, data_distribuicao: '2026-03-01', observacoes: 'editado',
    responsavel_id: 2,
    autores: [{ tipo_pessoa: 'juridica', pessoa_id: F.empresa }], reus: [{ tipo_pessoa: 'fisica', pessoa_id: F.perito }],
    assuntos: [F.assunto2], oabs: [{ tipo: 'freela', id: F.freela }], peritos: [],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = await um('SELECT * FROM tblproc WHERE id = ?', [id]);
  assert.deepEqual({ n: p.numProc, prot: p.protocolo, t: p.NomeTituloProc, polo: p.cliente_polo, vara: p.vara_id, inst: p.instancia_id, resp: p.responsavel_id, alt: p.alterado_por },
    { n: '7000001-00.2026.5.15.0007', prot: 'PROT-EDIT', t: 'TÍTULO EDITADO', polo: 'reu', vara: F.vara, inst: F.instancia, resp: 2, alt: 1 });
  assert.deepEqual((await sql('SELECT tipo_pessoa, pessoa_id FROM tbltituloprocautor WHERE proc_id = ?', [id])).map(x => [x.tipo_pessoa, x.pessoa_id]), [['juridica', F.empresa]]);
  assert.deepEqual((await sql('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [id])).map(x => x.pessoa_id), [F.perito]);
  assert.deepEqual((await sql('SELECT assunto_id FROM processo_assunto WHERE processo_id = ?', [id])).map(x => x.assunto_id), [F.assunto2]);
  assert.deepEqual((await sql('SELECT usuario_id, freela_id FROM processo_oabs WHERE processo_id = ?', [id])).map(x => [x.usuario_id, x.freela_id]), [[null, F.freela]]);
  assert.equal(await total('SELECT COUNT(*) AS n FROM processo_perito WHERE proc_id = ?', [id]), 0);   // [] limpa os peritos
  assert.equal((await auditoria(id, 'editar')).length, 1);
  // sem enviar as listas, elas ficam como estavam (só os campos simples mudam)
  const r2 = await api().put(`/api/processos/${id}`).send({ NomeTituloProc: 'SÓ O TÍTULO', numProc: '7000001-00.2026.5.15.0007' });
  assert.equal(r2.status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocautor WHERE proc_id = ?', [id]), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM processo_assunto WHERE processo_id = ?', [id]), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM processo_oabs WHERE processo_id = ?', [id]), 1);
  assert.equal((await um('SELECT cliente_polo FROM tblproc WHERE id = ?', [id])).cliente_polo, 'reu');   // polo não enviado = preserva
  assert.equal((await um('SELECT NomeTituloProc FROM tblproc WHERE id = ?', [id])).NomeTituloProc, 'SÓ O TÍTULO');
  // título vazio mantém o atual
  await api().put(`/api/processos/${id}`).send({ NomeTituloProc: '' });
  assert.equal((await um('SELECT NomeTituloProc FROM tblproc WHERE id = ?', [id])).NomeTituloProc, 'SÓ O TÍTULO');
});

test('editar: validações (404, listas vazias, polo, duplicados de outro processo, responsável, pessoas) e rollback total', async () => {
  const a = await criar({ numProc: '7100001-00.2026.5.15.0001', protocolo: 'PROT-A' });
  const b = await criar({ numProc: '7100002-00.2026.5.15.0002', protocolo: 'PROT-B', NomeTituloProc: 'TÍTULO ORIGINAL DE B' });
  const put = (id, c) => api().put(`/api/processos/${id}`).send(c);
  assert.equal((await put(999999, { NomeTituloProc: 'x' })).status, 404);
  assert.equal((await put(b.id, { autores: [] })).status, 400);
  assert.equal((await put(b.id, { reus: [] })).status, 400);
  assert.match(msg(await put(b.id, { cliente_polo: 'x' })), /Polo do cliente inválido/);
  const dupNum = await put(b.id, { numProc: '7100001-00.2026.5.15.0001' });
  assert.equal(dupNum.status, 400); assert.match(msg(dupNum), /já está cadastrado em outro processo/);
  const dupProt = await put(b.id, { numProc: '7100002-00.2026.5.15.0002', protocolo: 'PROT-A' });
  assert.equal(dupProt.status, 400); assert.match(msg(dupProt), /já está cadastrado em outro processo/);
  assert.equal((await put(b.id, { numProc: '7100002-00.2026.5.15.0002', protocolo: 'PROT-B' })).status, 200);   // o próprio número não conta
  assert.match(msg(await put(b.id, { responsavel_id: 999999 })), /Responsável pelo processo não encontrado/);
  // processo inativo não é editável
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [a.id]);
  assert.equal((await put(a.id, { NomeTituloProc: 'x' })).status, 404);
  // falha na validação das pessoas DEPOIS do UPDATE: nada pode ter mudado (rollback)
  const falha = await put(b.id, { NomeTituloProc: 'NÃO PODE GRAVAR', numProc: '7100002-00.2026.5.15.0002', autores: [{ tipo_pessoa: 'fisica', pessoa_id: 999999 }] });
  assert.equal(falha.status, 400);
  assert.equal((await um('SELECT NomeTituloProc FROM tblproc WHERE id = ?', [b.id])).NomeTituloProc, 'TÍTULO ORIGINAL DE B');
  assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocautor WHERE proc_id = ?', [b.id]), 1);
  const falhaOab = await put(b.id, { oabs: [{ tipo: 'usuario', id: 999999 }] });
  assert.equal(falhaOab.status, 400);
  // valores que o banco recusa viram erro de cliente, sem detalhe técnico
  for (const extra of [{ vara_id: 999999 }, { tipo_id: 999999 }, { status_id: 999999 }, { instancia_id: 999999 }, { assuntos: [999999] }]) {
    const fk = await put(b.id, { numProc: '7100002-00.2026.5.15.0002', ...extra });
    assert.equal(fk.status, 409, `${JSON.stringify(extra)} → ${fk.status}`);
    assert.match(msg(fk), /não existe mais.*Recarregue a tela/);
    assert.doesNotMatch(JSON.stringify(fk.body), /ER_|SQLSTATE|FOREIGN KEY|constraint/i);
  }
  assert.equal((await um('SELECT NomeTituloProc FROM tblproc WHERE id = ?', [b.id])).NomeTituloProc, 'TÍTULO ORIGINAL DE B');   // nada mudou
});

test('editar: número do processo é gravado SEM espaços nas pontas (igual à criação e à checagem de duplicado)', async () => {
  const { id } = await criar();
  const r = await api().put(`/api/processos/${id}`).send({ numProc: '  7200001-00.2026.5.15.0001  ', protocolo: '  PROT-ESP  ', NomeTituloProc: 'X' });
  assert.equal(r.status, 200);
  const p = await um('SELECT numProc, protocolo FROM tblproc WHERE id = ?', [id]);
  assert.deepEqual([p.numProc, p.protocolo], ['7200001-00.2026.5.15.0001', 'PROT-ESP']);
});

test('editar: mudança de status registra anterior, novo e motivo; sem mudança não registra; troca de status não deixa histórico solto', async () => {
  const { id } = await criar();
  const base = { NomeTituloProc: 'X', numProc: (await um('SELECT numProc FROM tblproc WHERE id = ?', [id])).numProc, tipo_id: 1 };
  assert.equal((await api().put(`/api/processos/${id}`).send({ ...base, status_id: 1 })).status, 200);
  assert.equal((await auditoria(id, 'status')).length, 0);                                  // mesmo status: nada
  assert.equal((await api().put(`/api/processos/${id}`).send({ ...base, status_id: F.status2, motivo_status: '  Aguardando documentos  ' })).status, 200);
  const logs = await auditoria(id, 'status');
  assert.equal(logs.length, 1);
  const d = typeof logs[0].dados_novos === 'string' ? JSON.parse(logs[0].dados_novos) : logs[0].dados_novos;
  assert.deepEqual({ ant: d.status_anterior, novo: d.status_novo, motivo: d.motivo, a: d.status_anterior_id, n: d.status_novo_id },
    { ant: 'Ativo', novo: 'Suspenso', motivo: 'Aguardando documentos', a: 1, n: F.status2 });
  assert.equal((await api().put(`/api/processos/${id}`).send({ ...base, status_id: null })).status, 200);    // tirar o status também é mudança
  const ultimo = (await auditoria(id, 'status')).length;
  assert.equal(ultimo, 2);
  // o Histórico do processo devolve de/para e motivo nas linhas de status (objeto, não texto) e nada disso nas outras ações
  const hist = (await api().get(`/api/processos/${id}/historico`)).body.dados;
  const linhasStatus = hist.filter(h => h.acao === 'status');
  assert.equal(linhasStatus.length, 2);
  const comMotivo = linhasStatus.find(h => h.dados_novos.motivo);
  assert.deepEqual({ ant: comMotivo.dados_novos.status_anterior, novo: comMotivo.dados_novos.status_novo, motivo: comMotivo.dados_novos.motivo }, { ant: 'Ativo', novo: 'Suspenso', motivo: 'Aguardando documentos' });
  assert.ok(hist.filter(h => h.acao !== 'status').every(h => h.dados_novos === null));
});

// ------------------------------------------------------------------ excluir
test('excluir: casca vazia sai com os vínculos, as pessoas e a pasta continuam, e fica a auditoria com o número', async () => {
  const { id, pastaId } = await criar({
    numProc: '8000001-00.2026.5.15.0001', assuntos: [F.assunto1], oabs: [{ tipo: 'usuario', id: 2 }],
    peritos: [{ tipo_pessoa: 'fisica', pessoa_id: F.perito }],
  });
  await sql("INSERT INTO processos_etiquetas_escritorio (processo_id, slot) VALUES (?, 1)", [id]).catch(() => {});
  const r = await api().delete(`/api/processos/${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE id = ?', [id]), 0);
  for (const [tabela, coluna] of [['tbltituloprocautor', 'proc_id'], ['tbltituloprocreu', 'proc_id'], ['processo_perito', 'proc_id'],
    ['processo_assunto', 'processo_id'], ['processo_oabs', 'processo_id'], ['processos_etiquetas_escritorio', 'processo_id']]) {
    assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${coluna} = ?`, [id]), 0, `órfão em ${tabela}`);
  }
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id IN (?, ?, ?)', [F.autor, F.reu, F.perito]), 3);   // pessoas intactas
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblpasta WHERE id = ?', [pastaId]), 1);                                   // pasta fica (vazia)
  assert.equal(await total('SELECT COUNT(*) AS n FROM tblassuntoproc WHERE id = ?', [F.assunto1]), 1);                         // auxiliares intactos
  const log = (await auditoria(id, 'excluir'))[0];
  const antigos = typeof log.dados_antigos === 'string' ? JSON.parse(log.dados_antigos) : log.dados_antigos;
  assert.equal(antigos.numProc, '8000001-00.2026.5.15.0001');
  assert.equal((await api().delete(`/api/processos/${id}`)).status, 404);                                                       // excluir de novo
  assert.equal((await api().delete('/api/processos/999999')).status, 404);
});

test('excluir: qualquer trabalho ou dinheiro ligado ao processo BLOQUEIA a exclusão (8 casos) e nada é apagado', async () => {
  const casos = [
    ['andamento_processual', "INSERT INTO andamento_processual (processo_id, data, descricao, criado_por) VALUES (?, '2026-01-05', 'andamento', 1)", /andamento\(s\) processual/],
    ['audiencia', "INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, criado_por) VALUES (?, 1, '2026-01-05', '10:00:00', 1)", /audiência\(s\)/],
    ['pericia', 'INSERT INTO pericia (processo_id, criado_por) VALUES (?, 1)', /perícia\(s\)/],
    ['prazos_processo', "INSERT INTO prazos_processo (processo_id, data_inicio, data_vencimento, criado_por) VALUES (?, '2026-01-05', '2026-01-09', 1)", /prazo\(s\)/],
    ['tarefas', "INSERT INTO tarefas (titulo, processo_id, criado_por) VALUES ('tarefa', ?, 1)", /tarefa\(s\)/],
    ['acordo', "INSERT INTO acordo (processo_id, valor_total, qtd_parcelas, data_primeira) VALUES (?, 100, 1, '2026-01-05')", /acordo\(s\)\/alvará\(s\)/],
    ['conta_corrente', "INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, usuario_id) VALUES (?, '2026-01-05', 'lançamento', 'entrada', 10, 1)", /lançamento\(s\) na conta corrente/],
    ['log_comunicacoes', "INSERT INTO log_comunicacoes (processo_id, destinatario) VALUES (?, 'alguem@example.invalid')", /comunicação\(ões\)/],
  ];
  for (const [tabela, insert, regex] of casos) {
    const { id } = await criar({ assuntos: [F.assunto1], oabs: [{ tipo: 'usuario', id: 2 }] });
    await sql(insert, [id]);
    const r = await api().delete(`/api/processos/${id}`);
    assert.equal(r.status, 400, `${tabela}: ${JSON.stringify(r.body)}`);
    assert.match(msg(r), regex, tabela);
    assert.match(msg(r), /Não é possível excluir este processo/);
    assert.equal(await total('SELECT COUNT(*) AS n FROM tblproc WHERE id = ?', [id]), 1, `${tabela}: o processo foi apagado`);
    assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocautor WHERE proc_id = ?', [id]), 1, `${tabela}: vínculo apagado`);
    assert.equal(await total('SELECT COUNT(*) AS n FROM processo_oabs WHERE processo_id = ?', [id]), 1, `${tabela}: OAB apagada`);
    assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE processo_id = ?`, [id]), 1, `${tabela}: o registro ligado sumiu`);
    assert.equal((await auditoria(id, 'excluir')).length, 0);
  }
  // vários bloqueios juntos aparecem todos na mesma mensagem
  const { id } = await criar();
  await sql(casos[2][1], [id]); await sql(casos[4][1], [id]);
  const r = await api().delete(`/api/processos/${id}`);
  assert.match(msg(r), /perícia\(s\)/); assert.match(msg(r), /tarefa\(s\)/);
});

// ------------------------------------------------------------------ histórico
test('histórico: lista criar, editar e mudança de status, do mais novo ao mais antigo, com o nome de quem fez', async () => {
  const { id } = await criar();
  await api().put(`/api/processos/${id}`).send({ NomeTituloProc: 'Y', numProc: (await um('SELECT numProc FROM tblproc WHERE id = ?', [id])).numProc, status_id: F.status2, motivo_status: 'teste' });
  const r = await api().get(`/api/processos/${id}/historico`);
  assert.equal(r.status, 200);
  const acoes = r.body.dados.map(x => x.acao);
  assert.deepEqual([...acoes].sort(), ['criar', 'editar', 'status']);
  assert.ok(r.body.dados.every(x => x.usuario_nome === 'Administrador de Testes' && x.criado_em));
  const datas = r.body.dados.map(x => new Date(x.criado_em).getTime());
  assert.deepEqual(datas, [...datas].sort((a, b) => b - a));                                    // mais novo primeiro
  // quem fez foi removido: aparece "Usuário removido" e o histórico continua
  await sql("UPDATE logs_auditoria SET usuario_id = NULL WHERE tabela = 'tblproc' AND registro_id = ?", [id]);
  assert.ok((await api().get(`/api/processos/${id}/historico`)).body.dados.every(x => x.usuario_nome === 'Usuário removido'));
  // processo sem histórico / inexistente: lista vazia, sem erro
  assert.deepEqual((await api().get('/api/processos/999999/historico')).body.dados, []);
});

// ------------------------------------------------------------------ buscas
test('buscar (autocomplete): mínimo de 2 letras, por número e por título, só ativos, no máximo 10, curingas não casam tudo', async () => {
  const marca = `ZXQ${Date.now() % 100000}`;
  const ids = [];
  for (let i = 0; i < 12; i++) ids.push((await criar({ NomeTituloProc: `${marca} CAUSA ${String(i).padStart(2, '0')}`, numProc: `${marca}-${String(i).padStart(2, '0')}` })).id);
  assert.deepEqual((await api().get('/api/processos/buscar')).body.dados, []);
  assert.deepEqual((await api().get('/api/processos/buscar?q=Z')).body.dados, []);                       // 1 letra: nada
  const r = await api().get(`/api/processos/buscar?q=${marca}`);
  assert.equal(r.body.dados.length, 10);                                                                   // limite
  assert.deepEqual(r.body.dados.map(x => x.numProc), [...r.body.dados.map(x => x.numProc)].sort());       // ordenado por número
  assert.ok(r.body.dados.every(x => x.id && x.numPasta && 'vara_id' in x));
  assert.equal((await api().get(`/api/processos/buscar?q=${marca}-03`)).body.dados.length, 1);            // por número
  assert.equal((await api().get(`/api/processos/buscar?q=${encodeURIComponent(`${marca} causa 07`)}`)).body.dados.length, 1);   // por título, sem diferenciar maiúscula
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [ids[3]]);
  assert.equal((await api().get(`/api/processos/buscar?q=${marca}-03`)).body.dados.length, 0);             // inativo some
  // "%%" ou "__" não pode virar "traga todos": o texto é procurado como está
  assert.equal((await api().get('/api/processos/buscar?q=%25%25')).body.dados.length, 0, 'curinga % casou tudo');
  assert.equal((await api().get(`/api/processos/buscar?q=${marca}_00`)).body.dados.length, 0, 'curinga _ casou qualquer caractere');
});

test('basico: devolve o processo ativo com o número da pasta; 404 para inativo, inexistente e id inválido', async () => {
  const { id } = await criar({ vara_id: F.vara });
  const r = await api().get(`/api/processos/${id}/basico`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.dados).sort(), ['NomeTituloProc', 'id', 'numPasta', 'numProc', 'vara_id']);
  assert.equal(r.body.dados.vara_id, F.vara);
  await sql('UPDATE tblproc SET ativo = 0 WHERE id = ?', [id]);
  assert.equal((await api().get(`/api/processos/${id}/basico`)).status, 404);
  assert.equal((await api().get('/api/processos/999999/basico')).status, 404);
  assert.equal((await api().get('/api/processos/abc/basico')).status, 404);
});

test('auxiliares: devolve fóruns, varas (com o fórum), tipos, status, instâncias, usuários, assuntos e advogados avulsos; só ativos', async () => {
  const r = await api().get('/api/processos/auxiliares');
  assert.equal(r.status, 200);
  const d = r.body.dados;
  assert.deepEqual(Object.keys(d).sort(), ['advogado_principal_id', 'advogados_freela', 'assuntos', 'foruns', 'instancias', 'status', 'tipos', 'usuarios', 'varas']);
  const vara = d.varas.find(v => v.id === F.vara);
  assert.equal(vara.forum_nome, 'Fórum do Teste');
  assert.ok(d.tipos.some(t => t.nome === 'Judicial') && d.status.some(s => s.nome === 'Suspenso'));
  assert.ok(d.assuntos.some(a => a.id === F.assunto1) && d.instancias.some(i => i.id === F.instancia));
  assert.ok(d.advogados_freela.some(a => a.id === F.freela));
  assert.ok(d.usuarios.every(u => 'id' in u && 'nome' in u && !('senha_hash' in u)));              // nunca expõe senha
  assert.equal(d.advogado_principal_id, null);
  await sql('UPDATE tblassuntoproc SET ativo = 0 WHERE id = ?', [F.assunto2]);
  assert.ok(!(await api().get('/api/processos/auxiliares')).body.dados.assuntos.some(a => a.id === F.assunto2));    // inativo some
  await sql('UPDATE tblassuntoproc SET ativo = 1 WHERE id = ?', [F.assunto2]);
});
