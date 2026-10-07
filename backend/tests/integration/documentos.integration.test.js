// Teste de servidor de DOCUMENTOS — SEM S3 (decisão do usuário: a S3 não participa da bateria).
// A geração tem 3 partes; só a do meio (baixar o modelo da S3) fica de fora:
//   1) levantar os dados do documento a partir do banco  -> variaveisResolver.resolver / resolverMultipessoas  (testado aqui)
//   2) baixar o modelo .docx da S3                         -> FORA da bateria
//   3) preencher o modelo com os dados                     -> docxModeloService.preencher                      (testado aqui)
// O modelo .docx é montado na memória do próprio teste. Também cobre as rotas que não tocam a S3
// (modelos-gerar, destinatário sugerido, lote/preparar, histórico, listas de modelos, catálogos, permissões).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const PizZip = require('pizzip');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const resolverVariaveis = require('../../src/services/variaveisResolver');
const docx = require('../../src/services/docxModeloService');

let app; let admin; let semPermissao;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (p, t = admin) => request(app).get(p).set('Authorization', `Bearer ${t}`);
const post = (p, t = admin) => request(app).post(p).set('Authorization', `Bearer ${t}`);
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const USUARIO = { id: 1, nome: 'Dr. Advogado de Teste' };

// ---- Modelo .docx montado na memória (nada de arquivo externo, nada de S3) ----
function criarDocx(paragrafos) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const corpo = paragrafos.map(p => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}
// Texto visível do .docx, um parágrafo por linha.
function textoDoDocx(buffer) {
  const xml = new PizZip(buffer).file('word/document.xml').asText();
  return xml.split('</w:p>').map(p => p.replace(/<[^>]+>/g, '')).filter(Boolean).join('\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');   // o Word grava & como &amp;
}
async function caixaAlta(ligada) {
  await sql('UPDATE configuracoes_escritorio SET documentos_maiusculas = ? WHERE id = 1', [ligada ? 1 : 0]);
}

const F = {};

test.before(async () => {
  await recriarBancoTeste();
  app = criarApp();
  admin = token(1, 1, 'sessao-admin');
  semPermissao = token(3, 2, 'sessao-sem-permissao');

  // Escritório
  await sql("UPDATE configuracoes_escritorio SET nome = 'Escritório Modelo & Filhos', cidade = 'Campinas', cnpj_cpf = '11.222.333/0001-81' WHERE id = 1");

  // Cliente (autora) — pessoa física com todos os campos usados nas conferências
  F.maria = (await sql(
    `INSERT INTO pessoas_fisicas (nome, cpf, rg, rg_orgao, nome_mae, data_nascimento, cep, logradouro, numero, bairro, cidade, estado, ativo, criado_por)
     VALUES ('Maria da Silva Souza', '12345678901', '12.345.678-9', 'SSP', 'Ana da Silva', '1980-03-25', '13010-000', 'Rua das Flores', '123', 'Centro', 'Campinas', 'SP', 1, 1)`
  )).insertId;
  await sql("INSERT INTO emails_pf (pessoa_id, email, principal, ativo) VALUES (?, 'Maria@Exemplo.com', 1, 1), (?, 'inativo@exemplo.com', 0, 0)", [F.maria, F.maria]);
  await sql("INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal, ativo) VALUES (?, '(19) 99999-0001', 'Celular', 1, 1)", [F.maria]);
  // Parte adversa (ré) — pessoa jurídica
  F.empresa = (await sql(
    `INSERT INTO pessoas_juridicas (razao_social, nome_fantasia, cnpj, cep, logradouro, numero, bairro, cidade, estado, ativo, criado_por)
     VALUES ('Construtora Alfa Ltda', 'Alfa Obras', '11222333000181', '13015-000', 'Av. Brasil', '500', 'Jardim', 'Campinas', 'SP', 1, 1)`
  )).insertId;

  // Processo 1 (semeado pelo banco de testes): maria autora (cliente_polo 'autor'), empresa ré
  await sql("UPDATE tblproc SET cliente_polo = 'autor', NomeTituloProc = 'Maria X Alfa' WHERE id = 1");
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (1, 'fisica', ?, 1)", [F.maria]);
  await sql("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (1, 'juridica', ?, 1)", [F.empresa]);

  // Audiência (tipo 4 'Instrução', presencial, 14:30 do dia 2026-06-18) e prazo
  F.aud = (await sql(
    `INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, local, status, criado_por)
     VALUES (1, 4, '2026-06-18', '14:30:00', 'presencial', 'Sala 5', 'agendada', 1)`
  )).insertId;
  F.audVirtual = (await sql(
    `INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, link_virtual, plataforma_virtual, status, criado_por)
     VALUES (1, 1, '2026-06-19', '09:00:00', 'virtual', 'https://zoom.exemplo/abc', 'Zoom', 'agendada', 1)`
  )).insertId;
  F.prazo = (await sql(
    `INSERT INTO prazos_processo (processo_id, subtipo_id, data_inicio, quantidade, data_vencimento, criado_por)
     VALUES (1, 1, '2026-01-05', 15, '2026-01-26', 1)`
  )).insertId;

  // Modelos (só o cadastro no banco; o arquivo da S3 não existe nem é lido nestes testes)
  const modelo = async (nome, destino, extra = {}) => (await sql(
    `INSERT INTO modelo_documento (nome, destino, arquivo_s3_key, blocos_exigidos, ativo, tipo_audiencia_id, modalidade, tipo_pericia_id, subtipo_prazo_id, criado_por)
     VALUES (?, ?, 'nao-usado-nos-testes.docx', ?, ?, ?, ?, ?, ?, 1)`,
    [nome, destino, extra.blocos ?? null, extra.ativo ?? 1, extra.tipoAud ?? null, extra.modalidade ?? null, extra.tipoPer ?? null, extra.subPrazo ?? null]
  )).insertId;
  F.mAudInstrPres = await modelo('Carta Instrução Presencial', 'audiencia', { tipoAud: 4, modalidade: 'presencial', blocos: 'cliente,processo,audiencia' });
  F.mAudInstrPres2 = await modelo('Aviso Instrução Presencial', 'audiencia', { tipoAud: 4, modalidade: 'presencial' });
  F.mAudInstrPresOff = await modelo('Antigo Instrução Presencial', 'audiencia', { tipoAud: 4, modalidade: 'presencial', ativo: 0 });
  F.mAudJulgVirt = await modelo('Carta Julgamento Virtual', 'audiencia', { tipoAud: 1, modalidade: 'virtual' });
  F.mPrazo = await modelo('Minuta Contestação', 'prazo', { subPrazo: 1 });
  F.mComumCliente = await modelo('Declaração de Comparecimento', 'comum', { blocos: 'cliente' });
  F.mComumProcesso = await modelo('Petição Inicial', 'comum', { blocos: 'cliente,processo' });
  F.mComumSoEscritorio = await modelo('Procuração do Escritório', 'comum');
  F.mReciboCli = await modelo('Recibo do Cliente', 'recibo_cliente');
  F.mReciboPar = await modelo('Recibo do Parceiro', 'recibo_parceria');
  F.mPartes = await modelo('Documento de Partes', 'multipessoas');
});
test.after(async () => {
  require('node-cron').getTasks().forEach(tarefa => tarefa.stop());
  await pool.end();
});

// ============================================================ 1) dados do documento (variaveisResolver)
test('pessoa física: o bloco do cliente sai com CPF formatado, endereço montado, telefone e dados do escritório', async () => {
  const ctx = await resolverVariaveis.resolver('pessoa_fisica', F.maria, USUARIO);
  const d = ctx.dados;
  assert.equal(d.nome_cliente, 'Maria da Silva Souza');
  assert.equal(d.cpf_cliente, '123.456.789-01');
  assert.equal(d.documento_cliente, '123.456.789-01');
  assert.equal(d.rg_cliente, '12.345.678-9');
  assert.equal(d.rg_orgao, 'SSP');
  assert.equal(d.nome_mae, 'Ana da Silva');
  assert.equal(d.data_nascimento, '25/03/1980');
  assert.equal(d.endereco_cliente, 'Rua das Flores, 123 - Centro - Campinas/SP - CEP 13010-000');
  assert.deepEqual(d.telefones, [{ numero: '(19) 99999-0001', tipo: 'Celular' }]);
  assert.equal(d.nome_escritorio, 'Escritório Modelo & Filhos');
  assert.equal(d.cnpj_escritorio, '11.222.333/0001-81');
  assert.equal(d.nome_advogado, 'Dr. Advogado de Teste');
  assert.equal(d.cidade_hoje, 'Campinas');
  assert.match(d.data_hoje, /^\d{1,2} de [a-zç]+ de \d{4}$/);
  assert.equal(ctx.clienteNome, 'Maria da Silva Souza');
  assert.equal(ctx.numProcDigitos, '');
  assert.equal(ctx.referencia, 'Cliente Maria da Silva Souza');
});

test('pessoa jurídica: razão social, fantasia e CNPJ formatado; CPF e responsável legal ficam vazios', async () => {
  const d = (await resolverVariaveis.resolver('pessoa_juridica', F.empresa, USUARIO)).dados;
  assert.equal(d.nome_cliente, 'Construtora Alfa Ltda');
  assert.equal(d.nome_fantasia, 'Alfa Obras');
  assert.equal(d.cnpj_cliente, '11.222.333/0001-81');
  assert.equal(d.documento_cliente, '11.222.333/0001-81');
  assert.equal(d.endereco_cliente, 'Av. Brasil, 500 - Jardim - Campinas/SP - CEP 13015-000');
  assert.ok(!d.cpf_cliente);
});

test('audiência: dados do processo (cliente, parte adversa, partes) e da audiência (data, hora, modalidade)', async () => {
  const ctx = await resolverVariaveis.resolver('audiencia', F.aud, USUARIO);
  const d = ctx.dados;
  assert.equal(d.numero_processo, '0000001-01.2026.5.15.0001');
  assert.equal(d.titulo_processo, 'Maria X Alfa');
  assert.equal(d.nome_cliente, 'Maria da Silva Souza');
  assert.equal(d.parte_adversa, 'Construtora Alfa Ltda');
  assert.equal(d.parte_adversa_documento, '11.222.333/0001-81');
  assert.equal(d.tipo_processo, 'Judicial');
  assert.equal(d.data_audiencia, '18/06/2026');
  assert.equal(d.hora_audiencia, '14:30');
  assert.equal(d.tipo_audiencia, 'Instrução');
  assert.equal(d.modalidade_audiencia, 'presencial');
  assert.equal(d.local_audiencia, 'Sala 5');
  assert.deepEqual(d.autores.map(a => a.nome), ['Maria da Silva Souza']);
  assert.deepEqual(d.reus.map(r => r.nome), ['Construtora Alfa Ltda']);
  assert.equal(ctx.clienteNome, 'Maria da Silva Souza');
  assert.equal(ctx.numProcDigitos, '00000010120265150001');
  assert.equal(ctx.referencia, 'Proc 0000001-01.2026.5.15.0001 · Cliente Maria da Silva Souza · Audiência 18/06/2026');
});

test('audiência virtual traz o link e a plataforma; "minutos antes" do modelo adianta só o horário impresso', async () => {
  const d = (await resolverVariaveis.resolver('audiencia', F.audVirtual, USUARIO)).dados;
  assert.equal(d.link_audiencia, 'https://zoom.exemplo/abc');
  assert.equal(d.plataforma_audiencia, 'Zoom');
  assert.equal(d.hora_audiencia, '09:00');
  const adiantada = (await resolverVariaveis.resolver('audiencia', F.audVirtual, USUARIO, { minutosAntes: 90 })).dados;
  assert.equal(adiantada.hora_audiencia, '07:30');
  assert.equal(adiantada.hora_audiencia_real, '09:00');
  const trava = (await resolverVariaveis.resolver('audiencia', F.audVirtual, USUARIO, { minutosAntes: 9999 })).dados;
  assert.equal(trava.hora_audiencia, '00:00');
});

test('prazo: dados do processo e do cliente (sem bloco de audiência)', async () => {
  const ctx = await resolverVariaveis.resolver('prazo', F.prazo, USUARIO);
  assert.equal(ctx.dados.nome_cliente, 'Maria da Silva Souza');
  assert.equal(ctx.dados.parte_adversa, 'Construtora Alfa Ltda');
  assert.equal(ctx.dados.data_audiencia, undefined);
  assert.equal(ctx.referencia, 'Proc 0000001-01.2026.5.15.0001 · Cliente Maria da Silva Souza');
});

test('origem que não existe ou tipo desconhecido volta vazio (a rota responde erro claro, não quebra)', async () => {
  assert.equal(await resolverVariaveis.resolver('audiencia', 999999, USUARIO), null);
  assert.equal(await resolverVariaveis.resolver('prazo', 999999, USUARIO), null);
  assert.equal(await resolverVariaveis.resolver('pessoa_fisica', 999999, USUARIO), null);
  assert.equal(await resolverVariaveis.resolver('tipo_que_nao_existe', 1, USUARIO), null);
});

test('cliente é o RÉU: o polo do cliente troca e a parte adversa passa a ser o autor', async () => {
  await sql("UPDATE tblproc SET cliente_polo = 'reu' WHERE id = 1");
  try {
    const d = (await resolverVariaveis.resolver('prazo', F.prazo, USUARIO)).dados;
    assert.equal(d.nome_cliente, 'Construtora Alfa Ltda');
    assert.equal(d.parte_adversa, 'Maria da Silva Souza');
  } finally {
    await sql("UPDATE tblproc SET cliente_polo = 'autor' WHERE id = 1");
  }
});

// ============================================================ 2) CAIXA ALTA
test('CAIXA ALTA desligada: nomes saem como cadastrados', async () => {
  await caixaAlta(false);
  const d = (await resolverVariaveis.resolver('audiencia', F.aud, USUARIO)).dados;
  assert.equal(d.nome_cliente, 'Maria da Silva Souza');
  assert.equal(d.parte_adversa, 'Construtora Alfa Ltda');
  assert.equal(d.autores[0].nome, 'Maria da Silva Souza');
});

test('CAIXA ALTA ligada: SÓ o nome do autor e do réu vai para maiúsculas — CPF, endereço, escritório e demais dados não mudam', async () => {
  await caixaAlta(true);
  try {
    const d = (await resolverVariaveis.resolver('audiencia', F.aud, USUARIO)).dados;
    assert.equal(d.nome_cliente, 'MARIA DA SILVA SOUZA');
    assert.equal(d.parte_adversa, 'CONSTRUTORA ALFA LTDA');
    assert.equal(d.autores[0].nome, 'MARIA DA SILVA SOUZA');
    assert.equal(d.reus[0].nome, 'CONSTRUTORA ALFA LTDA');
    // nada além dos nomes pode mudar
    assert.equal(d.cpf_cliente, '123.456.789-01');
    assert.equal(d.endereco_cliente, 'Rua das Flores, 123 - Centro - Campinas/SP - CEP 13010-000');
    assert.equal(d.nome_mae, 'Ana da Silva');
    assert.equal(d.nome_escritorio, 'Escritório Modelo & Filhos');
    assert.equal(d.titulo_processo, 'Maria X Alfa');
    assert.equal(d.tipo_audiencia, 'Instrução');
    assert.equal(d.local_audiencia, 'Sala 5');
    // vale também para documento gerado direto da pessoa
    assert.equal((await resolverVariaveis.resolver('pessoa_fisica', F.maria, USUARIO)).dados.nome_cliente, 'MARIA DA SILVA SOUZA');
  } finally { await caixaAlta(false); }
});

// ============================================================ 3) documento de partes (multipessoas)
test('documento de partes: autores × réus escolhidos, na ordem, com a referência e o nome do cliente', async () => {
  const ctx = await resolverVariaveis.resolverMultipessoas(
    [{ tipo: 'fisica', id: F.maria }], [{ tipo: 'juridica', id: F.empresa }, { tipo: 'fisica', id: 999999 }], USUARIO);
  assert.deepEqual(ctx.dados.autores.map(a => a.nome), ['Maria da Silva Souza']);
  assert.deepEqual(ctx.dados.reus.map(r => r.nome), ['Construtora Alfa Ltda']);   // pessoa que não existe é ignorada
  assert.equal(ctx.clienteNome, 'Maria da Silva Souza');
  assert.equal(ctx.referencia, 'Autores: Maria da Silva Souza · Réus: Construtora Alfa Ltda');
  assert.equal(ctx.dados.nome_escritorio, 'Escritório Modelo & Filhos');
  const vazio = await resolverVariaveis.resolverMultipessoas('lixo', undefined, USUARIO);
  assert.deepEqual([vazio.dados.autores, vazio.dados.reus, vazio.clienteNome], [[], [], '']);
});

test('documento de partes com CAIXA ALTA ligada: só os nomes', async () => {
  await caixaAlta(true);
  try {
    const ctx = await resolverVariaveis.resolverMultipessoas([{ tipo: 'fisica', id: F.maria }], [{ tipo: 'juridica', id: F.empresa }], USUARIO);
    assert.equal(ctx.dados.autores[0].nome, 'MARIA DA SILVA SOUZA');
    assert.equal(ctx.dados.reus[0].nome, 'CONSTRUTORA ALFA LTDA');
    assert.equal(ctx.dados.autores[0].cpf, '123.456.789-01');
  } finally { await caixaAlta(false); }
});

// ============================================================ 4) preencher o modelo (docxModeloService)
test('preencher: troca os marcadores pelo texto, repete autores/réus e deixa vazio o que não tem valor', async () => {
  const modelo = criarDocx([
    'Cliente: {{nome_cliente}} - CPF {{cpf_cliente}}',
    'Audiência em {{data_audiencia}} às {{hora_audiencia}} ({{modalidade_audiencia}})',
    'Contra: {{parte_adversa}}',
    '{{#autores}}Autor: {{nome}};{{/autores}}',
    '{{#reus}}Réu: {{nome}};{{/reus}}',
    'Marcador sem valor: [{{variavel_sem_valor}}]',
    'Escritório: {{nome_escritorio}}',
  ]);
  const dados = (await resolverVariaveis.resolver('audiencia', F.aud, USUARIO)).dados;
  const texto = textoDoDocx(docx.preencher(modelo, dados));
  assert.equal(texto, [
    'Cliente: Maria da Silva Souza - CPF 123.456.789-01',
    'Audiência em 18/06/2026 às 14:30 (presencial)',
    'Contra: Construtora Alfa Ltda',
    'Autor: Maria da Silva Souza;',
    'Réu: Construtora Alfa Ltda;',
    'Marcador sem valor: []',
    'Escritório: Escritório Modelo & Filhos',
  ].join('\n'));
  assert.ok(!/undefined|\{\{/.test(texto));
});

test('preencher com CAIXA ALTA ligada: o texto final do documento tem o nome em maiúsculas e o resto igual', async () => {
  await caixaAlta(true);
  try {
    const modelo = criarDocx(['{{nome_cliente}} contra {{parte_adversa}} - CPF {{cpf_cliente}} - {{endereco_cliente}}']);
    const dados = (await resolverVariaveis.resolver('audiencia', F.aud, USUARIO)).dados;
    assert.equal(textoDoDocx(docx.preencher(modelo, dados)),
      'MARIA DA SILVA SOUZA contra CONSTRUTORA ALFA LTDA - CPF 123.456.789-01 - Rua das Flores, 123 - Centro - Campinas/SP - CEP 13010-000');
  } finally { await caixaAlta(false); }
});

test('preencher: modelo com defeito (marcador mal fechado) e arquivo que não é .docx dão ERRO, nunca um documento torto', async () => {
  assert.throws(() => docx.preencher(criarDocx(['Olá {{nome_cliente']), { nome_cliente: 'X' }));
  assert.throws(() => docx.preencher(Buffer.from('isto não é um zip'), { nome_cliente: 'X' }));
  assert.equal(docx.ehDocxValido(Buffer.from('isto não é um zip')), false);
  assert.equal(docx.ehDocxValido(criarDocx(['ok'])), true);
});

test('analisar o modelo: separa variáveis conhecidas das desconhecidas e diz quais blocos ele exige', async () => {
  const a = docx.analisar(criarDocx(['{{nome_cliente}} {{numero_processo}} {{data_audiencia}} {{inventada_que_nao_existe}} {{nome_escritorio}}']));
  assert.deepEqual(a.desconhecidas, ['inventada_que_nao_existe']);
  assert.deepEqual([...a.conhecidas].sort(), ['data_audiencia', 'nome_cliente', 'nome_escritorio', 'numero_processo']);
  assert.deepEqual([...a.blocos].sort(), ['audiencia', 'cliente', 'processo']);   // 'escritorio' nunca é bloco exigido
  assert.deepEqual(docx.analisar(criarDocx(['só {{nome_escritorio}}'])).blocos, []);
  assert.deepEqual(docx.extrairVariaveis(criarDocx(['{{ nome_cliente }} e {{nome_cliente}} de novo'])), ['nome_cliente']);   // espaços e repetição
  const partes = docx.analisarMultipessoas(criarDocx(['{{#autores}}{{nome}} {{cpf}}{{/autores}} {{numero_processo}}']));
  assert.deepEqual(partes.desconhecidas, ['numero_processo']);   // dado do processo não vale em "documento de partes"
});

test('quais modelos servem a cada origem (blocos que a origem alcança)', async () => {
  assert.equal(resolverVariaveis.modeloCompativel('', 'pessoa'), true);                       // só escritório: serve em qualquer origem
  assert.equal(resolverVariaveis.modeloCompativel('cliente', 'pessoa'), true);
  assert.equal(resolverVariaveis.modeloCompativel('cliente,processo', 'pessoa'), false);
  assert.equal(resolverVariaveis.modeloCompativel('cliente,processo', 'prazo'), true);
  assert.equal(resolverVariaveis.modeloCompativel('cliente,processo,audiencia', 'prazo'), false);
  assert.equal(resolverVariaveis.modeloCompativel('cliente,processo,audiencia', 'audiencia'), true);
  assert.deepEqual(resolverVariaveis.blocosAlcancados('audiencia'), ['cliente', 'processo', 'audiencia']);
  assert.deepEqual(resolverVariaveis.blocosAlcancados('origem_inventada'), []);
});

// ============================================================ 5) rotas que NÃO tocam a S3
test('modelos-gerar: só os modelos ATIVOS do mesmo tipo e modalidade da audiência', async () => {
  const r = await get(`/api/documentos/modelos-gerar?ancora=audiencia&ancora_id=${F.aud}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.dados.map(m => m.nome), ['Aviso Instrução Presencial', 'Carta Instrução Presencial']);   // sem o desativado e sem o "Julgamento Virtual"
  const virt = await get(`/api/documentos/modelos-gerar?ancora=audiencia&ancora_id=${F.audVirtual}`);
  assert.deepEqual(virt.body.dados.map(m => m.nome), ['Carta Julgamento Virtual']);
  assert.deepEqual((await get('/api/documentos/modelos-gerar?ancora=audiencia&ancora_id=999999')).body.dados, []);
});

test('modelos-gerar: prazo (pelo subtipo), pessoa (só os que cabem numa pessoa), recibos de repasse (cliente x parceiro) e documento de partes', async () => {
  const nomes = async url => (await get(url)).body.dados.map(m => m.nome);
  assert.deepEqual(await nomes(`/api/documentos/modelos-gerar?ancora=prazo&ancora_id=${F.prazo}`), ['Minuta Contestação']);
  assert.deepEqual(await nomes(`/api/documentos/modelos-gerar?ancora=pessoa_fisica&ancora_id=${F.maria}`), ['Declaração de Comparecimento', 'Procuração do Escritório']);
  assert.deepEqual(await nomes('/api/documentos/modelos-gerar?ancora=pagamento&ancora_id=1'), ['Recibo do Cliente']);
  assert.deepEqual(await nomes('/api/documentos/modelos-gerar?ancora=pagamento&ancora_id=1&beneficiario=parceiro'), ['Recibo do Parceiro']);
  assert.deepEqual(await nomes('/api/documentos/modelos-gerar?ancora=multipessoas'), ['Documento de Partes']);
  assert.deepEqual(await nomes('/api/documentos/modelos-gerar?ancora=origem_inventada&ancora_id=1'), []);
});

test('destinatário sugerido: a própria pessoa, ou o CLIENTE do processo; só e-mails ativos; sem origem = 400', async () => {
  const pessoa = (await get(`/api/documentos/destinatario-sugerido?ancora_tipo=pessoa_fisica&ancora_id=${F.maria}`)).body.dados;
  assert.deepEqual({ t: pessoa.tipo_pessoa, id: pessoa.pessoa_id, nome: pessoa.nome, e: pessoa.emails }, { t: 'fisica', id: F.maria, nome: 'Maria da Silva Souza', e: ['maria@exemplo.com'] });
  const daAudiencia = (await get(`/api/documentos/destinatario-sugerido?ancora_tipo=audiencia&ancora_id=${F.aud}`)).body.dados;
  assert.deepEqual({ id: daAudiencia.pessoa_id, proc: daAudiencia.processo_id }, { id: F.maria, proc: 1 });
  const semCliente = (await get('/api/documentos/destinatario-sugerido?ancora_tipo=audiencia&ancora_id=999999')).body.dados;
  assert.deepEqual({ id: semCliente.pessoa_id, e: semCliente.emails }, { id: null, e: [] });
  assert.equal((await get('/api/documentos/destinatario-sugerido?ancora_tipo=audiencia')).status, 400);
  assert.equal((await get('/api/documentos/destinatario-sugerido')).status, 400);
});

test('lote/preparar: agrupa as audiências por tipo+modalidade com os modelos de cada grupo; origem ou lista inválida = 400', async () => {
  const r = await post('/api/documentos/lote/preparar').send({ ancora_tipo: 'audiencia', ancora_ids: [F.aud, F.audVirtual, 'abc', -3, 0] });
  assert.equal(r.status, 200);
  const grupos = r.body.dados.grupos;
  assert.equal(grupos.length, 2);
  const g = rot => grupos.find(x => x.rotulo === rot);
  assert.deepEqual(g('Instrução — Presencial').ancora_ids, [F.aud]);
  assert.deepEqual(g('Instrução — Presencial').modelos.map(m => m.nome), ['Aviso Instrução Presencial', 'Carta Instrução Presencial']);
  assert.deepEqual(g('Julgamento — Virtual').modelos.map(m => m.nome), ['Carta Julgamento Virtual']);
  assert.equal((await post('/api/documentos/lote/preparar').send({ ancora_tipo: 'prazo', ancora_ids: [1] })).status, 400);
  assert.equal((await post('/api/documentos/lote/preparar').send({ ancora_tipo: 'audiencia', ancora_ids: ['x', 0] })).status, 400);
  assert.equal((await post('/api/documentos/lote/preparar').send({ ancora_tipo: 'audiencia' })).status, 400);
});

test('lista e detalhe de modelos: só ativos por padrão, desativados com incluir_inativos, e id ruim = 404 (nunca 500)', async () => {
  const ativos = (await get('/api/documentos/modelos')).body.dados.map(m => m.nome);
  assert.ok(ativos.includes('Carta Instrução Presencial') && !ativos.includes('Antigo Instrução Presencial'));
  const todos = (await get('/api/documentos/modelos?incluir_inativos=1')).body.dados;
  assert.ok(todos.some(m => m.nome === 'Antigo Instrução Presencial' && m.ativo === 0));
  assert.ok(todos.every(m => !('arquivo_s3_key' in m)));          // a lista NUNCA traz o caminho do arquivo
  const um = await get(`/api/documentos/modelos/${F.mAudInstrPres}`);
  assert.equal(um.status, 200);
  assert.deepEqual({ n: um.body.dados.nome, d: um.body.dados.destino, m: um.body.dados.modalidade }, { n: 'Carta Instrução Presencial', d: 'audiencia', m: 'presencial' });
  assert.ok(!('arquivo_s3_key' in um.body.dados));
  assert.equal((await get('/api/documentos/modelos/999999')).status, 404);
  assert.equal((await get('/api/documentos/modelos/abc')).status, 404);
});

test('catálogos de variáveis e opções de destino do modelo', async () => {
  const cat = (await get('/api/documentos/variaveis')).body.dados;
  assert.ok(cat.cliente.variaveis.some(v => v.tag === 'nome_cliente'));
  assert.ok(cat.audiencia.variaveis.some(v => v.tag === 'data_audiencia'));
  const partes = (await get('/api/documentos/variaveis-partes')).body.dados;
  assert.ok(JSON.stringify(partes).includes('"nome"'));
  const op = (await get('/api/documentos/destinos-opcoes')).body.dados;
  assert.deepEqual(op.modalidades.map(m => m.valor), ['presencial', 'virtual', 'sem_comparecimento']);
  assert.ok(op.tipos_audiencia.some(t => t.nome === 'Instrução'));
  assert.ok(op.subtipos_prazo.some(s => s.nome === 'Contestação' && s.tipo_prazo_nome === 'Processual'));
});

test('histórico de documentos gerados: mais recente primeiro, filtro por datas, paginação e limite ruim não quebram', async () => {
  await sql(`INSERT INTO log_documentos_gerados (modelo_nome, formato, ancora_tipo, referencia, nome_arquivo, usuario_id, usuario_nome, gerado_em) VALUES
    ('Modelo A', 'docx', 'audiencia', 'ref A', 'a.docx', 1, 'Administrador de Testes', '2026-03-01 10:00:00'),
    ('Modelo B', 'pdf',  'prazo',     'ref B', 'b.pdf',  1, 'Administrador de Testes', '2026-03-05 11:00:00'),
    ('Modelo C', 'docx', 'pessoa_fisica', 'ref C', 'c.docx', 1, 'Administrador de Testes', '2026-03-10 12:00:00')`);
  const tudo = (await get('/api/documentos/historico')).body.dados;
  assert.equal(tudo.total, 3);
  assert.deepEqual(tudo.registros.map(x => x.modelo_nome), ['Modelo C', 'Modelo B', 'Modelo A']);
  const faixa = (await get('/api/documentos/historico?de=2026-03-02&ate=2026-03-05')).body.dados;
  assert.deepEqual(faixa.registros.map(x => x.modelo_nome), ['Modelo B']);    // o dia final entra inteiro (até 23:59:59)
  assert.equal(faixa.total, 1);
  const pag = (await get('/api/documentos/historico?limite=2&pagina=2')).body.dados;
  assert.deepEqual(pag.registros.map(x => x.modelo_nome), ['Modelo A']);
  assert.equal(pag.total, 3);
  for (const ruim of ['pagina=-4&limite=abc', 'pagina=0&limite=0', 'limite=99999']) {
    const r = await get(`/api/documentos/historico?${ruim}`);
    assert.equal(r.status, 200, ruim);
  }
});

// ============================================================ 6) permissões
test('usuário SEM permissão leva 403 em tudo de Documentos que não é público (e sem login = 401)', async () => {
  const rotas = [
    '/api/documentos/modelos', `/api/documentos/modelos/${F.mAudInstrPres}`, '/api/documentos/destinos-opcoes',
    `/api/documentos/modelos-gerar?ancora=audiencia&ancora_id=${F.aud}`, `/api/documentos/destinatario-sugerido?ancora_tipo=pessoa_fisica&ancora_id=${F.maria}`,
    '/api/documentos/historico',
  ];
  for (const rota of rotas) {
    assert.equal((await get(rota, semPermissao)).status, 403, `GET ${rota}`);
    assert.equal((await request(app).get(rota)).status, 401, `GET ${rota} sem login`);
  }
  for (const rota of ['/api/documentos/gerar', '/api/documentos/gerar-e-enviar', '/api/documentos/gerar-multipessoas', '/api/documentos/lote/preparar', '/api/documentos/lote/gerar']) {
    assert.equal((await post(rota, semPermissao).send({})).status, 403, `POST ${rota}`);
  }
});

test('gerar com dados incompletos ou modelo que não existe: aviso claro, nunca "Erro interno" (500)', async () => {
  for (const [rota, corpo] of [
    ['/api/documentos/gerar', {}],
    ['/api/documentos/gerar', { modelo_id: 999999, ancora_tipo: 'audiencia', ancora_id: F.aud }],
    ['/api/documentos/gerar', { modelo_id: 'abc', ancora_tipo: 'audiencia', ancora_id: F.aud }],
    ['/api/documentos/gerar-e-enviar', {}],
    ['/api/documentos/gerar-multipessoas', {}],
    ['/api/documentos/gerar-multipessoas', { modelo_id: 999999, autores: [{ tipo_pessoa: 'fisica', pessoa_id: F.maria }], reus: [] }],
    ['/api/documentos/lote/gerar', {}],
  ]) {
    const r = await post(rota).send(corpo);
    assert.ok(r.status >= 400 && r.status < 500, `${rota} ${JSON.stringify(corpo)} → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
    assert.ok(r.body.mensagem, `${rota}: sem mensagem`);
  }
});
