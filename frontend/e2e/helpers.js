import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';

export async function loginPelaTela(page, login = 'admteste', senha = 'TesteSeguro123!') {
  await page.goto('/login');
  await page.getByPlaceholder('Seu login').fill(login);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/dashboard');
}

export async function bloquearRedeExterna(page) {
  await page.route('**/*', async (rota) => {
    const url = new URL(rota.request().url());
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (local || ['data:', 'blob:'].includes(url.protocol)) await rota.continue();
    else await rota.abort('blockedbyclient');
  });
}

export async function criarAudiencia(request, hora = '10:20', modalidade = 'sem_comparecimento') {
  const login = await request.post('http://127.0.0.1:3001/api/auth/login', {
    data: { login: 'admteste', senha: 'TesteSeguro123!' },
  });
  if (!login.ok()) throw new Error(`Login de preparação falhou: ${login.status()} ${await login.text()}`);
  const token = (await login.json()).dados.token;
  const resposta = await request.post('http://127.0.0.1:3001/api/audiencias', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      processo_id: 1,
      tipo_audiencia_id: 1,
      data: '2001-01-01',
      hora,
      modalidade,
      responsaveis: [],
      testemunhas: [],
      observacoes: 'Criada pela bateria E2E',
    },
  });
  if (!resposta.ok()) throw new Error(`Preparação da audiência falhou: ${resposta.status()} ${await resposta.text()}`);
  return (await resposta.json()).dados.id;
}

// Abre o menu "⋮" de uma linha. O navegador de teste rola a tabela até o botão e o
// evento de rolagem chega logo depois do clique, o que fecha o menu (o sistema fecha
// o menu ao rolar). Por isso rolamos antes e esperamos a tela assentar.
export async function abrirMenuAcoes(page, linha) {
  const botao = linha.getByTitle('Mais ações');
  await botao.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await botao.click();
}


export const criarAudienciaSemComparecimento = (request, hora) => criarAudiencia(request, hora, 'sem_comparecimento');

// Espera a tela terminar de carregar (rede quieta e sem "Carregando..."), para a análise
// de acessibilidade nunca ler uma tela pela metade — isso fazia o teste passar sem verificar nada.
export async function aguardarTelaPronta(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('.loading') && !/Carregando/i.test(document.body.innerText));
  await page.waitForTimeout(300);
}

// Coloca uma pessoa como AUTOR do processo 1 do banco de teste (o processo de teste nasce sem partes, e a
// testemunha da ata precisa dizer "de quem" ela é testemunha). Usa a mesma conexão isolada dos testes de banco.
export async function adicionarAutorAoProcesso(nome = 'Autor Do Processo') {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  try {
    const [r] = await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES (?, '11144477735')", [nome]);
    await conn.execute("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [r.insertId]);
  } finally { await conn.end(); }
}

// Violações SÉRIAS ou CRÍTICAS de acessibilidade da tela (ou janela) aberta agora; [] = tudo certo.
export async function violacoesGraves(page) {
  // Espera as animações que têm fim (ex.: aviso "toast" entrando, com texto ainda meio transparente), senão o
  // verificador de contraste lê uma cor que existe só por uma fração de segundo.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => {}))));
  const resultado = await new AxeBuilder({ page }).analyze();
  return resultado.violations.filter(v => ['serious', 'critical'].includes(v.impact))
    .map(v => ({ regra: v.id, itens: v.nodes.map(n => {
      const d = n.any[0]?.data;   // no contraste: cor do texto / cor do fundo / razão encontrada
      return `${d?.fgColor ? `[${d.fgColor} sobre ${d.bgColor} = ${d.contrastRatio}] ` : ''}${n.html.replace(/\s+/g, ' ').slice(0, 140)}`;
    }) }));
}

// Dados do Financeiro para os testes de tela (tudo criado ANTES de entrar pela tela: um novo login derruba a sessão anterior).
// Cria: banco, conta do escritório, caixa físico, formas de pagamento, cliente (autor) e parceiro com conta bancária, e
// devolve os identificadores. Pessoas entram direto no banco de teste (a mesma conexão isolada dos testes de banco).
export async function prepararFinanceiro(request) {
  const API = 'http://127.0.0.1:3001/api';
  const login = await request.post(`${API}/auth/login`, { data: { login: 'admteste', senha: 'TesteSeguro123!' } });
  const t = (await login.json()).dados.token;
  const h = { Authorization: `Bearer ${t}` };
  const post = async (rota, data) => { const r = await request.post(`${API}${rota}`, { headers: h, data }); if (!r.ok()) throw new Error(`${rota}: ${r.status()} ${await r.text()}`); return (await r.json()).dados; };
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  const F = {};
  try {
    F.banco = (await post('/financeiro/instituicoes-financeiras', { nome: 'Banco E2E' })).id;
    F.contaBanco = (await post('/financeiro/contas-escritorio', { nome: 'Conta E2E', tipo: 'bancaria', instituicao_financeira_id: F.banco, agencia: '1', numero: '2', digito: '3', principal: true })).id;
    F.caixa = (await post('/financeiro/contas-escritorio', { nome: 'Caixa E2E', tipo: 'especie' })).id;
    F.formaDinheiro = (await post('/financeiro/formas-pagamento', { nome: 'Dinheiro E2E', uso_permitido: 'especie' })).id;
    F.formaPix = (await post('/financeiro/formas-pagamento', { nome: 'Pix E2E', uso_permitido: 'financeira' })).id;
    F.cliente = (await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Financeiro E2E', '16899535009')"))[0].insertId;
    F.parceiro = (await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro Financeiro E2E', '39053344705')"))[0].insertId;
    await conn.execute("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (1, 'fisica', ?)", [F.cliente]);
    F.contaCliente = (await post(`/financeiro/beneficiario/fisica/${F.cliente}/conta`, { instituicao_financeira_id: F.banco, agencia: '0001', numero: '12345', digito: '6', principal: true })).id;
    F.contaParceiro = (await post(`/financeiro/beneficiario/fisica/${F.parceiro}/conta`, { instituicao_financeira_id: F.banco, chave_pix: 'parceiro@example.invalid' })).id;
  } finally { await conn.end(); }
  F.token = t; F.cab = h;
  // acordo de 2 parcelas (R$ 1.000 cada), honorário 30%, parceria de 50% do honorário e cliente como beneficiário
  F.novoAcordo = async (descricao = 'Acordo E2E') => (await post('/financeiro/processo/1/acordo', {
    descricao, valor_total: 2000, qtd_parcelas: 2, data_primeira: '2026-01-05',
    beneficiario_cliente_tipo: 'fisica', beneficiario_cliente_id: F.cliente, beneficiario_cliente_conta_id: F.contaCliente,
    parcelas: [1, 2].map(n => ({ numero: n, vencimento: `2026-0${n}-05`, valor_bruto: 1000, honor_tipo: 'percent', honor_percentual: 30,
      parceria_pessoa_tipo: 'fisica', parceria_pessoa_id: F.parceiro, parceria_tipo: 'percent', parceria_percentual: 50 })),
  })).id;
  F.parcelas = async (acordoId) => (await (await request.get(`${API}/financeiro/acordo/${acordoId}`, { headers: h })).json()).dados.parcelas;
  F.api = async (metodo, rota, data) => { const r = await request[metodo](`${API}${rota}`, { headers: h, data }); if (!r.ok()) throw new Error(`${rota}: ${r.status()} ${await r.text()}`); return (await r.json()).dados; };
  return F;
}

// Dados da LISTA de Processos (passo B1): 26 pastas (8101 a 8125 e a 430), cada uma com um processo ativo, para a paginação (20 por página),
// a busca (título, CNJ, protocolo, partes, CPF, telefone), os assuntos e as etiquetas pessoais/do escritório. Tudo por SQL (sem login pela API:
// um novo login derruba a sessão anterior) e com nomes próprios, para não atrapalhar os outros testes que usam o mesmo banco.
//   pasta 8100+i: título "LISTA E2E ii", CNJ "70000ii-11.2026.5.15.0001", protocolo "PROT-LISTA-ii"
//   autora "Cliente Lista Silva" (CPF 71428793860, tel 11955554444) nas pastas 8101 a 8103
//   assunto A: pastas 8101-8105; assunto B: pastas 8104-8108
//   etiquetas pessoais do admin: slot 1 "Urgente E2E" (8101, 8102), slot 2 "Aguardando E2E" (8103)
//   etiquetas do escritório: slot 1 "Arquivada E2E" (8101, 8102), slot 2 "Em recurso E2E" (8103)
export async function prepararListaProcessos() {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  const info = { pastaId: {}, procId: {} };
  const numeros = [...Array.from({ length: 25 }, (_, k) => 8101 + k), 430];       // a pasta 430 serve para provar "430 == 0430"
  try {
    const [jaTem] = await conn.execute('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 8101');
    if (jaTem[0].n) {                                                               // já preparado (o teste foi repetido): só lê os identificadores
      for (const n of numeros) {
        const [[r]] = await conn.execute('SELECT pa.id AS pasta, (SELECT MIN(p.id) FROM tblproc p WHERE p.pasta_id = pa.id) AS proc FROM tblpasta pa WHERE pa.numPasta = ?', [n]);
        info.pastaId[n] = r.pasta; info.procId[n] = r.proc;
      }
      return info;
    }
    const assuntoA = (await conn.execute("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Lista A', 1)"))[0].insertId;
    const assuntoB = (await conn.execute("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Lista B', 1)"))[0].insertId;
    const autora = (await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Lista Silva', '71428793860')"))[0].insertId;
    await conn.execute("INSERT INTO telefones_pf (pessoa_id, numero) VALUES (?, '11955554444')", [autora]);
    for (let i = 1; i <= 26; i += 1) {
      const ii = String(i).padStart(2, '0');
      const numPasta = i <= 25 ? 8100 + i : 430;
      const pastaId = (await conn.execute('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [numPasta]))[0].insertId;
      const procId = (await conn.execute(
        `INSERT INTO tblproc (pasta_id, numProc, protocolo, NomeTituloProc, tipo_id, status_id, ativo, criado_por)
         VALUES (?, ?, ?, ?, 1, 1, 1, 1)`, [pastaId, `70000${ii}-11.2026.5.15.0001`, `PROT-LISTA-${ii}`, `LISTA E2E ${ii}`]))[0].insertId;
      info.pastaId[numPasta] = pastaId; info.procId[numPasta] = procId;
      if (i <= 3) await conn.execute("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'fisica', ?)", [procId, autora]);
      if (i <= 5) await conn.execute('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [procId, assuntoA]);
      if (i >= 4 && i <= 8) await conn.execute('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [procId, assuntoB]);
    }
    await conn.execute("INSERT INTO etiquetas_definicoes (usuario_id, modulo, slot, cor, significado) VALUES (1, 'pastas', 1, '#e24b4a', 'Urgente E2E'), (1, 'pastas', 2, '#378add', 'Aguardando E2E')");
    await conn.execute('INSERT INTO pastas_etiquetas (pasta_id, usuario_id, slot) VALUES (?, 1, 1), (?, 1, 1), (?, 1, 2)', [info.pastaId[8101], info.pastaId[8102], info.pastaId[8103]]);
    await conn.execute("INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado) VALUES ('processos', 1, '#639922', 'Arquivada E2E'), ('processos', 2, '#ef9f27', 'Em recurso E2E')");
    await conn.execute('INSERT INTO processos_etiquetas_escritorio (processo_id, slot) VALUES (?, 1), (?, 1), (?, 2)', [info.procId[8101], info.procId[8102], info.procId[8103]]);
  } finally { await conn.end(); }
  return info;
}

// Usuário comum que só pode VER Processos (sem cadastrar/alterar/excluir), com a senha padrão de teste. Devolve o login.
export async function criarUsuarioSoVisualiza(login = 'sovisualiza') {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const bcrypt = createRequire(import.meta.url)('../../backend/node_modules/bcryptjs');
  const conn = await conectarBancoTeste();
  try {
    const id = (await conn.execute(
      `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, notif_email, google_agenda_ativo)
       VALUES ('Usuário Só Visualiza', ?, ?, ?, 'advogado', 2, 1, 0, 0, 0)`,
      [login, bcrypt.hashSync('TesteSeguro123!', 4), `${login}@example.invalid`]))[0].insertId;
    await conn.execute("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'processos', NULL, 'visualizar', 1)", [id]);
  } finally { await conn.end(); }
  return login;
}

// Quantas pastas a lista deve mostrar agora (pastas com pelo menos um processo ativo).
export async function contarPastasDaLista() {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  try { return Number((await conn.execute('SELECT COUNT(*) AS n FROM tblpasta pa WHERE EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id AND p.ativo = 1)'))[0][0].n); }
  finally { await conn.end(); }
}

// Dados da janela "Novo Processo" (passo B2). Idempotente (se o teste for repetido, só relê os identificadores). Mexe em configurações
// do escritório (advogado principal) e na OAB dos usuários 1 e 2; `restaurarNovoProcesso` devolve isso ao que era.
//   status "Conhecimento" e instância "1ª Instância" (a janela os pré-seleciona); tipo "Trabalhista E2E" (código 5); fórum Norte com
//   2 varas (a "Vara Norte 1" tem o código 5150002, o do CNJ ...5.15.0002) e fórum Sul com 1 vara; pessoas, perito, advogado avulso;
//   pasta 7001 EM USO (um processo ativo) e pasta 7002 VAZIA (existe, sem processo ativo).
export async function prepararNovoProcesso() {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  const id = async (sql, params = []) => (await conn.execute(sql, params))[0].insertId;
  const um = async (sql, params = []) => (await conn.execute(sql, params))[0][0];
  const d = {};
  try {
    // Sempre refeito (o fim de cada processo de teste desfaz isto, e o Playwright reinicia o processo após uma falha):
    // OAB dos usuários 1 e 2 (a janela só oferece quem tem OAB) e advogado principal do escritório = usuário 1
    await conn.execute("UPDATE usuarios SET oab = 'SP 111111' WHERE id = 1"); await conn.execute("UPDATE usuarios SET oab = 'SP 222222' WHERE id = 2");
    await conn.execute('UPDATE configuracoes_escritorio SET advogado_principal_id = 1 WHERE id = 1');
    await conn.execute("UPDATE tblproc SET protocolo = 'PROT-EMUSO-E2E' WHERE numProc = '8000001-00.2026.5.15.0001'");   // (no-op na 1ª vez: o processo ainda não existe; abaixo já nasce com ele)
    const jaTem = await um("SELECT id FROM tblstatusproc WHERE nome = 'Conhecimento E2E'");
    if (jaTem) {
      const ler = async (sql, p = []) => (await um(sql, p)).id;
      Object.assign(d, {
        autor1: await ler("SELECT id FROM pessoas_fisicas WHERE nome = 'Alberto Autor E2E'"), autor2: await ler("SELECT id FROM pessoas_fisicas WHERE nome = 'Beatriz Autora E2E'"),
        reu1: await ler("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Empresa Alfa E2E Ltda'"), reu2: await ler("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Empresa Beta E2E Ltda'"),
        perito: await ler("SELECT id FROM pessoas_fisicas WHERE nome = 'Perito Paulo E2E'"), forumNorte: await ler("SELECT id FROM tblforum WHERE nome = 'Fórum Norte E2E'"),
        varaNorte1: await ler("SELECT id FROM tblvara WHERE nome = 'Vara Norte 1 E2E'"), tipo: await ler("SELECT id FROM tbltipoproc WHERE nome = 'Trabalhista E2E'"),
        assuntoA: await ler("SELECT id FROM tblassuntoproc WHERE nome = 'Assunto Novo A E2E'"), assuntoB: await ler("SELECT id FROM tblassuntoproc WHERE nome = 'Assunto Novo B E2E'"),
        pastaEmUso: await ler('SELECT id FROM tblpasta WHERE numPasta = 7001'), pastaVazia: await ler('SELECT id FROM tblpasta WHERE numPasta = 7002'),
      });
      return d;
    }
    d.statusConhecimento = await id("INSERT INTO tblstatusproc (nome, ativo) VALUES ('Conhecimento E2E', 1)");
    d.instancia1 = await id("INSERT INTO tblinstanciaproc (nome, ativo) VALUES ('1ª Instância E2E', 1)");
    await id("INSERT INTO tblinstanciaproc (nome, ativo) VALUES ('2ª Instância E2E', 1)");
    d.tipo = await id("INSERT INTO tbltipoproc (nome, codTipoProc, ativo) VALUES ('Trabalhista E2E', '5', 1)");
    d.forumNorte = await id("INSERT INTO tblforum (nome, cidade, uf, ativo) VALUES ('Fórum Norte E2E', 'Campinas', 'SP', 1)");
    d.forumSul = await id("INSERT INTO tblforum (nome, cidade, uf, ativo) VALUES ('Fórum Sul E2E', 'Santos', 'SP', 1)");
    d.varaNorte1 = await id("INSERT INTO tblvara (forum_id, nome, abrev_nome, codVaraNoProc, ativo) VALUES (?, 'Vara Norte 1 E2E', '1ª Norte', '5150002', 1)", [d.forumNorte]);
    d.varaNorte2 = await id("INSERT INTO tblvara (forum_id, nome, ativo) VALUES (?, 'Vara Norte 2 E2E', 1)", [d.forumNorte]);
    d.varaSul1 = await id("INSERT INTO tblvara (forum_id, nome, ativo) VALUES (?, 'Vara Sul 1 E2E', 1)", [d.forumSul]);
    d.assuntoA = await id("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Novo A E2E', 1)");
    d.assuntoB = await id("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Assunto Novo B E2E', 1)");
    d.autor1 = await id("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Alberto Autor E2E', '90000000001')");
    d.autor2 = await id("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Beatriz Autora E2E', '90000000002')");
    d.perito = await id("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Perito Paulo E2E', '90000000003')");
    d.reu1 = await id("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Empresa Alfa E2E Ltda', '90000000000101')");
    d.reu2 = await id("INSERT INTO pessoas_juridicas (razao_social, cnpj) VALUES ('Empresa Beta E2E Ltda', '90000000000202')");
    await conn.execute("INSERT INTO advogados_freela (nome, oab) VALUES ('Avulso E2E', 'RJ 99999')");
    // pasta 7001 em uso (1 processo ativo) e pasta 7002 vazia (só processo inativo)
    d.pastaEmUso = await id("INSERT INTO tblpasta (numPasta, criado_por) VALUES (7001, 1)");
    await conn.execute("INSERT INTO tblproc (pasta_id, numProc, protocolo, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '8000001-00.2026.5.15.0001', 'PROT-EMUSO-E2E', 'PASTA EM USO E2E', 1, 1, 1, 1)", [d.pastaEmUso]);
    d.pastaVazia = await id("INSERT INTO tblpasta (numPasta, criado_por) VALUES (7002, 1)");
    await conn.execute("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '8000002-00.2026.5.15.0001', 'PASTA VAZIA E2E', 1, 1, 0, 1)", [d.pastaVazia]);
  } finally { await conn.end(); }
  return d;
}
export async function restaurarNovoProcesso() {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const conn = await conectarBancoTeste();
  try {
    await conn.execute('UPDATE configuracoes_escritorio SET advogado_principal_id = NULL WHERE id = 1');
    await conn.execute('UPDATE usuarios SET oab = NULL WHERE id IN (1, 2)');
  } finally { await conn.end(); }
}

// Usuário comum com UMA lista exata de permissões [[módulo, submódulo|null, ação], ...], senha padrão de teste. Devolve o login.
export async function criarUsuarioComPermissoes(login, permissoes) {
  const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
  const bcrypt = createRequire(import.meta.url)('../../backend/node_modules/bcryptjs');
  const conn = await conectarBancoTeste();
  try {
    const [jaExiste] = await conn.execute('SELECT id FROM usuarios WHERE login = ?', [login]);
    if (jaExiste.length) return login;
    const id = (await conn.execute(
      `INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, notif_email, google_agenda_ativo)
       VALUES (?, ?, ?, ?, 'advogado', 2, 1, 0, 0, 0)`,
      [`Usuário ${login}`, login, bcrypt.hashSync('TesteSeguro123!', 4), `${login}@example.invalid`]))[0].insertId;
    for (const [m, s, a] of permissoes) await conn.execute('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  } finally { await conn.end(); }
  return login;
}
