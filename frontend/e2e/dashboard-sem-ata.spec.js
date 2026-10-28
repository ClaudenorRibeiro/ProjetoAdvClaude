import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, criarAudiencia, loginPelaTela } from './helpers';
import { createRequire } from 'node:module';

// Dashboard > "Audiências sem ata": o ato "sem comparecimento" (ex.: Julgamento) não tem ata — mostra "Concluir" no lugar de
// "Registrar ata" e não oferece "Ata impressa"; a audiência comum continua com "Registrar ata" e "Ata impressa".
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
let ids = [];
test.afterAll(async () => { for (const id of ids) await noBanco('DELETE FROM audiencia WHERE id = ?', [id]); });
test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

test('@critical Dashboard: Audiências sem ata — julgamento (sem comparecimento) mostra "Concluir" sem "Ata impressa"; presencial mantém "Registrar ata" e "Ata impressa"', async ({ page, request }) => {
  ids.push(await criarAudiencia(request, '03:11', 'sem_comparecimento'));
  ids.push(await criarAudiencia(request, '03:12', 'presencial'));
  await loginPelaTela(page);
  await aguardarTelaPronta(page);
  const julgamento = page.locator('.item-sem-ata').filter({ hasText: '01/01/2001 03:11' });
  const presencial = page.locator('.item-sem-ata').filter({ hasText: '01/01/2001 03:12' });
  await expect(julgamento).toBeVisible();
  await expect(julgamento.getByRole('link', { name: 'Concluir' })).toBeVisible();
  await expect(julgamento.getByRole('link', { name: 'Registrar ata' })).toHaveCount(0);
  await expect(julgamento.getByRole('button', { name: 'Ata impressa' })).toHaveCount(0);
  await expect(presencial.getByRole('link', { name: 'Registrar ata' })).toBeVisible();
  await expect(presencial.getByRole('button', { name: 'Ata impressa' })).toBeVisible();
  await expect(presencial.getByRole('link', { name: 'Concluir' })).toHaveCount(0);
});
