import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarAudiencia, loginPelaTela } from './helpers';

// Erro real (02/10/2026): na Pasta, ao registrar a ata marcando "Nova audiência" e clicando em
// "Designar nova audiência", a tela inteira quebrava ("Não foi possível carregar esta tela").
test('@critical Pasta: registrar ata e "Designar nova audiência" abre o modal sem quebrar a tela', async ({ page, request }) => {
  await bloquearRedeExterna(page);
  await criarAudiencia(request, '16:40', 'presencial');
  await loginPelaTela(page);
  await page.goto('/processos/pasta/1');
  await page.getByRole('button', { name: 'Audiências', exact: true }).click();
  await aguardarTelaPronta(page);

  const linha = page.locator('tbody tr').filter({ hasText: '16:40' }).first();
  await abrirMenuAcoes(page, linha);
  await page.getByRole('button', { name: 'Registrar ata' }).click();
  await expect(page.getByRole('heading', { name: /Registrar Ata/ })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Nova audiência' }).check();
  await page.getByRole('button', { name: /Designar nova audiência/ }).click();

  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toBeVisible();
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  // a lista de tipos de audiência do modal está preenchida
  await expect(page.getByRole('combobox').filter({ hasText: 'Julgamento' }).first()).toBeVisible();

  // Fluxo inteiro: salva a nova audiência (fica como rascunho da ata) e registra a ata.
  await page.getByRole('button', { name: 'Data da audiência' }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.locator('input[type="time"]').first().fill('14:30');
  await page.getByRole('button', { name: 'Criar Audiência' }).click();
  // Se o dia escolhido não for útil, o sistema pede a senha para confirmar (regra existente).
  const campoSenha = page.locator('input[type="password"]');
  if (await campoSenha.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
    await campoSenha.fill('TesteSeguro123!');
    await page.getByRole('button', { name: 'Confirmar e Agendar' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Nova Audiência' })).toHaveCount(0);
  await expect(page.getByText('Nova audiência adicionada à ata')).toBeVisible();

  await page.getByRole('combobox').filter({ hasText: '— Selecione —' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Registrar Ata', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: /Registrar Ata/ })).toHaveCount(0);

  const login = await request.post('http://127.0.0.1:3001/api/auth/login', { data: { login: 'admteste', senha: 'TesteSeguro123!' } });
  const token = (await login.json()).dados.token;
  const lista = await request.get('http://127.0.0.1:3001/api/audiencias?limite=200', { headers: { Authorization: `Bearer ${token}` } });
  const corpo = (await lista.json()).dados;
  const itens = Array.isArray(corpo) ? corpo : Object.values(corpo).find(Array.isArray) || [];
  const nova = itens.find(a => String(a.hora).startsWith('14:30'));
  expect(nova, 'a nova audiência designada na ata precisa ter sido criada').toBeTruthy();
  const velha = itens.find(a => String(a.hora).startsWith('16:40'));
  expect(velha.status).toBe('realizada');
});
