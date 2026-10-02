import { test, expect } from '@playwright/test';
import { bloquearRedeExterna, loginPelaTela } from './helpers';

test('@critical incluir e excluir tipo de audiência na Pasta mantém o modal utilizável', async ({ page }, testInfo) => {
  await bloquearRedeExterna(page);
  const nome = `Tipo E2E ${testInfo.project.name} ${Date.now()}`;

  await loginPelaTela(page);
  await page.goto('/processos/pasta/1');
  await page.getByRole('button', { name: 'Audiências', exact: true }).click();
  // O botão só aparece depois de escolher o processo no filtro da aba.
  await page.getByRole('combobox').filter({ hasText: 'Todos os processos' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '+ Nova Audiência', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toBeVisible();

  await page.getByTitle('Gerenciar tipos').click();
  await expect(page.getByRole('heading', { name: 'Tipos de Audiência' })).toBeVisible();
  await page.getByPlaceholder('Novo tipo...').fill(nome);
  await page.getByRole('button', { name: '+ Adicionar', exact: true }).click();
  // O nome também aparece como opção do seletor de tipos; a linha da lista é o bloco que tem o botão Remover.
  const linha = page.locator('div').filter({ hasText: nome }).filter({ has: page.getByTitle('Remover') }).last();
  await expect(linha).toContainText(nome);

  await linha.getByTitle('Remover').click();
  await expect(linha).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tipos de Audiência' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toBeVisible();
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
});
