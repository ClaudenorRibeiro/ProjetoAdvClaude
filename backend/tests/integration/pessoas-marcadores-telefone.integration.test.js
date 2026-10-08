// PESSOAS — marcadores "este número é WhatsApp / SMS" nos telefones (usados pelos avisos aos clientes).
// Regra: no máximo UM número ativo de cada marcador por pessoa (o mesmo número pode ser os dois). O servidor confere, e o banco também trava.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app; let admin; let seq = 0;
const como = (t) => ({ get: p => request(app).get(p).set('Authorization', `Bearer ${t}`), post: p => request(app).post(p).set('Authorization', `Bearer ${t}`), put: p => request(app).put(p).set('Authorization', `Bearer ${t}`) });
async function sql(q, params = []) { const c = await conectarBancoTeste(); try { return (await c.execute(q, params))[0]; } finally { await c.end(); } }
const TIPOS = {
  fisica: { rota: 'fisicas', tabela: 'telefones_pf', novo: () => { seq += 1; return { nome: `Pessoa Marcador ${seq}`, cpf: String(20000000000 + seq) }; } },
  juridica: { rota: 'juridicas', tabela: 'telefones_pj', novo: () => { seq += 1; return { razao_social: `Empresa Marcador ${seq} Ltda`, cnpj: String(20000000000000 + seq) }; } },
};
const tel = (numero, extra = {}) => ({ numero, tipo: 'Celular', principal: false, ...extra });
async function criar(tipo, telefones) {
  const r = await como(admin).post(`/api/pessoas/${TIPOS[tipo].rota}`).send({ ...TIPOS[tipo].novo(), telefones });
  return r;
}
const marcas = async (tipo, id) => (await sql(`SELECT numero, whatsapp, sms FROM ${TIPOS[tipo].tabela} WHERE pessoa_id = ? ORDER BY id`, [id])).map(t => [t.numero, t.whatsapp, t.sms]);

test.before(async () => { await recriarBancoTeste(); app = criarApp(); admin = jwt.sign({ id: 1, nome: 'Administrador de Testes', nivel: 1, tipo: 'advogado', sessao: 'sessao-admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }); });
test.after(async () => { require('node-cron').getTasks().forEach(t => t.stop()); await pool.end(); });

for (const tipo of ['fisica', 'juridica']) {
  test(`${tipo}: cadastrar e editar guardam os marcadores, a ficha devolve o que foi gravado, mesmo número repetido junta os marcadores e tirar a marca grava vazio`, async () => {
    const r = await criar(tipo, [tel('(19) 98877-0001', { principal: true, sms: true }), tel('(19) 98877-0002', { whatsapp: true }), tel('(19) 98877-0001', { whatsapp: false, sms: true })]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.dados.id;
    assert.deepEqual(await marcas(tipo, id), [['(19) 98877-0001', 0, 1], ['(19) 98877-0002', 1, 0]], 'o repetido some, e o segundo número é o WhatsApp');
    const ficha = (await como(admin).get(`/api/pessoas/${TIPOS[tipo].rota}/${id}`)).body.dados;
    assert.deepEqual(ficha.telefones.map(t => [t.numero, t.whatsapp, t.sms]), [['(19) 98877-0001', 0, 1], ['(19) 98877-0002', 1, 0]]);
    // ida e volta: salvar o que a ficha entregou não perde nem muda marcador
    const volta = await como(admin).put(`/api/pessoas/${TIPOS[tipo].rota}/${id}`).send({ ...ficha, telefones: ficha.telefones });
    assert.equal(volta.status, 200, JSON.stringify(volta.body));
    assert.deepEqual(await marcas(tipo, id), [['(19) 98877-0001', 0, 1], ['(19) 98877-0002', 1, 0]]);
    // trocar de lugar: o WhatsApp passa para o primeiro número, o SMS para o segundo
    const troca = await como(admin).put(`/api/pessoas/${TIPOS[tipo].rota}/${id}`).send({ ...ficha, telefones: [tel('(19) 98877-0001', { principal: true, whatsapp: true }), tel('(19) 98877-0002', { sms: true })] });
    assert.equal(troca.status, 200, JSON.stringify(troca.body));
    assert.deepEqual(await marcas(tipo, id), [['(19) 98877-0001', 1, 0], ['(19) 98877-0002', 0, 1]]);
    // sem marcador nenhum
    await como(admin).put(`/api/pessoas/${TIPOS[tipo].rota}/${id}`).send({ ...ficha, telefones: [tel('(19) 98877-0001', { principal: true })] });
    assert.deepEqual(await marcas(tipo, id), [['(19) 98877-0001', 0, 0]]);
  });

  test(`${tipo}: dois números marcados como WhatsApp (ou como SMS) são recusados com aviso claro, no cadastro e na edição, e nada é gravado; o banco também trava`, async () => {
    for (const [campo, rotulo] of [['whatsapp', /WhatsApp/], ['sms', /SMS/]]) {
      const r = await criar(tipo, [tel('(19) 98877-1111', { [campo]: true }), tel('(19) 98877-2222', { [campo]: true })]);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.mensagem, rotulo);
    }
    const ok = await criar(tipo, [tel('(19) 98877-3333', { whatsapp: true }), tel('(19) 98877-4444')]);
    const id = ok.body.dados.id;
    const ruim = await como(admin).put(`/api/pessoas/${TIPOS[tipo].rota}/${id}`).send({ ...TIPOS[tipo].novo(), telefones: [tel('(19) 98877-3333', { whatsapp: true }), tel('(19) 98877-4444', { whatsapp: true })] });
    assert.equal(ruim.status, 400);
    assert.deepEqual(await marcas(tipo, id), [['(19) 98877-3333', 1, 0], ['(19) 98877-4444', 0, 0]], 'a edição recusada não mudou nada');
    // direto no banco: o segundo número ativo marcado é recusado; um número INATIVO marcado não conta
    await assert.rejects(() => sql(`UPDATE ${TIPOS[tipo].tabela} SET whatsapp = 1 WHERE pessoa_id = ? AND numero = '(19) 98877-4444'`, [id]), /Duplicate entry/);
    await sql(`UPDATE ${TIPOS[tipo].tabela} SET ativo = 0 WHERE pessoa_id = ? AND numero = '(19) 98877-3333'`, [id]);
    await sql(`UPDATE ${TIPOS[tipo].tabela} SET whatsapp = 1 WHERE pessoa_id = ? AND numero = '(19) 98877-4444'`, [id]);
    assert.deepEqual((await marcas(tipo, id)).map(m => m[1]), [1, 1]);
  });

  test(`${tipo}: unificar duplicados preserva UM marcador de cada tipo — o do principal manda; se ele não tem, fica o do duplicado mais antigo; nunca dá erro de marcador repetido`, async () => {
    // cadastros duplicados de verdade: sem documento (documentos diferentes não podem ser unificados)
    const montar = async (telefones) => {
      const { cpf, cnpj, ...semDocumento } = TIPOS[tipo].novo();
      const r = await como(admin).post(`/api/pessoas/${TIPOS[tipo].rota}`).send({ ...semDocumento, telefones });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.dados.id;
    };
    const principalSem = await montar([tel('(19) 90000-0001', { principal: true })]);
    const dupA = await montar([tel('(19) 90000-0002', { principal: true, whatsapp: true, sms: true })]);
    const dupB = await montar([tel('(19) 90000-0003', { principal: true, whatsapp: true })]);
    const r = await como(admin).post(`/api/pessoas/${TIPOS[tipo].rota}/unificar`).send({ principal_id: principalSem, duplicados_ids: [dupA, dupB] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await marcas(tipo, principalSem), [['(19) 90000-0001', 0, 0], ['(19) 90000-0002', 1, 1], ['(19) 90000-0003', 0, 0]], 'herdou o do mais antigo; o outro perdeu a marca');
    const principalCom = await montar([tel('(19) 91000-0001', { principal: true, whatsapp: true })]);
    const dupC = await montar([tel('(19) 91000-0002', { principal: true, whatsapp: true, sms: true })]);
    const r2 = await como(admin).post(`/api/pessoas/${TIPOS[tipo].rota}/unificar`).send({ principal_id: principalCom, duplicados_ids: [dupC] });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.deepEqual(await marcas(tipo, principalCom), [['(19) 91000-0001', 1, 0], ['(19) 91000-0002', 0, 1]], 'o principal manda no WhatsApp; o SMS que ele não tinha vem do duplicado');
  });
}
