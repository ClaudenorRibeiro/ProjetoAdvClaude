import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, loginPelaTela } from './helpers';
import { createRequire } from 'node:module';

// Tela Audiências: a tabela tem a coluna "Vara" (só a vara abreviada, sem o nome do fórum); audiência sem vara mostra traço.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const F = {};
test.beforeAll(async () => {
  F.forum = (await noBanco("INSERT INTO tblforum (nome, ativo) VALUES ('Foro E2E Coluna Vara', 1)")).insertId;
  F.vara = (await noBanco("INSERT INTO tblvara (nome, abrev_nome, forum_id, ativo) VALUES ('Vara E2E Coluna', '9ª Vara E2E', ?, 1)", [F.forum])).insertId;
  const insere = (hora, vara) => noBanco(
    "INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, status, vara_id, criado_por) VALUES (1, 1, '2001-01-01', ?, 'presencial', 'agendada', ?, 1)", [hora, vara]);
  F.comVara = (await insere('04:31:00', F.vara)).insertId;
  F.semVara = (await insere('04:32:00', null)).insertId;
});
test.afterAll(async () => {
  await noBanco('DELETE FROM audiencia WHERE id IN (?, ?)', [F.comVara, F.semVara]);
  await noBanco('DELETE FROM tblvara WHERE id = ?', [F.vara]);
  await noBanco('DELETE FROM tblforum WHERE id = ?', [F.forum]);
});
test.beforeEach(async ({ page }) => bloquearRedeExterna(page));

test('@critical Audiências: coluna "Vara" mostra só a vara (sem o fórum); sem vara mostra traço; o cabeçalho ordena', async ({ page }) => {
  await loginPelaTela(page);
  await page.goto('/audiencias?data_de=2001-01-01&data_ate=2001-01-01');
  await aguardarTelaPronta(page);
  const cabecalho = page.getByRole('columnheader', { name: 'Vara' });
  await expect(cabecalho).toBeVisible();
  const colunas = await page.locator('table.tabela thead th').allInnerTexts();
  expect(colunas.indexOf('Vara')).toBe(colunas.indexOf('Data / Hora') + 1);
  const comVara = page.locator('table.tabela tbody tr').filter({ hasText: '04:31' });
  await expect(comVara).toContainText('9ª Vara E2E');
  await expect(comVara).not.toContainText('Foro E2E Coluna Vara');
  const semVara = page.locator('table.tabela tbody tr').filter({ hasText: '04:32' });
  await expect(semVara).not.toContainText('9ª Vara E2E');
  const indice = colunas.indexOf('Vara');
  await expect(semVara.locator('td').nth(indice)).toHaveText('—'); // a caixa de seleção da 1ª coluna já conta no índice (cabeçalho vazio)
  await cabecalho.click();
  await expect(page.locator('table.tabela tbody tr').first()).toBeVisible();
});
