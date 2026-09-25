import { test, expect } from '@playwright/test';
import { bloquearRedeExterna, criarAudienciaSemComparecimento, loginPelaTela } from './helpers';

test.describe('resultado de ato sem comparecimento', () => {
  test.beforeEach(async ({ page, request }, testInfo) => {
    await bloquearRedeExterna(page);
    const projetos = ['chromium', 'firefox', 'webkit', 'celular', 'tablet'];
    const indiceProjeto = projetos.indexOf(testInfo.project.name);
    if (indiceProjeto === -1) throw new Error(`Projeto Playwright desconhecido: ${testInfo.project.name}`);
    const indiceTeste = testInfo.title.includes('mostra a modalidade') ? 0 : 1;
    const faixa = (indiceProjeto * 6) + (indiceTeste * 3) + testInfo.retry;
    const hora = String(10 + Math.floor(faixa / 60)).padStart(2, '0');
    const minuto = String(faixa % 60).padStart(2, '0');
    await criarAudienciaSemComparecimento(request, `${hora}:${minuto}`);
    await loginPelaTela(page);
  });

  test('@critical mostra a modalidade e usa Registrar resultado', async ({ page }) => {
    await page.goto('/audiencias');
    const linha = page.locator('tbody tr').filter({ hasText: '0000001-01.2026.5.15.0001' }).first();
    await expect(linha).toContainText('Sem comparecimento');
    await linha.getByTitle('Mais ações').click();
    await expect(page.getByRole('button', { name: 'Registrar resultado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar ata' })).toHaveCount(0);
  });

  test('@critical exige descrição e permite salvar somente o texto', async ({ page }) => {
    await page.goto('/audiencias');
    const linha = page.locator('tbody tr').filter({ hasText: '0000001-01.2026.5.15.0001' }).first();
    await linha.getByTitle('Mais ações').click();
    await page.getByRole('button', { name: 'Registrar resultado' }).click();

    await expect(page.getByRole('heading', { name: /Registrar resultado/ })).toBeVisible();
    await expect(page.getByText('O que aconteceu no ato processual?')).toBeVisible();
    await expect(page.getByText('Testemunha(s)')).toHaveCount(0);

    const grupoResponsavel = page.locator('.form-group').filter({ hasText: 'Responsável pelo acompanhamento' }).first();
    await grupoResponsavel.locator('select').selectOption('ninguem');
    await page.getByRole('button', { name: 'Registrar resultado', exact: true }).last().click();
    await expect(page.getByText(/Descreva o que aconteceu/i)).toBeVisible();

    await page.getByPlaceholder('Descreva o resultado disponibilizado ou a baixa realizada...')
      .fill('Conclusos para sentença.');
    await page.getByRole('button', { name: 'Registrar resultado', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: /Registrar resultado/ })).toHaveCount(0);

    const linhaAtualizada = page.locator('tbody tr').filter({ hasText: '0000001-01.2026.5.15.0001' }).first();
    await expect(linhaAtualizada).toContainText('Realizada');
    await linhaAtualizada.getByTitle('Mais ações').click();
    await page.getByRole('button', { name: 'Detalhes do resultado' }).click();
    await expect(page.getByText('Conclusos para sentença.')).toBeVisible();
  });
});
