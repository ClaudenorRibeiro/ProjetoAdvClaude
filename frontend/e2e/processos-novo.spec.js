import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, loginPelaTela, prepararNovoProcesso, restaurarNovoProcesso, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo B2 do plano (PLANO-TESTES-PROCESSOS.md): a janela "Novo Processo" (aberta pela lista de Processos), campo por campo —
// número da pasta (e o aviso "Pasta já em uso"), partes (autor/réu/perito), cadastro rápido de parte, OABs, tipo/status/instância,
// fórum/vara, CNJ (que preenche tipo e vara), assuntos, datas, observações, validações, criação de verdade e acessibilidade.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const opcaoLista = (page, nome, exact = false) => page.locator('div[role="option"]').filter({ hasText: exact ? new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : nome });
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const erroDeTela = (page) => expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
const janela = (page) => page.locator('.modal-box').first();
const grupo = (page, titulo) => janela(page).locator('.form-group').filter({ hasText: titulo }).first();

async function abrirNovoProcesso(page) {
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await expect(janela(page).getByRole('heading', { name: 'Novo Processo' })).toBeVisible();
  await aguardarTelaPronta(page);
  await expect(page.getByLabel('Número da Pasta')).not.toHaveValue('');          // a sugestão chega do servidor
}
// escolhe uma opção num seletor pesquisável (react-select) pelo nome acessível
async function escolher(page, rotulo, opcao) {
  await page.getByLabel(rotulo, { exact: true }).click();
  await opcaoLista(page, opcao, true).click();
}
// menor número de pasta livre (só conta pasta com processo ativo), igual à sugestão do servidor
async function menorPastaLivre() {
  const ocupadas = new Set((await noBanco('SELECT DISTINCT pa.numPasta AS n FROM tblpasta pa WHERE EXISTS (SELECT 1 FROM tblproc p WHERE p.pasta_id = pa.id AND p.ativo = 1)')).map(r => Number(r.n)));
  let n = 1; while (ocupadas.has(n)) n += 1; return n;
}
// adiciona uma parte pelo campo de busca (digita, escolhe o resultado)
async function adicionarParte(page, tituloGrupo, placeholder, termo, nomeNoResultado) {
  const campo = grupo(page, tituloGrupo).getByPlaceholder(placeholder);
  await campo.fill(termo);
  await page.getByText(` - ${nomeNoResultado}`, { exact: false }).first().click();   // o resultado é "documento - nome"
}

test.describe.configure({ timeout: 150_000 });
let d;
test.beforeAll(async () => { d = await prepararNovoProcesso(); });
test.afterAll(async () => { await restaurarNovoProcesso(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

test('@critical Novo Processo: abre com os valores iniciais certos (pasta sugerida, padrões, advogado principal) e fecha por Cancelar, ✕ e ESC', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const sugerida = await menorPastaLivre();
  await expect(page.getByLabel('Número da Pasta')).toHaveValue(String(sugerida));
  await expect(janela(page).getByText('Será gerado ao adicionar autores e réus abaixo')).toBeVisible();
  await expect(janela(page).getByText('Nenhum autor adicionado')).toBeVisible();
  await expect(janela(page).getByText('Nenhum réu adicionado')).toBeVisible();
  await expect(janela(page).getByText('Nenhum perito adicionado')).toBeVisible();
  await expect(page.getByLabel('Cliente do escritório')).toHaveValue('autor');                         // padrão: o cliente é o autor
  await expect(janela(page).getByText('Conhecimento E2E')).toBeVisible();                               // status pré-selecionado ("Conhecimento")
  await expect(janela(page).getByText('1ª Instância E2E')).toBeVisible();                               // instância pré-selecionada ("1ª ...")
  await expect(grupo(page, 'Responsável pelo processo')).toContainText('Administrador de Testes — OAB SP 111111');   // advogado principal do escritório
  await expect(janela(page).getByText('Administrador de Testes — OAB SP 111111').last()).toBeVisible();          // e já vem como primeira OAB do processo
  await expect(page.getByLabel('Vara')).toBeDisabled();                                                 // vara só depois do fórum
  for (const rotulo of ['Número do Processo (CNJ)', 'Número de Protocolo', 'Data de Distribuição', 'Observações']) await expect(page.getByLabel(rotulo)).toHaveValue('');
  await expect(janela(page).getByRole('button', { name: 'Criar Processo' })).toBeEnabled();
  await semViolacoes(page, 'janela Novo Processo (vazia)');
  await erroDeTela(page);
  const antes = (await noBanco('SELECT COUNT(*) AS n FROM tblproc'))[0].n;
  // Cancelar, ✕ e ESC fecham sem criar nada
  await janela(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await janela(page).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await expect(janela(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM tblproc'))[0].n).toBe(antes);
});

test('@critical Novo Processo: mensagens de validação ao criar sem autor, sem réu e sem número de pasta (nada é gravado)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const antes = (await noBanco('SELECT COUNT(*) AS n FROM tblproc'))[0].n;
  const criar = () => janela(page).getByRole('button', { name: 'Criar Processo' }).click();
  await criar();
  await aviso(page, 'Adicione ao menos um autor (polo ativo)');
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Alberto', 'Alberto Autor E2E');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await criar();
  await aviso(page, 'Adicione ao menos um réu (polo passivo)');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Alfa', 'Empresa Alfa E2E Ltda');
  await page.getByLabel('Número da Pasta').fill('');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await criar();
  await aviso(page, 'Número da pasta é obrigatório');
  expect((await noBanco('SELECT COUNT(*) AS n FROM tblproc'))[0].n).toBe(antes);
  await expect(janela(page).getByRole('button', { name: 'Criar Processo' })).toBeEnabled();
});

test('@critical Novo Processo: partes — buscar (mínimo 2 letras), Física/Jurídica, adicionar, título gerado, "(+N)", duplicada, polo oposto, remover e perito', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const autores = grupo(page, 'Autores — polo ativo'); const reus = grupo(page, 'Réus — polo passivo');
  const buscaAutor = autores.getByPlaceholder('Buscar e adicionar autor...');
  await buscaAutor.fill('A');                                                                            // 1 letra: não busca
  await page.waitForTimeout(400);
  await expect(page.getByText('90000000001 - Alberto Autor E2E')).toHaveCount(0);
  await buscaAutor.fill('Alberto');
  await expect(page.getByText(/Alberto Autor E2E/).first()).toBeVisible();                              // resultado mostra "CPF - nome"
  await expect(page.getByText('900.000.000-01 - Alberto Autor E2E')).toBeVisible();
  await semViolacoes(page, 'janela Novo Processo com resultados da busca de autor');
  await page.getByText('900.000.000-01 - Alberto Autor E2E').click();
  await expect(autores.getByText('Alberto Autor E2E')).toBeVisible();
  await expect(buscaAutor).toHaveValue('');                                                              // a busca limpa depois de escolher
  await expect(janela(page).getByText('Alberto Autor E2E X', { exact: false })).toHaveCount(0);          // ainda sem réu: sem título
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Alfa', 'Empresa Alfa E2E Ltda');   // o réu começa em "Jurídica"
  await expect(janela(page).getByText('Alberto Autor E2E X Empresa Alfa E2E Ltda')).toBeVisible();     // título gerado automaticamente
  // mais de um autor/réu: "Primeiro(+N)"
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Beatriz', 'Beatriz Autora E2E');
  await expect(janela(page).getByText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda')).toBeVisible();
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Beta', 'Empresa Beta E2E Ltda');
  await expect(janela(page).getByText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda(+1)')).toBeVisible();
  // mesma pessoa duas vezes no mesmo polo: aviso e não repete
  await buscaAutor.fill('Alberto'); await page.getByText('900.000.000-01 - Alberto Autor E2E').click();
  await aviso(page, 'Alberto Autor E2E já foi adicionado(a) neste polo');
  await expect(autores.getByText('Alberto Autor E2E')).toHaveCount(1);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  // a mesma pessoa não pode ser autora e ré: coloca a Alberto (física) como réu → erro
  await grupo(page, 'Réus — polo passivo').locator('select').first().selectOption('fisica');
  await reus.getByPlaceholder('Buscar e adicionar réu...').fill('Alberto');
  await page.getByText('900.000.000-01 - Alberto Autor E2E').click();
  await aviso(page, 'já está no polo oposto');
  await expect(reus.getByText('Alberto Autor E2E')).toHaveCount(0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  // remover pelo "×": volta o título
  await reus.getByRole('button', { name: '×' }).last().click();
  await expect(janela(page).getByText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda', { exact: true })).toBeVisible();
  await autores.getByRole('button', { name: '×' }).last().click();
  await expect(janela(page).getByText('Alberto Autor E2E X Empresa Alfa E2E Ltda')).toBeVisible();
  // perito (opcional): adicionar, repetido, remover
  const peritos = grupo(page, 'Peritos do processo');
  await peritos.getByPlaceholder('Buscar e adicionar perito...').fill('Paulo');
  await page.getByText('900.000.000-03 - Perito Paulo E2E').click();
  await expect(peritos.getByText('Perito Paulo E2E')).toBeVisible();
  await expect(janela(page).getByText('Nenhum perito adicionado')).toHaveCount(0);
  await peritos.getByPlaceholder('Buscar e adicionar perito...').fill('Paulo');
  await page.getByText('900.000.000-03 - Perito Paulo E2E').click();
  await aviso(page, 'Perito Paulo E2E já foi adicionado(a) neste polo');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await semViolacoes(page, 'janela Novo Processo com autores, réus e perito');
  await peritos.getByRole('button', { name: '×' }).click();
  await expect(janela(page).getByText('Nenhum perito adicionado')).toBeVisible();
  await erroDeTela(page);
});

// ------------------------------------------------------------------ cadastro rápido de parte e advogado avulso
const BOTAO_NOVA_PESSOA = 'Cadastrar nova pessoa (conforme o tipo selecionado)';
const rapida = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /^Cadastrar Pessoa (Física|Jurídica)$/ }) }).last();

test('@critical Novo Processo: cadastro rápido de parte (física e jurídica) — campos, validações, repetidos, fechar, gravar e já entrar no polo', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const autores = grupo(page, 'Autores — polo ativo'); const reus = grupo(page, 'Réus — polo passivo');
  // ---- física, aberta pelo "…" do autor
  await autores.getByTitle(BOTAO_NOVA_PESSOA).click();
  await expect(rapida(page).getByRole('heading', { name: 'Cadastrar Pessoa Física' })).toBeVisible();
  await expect(rapida(page).getByLabel('Nome completo')).toBeFocused();                                   // já abre com o cursor no nome
  await semViolacoes(page, 'cadastro rápido de pessoa física');
  const salvar = () => rapida(page).getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await salvar();
  await expect(rapida(page).getByText('O nome é obrigatório.')).toBeVisible();                           // o aviso aparece DENTRO da janelinha
  await rapida(page).getByLabel('Nome completo').fill('carlos rápido teste');
  await rapida(page).getByLabel('CPF').fill('11111111111');
  await salvar();
  await expect(rapida(page).getByText('CPF inválido. Confira os números digitados.')).toBeVisible();
  await rapida(page).getByLabel('CPF').fill('12345678909');
  await expect(rapida(page).getByLabel('CPF')).toHaveValue('123.456.789-09');                             // máscara do CPF
  await expect(rapida(page).getByText('CPF inválido')).toHaveCount(0);                                     // o aviso some ao digitar
  await rapida(page).getByPlaceholder('email@exemplo.com').fill('email-sem-arroba');
  await salvar();
  await expect(rapida(page).getByText('E-mail inválido: "email-sem-arroba". Corrija antes de cadastrar.')).toBeVisible();
  await rapida(page).getByPlaceholder('email@exemplo.com').fill('carlos@example.invalid');
  // dois telefones iguais / dois e-mails iguais são recusados
  await rapida(page).getByPlaceholder('(11) 99999-9999').fill('(19) 98888-7777');
  await rapida(page).getByRole('button', { name: '+ Adicionar telefone' }).click();
  await rapida(page).getByPlaceholder('(11) 99999-9999').nth(1).fill('19988887777');
  await salvar();
  await expect(rapida(page).getByText(/está repetido\. Cada telefone só pode aparecer uma vez/)).toBeVisible();
  await rapida(page).getByPlaceholder('(11) 99999-9999').nth(1).fill('(19) 97777-6666');
  await rapida(page).getByRole('button', { name: '+ Adicionar e-mail' }).click();
  await rapida(page).getByPlaceholder('email@exemplo.com').nth(1).fill('CARLOS@example.invalid');
  await salvar();
  await expect(rapida(page).getByText(/está repetido\. Cada e-mail só pode aparecer uma vez/)).toBeVisible();
  await rapida(page).getByPlaceholder('email@exemplo.com').nth(1).fill('carlos.dois@example.invalid');
  await semViolacoes(page, 'cadastro rápido de pessoa física com telefones e e-mails');
  // fechar: Cancelar, ✕ e ESC não gravam nada
  const antes = (await noBanco("SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE cpf = '12345678909'"))[0].n;
  await rapida(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(rapida(page)).toHaveCount(0);
  await autores.getByTitle(BOTAO_NOVA_PESSOA).click();
  await rapida(page).locator('.modal-fechar').click();
  await expect(rapida(page)).toHaveCount(0);
  await autores.getByTitle(BOTAO_NOVA_PESSOA).click();
  await page.keyboard.press('Escape');
  await expect(rapida(page)).toHaveCount(0);
  await expect(janela(page).getByRole('heading', { name: 'Novo Processo' })).toBeVisible();              // ESC fechou só a janelinha de cima
  expect((await noBanco("SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE cpf = '12345678909'"))[0].n).toBe(antes);
  // gravar de verdade: a pessoa vira autora na hora (nome com iniciais maiúsculas)
  await autores.getByTitle(BOTAO_NOVA_PESSOA).click();
  await rapida(page).getByLabel('Nome completo').fill('carlos rápido teste');
  await rapida(page).getByLabel('CPF').fill('12345678909');
  await rapida(page).getByPlaceholder('(11) 99999-9999').fill('(19) 98888-7777');
  await rapida(page).getByPlaceholder('email@exemplo.com').fill('carlos@example.invalid');
  await salvar();
  await aviso(page, 'Pessoa física cadastrada!');
  await expect(rapida(page)).toHaveCount(0);
  await expect(autores.getByText('Carlos Rápido Teste')).toBeVisible();
  const pf = (await noBanco("SELECT id, nome FROM pessoas_fisicas WHERE cpf = '12345678909'"));
  expect(pf).toHaveLength(1); expect(pf[0].nome).toBe('Carlos Rápido Teste');
  expect((await noBanco('SELECT numero FROM telefones_pf WHERE pessoa_id = ?', [pf[0].id])).map(r => r.numero.replace(/\D/g, ''))).toEqual(['19988887777']);
  expect((await noBanco('SELECT email FROM emails_pf WHERE pessoa_id = ?', [pf[0].id])).map(r => r.email)).toEqual(['carlos@example.invalid']);
  // o mesmo CPF de novo: o servidor recusa e o aviso fica dentro da janelinha (sem fechar)
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await reus.locator('select').first().selectOption('fisica');
  await reus.getByTitle(BOTAO_NOVA_PESSOA).click();
  await rapida(page).getByLabel('Nome completo').fill('outra pessoa mesmo cpf');
  await rapida(page).getByLabel('CPF').fill('12345678909');
  await salvar();
  await expect(rapida(page).getByText(/⚠️/)).toBeVisible();
  await expect(rapida(page).getByRole('heading', { name: 'Cadastrar Pessoa Física' })).toBeVisible();
  await rapida(page).locator('.modal-fechar').click();
  // ---- jurídica, aberta pelo "…" do réu (o réu começa em Jurídica)
  await reus.locator('select').first().selectOption('juridica');
  await reus.getByTitle(BOTAO_NOVA_PESSOA).click();
  await expect(rapida(page).getByRole('heading', { name: 'Cadastrar Pessoa Jurídica' })).toBeVisible();
  await semViolacoes(page, 'cadastro rápido de pessoa jurídica');
  await salvar();
  await expect(rapida(page).getByText('A razão social é obrigatória.')).toBeVisible();
  await rapida(page).getByLabel('Razão social').fill('comercial rápida teste ltda');
  await rapida(page).getByLabel('CNPJ').fill('11111111111111');
  await salvar();
  await expect(rapida(page).getByText('CNPJ inválido. Confira os números digitados.')).toBeVisible();
  await rapida(page).getByLabel('CNPJ').fill('11222333000181');
  await expect(rapida(page).getByLabel('CNPJ')).toHaveValue('11.222.333/0001-81');
  await salvar();
  await aviso(page, 'Pessoa jurídica cadastrada!');
  await expect(reus.getByText('Comercial Rápida Teste Ltda')).toBeVisible();
  await expect(janela(page).getByText('Carlos Rápido Teste X Comercial Rápida Teste Ltda')).toBeVisible();
  expect((await noBanco("SELECT razao_social FROM pessoas_juridicas WHERE cnpj = '11222333000181'")).map(r => r.razao_social)).toEqual(['Comercial Rápida Teste Ltda']);
  // perito: o "…" do perito abre a mesma janelinha
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await grupo(page, 'Peritos do processo').getByTitle('Cadastrar novo perito (conforme o tipo selecionado)').click();
  await expect(rapida(page).getByRole('heading', { name: 'Cadastrar Pessoa Física' })).toBeVisible();
  await rapida(page).getByRole('button', { name: 'Cancelar' }).click();
});

test('@critical Novo Processo: OABs (adicionar, repetida, remover) e cadastro de advogado avulso pelo "…"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const oabs = grupo(page, 'OAB(s) do processo');
  const seletor = oabs.locator('select');
  await expect(oabs.getByText('Administrador de Testes — OAB SP 111111×')).toBeVisible();                  // advogado principal já vem
  await expect(seletor.locator('optgroup[label="Advogados do escritório"] option')).toHaveCount(2);        // só quem tem OAB (admin e usuteste)
  await expect(seletor.locator('optgroup[label="Advogados avulsos"] option')).toHaveCount(1);
  await seletor.selectOption({ label: 'Usuário de Testes — OAB SP 222222' });
  await expect(oabs.getByText('Usuário de Testes — OAB SP 222222×')).toBeVisible();
  await expect(seletor).toHaveValue('');                                                                  // volta ao texto de instrução
  await seletor.selectOption({ label: 'Usuário de Testes — OAB SP 222222' });
  await aviso(page, 'Essa OAB já foi adicionada');
  await expect(oabs.getByText('Usuário de Testes — OAB SP 222222×')).toHaveCount(1);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await seletor.selectOption({ label: 'Avulso E2E — OAB RJ 99999' });
  await expect(oabs.getByText('Avulso E2E — OAB RJ 99999×')).toBeVisible();
  await oabs.getByRole('button', { name: '×' }).first().click();                                          // remove a primeira (do advogado principal)
  await expect(oabs.getByText('Administrador de Testes — OAB SP 111111×')).toHaveCount(0);
  await semViolacoes(page, 'janela Novo Processo com OABs');
  // advogado avulso
  const avulso = () => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /Novo advogado avulso/ }) }).last();
  await oabs.getByTitle('Cadastrar advogado avulso (não trabalha no escritório)').click();
  await expect(avulso().getByRole('heading', { name: 'Novo advogado avulso (sem login no sistema)' })).toBeVisible();
  await semViolacoes(page, 'janela Novo advogado avulso');
  await avulso().getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(avulso().getByText('Informe o nome do freelancer.')).toBeVisible();
  await avulso().getByLabel('Nome').fill('Advogado Novo Avulso E2E');
  await avulso().getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(avulso().getByText('Informe o e-mail do freelancer.')).toBeVisible();
  await avulso().getByLabel('E-mail').fill('sem-arroba');
  await avulso().getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(avulso().getByText('Informe um e-mail válido.')).toBeVisible();
  await avulso().locator('.modal-fechar').click();                                                         // fechar não grava nada
  await expect(avulso()).toHaveCount(0);
  expect(await noBanco("SELECT id FROM advogados_freela WHERE nome = 'Advogado Novo Avulso E2E'")).toHaveLength(0);
  await oabs.getByTitle('Cadastrar advogado avulso (não trabalha no escritório)').click();
  await avulso().getByLabel('Nome').fill('Advogado Novo Avulso E2E');
  await avulso().getByLabel('E-mail').fill('avulso.novo@example.invalid');
  await avulso().getByLabel('OAB').fill('MG 55555');
  await avulso().getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await aviso(page, 'Freelancer cadastrado');
  await expect(avulso()).toHaveCount(0);
  await expect(oabs.getByText('Advogado Novo Avulso E2E — OAB MG 55555×')).toBeVisible();                  // já entra na lista de OABs do processo
  await expect(seletor.locator('optgroup[label="Advogados avulsos"] option')).toHaveCount(2);            // e fica disponível nas próximas
  expect(await noBanco("SELECT oab FROM advogados_freela WHERE nome = 'Advogado Novo Avulso E2E'")).toHaveLength(1);
});

test('@critical Novo Processo: tipo, status, instância, fórum/vara, responsável, cliente, CNJ (preenche tipo e vara), protocolo, data e observações', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  // cliente do escritório
  const cliente = page.getByLabel('Cliente do escritório');
  await expect(cliente.locator('option')).toHaveText(['— Não definido —', 'Autor (polo ativo)', 'Réu (polo passivo)']);
  await cliente.selectOption('reu'); await expect(cliente).toHaveValue('reu');
  await cliente.selectOption(''); await expect(cliente).toHaveValue('');
  // responsável (seletor pesquisável)
  await page.getByLabel('Responsável pelo processo', { exact: true }).click();
  await expect(opcaoLista(page, 'Usuário de Testes — OAB SP 222222')).toBeVisible();
  await expect(opcaoLista(page, '— Não definido —')).toBeVisible();
  await page.keyboard.type('usuário de');                                                                 // filtra digitando
  await expect(opcaoLista(page, 'Administrador de Testes — OAB SP 111111')).toHaveCount(0);
  await opcaoLista(page, 'Usuário de Testes — OAB SP 222222').click();
  await expect(grupo(page, 'Responsável pelo processo')).toContainText('Usuário de Testes — OAB SP 222222');
  await page.getByLabel('Responsável pelo processo', { exact: true }).click();
  await page.keyboard.type('zzz sem nada');
  await expect(page.getByText('Nenhuma opção encontrada')).toBeVisible();
  await page.getByLabel('Observações').click();                       // (ESC com a lista aberta fecha a janela inteira — achado B2, aguarda decisão)
  // tipo, status, instância
  await escolher(page, 'Tipo do processo', 'Trabalhista E2E');
  await expect(grupo(page, 'Tipo')).toContainText('Trabalhista E2E');
  await escolher(page, 'Status do processo', 'Conhecimento E2E');
  await escolher(page, 'Instância', '2ª Instância E2E');
  await expect(grupo(page, 'Instância')).toContainText('2ª Instância E2E');
  // fórum e vara: a vara fica travada até escolher o fórum e só mostra as varas daquele fórum
  const vara = page.getByLabel('Vara');
  await expect(vara).toBeDisabled();
  await expect(vara.locator('option').first()).toHaveText('— Selecione o fórum primeiro —');   // travada (as varas só ficam escolhíveis depois do fórum)
  await escolher(page, 'Fórum', 'Fórum Norte E2E');
  await expect(vara).toBeEnabled();
  const norte = await vara.locator('option').allInnerTexts();
  expect(norte).toEqual(['— Selecione —', '1ª Norte', 'Vara Norte 2 E2E']);                              // mostra a abreviação quando há
  await vara.selectOption({ label: '1ª Norte' });
  await escolher(page, 'Fórum', 'Fórum Sul E2E');                                                         // trocar de fórum zera a vara e troca a lista
  await expect(vara).toHaveValue('');
  expect(await vara.locator('option').allInnerTexts()).toEqual(['— Selecione —', 'Vara Sul 1 E2E']);
  // CNJ: máscara; com 14+ dígitos preenche o TIPO (J=5 → Trabalhista); completo preenche também fórum e vara (5150002)
  const cnj = page.getByLabel('Número do Processo (CNJ)');
  await escolher(page, 'Tipo do processo', 'Judicial');
  await cnj.fill('abc12'); await expect(cnj).toHaveValue('12');                                          // só dígitos
  await cnj.fill('');
  await cnj.pressSequentially('00000000020265', { delay: 15 });                                           // 14 dígitos
  await expect(cnj).toHaveValue('0000000-00.2026.5');
  await expect(grupo(page, 'Tipo')).toContainText('Trabalhista E2E');
  await cnj.pressSequentially('150002', { delay: 15 });                                                   // completa os 20 dígitos
  await expect(cnj).toHaveValue('0000000-00.2026.5.15.0002');
  await expect(grupo(page, 'Fórum')).toContainText('Fórum Norte E2E');
  await expect(page.getByLabel('Vara')).toHaveValue(String(d.varaNorte1));
  // protocolo, data e observações (iniciais maiúsculas ao sair do campo)
  await page.getByLabel('Número de Protocolo').fill('PROT-NOVO-CAMPOS');
  await expect(page.getByLabel('Número de Protocolo')).toHaveValue('PROT-NOVO-CAMPOS');
  await page.getByLabel('Data de Distribuição').fill('2026-03-15');
  await expect(page.getByLabel('Data de Distribuição')).toHaveValue('2026-03-15');
  await page.getByLabel('Observações').fill('observação de teste do processo');
  await page.getByLabel('Número de Protocolo').click();                                                    // sair do campo
  await expect(page.getByLabel('Observações')).toHaveValue('Observação de Teste do Processo');
  await semViolacoes(page, 'janela Novo Processo com os campos preenchidos');
  // os "…" de gerenciar auxiliares abrem a janela e fecham por ESC (o conteúdo dela é testado no passo B4)
  const mais = janela(page).getByRole('button', { name: '…', exact: true });
  await expect(mais).toHaveCount(10);                                                                      // tipo, status, instância, fórum, vara, assuntos + autor, réu, perito, OAB
  await grupo(page, 'Tipo').getByRole('button', { name: '…', exact: true }).click();
  await expect(page.locator('.modal-box').filter({ has: page.getByRole('button', { name: 'Fechar' }) }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await erroDeTela(page);
});

test('@critical Novo Processo: assuntos — abrir, buscar, marcar, "×" e teclado, também dentro da janela (acessibilidade)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const assuntos = grupo(page, 'Assuntos');
  await assuntos.getByText('Selecionar assuntos...').click();
  await expect(page.getByRole('checkbox', { name: 'Assunto Novo A E2E' })).toBeVisible();
  await page.getByPlaceholder('Buscar assunto...').fill('novo b');
  await expect(page.getByRole('checkbox', { name: 'Assunto Novo A E2E' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Assunto Novo B E2E' }).check();
  await page.getByPlaceholder('Buscar assunto...').fill('');
  await page.getByRole('checkbox', { name: 'Assunto Novo A E2E' }).check();
  await page.getByLabel('Observações').click();                                                           // clicar fora fecha a lista
  await expect(page.getByPlaceholder('Buscar assunto...')).toHaveCount(0);
  await expect(assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo A E2E' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Processo com assuntos marcados');
  await assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo A E2E' }).click();
  await expect(assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo A E2E' })).toHaveCount(0);
  await assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo B E2E' }).focus();             // pelo teclado
  await page.keyboard.press('Enter');
  await expect(assuntos.getByText('Selecionar assuntos...')).toBeVisible();
  const abrir = assuntos.getByRole('button', { name: 'Abrir a lista de assuntos' });
  await abrir.focus(); await page.keyboard.press('Enter');
  await expect(abrir).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Observações').click();                       // (ESC com a lista aberta fecha a janela inteira — achado B2, aguarda decisão)
  // o "…" ao lado de Assuntos (só quem pode gerenciar assuntos) abre a janela de gerenciamento
  await assuntos.getByRole('button', { name: '…', exact: true }).click();
  await expect(page.locator('.modal-box').filter({ has: page.getByRole('button', { name: 'Fechar' }) }).last()).toBeVisible();
  await page.keyboard.press('Escape');
});

// ------------------------------------------------------------------ pasta em uso, criação de verdade, erros e permissões
async function preencherPartesMinimas(page) {
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Alberto', 'Alberto Autor E2E');
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Alfa', 'Empresa Alfa E2E Ltda');
}

test('@critical Novo Processo: pasta já em uso — aviso, Cancelar volta ao sugerido, "Sim, incluir" entra na mesma pasta; pasta vazia sem aviso; pasta tomada na hora', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const pasta = page.getByLabel('Número da Pasta');
  const sugerida = String(await menorPastaLivre());
  const aviso7001 = page.getByText(/A pasta nº 7001 já existe e possui 1 processo\(s\) \(ex\.: PASTA EM USO E2E\)\. Deseja incluir mais um processo dentro desta mesma pasta\?/);
  // pasta em uso: ao sair do campo, aparece o aviso
  await pasta.fill('7001'); await pasta.blur();
  await expect(page.getByRole('heading', { name: 'Pasta já em uso' }).or(page.getByText('Pasta já em uso').first())).toBeVisible();
  await expect(aviso7001).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sim, incluir' })).toBeVisible();
  await semViolacoes(page, 'aviso "Pasta já em uso"');
  await page.getByRole('button', { name: 'Cancelar' }).last().click();                                   // cancelar: volta para o número sugerido
  await expect(pasta).toHaveValue(sugerida);
  // ESC no aviso também cancela e volta ao sugerido
  await pasta.fill('7001'); await pasta.blur();
  await expect(aviso7001).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(aviso7001).toHaveCount(0);
  await expect(pasta).toHaveValue(sugerida);
  // pasta VAZIA (só processo inativo) e pasta que não existe: sem aviso
  for (const livre of ['7002', '7099']) { await pasta.fill(livre); await pasta.blur(); await page.waitForTimeout(500); await expect(page.getByText('Pasta já em uso')).toHaveCount(0); }
  // "Sim, incluir": mantém o número e o processo entra na MESMA pasta
  await pasta.fill('7001'); await pasta.blur();
  await page.getByRole('button', { name: 'Sim, incluir' }).click();
  await expect(pasta).toHaveValue('7001');
  await expect(page.getByText('Pasta já em uso')).toHaveCount(0);
  await preencherPartesMinimas(page);
  await janela(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'Processo criado com sucesso!');
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${d.pastaEmUso}$`));
  expect((await noBanco('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ? AND ativo = 1', [d.pastaEmUso]))[0].n).toBe(2);
  // número mudado DEPOIS de confirmar: a confirmação vale só para aquele número
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await expect(pasta).not.toHaveValue('');
  await pasta.fill('7001'); await pasta.blur();
  await page.getByRole('button', { name: 'Sim, incluir' }).click();
  await pasta.fill('7050');                                                                               // outro número, ainda livre quando se sai do campo...
  await preencherPartesMinimas(page);
  await noBancoPastaTomada(7050);                                                                         // ...mas outra pessoa pega antes de salvar
  await janela(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'A pasta nº 7050 já está em uso. Escolha outro número de pasta.');
  await expect(janela(page).getByRole('heading', { name: 'Novo Processo' })).toBeVisible();              // a janela continua aberta
  await expect(janela(page).getByRole('button', { name: 'Criar Processo' })).toBeEnabled();
  expect((await noBanco('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = (SELECT id FROM tblpasta WHERE numPasta = 7050)'))[0].n).toBe(1);   // só o da outra pessoa
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await pasta.fill('7051');                                                                               // escolhendo outro número, cria
  await janela(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'Processo criado com sucesso!');
});
async function noBancoPastaTomada(num) {
  const pasta = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [num])).insertId;
  await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, 'TOMADA POR OUTRA PESSOA', 1, 1, 1, 1)", [pasta, `900${num}-00.2026.5.15.0001`]);
}

test('@critical Novo Processo: criar com TUDO preenchido grava processo, partes, perito, assuntos, OABs e campos, abre a pasta e aparece na lista', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  const pasta = page.getByLabel('Número da Pasta');
  const numPasta = await pasta.inputValue();
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Alberto', 'Alberto Autor E2E');
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Beatriz', 'Beatriz Autora E2E');
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Alfa', 'Empresa Alfa E2E Ltda');
  await grupo(page, 'Peritos do processo').getByPlaceholder('Buscar e adicionar perito...').fill('Paulo');
  await page.getByText('900.000.000-03 - Perito Paulo E2E').click();
  await page.getByLabel('Cliente do escritório').selectOption('reu');
  await page.getByLabel('Responsável pelo processo', { exact: true }).click();
  await opcaoLista(page, 'Usuário de Testes — OAB SP 222222').click();
  await grupo(page, 'OAB(s) do processo').locator('select').selectOption({ label: 'Avulso E2E — OAB RJ 99999' });
  await page.getByLabel('Número do Processo (CNJ)').pressSequentially('12345678920265150002', { delay: 10 });   // preenche tipo, fórum e vara
  await escolher(page, 'Status do processo', 'Conhecimento E2E');
  await escolher(page, 'Instância', '2ª Instância E2E');
  await page.getByLabel('Número de Protocolo').fill('PROT-NOVO-COMPLETO');
  await page.getByLabel('Data de Distribuição').fill('2026-04-20');
  await page.getByLabel('Observações').fill('observação completa do teste');
  const assuntos = grupo(page, 'Assuntos');
  await assuntos.getByText('Selecionar assuntos...').click();
  await page.getByRole('checkbox', { name: 'Assunto Novo A E2E' }).check();
  await page.getByRole('checkbox', { name: 'Assunto Novo B E2E' }).check();
  await page.getByLabel('Número de Protocolo').click();
  await expect(janela(page).getByText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda')).toBeVisible();
  const botao = janela(page).getByRole('button', { name: 'Criar Processo' });
  await botao.click();
  await aviso(page, 'Processo criado com sucesso!');
  await expect(page).toHaveURL(/\/processos\/pasta\/\d+$/);
  const [proc] = await noBanco(`SELECT p.*, pa.numPasta FROM tblproc p JOIN tblpasta pa ON pa.id = p.pasta_id WHERE p.protocolo = 'PROT-NOVO-COMPLETO'`);
  expect(proc).toBeTruthy();
  expect({ numPasta: String(proc.numPasta), numProc: proc.numProc, titulo: proc.NomeTituloProc, polo: proc.cliente_polo, tipo: proc.tipo_id, status: proc.status_id, vara: proc.vara_id,
    resp: proc.responsavel_id, obs: proc.observacoes, ativo: proc.ativo, criado_por: proc.criado_por })
    .toEqual({ numPasta, numProc: '1234567-89.2026.5.15.0002', titulo: 'Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda', polo: 'reu', tipo: d.tipo, status: proc.status_id, vara: d.varaNorte1,
      resp: 2, obs: 'Observação Completa do Teste', ativo: 1, criado_por: 1 });
  expect(String(proc.data_distribuicao.toISOString?.().slice(0, 10) ?? proc.data_distribuicao).slice(0, 10)).toBe('2026-04-20');
  expect((await noBanco('SELECT tipo_pessoa, pessoa_id FROM tbltituloprocautor WHERE proc_id = ? ORDER BY id', [proc.id])).map(r => [r.tipo_pessoa, r.pessoa_id])).toEqual([['fisica', d.autor1], ['fisica', d.autor2]]);
  expect((await noBanco('SELECT tipo_pessoa, pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [proc.id])).map(r => [r.tipo_pessoa, r.pessoa_id])).toEqual([['juridica', d.reu1]]);
  expect((await noBanco('SELECT pessoa_id FROM processo_perito WHERE proc_id = ?', [proc.id])).map(r => r.pessoa_id)).toEqual([d.perito]);
  expect((await noBanco('SELECT assunto_id FROM processo_assunto WHERE processo_id = ? ORDER BY assunto_id', [proc.id])).map(r => r.assunto_id)).toEqual([d.assuntoA, d.assuntoB]);
  expect((await noBanco('SELECT usuario_id, freela_id FROM processo_oabs WHERE processo_id = ? ORDER BY id', [proc.id])).map(r => [r.usuario_id, r.freela_id ? 'freela' : null])).toEqual([[1, null], [null, 'freela']]);
  expect((await noBanco('SELECT nome FROM tblinstanciaproc WHERE id = ?', [proc.instancia_id]))[0].nome).toBe('2ª Instância E2E');
  await expect(page.getByText(`Pasta ${numPasta}`).or(page.getByText(numPasta.padStart(4, '0'))).first()).toBeVisible();   // chegou na pasta criada
  // e a pasta nova aparece na lista, pela busca do protocolo
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByPlaceholder('Buscar por nº pasta, título, nº CNJ ou protocolo...').fill('PROT-NOVO-COMPLETO');
  await page.waitForTimeout(600); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda');
});

test('@critical Novo Processo: erro do servidor mostra o aviso e mantém a janela com tudo preenchido; botão "Salvando..." enquanto grava', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoProcesso(page);
  await preencherPartesMinimas(page);
  await page.getByLabel('Número do Processo (CNJ)').fill('8000001-00.2026.5.15.0001');                   // já existe (pasta em uso E2E)
  await page.getByLabel('Número da Pasta').fill('7061');
  const botao = janela(page).getByRole('button', { name: 'Criar Processo' });
  await botao.click();
  await aviso(page, 'O número de processo "8000001-00.2026.5.15.0001" já está cadastrado no sistema');
  await expect(botao).toBeEnabled();
  await expect(janela(page).getByText('Alberto Autor E2E X Empresa Alfa E2E Ltda')).toBeVisible();        // nada se perdeu
  expect((await noBanco('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 7061'))[0].n).toBe(0);       // e nem pasta ficou pela metade
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await page.getByLabel('Número do Processo (CNJ)').fill('');
  await page.getByLabel('Número de Protocolo').fill('PROT-EMUSO-E2E');                                    // protocolo repetido também é recusado
  await botao.click();
  await aviso(page, 'O protocolo "PROT-EMUSO-E2E" já está cadastrado no sistema');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  // enquanto grava, o botão mostra "Salvando..." e fica travado
  await page.getByLabel('Número de Protocolo').fill('PROT-NOVO-LENTO');
  await page.route('**/api/processos', async (rota) => { if (rota.request().method() === 'POST') { await new Promise(r => setTimeout(r, 1500)); } await rota.continue(); });
  await botao.click();
  await expect(janela(page).getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await aviso(page, 'Processo criado com sucesso!');
  await page.unroute('**/api/processos');
  // queda do servidor (500): aviso genérico e a janela continua
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await expect(page.getByLabel('Número da Pasta')).not.toHaveValue('');
  await preencherPartesMinimas(page);
  await page.route('**/api/processos', (rota) => rota.request().method() === 'POST'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await janela(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(janela(page).getByRole('button', { name: 'Criar Processo' })).toBeEnabled();
  await page.unroute('**/api/processos');
  await erroDeTela(page);
});

test('@critical Novo Processo: quem só pode CADASTRAR vê os "…" de tipo/status/instância/fórum/vara, mas não o de assuntos', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('socadastra', [['processos', null, 'visualizar'], ['processos', null, 'cadastrar']]);
  await loginPelaTela(page, login);
  await abrirNovoProcesso(page);
  await expect(janela(page).getByRole('button', { name: '…', exact: true })).toHaveCount(9);               // 10 do administrador, menos o de assuntos
  await expect(grupo(page, 'Assuntos').getByRole('button', { name: '…', exact: true })).toHaveCount(0);
  await expect(grupo(page, 'Tipo').getByRole('button', { name: '…', exact: true })).toHaveCount(1);
  await semViolacoes(page, 'janela Novo Processo para quem só cadastra');
});

test('@critical Novo Processo: quem só pode VISUALIZAR nem recebe o botão de abrir a janela', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('sovisualizanovo', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await expect(page.getByRole('button', { name: '+ Novo Processo' })).toHaveCount(0);
});
