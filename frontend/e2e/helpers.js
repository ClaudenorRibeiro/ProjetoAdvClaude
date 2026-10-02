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
    F.cliente = (await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Financeiro E2E', '52998224725')"))[0].insertId;
    F.parceiro = (await conn.execute("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro Financeiro E2E', '11144477735')"))[0].insertId;
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
