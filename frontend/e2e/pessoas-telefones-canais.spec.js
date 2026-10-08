import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarRespostaProcessada, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers.js';
import { createRequire } from 'node:module';

// Ficha da pessoa física: as caixinhas "WhatsApp" e "SMS" de cada telefone (canais dos avisos aos clientes).
// Regras: no máximo UM número de cada marcador por pessoa (o mesmo número pode ter os dois); celular digitado já vem marcado; Detalhes trava as caixinhas.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
function cpfValido(base9) {
  const n = base9.split('').map(Number);
  const dv = (lista, peso) => { const r = (lista.reduce((s, x, i) => s + x * (peso - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n, 10); const d2 = dv([...n, d1], 11);
  return `${base9}${d1}${d2}`;
}
const NOME = 'Canais Ficha Teste';
const ficha = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /^(Nova|Editar|Detalhes da) Pessoa Física$/ }) }).last();
const zap = (j, n) => j.getByLabel(`WhatsApp do telefone ${n}`, { exact: true });
const smsCx = (j, n) => j.getByLabel(`SMS do telefone ${n}`, { exact: true });
const marcasNoBanco = async () => (await noBanco('SELECT t.numero, t.whatsapp, t.sms FROM telefones_pf t JOIN pessoas_fisicas p ON p.id = t.pessoa_id WHERE p.nome = ? ORDER BY t.id', [NOME])).map(t => [t.numero, t.whatsapp, t.sms]);

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { await noBanco("DELETE FROM pessoas_fisicas WHERE nome LIKE 'Canais%Ficha Teste'"); });
test.afterAll(async () => { await noBanco("DELETE FROM pessoas_fisicas WHERE nome LIKE 'Canais%Ficha Teste'"); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function abrirLista(page) { await loginPelaTela(page); await page.goto('/pessoas'); await aguardarTelaPronta(page); }

test('@critical Telefones da ficha: celular digitado já vem marcado como WhatsApp e SMS; fixo não; marcar outro número desmarca o anterior (um só de cada); grava e a ficha reabre igual; Detalhes trava as caixinhas', async ({ page }) => {
  await abrirLista(page);
  await page.getByRole('button', { name: '+ Nova Pessoa Física' }).click();
  const j = ficha(page);
  await expect(j.getByRole('heading', { name: 'Nova Pessoa Física' })).toBeVisible();
  await expect(zap(j, 1)).not.toBeChecked(); await expect(smsCx(j, 1)).not.toBeChecked();
  await j.getByLabel('Telefone 1', { exact: true }).fill('19988776655');
  await expect(zap(j, 1)).toBeChecked(); await expect(smsCx(j, 1)).toBeChecked();
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 2', { exact: true }).fill('1933334444');
  await expect(zap(j, 2)).not.toBeChecked(); await expect(smsCx(j, 2)).not.toBeChecked();
  await expect(zap(j, 1)).toBeChecked();                                  // outro número digitado não mexe no que já estava marcado
  await zap(j, 2).check();                                                // WhatsApp passa para o 2º número...
  await expect(zap(j, 1)).not.toBeChecked();
  await expect(smsCx(j, 1)).toBeChecked();                                // ...e o SMS continua no 1º
  await smsCx(j, 2).check(); await expect(smsCx(j, 1)).not.toBeChecked();
  await smsCx(j, 1).check(); await expect(smsCx(j, 2)).not.toBeChecked(); // o mesmo número pode ter os dois; o outro desmarca
  await expect(zap(j, 2)).toBeChecked();
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — telefones com caixinhas: ${JSON.stringify(v, null, 1)}`).toEqual([]);
  await j.getByLabel('Nome completo').fill(NOME);
  await j.getByLabel('CPF', { exact: true }).fill(cpfValido(`5${String(Date.now()).slice(-8)}`));
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Campos sem informação' }) }).getByRole('button', { name: 'Salvar assim' }).click();
  await expect(page.getByText('Pessoa cadastrada com sucesso!').first()).toBeVisible();
  expect(await marcasNoBanco()).toEqual([['(19) 98877-6655', 0, 1], ['(19) 3333-4444', 1, 0]]);
  // reabre em Detalhes: marcadas como foram gravadas e travadas
  await page.getByPlaceholder(/Buscar por nome, CPF/).fill(NOME);
  const linha = page.locator('tbody tr').filter({ hasText: NOME });
  await expect(linha).toHaveCount(1);
  let resposta;
  await expect(async () => {
    const espera = page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/pessoas\/fisicas\/\d+$/.test(r.url()), { timeout: 5000 });
    [resposta] = await Promise.all([espera, page.locator('tbody tr').filter({ hasText: NOME }).getByTitle('Ver detalhes').click({ timeout: 5000 })]);
  }).toPass({ timeout: 20000 });
  await aguardarRespostaProcessada(page, resposta);
  const d = ficha(page);
  await expect(d.getByRole('heading', { name: 'Detalhes da Pessoa Física' })).toBeVisible();
  await expect(smsCx(d, 1)).toBeChecked(); await expect(zap(d, 2)).toBeChecked(); await expect(zap(d, 1)).not.toBeChecked();
  for (const caixa of [zap(d, 1), zap(d, 2), smsCx(d, 1), smsCx(d, 2)]) await expect(caixa).toBeDisabled();
});

test('@critical Editar telefones: salvar sem mexer mantém as marcas; tirar todas e salvar grava vazio; marcar de novo depois grava a nova escolha', async ({ page }) => {
  const [p] = await noBanco('SELECT id FROM pessoas_fisicas WHERE nome = ?', [NOME]);
  expect(p, 'o teste anterior cria a pessoa').toBeTruthy();
  await abrirLista(page);
  async function abrirEdicao() {
    let resposta;
    await expect(async () => {
      await page.getByPlaceholder(/Buscar por nome, CPF/).fill(NOME);
      const linha = page.locator('tbody tr').filter({ hasText: NOME });
      await expect(linha).toHaveCount(1);
      await abrirMenuAcoes(page, linha);
      const espera = page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/pessoas\/fisicas\/\d+$/.test(r.url()), { timeout: 8000 });
      [resposta] = await Promise.all([espera, page.getByRole('button', { name: 'Editar', exact: true }).click({ timeout: 4000 })]);
    }).toPass({ timeout: 40000 });
    await aguardarRespostaProcessada(page, resposta);
    await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();
    await expect(ficha(page).getByLabel('Nome completo')).toHaveValue(NOME);
  }
  const salvar = async () => {
    await ficha(page).getByRole('button', { name: 'Salvar', exact: true }).click();
    const pergunta = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Campos sem informação' }) }).getByRole('button', { name: 'Salvar assim' });
    await pergunta.click({ timeout: 4000 }).catch(() => {});             // a ficha tem poucos campos: o sistema pergunta uma vez
    await expect(page.getByText('Pessoa atualizada com sucesso!').first()).toBeVisible();
    await expect(ficha(page)).toHaveCount(0);
  };
  await abrirEdicao();
  const j = ficha(page);
  await expect(smsCx(j, 1)).toBeChecked(); await expect(zap(j, 2)).toBeChecked();
  await salvar();
  expect(await marcasNoBanco()).toEqual([['(19) 98877-6655', 0, 1], ['(19) 3333-4444', 1, 0]]);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 });
  await abrirEdicao();
  await smsCx(ficha(page), 1).uncheck(); await zap(ficha(page), 2).uncheck();
  await salvar();
  expect(await marcasNoBanco()).toEqual([['(19) 98877-6655', 0, 0], ['(19) 3333-4444', 0, 0]]);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 });
  await abrirEdicao();
  await zap(ficha(page), 1).check();
  await salvar();
  expect(await marcasNoBanco()).toEqual([['(19) 98877-6655', 1, 0], ['(19) 3333-4444', 0, 0]]);
});
