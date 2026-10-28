import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// "Fazendo" que não some sozinho: 0 = nunca em Configurações; aviso ao clicar em "Sair" e no login seguinte a um logout por inatividade
// (manter ou liberar os prazos); "há N dias" só para o administrador, quem faz e o responsável pelo prazo.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const SENHA = 'TesteSeguro123!';
const usuarioMenu = (page) => page.locator('.usuario-nome-header');
const sair = async (page) => { await usuarioMenu(page).click(); await page.getByRole('button', { name: /Sair/ }).click(); };
const janela = (page) => page.getByRole('dialog', { name: /Fazendo/ });
const prazoDe = (id) => noBanco('SELECT fazendo_por, status FROM prazos_processo WHERE id = ?', [id]).then(r => r[0]);

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  await criarUsuarioComPermissoes('fazendo_a', [['prazos', null, 'visualizar'], ['prazos', null, 'alterar']]);
  await criarUsuarioComPermissoes('fazendo_b', [['prazos', null, 'visualizar']]);
  d.a = (await noBanco("SELECT id FROM usuarios WHERE login = 'fazendo_a'"))[0].id;
  d.b = (await noBanco("SELECT id FROM usuarios WHERE login = 'fazendo_b'"))[0].id;
  d.proc = (await noBanco('SELECT id FROM tblproc WHERE ativo = 1 ORDER BY id LIMIT 1'))[0].id;
});
async function criarPrazos() {
  await limpar();
  const novo = async (descricao, por, horas, status = 'aberto', delegado = null) => (await noBanco(
    `INSERT INTO prazos_processo (processo_id, descricao, data_inicio, data_vencimento, status, criado_por, fazendo_por, fazendo_desde, delegado_para)
     VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 5 DAY), ?, 1, ?, IF(? IS NULL, NULL, DATE_SUB(NOW(), INTERVAL ? HOUR)), ?)`,
    [d.proc, descricao, status, por, por, horas, delegado])).insertId;
  d.p1 = await novo('Fazendo UM do fazendo-e2e', d.a, 72);
  d.p2 = await novo('Fazendo DOIS do fazendo-e2e', d.a, 5);
  d.p3 = await novo('De outra pessoa do fazendo-e2e', d.b, 30);
  d.p4 = await novo('Concluido do fazendo-e2e', d.a, 3, 'concluido');
}
async function limpar() {
  await noBanco("DELETE FROM auditoria_prazo WHERE prazo_id IN (SELECT id FROM prazos_processo WHERE descricao LIKE '%do fazendo-e2e')");
  await noBanco("DELETE FROM prazos_processo WHERE descricao LIKE '%do fazendo-e2e'");
}
test.beforeEach(async ({ page }) => { await criarPrazos(); await bloquearRedeExterna(page); });
test.afterAll(async () => { await limpar(); await limparPastaPartes(d); });

test('@critical Fazendo: ao clicar em Sair com prazos em Fazendo, a janela lista só os da pessoa; "Manter e sair" sai e deixa tudo como está', async ({ page }) => {
  await loginPelaTela(page, 'fazendo_a', SENHA);
  await sair(page);
  const j = janela(page);
  await expect(j).toBeVisible();
  await expect(j).toContainText('2 prazos estão marcados');
  await expect(j.getByText('Fazendo UM', { exact: false })).toBeVisible();
  await expect(j.getByText('Fazendo DOIS', { exact: false })).toBeVisible();
  await expect(j.getByText('De outra pessoa')).toHaveCount(0);
  await expect(j.getByText('Concluido')).toHaveCount(0);
  await expect(j.getByText('há 3 dias')).toBeVisible();
  const v = await violacoesGraves(page); expect.soft(v, JSON.stringify(v, null, 1)).toEqual([]);
  await j.getByRole('button', { name: 'Manter e sair' }).click();
  await page.waitForURL('**/login');
  expect((await prazoDe(d.p1)).fazendo_por).toBe(d.a);
  expect((await prazoDe(d.p2)).fazendo_por).toBe(d.a);
  expect((await prazoDe(d.p3)).fazendo_por).toBe(d.b);
});

test('@critical Fazendo: "Cancelar" continua no sistema; "Liberar marcados e sair" libera só os marcados', async ({ page }) => {
  await loginPelaTela(page, 'fazendo_a', SENHA);
  await sair(page);
  const j = janela(page);
  await expect(j.getByRole('button', { name: /Liberar marcados \(0\)/ })).toBeDisabled();       // nada marcado: não há o que liberar
  await j.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect(page).toHaveURL(/dashboard/);
  expect((await prazoDe(d.p1)).fazendo_por).toBe(d.a);
  await sair(page);
  await janela(page).getByLabel(/Liberar o prazo .* do processo/).first().check();
  await expect(janela(page).getByRole('button', { name: /Liberar marcados \(1\) e sair/ })).toBeEnabled();
  await janela(page).getByRole('button', { name: /Liberar marcados \(1\) e sair/ }).click();
  await page.waitForURL('**/login');
  const libera = [(await prazoDe(d.p1)).fazendo_por, (await prazoDe(d.p2)).fazendo_por];
  expect(libera.filter(x => x === null)).toHaveLength(1);                                       // só um dos dois foi liberado
  expect(libera.filter(x => x === d.a)).toHaveLength(1);                                        // o outro continua marcado
});

test('@critical Fazendo: sem prazo em Fazendo, "Sair" sai direto, sem janela', async ({ page }) => {
  await noBanco("UPDATE prazos_processo SET fazendo_por = NULL, fazendo_desde = NULL WHERE descricao LIKE '%do fazendo-e2e'");
  await loginPelaTela(page, 'fazendo_a', SENHA);
  await sair(page);
  await page.waitForURL('**/login');
});

test('@critical Fazendo: depois de um logout por INATIVIDADE, o próximo login mostra a janela uma vez só (manter ou liberar)', async ({ page }) => {
  await page.clock.install();                                       // relógio de teste: dá para "passar" os 15 minutos sem esperar
  await loginPelaTela(page, 'fazendo_a', SENHA);
  await page.clock.runFor('16:00');                                 // passa do mínimo de inatividade (15 min): o sistema desloga sozinho
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate((id) => localStorage.getItem(`fazendoAviso:${id}`), d.a)).toBe('1');   // o sinal que lembra no próximo login
  await page.clock.resume();
  await loginPelaTela(page, 'fazendo_a', SENHA);
  const j = janela(page);
  await expect(j).toBeVisible();
  await expect(j).toContainText('fechado por inatividade');
  await j.getByLabel('Marcar todos para liberar').check();
  await j.getByRole('button', { name: /Liberar marcados \(2\)/ }).click();
  await expect(janela(page)).toHaveCount(0);
  await expect.poll(async () => (await prazoDe(d.p1)).fazendo_por).toBe(null);
  expect((await prazoDe(d.p2)).fazendo_por).toBe(null);
  expect((await prazoDe(d.p3)).fazendo_por).toBe(d.b);                                          // o da outra pessoa não é mexido
  await page.reload(); await aguardarTelaPronta(page);
  await expect(janela(page)).toHaveCount(0);                                                    // não repete
});

test('@critical Fazendo: login normal (sem logout por inatividade antes) não mostra a janela', async ({ page }) => {
  await loginPelaTela(page, 'fazendo_a', SENHA);
  await aguardarTelaPronta(page);
  await expect(janela(page)).toHaveCount(0);
});

test('@critical Fazendo: "há N dias" aparece para o administrador e para quem faz, e não para um terceiro sem relação com o prazo', async ({ page, browser, baseURL }) => {
  await noBanco('UPDATE prazos_processo SET delegado_para = NULL WHERE id IN (?, ?)', [d.p1, d.p3]);
  const ver = async (login) => {
    const ctx = await browser.newContext({ baseURL }); const p = await ctx.newPage(); await bloquearRedeExterna(p);
    await loginPelaTela(p, login, SENHA);
    await p.goto('/prazos'); await aguardarTelaPronta(p);
    return { p, ctx };
  };
  // administrador: vê o tempo dos prazos em Fazendo de todos
  const adm = await ver('admteste');
  await adm.p.getByPlaceholder(/Partes, processo/).fill('do fazendo-e2e'); await adm.p.waitForTimeout(800);
  const linhaUm = adm.p.locator('tbody tr').filter({ hasText: 'Fazendo UM' });
  await expect(linhaUm.getByTestId('tempo-fazendo')).toHaveText('há 3 dias');
  await expect(adm.p.locator('tbody tr').filter({ hasText: 'De outra pessoa' }).getByTestId('tempo-fazendo')).toHaveText('há 1 dia');
  await adm.ctx.close();
  // quem faz: vê o dele
  const a = await ver('fazendo_a');
  await a.p.getByPlaceholder(/Partes, processo/).fill('do fazendo-e2e'); await a.p.waitForTimeout(800);
  await expect(a.p.locator('tbody tr').filter({ hasText: 'Fazendo UM' }).getByTestId('tempo-fazendo')).toHaveText('há 3 dias');
  await a.ctx.close();
  // o responsável pelo prazo (delegado) que não está fazendo também vê
  await noBanco('UPDATE prazos_processo SET delegado_para = ? WHERE id = ?', [d.b, d.p1]);
  const b = await ver('fazendo_b');
  await b.p.getByPlaceholder(/Partes, processo/).fill('do fazendo-e2e'); await b.p.waitForTimeout(800);
  await expect(b.p.locator('tbody tr').filter({ hasText: 'Fazendo UM' }).getByTestId('tempo-fazendo')).toHaveText('há 3 dias');
  await b.ctx.close();
  // um terceiro (sem ser admin, nem quem faz, nem o responsável) vê só o nome, sem o tempo
  await noBanco('UPDATE prazos_processo SET delegado_para = NULL WHERE id = ?', [d.p1]);
  await criarUsuarioComPermissoes('fazendo_c', [['prazos', null, 'visualizar']]);
  const c = await ver('fazendo_c');
  await c.p.getByPlaceholder(/Partes, processo/).fill('do fazendo-e2e'); await c.p.waitForTimeout(800);
  const linhaC = c.p.locator('tbody tr').filter({ hasText: 'Fazendo UM' });
  await expect(linhaC).toHaveCount(1);
  await expect(linhaC.getByTestId('tempo-fazendo')).toHaveCount(0);
  await c.ctx.close();
});

test('@critical Fazendo: em Configurações, 0 = nunca grava 0 e a tela volta mostrando 0 (não 60)', async ({ page }) => {
  const antes = (await noBanco('SELECT prazo_fazendo_timeout AS n FROM configuracoes_escritorio LIMIT 1'))[0].n;
  try {
    await loginPelaTela(page);
    await page.goto('/configuracoes'); await aguardarTelaPronta(page);
    const campo = page.getByLabel(/Liberar prazo "Fazendo" automaticamente/);
    await expect(campo).toBeVisible();
    await campo.fill('0');
    const gravou = page.waitForResponse(r => r.url().includes('/api/configuracoes/escritorio') && r.request().method() === 'PUT');   // o botão "Salvar" também combina com /salv/: esperar a gravação de verdade
    await page.getByRole('button', { name: 'Salvar Configurações' }).click();
    expect((await gravou).ok()).toBe(true);
    expect((await noBanco('SELECT prazo_fazendo_timeout AS n FROM configuracoes_escritorio LIMIT 1'))[0].n).toBe(0);
    await page.reload(); await aguardarTelaPronta(page);
    await expect(page.getByLabel(/Liberar prazo "Fazendo" automaticamente/)).toHaveValue('0');
  } finally {
    await noBanco('UPDATE configuracoes_escritorio SET prazo_fazendo_timeout = ?', [antes]);
  }
});
