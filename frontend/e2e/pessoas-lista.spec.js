import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, loginPelaTela, violacoesGraves } from './helpers.js';
import { createRequire } from 'node:module';

// Teste de TELA da LISTA de Pessoas (abas Físicas e Jurídicas): colunas, busca (nome, CPF/CNPJ, telefone, RG, PIS, endereço — com e sem máscara,
// curingas % e _), paginação, exportar para Excel (janela de campos + arquivo baixado), menu "⋮", excluir (confirmação, bloqueio por vínculo),
// unificar duplicadas (pessoa e empresa), "Qtde Proc", falha do servidor e quem NÃO é administrador.
// Os dados nascem e morrem aqui (nomes com "Listaze"); a internet é bloqueada.
const requisitar = createRequire(import.meta.url);
const { conectarBancoTeste } = requisitar('../../backend/tests/support/testDatabase');
const ExcelJS = requisitar('../../backend/node_modules/exceljs');
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
function cnpjValido(base12) {
  const n = base12.split('').map(Number);
  const dv = (lista) => {
    const pesos = lista.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = lista.reduce((s, x, i) => s + x * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(n); const d2 = dv([...n, d1]);
  return `${base12}${d1}${d2}`;
}
const mascaraCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
const mascaraCnpj = (c) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const CPF = { alfa: cpfValido('500000011'), beta: cpfValido('500000022'), unifA: cpfValido('500000033'), unifB: cpfValido('500000044'), unifC: cpfValido('500000055') };
const CNPJ = { alfa: cnpjValido('520000010001'), beta: cnpjValido('520000020001'), unifA: cnpjValido('520000030001') };
const MARCA = 'Listaze';

async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const contador = (page) => page.getByText(/^\d+ registro\(s\)$/);
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const linhas = (page) => page.locator('tbody tr');
const linhaDe = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });

let d;
async function prepararDados() {
  const dados = {};
  const pf = async (nome, extra = {}) => {
    const colunas = ['nome', ...Object.keys(extra)];
    return (await noBanco(`INSERT INTO pessoas_fisicas (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`, [nome, ...Object.values(extra)])).insertId;
  };
  const pj = async (razao, extra = {}) => {
    const colunas = ['razao_social', ...Object.keys(extra)];
    return (await noBanco(`INSERT INTO pessoas_juridicas (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`, [razao, ...Object.values(extra)])).insertId;
  };
  dados.alfa = await pf(`Alfa ${MARCA} Silva`, { cpf: CPF.alfa, rg: '11.222.333-4', pis: '987.65432.10-9', logradouro: `Rua Marechal ${MARCA}`, cidade: 'Campinas', estado: 'SP' });
  await noBanco("INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, '(19) 97531-8642', 'celular', 1)", [dados.alfa]);
  await noBanco("INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, 'alfa@listaze.invalid', 1)", [dados.alfa]);
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (1, 'fisica', ?, 1)", [dados.alfa]);   // 1 processo: Qtde Proc e bloqueio de exclusão
  dados.beta = await pf(`Beta ${MARCA} Souza`, { cpf: CPF.beta });
  dados.desconto = await pf(`Desconto 100% ${MARCA}`);
  dados.zeta = await pf(`Zeta ${MARCA} Para Excluir`);
  for (let i = 1; i <= 45; i += 1) await pf(`Paginada ${MARCA} ${String(i).padStart(2, '0')}`);
  dados.empAlfa = await pj(`Alfa ${MARCA} Comercio Ltda`, { cnpj: CNPJ.alfa, nome_fantasia: 'Alfa Fantasia' });
  await noBanco("INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, '(19) 3355-7788', 'Comercial', 1)", [dados.empAlfa]);
  dados.empBeta = await pj(`Beta ${MARCA} Industria Ltda`, { cnpj: CNPJ.beta });
  return dados;
}
async function limparDados() {
  const idsPf = (await noBanco(`SELECT id FROM pessoas_fisicas WHERE nome LIKE '%${MARCA}%'`)).map(r => r.id);
  const idsPj = (await noBanco(`SELECT id FROM pessoas_juridicas WHERE razao_social LIKE '%${MARCA}%'`)).map(r => r.id);
  for (const [tipo, ids] of [['fisica', idsPf], ['juridica', idsPj]]) {
    if (!ids.length) continue;
    const marcas = ids.map(() => '?').join(',');
    for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu']) await noBanco(`DELETE FROM ${tabela} WHERE tipo_pessoa = ? AND pessoa_id IN (${marcas})`, [tipo, ...ids]);
  }
  if (idsPf.length) await noBanco(`DELETE FROM pessoas_fisicas WHERE id IN (${idsPf.map(() => '?').join(',')})`, idsPf);
  if (idsPj.length) await noBanco(`DELETE FROM pessoas_juridicas WHERE id IN (${idsPj.map(() => '?').join(',')})`, idsPj);
}

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { await limparDados(); d = await prepararDados(); });
test.afterAll(async () => { await limparDados(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function irParaPessoas(page, login = 'admteste') {
  await loginPelaTela(page, login);
  await page.goto('/pessoas'); await aguardarTelaPronta(page);
}
async function irParaJuridicas(page) {
  await irParaPessoas(page);
  await page.getByRole('button', { name: 'Pessoas Jurídicas', exact: true }).click();
  await expect(page.getByPlaceholder(/Buscar por razão social/)).toBeVisible();
}
const caixaBusca = (page) => page.getByPlaceholder(/^Buscar por /);
// Digita na busca e espera a lista mostrar o total esperado (a busca tem uma pausa de 350 ms antes de consultar)
async function buscar(page, termo, total) {
  await caixaBusca(page).fill(termo);
  await expect(contador(page)).toHaveText(`${total} registro(s)`);
}
const menuDe = async (page, linha) => { await abrirMenuAcoes(page, linha); };
const itemDoMenu = (page, nome) => page.getByRole('button', { name: new RegExp(`^\\S*\\s*${nome}$`) });

test('@critical Lista de Pessoas Físicas: colunas, linha completa (CPF com máscara, telefone, e-mail, Qtde Proc), contador, troca de aba e acessibilidade', async ({ page }) => {
  await irParaPessoas(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Nome', 'CPF', 'Telefone', 'E-mail', 'Qtde Proc', 'Etiq. Escrit.', 'Ações']);
  await buscar(page, `Alfa ${MARCA} Silva`, 1);
  const alfa = linhaDe(page, `Alfa ${MARCA} Silva`);
  await expect(alfa).toContainText(mascaraCpf(CPF.alfa));
  await expect(alfa).toContainText('(19) 97531-8642');
  await expect(alfa).toContainText('alfa@listaze.invalid');
  await expect(alfa.locator('td').nth(4)).toHaveText(/1/);                                 // Qtde Proc
  await expect(alfa.getByTitle('Mais ações')).toBeVisible();
  await semViolacoes(page, 'lista de Pessoas Físicas');
  await page.getByRole('button', { name: 'Pessoas Jurídicas', exact: true }).click();
  await expect(page.getByRole('columnheader')).toHaveText(['Razão Social', 'Nome Fantasia', 'CNPJ', 'Telefone', 'Qtde Proc', 'Etiq. Escrit.', 'Ações']);
  await expect(caixaBusca(page)).toHaveAttribute('placeholder', 'Buscar por razão social, CNPJ, telefone, endereço...');
  await expect(caixaBusca(page)).toHaveValue(`Alfa ${MARCA} Silva`);                       // a busca digitada continua, mas agora vale para empresas
  await buscar(page, `Alfa ${MARCA}`, 1);
  const emp = linhaDe(page, `Alfa ${MARCA} Comercio Ltda`);
  await expect(emp).toContainText('Alfa Fantasia'); await expect(emp).toContainText(mascaraCnpj(CNPJ.alfa)); await expect(emp).toContainText('(19) 3355-7788');
  await semViolacoes(page, 'lista de Pessoas Jurídicas');
  await page.getByRole('button', { name: 'Pessoas Físicas', exact: true }).click();
  await expect(page.getByRole('columnheader').first()).toHaveText('Nome');
});

test('@critical Busca (físicas): nome, CPF, telefone, RG, PIS e endereço — digitados COM ou SEM máscara —, sem resultado, "Limpar pesquisa", % e _ como texto', async ({ page }) => {
  await irParaPessoas(page);
  const alfa = `Alfa ${MARCA} Silva`;
  await expect(page.getByRole('button', { name: 'Limpar pesquisa' })).toHaveCount(0);       // só aparece com algo digitado
  await buscar(page, `alfa ${MARCA.toLowerCase()}`, 1); await expect(linhaDe(page, alfa)).toBeVisible();   // maiúscula/minúscula não importa
  await expect(page.getByRole('button', { name: 'Limpar pesquisa' })).toBeVisible();
  for (const termo of [CPF.alfa, mascaraCpf(CPF.alfa), '11.222.333-4', '112223334', '987.65432.10-9', '98765432109', '(19) 97531-8642', '19975318642', `Marechal ${MARCA}`, 'campinas', 'alfa@listaze'])
    { await buscar(page, termo, 1); await expect(linhaDe(page, alfa), `busca por "${termo}"`).toBeVisible(); }
  await buscar(page, 'zzz ninguem com esse nome', 0);
  await expect(page.getByText('Nenhum registro encontrado')).toBeVisible();
  await buscar(page, `Alfa_${MARCA}`, 0);                                                    // "_" é procurado como texto (não vale "qualquer letra")
  await buscar(page, '100%', 1); await expect(linhaDe(page, `Desconto 100% ${MARCA}`)).toBeVisible();   // "%" é procurado como texto
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(caixaBusca(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Limpar pesquisa' })).toHaveCount(0);
  await expect(contador(page)).not.toHaveText('0 registro(s)');                             // voltou a lista inteira
});

test('@critical Busca (jurídicas): razão social, nome fantasia, CNPJ e telefone — com ou sem máscara —, sem resultado e "Limpar pesquisa"', async ({ page }) => {
  await irParaJuridicas(page);
  const emp = `Alfa ${MARCA} Comercio Ltda`;
  for (const termo of [`alfa ${MARCA.toLowerCase()} comercio`, 'Alfa Fantasia', CNPJ.alfa, mascaraCnpj(CNPJ.alfa), '(19) 3355-7788', '1933557788'])
    { await buscar(page, termo, 1); await expect(linhaDe(page, emp), `busca por "${termo}"`).toBeVisible(); }
  await buscar(page, MARCA, 2);                                                              // as duas empresas de teste
  await buscar(page, 'zzz ninguem com esse nome', 0); await expect(page.getByText('Nenhum registro encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click(); await expect(caixaBusca(page)).toHaveValue('');
});

test('@critical Paginação: 20 por página, "Página X de Y", Anterior/Próxima travam nas pontas, ordem pelo nome, e nova busca volta à página 1', async ({ page }) => {
  await irParaPessoas(page);
  await buscar(page, `Paginada ${MARCA}`, 45);
  await expect(page.getByText('Página 1 de 3')).toBeVisible();
  await expect(linhas(page)).toHaveCount(20);
  await expect(linhas(page).first()).toContainText(`Paginada ${MARCA} 01`); await expect(linhas(page).last()).toContainText(`Paginada ${MARCA} 20`);
  await expect(page.getByRole('button', { name: '← Anterior' })).toBeDisabled();
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await expect(linhas(page).first()).toContainText(`Paginada ${MARCA} 21`); await expect(linhas(page).last()).toContainText(`Paginada ${MARCA} 40`);
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByText('Página 3 de 3')).toBeVisible();
  await expect(linhas(page)).toHaveCount(5);
  await expect(linhas(page).last()).toContainText(`Paginada ${MARCA} 45`);
  await expect(page.getByRole('button', { name: 'Próxima →' })).toBeDisabled();
  await semViolacoes(page, 'lista paginada (página 3)');
  await page.getByRole('button', { name: '← Anterior' }).click(); await expect(page.getByText('Página 2 de 3')).toBeVisible();
  await caixaBusca(page).fill(`Alfa ${MARCA}`);                                              // nova busca (só letras: com números a busca também olha CPF/telefone): 1 resultado, sem paginação
  await expect(contador(page)).toHaveText('1 registro(s)');
  await expect(page.getByText(/Página \d+ de/)).toHaveCount(0);
  await caixaBusca(page).fill(MARCA);                                                       // busca grande outra vez: recomeça na página 1 (e não na 2 em que estava)
  await expect(page.getByText(/^Página 1 de \d+$/)).toBeVisible();
});

// Guarda o nome que a tela pede para o arquivo (atributo "download" do link): o navegador de teste esconde o nome quando ele tem acento
const guardarNomeDoDownload = (page) => page.addInitScript(() => {
  const clicar = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__nomeDoDownload = this.download; return clicar.call(this); };
});
test('@critical Exportar Excel (físicas): janela com só o Nome marcado, avisa se desmarcar tudo, Cancelar/✕/ESC fecham, e o arquivo baixado tem a busca atual e só os campos marcados', async ({ page }) => {
  await guardarNomeDoDownload(page);
  await irParaPessoas(page);
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  const j = janela(page, 'Exportar para Excel');
  await expect(j.getByText('Será exportada a lista inteira.')).toBeVisible();
  await expect(j.getByLabel('Nome', { exact: true })).toBeChecked();
  expect(await j.locator('input[type=checkbox]:checked').count()).toBe(1);                   // só o nome vem marcado
  await semViolacoes(page, 'janela Exportar para Excel');
  await j.getByLabel('Nome', { exact: true }).uncheck();
  await j.getByRole('button', { name: 'Exportar', exact: true }).click();
  await aviso(page, 'Selecione ao menos um campo');
  await expect(j).toBeVisible();                                                             // continua aberta
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exportar Excel' }).click(); await janela(page, 'Exportar para Excel').getByRole('button', { name: '✕', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  // com busca: a janela avisa e o arquivo traz só o que a busca achou, só com os campos marcados
  await esperarSemAviso(page);
  await buscar(page, `Alfa ${MARCA} Silva`, 1);
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  const j2 = janela(page, 'Exportar para Excel');
  await expect(j2.getByText('Será exportada a busca atual.')).toBeVisible();
  await j2.getByLabel('CPF', { exact: true }).check(); await j2.getByLabel('Telefone', { exact: true }).check();
  const baixando = page.waitForEvent('download');
  await j2.getByRole('button', { name: 'Exportar', exact: true }).click();
  const arquivo = await baixando;
  expect(await page.evaluate(() => window.__nomeDoDownload)).toMatch(/^Pessoas F.sicas - \d{2}-\d{2}-\d{4}\.xlsx$/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await arquivo.path());
  const ws = wb.worksheets[0];
  expect(ws.getRow(1).values.slice(1)).toEqual(['Nome', 'CPF', 'Telefone']);
  expect(ws.getRow(2).values.slice(1)).toEqual([`Alfa ${MARCA} Silva`, CPF.alfa, '(19) 97531-8642']);
  expect(ws.rowCount).toBe(2);
  await expect(page.locator('.modal-box')).toHaveCount(0);                                   // fecha sozinha depois de baixar
  // ESC também fecha (e uma nova abertura volta só com o Nome marcado)
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  await expect(janela(page, 'Exportar para Excel').locator('input[type=checkbox]:checked')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Exportar Excel (jurídicas): campos de empresa e arquivo baixado com a busca atual', async ({ page }) => {
  await guardarNomeDoDownload(page);
  await irParaJuridicas(page);
  await buscar(page, `Alfa ${MARCA}`, 1);
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  const j = janela(page, 'Exportar para Excel');
  await expect(j.getByLabel('Razão social', { exact: true })).toBeChecked();
  await j.getByLabel('CNPJ', { exact: true }).check();
  const baixando = page.waitForEvent('download');
  await j.getByRole('button', { name: 'Exportar', exact: true }).click();
  const arquivo = await baixando;
  expect(await page.evaluate(() => window.__nomeDoDownload)).toMatch(/^Pessoas Jur.dicas - \d{2}-\d{2}-\d{4}\.xlsx$/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await arquivo.path());
  const ws = wb.worksheets[0];
  expect(ws.getRow(1).values.slice(1)).toEqual(['Razão social', 'CNPJ']);
  expect(ws.getRow(2).values.slice(1)).toEqual([`Alfa ${MARCA} Comercio Ltda`, CNPJ.alfa]);
  expect(ws.rowCount).toBe(2);
});

test('@critical Menu ⋮ e "Qtde Proc": itens do menu, Editar, Anotações, Enviar e-mail/WhatsApp (avisos quando não há contato), processos da pessoa e Etiqueta', async ({ page }) => {
  await irParaPessoas(page);
  await buscar(page, `Alfa ${MARCA} Silva`, 1);
  const alfa = linhaDe(page, `Alfa ${MARCA} Silva`);
  await menuDe(page, alfa);
  for (const item of ['Etiqueta', 'Anotações de atendimento', 'Enviar Email', 'Enviar WhatsApp', 'Editar', 'Excluir']) await expect(itemDoMenu(page, item), item).toBeVisible();
  await expect(alfa.getByTitle('Mais ações')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape'); await expect(itemDoMenu(page, 'Editar')).toHaveCount(0);   // ESC fecha o menu...
  await expect(alfa.getByTitle('Mais ações')).toBeFocused();                                     // ...e o foco volta ao botão ⋮
  await expect(alfa.getByTitle('Mais ações')).toHaveAttribute('aria-expanded', 'false');
  await menuDe(page, alfa); await page.mouse.click(5, 5); await expect(itemDoMenu(page, 'Editar')).toHaveCount(0);   // clicar fora também fecha
  // Editar abre a ficha e Cancelar volta para a lista
  await menuDe(page, alfa); await itemDoMenu(page, 'Editar').click();
  await expect(page.getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  // Anotações de atendimento
  await menuDe(page, alfa); await itemDoMenu(page, 'Anotações de atendimento').click();
  await expect(page.getByRole('heading', { name: `Anotações de atendimento — Alfa ${MARCA} Silva` })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
  // Enviar e-mail: com e-mail abre a janela; sem e-mail avisa
  await menuDe(page, alfa); await itemDoMenu(page, 'Enviar Email').click();
  await expect(page.getByRole('heading', { name: `Enviar e-mail — Alfa ${MARCA} Silva` })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
  // Qtde Proc: abre a janela com o processo (e fecha por ✕ e por ESC)
  await alfa.getByRole('button', { name: 'Ver os processos (1)' }).focus();                    // o número é um botão: abre pelo teclado (Enter)
  await page.keyboard.press('Enter');
  const procs = janela(page, `Processos — Alfa ${MARCA} Silva`);
  await expect(procs.getByText('1 processo(s).')).toBeVisible();
  await expect(procs.getByText('0000001-01.2026.5.15.0001')).toBeVisible();
  await semViolacoes(page, 'janela Processos da pessoa');
  await procs.getByRole('button', { name: '✕', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await alfa.getByTitle('Ver os processos').click(); await expect(janela(page, `Processos — Alfa ${MARCA} Silva`)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
  // sem e-mail e sem telefone: só avisa
  await buscar(page, `Zeta ${MARCA}`, 1);
  const zeta = linhaDe(page, `Zeta ${MARCA}`);
  await menuDe(page, zeta); await itemDoMenu(page, 'Enviar Email').click();
  await aviso(page, 'Esta pessoa não tem e-mail cadastrado'); await expect(page.locator('.modal-box')).toHaveCount(0);
  await esperarSemAviso(page);
  await menuDe(page, zeta); await itemDoMenu(page, 'Enviar WhatsApp').click();
  await aviso(page, 'Esta pessoa não tem telefone cadastrado'); await expect(page.locator('.modal-box')).toHaveCount(0);
  await esperarSemAviso(page);
  // Etiqueta > Histórico da etiqueta abre a janela do histórico
  await menuDe(page, zeta); await itemDoMenu(page, 'Etiqueta').hover();
  await page.getByRole('button', { name: /Histórico da etiqueta/ }).click();
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Excluir: a confirmação (Cancelar, ESC e clique fora NÃO apagam), pessoa com processo é BLOQUEADA com o motivo, e a sem vínculo é apagada', async ({ page }) => {
  await irParaPessoas(page);
  await buscar(page, `Zeta ${MARCA}`, 1);
  const zeta = linhaDe(page, `Zeta ${MARCA}`);
  const confirmacao = () => janela(page, 'Confirmar exclusão');
  const aindaExiste = async () => (await noBanco('SELECT id FROM pessoas_fisicas WHERE id = ?', [d.zeta])).length === 1;
  await menuDe(page, zeta); await itemDoMenu(page, 'Excluir').click();
  await expect(confirmacao().getByText(`Tem certeza que deseja excluir Zeta ${MARCA} Para Excluir?`)).toBeVisible();
  await expect(confirmacao().getByText('O cadastro será apagado e não poderá ser recuperado.')).toBeVisible();   // diz a verdade: o servidor apaga de verdade
  await expect(confirmacao().getByText('ficará inativo')).toHaveCount(0);
  await semViolacoes(page, 'confirmação de exclusão');
  await confirmacao().getByRole('button', { name: 'Cancelar' }).click(); await expect(page.locator('.modal-box')).toHaveCount(0); expect(await aindaExiste()).toBe(true);
  await menuDe(page, zeta); await itemDoMenu(page, 'Excluir').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0); expect(await aindaExiste()).toBe(true);
  await menuDe(page, zeta); await itemDoMenu(page, 'Excluir').click(); await page.mouse.click(5, 5);                  // clique fora da janela
  await expect(page.locator('.modal-box')).toHaveCount(0); expect(await aindaExiste()).toBe(true);
  // pessoa com processo: o servidor bloqueia e o motivo aparece; nada é apagado
  await buscar(page, `Alfa ${MARCA} Silva`, 1);
  const alfa = linhaDe(page, `Alfa ${MARCA} Silva`);
  await menuDe(page, alfa); await itemDoMenu(page, 'Excluir').click();
  await confirmacao().getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Pessoa não pode ser excluída pois possui: 1 processo(s) como autor');
  expect((await noBanco('SELECT id FROM pessoas_fisicas WHERE id = ?', [d.alfa])).length).toBe(1);
  await confirmacao().getByRole('button', { name: 'Cancelar' }).click();
  await esperarSemAviso(page);
  await expect(alfa).toBeVisible();
  // sem vínculo: apaga e a linha some
  await buscar(page, `Zeta ${MARCA}`, 1);
  await menuDe(page, linhaDe(page, `Zeta ${MARCA}`)); await itemDoMenu(page, 'Excluir').click();
  await confirmacao().getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Pessoa excluída com sucesso');
  await expect(contador(page)).toHaveText('0 registro(s)');
  expect(await aindaExiste()).toBe(false);
});

test('@critical Unificar duplicadas (pessoas): modo de seleção, "Continuar" só com 2, janela com o principal, CPFs diferentes são barrados na janela, e unificar move o telefone para o principal', async ({ page }) => {
  const criar = async (nome, extra = {}) => (await noBanco(`INSERT INTO pessoas_fisicas (nome${Object.keys(extra).map(k => `, ${k}`).join('')}) VALUES (?${Object.keys(extra).map(() => ', ?').join('')})`, [nome, ...Object.values(extra)])).insertId;
  const principal = await criar(`Unif Principal ${MARCA}`, { cpf: CPF.unifA });
  const duplicada = await criar(`Unif Duplicada ${MARCA}`);
  await noBanco("INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, '(19) 97000-0001', 'celular', 1)", [duplicada]);
  await criar(`Unif CpfDiferente ${MARCA}`, { cpf: CPF.unifB });
  await irParaPessoas(page);
  await buscar(page, `Unif `, 3);
  await page.getByRole('button', { name: 'Unificar duplicadas' }).click();
  await expect(page.getByText('0 selecionado(s)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar →' })).toBeDisabled();
  await expect(page.getByLabel('Selecionar esta pessoa')).toHaveCount(3);
  await semViolacoes(page, 'lista no modo Unificar duplicadas');
  await linhaDe(page, `Unif Principal ${MARCA}`).getByLabel('Selecionar esta pessoa').check();
  await expect(page.getByRole('button', { name: 'Continuar →' })).toBeDisabled();             // com 1 ainda não dá
  await linhaDe(page, `Unif CpfDiferente ${MARCA}`).getByLabel('Selecionar esta pessoa').check();
  await expect(page.getByText('2 selecionado(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar →' }).click();
  const j = janela(page, 'Unificar pessoas duplicadas');
  await expect(j.getByText('PRINCIPAL (fica)')).toHaveCount(1); await expect(j.getByText('será excluído')).toHaveCount(1);
  await expect(j.getByText('1 cadastro(s) será(ão) apagado(s) do banco.')).toBeVisible();
  await expect(j.getByText(`CPF ${mascaraCpf(CPF.unifA)}`)).toBeVisible();
  await semViolacoes(page, 'janela Unificar pessoas duplicadas');
  await j.getByRole('button', { name: 'Unificar agora' }).click();                            // dois CPFs diferentes: o servidor barra
  await expect(j.getByText('Estes cadastros têm CPFs diferentes e não podem ser unificados')).toBeVisible();
  await expect(j.getByRole('button', { name: 'Unificar agora' })).toBeEnabled();              // continua aberta, dá para corrigir a escolha
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(page.getByText('2 selecionado(s)')).toBeVisible();                              // Cancelar da janela mantém o modo e a seleção
  // troca a seleção: a CpfDiferente sai, entra a Duplicada (sem CPF)
  await linhaDe(page, `Unif CpfDiferente ${MARCA}`).getByLabel('Selecionar esta pessoa').uncheck();
  await linhaDe(page, `Unif Duplicada ${MARCA}`).getByLabel('Selecionar esta pessoa').check();
  await page.getByRole('button', { name: 'Continuar →' }).click();
  const j2 = janela(page, 'Unificar pessoas duplicadas');
  await j2.getByText(`Unif Principal ${MARCA}`).click();                                    // escolhe o principal (o que tem CPF)
  await j2.getByRole('button', { name: 'Unificar agora' }).click();
  await aviso(page, 'Pessoas unificadas com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0);                              // saiu do modo de unificação
  await expect(page.getByRole('button', { name: 'Unificar duplicadas' })).toBeVisible();
  await expect(contador(page)).toHaveText('2 registro(s)');                                    // a duplicada saiu da lista
  expect((await noBanco('SELECT id FROM pessoas_fisicas WHERE id = ?', [duplicada])).length).toBe(0);   // apagada de verdade
  expect((await noBanco('SELECT numero FROM telefones_pf WHERE pessoa_id = ?', [principal])).map(t => t.numero)).toEqual(['(19) 97000-0001']);   // o telefone foi para o principal
  // Cancelar do próprio modo de unificação
  await page.getByRole('button', { name: 'Unificar duplicadas' }).click(); await expect(page.getByText('0 selecionado(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0); await expect(page.getByLabel('Selecionar esta pessoa')).toHaveCount(0);
});

test('@critical Unificar duplicadas (empresas): título próprio, principal sugerido é o com mais processos, e a marca "Em Recuperação Judicial" do duplicado passa para o principal', async ({ page }) => {
  const emp = async (razao, extra = {}) => (await noBanco(`INSERT INTO pessoas_juridicas (razao_social${Object.keys(extra).map(k => `, ${k}`).join('')}) VALUES (?${Object.keys(extra).map(() => ', ?').join('')})`, [razao, ...Object.values(extra)])).insertId;
  const principal = await emp(`Unif Matriz ${MARCA} Ltda`, { cnpj: CNPJ.unifA });
  const duplicada = await emp(`Unif Filial ${MARCA} Ltda`, { em_recuperacao_judicial: 1 });
  await noBanco("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (1, 'juridica', ?, 1)", [duplicada]);   // a "filial" tem 1 processo: é a sugerida
  await irParaJuridicas(page);
  await buscar(page, 'Unif ', 2);
  await page.getByRole('button', { name: 'Unificar duplicadas' }).click();
  await linhaDe(page, `Unif Matriz ${MARCA}`).getByLabel('Selecionar esta pessoa').check();
  await linhaDe(page, `Unif Filial ${MARCA}`).getByLabel('Selecionar esta pessoa').check();
  await page.getByRole('button', { name: 'Continuar →' }).click();
  const j = janela(page, 'Unificar empresas duplicadas');
  await expect(j.getByText('CPFs diferentes', { exact: false })).toHaveCount(0);              // o aviso de CPF é só da pessoa física
  const sugerido = j.locator('label').filter({ hasText: `Unif Filial ${MARCA}` });
  await expect(sugerido.getByText('PRINCIPAL (fica)')).toBeVisible();                          // mais processos = sugerido
  await expect(j.locator('label').filter({ hasText: `Unif Matriz ${MARCA}` }).getByText('será excluído')).toBeVisible();
  await semViolacoes(page, 'janela Unificar empresas duplicadas');
  await j.locator('label').filter({ hasText: `Unif Matriz ${MARCA}` }).click();               // troca: a matriz (com CNPJ) fica
  await j.getByRole('button', { name: 'Unificar agora' }).click();
  await aviso(page, 'Empresas unificadas com sucesso!');
  await expect(contador(page)).toHaveText('1 registro(s)');
  expect((await noBanco('SELECT id FROM pessoas_juridicas WHERE id = ?', [duplicada])).length).toBe(0);
  const [m] = await noBanco('SELECT em_recuperacao_judicial AS rj, cnpj FROM pessoas_juridicas WHERE id = ?', [principal]);
  expect(Number(m.rj)).toBe(1); expect(m.cnpj).toBe(CNPJ.unifA);
  expect((await noBanco("SELECT id FROM tbltituloprocreu WHERE tipo_pessoa = 'juridica' AND pessoa_id = ?", [principal])).length).toBe(1);   // o processo foi para o principal
});

test('@critical Falha do servidor ao carregar a lista mostra aviso e a tela não quebra; ao voltar o servidor, a lista carrega', async ({ page }) => {
  await irParaPessoas(page);
  await page.route('**/api/pessoas/fisicas?**', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno' }) }));
  await caixaBusca(page).fill(`Alfa ${MARCA}`);
  await aviso(page, 'Erro ao carregar pessoas');
  await expect(page.getByRole('button', { name: '+ Nova Pessoa Física' })).toBeVisible();     // a tela continua inteira
  await page.unroute('**/api/pessoas/fisicas?**');
  await esperarSemAviso(page);
  await caixaBusca(page).fill(`Alfa ${MARCA} Silva`);
  await expect(contador(page)).toHaveText('1 registro(s)');
});

test('@critical Quem não é administrador não vê "Unificar duplicadas"; quem só visualiza vê a lista e a busca funciona', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('sovisualizapessoas', [['pessoas', null, 'visualizar']]);
  await irParaPessoas(page, login);
  await buscar(page, `Alfa ${MARCA} Silva`, 1);
  await expect(page.getByRole('button', { name: 'Exportar Excel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unificar duplicadas' })).toHaveCount(0);       // só administrador
  await semViolacoes(page, 'lista de Pessoas para quem só visualiza');
});
