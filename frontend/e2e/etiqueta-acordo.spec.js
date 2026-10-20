import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Etiqueta automática "Acordo": processo com o STATUS "Acordo" (acordo lançado no Financeiro não conta) ganha a etiqueta e um fundo na mesma cor — na lista de
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
const etiqueta = (escopo) => escopo.getByTitle('O status deste processo é Acordo');
const linhaDoProcesso = (page, cnj) => page.locator('tbody tr').filter({ hasText: cnj });
const fundoDaCelula = (linha) => linha.locator('td').first().evaluate(el => getComputedStyle(el).backgroundColor);
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();

let d; let statusAcordoId; let criouStatusAcordo = false;
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
  const achado = await noBanco("SELECT id FROM tblstatusproc WHERE TRIM(nome) = 'Acordo' LIMIT 1");
  if (achado.length) statusAcordoId = achado[0].id;
  else { statusAcordoId = (await noBanco("INSERT INTO tblstatusproc (nome) VALUES ('Acordo')")).insertId; criouStatusAcordo = true; }
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);   // o banco de teste tem calendário esparso
});
test.afterAll(async () => {
  await limparPastaPartes(d);
  if (criouStatusAcordo) await noBanco('DELETE FROM tblstatusproc WHERE id = ?', [statusAcordoId]);
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
// põe o primeiro processo da pasta no status "Acordo" (o que liga a etiqueta); sem isso ele fica "Conhecimento"
const statusAcordo = () => noBanco('UPDATE tblproc SET status_id = ? WHERE id = ?', [statusAcordoId, d.proc1]);
const abrirPasta = async (page, aba = 'processos') => { await page.goto(`/processos/pasta/${d.pastaPartes}?aba=${aba}`); await aguardarTelaPronta(page); };

test('@critical Pasta com status Acordo: o alto da pasta e SÓ a linha do processo com esse status ganham etiqueta "Acordo" e fundo (cor padrão)', async ({ page }) => {
  await statusAcordo();
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

test('@critical Acordo lançado no Financeiro, mas status do processo diferente de Acordo: nada de etiqueta nem de fundo', async ({ page }) => {
  await criarAcordo();
  await criarAcordo('alvara');
  await loginPelaTela(page);
  await abrirPasta(page);
  await expect(page.locator('.card.card-acordo')).toHaveCount(0);
  await expect(etiqueta(page)).toHaveCount(0);
  await expect(linhaDoProcesso(page, CNJ1)).not.toHaveClass(/linha-acordo/);
});

test('@critical Lista de Processos: a pasta com status Acordo ganha etiqueta e fundo; trocando o status volta ao normal', async ({ page }) => {
  await statusAcordo();
  await loginPelaTela(page);
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByPlaceholder(CAMPO_BUSCA).fill('7401');
  await page.waitForTimeout(500); await aguardarTelaPronta(page);
  const linha = page.locator('tbody tr').filter({ hasText: '7401' });
  await expect(linha).toHaveCount(1);
  await expect(linha).toHaveClass(/linha-acordo/);
  await expect(etiqueta(linha)).toHaveText('Acordo');
  await semViolacoes(page, 'lista de Processos com acordo');
  await noBanco('UPDATE tblproc SET status_id = ? WHERE id = ?', [d.statusConhecimento, d.proc1]);
  await page.reload(); await aguardarTelaPronta(page);
  await page.getByPlaceholder(CAMPO_BUSCA).fill('7401');
  await page.waitForTimeout(500); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr').filter({ hasText: '7401' })).not.toHaveClass(/linha-acordo/);
  await expect(etiqueta(page)).toHaveCount(0);
});

test('@critical A cor escolhida em Configurações vale para a etiqueta e o fundo (e o texto da etiqueta continua legível)', async ({ page }) => {
  await statusAcordo();
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

test('@critical Mudar o status do processo para Acordo liga a etiqueta (apenso também); criar acordo no Financeiro não muda nada', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, 'financeiro');
  await page.getByLabel('Filtrar por processo', { exact: true }).selectOption({ label: CNJ1 }); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: '+ Novo Acordo' }).click();
  const j = janela(page, 'Novo Acordo');
  await j.getByLabel('Valor total (R$)', { exact: true }).fill('200000');
  await j.getByLabel('Nº de parcelas', { exact: true }).fill('2');
  await j.getByLabel('1ª parcela', { exact: true }).fill(DIA);
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await j.getByRole('button', { name: 'Salvar acordo' }).click();
  await aviso(page, 'Acordo criado!');
  await expect(page.locator('.card.card-acordo')).toHaveCount(0);                                  // acordo lançado, status outro: sem marca
  await statusAcordo();
  await abrirPasta(page);
  await expect(page.locator('.card.card-acordo')).toHaveCount(1);
  // apenso com o status Acordo também ganha a marca na própria linha
  const apensoId = (await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, apenso_de_id, status_id, ativo, criado_por) VALUES (?, '9400077-00.2026.5.15.0001', 'APENSO ETIQUETA', ?, ?, 1, 1)", [d.pastaPartes, d.proc1, statusAcordoId])).insertId;
  try {
    await abrirPasta(page);
    const linhaApenso = linhaDoProcesso(page, 'APENSO ETIQUETA');
    await expect(linhaApenso).toHaveClass(/linha-acordo/);
    await expect(etiqueta(linhaApenso)).toHaveCount(1);
  } finally { await noBanco('DELETE FROM tblproc WHERE id = ?', [apensoId]); }
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
