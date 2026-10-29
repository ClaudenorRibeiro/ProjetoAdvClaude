import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, criarAudiencia, loginPelaTela } from './helpers';
import { createRequire } from 'node:module';

// Dashboard > "Audiências sem ata": o ato "sem comparecimento" (ex.: Julgamento) não tem ata e não aparece no quadro; a audiência
// comum tem "Registrar ata" e "Ata impressa". O quadro tem altura limitada e rola por dentro.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
let ids = [];
test.afterAll(async () => { for (const id of ids) await noBanco('DELETE FROM audiencia WHERE id = ?', [id]); });
test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

test('@critical Dashboard: Audiências sem ata — julgamento (sem comparecimento) não aparece; presencial mantém "Registrar ata" e "Ata impressa"; o quadro rola por dentro', async ({ page, request }) => {
  ids.push(await criarAudiencia(request, '03:11', 'sem_comparecimento'));
  ids.push(await criarAudiencia(request, '03:12', 'presencial'));
  await loginPelaTela(page);
  await aguardarTelaPronta(page);
  const presencial = page.locator('.item-sem-ata').filter({ hasText: '01/01/2001 03:12' });
  await expect(presencial).toBeVisible();
  await expect(page.locator('.item-sem-ata').filter({ hasText: '01/01/2001 03:11' })).toHaveCount(0);
  await expect(presencial.getByRole('link', { name: 'Registrar ata' })).toBeVisible();
  await expect(presencial.getByRole('button', { name: 'Ata impressa' })).toBeVisible();
  const lista = page.getByRole('region', { name: 'Audiências sem ata' });
  const altura = await lista.evaluate(el => ({ h: el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
  expect(altura.overflowY).toBe('auto');
  expect(altura.h).toBeLessThanOrEqual(260);
});

test('@critical Dashboard: "Registrar ata" abre direto a janela da audiência certa (e o endereço volta a /audiencias)', async ({ page, request }) => {
  ids.push(await criarAudiencia(request, '03:22', 'presencial'));
  await loginPelaTela(page);
  await aguardarTelaPronta(page);
  await page.locator('.item-sem-ata').filter({ hasText: '01/01/2001 03:22' }).getByRole('link', { name: 'Registrar ata' }).click();
  await expect(page.getByRole('heading', { name: /Registrar Ata — 01\/01\/2001 03:22/ })).toBeVisible();
  await expect(page).toHaveURL(/\/audiencias$/);
});
