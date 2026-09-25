import { test, expect } from '@playwright/test';
import { bloquearRedeExterna, loginPelaTela } from './helpers';

test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

const paginas = [
  '/dashboard', '/pessoas', '/processos', '/prazos', '/tarefas', '/audiencias',
  '/pericias', '/financeiro', '/documentos', '/publicacoes', '/pendencias-documento',
  '/agenda', '/relatorios', '/configuracoes', '/controle/foruns', '/controle/varas',
  '/controle/auxiliares', '/controle/formas-pagamento',
];

test('todas as telas principais carregam sem tela branca ou erro de módulo', async ({ page }) => {
  const errosPagina = [];
  page.on('pageerror', erro => errosPagina.push(erro.message));
  await loginPelaTela(page);

  for (const caminho of paginas) {
    const inicio = Date.now();
    const resposta = await page.goto(caminho, { waitUntil: 'domcontentloaded' });
    expect(resposta?.status(), `${caminho} não respondeu com sucesso`).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText('Não foi possível carregar esta tela');
    await expect(page.locator('body')).not.toBeEmpty();
    expect(Date.now() - inicio, `${caminho} excedeu o orçamento de 15 segundos`).toBeLessThan(15_000);
  }
  expect(errosPagina).toEqual([]);
});
