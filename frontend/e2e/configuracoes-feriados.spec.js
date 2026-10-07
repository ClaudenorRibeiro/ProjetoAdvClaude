import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers';

// Configurações > Feriados: adicionar (nacional e local), a lista mostra o tipo certo, remover (confirmação) e o calendário acompanha.
// O servidor já tem teste próprio do cálculo de prazos; aqui é a TELA que o administrador usa.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 });
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.locator('.Toastify__toast').filter({ hasText: texto }).first()).toBeVisible();
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto }).first();
async function esperarAvisosSumirem(page) { await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 }); }

const ANO = new Date().getFullYear() + 1;            // o seletor de ano mostra do ano passado ao ano que vem + 7
const quarta = (mes) => { const d = new Date(Date.UTC(ANO, mes - 1, 1)); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };   // 1ª quarta-feira do mês

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function abrirFeriados(page) {
  await loginPelaTela(page);
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Feriados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Adicionar feriado' })).toBeVisible();
  await page.getByLabel('Ano', { exact: true }).selectOption(String(ANO));
  await aguardarTelaPronta(page);
}
async function adicionar(page, data, descricao, tipo) {
  await page.getByLabel('Data', { exact: true }).fill(data);
  await page.getByLabel('Descrição', { exact: true }).fill(descricao);
  if (tipo) await page.getByLabel('Tipo', { exact: true }).selectOption({ label: tipo });
  await page.getByRole('button', { name: '+ Adicionar' }).click();
  await aviso(page, 'Feriado adicionado!');
  await esperarAvisosSumirem(page);
}

test('@critical Feriados: adicionar nacional e local (a lista mostra o tipo certo), campos obrigatórios e remover com confirmação', async ({ page }) => {
  const nac = quarta(4); const loc = quarta(5);
  await abrirFeriados(page);
  await page.getByRole('button', { name: '+ Adicionar' }).click();
  await aviso(page, 'Data e descrição são obrigatórias');
  await esperarAvisosSumirem(page);
  await semViolacoes(page, 'aba Feriados');
  await adicionar(page, nac, 'Feriado nacional E2E', 'Nacional');
  await adicionar(page, loc, 'Aniversário da cidade E2E', 'Local / Estadual');
  await expect(linha(page, 'Feriado nacional E2E').locator('.badge', { hasText: /^Nacional$/ })).toBeVisible();
  await expect(linha(page, 'Aniversário da cidade E2E').locator('.badge', { hasText: /^Local$/ })).toBeVisible();
  const gravado = await noBanco("SELECT descricao, tipo FROM feriados WHERE descricao LIKE '%E2E' ORDER BY data");
  expect(gravado.map(g => [g.descricao, g.tipo])).toEqual([['Feriado nacional E2E', 'nacional'], ['Aniversário da cidade E2E', 'local']]);
  await expect(page.getByText(/feriado\(s\) em/)).toBeVisible();
  await semViolacoes(page, 'aba Feriados com feriados');
  // remover: Cancelar não apaga; Excluir apaga
  await abrirMenuAcoes(page, linha(page, 'Feriado nacional E2E'));
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  const conf = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir Feriado' }) });
  await expect(conf).toBeVisible();
  await semViolacoes(page, 'confirmação Excluir Feriado');
  await conf.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco("SELECT COUNT(*) AS n FROM feriados WHERE descricao = 'Feriado nacional E2E'"))[0].n).toBe(1);
  await abrirMenuAcoes(page, linha(page, 'Feriado nacional E2E'));
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir Feriado' }) }).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Feriado removido');
  await expect(page.getByText('Feriado nacional E2E')).toHaveCount(0);
  expect((await noBanco("SELECT COUNT(*) AS n FROM feriados WHERE descricao = 'Feriado nacional E2E'"))[0].n).toBe(0);
});

test('@critical Feriados e calendário: o dia sai do calendário ao adicionar, e com DOIS feriados no mesmo dia remover um não devolve o dia útil', async ({ page }) => {
  const dia = quarta(6);
  await noBanco('INSERT INTO calendario (data, dia_util) VALUES (?, 1) ON DUPLICATE KEY UPDATE dia_util = 1', [dia]);
  const util = async () => (await noBanco('SELECT dia_util FROM calendario WHERE data = ?', [dia]))[0].dia_util;
  await abrirFeriados(page);
  await adicionar(page, dia, 'Feriado repetido A E2E', 'Nacional');
  expect(await util()).toBe(0);
  await adicionar(page, dia, 'Feriado repetido B E2E', 'Local / Estadual');
  await abrirMenuAcoes(page, linha(page, 'Feriado repetido A E2E'));
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir Feriado' }) }).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Feriado removido');
  expect(await util()).toBe(0);                                      // sobrou o B: o dia continua fora do calendário
  await esperarAvisosSumirem(page);
  await abrirMenuAcoes(page, linha(page, 'Feriado repetido B E2E'));
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir Feriado' }) }).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Feriado removido');
  expect(await util()).toBe(1);                                      // não sobrou nenhum: volta a ser útil
});
