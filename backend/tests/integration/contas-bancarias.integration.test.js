const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app;
let admin;

function token(id, nivel, sessao) {
  return jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function requisicao(comToken = admin) {
  return { get: p => request(app).get(p).set('Authorization', `Bearer ${comToken}`),
    post: p => request(app).post(p).set('Authorization', `Bearer ${comToken}`),
    put: p => request(app).put(p).set('Authorization', `Bearer ${comToken}`),
    delete: p => request(app).delete(p).set('Authorization', `Bearer ${comToken}`) };
}

async function consultar(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}

async function criarBanco(nome = `Banco Teste ${Date.now()}-${Math.random()}`) {
  const resp = await requisicao().post('/api/financeiro/instituicoes-financeiras').send({ nome });
  assert.equal(resp.status, 201);
  return resp.body.dados.id;
}

async function criarPessoaFisica(dados) {
  const resp = await requisicao().post('/api/pessoas/fisicas').send(dados);
  assert.equal(resp.status, 201);
  return resp.body.dados.id;
}

async function criarPessoaJuridica(dados) {
  const resp = await requisicao().post('/api/pessoas/juridicas').send(dados);
  assert.equal(resp.status, 201);
  return resp.body.dados.id;
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
});

test.after(async () => pool.end());

test('conta bancária própria: servidor preenche titular/documento com os dados da PRÓPRIA pessoa, ignorando o que a tela mandou', async () => {
  const bancoId = await criarBanco();
  const pessoaId = await criarPessoaFisica({
    nome: 'Fulano da Silva', cpf: '11122233344',
    contasBancarias: [{
      instituicao_financeira_id: bancoId, tipo: 'corrente', agencia: '0001', numero: '12345', digito: '6',
      conta_terceiro: false,
      // Mesmo tentando forjar outro titular/documento, o servidor deve ignorar (não confia no cliente).
      titular: 'Nome Forjado', documento_titular: '99988877766',
    }],
  });

  const busca = await requisicao().get(`/api/pessoas/fisicas/${pessoaId}`);
  assert.equal(busca.status, 200);
  assert.equal(busca.body.dados.contas_bancarias.length, 1);
  const conta = busca.body.dados.contas_bancarias[0];
  assert.equal(conta.titular, 'Fulano da Silva');
  assert.equal(conta.documento_titular, '11122233344');
  assert.equal(conta.conta_terceiro, 0);
  assert.equal(conta.instituicao_nome !== undefined, true); // veio o JOIN com o nome do banco
});

test('conta bancária de terceiro: grava titular/documento informados, documento salvo só com dígitos', async () => {
  const bancoId = await criarBanco();
  const pessoaId = await criarPessoaFisica({
    nome: 'Ciclana Souza', cpf: '22233344455',
    contasBancarias: [{
      instituicao_financeira_id: bancoId, tipo: 'poupanca',
      conta_terceiro: true, titular: 'Terceiro Autorizado', documento_titular: '123.456.789-09',
    }],
  });

  const [linha] = await consultar('SELECT * FROM contas_bancarias_pf WHERE pessoa_id = ?', [pessoaId]);
  assert.equal(linha.titular, 'Terceiro Autorizado');
  assert.equal(linha.documento_titular, '12345678909'); // só dígitos, sem pontuação
  assert.equal(linha.conta_terceiro, 1);
  assert.equal(linha.tipo, 'poupanca');
});

test('editar pessoa preserva o ID da conta e inativa a removida, sem apagar histórico', async () => {
  const bancoId = await criarBanco();
  const pessoaId = await criarPessoaFisica({
    nome: 'Beltrana Lima', cpf: '33344455566',
    contasBancarias: [
      { instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: false, principal: true },
      { instituicao_financeira_id: bancoId, tipo: 'poupanca', conta_terceiro: false, principal: false },
    ],
  });
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM contas_bancarias_pf WHERE pessoa_id = ?', [pessoaId]))[0].n, 2);

  const antes = await consultar('SELECT id, tipo FROM contas_bancarias_pf WHERE pessoa_id = ? ORDER BY id', [pessoaId]);
  const poupanca = antes.find(c => c.tipo === 'poupanca');
  // Edição manda só a poupança original. A corrente deixa de aparecer, mas fica inativa.
  const editar = await requisicao().put(`/api/pessoas/fisicas/${pessoaId}`).send({
    nome: 'Beltrana Lima', cpf: '333.444.555-66',
    contasBancarias: [
      { id: poupanca.id, instituicao_financeira_id: bancoId, tipo: 'poupanca', conta_terceiro: false, principal: true, observacao: 'Conta autorizada' },
    ],
  });
  assert.equal(editar.status, 200);

  const contas = await consultar('SELECT id, tipo, principal, ativo, observacao FROM contas_bancarias_pf WHERE pessoa_id = ? ORDER BY id', [pessoaId]);
  assert.equal(contas.length, 2);
  assert.deepEqual(contas.find(c => c.tipo === 'corrente'), { id: antes.find(c => c.tipo === 'corrente').id, tipo: 'corrente', principal: 0, ativo: 0, observacao: null });
  assert.deepEqual(contas.find(c => c.tipo === 'poupanca'), { id: poupanca.id, tipo: 'poupanca', principal: 1, ativo: 1, observacao: 'Conta autorizada' });
});

test('pessoa sem CPF não aceita conta própria sem documento', async () => {
  const bancoId = await criarBanco();
  // O catálogo de parentesco vem vazio no banco de teste (a estrutura não traz dados) —
  // insere um item só pra esse teste, como já é feito com outros catálogos no seed base.
  const parentesco = await consultar('INSERT INTO parentesco (nome) VALUES (?)', ['Filho(a) de teste']);
  const responsavelId = await criarPessoaFisica({ nome: 'Responsável Legal', cpf: '44455566677' });
  const resposta = await requisicao().post('/api/pessoas/fisicas').send({
    nome: 'Menor Sem Documento', responsavel_id: responsavelId, parentesco_id: parentesco.insertId,
    contasBancarias: [{ instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: false }],
  });

  assert.equal(resposta.status, 422);
});

test('excluir pessoa sem vínculos apaga as contas bancárias dela (CASCADE, sem órfão)', async () => {
  const bancoId = await criarBanco();
  const pessoaId = await criarPessoaFisica({
    nome: 'Excluir Depois', cpf: '55566677788',
    contasBancarias: [{ instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: false }],
  });
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM contas_bancarias_pf WHERE pessoa_id = ?', [pessoaId]))[0].n, 1);

  const excluir = await requisicao().delete(`/api/pessoas/fisicas/${pessoaId}`);
  assert.equal(excluir.status, 200);
  assert.equal((await consultar('SELECT COUNT(*) AS n FROM contas_bancarias_pf WHERE pessoa_id = ?', [pessoaId]))[0].n, 0);
});

test('unificar pessoas duplicadas move as contas bancárias para o cadastro principal', async () => {
  const bancoId = await criarBanco();
  const principalId = await criarPessoaFisica({ nome: 'Duplicado Principal' });
  const duplicadoId = await criarPessoaFisica({
    nome: 'Duplicado Cópia',
    contasBancarias: [{ instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: true, titular: 'Fulano', documento_titular: '99988877700' }],
  });

  const unificar = await requisicao().post('/api/pessoas/fisicas/unificar').send({
    principal_id: principalId, duplicados_ids: [duplicadoId],
  });
  assert.equal(unificar.status, 200);

  const doPrincipal = await consultar('SELECT COUNT(*) AS n FROM contas_bancarias_pf WHERE pessoa_id = ?', [principalId]);
  assert.equal(doPrincipal[0].n, 1);
  const doDuplicado = await consultar('SELECT id FROM pessoas_fisicas WHERE id = ?', [duplicadoId]);
  assert.equal(doDuplicado.length, 0); // duplicado foi apagado pela unificação
});

test('pessoa jurídica: mesma lógica de conta própria, usando razão social e CNPJ', async () => {
  const bancoId = await criarBanco();
  const empresaId = await criarPessoaJuridica({
    razao_social: 'Empresa Teste Ltda', cnpj: '11222333000181',
    contasBancarias: [{ instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: false }],
  });
  const busca = await requisicao().get(`/api/pessoas/juridicas/${empresaId}`);
  assert.equal(busca.body.dados.contas_bancarias[0].titular, 'Empresa Teste Ltda');
  assert.equal(busca.body.dados.contas_bancarias[0].documento_titular, '11222333000181');
});

test('instituição financeira: nome duplicado é recusado; excluir é soft-delete e conta antiga continua resolvendo o nome', async () => {
  const nome = `Banco Único ${Date.now()}`;
  const bancoId = await criarBanco(nome);

  const duplicado = await requisicao().post('/api/financeiro/instituicoes-financeiras').send({ nome });
  assert.equal(duplicado.status, 400);

  // Uma pessoa usa esse banco antes de ele ser removido.
  const pessoaId = await criarPessoaFisica({
    nome: 'Cliente Do Banco Removido', cpf: '66677788899',
    contasBancarias: [{ instituicao_financeira_id: bancoId, tipo: 'corrente', conta_terceiro: false }],
  });

  const excluir = await requisicao().delete(`/api/financeiro/instituicoes-financeiras/${bancoId}`);
  assert.equal(excluir.status, 200);

  // Some da listagem ativa (usada nos selects)...
  const listagem = await requisicao().get('/api/financeiro/instituicoes-financeiras');
  assert.equal(listagem.body.dados.some(b => b.id === bancoId), false);

  // ...mas a linha continua existindo e a ficha da pessoa ainda resolve o nome do banco.
  const busca = await requisicao().get(`/api/pessoas/fisicas/${pessoaId}`);
  assert.equal(busca.body.dados.contas_bancarias[0].instituicao_nome, nome);
});
