import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Etiqueta automática "Acordo": processo com acordo (não alvará, não cancelado) ganha a etiqueta e um fundo na mesma cor — na lista de
// Processos, no alto da pasta e na aba Processos da pasta. A cor vem de Configurações > Etiquetas do escritório (linha "Acordo (automática)").
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ2 = '9400002-00.2026.5.15.0001';
const CAMPO_BUSCA = 'Buscar por nº pasta, título, nº CNJ ou protocolo...';
const DIA = '2099-04-06';
const etiqueta = (escopo) => escopo.getByTitle('Este processo tem acordo cadastrado');
const linhaDoProcesso = (page, cnj) => page.locator('tbody tr').filter({ hasText: cnj });
const fundoDaCelula = (linha) => linha.locator('td').first().evaluate(el => getComputedStyle(el).backgroundColor);
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  const dias = [];
  for (const [mes, ultimo] of [[4, 30], [5, 31], [6, 30]]) {
    for (let dia = 1; dia <= ultimo; dia++) {
      const dt = new Date(Date.UTC(2099, mes - 1, dia, 12));
      dias.push(`('${dt.toISOString().slice(0, 10)}', ${[0, 6].includes(dt.getUTCDay()) ? 0 : 1})`);
    }
  }
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);   // o banco de teste tem calendário esparso
});
test.afterAll(async () => {
  await limparPastaPartes(d);
  await noBanco('UPDATE configuracoes_escritorio SET cor_etiqueta_acordo = NULL');
  await noBanco("DELETE FROM calendario WHERE data >= '2099-04-01' AND data <= '2099-06-30'");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('acordo', 'acordo_parcela', 'configuracoes_escritorio')");
});
test.beforeEach(async ({ page }) => {
  await restaurarPastaPartes(d);                                    // recria a pasta 7401 (acordos antigos saem em cascata)
  await noBanco('UPDATE configuracoes_escritorio SET cor_etiqueta_acordo = NULL');
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
});
const criarAcordo = (tipo = 'acordo', status = 'ativo') => noBanco(
  "INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, status, criado_por) VALUES (?, ?, 'Acordo etiqueta', 1000, 1, ?, ?, 1)", [d.proc1, tipo, DIA, status]);
const abrirPasta = async (page, aba = 'processos') => { await page.goto(`/processos/pasta/${d.pastaPartes}?aba=${aba}`); await aguardarTelaPronta(page); };

test('@critical Pasta com acordo: o alto da pasta e SÓ a linha do processo com acordo ganham etiqueta "Acordo" e fundo (cor padrão)', async ({ page }) => {
  await criarAcordo();
  await loginPelaTela(page);
  await abrirPasta(page);
  const cartao = page.locator('.card.card-acordo');
  await expect(cartao).toHaveCount(1);
  await expect(etiqueta(cartao)).toHaveText('Acordo');
  await expect(etiqueta(cartao)).toHaveCSS('background-color', 'rgb(134, 239, 172)');              // cor padrão (#86efac)
  const com = linhaDoProcesso(page, CNJ1); const sem = linhaDoProcesso(page, CNJ2);
  await expect(com).toHaveClass(/linha-acordo/);
  await expect(etiqueta(com)).toHaveCount(1);
  await expect(sem).not.toHaveClass(/linha-acordo/);                                              // o outro processo da mesma pasta fica normal
  await expect(etiqueta(sem)).toHaveCount(0);
  expect(await fundoDaCelula(com)).toBe('rgb(219, 250, 230)');                                    // a mesma cor, clareada (30%)
  await semViolacoes(page, 'pasta com acordo');
});

test('@critical Sem acordo, só alvará ou acordo cancelado: nada de etiqueta nem de fundo', async ({ page }) => {
  await criarAcordo('alvara');
  await criarAcordo('acordo', 'cancelado');
  await loginPelaTela(page);
  await abrirPasta(page);
  await expect(page.locator('.card.card-acordo')).toHaveCount(0);
  await expect(etiqueta(page)).toHaveCount(0);
  await expect(linhaDoProcesso(page, CNJ1)).not.toHaveClass(/linha-acordo/);
});

test('@critical Lista de Processos: a pasta com acordo ganha etiqueta e fundo; sem acordo volta ao normal', async ({ page }) => {
  await criarAcordo();
  await loginPelaTela(page);
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByPlaceholder(CAMPO_BUSCA).fill('7401');
  await page.waitForTimeout(500); await aguardarTelaPronta(page);
  const linha = page.locator('tbody tr').filter({ hasText: '7401' });
  await expect(linha).toHaveCount(1);
  await expect(linha).toHaveClass(/linha-acordo/);
  await expect(etiqueta(linha)).toHaveText('Acordo');
  await semViolacoes(page, 'lista de Processos com acordo');
  await noBanco('DELETE FROM acordo WHERE processo_id = ?', [d.proc1]);
  await page.reload(); await aguardarTelaPronta(page);
  await page.getByPlaceholder(CAMPO_BUSCA).fill('7401');
  await page.waitForTimeout(500); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr').filter({ hasText: '7401' })).not.toHaveClass(/linha-acordo/);
  await expect(etiqueta(page)).toHaveCount(0);
});

test('@critical A cor escolhida em Configurações vale para a etiqueta e o fundo (e o texto da etiqueta continua legível)', async ({ page }) => {
  await criarAcordo();
  await noBanco("UPDATE configuracoes_escritorio SET cor_etiqueta_acordo = '#1d4ed8'");
  await loginPelaTela(page);
  await abrirPasta(page);
  await expect(etiqueta(page.locator('.card.card-acordo'))).toHaveCSS('background-color', 'rgb(29, 78, 216)');
  await expect(etiqueta(page.locator('.card.card-acordo'))).toHaveCSS('color', 'rgb(255, 255, 255)');   // azul escuro: letra branca
  const fundo = (await fundoDaCelula(linhaDoProcesso(page, CNJ1))).match(/\d+/g).map(Number);
  expect(fundo[2]).toBeGreaterThan(fundo[0]);                                                     // continua azulado
  expect(fundo[0]).toBeGreaterThan(200);                                                          // mas bem claro (os textos da pasta seguem legíveis)
  await semViolacoes(page, 'pasta com acordo em azul escuro');
});

test('@critical O alto da pasta acompanha o Financeiro: excluir o acordo tira a etiqueta e criar um acordo novo traz de volta, sem recarregar', async ({ page }) => {
  await criarAcordo();
  await loginPelaTela(page);
  await abrirPasta(page, 'financeiro');
  await page.getByLabel('Filtrar por processo', { exact: true }).selectOption({ label: CNJ1 }); await aguardarTelaPronta(page);
  await expect(page.locator('.card.card-acordo')).toHaveCount(1);
  const bloco = page.locator('div').filter({ hasText: 'Acordo etiqueta' }).filter({ has: page.getByRole('button', { name: /Parcelas/ }) }).last();
  await bloco.getByRole('button', { name: 'Excluir', exact: true }).click();
  await janela(page, 'Excluir acordo').getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Acordo excluído');
  await expect(page.locator('.card.card-acordo')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Acordo' }).click();
  const j = janela(page, 'Novo Acordo');
  await j.getByLabel('Valor total (R$)', { exact: true }).fill('200000');
  await j.getByLabel('Nº de parcelas', { exact: true }).fill('2');
  await j.getByLabel('1ª parcela', { exact: true }).fill(DIA);
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await j.getByRole('button', { name: 'Salvar acordo' }).click();
  await aviso(page, 'Acordo criado!');
  await expect(page.locator('.card.card-acordo')).toHaveCount(1);
  await expect(etiqueta(page.locator('.card.card-acordo'))).toHaveText('Acordo');
});

test('@critical Configurações > Etiquetas do escritório > Processos: linha "Acordo (automática)" escolhe a cor, mostra exemplo e volta à cor padrão', async ({ page }) => {
  await loginPelaTela(page);
  await page.goto('/configuracoes'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Etiquetas do escritório' }).click();
  const secao = page.getByTestId('config-etiqueta-acordo');
  await expect(secao).toBeVisible();
  await expect(secao.getByText('Cor padrão do sistema')).toBeVisible();
  await expect(secao.getByRole('button', { name: 'Voltar à cor padrão' })).toBeDisabled();
  await expect(secao.getByRole('button', { name: 'Salvar cor do Acordo' })).toBeDisabled();       // nada mudou ainda
  await semViolacoes(page, 'Configurações — etiqueta Acordo');
  await secao.getByLabel('Cor da etiqueta Acordo').fill('#0000ff');
  await expect(etiqueta(secao)).toHaveCSS('background-color', 'rgb(0, 0, 255)');                    // o exemplo já mostra a cor escolhida
  await secao.getByRole('button', { name: 'Salvar cor do Acordo' }).click();
  await aviso(page, 'Cor da etiqueta Acordo salva!');
  expect((await noBanco('SELECT cor_etiqueta_acordo AS c FROM configuracoes_escritorio LIMIT 1'))[0].c).toBe('#0000ff');
  await page.reload(); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Etiquetas do escritório' }).click();
  await expect(page.getByTestId('config-etiqueta-acordo').getByText('#0000FF')).toBeVisible();
  await page.getByTestId('config-etiqueta-acordo').getByRole('button', { name: 'Voltar à cor padrão' }).click();
  await aviso(page, 'Cor padrão da etiqueta Acordo restaurada!');
  expect((await noBanco('SELECT cor_etiqueta_acordo AS c FROM configuracoes_escritorio LIMIT 1'))[0].c).toBeNull();
});
