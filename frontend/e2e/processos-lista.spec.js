import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, contarPastasDaLista, criarUsuarioSoVisualiza, loginPelaTela, prepararListaProcessos, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo B1 do plano (PLANO-TESTES-PROCESSOS.md): a tela "lista de Processos" (/processos), controle por controle —
// busca (e o debounce), paginação, filtro de assuntos, etiquetas pessoais e do escritório (filtrar e marcar), menu "⋮",
// abrir a pasta, "+ Novo Processo", usuário que só visualiza, erro do servidor, tela pequena e acessibilidade em cada estado.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });   // o aviso some sozinho e fica semitransparente no fim
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: o teste segue e mostra TODOS os problemas
}
const erroDeTela = (page) => expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
const CAMPO_BUSCA = 'Buscar por nº pasta, título, nº CNJ ou protocolo...';
const linhas = (page) => page.locator('tbody tr');
const pastasDasLinhas = async (page) => (await page.locator('tbody tr td:nth-child(1)').allInnerTexts()).map(t => Number(t.trim()));
const contador = (page) => page.getByText(/^\d+ pasta\(s\)$/);
async function buscar(page, texto) {
  const campo = page.getByPlaceholder(CAMPO_BUSCA);
  await campo.fill(texto);
  await aguardarTelaPronta(page);        // o servidor só é consultado 350 ms depois de parar de digitar
  await page.waitForTimeout(500); await aguardarTelaPronta(page);
}
async function abrirLista(page) { await page.goto('/processos'); await aguardarTelaPronta(page); await expect(linhas(page).first()).toBeVisible(); }

let dados; let totalPastas;
test.beforeAll(async () => { dados = await prepararListaProcessos(); totalPastas = await contarPastasDaLista(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

test('@critical Lista de Processos: cabeçalho, linhas, contador, paginação (20 por página) e acessibilidade', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await expect(page.getByPlaceholder(CAMPO_BUSCA)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo Processo' })).toBeVisible();
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  for (const coluna of ['Pasta', 'Título (Partes)', 'Tipo', 'Status', 'Processos', 'Etiq. Pessoal', 'Etiq. Escrit.', 'Ações']) {
    await expect(page.getByRole('columnheader', { name: coluna, exact: true })).toBeVisible();
  }
  // maior número de pasta primeiro, 20 por página
  const pagina1 = await pastasDasLinhas(page);
  expect(pagina1).toHaveLength(Math.min(20, totalPastas));
  expect(pagina1).toEqual([...pagina1].sort((a, b) => b - a));
  expect(pagina1[0]).toBe(99001);
  await expect(linhas(page).first().locator('td').nth(1)).toHaveAttribute('title', 'Abrir pasta');
  await expect(page.getByText(/^Página 1 de \d+$/)).toBeVisible();
  await expect(page.getByRole('button', { name: '← Anterior' })).toBeDisabled();
  await semViolacoes(page, 'lista de Processos (página 1)');
  await erroDeTela(page);
  // página 2
  await page.getByRole('button', { name: 'Próxima →' }).click(); await aguardarTelaPronta(page);
  const paginas = Math.ceil(totalPastas / 20);
  await expect(page.getByText(`Página 2 de ${paginas}`)).toBeVisible();
  const pagina2 = await pastasDasLinhas(page);
  expect(pagina2).toHaveLength(totalPastas - 20);
  expect(Math.max(...pagina2)).toBeLessThan(Math.min(...pagina1));       // continua a sequência, sem repetir pasta
  await expect(page.getByRole('button', { name: 'Próxima →' })).toBeDisabled();
  await semViolacoes(page, 'lista de Processos (última página)');
  await page.getByRole('button', { name: '← Anterior' }).click(); await aguardarTelaPronta(page);
  expect(await pastasDasLinhas(page)).toEqual(pagina1);
});

test('@critical Lista de Processos: busca por título, número da pasta, CNJ, protocolo, partes, CPF e telefone; sem resultado; curingas; volta à página 1', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await buscar(page, 'LISTA E2E 07');
  expect(await pastasDasLinhas(page)).toEqual([8107]);
  await expect(contador(page)).toHaveText('1 pasta(s)');
  await buscar(page, '8105');                                              // número da pasta: a célula fica destacada em verde
  expect(await pastasDasLinhas(page)).toEqual([8105]);
  await expect(linhas(page).first().locator('td').first()).toHaveCSS('background-color', 'rgb(220, 252, 231)');
  for (const termo of ['430', '0430']) {                                     // "430 == 0430": a pasta 430 aparece com 4 dígitos e fica destacada nos dois casos
    await buscar(page, termo);
    expect(await pastasDasLinhas(page), `busca "${termo}"`).toEqual([430]);
    await expect(linhas(page).first().locator('td').first()).toHaveCSS('background-color', 'rgb(220, 252, 231)');
    await expect(linhas(page).first().locator('td').first()).toContainText('0430');
  }
  await buscar(page, '7000012-11');                                         // número do processo (parte do CNJ)
  expect(await pastasDasLinhas(page)).toEqual([8112]);
  await buscar(page, 'PROT-LISTA-20');                                      // protocolo
  expect(await pastasDasLinhas(page)).toEqual([8120]);
  for (const termo of ['Cliente Lista', '71428793860', '714.287.938-60', '(11) 95555-4444']) {     // nome, CPF (com e sem pontos) e telefone da autora
    await buscar(page, termo);
    expect(await pastasDasLinhas(page), `busca "${termo}"`).toEqual([8103, 8102, 8101]);
  }
  await buscar(page, 'zzz nada disso existe');
  await expect(page.getByText('Nenhuma pasta encontrada')).toBeVisible();
  await expect(contador(page)).toHaveText('0 pasta(s)');
  await semViolacoes(page, 'lista de Processos sem resultado');
  for (const curinga of ['%', '_', '%%', 'LISTA_E2E']) {                   // curinga do LIKE é texto comum, não "qualquer coisa"
    await buscar(page, curinga);
    await expect(page.getByText('Nenhuma pasta encontrada'), `"${curinga}" trouxe resultado`).toBeVisible();
  }
  await buscar(page, '');                                                   // limpar a busca volta a lista inteira
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  // buscar estando na página 2 volta para a página 1
  await page.getByRole('button', { name: 'Próxima →' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText(/^Página 2 de/)).toBeVisible();
  await buscar(page, 'LISTA E2E');
  await expect(page.getByText(/^Página 1 de 2$/)).toBeVisible();
  await expect(contador(page)).toHaveText('26 pasta(s)');
});

test('@critical Lista de Processos: filtro de Assuntos (abrir, buscar, marcar, chips, remover, Limpar, combinar com a busca) e acessibilidade', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await expect(page.getByText('Selecionar assuntos...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Limpar', exact: true })).toHaveCount(0);       // só aparece com assunto marcado
  await page.getByText('Selecionar assuntos...').click();
  await expect(page.getByPlaceholder('Buscar assunto...')).toBeVisible();
  await semViolacoes(page, 'seletor de assuntos aberto');
  await page.getByPlaceholder('Buscar assunto...').fill('xyzzy');
  await expect(page.getByText('Nenhum assunto encontrado')).toBeVisible();
  await page.getByPlaceholder('Buscar assunto...').fill('LISTA B');                              // sem diferenciar maiúscula
  await expect(page.getByRole('checkbox', { name: 'Assunto Lista B' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Assunto Lista A' })).toHaveCount(0);
  await page.getByPlaceholder('Buscar assunto...').fill('');
  await page.getByRole('checkbox', { name: 'Assunto Lista A' }).check(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102, 8103, 8104, 8105]);
  await expect(contador(page)).toHaveText('5 pasta(s)');
  await page.getByRole('checkbox', { name: 'Assunto Lista B' }).check(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108]);   // A ou B
  await page.mouse.click(5, 5);                                                                     // clicar fora fecha a lista
  await expect(page.getByPlaceholder('Buscar assunto...')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Limpar', exact: true })).toBeVisible();
  await semViolacoes(page, 'lista com assuntos filtrados');
  // combinar com a busca (E, não OU)
  await buscar(page, 'Cliente Lista');
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102, 8103]);
  await buscar(page, '8107');
  expect(await pastasDasLinhas(page)).toEqual([8107]);
  await buscar(page, '');
  // tirar um assunto pelo "×" do chip
  await page.getByRole('button', { name: '×' }).first().click(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8104, 8105, 8106, 8107, 8108]);          // sobrou só o assunto B
  await page.getByRole('button', { name: 'Limpar', exact: true }).click(); await aguardarTelaPronta(page);
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  await expect(page.getByText('Selecionar assuntos...')).toBeVisible();
});

test('@critical Lista de Processos: etiquetas pessoais e do escritório — legenda, bolinhas, filtrar, combinar e limpar', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await expect(page.getByText('Minhas etiquetas:')).toBeVisible();
  await expect(page.getByText('Etiquetas do escritório:')).toBeVisible();
  const chipPessoal = (nome) => page.getByRole('button', { name: nome, exact: true }).first();
  const linhaDe = (pasta) => linhas(page).filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^\\s*${pasta}\\s*$`) }) });
  // bolinhas nas células da pasta 8101 (pessoal "Urgente E2E" e do escritório "Arquivada E2E") e traço nas sem etiqueta
  await buscar(page, 'LISTA E2E 01');
  await expect(linhaDe(8101).locator('td').nth(5).locator('[title="Urgente E2E"]')).toBeVisible();
  await expect(linhaDe(8101).locator('td').nth(6).locator('[title="Arquivada E2E"]')).toBeVisible();
  await buscar(page, 'LISTA E2E 10');
  await expect(linhaDe(8110).locator('td').nth(5).locator('[title="Sem etiqueta"]')).toBeVisible();
  await expect(linhaDe(8110).locator('td').nth(6).locator('[title="Sem etiqueta"]')).toBeVisible();
  await buscar(page, '');
  await semViolacoes(page, 'lista com legendas de etiquetas');
  // filtro pessoal
  await chipPessoal('Urgente E2E').click(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102]);
  await expect(chipPessoal('Urgente E2E')).toHaveAttribute('title', 'Clique para tirar o filtro');
  await expect(page.getByRole('button', { name: 'limpar filtro' }).first()).toBeVisible();
  await semViolacoes(page, 'lista com filtro de etiqueta pessoal ligado');
  await chipPessoal('Aguardando E2E').click(); await aguardarTelaPronta(page);                       // trocar de cor troca o filtro
  expect(await pastasDasLinhas(page)).toEqual([8103]);
  await chipPessoal('Aguardando E2E').click(); await aguardarTelaPronta(page);                       // clicar de novo desliga
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  // filtro do escritório (derivado: só pastas onde TODOS os processos têm a mesma etiqueta)
  await chipPessoal('Arquivada E2E').click(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102]);
  await chipPessoal('Em recurso E2E').click(); await aguardarTelaPronta(page);
  expect(await pastasDasLinhas(page)).toEqual([8103]);
  // os dois ao mesmo tempo (E): pessoal "Urgente" + escritório "Arquivada" = 8101 e 8102; pessoal "Aguardando" + "Arquivada" = nenhuma
  await chipPessoal('Arquivada E2E').click(); await aguardarTelaPronta(page);
  await chipPessoal('Urgente E2E').click(); await aguardarTelaPronta(page);
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102]);
  await chipPessoal('Aguardando E2E').click(); await aguardarTelaPronta(page);
  await expect(page.getByText('Nenhuma pasta encontrada')).toBeVisible();
  await semViolacoes(page, 'lista com dois filtros de etiqueta sem resultado');
  // "limpar filtro" desliga um de cada vez
  while (await page.getByRole('button', { name: 'limpar filtro' }).count()) { await page.getByRole('button', { name: 'limpar filtro' }).first().click(); await aguardarTelaPronta(page); }
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  // filtro de etiqueta + busca + página 2: mudar o filtro volta para a página 1
  await page.getByRole('button', { name: 'Próxima →' }).click(); await aguardarTelaPronta(page);
  await chipPessoal('Urgente E2E').click(); await aguardarTelaPronta(page);
  await expect(page.getByText(/^Página \d+ de \d+$/)).toHaveCount(0);                               // com 2 pastas só há uma página (sem paginação)
  expect((await pastasDasLinhas(page)).sort()).toEqual([8101, 8102]);
});

test('@critical Lista de Processos: marcar e remover a etiqueta pessoal pelo menu ⋮ (reflete na linha e fica gravado)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await buscar(page, 'LISTA E2E 10');
  const linha = linhas(page).first();
  const celulaPessoal = linha.locator('td').nth(5);
  await expect(celulaPessoal.locator('[title="Sem etiqueta"]')).toBeVisible();
  await abrirMenuAcoes(page, linha);
  await expect(page.getByRole('button', { name: /Abrir pasta/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Etiquetas/ })).toBeVisible();
  await semViolacoes(page, 'menu ⋮ da lista aberto');
  await page.getByRole('button', { name: /Etiquetas/ }).click();
  await expect(page.getByRole('button', { name: 'Remover etiqueta' })).toHaveCount(0);              // sem etiqueta marcada, não há o que remover
  await page.getByRole('table').getByRole('button', { name: /Aguardando E2E/ }).click();
  await expect(celulaPessoal.locator('[title="Aguardando E2E"]')).toBeVisible();                    // aparece na hora, sem recarregar
  expect((await noBanco('SELECT slot FROM pastas_etiquetas WHERE pasta_id = ? AND usuario_id = 1', [dados.pastaId[8110]])).map(r => Number(r.slot))).toEqual([2]);
  await abrirMenuAcoes(page, linha);
  await page.getByRole('button', { name: /Etiquetas/ }).click();
  await page.getByRole('table').getByRole('button', { name: /Urgente E2E/ }).click();                 // trocar de cor
  await expect(celulaPessoal.locator('[title="Urgente E2E"]')).toBeVisible();
  expect((await noBanco('SELECT slot FROM pastas_etiquetas WHERE pasta_id = ? AND usuario_id = 1', [dados.pastaId[8110]])).map(r => Number(r.slot))).toEqual([1]);
  await abrirMenuAcoes(page, linha);
  await page.getByRole('button', { name: /Etiquetas/ }).click();
  await page.getByRole('button', { name: 'Remover etiqueta' }).click();
  await expect(celulaPessoal.locator('[title="Sem etiqueta"]')).toBeVisible();
  expect(await noBanco('SELECT slot FROM pastas_etiquetas WHERE pasta_id = ? AND usuario_id = 1', [dados.pastaId[8110]])).toHaveLength(0);
  await erroDeTela(page);
});

test('@critical Lista de Processos: abrir a pasta pelo título e pelo menu ⋮ → "Abrir pasta"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await buscar(page, 'LISTA E2E 12');
  await linhas(page).first().locator('td').nth(1).click();                                           // clicar no título abre a pasta
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${dados.pastaId[8112]}$`));
  await aguardarTelaPronta(page);
  await expect(page.getByRole('button', { name: '← Voltar' })).toBeVisible();
  await page.getByRole('button', { name: '← Voltar' }).click();
  await expect(page).toHaveURL(/\/processos$/);
  await expect(linhas(page).first()).toBeVisible();
  await buscar(page, 'LISTA E2E 13');
  await abrirMenuAcoes(page, linhas(page).first());
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${dados.pastaId[8113]}$`));
  await aguardarTelaPronta(page);
  await erroDeTela(page);
});

test('@critical Lista de Processos: "+ Novo Processo" abre a janela e Cancelar/✕/ESC fecham sem criar nada', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  const antes = await contarPastasDaLista();
  for (const fechar of [
    async () => page.locator('.modal-box').getByRole('button', { name: 'Cancelar' }).click(),
    async () => page.locator('.modal-box .modal-fechar').click(),
    async () => page.keyboard.press('Escape'),
  ]) {
    await page.getByRole('button', { name: '+ Novo Processo' }).click();
    await expect(page.locator('.modal-box').getByRole('heading', { name: 'Novo Processo' })).toBeVisible();
    await fechar();
    await expect(page.locator('.modal-box')).toHaveCount(0);
  }
  expect(await contarPastasDaLista()).toBe(antes);
  await expect(contador(page)).toHaveText(`${antes} pasta(s)`);
});

test('@critical Lista de Processos: quem só pode VISUALIZAR vê a lista, mas não vê "+ Novo Processo"', async ({ page }) => {
  const login = await criarUsuarioSoVisualiza();
  await loginPelaTela(page, login);
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await expect(linhas(page).first()).toBeVisible();
  await expect(page.getByPlaceholder(CAMPO_BUSCA)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo Processo' })).toHaveCount(0);
  await expect(contador(page)).toHaveText(`${totalPastas} pasta(s)`);
  await semViolacoes(page, 'lista de Processos para quem só visualiza');
  // menu ⋮ continua oferecendo "Abrir pasta"
  await abrirMenuAcoes(page, linhas(page).first());
  await expect(page.getByRole('button', { name: /Abrir pasta/ })).toBeVisible();
});

test('@critical Lista de Processos: erro do servidor mostra aviso e a tela não quebra; ao voltar o servidor, a lista carrega', async ({ page }) => {
  await loginPelaTela(page);
  await abrirLista(page);
  await page.route('**/api/processos/pastas?**', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor' }) }));
  await page.getByPlaceholder(CAMPO_BUSCA).fill('LISTA');
  await expect(page.getByText('Erro ao carregar processos')).toBeVisible({ timeout: 10000 });
  await erroDeTela(page);
  await expect(page.getByPlaceholder(CAMPO_BUSCA)).toBeVisible();                                   // a tela continua utilizável
  await page.unroute('**/api/processos/pastas?**');
  await page.getByPlaceholder(CAMPO_BUSCA).fill('LISTA E2E 02');
  await aguardarTelaPronta(page); await page.waitForTimeout(500); await aguardarTelaPronta(page);
  expect(await pastasDasLinhas(page)).toEqual([8102]);
});

test('@critical Lista de Processos em tela pequena (celular): sem rolagem lateral da página e com os controles principais à vista', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await loginPelaTela(page);
  await abrirLista(page);
  await expect(page.getByPlaceholder(CAMPO_BUSCA)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo Processo' })).toBeVisible();
  const { largura, janela } = await page.evaluate(() => ({ largura: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(largura, `a página tem rolagem lateral (${largura}px de largura numa janela de ${janela}px)`).toBeLessThanOrEqual(janela);
  await expect(contador(page)).toBeVisible();
  await semViolacoes(page, 'lista de Processos no celular');
});
