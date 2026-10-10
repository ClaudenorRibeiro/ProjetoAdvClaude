import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers';

test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

test('@critical login, proteção de rota e navegação principal', async ({ page }) => {
  await page.goto('/audiencias');
  await expect(page).toHaveURL(/\/login$/);
  await loginPelaTela(page);
  await expect(page.getByText('Prazos Hoje', { exact: true })).toBeVisible();
  // Abrir o sistema não pode acender o aviso de capacidade (antes acendia por uma fila de milissegundos).
  await aguardarTelaPronta(page);
  await expect(page.getByText(/limite de capacidade/)).toHaveCount(0);
  await page.goto('/audiencias');
  await expect(page.getByRole('heading', { name: /Audiências/i }).first()).toBeVisible();
});

// Todas as telas que o administrador abre. Só conta violação SÉRIA ou CRÍTICA de acessibilidade
// (contraste de cor, campo sem rótulo, área de rolagem sem teclado etc.).
const TELAS_PUBLICAS = ['/login', '/redefinir-senha'];
const TELAS_LOGADAS = ['/dashboard', '/pessoas', '/processos', '/processos/pasta/1', '/prazos', '/tarefas', '/audiencias',
  '/pericias', '/financeiro', '/documentos', '/publicacoes', '/pendencias-documento', '/avisos', '/agenda', '/relatorios',
  '/configuracoes', '/controle/foruns', '/controle/varas', '/controle/auxiliares', '/controle/formas-pagamento',
  '/controle/instituicoes-financeiras'];

test('@critical todas as telas não têm violações sérias ou críticas de acessibilidade', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const achados = {};
  for (const rota of TELAS_PUBLICAS) {
    await page.goto(rota);
    await aguardarTelaPronta(page);
    const graves = await violacoesGraves(page);
    if (graves.length) achados[rota] = graves;
  }
  await loginPelaTela(page);
  for (const rota of TELAS_LOGADAS) {
    await page.goto(rota);
    await aguardarTelaPronta(page);
    const graves = await violacoesGraves(page);
    if (graves.length) achados[rota] = graves;
  }
  await testInfo.attach('acessibilidade.json', { body: JSON.stringify(achados, null, 2), contentType: 'application/json' });
  expect(achados, `Violações de acessibilidade por tela: ${JSON.stringify(achados, null, 2)}`).toEqual({});
});

// O Dashboard e a Agenda só mostram certos problemas quando há DADOS: a tabela do Dashboard só rola com muitas linhas
// (rolagem precisa funcionar pelo teclado) e a semana da Agenda só ganha "+N mais" e a linha de eventos com vários eventos no dia.
test('@critical Dashboard e Agenda com muitos itens no mesmo dia não têm violações sérias de acessibilidade', async ({ page, request }) => {
  test.setTimeout(240_000);
  const API = 'http://127.0.0.1:3001/api';
  const login = await request.post(`${API}/auth/login`, { data: { login: 'admteste', senha: 'TesteSeguro123!' } });
  const h = { Authorization: `Bearer ${(await login.json()).dados.token}` };
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const criados = [];
  const criar = async (rota, data) => {
    const r = await request.post(`${API}${rota}`, { headers: h, data });
    if (!r.ok()) throw new Error(`${rota}: ${r.status()} ${await r.text()}`);
    criados.push(`${rota}/${(await r.json()).dados.id}`);
  };
  try {
    for (let i = 0; i < 6; i += 1) await criar('/agenda/compromissos', { titulo: `Cheia A11y ${i}`, data: hoje, hora_inicio: `0${i + 1}:00`, hora_fim: `0${i + 1}:30` });
    for (let i = 0; i < 15; i += 1) await criar('/tarefas', { titulo: `Cheia A11y tarefa ${i}`, data_vencimento: hoje });
    await loginPelaTela(page);
    const achados = {};
    for (const rota of ['/dashboard', '/agenda']) {
      await page.goto(rota);
      await aguardarTelaPronta(page);
      if (rota === '/agenda') await expect(page.locator('.rbc-show-more').first()).toBeVisible();
      const graves = await violacoesGraves(page);
      if (graves.length) achados[rota] = graves;
    }
    expect(achados, `Violações de acessibilidade por tela: ${JSON.stringify(achados, null, 2)}`).toEqual({});
  } finally {
    const novo = await request.post(`${API}/auth/login`, { data: { login: 'admteste', senha: 'TesteSeguro123!' } });
    const h2 = { Authorization: `Bearer ${(await novo.json()).dados.token}` };
    for (const rota of criados) await request.delete(`${API}${rota}`, { headers: h2 });
  }
});

test('@critical login permanece utilizável em tela pequena', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/login');
  await expect(page.getByPlaceholder('Seu login')).toBeVisible();
  const largura = await page.evaluate(() => ({ documento: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(largura.documento).toBeLessThanOrEqual(largura.viewport + 1);
});

test('@critical usuário sem permissão não abre módulo por URL direta', async ({ page }) => {
  await loginPelaTela(page, 'sempermissao', 'TesteSeguro123!');
  await page.goto('/audiencias');
  await expect(page).toHaveURL(/\/dashboard$/);
});
