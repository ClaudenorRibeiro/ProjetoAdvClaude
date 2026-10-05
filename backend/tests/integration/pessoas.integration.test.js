// Teste de servidor do módulo PESSOAS (físicas e jurídicas), contra MySQL real isolado.
// Cobre: permissões de cada rota, cadastrar/editar/buscar/listar/excluir (com os bloqueios por vínculo, sem órfãos),
// responsável legal, avisos de idade, anotações de atendimento, listas auxiliares, profissões (Controle), unificar
// cadastros duplicados, exportar para Excel, processos da pessoa, parabéns, WhatsApp/SMS/e-mail (só as validações).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const ExcelJS = require('exceljs');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');

let app;
const T = {};   // tokens
const F = {};   // ids fixos criados no começo

const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const como = (t) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
  put: p => request(app).put(p).set('Authorization', `Bearer ${t}`),
  delete: p => request(app).delete(p).set('Authorization', `Bearer ${t}`),
});
const api = () => como(T.admin);          // administrador (nível 1)
const usu = () => como(T.usuario);        // usuário comum com todas as permissões de Pessoas
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };

async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const um = async (q, p) => (await sql(q, p))[0];
const total = async (q, p) => Number((await um(q, p)).n);
const msg = (r) => String(r.body.mensagem || '');
const auditoria = (tabela, id, acao) => sql('SELECT * FROM logs_auditoria WHERE tabela = ? AND registro_id = ? AND acao = ?', [tabela, id, acao]);

let seq = 0;
const cpfDe = (n) => String(10000000000 + n);                       // 11 dígitos únicos (o servidor não valida o dígito verificador)
const cnpjDe = (n) => String(10000000000000 + n);                   // 14 dígitos únicos
const fisica = (extra = {}) => { seq += 1; return { nome: `Pessoa Teste ${seq}`, cpf: cpfDe(seq), ...extra }; };
const juridica = (extra = {}) => { seq += 1; return { razao_social: `Empresa Teste ${seq} Ltda`, cnpj: cnpjDe(seq), ...extra }; };
async function criarPF(extra = {}) {
  const r = await api().post('/api/pessoas/fisicas').send(fisica(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
async function criarPJ(extra = {}) {
  const r = await api().post('/api/pessoas/juridicas').send(juridica(extra));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.dados.id;
}
// Processo de teste (cliente = parte do polo escolhido), direto no banco
let seqProc = 0;
async function novoProcesso({ autores = [], reus = [], polo = 'autor', ativo = 1 } = {}) {
  seqProc += 1;
  const pasta = (await sql('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [7000 + seqProc])).insertId;
  const proc = (await sql(
    "INSERT INTO tblproc (pasta_id, numProc, cliente_polo, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, ?, ?, 1, 1, ?, 1)",
    [pasta, `99${String(seqProc).padStart(5, '0')}-00.2026.5.15.0001`, polo, `PROCESSO PESSOAS ${seqProc}`, ativo]
  )).insertId;
  for (const [tipo, id] of autores) await sql('INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, 1)', [proc, tipo, id]);
  for (const [tipo, id] of reus) await sql('INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, ?, ?, 1)', [proc, tipo, id]);
  return proc;
}

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  T.admin = token(1, 1, 'sessao-admin');
  T.usuario = token(2, 2, 'sessao-usuario');
  T.semPermissao = token(3, 2, 'sessao-sem-permissao');
  // usuário 4: só pode VISUALIZAR Pessoas
  await sql("INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo) VALUES (4, 'Só Visualiza', 'sovisualiza', 'x', 'sovisualiza@example.invalid', 'advogado', 2, 1, 0, 'sessao-so-visualiza', 0, 0)");
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (4, 'pessoas', NULL, 'visualizar', 1)");
  T.soVisualiza = token(4, 2, 'sessao-so-visualiza');
  F.advogado = (await sql("INSERT INTO profissao (nome) VALUES ('Advogado')")).insertId;
  F.perito = (await sql("INSERT INTO profissao (nome) VALUES ('Perícia Médica')")).insertId;
  F.parentesco = (await sql("INSERT INTO parentesco (nome) VALUES ('Mãe')")).insertId;
});
test.after(async () => pool.end());

// ------------------------------------------------------------------ permissões
test('sem login: TODAS as rotas de Pessoas respondem 401', async () => {
  const rotas = [
    ['get', '/api/pessoas/fisicas'], ['get', '/api/pessoas/fisicas/1'], ['get', '/api/pessoas/fisicas/exportar'], ['get', '/api/pessoas/fisicas/cpf/12345678901'],
    ['post', '/api/pessoas/fisicas'], ['put', '/api/pessoas/fisicas/1'], ['delete', '/api/pessoas/fisicas/1'], ['post', '/api/pessoas/fisicas/unificar'],
    ['get', '/api/pessoas/juridicas'], ['get', '/api/pessoas/juridicas/1'], ['get', '/api/pessoas/juridicas/exportar'],
    ['post', '/api/pessoas/juridicas'], ['put', '/api/pessoas/juridicas/1'], ['delete', '/api/pessoas/juridicas/1'], ['post', '/api/pessoas/juridicas/unificar'],
    ['post', '/api/pessoas/fisicas/1/historico'], ['post', '/api/pessoas/juridicas/1/historico'], ['put', '/api/pessoas/historico/1'], ['delete', '/api/pessoas/historico/1'],
    ['get', '/api/pessoas/auxiliares'], ['post', '/api/pessoas/auxiliares/generos'], ['get', '/api/pessoas/fisicas/1/processos'],
    ['get', '/api/pessoas/aniversariantes'], ['get', '/api/pessoas/1/parabens'], ['post', '/api/pessoas/1/parabens'],
    ['post', '/api/pessoas/enviar-email'], ['post', '/api/pessoas/registrar-zap'], ['get', '/api/pessoas/sms-ativo'], ['post', '/api/pessoas/enviar-sms'],
    ['get', '/api/controle/auxiliares/profissoes'], ['get', '/api/controle/auxiliares/profissoes/1/pessoas'], ['post', '/api/controle/auxiliares/profissoes'],
    ['put', '/api/controle/auxiliares/profissoes/1'], ['delete', '/api/controle/auxiliares/profissoes/1'],
  ];
  for (const [metodo, caminho] of rotas) {
    const r = await request(app)[metodo](caminho).send({});
    assert.equal(r.status, 401, `${metodo.toUpperCase()} ${caminho} → ${r.status}`);
  }
});

test('permissões: sem nenhuma permissão = 403; só visualizar lê mas não grava; áreas de administrador recusam usuário comum', async () => {
  const pf = await criarPF(); const pj = await criarPJ();
  const exigem = [   // [método, caminho] que exigem alguma permissão de Pessoas (ou do módulo citado)
    ['get', '/api/pessoas/fisicas'], ['get', `/api/pessoas/fisicas/${pf}`], ['get', '/api/pessoas/fisicas/exportar'], ['get', '/api/pessoas/fisicas/cpf/12345678901'],
    ['post', '/api/pessoas/fisicas'], ['put', `/api/pessoas/fisicas/${pf}`], ['delete', `/api/pessoas/fisicas/${pf}`],
    ['get', '/api/pessoas/juridicas'], ['get', `/api/pessoas/juridicas/${pj}`], ['get', '/api/pessoas/juridicas/exportar'],
    ['post', '/api/pessoas/juridicas'], ['put', `/api/pessoas/juridicas/${pj}`], ['delete', `/api/pessoas/juridicas/${pj}`],
    ['post', `/api/pessoas/fisicas/${pf}/historico`], ['post', `/api/pessoas/juridicas/${pj}/historico`], ['put', '/api/pessoas/historico/1'], ['delete', '/api/pessoas/historico/1'],
    ['post', '/api/pessoas/auxiliares/generos'], ['get', `/api/pessoas/fisicas/${pf}/processos`], ['get', `/api/pessoas/${pf}/parabens`], ['post', `/api/pessoas/${pf}/parabens`],
    ['post', '/api/pessoas/enviar-email'], ['post', '/api/pessoas/registrar-zap'],
  ];
  for (const [metodo, caminho] of exigem) {
    const r = await como(T.semPermissao)[metodo](caminho).send({});
    assert.equal(r.status, 403, `sem permissão: ${metodo.toUpperCase()} ${caminho} → ${r.status}`);
  }
  // só visualizar: leitura passa, escrita é 403 (e nada muda)
  const antes = await total('SELECT COUNT(*) AS n FROM pessoas_fisicas');
  for (const caminho of ['/api/pessoas/fisicas', `/api/pessoas/fisicas/${pf}`, '/api/pessoas/juridicas', `/api/pessoas/juridicas/${pj}`, `/api/pessoas/fisicas/${pf}/processos`, '/api/pessoas/fisicas/cpf/12345678901']) {
    const r = await como(T.soVisualiza).get(caminho);
    assert.equal(r.status, 200, `só visualiza: GET ${caminho} → ${r.status}`);
  }
  for (const [metodo, caminho] of [['post', '/api/pessoas/fisicas'], ['put', `/api/pessoas/fisicas/${pf}`], ['delete', `/api/pessoas/fisicas/${pf}`], ['post', '/api/pessoas/juridicas'],
    ['post', `/api/pessoas/fisicas/${pf}/historico`], ['post', '/api/pessoas/auxiliares/generos']]) {
    const r = await como(T.soVisualiza)[metodo](caminho).send(fisica());
    assert.equal(r.status, 403, `só visualiza: ${metodo.toUpperCase()} ${caminho} → ${r.status}`);
  }
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas'), antes);
  // administrador: unificar e profissões (Controle) recusam usuário comum, mesmo com todas as permissões de Pessoas
  for (const [metodo, caminho] of [['post', '/api/pessoas/fisicas/unificar'], ['post', '/api/pessoas/juridicas/unificar'], ['get', '/api/controle/auxiliares/profissoes'],
    ['get', '/api/controle/auxiliares/profissoes/1/pessoas'], ['post', '/api/controle/auxiliares/profissoes'], ['put', '/api/controle/auxiliares/profissoes/1'], ['delete', '/api/controle/auxiliares/profissoes/1']]) {
    const r = await usu()[metodo](caminho).send({});
    assert.equal(r.status, 403, `usuário comum: ${metodo.toUpperCase()} ${caminho} → ${r.status}`);
  }
  // abertas a qualquer usuário logado
  assert.equal((await como(T.semPermissao).get('/api/pessoas/auxiliares')).status, 200);
  assert.equal((await como(T.semPermissao).get('/api/pessoas/sms-ativo')).status, 200);
  // aniversariantes pedem "relatórios > visualizar"; SMS pede "sms > cadastrar" (o usuário de teste não tem)
  assert.equal((await como(T.semPermissao).get('/api/pessoas/aniversariantes')).status, 403);
  assert.equal((await usu().post('/api/pessoas/enviar-sms').send({ numero: '19999990000', mensagem: 'oi' })).status, 403);
});

// ------------------------------------------------------------------ pessoa física: criar
test('física — criar: grava tudo (CPF só dígitos, nome aparado, telefones e e-mails sem repetir, avisos de idade) e registra a auditoria', async () => {
  const r = await api().post('/api/pessoas/fisicas').send({
    nome: '  Maria da Silva  ', cpf: '529.982.247-25', rg: '12.345.678-9', rg_orgao: 'SSP', pis: '123.45678.90-1', ctps_numero: '123456', ctps_serie: '0001',
    data_nascimento: '1990-05-17', profissao_id: F.advogado, nome_pai: 'José da Silva', nome_mae: 'Ana da Silva',
    cep: '13010-000', logradouro: 'Rua Direita', numero: '100', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Campinas', estado: 'SP', observacoes: 'Cliente antiga',
    telefones: [{ numero: '(19) 99999-0000', principal: true }, { numero: '19999990000' }, { numero: '(19) 3333-4444', tipo: 'comercial' }],
    emails: [{ email: ' MARIA@Exemplo.com ', principal: true }, { email: 'maria@exemplo.com' }, { email: 'outro@exemplo.com' }],
    avisos_idade: [{ idade: 18 }, 60],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.dados.id;
  const linha = await um('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
  assert.equal(linha.nome, 'Maria da Silva'); assert.equal(linha.cpf, '52998224725'); assert.equal(linha.criado_por, 1);
  assert.equal(linha.cidade, 'Campinas'); assert.equal(linha.estado, 'SP'); assert.equal(String(linha.data_nascimento).slice(0, 10), '1990-05-17');
  const tels = await sql('SELECT numero, tipo, principal FROM telefones_pf WHERE pessoa_id = ? ORDER BY id', [id]);
  assert.deepEqual(tels.map(t => [t.numero, t.tipo, Number(t.principal)]), [['(19) 99999-0000', 'celular', 1], ['(19) 3333-4444', 'comercial', 0]]);   // o repetido (mesmos dígitos) saiu; tipo padrão = celular
  const mails = await sql('SELECT email, principal FROM emails_pf WHERE pessoa_id = ? ORDER BY id', [id]);
  assert.deepEqual(mails.map(e => [e.email, Number(e.principal)]), [['maria@exemplo.com', 1], ['outro@exemplo.com', 0]]);          // minúsculas, sem repetir
  assert.deepEqual((await sql('SELECT idade FROM pessoas_avisos_idade WHERE pessoa_id = ? ORDER BY idade', [id])).map(a => a.idade), [18, 60]);
  assert.equal((await auditoria('pessoas_fisicas', id, 'criar')).length, 1);
  // o que a ficha mostra (GET) é o que foi gravado
  const ficha = (await api().get(`/api/pessoas/fisicas/${id}`)).body.dados;
  assert.equal(ficha.nome, 'Maria da Silva'); assert.equal(ficha.profissao_nome, 'Advogado');
  assert.equal(ficha.telefones.length, 2); assert.equal(ficha.emails.length, 2); assert.equal(ficha.avisos_idade.length, 2);
  for (const campo of ['historico', 'representados', 'contas_bancarias']) assert.deepEqual(ficha[campo], [], campo);
  assert.equal(ficha.pendencias_documento_abertas, 0);
});

test('física — criar: nome obrigatório, CPF repetido, avisos de idade inválidos e conta bancária sem banco são recusados, sem gravar nada', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM pessoas_fisicas');
  const recusa = async (corpo, regex, status = 400) => {
    const r = await api().post('/api/pessoas/fisicas').send(corpo);
    assert.equal(r.status, status, `${JSON.stringify(corpo).slice(0, 120)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.match(msg(r), regex);
  };
  await recusa({}, /O nome é obrigatório/);
  await recusa({ nome: '' }, /O nome é obrigatório/);
  const existente = await criarPF({ cpf: '529.982.247-26' });
  await recusa(fisica({ cpf: '52998224726' }), /CPF já cadastrado/);
  await recusa(fisica({ cpf: '529.982.247-26' }), /CPF já cadastrado/);          // mesmo CPF, com pontuação
  await recusa(fisica({ avisos_idade: [-1] }), /Idade de aviso inválida/);
  await recusa(fisica({ avisos_idade: [121] }), /Idade de aviso inválida/);
  await recusa(fisica({ avisos_idade: ['x'] }), /Idade de aviso inválida/);
  await recusa(fisica({ avisos_idade: [18, 18] }), /A idade 18 está repetida/);
  await recusa(fisica({ contasBancarias: [{ agencia: '1234', numero: '5678' }] }), /Escolha a instituição financeira/, 422);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas'), antes + 1);                // só a "existente" foi criada
  assert.ok(existente);
});

test('física — responsável legal: parentesco obrigatório, não pode ser a própria pessoa, nem inativo, nem alguém que já é representado; quem representa não é representado', async () => {
  const resp = await criarPF({ nome: 'Responsável Legal', cpf: '' });
  const inativa = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, ativo) VALUES ('Responsável Inativa', ?, 0)", [cpfDe(900001)])).insertId;
  const recusa = async (corpo, regex) => {
    const r = await api().post('/api/pessoas/fisicas').send(fisica(corpo));
    assert.equal(r.status, 400, JSON.stringify(corpo)); assert.match(msg(r), regex, JSON.stringify(corpo));
  };
  await recusa({ responsavel_id: resp }, /Informe o parentesco do responsável legal/);
  await recusa({ responsavel_id: 999999, parentesco_id: F.parentesco }, /Responsável legal não encontrado/);
  await recusa({ responsavel_id: inativa, parentesco_id: F.parentesco }, /está inativo/);
  await recusa({ responsavel_id: resp, parentesco_id: 999999 }, /Parentesco do responsável legal inválido/);
  // válido
  const menor = await criarPF({ nome: 'Menor Representado', responsavel_id: resp, parentesco_id: F.parentesco });
  const fichaMenor = (await api().get(`/api/pessoas/fisicas/${menor}`)).body.dados;
  assert.equal(fichaMenor.responsavel_nome, 'Responsável Legal'); assert.equal(fichaMenor.parentesco_nome, 'Mãe');
  assert.deepEqual((await api().get(`/api/pessoas/fisicas/${resp}`)).body.dados.representados.map(x => x.nome), ['Menor Representado']);
  // quem já é representado não pode ser responsável de outro (corta corrente e ciclo)
  await recusa({ responsavel_id: menor, parentesco_id: F.parentesco }, /é representado\(a\) por outra pessoa/);
  // edição: por ela mesma / quem representa alguém não pode passar a ser representado
  const porSiMesma = await api().put(`/api/pessoas/fisicas/${menor}`).send({ nome: 'Menor Representado', responsavel_id: menor, parentesco_id: F.parentesco });
  assert.equal(porSiMesma.status, 400); assert.match(msg(porSiMesma), /por ela mesma/);
  const outraResp = await criarPF({ cpf: '' });
  const inverso = await api().put(`/api/pessoas/fisicas/${resp}`).send({ nome: 'Responsável Legal', responsavel_id: outraResp, parentesco_id: F.parentesco });
  assert.equal(inverso.status, 400); assert.match(msg(inverso), /é responsável legal de outra\(s\)/);
  // quem representa alguém não pode ser excluído, nem unificado
  const exclusao = await api().delete(`/api/pessoas/fisicas/${resp}`);
  assert.equal(exclusao.status, 400); assert.match(msg(exclusao), /1 pessoa\(s\) que representa como responsável legal/);
  const unif = await api().post('/api/pessoas/fisicas/unificar').send({ principal_id: resp, duplicados_ids: [outraResp] });
  assert.equal(unif.status, 400); assert.match(msg(unif), /responsável legal/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id IN (?, ?)', [resp, outraResp]), 2);
});

// ------------------------------------------------------------------ pessoa física: editar / buscar
test('física — editar: regrava telefones e e-mails, guarda a auditoria, aceita data com horário, não mexe nos avisos se a lista não vier e mantém o "já avisei"', async () => {
  const id = await criarPF({ nome: 'Para Editar', telefones: [{ numero: '19911110000' }], emails: [{ email: 'antes@x.com' }], avisos_idade: [18, 21] });
  await sql('UPDATE pessoas_avisos_idade SET avisado_em = NOW() WHERE pessoa_id = ? AND idade = 18', [id]);
  await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('fisica', ?, 'anotação que deve continuar', 1)", [id]);
  const r = await api().put(`/api/pessoas/fisicas/${id}`).send({
    nome: '  Editada  ', cpf: '', data_nascimento: '1972-03-27T03:00:00.000Z', cidade: 'Valinhos',
    telefones: [{ numero: '19922220000', principal: true }], emails: [{ email: 'DEPOIS@x.com' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const linha = await um('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
  assert.equal(linha.nome, 'Editada'); assert.equal(linha.cpf, null); assert.equal(String(linha.data_nascimento).slice(0, 10), '1972-03-27'); assert.equal(linha.alterado_por, 1);
  assert.deepEqual((await sql('SELECT numero FROM telefones_pf WHERE pessoa_id = ?', [id])).map(t => t.numero), ['19922220000']);
  assert.deepEqual((await sql('SELECT email FROM emails_pf WHERE pessoa_id = ?', [id])).map(t => t.email), ['depois@x.com']);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_avisos_idade WHERE pessoa_id = ?', [id]), 2);          // avisos_idade não veio: não mexe
  assert.equal(await total('SELECT COUNT(*) AS n FROM historico_atendimento WHERE pessoa_id = ?', [id]), 1);         // anotações intactas
  assert.equal((await auditoria('pessoas_fisicas', id, 'editar')).length, 1);
  // avisos: quem continua na lista mantém o "já avisei"; quem saiu é removido; quem entrou é criado
  const r2 = await api().put(`/api/pessoas/fisicas/${id}`).send({ nome: 'Editada', avisos_idade: [18, 30] });
  assert.equal(r2.status, 200);
  const avisos = await sql('SELECT idade, avisado_em FROM pessoas_avisos_idade WHERE pessoa_id = ? ORDER BY idade', [id]);
  assert.deepEqual(avisos.map(a => a.idade), [18, 30]);
  assert.ok(avisos[0].avisado_em, 'o aviso dos 18 anos perdeu o "já avisei"'); assert.equal(avisos[1].avisado_em, null);
  // lista vazia apaga todos
  assert.equal((await api().put(`/api/pessoas/fisicas/${id}`).send({ nome: 'Editada', avisos_idade: [] })).status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_avisos_idade WHERE pessoa_id = ?', [id]), 0);
});

test('física — editar: pessoa inexistente = 404; CPF de outra pessoa é recusado; avisos inválidos são recusados e nada muda', async () => {
  const a = await criarPF({ nome: 'Dona do CPF' }); const b = await criarPF({ nome: 'Outra Pessoa' });
  const cpfA = (await um('SELECT cpf FROM pessoas_fisicas WHERE id = ?', [a])).cpf;
  assert.equal((await api().put('/api/pessoas/fisicas/999999').send({ nome: 'x' })).status, 404);
  assert.equal((await api().put('/api/pessoas/fisicas/abc').send({ nome: 'x' })).status, 404);
  const dup = await api().put(`/api/pessoas/fisicas/${b}`).send({ nome: 'Outra Pessoa', cpf: cpfA });
  assert.equal(dup.status, 400); assert.match(msg(dup), /Este CPF já está cadastrado em outra pessoa/);
  assert.equal((await um('SELECT nome FROM pessoas_fisicas WHERE id = ?', [b])).nome, 'Outra Pessoa');
  const aviso = await api().put(`/api/pessoas/fisicas/${b}`).send({ nome: 'Mudou?', avisos_idade: [200] });
  assert.equal(aviso.status, 400);
  assert.equal((await um('SELECT nome FROM pessoas_fisicas WHERE id = ?', [b])).nome, 'Outra Pessoa');
  // o próprio CPF pode ser regravado
  assert.equal((await api().put(`/api/pessoas/fisicas/${a}`).send({ nome: 'Dona do CPF', cpf: cpfA })).status, 200);
});

test('física — buscar uma: devolve contatos, anotações, representados e avisos; inexistente e id que não é número = 404; CPF por /cpf/:cpf', async () => {
  const id = await criarPF({ nome: 'Ficha Completa', telefones: [{ numero: '19900001111', principal: true }], emails: [{ email: 'ficha@x.com' }] });
  await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('fisica', ?, 'ligou', 1)", [id]);
  const ficha = (await api().get(`/api/pessoas/fisicas/${id}`)).body.dados;
  assert.equal(ficha.id, id); assert.equal(ficha.historico.length, 1); assert.equal(ficha.historico[0].usuario_nome, 'Administrador de Testes');
  assert.equal(ficha.telefones[0].numero, '19900001111'); assert.equal(ficha.emails[0].email, 'ficha@x.com');
  for (const ruim of ['999999', 'abc', '-1']) assert.equal((await api().get(`/api/pessoas/fisicas/${ruim}`)).status, 404, ruim);
  // CPF
  const cpf = ficha.cpf;
  const achou = (await api().get(`/api/pessoas/fisicas/cpf/${cpf}`)).body.dados;
  assert.equal(achou.existe, true); assert.equal(achou.pessoa.id, id);
  assert.equal((await api().get(`/api/pessoas/fisicas/cpf/${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`)).body.dados.existe, true);   // com pontuação
  assert.equal((await api().get('/api/pessoas/fisicas/cpf/00000000000')).body.dados.existe, false);
  for (const ruim of ['123', 'abc', '1234567890123']) assert.equal((await api().get(`/api/pessoas/fisicas/cpf/${ruim}`)).status, 400, ruim);
  await sql('UPDATE pessoas_fisicas SET ativo = 0 WHERE id = ?', [id]);
  assert.equal((await api().get(`/api/pessoas/fisicas/cpf/${cpf}`)).body.dados.existe, false);     // inativa não conta
});

// ------------------------------------------------------------------ pessoa física: listar
test('física — listar: busca por nome, CPF, RG e telefone; só ativos; ordem pelo nome; modo "escolher pessoa" busca só nome e CPF e põe quem COMEÇA pelo termo primeiro', async () => {
  const prefixo = `Zeta${Date.now() % 100000}`;
  const a = await criarPF({ nome: `Ana ${prefixo} Maria`, rg: 'RGWXYZ' });
  const b = await criarPF({ nome: `${prefixo} Beatriz`, telefones: [{ numero: '(19) 98877-6655' }] });
  const c = await criarPF({ nome: `Carlos ${prefixo}`, logradouro: `Rua ${prefixo} Maria` });
  const d = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, ativo) VALUES (?, ?, 0)", [`Inativa ${prefixo}`, cpfDe(910001)])).insertId;
  const nomes = async (qs) => (await api().get(`/api/pessoas/fisicas?${qs}`)).body.dados.registros.map(r => r.nome);
  assert.deepEqual(await nomes(`busca=${prefixo}`), [`Ana ${prefixo} Maria`, `Carlos ${prefixo}`, `${prefixo} Beatriz`]);   // sem a inativa, ordem alfabética
  assert.deepEqual(await nomes(`busca=${prefixo.toLowerCase()}`), [`Ana ${prefixo} Maria`, `Carlos ${prefixo}`, `${prefixo} Beatriz`]);   // sem diferenciar maiúscula
  assert.deepEqual(await nomes('busca=RGWXYZ'), [`Ana ${prefixo} Maria`]);
  assert.deepEqual(await nomes('busca=98877-6655'), [`${prefixo} Beatriz`]);
  const cpfB = (await um('SELECT cpf FROM pessoas_fisicas WHERE id = ?', [b])).cpf;
  assert.deepEqual(await nomes(`busca=${cpfB}`), [`${prefixo} Beatriz`]);
  assert.deepEqual(await nomes('busca=NinguemComEsseNome'), []);
  // escolher pessoa: não acha pelo endereço, e quem começa pelo termo vem primeiro
  assert.deepEqual(await nomes(`busca=Rua%20${prefixo}`), [`Carlos ${prefixo}`]);                 // na tela de Pessoas acha pelo endereço
  assert.deepEqual(await nomes(`busca=Rua%20${prefixo}&selecao=1`), []);                         // no "escolher pessoa" não
  assert.deepEqual(await nomes(`busca=${prefixo}&selecao=1`), [`${prefixo} Beatriz`, `Ana ${prefixo} Maria`, `Carlos ${prefixo}`]);   // quem começa pelo termo primeiro; depois, alfabética
  assert.ok(a && c && d);
});

test('física — listar: paginação, "qtde_proc", etiqueta do escritório, advogados e peritos', async () => {
  const marca = `Pag${Date.now() % 100000}`;
  const ids = [];
  for (let i = 1; i <= 5; i += 1) ids.push(await criarPF({ nome: `${marca} ${String(i).padStart(2, '0')}`, profissao_id: i === 1 ? F.advogado : (i === 2 ? F.perito : null) }));
  const p1 = (await api().get(`/api/pessoas/fisicas?busca=${marca}&limite=2&pagina=1`)).body.dados;
  assert.equal(p1.total, 5); assert.deepEqual(p1.registros.map(r => r.nome), [`${marca} 01`, `${marca} 02`]);
  const p3 = (await api().get(`/api/pessoas/fisicas?busca=${marca}&limite=2&pagina=3`)).body.dados;
  assert.deepEqual(p3.registros.map(r => r.nome), [`${marca} 05`]);
  assert.equal((await api().get(`/api/pessoas/fisicas?busca=${marca}&limite=500`)).body.dados.registros.length, 5);   // teto de 100 não corta 5
  assert.deepEqual((await api().get(`/api/pessoas/fisicas?busca=${marca}&somente_advogados=1`)).body.dados.registros.map(r => r.nome), [`${marca} 01`]);
  assert.deepEqual((await api().get(`/api/pessoas/fisicas?busca=${marca}&somente_peritos=1`)).body.dados.registros.map(r => r.nome), [`${marca} 02`]);
  // quantidade de processos (autor + réu do mesmo processo conta 1; processos diferentes somam)
  await novoProcesso({ autores: [['fisica', ids[2]]], reus: [['fisica', ids[2]]] });
  await novoProcesso({ autores: [['fisica', ids[2]]] });
  const linha = (await api().get(`/api/pessoas/fisicas?busca=${marca}%2003`)).body.dados.registros[0];
  assert.equal(Number(linha.qtde_proc), 2);
  // etiqueta do escritório
  await sql('INSERT INTO pessoas_fisicas_etiquetas_escritorio (pessoa_id, slot, marcado_por) VALUES (?, 3, 1)', [ids[3]]);
  const etq = (await api().get(`/api/pessoas/fisicas?busca=${marca}&etiquetaEscritorio=3`)).body.dados.registros;
  assert.deepEqual(etq.map(r => r.nome), [`${marca} 04`]); assert.equal(Number(etq[0].etiqueta_escritorio), 3);
  assert.equal((await api().get(`/api/pessoas/fisicas?busca=${marca}&etiquetaEscritorio=9`)).body.dados.total, 5);     // fora de 1..5 = ignora
});

// ------------------------------------------------------------------ pessoa física: excluir
test('física — excluir: sem vínculo apaga junto telefones e e-mails (sem órfão) e deixa a auditoria; inexistente e id texto = 404', async () => {
  const id = await criarPF({ telefones: [{ numero: '19900002222' }], emails: [{ email: 'apagar@x.com' }], avisos_idade: [18] });
  assert.equal((await api().delete(`/api/pessoas/fisicas/${id}`)).status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id = ?', [id]), 0);
  for (const tabela of ['telefones_pf', 'emails_pf', 'pessoas_avisos_idade']) assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE pessoa_id = ?`, [id]), 0, tabela);
  assert.equal((await auditoria('pessoas_fisicas', id, 'excluir')).length, 1);
  assert.equal((await api().delete(`/api/pessoas/fisicas/${id}`)).status, 404);                 // já apagada
  assert.equal((await api().delete('/api/pessoas/fisicas/abc')).status, 404);
  const inativa = (await sql("INSERT INTO pessoas_fisicas (nome, cpf, ativo) VALUES ('Inativa p/ excluir', ?, 0)", [cpfDe(910002)])).insertId;
  assert.equal((await api().delete(`/api/pessoas/fisicas/${inativa}`)).status, 404);            // a regra só enxerga ativas
});

test('física — excluir: qualquer vínculo BLOQUEIA com o motivo e nada é apagado (processo, histórico, comunicação, perito do processo e pendência de documentos)', async () => {
  const bloqueia = async (id, regex, rotulo) => {
    const r = await api().delete(`/api/pessoas/fisicas/${id}`);
    assert.equal(r.status, 400, `${rotulo} → ${r.status}`); assert.match(msg(r), regex, rotulo);
    assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id = ?', [id]), 1, `${rotulo}: a pessoa sumiu`);
  };
  const autor = await criarPF(); await novoProcesso({ autores: [['fisica', autor]] });
  await bloqueia(autor, /1 processo\(s\) como autor/, 'autor');
  const reu = await criarPF(); await novoProcesso({ reus: [['fisica', reu]] });
  await bloqueia(reu, /1 processo\(s\) como réu/, 'réu');
  const comHist = await criarPF(); await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('fisica', ?, 'x', 1)", [comHist]);
  await bloqueia(comHist, /1 registro\(s\) de histórico/, 'histórico');
  const comLog = await criarPF(); await sql("INSERT INTO log_comunicacoes (canal, destinatario, pessoa_id, tipo_pessoa, usuario_id) VALUES ('email', 'a@b.c', ?, 'fisica', 1)", [comLog]);
  await bloqueia(comLog, /1 comunicação\(ões\)/, 'comunicação');
  const perito = await criarPF(); const proc = await novoProcesso();
  await sql("INSERT INTO processo_perito (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'fisica', ?, 1)", [proc, perito]);
  await bloqueia(perito, /1 perícia\(s\) como perito/, 'perito do processo');
  const pendencia = await criarPF();
  await sql("INSERT INTO pendencia_documento (tipo_pessoa, pessoa_id, status, criado_por) VALUES ('fisica', ?, 'aberta', 1)", [pendencia]);
  await bloqueia(pendencia, /1 pendência\(s\) de documentos/, 'pendência de documentos');
});

// ------------------------------------------------------------------ pessoa jurídica
test('jurídica — criar: grava tudo (CNPJ só dígitos, razão aparada, "recuperação judicial", telefones e e-mails sem repetir) e registra a auditoria', async () => {
  const r = await api().post('/api/pessoas/juridicas').send({
    razao_social: '  Empresa Completa Ltda  ', nome_fantasia: 'Completa', cnpj: '11.222.333/0001-81', inscricao_estadual: '123456', em_recuperacao_judicial: true,
    cep: '13010-000', logradouro: 'Av. Brasil', numero: '10', bairro: 'Centro', cidade: 'Campinas', estado: 'SP', observacoes: 'obs',
    telefones: [{ numero: '(19) 3333-0000', principal: true }, { numero: '1933330000' }, { numero: '19999990000', tipo: 'celular do sócio' }],
    emails: [{ email: 'CONTATO@empresa.com', principal: true }, { email: 'contato@empresa.com' }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.dados.id;
  const linha = await um('SELECT * FROM pessoas_juridicas WHERE id = ?', [id]);
  assert.equal(linha.razao_social, 'Empresa Completa Ltda'); assert.equal(linha.cnpj, '11222333000181'); assert.equal(Number(linha.em_recuperacao_judicial), 1); assert.equal(linha.criado_por, 1);
  assert.deepEqual((await sql('SELECT numero, tipo FROM telefones_pj WHERE pessoa_id = ? ORDER BY id', [id])).map(t => [t.numero, t.tipo]), [['(19) 3333-0000', 'comercial'], ['19999990000', 'celular do sócio']]);
  assert.deepEqual((await sql('SELECT email FROM emails_pj WHERE pessoa_id = ?', [id])).map(e => e.email), ['contato@empresa.com']);
  assert.equal((await auditoria('pessoas_juridicas', id, 'criar')).length, 1);
  const ficha = (await api().get(`/api/pessoas/juridicas/${id}`)).body.dados;
  assert.equal(ficha.razao_social, 'Empresa Completa Ltda'); assert.equal(ficha.telefones.length, 2); assert.deepEqual(ficha.historico, []); assert.deepEqual(ficha.contas_bancarias, []);
  assert.equal((await api().get('/api/pessoas/juridicas/999999')).status, 404);
  assert.equal((await api().get('/api/pessoas/juridicas/abc')).status, 404);
});

test('jurídica — criar e editar: razão social obrigatória, CNPJ repetido recusado, inexistente = 404, regrava telefones e e-mails e guarda a auditoria', async () => {
  const antes = await total('SELECT COUNT(*) AS n FROM pessoas_juridicas');
  for (const corpo of [{}, { razao_social: '' }]) {
    const r = await api().post('/api/pessoas/juridicas').send(corpo);
    assert.equal(r.status, 400); assert.match(msg(r), /A razão social é obrigatória/);
  }
  const a = await criarPJ({ cnpj: '11.222.333/0001-99' });
  const dup = await api().post('/api/pessoas/juridicas').send(juridica({ cnpj: '11222333000199' }));
  assert.equal(dup.status, 400); assert.match(msg(dup), /CNPJ já cadastrado/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_juridicas'), antes + 1);
  const b = await criarPJ({ telefones: [{ numero: '1933330001' }], emails: [{ email: 'antes@x.com' }] });
  const ok = await api().put(`/api/pessoas/juridicas/${b}`).send({ razao_social: ' Editada Ltda ', cnpj: '', telefones: [{ numero: '1933330002' }], emails: [{ email: 'DEPOIS@x.com' }], em_recuperacao_judicial: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const linha = await um('SELECT * FROM pessoas_juridicas WHERE id = ?', [b]);
  assert.equal(linha.razao_social, 'Editada Ltda'); assert.equal(linha.cnpj, null); assert.equal(Number(linha.em_recuperacao_judicial), 1); assert.equal(linha.alterado_por, 1);
  assert.deepEqual((await sql('SELECT numero FROM telefones_pj WHERE pessoa_id = ?', [b])).map(t => t.numero), ['1933330002']);
  assert.deepEqual((await sql('SELECT email FROM emails_pj WHERE pessoa_id = ?', [b])).map(t => t.email), ['depois@x.com']);
  assert.equal((await auditoria('pessoas_juridicas', b, 'editar')).length, 1);
  const cnpjA = (await um('SELECT cnpj FROM pessoas_juridicas WHERE id = ?', [a])).cnpj;
  const dupEdit = await api().put(`/api/pessoas/juridicas/${b}`).send({ razao_social: 'Editada Ltda', cnpj: cnpjA });
  assert.equal(dupEdit.status, 400); assert.match(msg(dupEdit), /Este CNPJ já está cadastrado em outra empresa/);
  assert.equal((await api().put(`/api/pessoas/juridicas/${b}`).send({})).status, 400);
  assert.equal((await api().put('/api/pessoas/juridicas/999999').send({ razao_social: 'x' })).status, 404);
  assert.equal((await api().put('/api/pessoas/juridicas/abc').send({ razao_social: 'x' })).status, 404);
});

test('jurídica — listar (busca por razão, fantasia e CNPJ, paginação, escolher empresa) e excluir (com os bloqueios por vínculo)', async () => {
  const marca = `Jur${Date.now() % 100000}`;
  const a = await criarPJ({ razao_social: `${marca} Alfa Ltda`, nome_fantasia: 'Fantasia Alfa' });
  const b = await criarPJ({ razao_social: `Beta ${marca} SA`, telefones: [{ numero: '1933335555' }] });
  const c = await criarPJ({ razao_social: `${marca} Gama Ltda` });
  await sql("INSERT INTO pessoas_juridicas (razao_social, cnpj, ativo) VALUES (?, ?, 0)", [`${marca} Inativa`, cnpjDe(920001)]);
  const razoes = async (qs) => (await api().get(`/api/pessoas/juridicas?${qs}`)).body.dados.registros.map(r => r.razao_social);
  assert.deepEqual(await razoes(`busca=${marca}`), [`Beta ${marca} SA`, `${marca} Alfa Ltda`, `${marca} Gama Ltda`]);
  assert.deepEqual(await razoes('busca=Fantasia%20Alfa'), [`${marca} Alfa Ltda`]);
  assert.deepEqual(await razoes('busca=1933335555'), [`Beta ${marca} SA`]);
  assert.deepEqual(await razoes(`busca=${marca}&selecao=1`), [`${marca} Alfa Ltda`, `${marca} Gama Ltda`, `Beta ${marca} SA`]);
  const pag = (await api().get(`/api/pessoas/juridicas?busca=${marca}&limite=2&pagina=2`)).body.dados;
  assert.equal(pag.total, 3); assert.equal(pag.registros.length, 1);
  // excluir
  const livre = await criarPJ({ telefones: [{ numero: '1933336666' }], emails: [{ email: 'a@b.com' }] });
  assert.equal((await api().delete(`/api/pessoas/juridicas/${livre}`)).status, 200);
  for (const tabela of ['telefones_pj', 'emails_pj']) assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE pessoa_id = ?`, [livre]), 0, tabela);
  assert.equal((await auditoria('pessoas_juridicas', livre, 'excluir')).length, 1);
  assert.equal((await api().delete(`/api/pessoas/juridicas/${livre}`)).status, 404);
  assert.equal((await api().delete('/api/pessoas/juridicas/abc')).status, 404);
  await novoProcesso({ autores: [['juridica', a]] });
  const r1 = await api().delete(`/api/pessoas/juridicas/${a}`);
  assert.equal(r1.status, 400); assert.match(msg(r1), /1 processo\(s\) como autor/);
  await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('juridica', ?, 'x', 1)", [c]);
  const r2 = await api().delete(`/api/pessoas/juridicas/${c}`);
  assert.equal(r2.status, 400); assert.match(msg(r2), /1 registro\(s\) de histórico/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_juridicas WHERE id IN (?, ?, ?)', [a, b, c]), 3);
});

// ------------------------------------------------------------------ anotações de atendimento (histórico)
test('anotações: adicionar (física e jurídica), texto aparado, vazio recusado; dono edita/exclui só a do dia, administrador qualquer; inexistente = 404', async () => {
  const pf = await criarPF(); const pj = await criarPJ();
  const vazias = ['', '   '];
  for (const descricao of vazias) {
    const r = await api().post(`/api/pessoas/fisicas/${pf}/historico`).send({ descricao });
    assert.equal(r.status, 400); assert.match(msg(r), /A anotação não pode ficar em branco/);
  }
  assert.equal((await api().post(`/api/pessoas/fisicas/${pf}/historico`).send({})).status, 400);
  assert.equal((await usu().post(`/api/pessoas/fisicas/${pf}/historico`).send({ descricao: '  anotação do usuário  ' })).status, 201);
  assert.equal((await api().post(`/api/pessoas/juridicas/${pj}/historico`).send({ descricao: 'da empresa', tipo_pessoa: 'juridica' })).status, 201);
  const minha = await um("SELECT * FROM historico_atendimento WHERE pessoa_id = ? AND tipo_pessoa = 'fisica'", [pf]);
  assert.equal(minha.descricao, 'anotação do usuário'); assert.equal(minha.usuario_id, 2);
  assert.equal(await total("SELECT COUNT(*) AS n FROM historico_atendimento WHERE pessoa_id = ? AND tipo_pessoa = 'juridica'", [pj]), 1);
  assert.equal((await api().get(`/api/pessoas/juridicas/${pj}`)).body.dados.historico[0].descricao, 'da empresa');
  // o dono edita a própria, do dia
  const editou = await usu().put(`/api/pessoas/historico/${minha.id}`).send({ descricao: ' corrigida ' });
  assert.equal(editou.status, 200);
  assert.equal((await um('SELECT descricao FROM historico_atendimento WHERE id = ?', [minha.id])).descricao, 'corrigida');
  assert.equal((await auditoria('historico_atendimento', minha.id, 'alterar')).length, 1);
  assert.equal((await usu().put(`/api/pessoas/historico/${minha.id}`).send({ descricao: '  ' })).status, 400);
  // de OUTRO usuário (do administrador): usuário comum não mexe
  await api().post(`/api/pessoas/fisicas/${pf}/historico`).send({ descricao: 'do administrador' });
  const doAdmin = await um("SELECT id FROM historico_atendimento WHERE pessoa_id = ? AND usuario_id = 1", [pf]);
  const negada = await usu().put(`/api/pessoas/historico/${doAdmin.id}`).send({ descricao: 'invadida' });
  assert.equal(negada.status, 403); assert.match(msg(negada), /só pode editar ou excluir as anotações que você escreveu hoje/);
  assert.equal((await usu().delete(`/api/pessoas/historico/${doAdmin.id}`)).status, 403);
  // própria, mas de ontem: usuário comum não mexe; administrador sim
  await sql('UPDATE historico_atendimento SET criado_em = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id = ?', [minha.id]);
  assert.equal((await usu().put(`/api/pessoas/historico/${minha.id}`).send({ descricao: 'velha' })).status, 403);
  assert.equal((await usu().delete(`/api/pessoas/historico/${minha.id}`)).status, 403);
  assert.equal((await api().put(`/api/pessoas/historico/${minha.id}`).send({ descricao: 'admin edita antiga' })).status, 200);
  assert.equal((await api().delete(`/api/pessoas/historico/${minha.id}`)).status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM historico_atendimento WHERE id = ?', [minha.id]), 0);
  assert.equal((await auditoria('historico_atendimento', minha.id, 'excluir')).length, 1);
  // inexistente / id que não é número
  for (const ruim of ['999999', 'abc']) {
    assert.equal((await api().put(`/api/pessoas/historico/${ruim}`).send({ descricao: 'x' })).status, 404, ruim);
    assert.equal((await api().delete(`/api/pessoas/historico/${ruim}`)).status, 404, ruim);
  }
});

// ------------------------------------------------------------------ listas auxiliares e profissões
test('auxiliares: listar tudo; cadastrar normaliza a grafia e recusa repetido (sem diferenciar maiúscula), vazio e tipo inventado; banco entra pelo catálogo', async () => {
  const lista = (await api().get('/api/pessoas/auxiliares')).body.dados;
  for (const chave of ['estados_civis', 'generos', 'profissoes', 'nacionalidades', 'parentescos', 'instituicoes_financeiras']) assert.ok(Array.isArray(lista[chave]), chave);
  for (const tipo of ['generos', 'estados_civis', 'profissoes', 'nacionalidades', 'parentescos']) {
    const r = await api().post(`/api/pessoas/auxiliares/${tipo}`).send({ nome: '  NOVO ITEM TESTE  ' });
    assert.equal(r.status, 201, `${tipo}: ${JSON.stringify(r.body)}`); assert.equal(r.body.dados.nome, 'Novo item teste');
    const igual = await api().post(`/api/pessoas/auxiliares/${tipo}`).send({ nome: 'novo ITEM teste' });
    assert.equal(igual.status, 400, tipo); assert.match(msg(igual), /já está cadastrado na lista/);
    for (const vazio of [{}, { nome: '' }, { nome: '   ' }]) assert.equal((await api().post(`/api/pessoas/auxiliares/${tipo}`).send(vazio)).status, 400, `${tipo} ${JSON.stringify(vazio)}`);
  }
  assert.ok((await api().get('/api/pessoas/auxiliares')).body.dados.generos.some(g => g.nome === 'Novo item teste'));
  const invalido = await api().post('/api/pessoas/auxiliares/tabela_qualquer').send({ nome: 'x' });
  assert.equal(invalido.status, 400); assert.match(msg(invalido), /Tipo inválido/);
  const banco = await api().post('/api/pessoas/auxiliares/instituicoes_financeiras').send({ nome: 'Banco Pessoas Teste' });
  assert.equal(banco.status, 201, JSON.stringify(banco.body));
  assert.equal((await api().post('/api/pessoas/auxiliares/instituicoes_financeiras').send({ nome: 'Banco Pessoas Teste' })).status, 400);
  assert.ok((await api().get('/api/pessoas/auxiliares')).body.dados.instituicoes_financeiras.some(b => b.nome === 'Banco Pessoas Teste'));
});

test('profissões (Controle): listar com o total de pessoas, criar, renomear e excluir; em uso por pessoa ou por freelancer não exclui; inexistente = 404', async () => {
  const nova = await api().post('/api/controle/auxiliares/profissoes').send({ nome: '  engenheira civil  ' });
  assert.equal(nova.status, 201); assert.equal(nova.body.dados.nome, 'Engenheira civil');
  const id = nova.body.dados.id;
  assert.equal((await api().post('/api/controle/auxiliares/profissoes').send({ nome: 'ENGENHEIRA CIVIL' })).status, 400);
  for (const vazio of [{}, { nome: '' }, { nome: '  ' }]) assert.equal((await api().post('/api/controle/auxiliares/profissoes').send(vazio)).status, 400);
  const pf = await criarPF({ profissao_id: id });
  const lista = (await api().get('/api/controle/auxiliares/profissoes')).body.dados;
  assert.equal(Number(lista.find(p => p.id === id).total_pessoas), 1);
  const dePessoas = (await api().get(`/api/controle/auxiliares/profissoes/${id}/pessoas`)).body.dados;
  assert.equal(dePessoas.profissao.nome, 'Engenheira civil'); assert.deepEqual(dePessoas.pessoas.map(p => p.id), [pf]);
  assert.equal((await api().get('/api/controle/auxiliares/profissoes/999999/pessoas')).status, 404);
  // renomear
  assert.equal((await api().put(`/api/controle/auxiliares/profissoes/${id}`).send({ nome: 'Engenheira de obras' })).status, 200);
  assert.equal((await um('SELECT nome FROM profissao WHERE id = ?', [id])).nome, 'Engenheira de obras');
  assert.equal((await api().put(`/api/controle/auxiliares/profissoes/${id}`).send({ nome: 'advogado' })).status, 400);          // já existe (outra)
  assert.equal((await api().put(`/api/controle/auxiliares/profissoes/${id}`).send({ nome: ' ' })).status, 400);
  assert.equal((await api().put('/api/controle/auxiliares/profissoes/999999').send({ nome: 'x' })).status, 404);
  // em uso por pessoa: não exclui
  const emUso = await api().delete(`/api/controle/auxiliares/profissoes/${id}`);
  assert.equal(emUso.status, 400); assert.match(msg(emUso), /1 pessoa\(s\) usando esta profissão/);
  await sql('UPDATE pessoas_fisicas SET profissao_id = NULL WHERE id = ?', [pf]);
  // em uso por freelancer: não exclui
  await sql("INSERT INTO advogados_freela (nome, profissao_id) VALUES ('Freela', ?)", [id]);
  const freela = await api().delete(`/api/controle/auxiliares/profissoes/${id}`);
  assert.equal(freela.status, 400); assert.match(msg(freela), /1 freelancer\(s\) usando esta profissão/);
  await sql('UPDATE advogados_freela SET profissao_id = NULL WHERE profissao_id = ?', [id]);
  assert.equal((await api().delete(`/api/controle/auxiliares/profissoes/${id}`)).status, 200);
  assert.equal(await total('SELECT COUNT(*) AS n FROM profissao WHERE id = ?', [id]), 0);
  assert.equal((await api().delete(`/api/controle/auxiliares/profissoes/${id}`)).status, 404);
  assert.equal((await api().delete('/api/controle/auxiliares/profissoes/abc')).status, 404);
});

// ------------------------------------------------------------------ unificar duplicados
test('unificar físicas: valida a seleção, trava CPFs diferentes, move partes/telefones/anotações para o principal, apaga os duplicados e o principal herda o CPF', async () => {
  const unir = (corpo) => api().post('/api/pessoas/fisicas/unificar').send(corpo);
  assert.match(msg(await unir({})), /Cadastro principal é obrigatório/);
  const principal = await criarPF({ nome: 'Principal Sem CPF', cpf: '' });
  assert.match(msg(await unir({ principal_id: principal })), /ao menos um cadastro duplicado/);
  assert.match(msg(await unir({ principal_id: principal, duplicados_ids: [principal] })), /ao menos um cadastro duplicado/);   // o principal na lista de duplicados é ignorado
  assert.match(msg(await unir({ principal_id: principal, duplicados_ids: [999999] })), /Algum cadastro selecionado não foi encontrado/);
  const dupA = await criarPF({ nome: 'Duplicado A', cpf: '39053344705', telefones: [{ numero: '19900009999' }], emails: [{ email: 'dupa@x.com' }] });
  const dupB = await criarPF({ nome: 'Duplicado B', cpf: '' });
  // CPFs diferentes entre os selecionados = pessoas diferentes
  const outroCpf = await criarPF({ cpf: '11144477735' });
  const trava = await unir({ principal_id: dupA, duplicados_ids: [outroCpf] });
  assert.equal(trava.status, 400); assert.match(msg(trava), /CPFs diferentes/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id IN (?, ?)', [dupA, outroCpf]), 2);
  // vínculos que valem
  const proc = await novoProcesso({ autores: [['fisica', dupA]], reus: [['fisica', dupB]] });
  const procRepetido = await novoProcesso({ autores: [['fisica', principal], ['fisica', dupB]] });   // principal e duplicado no MESMO polo
  await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('fisica', ?, 'nota do duplicado', 1)", [dupB]);
  await sql("INSERT INTO log_comunicacoes (canal, destinatario, pessoa_id, tipo_pessoa, usuario_id) VALUES ('whatsapp', '1999', ?, 'fisica', 1)", [dupB]);
  const ok = await unir({ principal_id: principal, duplicados_ids: [dupA, dupB, dupA] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.dados.unificados, 2);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id IN (?, ?)', [dupA, dupB]), 0);
  assert.equal((await um('SELECT cpf FROM pessoas_fisicas WHERE id = ?', [principal])).cpf, '39053344705');            // herdou o CPF do duplicado
  assert.deepEqual((await sql('SELECT pessoa_id FROM tbltituloprocautor WHERE proc_id = ?', [proc])).map(r => r.pessoa_id), [principal]);
  assert.deepEqual((await sql('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [proc])).map(r => r.pessoa_id), [principal]);
  assert.equal(await total('SELECT COUNT(*) AS n FROM tbltituloprocautor WHERE proc_id = ? AND pessoa_id = ?', [procRepetido, principal]), 1);   // repetição no mesmo processo some
  assert.equal(await total("SELECT COUNT(*) AS n FROM telefones_pf WHERE pessoa_id = ?", [principal]), 1);
  assert.equal(await total("SELECT COUNT(*) AS n FROM emails_pf WHERE pessoa_id = ?", [principal]), 1);
  assert.equal(await total("SELECT COUNT(*) AS n FROM historico_atendimento WHERE tipo_pessoa = 'fisica' AND pessoa_id = ?", [principal]), 1);
  assert.equal(await total("SELECT COUNT(*) AS n FROM log_comunicacoes WHERE tipo_pessoa = 'fisica' AND pessoa_id = ?", [principal]), 1);
  assert.equal((await auditoria('pessoas_fisicas', principal, 'unificar')).length, 1);
  for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu', 'historico_atendimento', 'log_comunicacoes']) {
    assert.equal(await total(`SELECT COUNT(*) AS n FROM ${tabela} WHERE pessoa_id IN (?, ?)`, [dupA, dupB]), 0, `órfão em ${tabela}`);
  }
});

test('unificar físicas: aviso de idade configurado e pendência de documentos bloqueiam (nada é apagado)', async () => {
  const principal = await criarPF({ cpf: '' }); const comAviso = await criarPF({ cpf: '', avisos_idade: [18] });
  const r = await api().post('/api/pessoas/fisicas/unificar').send({ principal_id: principal, duplicados_ids: [comAviso] });
  assert.equal(r.status, 400); assert.match(msg(r), /aviso de idade configurado/);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE id IN (?, ?)', [principal, comAviso]), 2);
});

test('unificar jurídicas: valida a seleção, move partes/telefones/e-mails/anotações, apaga os duplicados e preserva a marca de recuperação judicial', async () => {
  const unir = (corpo) => api().post('/api/pessoas/juridicas/unificar').send(corpo);
  assert.match(msg(await unir({})), /Cadastro principal é obrigatório/);
  const principal = await criarPJ({ razao_social: 'Empresa Principal Ltda' });
  assert.match(msg(await unir({ principal_id: principal })), /ao menos um cadastro duplicado/);
  assert.match(msg(await unir({ principal_id: principal, duplicados_ids: [999999] })), /Algum cadastro selecionado não foi encontrado/);
  const dup = await criarPJ({ razao_social: 'Empresa Duplicada Ltda', em_recuperacao_judicial: true, telefones: [{ numero: '1933330099' }], emails: [{ email: 'dup@emp.com' }] });
  const proc = await novoProcesso({ autores: [['juridica', dup]] });
  await sql("INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id) VALUES ('juridica', ?, 'nota da duplicada', 1)", [dup]);
  const ok = await unir({ principal_id: principal, duplicados_ids: [dup] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.dados.unificados, 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM pessoas_juridicas WHERE id = ?', [dup]), 0);
  assert.equal(Number((await um('SELECT em_recuperacao_judicial AS e FROM pessoas_juridicas WHERE id = ?', [principal])).e), 1);   // a marca não some
  assert.deepEqual((await sql('SELECT pessoa_id FROM tbltituloprocautor WHERE proc_id = ?', [proc])).map(r => r.pessoa_id), [principal]);
  assert.equal(await total('SELECT COUNT(*) AS n FROM telefones_pj WHERE pessoa_id = ?', [principal]), 1);
  assert.equal(await total('SELECT COUNT(*) AS n FROM emails_pj WHERE pessoa_id = ?', [principal]), 1);
  assert.equal(await total("SELECT COUNT(*) AS n FROM historico_atendimento WHERE tipo_pessoa = 'juridica' AND pessoa_id = ?", [principal]), 1);
  assert.equal((await auditoria('pessoas_juridicas', principal, 'unificar')).length, 1);
});

// ------------------------------------------------------------------ exportar para Excel
test('exportar Excel (física e jurídica): arquivo legível, só os campos permitidos, mesma busca da lista, só ativos', async () => {
  const marca = `Exp${Date.now() % 100000}`;
  await criarPF({ nome: `${marca} Bruno`, cpf: '39053344706', data_nascimento: '1985-12-01', telefones: [{ numero: '19900007777' }] });
  await criarPF({ nome: `${marca} Aline`, cpf: '39053344707' });
  await sql("INSERT INTO pessoas_fisicas (nome, cpf, ativo) VALUES (?, ?, 0)", [`${marca} Inativa`, cpfDe(930001)]);
  const baixar = async (caminho) => {
    const r = await api().get(caminho).buffer(true).parse(binario);
    assert.equal(r.status, 200, caminho);
    assert.match(r.headers['content-type'], /spreadsheetml\.sheet/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
    return { wb, r };
  };
  const { wb, r } = await baixar(`/api/pessoas/fisicas/exportar?busca=${marca}&campos=cpf,nome,data_nascimento,telefone,campo_inventado,senha_hash`);
  assert.match(r.headers['content-disposition'], /Pessoas F.sicas - \d{2}-\d{2}-\d{4}\.xlsx/);
  const ws = wb.getWorksheet('Pessoas Físicas');
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Nome', 'CPF', 'Data de nascimento', 'Telefone']);       // ordem canônica; campos inventados ficam de fora
  assert.deepEqual(ws.getRow(2).values.slice(1), [`${marca} Aline`, '39053344707', '', '']);
  assert.deepEqual(ws.getRow(3).values.slice(1), [`${marca} Bruno`, '39053344706', '01/12/1985', '19900007777']);
  assert.equal(ws.rowCount, 3);                                                                          // a inativa não sai
  const semCampos = await baixar(`/api/pessoas/fisicas/exportar?busca=${marca}`);
  assert.deepEqual(semCampos.wb.getWorksheet('Pessoas Físicas').getRow(1).values.slice(1), ['Nome']);    // sem campos pedidos = só o nome
  const vazio = await baixar('/api/pessoas/fisicas/exportar?busca=NinguemMesmoNaoExiste');
  assert.equal(vazio.wb.getWorksheet('Pessoas Físicas').rowCount, 1);
  await criarPJ({ razao_social: `${marca} Empresa Ltda`, cnpj: '11222333000200', telefones: [{ numero: '1933330200' }] });
  const pj = await baixar(`/api/pessoas/juridicas/exportar?busca=${marca}&campos=razao_social,cnpj,telefone`);
  const wsj = pj.wb.getWorksheet('Pessoas Jurídicas');
  assert.deepEqual(wsj.getRow(1).values.slice(1), ['Razão social', 'CNPJ', 'Telefone']);
  assert.deepEqual(wsj.getRow(2).values.slice(1), [`${marca} Empresa Ltda`, '11222333000200', '1933330200']);
});

// ------------------------------------------------------------------ processos da pessoa
test('processos da pessoa: junta autor e réu sem repetir (inclusive processo inativo, como a contagem da lista), tipo inválido = 400, sem processo = lista vazia', async () => {
  const pf = await criarPF(); const pj = await criarPJ(); const sem = await criarPF();
  const p1 = await novoProcesso({ autores: [['fisica', pf]], reus: [['fisica', pf]] });         // mesma pessoa nos dois polos: 1 processo
  const p2 = await novoProcesso({ reus: [['fisica', pf]], ativo: 0 });
  const p3 = await novoProcesso({ autores: [['juridica', pj]] });
  const lista = (await api().get(`/api/pessoas/fisicas/${pf}/processos`)).body.dados;
  assert.deepEqual(lista.map(p => p.id).sort(), [p1, p2].sort());
  assert.ok(lista[0].titulo && lista[0].pasta_numero_fmt);
  assert.deepEqual((await api().get(`/api/pessoas/juridicas/${pj}/processos`)).body.dados.map(p => p.id), [p3]);
  assert.deepEqual((await api().get(`/api/pessoas/fisicas/${sem}/processos`)).body.dados, []);
  assert.deepEqual((await api().get('/api/pessoas/fisicas/999999/processos')).body.dados, []);
  const ruim = await api().get(`/api/pessoas/clientes/${pf}/processos`);
  assert.equal(ruim.status, 400); assert.match(msg(ruim), /Tipo de pessoa inválido/);
  // o número da lista (qtde_proc) bate com a quantidade de processos devolvida
  const linha = (await api().get(`/api/pessoas/fisicas?busca=${encodeURIComponent((await um('SELECT nome FROM pessoas_fisicas WHERE id = ?', [pf])).nome)}`)).body.dados.registros[0];
  assert.equal(Number(linha.qtde_proc), lista.length);
});

// ------------------------------------------------------------------ parabéns, WhatsApp, SMS, e-mail avulso
test('parabéns: só cliente ativo com nascimento; dados prontos; WhatsApp registra uma vez por ano; e-mail exige e-mail cadastrado; canal e pessoa inválidos são recusados', async () => {
  const hoje = (await um("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d")).d;
  const nascimento = `1990${hoje.slice(4)}`;                                                      // faz aniversário HOJE
  const cliente = await criarPF({ nome: 'Cliente Aniversariante', data_nascimento: nascimento, telefones: [{ numero: '19900003333' }] });
  await novoProcesso({ autores: [['fisica', cliente]], polo: 'autor' });
  const naoCliente = await criarPF({ nome: 'Não é cliente', data_nascimento: nascimento });
  const dados = await api().get(`/api/pessoas/${cliente}/parabens`);
  assert.equal(dados.status, 200, JSON.stringify(dados.body));
  assert.equal(dados.body.dados.nome, 'Cliente Aniversariante'); assert.equal(dados.body.dados.telefone, '19900003333'); assert.equal(dados.body.dados.ja_parabenizado, false);
  assert.match(dados.body.dados.mensagem, /Cliente/);
  assert.equal((await api().get(`/api/pessoas/${naoCliente}/parabens`)).status, 404);          // quem não é parte-cliente de processo ativo
  assert.equal((await api().get('/api/pessoas/999999/parabens')).status, 404);
  const hojeLista = (await api().get('/api/pessoas/aniversariantes?filtro=hoje')).body.dados.registros.map(r => r.id);
  assert.ok(hojeLista.includes(cliente)); assert.ok(!hojeLista.includes(naoCliente));
  // canal inválido / pessoa inexistente / e-mail sem e-mail cadastrado
  assert.equal((await api().post(`/api/pessoas/${cliente}/parabens`).send({ canal: 'pombo' })).status, 400);
  assert.equal((await api().post(`/api/pessoas/${cliente}/parabens`).send({})).status, 400);
  assert.equal((await api().post('/api/pessoas/999999/parabens').send({ canal: 'whatsapp' })).status, 404);
  const semEmail = await api().post(`/api/pessoas/${cliente}/parabens`).send({ canal: 'email' });
  assert.equal(semEmail.status, 400); assert.match(msg(semEmail), /não tem e-mail cadastrado/);
  // WhatsApp: só registra
  assert.equal((await api().post(`/api/pessoas/${cliente}/parabens`).send({ canal: 'whatsapp' })).status, 200);
  assert.equal(await total("SELECT COUNT(*) AS n FROM parabens_enviados WHERE pessoa_id = ? AND canal = 'whatsapp'", [cliente]), 1);
  const depois = (await api().get(`/api/pessoas/${cliente}/parabens`)).body.dados;
  assert.equal(depois.ja_parabenizado, true); assert.equal(depois.parabens[0].canal, 'whatsapp'); assert.equal(depois.parabens[0].usuario_nome, 'Administrador de Testes');
  // apagar a pessoa leva junto o registro de parabéns (sem órfão): feito por CASCADE do banco
  await sql('DELETE FROM pessoas_fisicas WHERE id = ?', [naoCliente]);
});

test('WhatsApp, SMS e e-mail avulso: validações (telefone, mensagem, destino, assunto, tipo de arquivo) e registro da comunicação', async () => {
  // registrar o clique no WhatsApp
  const semTel = await api().post('/api/pessoas/registrar-zap').send({});
  assert.equal(semTel.status, 400); assert.match(msg(semTel), /Telefone é obrigatório/);
  const pf = await criarPF();
  assert.equal((await api().post('/api/pessoas/registrar-zap').send({ telefone: '19999990000', tipo_pessoa: 'fisica', pessoa_id: pf })).status, 200);
  const log = await um("SELECT * FROM log_comunicacoes WHERE canal = 'whatsapp' AND pessoa_id = ?", [pf]);
  assert.equal(log.destinatario, '19999990000'); assert.equal(log.tipo_pessoa, 'fisica'); assert.equal(log.usuario_id, 1); assert.equal(Number(log.enviado), 1);
  // SMS: sem configuração = aviso claro
  assert.equal((await api().get('/api/pessoas/sms-ativo')).body.dados.ativo, false);
  const sms = (corpo) => api().post('/api/pessoas/enviar-sms').send(corpo);
  assert.match(msg(await sms({ mensagem: 'oi' })), /Telefone é obrigatório/);
  assert.match(msg(await sms({ numero: '19999990000' })), /A mensagem do SMS é obrigatória/);
  assert.match(msg(await sms({ numero: '19999990000', mensagem: 'oi' })), /não está configurado/);
  // e-mail avulso: validações (o envio de verdade está no teste de e-mail com servidor falso)
  const email = (corpo) => api().post('/api/pessoas/enviar-email').send(corpo);
  assert.match(msg(await email({ assunto: 'a', mensagem: 'b' })), /e-mail de destino válido/);
  assert.match(msg(await email({ para: 'sem-arroba', assunto: 'a', mensagem: 'b' })), /e-mail de destino válido/);
  assert.match(msg(await email({ para: 'a@b.com', mensagem: 'b' })), /assunto do e-mail/);
  assert.match(msg(await email({ para: 'a@b.com', assunto: 'a' })), /Escreva a mensagem/);
  const executavel = await request(app).post('/api/pessoas/enviar-email').set('Authorization', `Bearer ${T.admin}`)
    .field('para', 'a@b.com').field('assunto', 'a').field('mensagem', 'b').attach('anexos', Buffer.from('MZ'), 'virus.exe');
  assert.equal(executavel.status, 400); assert.match(msg(executavel), /Tipo de arquivo não permitido/);
});
