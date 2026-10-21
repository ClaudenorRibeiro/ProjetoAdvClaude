// Etiqueta automática "Acordo": (1) a cor escolhida pelo escritório (GET/PUT, só administrador, banco sem a coluna) e
// (2) a marca "status_acordo" da lista de pastas (algum processo ativo da pasta, apenso inclusive, está com o STATUS "Acordo").
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin; let comum;
const F = {};
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const api = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const msg = (r) => String(r.body.mensagem || '');
async function novoProc(numPasta, extra = {}) {
  const r = await api().post('/api/processos').send({
    numPasta, NomeTituloProc: `ACORDO ETQ ${numPasta}`, tipo_id: 1, status_id: 1, cliente_polo: 'autor',
    autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.autor }], reus: [{ tipo_pessoa: 'juridica', pessoa_id: F.reu }], ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.dados.id, pastaId: r.body.dados.pasta_id };
}
const novoAcordo = async (processoId, tipo = 'acordo', status = 'ativo') =>
  (await sql("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, status) VALUES (?, ?, 'Etiqueta', 100, 1, '2026-01-05', ?)", [processoId, tipo, status])).insertId;
const naLista = async (pastaId) => {
  const r = await api().get('/api/processos/pastas?limite=100');
  assert.equal(r.status, 200);
  return r.body.dados.registros.find(x => Number(x.id) === Number(pastaId));
};
const daPasta = async (pastaId) => {
  const r = await api().get(`/api/processos/pastas/${pastaId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.dados.processos;
};

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin'); comum = token(2, 2, 'sessao-usuario');
  F.autor = (await sql("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Autora Etiqueta Acordo', '52998224725')")).insertId;
  F.reu = (await sql("INSERT INTO pessoas_juridicas (razao_social, nome_fantasia, cnpj) VALUES ('Reu Etiqueta Acordo Ltda', 'Reu Etq', '11222333000181')")).insertId;
});

test.after(async () => pool.end());

test('cor da etiqueta Acordo: sem escolha vale a padrão; só administrador muda; cor inválida é recusada; vazio volta à padrão', async () => {
  const antes = await api(comum).get('/api/etiquetas/escritorio/acordo');          // qualquer usuário logado lê (a tela pinta com ela)
  assert.equal(antes.status, 200, JSON.stringify(antes.body));
  assert.equal(antes.body.dados.personalizada, false);
  assert.equal(antes.body.dados.cor, antes.body.dados.padrao);
  assert.match(antes.body.dados.cor, /^#[0-9a-f]{6}$/);
  assert.equal(antes.body.dados.configuravel, true);

  assert.equal((await api(comum).put('/api/etiquetas/escritorio/acordo').send({ cor: '#ff0000' })).status, 403);
  assert.equal((await request(app).get('/api/etiquetas/escritorio/acordo')).status, 401);

  const ok = await api().put('/api/etiquetas/escritorio/acordo').send({ cor: '#FF8800' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await sql('SELECT cor_etiqueta_acordo AS c FROM configuracoes_escritorio LIMIT 1'))[0].c, '#ff8800');
  const depois = await api(comum).get('/api/etiquetas/escritorio/acordo');
  assert.equal(depois.body.dados.cor, '#ff8800');
  assert.equal(depois.body.dados.personalizada, true);

  for (const ruim of ['azul', '#12', '#gggggg', 'ff0000', '#ff00001', 123, ['#ff0000'], { a: 1 }]) {
    const r = await api().put('/api/etiquetas/escritorio/acordo').send({ cor: ruim });
    assert.equal(r.status, 400, `cor ${JSON.stringify(ruim)}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await sql('SELECT cor_etiqueta_acordo AS c FROM configuracoes_escritorio LIMIT 1'))[0].c, '#ff8800');   // nada mudou

  assert.equal((await api().put('/api/etiquetas/escritorio/acordo').send({ cor: '' })).status, 200);
  const padrao = await api().get('/api/etiquetas/escritorio/acordo');
  assert.equal(padrao.body.dados.personalizada, false);
  assert.equal(padrao.body.dados.cor, padrao.body.dados.padrao);
});

test('banco que ainda não rodou o script da cor: a leitura usa a cor padrão e o salvar explica o que fazer (nunca erro interno)', async () => {
  await sql('ALTER TABLE configuracoes_escritorio DROP COLUMN cor_etiqueta_acordo');
  try {
    const lido = await api().get('/api/etiquetas/escritorio/acordo');
    assert.equal(lido.status, 200, JSON.stringify(lido.body));
    assert.equal(lido.body.dados.configuravel, false);
    assert.equal(lido.body.dados.cor, lido.body.dados.padrao);
    const salvo = await api().put('/api/etiquetas/escritorio/acordo').send({ cor: '#ff0000' });
    assert.equal(salvo.status, 409);
    assert.match(msg(salvo), /banco ainda não tem a coluna da cor/);
  } finally {
    await sql("ALTER TABLE configuracoes_escritorio ADD COLUMN cor_etiqueta_acordo varchar(7) DEFAULT NULL COMMENT 'cor (#rrggbb) da etiqueta e do fundo automaticos de processo com acordo; vazio = cor padrao do sistema'");
  }
});

test('status_acordo: vale só o STATUS "Acordo" (pelo nome, sem maiúscula/acento); acordo lançado não conta; lista de pastas e processo da pasta', async () => {
  const stAcordo = (await sql("INSERT INTO tblstatusproc (nome) VALUES ('Acordo')")).insertId;
  const stOutro = (await sql("INSERT INTO tblstatusproc (nome) VALUES ('Acordos pendentes')")).insertId;
  const noStatus = await novoProc(7101, { status_id: stAcordo });
  const lancadoSemStatus = await novoProc(7102);                       // status "Conhecimento"/outro + acordo lançado: nada muda
  const nomeParecido = await novoProc(7103, { status_id: stOutro });
  const semNada = await novoProc(7104);
  await novoAcordo(lancadoSemStatus.id);
  await novoAcordo(nomeParecido.id);

  assert.equal(Number((await naLista(noStatus.pastaId)).status_acordo), 1);        // status Acordo, sem acordo lançado: marca
  assert.equal(Number((await naLista(lancadoSemStatus.pastaId)).status_acordo), 0); // acordo lançado, status outro: sem marca
  assert.equal(Number((await naLista(nomeParecido.pastaId)).status_acordo), 0);
  assert.equal(Number((await naLista(semNada.pastaId)).status_acordo), 0);
  assert.equal((await daPasta(noStatus.pastaId))[0].status_nome, 'Acordo');         // a tela decide cada processo pelo nome do status

  // maiúscula, acento e espaço nas pontas não atrapalham; trocar o status liga e desliga a marca na hora
  await sql("UPDATE tblstatusproc SET nome = '  ACORDO ' WHERE id = ?", [stAcordo]);
  assert.equal(Number((await naLista(noStatus.pastaId)).status_acordo), 1);
  await sql('UPDATE tblproc SET status_id = ? WHERE id = ?', [stOutro, noStatus.id]);
  assert.equal(Number((await naLista(noStatus.pastaId)).status_acordo), 0);
  await sql('UPDATE tblproc SET status_id = ? WHERE id = ?', [stAcordo, lancadoSemStatus.id]);
  assert.equal(Number((await naLista(lancadoSemStatus.pastaId)).status_acordo), 1);
  await sql('DELETE FROM acordo WHERE processo_id = ?', [lancadoSemStatus.id]);      // sem o acordo lançado continua marcada: vale o status
  assert.equal(Number((await naLista(lancadoSemStatus.pastaId)).status_acordo), 1);
});

test('status_acordo numa pasta com dois processos e com apenso: a pasta marca se QUALQUER um (apenso inclusive) está com o status Acordo', async () => {
  const stAcordo = (await sql("SELECT id FROM tblstatusproc WHERE TRIM(nome) = 'Acordo' LIMIT 1"))[0].id;
  const primeiro = await novoProc(7110);
  const segundo = await novoProc(7110, { pasta_existente_confirmada: true, NomeTituloProc: 'SEGUNDO PROCESSO ETQ', status_id: stAcordo });
  assert.equal(segundo.pastaId, primeiro.pastaId);
  assert.equal(Number((await naLista(primeiro.pastaId)).status_acordo), 1);
  await sql('UPDATE tblproc SET status_id = 1 WHERE id = ?', [segundo.id]);
  assert.equal(Number((await naLista(primeiro.pastaId)).status_acordo), 0);
  // apenso com o status Acordo também marca a pasta
  await sql("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, apenso_de_id, status_id, ativo) VALUES (?, '9400099-00.2026.5.15.0001', 'APENSO ETQ', ?, ?, 1)", [primeiro.pastaId, primeiro.id, stAcordo]);
  assert.equal(Number((await naLista(primeiro.pastaId)).status_acordo), 1);
});

test('status "Acordo" é do sistema: ninguém renomeia nem exclui, nunca encerra o processo; os outros status continuam livres', async () => {
  const outro = (await sql("INSERT INTO tblstatusproc (nome) VALUES ('Status Livre Etq')")).insertId;
  let acordo = (await sql("SELECT id FROM tblstatusproc WHERE ativo = 1 AND LOWER(TRIM(nome)) = 'acordo' LIMIT 1"))[0]?.id;
  if (!acordo) {   // criar "Acordo" pela API: mesmo pedindo "encerra o processo" ele nasce sem encerrar
    const novo = await api().post('/api/processos/auxiliares/status').send({ nome: 'Acordo', encerra_processo: true });
    assert.equal(novo.status, 201, JSON.stringify(novo.body));
    acordo = novo.body.dados.id;
    assert.equal(Number(novo.body.dados.encerra_processo), 0);
  }
  await sql("UPDATE tblstatusproc SET nome = 'Acordo', encerra_processo = 0 WHERE id = ?", [acordo]);
  const intacto = async () => {
    const [l] = await sql('SELECT nome, encerra_processo AS e, ativo FROM tblstatusproc WHERE id = ?', [acordo]);
    assert.deepEqual([l.nome, Number(l.e), Number(l.ativo)], ['Acordo', 0, 1]);
  };

  const renomear = await api().put(`/api/processos/auxiliares/status/${acordo}`).send({ nome: 'Acordo Novo' });
  assert.equal(renomear.status, 400, JSON.stringify(renomear.body)); assert.match(msg(renomear), /do sistema/);
  const encerrar = await api().put(`/api/processos/auxiliares/status/${acordo}`).send({ nome: 'Acordo', encerra_processo: true });
  assert.equal(encerrar.status, 400, JSON.stringify(encerrar.body));
  const excluir = await api().delete(`/api/processos/auxiliares/status/${acordo}`);
  assert.equal(excluir.status, 400, JSON.stringify(excluir.body)); assert.match(msg(excluir), /do sistema/);
  await intacto();                                                    // nada foi gravado
  // enviar o mesmo nome e "não encerra" não é mudança: continua aceito
  assert.equal((await api().put(`/api/processos/auxiliares/status/${acordo}`).send({ nome: 'Acordo', encerra_processo: false })).status, 200);
  // outro status não pode virar "Acordo" (nome repetido) e continua livre para renomear e excluir
  assert.equal((await api().put(`/api/processos/auxiliares/status/${outro}`).send({ nome: 'Acordo' })).status, 400);
  assert.equal((await api().put(`/api/processos/auxiliares/status/${outro}`).send({ nome: 'Status Livre Etq 2', encerra_processo: true })).status, 200);
  assert.equal((await api().delete(`/api/processos/auxiliares/status/${outro}`)).status, 200);
  await intacto();
});
