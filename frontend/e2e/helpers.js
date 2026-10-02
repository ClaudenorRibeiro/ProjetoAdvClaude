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
