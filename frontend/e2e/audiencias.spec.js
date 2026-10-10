import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, bloquearRedeExterna, criarAudienciaSemComparecimento, loginPelaTela } from './helpers';

test.describe('resultado de ato sem comparecimento', () => {
  // O banco de teste é compartilhado: cada teste localiza a SUA audiência pelo horário que criou.
  let horaTeste;
  const linhaDoTeste = (page) => page.locator('tbody tr').filter({ hasText: '0000001-01.2026.5.15.0001' }).filter({ hasText: horaTeste }).first();

  test.beforeEach(async ({ page, request }, testInfo) => {
    await bloquearRedeExterna(page);
    const projetos = ['chromium', 'firefox', 'webkit', 'celular', 'tablet'];
    const indiceProjeto = projetos.indexOf(testInfo.project.name);
    if (indiceProjeto === -1) throw new Error(`Projeto Playwright desconhecido: ${testInfo.project.name}`);
    const indiceTeste = testInfo.title.includes('mostra a modalidade') ? 0 : 1;
    const faixa = (indiceProjeto * 6) + (indiceTeste * 3) + testInfo.retry;
    const hora = String(10 + Math.floor(faixa / 60)).padStart(2, '0');
    const minuto = String(faixa % 60).padStart(2, '0');
    horaTeste = `${hora}:${minuto}`;
    await criarAudienciaSemComparecimento(request, horaTeste);
    await loginPelaTela(page);
  });

  test('@critical mostra a modalidade e usa Concluir', async ({ page }) => {
    await page.goto('/audiencias');
    const linha = linhaDoTeste(page);
    await expect(linha).toContainText('Sem comparecimento');
    await abrirMenuAcoes(page, linha);
    await expect(page.getByRole('button', { name: 'Concluir', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar ata' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gerar documento' })).toHaveCount(0);     // ato sem comparecimento não gera documento
  });

  test('@critical exige descrição e permite salvar somente o texto', async ({ page }) => {
    await page.goto('/audiencias');
    const linha = linhaDoTeste(page);
    await abrirMenuAcoes(page, linha);
    await page.getByRole('button', { name: 'Concluir', exact: true }).click();

    await expect(page.getByRole('heading', { name: /Concluir/ })).toBeVisible();
    await expect(page.getByText('O que aconteceu no ato processual?')).toBeVisible();
    // janela simples: sem responsável e só as providências que fazem sentido depois de uma sentença
    await expect(page.getByText('Responsável pelo acompanhamento')).toHaveCount(0);
    for (const fora of ['Testemunha(s)', 'Acordo', 'Desistência da Ação', 'Retornem aos autos']) await expect(page.getByText(fora, { exact: true })).toHaveCount(0);
    for (const dentro of ['Prazo', 'Perícia', 'Nova audiência', 'Alvará', 'Tarefa']) await expect(page.getByRole('checkbox', { name: dentro })).toBeVisible();
    await page.getByRole('button', { name: 'Concluir', exact: true }).last().click();
    await expect(page.getByText(/Descreva o que aconteceu/i)).toBeVisible();

    await page.getByPlaceholder('Descreva o resultado disponibilizado ou a baixa realizada...')
      .fill('Conclusos para sentença.');
    await page.getByRole('button', { name: 'Concluir', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: /Concluir/ })).toHaveCount(0);

    const linhaAtualizada = linhaDoTeste(page);
    await expect(linhaAtualizada).toContainText('Realizada');
    await abrirMenuAcoes(page, linhaAtualizada);
    await page.getByRole('button', { name: 'Detalhes da conclusão' }).click();
    await expect(page.getByText('Conclusos para sentença.')).toBeVisible();
  });
});
