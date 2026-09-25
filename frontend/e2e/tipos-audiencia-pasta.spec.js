import { test, expect } from '@playwright/test';
import { bloquearRedeExterna, loginPelaTela } from './helpers';

test('@critical incluir e excluir tipo de audiência na Pasta mantém o modal utilizável', async ({ page }, testInfo) => {
  await bloquearRedeExterna(page);
  const nome = `Tipo E2E ${testInfo.project.name} ${Date.now()}`;

  await loginPelaTela(page);
  await page.goto('/processos/pasta/1');
  await page.getByRole('button', { name: 'Audiências', exact: true }).click();
  await page.getByRole('button', { name: '+ Nova Audiência', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toBeVisible();

  await page.getByTitle('Gerenciar tipos').click();
  await expect(page.getByRole('heading', { name: 'Tipos de Audiência' })).toBeVisible();
  await page.getByPlaceholder('Novo tipo...').fill(nome);
  await page.getByRole('button', { name: '+ Adicionar', exact: true }).click();
  const linha = page.getByText(nome, { exact: true }).locator('..');
  await expect(linha).toContainText(nome);

  await linha.getByTitle('Remover').click();
  await expect(linha).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tipos de Audiência' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toBeVisible();
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
});
