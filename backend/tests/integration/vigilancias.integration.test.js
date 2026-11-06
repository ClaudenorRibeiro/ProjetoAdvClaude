// VIGILÂNCIA DO PROCESSO (pedido do usuário, 05/11/2026; porte do NovoJud-saas; redesenhada em 06/11/2026): lembrete
// sem data que fica de olho num processo (ex.: "Recurso adesivo"). Contra MySQL real isolado: tipos,
// criar/listar/editar/encerrar (sem "quem deve ser avisado" — removido), a pergunta ao cadastrar prazo OU tarefa
// (409 PERGUNTAR_VIGILANCIAS / encerrar_vigilancias), trava de arquivamento e de exclusão, e o 👁/aviso nas
// Publicações para quem tem a permissão de ver Vigilâncias.
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
  // Usuário 3 ("sem permissão") ganha, só para o teste de Publicações, as permissões de buscador de
  // Publicações (vê todas, não só as atribuídas) — mas de propósito NÃO ganha "vigilancias/visualizar".
  await sql(
    `INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES
      (3, 'publicacoes', NULL, 'visualizar', 1), (3, 'publicacoes', NULL, 'cadastrar', 1)`
  );
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
  const criada = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipoId });
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

test('criar vigilância: exige processo e tipo existentes; não repete tipo no mesmo processo enquanto aguardando; não pede nem grava usuários', async () => {
  const r1 = await api().post('/api/vigilancias').send({ processo_id: 999999, tipo_id: 1 });
  assert.equal(r1.status, 404);
  const r2 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 999999 });
  assert.equal(r2.status, 404);

  const ok1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1, observacao: 'Sentença de improcedência', usuarios: [1, 2] });
  assert.equal(ok1.status, 201, JSON.stringify(ok1.body));
  F.vigilanciaId = ok1.body.dados.id;
  // "usuarios" mandado pela tela antiga (ou por engano) é só ignorado: não cria vínculo nenhum.
  const [vinculo] = await sql("SHOW TABLES LIKE 'vigilancia_usuario'");
  assert.equal(vinculo, undefined, 'a tabela vigilancia_usuario não deveria mais existir no banco de teste');

  // mesmo tipo, mesmo processo, ainda aguardando = 409
  const rep = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1 });
  assert.equal(rep.status, 409);
});

test('listar por pasta: traz a vigilância (sem usuários); "todas" também mostra as encerradas', async () => {
  const r1 = await api().get(`/api/vigilancias?pasta_id=${F.pastaId}`);
  assert.equal(r1.status, 200);
  const v = r1.body.dados.find(x => x.id === F.vigilanciaId);
  assert.ok(v, 'vigilância não apareceu na lista da pasta');
  assert.equal(v.situacao, 'aguardando');
  assert.equal(v.apenso, false);
  assert.equal(v.usuarios, undefined, 'a lista não deveria mais trazer "usuarios"');

  const semPasta = await api().get('/api/vigilancias');
  assert.equal(semPasta.status, 400);
});

test('editar: só observação, enquanto aguardando', async () => {
  const r1 = await api().put(`/api/vigilancias/${F.vigilanciaId}`).send({ observacao: 'Observação nova' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const [linha] = await sql('SELECT observacao FROM vigilancia WHERE id = ?', [F.vigilanciaId]);
  assert.equal(linha.observacao, 'Observação nova');
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

  const v1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo });
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

  // vigilância escolhida que não está mais aguardando = cria normal, sem perguntar
  const jaNao = await api().post('/api/prazos').send({
    processo_id: F.proc, data_inicio: new Date().toISOString().slice(0, 10), data_final: dataFinal, encerrar_vigilancias: [vigId],
  });
  assert.equal(jaNao.status, 201, JSON.stringify(jaNao.body));
});

test('cadastrar TAREFA no processo com vigilância aguardando pergunta antes (mesma regra de Prazos); tarefa "Rotina Interna" (sem processo) não pergunta', async () => {
  const tipo = (await sql("SELECT id FROM vigilancia_tipo WHERE nome = 'Recurso adesivo'"))[0].id;
  const v1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo });
  assert.equal(v1.status, 201);
  const vigId = v1.body.dados.id;

  // sem resposta = pergunta (409) e NADA é gravado
  const semResposta = await api().post('/api/tarefas').send({ titulo: 'Conferir recurso', processo_id: F.proc, data_vencimento: new Date().toISOString().slice(0, 10) });
  assert.equal(semResposta.status, 409, JSON.stringify(semResposta.body));
  assert.equal(semResposta.body.detalhes.codigo, 'PERGUNTAR_VIGILANCIAS');
  const [semGravar] = await sql("SELECT COUNT(*) AS n FROM tarefas WHERE titulo = 'Conferir recurso'");
  assert.equal(semGravar.n, 0);

  // responde "Sim": a tarefa encerra a vigilância, dentro da mesma gravação
  const encerra = await api().post('/api/tarefas').send({
    titulo: 'Conferir recurso', processo_id: F.proc, data_vencimento: new Date().toISOString().slice(0, 10), encerrar_vigilancias: [vigId],
  });
  assert.equal(encerra.status, 201, JSON.stringify(encerra.body));
  const [encerrada] = await sql('SELECT situacao, motivo_encerramento FROM vigilancia WHERE id = ?', [vigId]);
  assert.equal(encerrada.situacao, 'encerrada');
  assert.match(encerrada.motivo_encerramento, /tarefa/);

  // tarefa de "Rotina Interna" (sem processo) nunca pergunta, mesmo com outra vigilância aguardando
  const v2 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo });
  assert.equal(v2.status, 201);
  const rotina = await api().post('/api/tarefas').send({ titulo: 'Tarefa solta', data_vencimento: new Date().toISOString().slice(0, 10) });
  assert.equal(rotina.status, 201, JSON.stringify(rotina.body));
  const [aindaAguardando] = await sql('SELECT situacao FROM vigilancia WHERE id = ?', [v2.body.dados.id]);
  assert.equal(aindaAguardando.situacao, 'aguardando');
  // encerra manualmente para não atrapalhar o teste seguinte (ele cria sua própria vigilância do mesmo tipo)
  await api().put(`/api/vigilancias/${v2.body.dados.id}/encerrar`).send({ motivo: 'fim do teste' });
});

test('Publicações: 👁 e o aviso de vigilância só aparecem para quem tem "vigilancias/visualizar"', async () => {
  const tipo = (await sql("SELECT id FROM vigilancia_tipo WHERE nome = 'Recurso adesivo'"))[0].id;
  const v1 = await api().post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: tipo });
  assert.equal(v1.status, 201);

  await sql(
    "INSERT INTO publicacoes (fonte, data_publicacao, numero_processo, titulo, texto, texto_hash, escritorio) VALUES ('aasp', CURDATE(), '0000401-00.2026.5.15.0001', 'Publicação de teste', 'texto qualquer', 'hash-teste-vigilancia', 1)"
  );

  // administrador (nível 1) vê, mesmo sem linha na tabela de permissões
  const lista = await api().get('/api/publicacoes?busca=0000401');
  assert.equal(lista.status, 200, JSON.stringify(lista.body));
  const pub = lista.body.dados.registros.find(r => r.numero_processo === '0000401-00.2026.5.15.0001');
  assert.ok(pub, 'publicação de teste não apareceu na lista');
  assert.deepEqual(pub.vigilancias_ativas, ['Recurso adesivo']);

  const detalhe = await api().get(`/api/publicacoes/${pub.id}`);
  assert.equal(detalhe.status, 200);
  assert.deepEqual(detalhe.body.dados.vigilancias_ativas, ['Recurso adesivo']);

  // usuário comum SEM a permissão "vigilancias/visualizar": não vê nada de vigilância
  const semPermissao = emitir(3, 2, 'sessao-sem-permissao');
  const listaSem = await api(semPermissao).get('/api/publicacoes?busca=0000401');
  assert.equal(listaSem.status, 200, JSON.stringify(listaSem.body));
  const pubSem = listaSem.body.dados.registros.find(r => r.numero_processo === '0000401-00.2026.5.15.0001');
  assert.ok(pubSem, 'publicação de teste não apareceu para o usuário sem permissão');
  assert.deepEqual(pubSem.vigilancias_ativas, []);
});

test('permissões: cadastrar/alterar/excluir tipos e vigilâncias exigem a permissão certa; sem login é 401', async () => {
  const sessaoSemPermissao = emitir(3, 2, 'sessao-sem-permissao');
  const semToken = await request(app).get('/api/vigilancias?pasta_id=1');
  assert.equal(semToken.status, 401);

  const r1 = await api(sessaoSemPermissao).post('/api/vigilancias/tipos').send({ nome: 'Novo tipo sem permissão' });
  assert.equal(r1.status, 403);
  const r2 = await api(sessaoSemPermissao).get('/api/vigilancias?pasta_id=1');
  assert.equal(r2.status, 403);
  const r3 = await api(sessaoSemPermissao).post('/api/vigilancias').send({ processo_id: F.proc, tipo_id: 1 });
  assert.equal(r3.status, 403);

  // "usuteste" (id 2) tem todas as permissões de vigilancias (seed de teste) e de tipos
  const comPermissao = emitir(2, 2, 'sessao-usuario');
  const ok = await api(comPermissao).get(`/api/vigilancias?pasta_id=${F.pastaId}`);
  assert.equal(ok.status, 200);
});
