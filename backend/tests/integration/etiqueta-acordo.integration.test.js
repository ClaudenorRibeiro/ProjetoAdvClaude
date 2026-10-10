// Etiqueta automática "Acordo": (1) a cor escolhida pelo escritório (GET/PUT, só administrador, banco sem a coluna) e
// (2) a marca "tem_acordo" que a lista de pastas e a pasta devolvem (acordo que não é alvará e não foi cancelado).
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
    assert.match(msg(salvo), /sql_cor_etiqueta_acordo_para_heidi/);
  } finally {
    await sql("ALTER TABLE configuracoes_escritorio ADD COLUMN cor_etiqueta_acordo varchar(7) DEFAULT NULL COMMENT 'cor (#rrggbb) da etiqueta e do fundo automaticos de processo com acordo; vazio = cor padrao do sistema'");
  }
});

test('tem_acordo: só acordo que não é alvará e não foi cancelado; vale na lista de pastas e por processo dentro da pasta', async () => {
  const comAcordo = await novoProc(7101);
  const soAlvara = await novoProc(7102);
  const cancelado = await novoProc(7103);
  const semNada = await novoProc(7104);
  await novoAcordo(comAcordo.id);
  await novoAcordo(soAlvara.id, 'alvara');
  await novoAcordo(cancelado.id, 'acordo', 'cancelado');

  assert.equal(Number((await naLista(comAcordo.pastaId)).tem_acordo), 1);
  assert.equal(Number((await naLista(soAlvara.pastaId)).tem_acordo), 0);
  assert.equal(Number((await naLista(cancelado.pastaId)).tem_acordo), 0);
  assert.equal(Number((await naLista(semNada.pastaId)).tem_acordo), 0);

  const [p1] = await daPasta(comAcordo.pastaId);
  assert.equal(Number(p1.tem_acordo), 1);
  assert.equal(Number((await daPasta(soAlvara.pastaId))[0].tem_acordo), 0);
  assert.equal(Number((await daPasta(cancelado.pastaId))[0].tem_acordo), 0);

  // cancelar o acordo ou excluí-lo tira a marca (nada guardado: a marca é calculada na hora)
  await sql("UPDATE acordo SET status = 'cancelado' WHERE processo_id = ?", [comAcordo.id]);
  assert.equal(Number((await naLista(comAcordo.pastaId)).tem_acordo), 0);
  await sql("UPDATE acordo SET status = 'ativo' WHERE processo_id = ?", [comAcordo.id]);
  assert.equal(Number((await naLista(comAcordo.pastaId)).tem_acordo), 1);
  await sql('DELETE FROM acordo WHERE processo_id = ?', [comAcordo.id]);
  assert.equal(Number((await naLista(comAcordo.pastaId)).tem_acordo), 0);
});

test('tem_acordo numa pasta com dois processos: a pasta marca se QUALQUER um tem acordo, e cada processo diz o seu', async () => {
  const primeiro = await novoProc(7110);
  const segundo = await novoProc(7110, { pasta_existente_confirmada: true, NomeTituloProc: 'SEGUNDO PROCESSO ETQ' });
  assert.equal(segundo.pastaId, primeiro.pastaId);
  await novoAcordo(segundo.id);
  assert.equal(Number((await naLista(primeiro.pastaId)).tem_acordo), 1);
  const porProcesso = Object.fromEntries((await daPasta(primeiro.pastaId)).map(p => [p.id, Number(p.tem_acordo)]));
  assert.equal(porProcesso[primeiro.id], 0);
  assert.equal(porProcesso[segundo.id], 1);
});
