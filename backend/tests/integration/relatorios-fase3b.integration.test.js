// Relatórios (Fase 3B) — assuntos Processos, Pessoas físicas e Pessoas jurídicas contra MySQL real.
// Cada número da API é conferido contra uma consulta escrita à mão e contra as telas antigas
// (Processos parados e Aniversariantes), que já têm regra própria.
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

let app; let admin; let usuario; let semPermissao; let soRelatorios;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
const req = (t = admin) => ({
  get: p => request(app).get(p).set('Authorization', `Bearer ${t}`),
  post: p => request(app).post(p).set('Authorization', `Bearer ${t}`),
});
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };
const PRIMEIRA = { processos: 'pasta', pessoas_fisicas: 'nome', pessoas_juridicas: 'razao_social' };
const receita = (assunto, extra = {}) => ({ assunto, colunas: [PRIMEIRA[assunto]], filtros: { op: 'E', itens: [] }, ordem: [], ...extra });
const rodar = (t, corpo) => req(t).post('/api/relatorios/executar').send(corpo);
const grupos = (r) => Object.fromEntries(r.body.dados.linhas.filter(l => l.tipo === 'grupo').map(l => [String(l.chaves[0]), l.valores[0]]));
const filtro = (campo, operador, valor = null) => ({ op: 'E', itens: [{ campo, operador, valor }] });

test.before(async () => {
  await recriarBancoTeste();
  // Processos: P1 (já existe, pasta 99001), P2 e P5 na mesma pasta, P3 arquivado, P4 INATIVO (nunca aparece)
  await sql("INSERT INTO tblpasta (id, numPasta, criado_por) VALUES (2, 5, 1), (3, 1234, 1), (4, 7, 1)");
  await sql("INSERT INTO tbltipoproc (id, nome, codTipoProc, ativo, criado_por) VALUES (2, 'Trabalhista', 'T', 1, 1), (3, 'Cível', 'C', 1, 1)");
  await sql("INSERT INTO tblstatusproc (id, nome, encerra_processo, ativo, criado_por) VALUES (2, 'Arquivado', 1, 1, 1)");
  await sql("INSERT INTO tblinstanciaproc (id, nome, ativo) VALUES (1, 'Primeira instância', 1)");
  await sql(`INSERT INTO tblproc (id, pasta_id, numProc, cliente_polo, NomeTituloProc, tipo_id, status_id, instancia_id, data_distribuicao, responsavel_id, ativo, criado_por, criado_em) VALUES
    (2, 2, '0000002-02.2026.5.15.0001', 'reu',   'PROCESSO DOIS',  2, 1,    1,    '2025-03-10', 2,    1, 1, '2020-01-01 10:00:00'),
    (3, 3, '0000003-03.2026.5.15.0001', 'autor', 'PROCESSO TRES',  3, 2,    NULL, NULL,         NULL, 1, 1, '2020-01-01 10:00:00'),
    (4, 4, '0000004-04.2026.5.15.0001', 'autor', 'PROCESSO QUATRO',1, 1,    NULL, NULL,         NULL, 0, 1, '2020-01-01 10:00:00'),
    (5, 2, '0000005-05.2026.5.15.0001', 'autor', 'PROCESSO CINCO', 2, NULL, NULL, NULL,         1,    1, 1, '2020-06-01 10:00:00')`);
  await sql("INSERT INTO andamento_processual (processo_id, data, descricao, fonte) VALUES (2, '2025-01-01', 'a', 'manual'), (5, '2024-06-01', 'b', 'manual')");

  // Pessoas físicas: Ana (cliente, mar), Bruno (autor em processo cujo cliente é o réu → não cliente), Carla (réu-cliente, sem nascimento), Dario INATIVO
  await sql("INSERT INTO estado_civil (id, nome) VALUES (1, 'Solteiro'), (2, 'Casado')");
  await sql(`INSERT INTO pessoas_fisicas (id, nome, cpf, data_nascimento, cidade, estado, estado_civil_id, ativo) VALUES
    (1, 'Ana Teste',   '111.111.111-11', '1990-03-15', 'São Paulo', 'SP', 1, 1),
    (2, 'Bruno Teste', '222.222.222-22', '1985-03-20', 'Campinas',  'SP', 2, 1),
    (3, 'Carla Teste', '333.333.333-33', NULL,         'São Paulo', 'SP', NULL, 1),
    (4, 'Dario Inativo', NULL, '1980-01-01', 'Santos', 'SP', NULL, 0)`);
  await sql("INSERT INTO telefones_pf (pessoa_id, numero, principal, ativo) VALUES (1, '11-1111', 0, 1), (1, '11-2222', 1, 1), (2, '19-0000', 0, 0)");
  await sql("INSERT INTO emails_pf (pessoa_id, email, principal, ativo) VALUES (1, 'ana@example.invalid', 1, 1)");
  await sql("INSERT INTO pessoas_juridicas (id, razao_social, nome_fantasia, cnpj, em_recuperacao_judicial, cidade, estado, ativo) VALUES (1, 'Empresa Alfa Ltda', 'Alfa', '11.111.111/0001-11', 1, 'São Paulo', 'SP', 1), (2, 'Beta SA', NULL, NULL, 0, 'Campinas', 'SP', 1), (3, 'Gama Inativa', NULL, NULL, 0, 'Santos', 'SP', 0)");
  await sql("INSERT INTO telefones_pj (pessoa_id, numero, principal, ativo) VALUES (1, '11-9999', 1, 1)");
  await sql("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', 1), (2, 'fisica', 2), (4, 'fisica', 2), (3, 'fisica', 1)");
  await sql("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id) VALUES (2, 'fisica', 3), (2, 'juridica', 1)");
  // usuário que PODE usar relatórios, mas não tem os módulos deste arquivo
  await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
             VALUES (5, 'So Relatorios', 'sorel', 'x', 'sorel@example.invalid', 'advogado', 2, 1, 0, 'sessao-so-rel', 0, 0)`);
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (5, 'relatorios', NULL, 'visualizar', 1), (5, 'prazos', NULL, 'visualizar', 1)");
  app = criarApp();
  soRelatorios = token(5, 2, 'sessao-so-rel');
  admin = token(1, 1, 'sessao-admin'); usuario = token(2, 2, 'sessao-usuario'); semPermissao = token(3, 2, 'sessao-sem-permissao');
});
test.after(async () => pool.end());

test('catálogo: processos e pessoas aparecem só para quem tem permissão no módulo', async () => {
  const a = await req(admin).get('/api/relatorios/catalogo');
  const chaves = a.body.dados.assuntos.map(x => x.chave);
  for (const c of ['processos', 'pessoas_fisicas', 'pessoas_juridicas']) assert.ok(chaves.includes(c), c);
  assert.doesNotMatch(JSON.stringify(a.body), /JOIN_ULTIMA|andamento_processual|SUB_CLIENTES|tbltitulo|pr\.ativo/);   // nunca vaza SQL
  const proc = a.body.dados.assuntos.find(x => x.chave === 'processos');
  const dias = proc.campos.find(c => c.chave === 'dias_parado');
  assert.deepEqual(dias.funcoes.map(f => f.valor), ['soma', 'media', 'minimo', 'maximo']);
  assert.equal((await req(usuario).get('/api/relatorios/catalogo')).status, 200);
  const so = await req(soRelatorios).get('/api/relatorios/catalogo');
  assert.equal(so.status, 200);
  const chavesSo = so.body.dados.assuntos.map(x => x.chave);
  for (const [assunto] of [['processos', 'processos'], ['pessoas_fisicas', 'pessoas'], ['pessoas_juridicas', 'pessoas']]) assert.ok(!chavesSo.includes(assunto), `${assunto} não deveria aparecer`);
  assert.ok(chavesSo.includes('prazos'));
  for (const [assunto] of [['processos', 'processos'], ['pessoas_fisicas', 'pessoas'], ['pessoas_juridicas', 'pessoas']]) assert.equal((await rodar(soRelatorios, { receita: receita(assunto) })).status, 403, assunto);
  for (const assunto of ['processos', 'pessoas_fisicas', 'pessoas_juridicas']) {
    assert.equal((await rodar(semPermissao, { receita: receita(assunto) })).status, 403, assunto);
  }
});

test('processos: só os ativos (como a tela), pasta formatada sem cortar e para todos os usuários com permissão', async () => {
  for (const t of [admin, usuario]) {
    const r = await rodar(t, { receita: receita('processos', { colunas: ['pasta', 'processo', 'titulo'] }), limite: 50 });
    assert.equal(r.status, 200);
    assert.equal(r.body.dados.total, 4);                   // P4 é inativo
  }
  const r = await rodar(admin, { receita: receita('processos', { colunas: ['pasta'] }), limite: 50 });
  assert.deepEqual(r.body.dados.linhas.map(l => l.pasta).sort(), ['0005', '0005', '1234', '99001']);   // 4 dígitos mínimos; 99001 não é cortado
  assert.ok(r.body.dados.linhas.every(l => l.__pasta_id));                                         // link para abrir a pasta
});

test('processos: filtros e agrupamentos batem com o gabarito', async () => {
  const total = async (f) => (await rodar(admin, { receita: receita('processos', { colunas: ['pasta'], filtros: f }) })).body.dados.total;
  assert.equal(await total(filtro('status', 'em', ['1'])), 2);
  assert.equal(await total(filtro('status', 'vazio')), 1);
  assert.equal(await total(filtro('polo', 'em', ['reu'])), 1);
  assert.equal(await total(filtro('responsavel', 'em', ['2'])), 1);
  assert.equal(await total(filtro('data_distribuicao', 'entre', ['2025-01-01', '2025-12-31'])), 1);
  assert.equal(await total(filtro('titulo', 'contem', 'DOIS')), 1);
  assert.equal(await total(filtro('encerrado', 'verdadeiro')), 1);

  const porTipo = await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'tipo' }] }) });
  assert.deepEqual(grupos(porTipo), { 1: 1, 2: 2, 3: 1 });                  // a "área" do processo é o Tipo (a pasta não tem área)
  const porStatus = await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'status' }] }) });
  assert.deepEqual(grupos(porStatus), { 1: 2, 2: 1, null: 1 });
  const porPolo = await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'polo' }] }) });
  assert.deepEqual(grupos(porPolo), { autor: 3, reu: 1 });
});

test('processos: "dias sem movimentação" = regra de Processos parados (mesmo resultado da tela antiga)', async () => {
  const r = await rodar(admin, { receita: receita('processos', { colunas: ['processo', 'ultima_movimentacao', 'dias_parado'], ordem: [{ campo: 'processo', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  const gab = await sql(`SELECT numProc, DATEDIFF(CURDATE(), ?) d2 FROM tblproc WHERE id = 2`, ['2025-01-01']);
  const linha = (n) => r.body.dados.linhas.find(l => l.processo === n);
  assert.equal(Number(linha('0000002-02.2026.5.15.0001').dias_parado), Number(gab[0].d2));   // último andamento 01/01/2025
  assert.equal(Number(linha('0000001-01.2026.5.15.0001').dias_parado), 0);                   // acabou de ser criado
  const d3 = (await sql("SELECT DATEDIFF(CURDATE(), '2020-01-01') d"))[0].d;
  assert.equal(Number(linha('0000003-03.2026.5.15.0001').dias_parado), Number(d3));          // nunca teve ação: vale a data de cadastro

  // Mesmo conjunto da tela "Processos parados" com 365 dias (que ignora status que encerra)
  const antiga = await req(admin).get('/api/processos/parados?dias=365');
  const idsAntiga = antiga.body.dados.processos.map(p => p.numero).sort();
  const nova = await rodar(admin, { receita: receita('processos', { colunas: ['processo'], filtros: { op: 'E', itens: [
    { campo: 'dias_parado', operador: 'maior_igual', valor: 365 }, { campo: 'encerrado', operador: 'falso' }] } }), limite: 50 });
  assert.deepEqual(nova.body.dados.linhas.map(l => l.processo).sort(), idsAntiga);
  assert.ok(idsAntiga.length >= 1 && !idsAntiga.includes('0000003-03.2026.5.15.0001'));      // arquivado fica de fora

  const medias = await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'tipo' }], metricas: [{ funcao: 'contagem' }, { funcao: 'maximo', campo: 'dias_parado' }] }) });
  assert.equal(medias.status, 200);
  const trab = medias.body.dados.linhas.find(l => l.tipo === 'grupo' && String(l.chaves[0]) === '2');
  const gabMax = (await sql("SELECT GREATEST(DATEDIFF(CURDATE(), '2025-01-01'), DATEDIFF(CURDATE(), '2024-06-01')) m"))[0].m;
  assert.deepEqual(trab.valores.map(Number), [2, Number(gabMax)]);
});

test('processos: vara, fórum e instância só entram quando pedidos; processo sem elas continua na lista', async () => {
  const r = await rodar(admin, { receita: receita('processos', { colunas: ['processo', 'instancia', 'vara', 'forum', 'responsavel'], ordem: [{ campo: 'processo', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 4);
  const p2 = r.body.dados.linhas.find(l => l.processo === '0000002-02.2026.5.15.0001');
  assert.equal(p2.instancia, 'Primeira instância');
  assert.equal(p2.responsavel, 'Usuário de Testes');
  assert.equal(p2.vara, null);
});

test('pessoas físicas: só as ativas; telefone/e-mail principais; idade e próximo aniversário conferem', async () => {
  const r = await rodar(admin, { receita: receita('pessoas_fisicas', { colunas: ['nome', 'telefone', 'email', 'idade', 'proximo_aniversario', 'estado_civil'], ordem: [{ campo: 'nome', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 3);                       // Dario é inativo
  const [ana, bruno, carla] = r.body.dados.linhas;
  assert.deepEqual([ana.nome, ana.telefone, ana.email, ana.estado_civil], ['Ana Teste', '11-2222', 'ana@example.invalid', 'Solteiro']);   // principal, não o primeiro
  assert.deepEqual([bruno.telefone, bruno.email], [null, null]);                                                                          // telefone inativo não conta
  assert.equal(carla.idade, null);
  assert.equal(carla.proximo_aniversario, null);

  const [{ hoje }] = await sql("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') hoje");
  const idadeGab = (nasc) => { const [y, m, d] = nasc.split('-').map(Number); const [hy, hm, hd] = hoje.split('-').map(Number); return hy - y - ((hm < m || (hm === m && hd < d)) ? 1 : 0); };
  assert.equal(Number(ana.idade), idadeGab('1990-03-15'));
  const prox = (nasc) => { const [, m, d] = nasc.split('-'); const hy = Number(hoje.slice(0, 4)); const este = `${hy}-${m}-${d}`; return este >= hoje ? este : `${hy + 1}-${m}-${d}`; };
  assert.equal(String(ana.proximo_aniversario).slice(0, 10), prox('1990-03-15'));
});

test('pessoas físicas: mês do aniversário, cliente e quantidade de processos', async () => {
  const total = async (f) => (await rodar(admin, { receita: receita('pessoas_fisicas', { colunas: ['nome'], filtros: f }) })).body.dados.total;
  assert.equal(await total(filtro('mes_aniversario', 'em', ['3'])), 2);
  assert.equal(await total(filtro('cliente', 'verdadeiro')), 2);          // Ana (autora de P1) e Carla (ré-cliente de P2); Bruno não
  assert.equal(await total(filtro('cliente', 'falso')), 1);
  assert.equal(await total(filtro('cpf', 'comeca_com', '111')), 1);
  assert.equal(await total(filtro('data_nascimento', 'vazio')), 1);

  const porMes = await rodar(admin, { receita: receita('pessoas_fisicas', { agrupar: [{ campo: 'mes_aniversario' }] }) });
  assert.deepEqual(grupos(porMes), { 3: 2, null: 1 });
  assert.equal(porMes.body.dados.linhas.find(l => l.tipo === 'grupo' && l.chaves[0] === 3).rotulos[0], 'Março');
  const porCidade = await rodar(admin, { receita: receita('pessoas_fisicas', { agrupar: [{ campo: 'cidade' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'qtde_processos' }] }) });
  const sp = porCidade.body.dados.linhas.find(l => l.tipo === 'grupo' && l.chaves[0] === 'São Paulo');
  assert.deepEqual(sp.valores.map(Number), [2, 3]);                        // Ana (P1 + P3) + Carla (P2)
  // o mesmo número que a tela de Pessoas mostra na coluna "Processos"
  const gab = await sql(`SELECT pf.id, (SELECT COUNT(*) FROM (SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa='fisica' AND pessoa_id=pf.id UNION SELECT proc_id FROM tbltituloprocreu WHERE tipo_pessoa='fisica' AND pessoa_id=pf.id) t) n FROM pessoas_fisicas pf WHERE pf.ativo = 1 ORDER BY pf.nome`);
  const lista = await rodar(admin, { receita: receita('pessoas_fisicas', { colunas: ['qtde_processos'], ordem: [{ campo: 'nome', direcao: 'asc' }] }), limite: 50 });
  assert.deepEqual(lista.body.dados.linhas.map(l => Number(l.qtde_processos)), gab.map(g => Number(g.n)));
});

test('pessoas físicas: aniversariantes do mês = mesma lista da tela antiga (só clientes)', async () => {
  const antiga = await req(admin).get('/api/pessoas/aniversariantes?filtro=mes&mes=3');
  assert.equal(antiga.status, 200);
  const nomesAntiga = antiga.body.dados.registros.map(r => r.nome).sort();
  const nova = await rodar(admin, { receita: receita('pessoas_fisicas', { colunas: ['nome'], filtros: { op: 'E', itens: [
    { campo: 'cliente', operador: 'verdadeiro', valor: null }, { campo: 'mes_aniversario', operador: 'em', valor: ['3'] }] } }) });
  assert.deepEqual(nova.body.dados.linhas.map(l => l.nome).sort(), nomesAntiga);
  assert.deepEqual(nomesAntiga, ['Ana Teste']);
});

test('pessoas jurídicas: só as ativas, recuperação judicial, telefone principal e quantidade de processos', async () => {
  const r = await rodar(admin, { receita: receita('pessoas_juridicas', { colunas: ['razao_social', 'nome_fantasia', 'cnpj', 'recuperacao', 'telefone', 'qtde_processos'], ordem: [{ campo: 'razao_social', direcao: 'asc' }] }), limite: 50 });
  assert.equal(r.status, 200);
  assert.equal(r.body.dados.total, 2);                       // Gama é inativa
  const [beta, alfa] = r.body.dados.linhas;               // ordem alfabética: Beta antes de Empresa
  assert.deepEqual([alfa.razao_social, alfa.telefone, Number(alfa.qtde_processos)], ['Empresa Alfa Ltda', '11-9999', 1]);
  assert.equal(beta.telefone, null);
  assert.equal(Number(beta.qtde_processos), 0);
  const rec = await rodar(admin, { receita: receita('pessoas_juridicas', { colunas: ['razao_social'], filtros: filtro('recuperacao', 'verdadeiro') }) });
  assert.equal(rec.body.dados.total, 1);
  const porCidade = await rodar(admin, { receita: receita('pessoas_juridicas', { agrupar: [{ campo: 'cidade' }] }) });
  assert.deepEqual(grupos(porCidade), { 'São Paulo': 1, Campinas: 1 });
});

test('recusas e Excel: totais só em campos numéricos; Excel com os dados certos', async () => {
  assert.equal((await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'tipo' }], metricas: [{ funcao: 'soma', campo: 'titulo' }] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('processos', { agrupar: [{ campo: 'observacoes' }] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('pessoas_fisicas', { colunas: ['razao_social'] }) })).status, 422);
  assert.equal((await rodar(admin, { receita: receita('pessoas_juridicas', { colunas: ['cpf'] }) })).status, 422);

  const res = await req(admin).post('/api/relatorios/exportar').buffer(true).parse(binario).send({ receita: receita('processos', { colunas: ['pasta', 'processo', 'status', 'dias_parado'] }), formato: 'xlsx', nome: 'Processos' });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body);
  const ws = wb.getWorksheet(1);
  assert.equal(ws.rowCount, 1 + 4);
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Pasta', 'Processo', 'Status', 'Dias sem movimentação']);
});
