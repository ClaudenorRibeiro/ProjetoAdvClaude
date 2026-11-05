// VIGILÂNCIA DO PROCESSO (pedido do usuário, 05/11/2026; porte do NovoJud-saas): lembrete sem data que fica de olho num
// processo (ex.: "Recurso adesivo"). Contra MySQL real isolado: tipos, criar/listar/editar/encerrar, a pergunta ao
// cadastrar prazo (409 PERGUNTAR_VIGILANCIAS / encerrar_vigilancias), trava de arquivamento e de exclusão, e o aviso
// de possível recurso por publicação/andamento do DataJud.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { aplicarRespostaDoProcesso } = require('../../src/andamentosDatajud/aplicar');

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

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = emitir(1, 1, 'sessao-admin');
  const pasta = (await sql("INSERT INTO tblpasta (numPasta, criado_por) VALUES (6401, 1)")).insertId;
  F.proc = (await sql(
    "INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '0000401-00.2026.5.15.0001', 'PROCESSO DA VIGILANCIA', 1, 1, 1, 1)",
    [pasta]
  )).insertId;
  F.pastaId = pasta;
});
test.after(async () => pool.end());

test('tipos de vigilância: lista aberta já traz "Recurso adesivo"; criar/editar/excluir exigem a permissão certa; em uso não exclui', async () => {
  const r1 = await api().get('/api/vigilancias/tipos');
  assert.equal(r1.status, 200);
  assert.ok(r1.body.dados.some(t => t.nome === 'Recurso adesivo'));

  const r2 = await api().post('/api/vigilancias/tipos').send({ nome: 'Embargos de declaração' });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  const tipoId = r2.body.dados.id;

  const r3 = await api().put(`/api/vigilancias/tipos/${tipoId}`).send({ nome: 'Embargos (editado)' });
  assert.equal(r3.status, 200, JSON.stringify(r3.body));

  // nome repetido = 409
  const r4 = await api().post('/api/vigilancias/tipos').send({ nome: 'Embargos (editado)' });
  assert.equal(r4.status, 409);

  // cria vigilância usando o tipo, depois a exclusão é bloqueada
  const criada = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipoId, usuarios: [1] });
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  const r5 = await api().delete(`/api/vigilancias/tipos/${tipoId}`);
  assert.equal(r5.status, 409);
  await sql('DELETE FROM vigilancia WHERE id = ?', [criada.body.dados.id]);

  // id que não existe/não é número = 404
  const r6 = await api().put('/api/vigilancias/tipos/abc').send({ nome: 'x' });
  assert.equal(r6.status, 404);
  const r7 = await api().delete('/api/vigilancias/tipos/999999');
  assert.equal(r7.status, 404);
});

test('criar vigilância: exige processo e tipo existentes, usuários ativos; não repete tipo no mesmo processo enquanto aguardando', async () => {
  const r1 = await api().post('/api/vigilancias').send({ processo_id: 999999, tipo_id: 1, usuarios: [1] });
  assert.equal(r1.status, 404);
  const r2 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 999999, usuarios: [1] });
  assert.equal(r2.status, 404);
  const r3 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, usuarios: [999999] });
  assert.equal(r3.status, 400);
  const r4 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, usuarios: [] });
  assert.equal(r4.status, 400);

  const ok1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, observacao: 'Sentença de improcedência', usuarios: [1, 2] });
  assert.equal(ok1.status, 201, JSON.stringify(ok1.body));
  F.vigilanciaId = ok1.body.dados.id;

  // mesmo tipo, mesmo processo, ainda aguardando = 409
  const rep = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, usuarios: [1] });
  assert.equal(rep.status, 409);
});

test('listar por pasta: traz a vigilância com os usuários avisados; "todas" também mostra as encerradas', async () => {
  const r1 = await api().get(`/api/vigilancias?pasta_id=${F.pastaId}`);
  assert.equal(r1.status, 200);
  const v = r1.body.dados.find(x => x.id === F.vigilanciaId);
  assert.ok(v, 'vigilância não apareceu na lista da pasta');
  assert.equal(v.situacao, 'aguardando');
  assert.equal(v.apenso, false);
  assert.deepEqual(v.usuarios.map(u => u.id).sort(), [1, 2]);

  const semPasta = await api().get('/api/vigilancias');
  assert.equal(semPasta.status, 400);
});

test('editar: observação e avisados, só enquanto aguardando', async () => {
  const r1 = await api().put(`/api/vigilancias/${F.vigilanciaId}`).send({ observacao: 'Observação nova', usuarios: [2] });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const [linha] = await sql('SELECT observacao FROM vigilancia WHERE id = ?', [F.vigilanciaId]);
  assert.equal(linha.observacao, 'Observação nova');
  const [avisados] = [await sql('SELECT usuario_id FROM vigilancia_usuario WHERE vigilancia_id = ?', [F.vigilanciaId])];
  assert.deepEqual(avisados.map(a => a.usuario_id), [2]);
});

test('arquivar/excluir o processo é bloqueado com a vigilância aguardando; encerrar manualmente libera os dois', async () => {
  const statusAtivo    = (await sql("SELECT id FROM tblstatusproc WHERE nome = 'Ativo' LIMIT 1"))[0].id;
  const statusArquivado = (await sql("INSERT INTO tblstatusproc (nome, encerra_processo, ativo, criado_por) VALUES ('Arquivado (teste vigilância)', 1, 1, 1)")).insertId;

  const bloqArquivar = await api().put(`/api/processos/${F.proc}`).send({ NomeTituloProc: 'PROCESSO DA VIGILANCIA', numProc: '0000401-00.2026.5.15.0001', tipo_id: 1, status_id: statusArquivado, cliente_polo: 'autor' });
  assert.equal(bloqArquivar.status, 422, JSON.stringify(bloqArquivar.body));
  assert.match(bloqArquivar.body.mensagem, /vigilância/);

  const bloqExcluir = await api().delete(`/api/processos/${F.proc}`);
  assert.equal(bloqExcluir.status, 400, JSON.stringify(bloqExcluir.body));
  assert.match(bloqExcluir.body.mensagem, /vigilância/);

  const r1 = await api().put(`/api/vigilancias/${F.vigilanciaId}`).send({});
  assert.equal(r1.status, 200);
  const enc = await api().put(`/api/vigilancias/${F.vigilanciaId}/encerrar`).send({ motivo: 'Trânsito em julgado sem recurso' });
  assert.equal(enc.status, 200, JSON.stringify(enc.body));
  const [linha] = await sql('SELECT situacao, motivo_encerramento FROM vigilancia WHERE id = ?', [F.vigilanciaId]);
  assert.equal(linha.situacao, 'encerrada');
  assert.equal(linha.motivo_encerramento, 'Trânsito em julgado sem recurso');

  // encerrar de novo = 409 (já encerrada)
  const enc2 = await api().put(`/api/vigilancias/${F.vigilanciaId}/encerrar`).send({ motivo: 'de novo' });
  assert.equal(enc2.status, 409);
  // editar encerrada = 409
  const ed2 = await api().put(`/api/vigilancias/${F.vigilanciaId}`).send({ observacao: 'não pode' });
  assert.equal(ed2.status, 409);

  // agora arquivar passa
  const podeArquivar = await api().put(`/api/processos/${F.proc}`).send({ NomeTituloProc: 'PROCESSO DA VIGILANCIA', numProc: '0000401-00.2026.5.15.0001', tipo_id: 1, status_id: statusArquivado, cliente_polo: 'autor' });
  assert.equal(podeArquivar.status, 200, JSON.stringify(podeArquivar.body));
  await api().put(`/api/processos/${F.proc}`).send({ NomeTituloProc: 'PROCESSO DA VIGILANCIA', numProc: '0000401-00.2026.5.15.0001', tipo_id: 1, status_id: statusAtivo, cliente_polo: 'autor' }); // volta ao normal p/ os testes seguintes
});

test('cadastrar prazo no processo com vigilância aguardando pergunta antes; "Sim" encerra, "Não"/vazio mantém', async () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  const dataFinal = d.toISOString().slice(0, 10);
  const tipo = (await sql("SELECT id FROM vigilancia_tipo WHERE nome = 'Recurso adesivo'"))[0].id;

  const v1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo, usuarios: [1] });
  assert.equal(v1.status, 201);
  const vigId = v1.body.dados.id;

  // sem resposta = pergunta (409) e NADA é gravado
  const semResposta = await api().post('/api/prazos').send({ processo_id: F.proc, data_inicio: new Date().toISOString().slice(0, 10), data_final: dataFinal });
  assert.equal(semResposta.status, 409, JSON.stringify(semResposta.body));
  assert.equal(semResposta.body.detalhes.codigo, 'PERGUNTAR_VIGILANCIAS');
  assert.equal(semResposta.body.detalhes.vigilancias.length, 1);
  assert.equal(semResposta.body.detalhes.vigilancias[0].id, vigId);
  const [semGravar] = await sql('SELECT COUNT(*) AS n FROM prazos_processo WHERE processo_id = ?', [F.proc]);
  assert.equal(semGravar.n, 0);

  // responde "Não" (lista vazia): o prazo é criado e a vigilância continua aguardando
  const naoEncerra = await api().post('/api/prazos').send({
    processo_id: F.proc, data_inicio: new Date().toISOString().slice(0, 10), data_final: dataFinal, encerrar_vigilancias: [],
  });
  assert.equal(naoEncerra.status, 201, JSON.stringify(naoEncerra.body));
  const [aindaAguardando] = await sql('SELECT situacao FROM vigilancia WHERE id = ?', [vigId]);
  assert.equal(aindaAguardando.situacao, 'aguardando');

  // responde "Sim": o segundo prazo encerra a vigilância, dentro da mesma gravação
  const encerra = await api().post('/api/prazos').send({
    processo_id: F.proc, data_inicio: new Date().toISOString().slice(0, 10), data_final: dataFinal, encerrar_vigilancias: [vigId],
  });
  assert.equal(encerra.status, 201, JSON.stringify(encerra.body));
  const [encerrada] = await sql('SELECT situacao, motivo_encerramento FROM vigilancia WHERE id = ?', [vigId]);
  assert.equal(encerrada.situacao, 'encerrada');
  assert.match(encerrada.motivo_encerramento, /prazo/);

  // vigilância escolhida que não está mais aguardando = 409
  const jaNao = await api().post('/api/prazos').send({
    processo_id: F.proc, data_inicio: new Date().toISOString().slice(0, 10), data_final: dataFinal, encerrar_vigilancias: [vigId],
  });
  assert.equal(jaNao.status, 201, JSON.stringify(jaNao.body)); // já não há vigilância aguardando: cria normal, sem perguntar
});

test('aviso de possível recurso: publicação importada e andamento novo do DataJud, num processo vigiado, avisam no sino (texto com "cabe recurso" sozinho não avisa)', async () => {
  const tipo = (await sql("SELECT id FROM vigilancia_tipo WHERE nome = 'Recurso adesivo'"))[0].id;
  const criada = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo, usuarios: [2] });
  assert.equal(criada.status, 201);
  const vigId = criada.body.dados.id;

  const [antes] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  const { avisarPublicacoes, avisarAndamentos } = require('../../src/utils/vigilanciasAvisos');

  const numero = (await sql('SELECT numProc FROM tblproc WHERE id = ?', [F.proc]))[0].numProc;

  // sentença (só "cabe recurso", frase ignorada) não avisa
  await avisarPublicacoes([{ numero_processo: numero, texto: 'Sentença de improcedência. Desta decisão cabe recurso no prazo legal.' }]);
  const [depoisSentenca] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisSentenca.n, antes.n);

  // recurso de verdade avisa
  await avisarPublicacoes([{ numero_processo: numero, texto: 'Foi interposto recurso de apelação pela parte ré.' }]);
  const [depoisRecurso] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisRecurso.n, antes.n + 1);

  // andamento novo do DataJud com a mesma palavra também avisa
  await avisarAndamentos(F.proc, ['Juntada de apelação pela parte contrária.']);
  const [depoisAndamento] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisAndamento.n, antes.n + 2);

  // encerrada não é mais avisada
  await sql("UPDATE vigilancia SET situacao = 'encerrada' WHERE id = ?", [vigId]);
  await avisarAndamentos(F.proc, ['Interposto recurso de apelação de novo.']);
  const [depoisEncerrada] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisEncerrada.n, antes.n + 2);
});

test('andamento novo do DataJud que parece recurso avisa também pelo caminho real (aplicarRespostaDoProcesso)', async () => {
  const tipo = (await sql("SELECT id FROM vigilancia_tipo WHERE nome = 'Recurso adesivo'"))[0].id;
  const criada = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo, usuarios: [2] });
  assert.equal(criada.status, 201);

  // primeira leitura: só base, sem aviso (mesmo contendo a palavra)
  const [antesBase] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  await aplicarRespostaDoProcesso(F.proc, {
    movimentos: [{ nome: 'Juntada de recurso', codigo: 123, dataHora: new Date().toISOString() }],
    atualizado: '2026-01-01T10:00:00',
  }, '2026-01-02');
  const [depoisBase] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisBase.n, antesBase.n, 'a primeira leitura é só base, não deve avisar');

  // segunda leitura com movimento NOVO que parece recurso: avisa
  await aplicarRespostaDoProcesso(F.proc, {
    movimentos: [
      { nome: 'Juntada de recurso', codigo: 123, dataHora: new Date().toISOString() },
      { nome: 'Recebo a apelação', codigo: 456, dataHora: new Date().toISOString() },
    ],
    atualizado: '2026-01-03T10:00:00',
  }, '2026-01-03');
  const [depoisNovidade] = await sql("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = 2 AND mensagem LIKE '%Possível recurso%'");
  assert.equal(depoisNovidade.n, antesBase.n + 1);
});

test('permissões: cadastrar/alterar/excluir tipos e vigilâncias exigem a permissão certa; sem login é 401', async () => {
  const sessaoSemPermissao = emitir(3, 2, 'sessao-sem-permissao');
  const semToken = await request(app).get('/api/vigilancias?pasta_id=1');
  assert.equal(semToken.status, 401);

  const r1 = await api(sessaoSemPermissao).post('/api/vigilancias/tipos').send({ nome: 'Novo tipo sem permissão' });
  assert.equal(r1.status, 403);
  const r2 = await api(sessaoSemPermissao).get('/api/vigilancias?pasta_id=1');
  assert.equal(r2.status, 403);
  const r3 = await api(sessaoSemPermissao).post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, usuarios: [1] });
  assert.equal(r3.status, 403);

  // "usuteste" (id 2) tem todas as permissões de vigilancias (seed de teste) e de tipos
  const comPermissao = emitir(2, 2, 'sessao-usuario');
  const ok = await api(comPermissao).get(`/api/vigilancias?pasta_id=${F.pastaId}`);
  assert.equal(ok.status, 200);
});
