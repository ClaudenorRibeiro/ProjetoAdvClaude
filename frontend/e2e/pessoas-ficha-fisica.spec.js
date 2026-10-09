import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarRespostaProcessada, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers.js';
import { createRequire } from 'node:module';

// Teste de TELA da ficha da PESSOA FÍSICA (janela "Nova / Editar / Detalhes da Pessoa Física", aberta pela tela Pessoas):
// campos e máscaras, cada validação do salvar, CPF (incompleto, inválido, duplicado), responsável legal, avisos de idade, CTPS,
// telefones, e-mails, contas bancárias, endereço (CEP), listas com "…", Editar (ida e volta sem erro), Detalhes (tudo travado) e acessibilidade.
// Os dados nascem e morrem aqui (nomes com "Ficha E2E" / "Ficha Teste"); a internet é bloqueada (o ViaCEP é simulado).
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
// CPF válido (com os dois dígitos verificadores) a partir de 9 dígitos
function cpfValido(base9) {
  const n = base9.split('').map(Number);
  const dv = (lista, peso) => { const r = (lista.reduce((s, x, i) => s + x * (peso - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n, 10); const d2 = dv([...n, d1], 11);
  return `${base9}${d1}${d2}`;
}
let seqCpf = 0;
// CPF válido diferente a cada chamada (cada teste grava a sua pessoa; nenhum repete o CPF do outro)
const cpfNovo = () => cpfValido(`4${String(Date.now()).slice(-6)}${String(seqCpf++).padStart(2, '0')}`);
const mascaraCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
const CPF = { responsavel: cpfValido('290340511'), duplicada: cpfValido('290340522'), completa: cpfValido('290340533'), outro: cpfValido('290340555') };

async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const ficha = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /^(Nova|Editar|Detalhes da) Pessoa Física$/ }) }).last();
const confirmacao = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const faixa = (page, texto) => expect(ficha(page).getByText(texto, { exact: false }).first()).toBeVisible();   // a faixa vermelha DENTRO da janela
const salvar = (page) => ficha(page).getByRole('button', { name: 'Salvar', exact: true }).click();
const NOMES_APAGAR = "(nome LIKE '%Ficha E2E%' OR nome LIKE '%Ficha Teste%')";

let d;
async function prepararDados() {
  const id = async (sql, p = []) => (await noBanco(sql, p)).insertId;
  const um = async (sql, p = []) => (await noBanco(sql, p))[0];
  const acha = async (tabela, nome) => (await um(`SELECT id FROM ${tabela} WHERE nome = ?`, [nome]))?.id;
  const dados = {};
  for (const [chave, tabela, nome] of [['genero', 'genero', 'Feminino Ficha E2E'], ['estadoCivil', 'estado_civil', 'Casada Ficha E2E'], ['profissao', 'profissao', 'Advogada Ficha E2E'],
    ['perito', 'profissao', 'Perícia Médica Ficha E2E'], ['nacionalidade', 'nacionalidade', 'Brasileira Ficha E2E'], ['parentesco', 'parentesco', 'Mãe Ficha E2E']]) {
    dados[chave] = await acha(tabela, nome) || await id(`INSERT INTO ${tabela} (nome) VALUES (?)`, [nome]);
  }
  dados.banco = (await um("SELECT id FROM instituicao_financeira WHERE nome = 'Banco Ficha E2E'"))?.id || await id("INSERT INTO instituicao_financeira (nome) VALUES ('Banco Ficha E2E')");
  const pessoa = async (nome, cpf, extra = {}) => {
    const existente = await um('SELECT id FROM pessoas_fisicas WHERE nome = ?', [nome]);
    if (existente) return existente.id;
    const colunas = ['nome', 'cpf', ...Object.keys(extra)];
    return id(`INSERT INTO pessoas_fisicas (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`, [nome, cpf, ...Object.values(extra)]);
  };
  dados.responsavel = await pessoa('Responsável Ficha E2E', CPF.responsavel);
  dados.duplicada = await pessoa('Dona Duplicada Ficha E2E', CPF.duplicada);
  dados.completa = await pessoa('Edição Completa Ficha E2E', CPF.completa, {
    rg: '12.345.678-9', rg_orgao: 'SSP/SP', pis: '123.45678.90-1', data_nascimento: '1990-05-17', genero_id: dados.genero, estado_civil_id: dados.estadoCivil,
    profissao_id: dados.profissao, nacionalidade_id: dados.nacionalidade, nome_pai: 'Pai Da Ficha', nome_mae: 'Mãe Da Ficha', cep: '13010-000', logradouro: 'Rua Direita',
    numero: '100', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Campinas', estado: 'SP', observacoes: 'Observação da Ficha Completa',
    responsavel_id: dados.responsavel, parentesco_id: dados.parentesco, ctps_numero: '123456', ctps_serie: '0001',
  });
  if (!(await um('SELECT id FROM telefones_pf WHERE pessoa_id = ?', [dados.completa]))) {
    await noBanco("INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, '(19) 99999-0000', 'celular', 1), (?, '(19) 3333-4444', 'comercial', 0)", [dados.completa, dados.completa]);
    await noBanco("INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, 'completa@ficha.invalid', 1), (?, 'segundo@ficha.invalid', 0)", [dados.completa, dados.completa]);
    await noBanco('INSERT INTO pessoas_avisos_idade (pessoa_id, idade) VALUES (?, 18), (?, 21)', [dados.completa, dados.completa]);
    await noBanco(`INSERT INTO contas_bancarias_pf (pessoa_id, instituicao_financeira_id, tipo, agencia, numero, digito, chave_pix, conta_terceiro, titular, documento_titular, principal)
                   VALUES (?, ?, 'corrente', '1234', '56789', '0', 'completa@ficha.invalid', 0, 'Edição Completa Ficha E2E', ?, 1)`, [dados.completa, dados.banco, CPF.completa]);
  }
  return dados;
}
async function limparDados() {
  const ids = (await noBanco(`SELECT id FROM pessoas_fisicas WHERE ${NOMES_APAGAR}`)).map(r => r.id);
  if (ids.length) {
    const marcas = ids.map(() => '?').join(',');
    await noBanco(`UPDATE pessoas_fisicas SET responsavel_id = NULL, parentesco_id = NULL WHERE id IN (${marcas})`, ids);
    await noBanco(`DELETE FROM historico_atendimento WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${marcas})`, ids);
    await noBanco(`DELETE FROM pessoas_fisicas WHERE id IN (${marcas})`, ids);
  }
  await noBanco("DELETE FROM genero WHERE nome LIKE '%Ficha%'"); await noBanco("DELETE FROM estado_civil WHERE nome LIKE '%Ficha%'");
  await noBanco("DELETE FROM profissao WHERE nome LIKE '%Ficha%'"); await noBanco("DELETE FROM nacionalidade WHERE nome LIKE '%Ficha%'");
  await noBanco("DELETE FROM parentesco WHERE nome LIKE '%Ficha%'"); await noBanco("DELETE FROM instituicao_financeira WHERE nome LIKE '%Ficha%'");
}

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { await limparDados(); d = await prepararDados(); });
test.afterAll(async () => { await limparDados(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function irParaPessoas(page) {
  await loginPelaTela(page);
  await page.goto('/pessoas'); await aguardarTelaPronta(page);
}
// Profissão é uma lista onde se DIGITA para filtrar (sem diferenciar acento/maiúscula, em qualquer parte do nome): digita um trecho e clica na opção.
async function escolherProfissao(page, nome, digitado = nome) {
  const campo = ficha(page).getByLabel('Profissão', { exact: true });
  await campo.click();
  await campo.fill(digitado);
  await page.getByRole('option', { name: nome, exact: true }).click();
}
const profissaoEscolhida = (page, j) => j.locator('.form-group').filter({ has: page.getByLabel('Profissão', { exact: true }) }).locator('.select-pesquisavel__single-value');

async function abrirNova(page) {
  await page.getByRole('button', { name: '+ Nova Pessoa Física' }).click();
  await expect(ficha(page).getByRole('heading', { name: 'Nova Pessoa Física' })).toBeVisible();
}
async function buscarNaLista(page, nome) {
  await page.getByPlaceholder(/Buscar por nome, CPF/).fill(nome);
  await expect(page.locator('tbody tr').filter({ hasText: nome })).toHaveCount(1);
  return page.locator('tbody tr').filter({ hasText: nome });
}
async function abrirEdicao(page, nome) {
  // a lista recarrega logo depois de fechar uma janela: se a linha for trocada no meio do clique, o menu fecha.
  // Abrir o menu, clicar em Editar e esperar os dados do servidor ficam JUNTOS na mesma tentativa — se o menu sumir, recomeça.
  let resposta;
  await expect(async () => {
    const linha = await buscarNaLista(page, nome);
    await abrirMenuAcoes(page, linha);
    const dadosDoServidor = page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/pessoas\/fisicas\/\d+$/.test(r.url()), { timeout: 8000 });
    [resposta] = await Promise.all([dadosDoServidor, page.getByRole('button', { name: 'Editar', exact: true }).click({ timeout: 4000 })]);
  }).toPass({ timeout: 40000 });
  await aguardarRespostaProcessada(page, resposta);                       // só mexe na ficha depois que a página usou os dados recebidos
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();
  await expect(ficha(page).getByLabel('Nome completo')).toHaveValue(nome);
}
async function abrirDetalhes(page, nome) {
  let resposta;
  await expect(async () => {                                      // mesma proteção: a linha pode ser trocada pelo recarregamento da lista
    const linha = await buscarNaLista(page, nome);
    const dadosDoServidor = page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/pessoas\/fisicas\/\d+$/.test(r.url()), { timeout: 5000 });
    [resposta] = await Promise.all([dadosDoServidor, linha.getByTitle('Ver detalhes').click({ timeout: 5000 })]);
  }).toPass({ timeout: 20000 });
  await aguardarRespostaProcessada(page, resposta);
  await expect(ficha(page).getByRole('heading', { name: 'Detalhes da Pessoa Física' })).toBeVisible();
  await expect(ficha(page).getByLabel('Nome completo')).toHaveValue(nome);
}
// botão ✕ da linha de telefone/e-mail que contém o campo de rótulo dado (os botões ✕ não têm nome próprio)
const removerLinha = (j, rotulo) => j.getByLabel(rotulo, { exact: true }).locator('xpath=ancestor::div[.//button[normalize-space()="✕"]][1]').getByRole('button', { name: '✕', exact: true }).click();
const quantas = async () => Number((await noBanco(`SELECT COUNT(*) AS n FROM pessoas_fisicas WHERE ${NOMES_APAGAR}`))[0].n);

test('@critical Nova Pessoa Física: abre vazia com o cursor certo, fecha por Cancelar, ✕ e ESC sem gravar nada, e a janela não tem violação de acessibilidade', async ({ page }) => {
  await irParaPessoas(page);
  const antes = await quantas();
  await abrirNova(page);
  const j = ficha(page);
  for (const rotulo of ['Nome completo', 'CPF', 'RG', 'Órgão Expedidor', 'Data de nascimento', 'PIS', 'Pai', 'Mãe', 'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado', 'Telefone 1', 'E-mail 1', 'Observações'])
    await expect(j.getByLabel(rotulo, { exact: true })).toHaveValue('');
  for (const select of ['Gênero', 'Estado civil', 'Profissão', 'Nacionalidade', 'Parentesco']) await expect(j.getByLabel(select, { exact: true })).toHaveValue('');
  await expect(j.getByText('CPF *')).toBeVisible();                                    // CPF obrigatório (sem responsável legal)
  await expect(j.getByText('Nenhum aviso configurado')).toBeVisible();
  await expect(j.getByRole('button', { name: '+ Financeiro' })).toBeVisible();
  await expect(j.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await semViolacoes(page, 'janela Nova Pessoa Física (vazia)');
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirNova(page); await ficha(page).getByRole('button', { name: '✕', exact: true }).first().click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirNova(page); await ficha(page).getByLabel('Nome completo').fill('Digitado E Descartado'); await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(await quantas()).toBe(antes);
  await abrirNova(page);
  await expect(ficha(page).getByLabel('Nome completo')).toHaveValue('');                // reabrir começa limpo
});

test('@critical Nova Pessoa Física: cada validação do salvar, na ordem — nome, nome completo, CPF, telefone/e-mail repetido, e-mail inválido, data futura — e nada é gravado', async ({ page }) => {
  await irParaPessoas(page);
  const antes = await quantas();
  await abrirNova(page);
  const j = ficha(page);
  await salvar(page); await faixa(page, 'Nome é obrigatório.');
  await j.getByLabel('Nome completo').fill('Marina'); await salvar(page); await faixa(page, 'Informe o nome completo (nome e sobrenome).');
  await j.getByLabel('Nome completo').fill('Marina Souza Ficha Teste'); await salvar(page); await faixa(page, 'CPF é obrigatório. Se for menor ou incapaz sem CPF, informe o responsável legal.');
  await j.getByLabel('CPF', { exact: true }).fill(cpfNovo());
  // telefone repetido (compara só os números) e e-mail repetido
  await j.getByLabel('Telefone 1', { exact: true }).fill('19988887777');
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 2', { exact: true }).fill('(19) 98888-7777');
  await salvar(page); await faixa(page, 'está repetido. Cada telefone só pode aparecer uma vez neste cadastro');
  await j.getByLabel('Telefone 2', { exact: true }).fill('(19) 97777-6666');
  await j.getByLabel('E-mail 1', { exact: true }).fill('repetido@ficha.invalid');
  await j.getByRole('button', { name: '+ Adicionar e-mail' }).click();
  await j.getByLabel('E-mail 2', { exact: true }).fill('REPETIDO@ficha.invalid');
  await salvar(page); await faixa(page, 'está repetido. Cada e-mail só pode aparecer uma vez neste cadastro');
  await j.getByLabel('E-mail 2', { exact: true }).fill('email-sem-arroba'); await j.getByLabel('E-mail 2', { exact: true }).blur();
  await expect(j.getByText('⚠️ E-mail inválido', { exact: true })).toBeVisible();          // aviso embaixo do campo, ao sair dele
  await semViolacoes(page, 'ficha com o aviso "E-mail inválido" aberto (contraste do texto de erro)');
  await salvar(page); await faixa(page, 'E-mail inválido: "email-sem-arroba". Corrija antes de salvar.');
  await removerLinha(j, 'E-mail 2');
  // data futura
  await j.getByLabel('Data de nascimento').fill('2999-01-01');
  await expect(j.getByText('Data de nascimento não pode ser futura')).toBeVisible();
  await salvar(page); await faixa(page, 'Data de nascimento não pode ser uma data futura.');
  expect(await quantas()).toBe(antes);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0);                         // todo aviso é na faixa da janela, nunca no canto
});

test('@critical Nova Pessoa Física: "Campos sem informação" — Cancelar não grava, "Salvar assim" grava só o nome e o CPF (sem máscara), com o nome em maiúsculas e minúsculas certas', async ({ page }) => {
  await irParaPessoas(page);
  const antes = await quantas();
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel('Nome completo').fill('marina SOUZA da silva ficha teste'); await j.getByLabel('Nome completo').blur();
  await expect(j.getByLabel('Nome completo')).toHaveValue('Marina Souza da Silva Ficha Teste');   // Title Case ao sair do campo
  const cpf = cpfNovo();
  await j.getByLabel('CPF', { exact: true }).fill(cpf);
  await expect(j.getByLabel('CPF', { exact: true })).toHaveValue(mascaraCpf(cpf));            // máscara
  await salvar(page);
  const c = confirmacao(page, 'Campos sem informação');
  await expect(c.getByText('Os campos Data de nascimento, Gênero, Estado civil, Profissão, Nacionalidade, Telefone ficarão sem informação.')).toBeVisible();
  await c.getByRole('button', { name: 'Cancelar' }).click();
  await expect(c).toHaveCount(0); await expect(ficha(page)).toBeVisible();
  expect(await quantas()).toBe(antes);
  await salvar(page); await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  const [linha] = await noBanco("SELECT * FROM pessoas_fisicas WHERE nome = 'Marina Souza da Silva Ficha Teste'");
  expect(linha.cpf).toBe(cpf); expect(linha.criado_por).toBe(1); expect(linha.genero_id).toBeNull(); expect(linha.data_nascimento).toBeNull();
  expect(await noBanco('SELECT id FROM telefones_pf WHERE pessoa_id = ?', [linha.id])).toHaveLength(0);       // telefone em branco não vira linha
  await esperarSemAviso(page);
});

test('@critical CPF: máscara, incompleto, inválido, válido e DUPLICADO — "Não" some com o aviso e "Sim, editar" abre o cadastro que já existe', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page); const campo = j.getByLabel('CPF', { exact: true });
  await campo.fill('123'); await campo.blur(); await expect(j.getByText('CPF incompleto')).toBeVisible();
  await campo.fill('11111111111'); await campo.blur(); await expect(j.getByText('CPF inválido')).toBeVisible();
  await campo.fill('1234567890a'); await expect(campo).toHaveValue('123.456.789-0');        // letras não entram
  await campo.fill(cpfNovo()); await campo.blur();
  await expect(j.getByText('CPF inválido')).toHaveCount(0); await expect(j.getByText('CPF já cadastrado')).toHaveCount(0);
  await campo.fill(CPF.duplicada); await campo.blur();
  await expect(j.getByText('CPF já cadastrado')).toBeVisible(); await expect(j.getByText('Dona Duplicada Ficha E2E')).toBeVisible();
  await j.getByRole('button', { name: 'Não', exact: true }).click();
  await expect(j.getByText('CPF já cadastrado')).toHaveCount(0);
  await campo.blur(); await campo.fill(CPF.duplicada); await campo.blur();
  await j.getByRole('button', { name: 'Sim, editar' }).click();
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();   // a janela de cadastro fecha e abre a de edição da pessoa existente
  await expect(ficha(page).getByLabel('Nome completo')).toHaveValue('Dona Duplicada Ficha E2E');
  await expect(ficha(page).getByLabel('CPF', { exact: true })).toHaveValue(mascaraCpf(CPF.duplicada));
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Responsável legal: buscar (mínimo 2 letras), escolher, parentesco só depois, CPF dispensado, remover; perito também dispensa o CPF; quem é responsável mostra "Representa"', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page); const busca = j.getByLabel('Buscar responsável legal');
  await expect(j.getByLabel('Parentesco', { exact: true })).toBeDisabled();             // sem responsável, o parentesco fica travado
  await busca.fill('R'); await expect(j.getByText('Responsável Ficha E2E')).toHaveCount(0);
  await busca.fill('Ninguém Com Esse Nome Mesmo'); await expect(j.getByText('Ninguém encontrado com esse nome')).toBeVisible();
  await busca.fill('Responsável Ficha');
  await j.getByText(`Responsável Ficha E2E — ${mascaraCpf(CPF.responsavel)}`).click();
  await expect(j.getByText('Responsável Ficha E2E', { exact: true })).toBeVisible();
  await expect(j.getByLabel('Parentesco', { exact: true })).toBeEnabled();
  await expect(j.getByText('CPF (não obrigatório — pessoa com responsável legal)')).toBeVisible();
  await j.getByLabel('Parentesco', { exact: true }).selectOption({ label: 'Mãe Ficha E2E' });
  await j.getByLabel('Nome completo').fill('Menor Sem Cpf Ficha Teste');
  await salvar(page);
  await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();    // sem CPF: a tela deixa passar
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [menor] = await noBanco("SELECT * FROM pessoas_fisicas WHERE nome = 'Menor Sem Cpf Ficha Teste'");
  expect(menor.cpf).toBeNull(); expect(menor.responsavel_id).toBe(d.responsavel); expect(menor.parentesco_id).toBe(d.parentesco);
  // o responsável passa a mostrar quem representa (só leitura) e não pode ter responsável
  await esperarSemAviso(page);
  await abrirDetalhes(page, 'Responsável Ficha E2E');
  await expect(ficha(page).getByText('Representa', { exact: true })).toBeVisible();
  await expect(ficha(page).getByText('Menor Sem Cpf Ficha Teste — Mãe Ficha E2E')).toBeVisible();
  await expect(ficha(page).getByText('Edição Completa Ficha E2E — Mãe Ficha E2E')).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(ficha(page).getByText('Esta pessoa já é responsável legal de outra(s) — por isso ela mesma não pode ter um responsável.')).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  // remover o responsável (✕) volta a exigir o CPF; perito dispensa o CPF
  await abrirNova(page);
  await ficha(page).getByLabel('Buscar responsável legal').fill('Responsável Ficha');
  await ficha(page).getByText(`Responsável Ficha E2E — ${mascaraCpf(CPF.responsavel)}`).click();
  await ficha(page).getByTitle('Remover o responsável legal').click();
  await expect(ficha(page).getByText('CPF *')).toBeVisible(); await expect(ficha(page).getByLabel('Parentesco', { exact: true })).toBeDisabled();
  await escolherProfissao(page, 'Perícia Médica Ficha E2E', 'pericia med');   // sem acento e só um pedaço do nome
  await expect(ficha(page).getByText('CPF (não obrigatório — profissional de perícia)')).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('@critical Responsável legal: "…" cadastra uma pessoa nova na hora e já a escolhe', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  await ficha(page).getByTitle('Cadastrar uma pessoa que ainda não está no sistema').click();
  const rapida = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Cadastrar Pessoa Física' }) }).last();
  await expect(rapida).toBeVisible();
  await rapida.getByLabel('Nome completo').fill('Responsavel Rapido Ficha Teste');
  await rapida.getByLabel('CPF').fill(CPF.outro);
  await rapida.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(rapida).toHaveCount(0);
  await expect(ficha(page).getByText('Responsavel Rapido Ficha Teste', { exact: true })).toBeVisible();   // já escolhido
  await expect(ficha(page).getByLabel('Parentesco', { exact: true })).toBeEnabled();
  expect(await noBanco("SELECT id FROM pessoas_fisicas WHERE nome = 'Responsavel Rapido Ficha Teste' AND cpf = ?", [CPF.outro])).toHaveLength(1);
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('@critical Avisos de idade: adicionar (botão e Enter), repetido, fora de 0 a 120, remover, aviso sem data de nascimento; fica gravado', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page); const idade = j.getByPlaceholder('Idade');
  await expect(j.getByText('Sem a data de nascimento preenchida o sistema não tem como calcular a idade')).toBeVisible();
  await idade.fill('18'); await j.getByRole('button', { name: '+ Adicionar aviso' }).click();
  await idade.fill('16'); await idade.press('Enter');
  await expect(j.getByText('16 anos')).toBeVisible(); await expect(j.getByText('18 anos')).toBeVisible();
  await idade.fill('18'); await j.getByRole('button', { name: '+ Adicionar aviso' }).click(); await expect(j.getByText('Já existe um aviso para 18 anos.')).toBeVisible();
  await idade.fill('200'); await j.getByRole('button', { name: '+ Adicionar aviso' }).click(); await expect(j.getByText('Informe uma idade de 0 a 120.')).toBeVisible();
  await idade.fill(''); await j.getByRole('button', { name: '+ Adicionar aviso' }).click(); await expect(j.getByText('Informe uma idade de 0 a 120.')).toBeVisible();
  await j.getByLabel('Data de nascimento').fill('2010-03-04');
  await expect(j.getByText('Sem a data de nascimento preenchida o sistema não tem como calcular a idade')).toHaveCount(0);
  await j.getByTitle('Remover este aviso').first().click();                             // remove o de 16 (a lista fica em ordem)
  await expect(j.getByText('16 anos')).toHaveCount(0);
  await j.getByLabel('Nome completo').fill('Avisos De Idade Ficha Teste'); await j.getByLabel('CPF', { exact: true }).fill(cpfNovo());
  await j.getByLabel('Telefone 1', { exact: true }).fill('19955554444');
  await salvar(page);
  await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();       // menor de 18 sem responsável: só lembra
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [p] = await noBanco("SELECT id FROM pessoas_fisicas WHERE nome = 'Avisos De Idade Ficha Teste'");
  expect((await noBanco('SELECT idade FROM pessoas_avisos_idade WHERE pessoa_id = ? ORDER BY idade', [p.id])).map(r => r.idade)).toEqual([18]);
});

test('@critical CTPS, telefones e e-mails: Digital esconde número e série e grava "Digital"; máscara do telefone; descrição; linhas a mais e ✕; e-mail em minúsculas e sem espaços', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page);
  await expect(j.getByLabel('Número da CTPS')).toBeVisible();
  await j.getByLabel('Digital', { exact: true }).check();
  await expect(j.getByLabel('Número da CTPS')).toHaveCount(0); await expect(j.getByLabel('Série da CTPS')).toHaveCount(0);
  await j.getByLabel('Física', { exact: true }).check();
  await j.getByLabel('Número da CTPS').fill('777'); await j.getByLabel('Série da CTPS').fill('12');
  await j.getByLabel('Digital', { exact: true }).check();
  await j.getByLabel('Nome completo').fill('Contatos Da Ficha Teste'); await j.getByLabel('CPF', { exact: true }).fill(cpfNovo());
  // telefones: máscara de celular e de fixo, descrição, 2ª linha com ✕
  await j.getByLabel('Telefone 1', { exact: true }).fill('19988887777'); await expect(j.getByLabel('Telefone 1', { exact: true })).toHaveValue('(19) 98888-7777');
  await j.getByLabel('Descrição do telefone 1').fill('  celular   da   esposa  '); await j.getByLabel('Descrição do telefone 1').blur();
  await expect(j.getByLabel('Descrição do telefone 1')).toHaveValue('celular da esposa');
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 2', { exact: true }).fill('1933334444'); await expect(j.getByLabel('Telefone 2', { exact: true })).toHaveValue('(19) 3333-4444');
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 3', { exact: true }).fill('11'); await expect(j.getByLabel('Telefone 3', { exact: true })).toHaveValue('(11');
  await removerLinha(j, 'Telefone 2');
  await expect(j.getByLabel('Telefone 3', { exact: true })).toHaveCount(0);
  await expect(j.getByLabel('Telefone 2', { exact: true })).toHaveValue('(11');
  await j.getByLabel('Telefone 2', { exact: true }).fill('(19) 3333-4444');
  // e-mails: minúsculas e sem espaços
  await j.getByLabel('E-mail 1', { exact: true }).fill('  CONTATO @Ficha.INVALID '); await j.getByLabel('E-mail 1', { exact: true }).blur();
  await expect(j.getByLabel('E-mail 1', { exact: true })).toHaveValue('contato@ficha.invalid');
  await salvar(page);
  await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [p] = await noBanco("SELECT * FROM pessoas_fisicas WHERE nome = 'Contatos Da Ficha Teste'");
  expect(p.ctps_numero).toBe('Digital'); expect(p.ctps_serie).toBeNull();
  const tels = await noBanco('SELECT numero, tipo, principal FROM telefones_pf WHERE pessoa_id = ? ORDER BY id', [p.id]);
  expect(tels.map(t => [t.numero, t.tipo, Number(t.principal)])).toEqual([['(19) 98888-7777', 'celular da esposa', 1], ['(19) 3333-4444', 'celular', 0]]);   // a 2ª linha sem descrição vira o padrão "celular"
  expect((await noBanco('SELECT email FROM emails_pf WHERE pessoa_id = ?', [p.id])).map(e => e.email)).toEqual(['contato@ficha.invalid']);
});

test('@critical Profissão: digitar filtra a lista (sem acento, em qualquer parte do nome), escolher, limpar e "Nenhuma opção encontrada"; as outras listas continuam comuns', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page);
  const campo = j.getByLabel('Profissão', { exact: true });
  await campo.click();
  await expect(page.getByRole('option', { name: 'Advogada Ficha E2E', exact: true })).toBeVisible();          // lista completa ao abrir
  await expect(page.getByRole('option', { name: 'Perícia Médica Ficha E2E', exact: true })).toBeVisible();
  await campo.fill('ADVOG');                                                                                // maiúscula não atrapalha
  await expect(page.getByRole('option', { name: 'Advogada Ficha E2E', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Perícia Médica Ficha E2E', exact: true })).toHaveCount(0);   // quem não casa some
  await campo.fill('medica ficha');                                                                         // sem acento e no MEIO do nome
  await expect(page.getByRole('option', { name: 'Perícia Médica Ficha E2E', exact: true })).toBeVisible();
  await campo.fill('zzzzzz');
  await expect(page.getByText('Nenhuma opção encontrada')).toBeVisible();
  await campo.fill('advog');
  await page.getByRole('option', { name: 'Advogada Ficha E2E', exact: true }).click();
  await expect(profissaoEscolhida(page, j)).toHaveText('Advogada Ficha E2E');
  await campo.press('Backspace');                                                                           // limpar: volta a "Selecione"
  await expect(profissaoEscolhida(page, j)).toHaveCount(0);
  await expect(j.locator('.form-group').filter({ has: page.getByLabel('Profissão', { exact: true }) }).locator('.select-pesquisavel__placeholder')).toHaveText('— Selecione —');
  // as outras listas do formulário continuam como antes (lista comum)
  for (const select of ['Gênero', 'Estado civil', 'Nacionalidade', 'Parentesco']) await expect(j.getByLabel(select, { exact: true }).evaluate(el => el.tagName)).resolves.toBe('SELECT');
  await semViolacoes(page, 'ficha da pessoa com Profissão pesquisável');
});

test('@critical Listas com "…" (gênero, estado civil, profissão, nacionalidade, parentesco): cadastra na hora e já escolhe; vazio, repetido e nome grande demais dão aviso DENTRO do mini formulário', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page);
  const grupo = (rotulo) => j.locator('.form-group').filter({ has: page.getByLabel(rotulo, { exact: true }) }).first();
  const novo = grupo('Gênero');
  await novo.getByTitle(/Cadastrar novo\(a\) Gênero/).click();
  await expect(novo.getByText('Novo(a) Gênero')).toBeVisible();
  await novo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(novo.getByText('Digite um nome para cadastrar.')).toBeVisible();
  await novo.getByPlaceholder('Ex.: Não binário').fill('Genero Grande '.repeat(5));         // acima de 50 caracteres
  await novo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(novo.getByText('O nome muito longo (máximo 50 caracteres)')).toBeVisible();   // aviso claro do servidor (não "Erro interno")
  await novo.getByPlaceholder('Ex.: Não binário').fill('feminino ficha e2e');
  await novo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(novo.getByText('"Feminino ficha e2e" já está cadastrado na lista')).toBeVisible();
  await novo.getByPlaceholder('Ex.: Não binário').fill('Genero Novo Ficha Teste');
  await novo.getByPlaceholder('Ex.: Não binário').press('Escape');                          // ESC fecha SÓ o mini formulário: a ficha e o que foi digitado continuam
  await expect(novo.getByText('Novo(a) Gênero')).toHaveCount(0); await expect(ficha(page)).toBeVisible();
  await expect(j.getByLabel('Nome completo')).toBeVisible();
  await novo.getByTitle(/Cadastrar novo\(a\) Gênero/).click();
  await novo.getByPlaceholder('Ex.: Não binário').fill('Genero Novo Ficha Teste');
  await novo.getByPlaceholder('Ex.: Não binário').press('Enter');
  await aviso(page, '"Genero novo ficha teste" cadastrado com sucesso!');
  await expect(j.getByLabel('Gênero', { exact: true }).locator('option:checked')).toHaveText('Genero novo ficha teste');   // já escolhido
  // ✕ fecha o mini formulário sem cadastrar
  const prof = grupo('Profissão');
  await prof.getByTitle(/Cadastrar novo\(a\) Profissão/).click(); await expect(prof.getByPlaceholder('Ex.: Pedreiro')).toBeVisible();
  await prof.getByRole('button', { name: '✕', exact: true }).click(); await expect(prof.getByPlaceholder('Ex.: Pedreiro')).toHaveCount(0);
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await noBanco("SELECT id FROM genero WHERE nome = 'Genero novo ficha teste'")).toHaveLength(1);
});

test('@critical Endereço: máscara do CEP, incompleto, não encontrado, sem internet e CEP achado (preenche o endereço em maiúsculas e minúsculas certas e leva o cursor ao Número)', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page); const cep = j.getByLabel('CEP', { exact: true });
  await cep.fill('13010000'); await expect(cep).toHaveValue('13010-000');
  await cep.fill('130'); await cep.blur(); await expect(j.getByText('CEP incompleto')).toBeVisible();
  await cep.fill('13010-000'); await cep.blur(); await expect(j.getByText('Erro ao consultar CEP — verifique a conexão')).toBeVisible();   // internet bloqueada
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ erro: true }) }));
  await cep.fill('99999-999'); await cep.blur(); await expect(j.getByText('CEP não encontrado')).toBeVisible();
  await page.unroute('https://viacep.com.br/**');
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ logradouro: 'RUA DAS FLORES', bairro: 'CENTRO', localidade: 'CAMPINAS', uf: 'SP' }) }));
  await cep.fill('13010-000'); await cep.blur();
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('Rua das Flores');
  await expect(j.getByLabel('Bairro', { exact: true })).toHaveValue('Centro'); await expect(j.getByLabel('Cidade', { exact: true })).toHaveValue('Campinas');
  await expect(j.getByLabel('Estado', { exact: true })).toHaveValue('SP');
  await expect(j.getByLabel('Número', { exact: true })).toBeFocused();
  await page.unroute('https://viacep.com.br/**');
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('@critical Contas bancárias: "+ Financeiro", banco novo pelo "…", própria x de outra pessoa, principal, ✕ Remover, aviso do servidor dentro da janela; fica gravado', async ({ page }) => {
  await irParaPessoas(page);
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel('Nome completo').fill('Conta Bancaria Ficha Teste');
  await j.getByRole('button', { name: '+ Financeiro' }).click();
  await expect(j.getByText('⚠️ Esta pessoa não tem CPF/CNPJ cadastrado — cadastre antes ou marque "conta de outra pessoa".')).toBeVisible();
  const cpf = cpfNovo();
  await j.getByLabel('CPF', { exact: true }).fill(cpf);
  await expect(j.getByText(`Titular: Conta Bancaria Ficha Teste — ${mascaraCpf(cpf)}`)).toBeVisible();   // titular = a própria pessoa
  const conta = j.locator('div').filter({ has: page.getByPlaceholder('Agência', { exact: true }) }).filter({ has: page.getByRole('button', { name: '✕ Remover' }) }).last();
  await conta.getByLabel('Banco', { exact: true }).selectOption({ label: 'Banco Ficha E2E' });
  await conta.getByPlaceholder('Agência', { exact: true }).fill('1234'); await conta.getByPlaceholder('Conta', { exact: true }).fill('56789');
  await expect(conta.getByPlaceholder('Dígito', { exact: true })).toHaveAttribute('maxlength', '4');
  await conta.getByPlaceholder('Dígito', { exact: true }).fill('123'); await conta.getByPlaceholder('Chave PIX', { exact: true }).fill('conta@ficha.invalid');
  await conta.locator('select').last().selectOption('poupanca');                          // tipo da conta
  await expect(conta.getByLabel('Conta principal')).toBeChecked();                       // a primeira conta já nasce principal
  // de outra pessoa: aparecem titular e documento; voltar para "própria" limpa os dois
  await conta.getByLabel('Conta de outra pessoa (autorização)').check();
  await conta.getByPlaceholder('Nome do titular', { exact: true }).fill('Titular Terceiro'); await conta.getByPlaceholder('CPF ou CNPJ do titular', { exact: true }).fill('39053344705');
  await expect(conta.getByPlaceholder('CPF ou CNPJ do titular', { exact: true })).toHaveValue('390.533.447-05');
  await conta.getByLabel('Conta de outra pessoa (autorização)').uncheck(); await conta.getByLabel('Conta de outra pessoa (autorização)').check();
  await expect(conta.getByPlaceholder('Nome do titular', { exact: true })).toHaveValue('');
  await conta.getByPlaceholder('Nome do titular', { exact: true }).fill('Titular Terceiro'); await conta.getByPlaceholder('CPF ou CNPJ do titular', { exact: true }).fill('39053344705');
  // banco novo pelo "…" daquela linha
  const bancoGrupo = conta.locator('.form-group').filter({ has: page.getByLabel('Banco', { exact: true }) }).first();
  await bancoGrupo.getByTitle(/Cadastrar novo\(a\) Banco/).click();
  await bancoGrupo.getByPlaceholder('Ex.: Nubank').fill('Banco Novo Ficha Teste'); await bancoGrupo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, '"Banco Novo Ficha Teste" cadastrado com sucesso!');
  await expect(conta.getByLabel('Banco', { exact: true }).locator('option:checked')).toHaveText('Banco Novo Ficha Teste');
  for (const [campo, valor] of [['Agência', '1234'], ['Conta', '56789'], ['Dígito', '123'], ['Chave PIX', 'conta@ficha.invalid']])
    await expect(conta.getByPlaceholder(campo, { exact: true }), `${campo} depois de cadastrar o banco novo`).toHaveValue(valor);
  await semViolacoes(page, 'janela da ficha com uma conta bancária preenchida');
  // dígito com mais de 2 caracteres: pede confirmação ANTES de qualquer outro aviso (Cancelar volta para a ficha)
  await j.getByLabel('Telefone 1', { exact: true }).fill('19955554444');
  await salvar(page);
  const c = confirmacao(page, 'Confirmar dígito da conta');
  await expect(c.getByText('conta 1: 123')).toBeVisible();
  await c.getByRole('button', { name: 'Cancelar' }).click(); await expect(c).toHaveCount(0);
  // aviso do servidor (agência acima de 20 caracteres) aparece na faixa da janela, que continua com tudo preenchido
  await conta.getByPlaceholder('Agência', { exact: true }).fill('A'.repeat(21));
  await salvar(page); await confirmacao(page, 'Confirmar dígito da conta').getByRole('button', { name: 'Salvar mesmo assim' }).click();
  await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();
  await faixa(page, 'A agência muito longa (máximo 20 caracteres)');
  await expect(ficha(page).getByLabel('Nome completo')).toHaveValue('Conta Bancaria Ficha Teste');
  expect(await noBanco("SELECT id FROM pessoas_fisicas WHERE nome = 'Conta Bancaria Ficha Teste'")).toHaveLength(0);
  await conta.getByPlaceholder('Agência', { exact: true }).fill('1234');
  await salvar(page); await confirmacao(page, 'Confirmar dígito da conta').getByRole('button', { name: 'Salvar mesmo assim' }).click();
  await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [p] = await noBanco("SELECT id FROM pessoas_fisicas WHERE nome = 'Conta Bancaria Ficha Teste'");
  const [cb] = await noBanco('SELECT * FROM contas_bancarias_pf WHERE pessoa_id = ?', [p.id]);
  expect([cb.tipo, cb.agencia, cb.numero, cb.digito, cb.chave_pix, Number(cb.conta_terceiro), cb.titular, cb.documento_titular, Number(cb.principal)])
    .toEqual(['poupanca', '1234', '56789', '123', 'conta@ficha.invalid', 1, 'Titular Terceiro', '39053344705', 1]);
  // ✕ Remover
  await esperarSemAviso(page);
  await abrirEdicao(page, 'Conta Bancaria Ficha Teste');
  await ficha(page).getByRole('button', { name: '✕ Remover' }).click();
  await expect(ficha(page).getByRole('button', { name: '✕ Remover' })).toHaveCount(0);
  await salvar(page); await confirmacao(page, 'Campos sem informação').getByRole('button', { name: 'Salvar assim' }).click();
  await aviso(page, 'Pessoa atualizada com sucesso!');
  expect(Number((await noBanco('SELECT ativo FROM contas_bancarias_pf WHERE pessoa_id = ?', [p.id]))[0].ativo)).toBe(0);   // a conta sai da ficha (fica desativada, não é apagada)
});

test('@critical Editar: abre com tudo preenchido do jeito que está no banco; SALVAR SEM MUDAR NADA funciona (a tela devolve ao servidor o que recebeu) e nada se perde; mudar e salvar grava', async ({ page }) => {
  await irParaPessoas(page);
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  const j = ficha(page);
  await expect(j.getByLabel('CPF', { exact: true })).toHaveValue(mascaraCpf(CPF.completa));
  await expect(j.getByLabel('RG', { exact: true })).toHaveValue('12.345.678-9'); await expect(j.getByLabel('Órgão Expedidor')).toHaveValue('SSP/SP');
  await expect(j.getByLabel('Data de nascimento')).toHaveValue('1990-05-17'); await expect(j.getByLabel('PIS', { exact: true })).toHaveValue('123.45678.90-1');
  await expect(j.getByLabel('Gênero', { exact: true }).locator('option:checked')).toHaveText('Feminino Ficha E2E');
  await expect(profissaoEscolhida(page, j)).toHaveText('Advogada Ficha E2E');
  await expect(j.getByLabel('Número da CTPS')).toHaveValue('123456'); await expect(j.getByLabel('Série da CTPS')).toHaveValue('0001');
  await expect(j.getByLabel('Pai', { exact: true })).toHaveValue('Pai Da Ficha'); await expect(j.getByLabel('Mãe', { exact: true })).toHaveValue('Mãe Da Ficha');
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('Rua Direita'); await expect(j.getByLabel('Estado', { exact: true })).toHaveValue('SP');
  await expect(j.getByLabel('Telefone 1', { exact: true })).toHaveValue('(19) 99999-0000'); await expect(j.getByLabel('Telefone 2', { exact: true })).toHaveValue('(19) 3333-4444');
  await expect(j.getByLabel('E-mail 1', { exact: true })).toHaveValue('completa@ficha.invalid'); await expect(j.getByLabel('E-mail 2', { exact: true })).toHaveValue('segundo@ficha.invalid');
  await expect(j.getByText('Responsável Ficha E2E', { exact: true })).toBeVisible();
  await expect(j.getByLabel('Parentesco', { exact: true }).locator('option:checked')).toHaveText('Mãe Ficha E2E');
  await expect(j.getByText('18 anos')).toBeVisible(); await expect(j.getByText('21 anos')).toBeVisible();
  await expect(j.getByPlaceholder('Agência', { exact: true })).toHaveValue('1234');
  await expect(j.getByLabel('Observações', { exact: true })).toHaveValue('Observação da Ficha Completa');
  const antes = (await noBanco('SELECT * FROM pessoas_fisicas WHERE id = ?', [d.completa]))[0];
  const contasAntes = (await noBanco('SELECT id FROM contas_bancarias_pf WHERE pessoa_id = ? AND ativo = 1', [d.completa])).map(c => c.id);
  await salvar(page);                                                                      // sem mudar nada
  await aviso(page, 'Pessoa atualizada com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  const depois = (await noBanco('SELECT * FROM pessoas_fisicas WHERE id = ?', [d.completa]))[0];
  for (const campo of ['nome', 'cpf', 'rg', 'rg_orgao', 'pis', 'genero_id', 'estado_civil_id', 'profissao_id', 'nacionalidade_id', 'nome_pai', 'nome_mae', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'observacoes', 'responsavel_id', 'parentesco_id', 'ctps_numero', 'ctps_serie'])
    expect(depois[campo], campo).toBe(antes[campo]);
  expect(String(depois.data_nascimento)).toBe(String(antes.data_nascimento));
  expect((await noBanco('SELECT numero FROM telefones_pf WHERE pessoa_id = ? ORDER BY id', [d.completa])).map(t => t.numero)).toEqual(['(19) 99999-0000', '(19) 3333-4444']);
  expect((await noBanco('SELECT idade FROM pessoas_avisos_idade WHERE pessoa_id = ? ORDER BY idade', [d.completa])).map(a => a.idade)).toEqual([18, 21]);
  expect((await noBanco('SELECT id FROM contas_bancarias_pf WHERE pessoa_id = ? AND ativo = 1', [d.completa])).map(c => c.id)).toEqual(contasAntes);   // a conta mantém o mesmo id
  await esperarSemAviso(page);
  // mudar de verdade: cidade, mais um telefone, tira um aviso de idade
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('valinhos'); await ficha(page).getByLabel('Cidade', { exact: true }).blur();
  await ficha(page).getByRole('button', { name: '+ Adicionar telefone' }).click(); await ficha(page).getByLabel('Telefone 3', { exact: true }).fill('19944443333');
  await ficha(page).getByTitle('Remover este aviso').first().click();
  await salvar(page); await aviso(page, 'Pessoa atualizada com sucesso!');
  const mudou = (await noBanco('SELECT cidade FROM pessoas_fisicas WHERE id = ?', [d.completa]))[0];
  expect(mudou.cidade).toBe('Valinhos');
  expect(await noBanco('SELECT id FROM telefones_pf WHERE pessoa_id = ?', [d.completa])).toHaveLength(3);
  expect((await noBanco('SELECT idade FROM pessoas_avisos_idade WHERE pessoa_id = ?', [d.completa])).map(a => a.idade)).toEqual([21]);
  // volta ao que era (os outros testes dependem destes dados)
  await noBanco("UPDATE pessoas_fisicas SET cidade = 'Campinas' WHERE id = ?", [d.completa]);
  await noBanco("DELETE FROM telefones_pf WHERE pessoa_id = ? AND numero = '(19) 94444-3333'", [d.completa]);
  await noBanco('INSERT IGNORE INTO pessoas_avisos_idade (pessoa_id, idade) VALUES (?, 18)', [d.completa]);
});

test('@critical Editar: Cancelar, ✕ e ESC não gravam; um aviso do servidor (observações acima de 5.000) aparece na faixa da janela, que continua com tudo digitado', async ({ page }) => {
  await irParaPessoas(page);
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada');
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada');
  await ficha(page).getByRole('button', { name: '✕', exact: true }).first().click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada'); await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
  expect((await noBanco('SELECT cidade FROM pessoas_fisicas WHERE id = ?', [d.completa]))[0].cidade).toBe('Campinas');
  await abrirEdicao(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByLabel('Observações', { exact: true }).fill('x'.repeat(5001));
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Digitada');
  await salvar(page);
  await faixa(page, 'O campo Observações muito longo (máximo 5000 caracteres)');
  await expect(ficha(page).getByLabel('Cidade', { exact: true })).toHaveValue('Cidade Digitada');             // nada foi perdido
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();
  await ficha(page).getByLabel('Observações', { exact: true }).fill('x'.repeat(5000));
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Campinas');
  await ficha(page).getByLabel('Observações', { exact: true }).fill('texto livre com SIGLA e minúsculas');
  await ficha(page).getByLabel('Observações', { exact: true }).blur();
  await expect(ficha(page).getByLabel('Observações', { exact: true })).toHaveValue('texto livre com SIGLA e minúsculas');   // Observações não é convertida para "Title Case"
  await salvar(page); await aviso(page, 'Pessoa atualizada com sucesso!');
  expect((await noBanco('SELECT observacoes FROM pessoas_fisicas WHERE id = ?', [d.completa]))[0].observacoes).toBe('texto livre com SIGLA e minúsculas');
  await noBanco("UPDATE pessoas_fisicas SET observacoes = 'Observação da Ficha Completa' WHERE id = ?", [d.completa]);
});

test('@critical Detalhes: clicar no nome abre a ficha TRAVADA (nenhum campo editável, sem "+ Adicionar", sem ✕), com Fechar e Editar; WhatsApp nos telefones; Editar destrava; sem violação de acessibilidade', async ({ page }) => {
  await irParaPessoas(page);
  await abrirDetalhes(page, 'Edição Completa Ficha E2E');
  const j = ficha(page);
  const campos = j.locator('input:not([type=hidden]), select, textarea');
  const total = await campos.count();
  expect(total).toBeGreaterThan(25);
  for (let i = 0; i < total; i += 1) await expect(campos.nth(i), `campo ${i + 1} de ${total}`).toBeDisabled();
  for (const botao of ['+ Adicionar telefone', '+ Adicionar e-mail', '+ Financeiro', '+ Adicionar aviso', '✕ Remover']) await expect(j.getByRole('button', { name: botao })).toHaveCount(0);
  await expect(j.getByTitle('Remover este aviso')).toHaveCount(0); await expect(j.getByTitle('Remover o responsável legal')).toHaveCount(0);
  await expect(j.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible(); await expect(j.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await expect(j.getByRole('button', { name: 'Enviar WhatsApp para este telefone' })).toHaveCount(2);
  await semViolacoes(page, 'janela Detalhes da Pessoa Física (com conta bancária, responsável e avisos)');
  await j.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Física' })).toBeVisible();
  await expect(ficha(page).getByLabel('Cidade', { exact: true })).toBeEnabled(); await expect(ficha(page).getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await abrirDetalhes(page, 'Edição Completa Ficha E2E');
  await ficha(page).getByRole('button', { name: 'Fechar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirDetalhes(page, 'Edição Completa Ficha E2E'); await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
});
