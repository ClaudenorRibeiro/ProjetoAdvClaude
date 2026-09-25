import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bloquearRedeExterna, loginPelaTela } from './helpers';

test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

test('@critical login, proteção de rota e navegação principal', async ({ page }) => {
  await page.goto('/audiencias');
  await expect(page).toHaveURL(/\/login$/);
  await loginPelaTela(page);
  await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible();
  await page.goto('/audiencias');
  await expect(page.getByRole('heading', { name: /Audiências/i }).first()).toBeVisible();
});

test('@critical páginas críticas não têm violações sérias ou críticas de acessibilidade', async ({ page }, testInfo) => {
  await page.goto('/login');
  let resultado = await new AxeBuilder({ page }).analyze();
  let graves = resultado.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(graves, `Login: ${JSON.stringify(graves, null, 2)}`).toEqual([]);

  await loginPelaTela(page);
  resultado = await new AxeBuilder({ page }).analyze();
  graves = resultado.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(graves, `Dashboard: ${JSON.stringify(graves, null, 2)}`).toEqual([]);
  await testInfo.attach('acessibilidade.json', { body: JSON.stringify(resultado, null, 2), contentType: 'application/json' });
});

test('login permanece utilizável em tela pequena', async ({ page }) => {
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
