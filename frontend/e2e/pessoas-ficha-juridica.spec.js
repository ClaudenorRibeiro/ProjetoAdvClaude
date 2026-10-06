import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarRespostaProcessada, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers.js';
import { createRequire } from 'node:module';

// Teste de TELA da ficha da PESSOA JURÍDICA (janela "Nova / Editar / Detalhes da Pessoa Jurídica", aberta pela aba "Pessoas Jurídicas" da tela Pessoas):
// campos, CNPJ (máscara, incompleto, inválido, duplicado), "Em Recuperação Judicial", telefones, e-mails, endereço (CEP), contas bancárias,
// Editar (ida e volta sem perder nada) e Detalhes (tudo travado), além da acessibilidade de cada estado.
// Os dados nascem e morrem aqui (razão social com "Ficha Juridica"); a internet é bloqueada (o ViaCEP é simulado).
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
// CNPJ válido (com os dois dígitos verificadores) a partir de 12 dígitos
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
const mascaraCnpj = (c) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
let seqCnpj = 0;
// CNPJ válido diferente a cada chamada (cada teste grava a sua empresa; nenhum repete o CNPJ do outro)
const cnpjNovo = () => cnpjValido(`7${String(Date.now()).slice(-7)}${String(seqCnpj++).padStart(2, '0')}0001`.slice(0, 12));
const CNPJ = { duplicada: cnpjValido('310000010001'), completa: cnpjValido('310000020001') };

async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const ficha = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /^(Nova|Editar|Detalhes da) Pessoa Jurídica$/ }) }).last();
const confirmacao = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const faixa = (page, texto) => expect(ficha(page).getByText(texto, { exact: false }).first()).toBeVisible();   // a faixa vermelha DENTRO da janela
const salvar = (page) => ficha(page).getByRole('button', { name: 'Salvar', exact: true }).click();
const RAZAO = 'Razão Social *';
const NOMES_APAGAR = "razao_social LIKE '%Ficha Juridica%'";
// botão ✕ da linha de telefone/e-mail que contém o campo de rótulo dado (os botões ✕ não têm nome próprio)
const removerLinha = (j, rotulo) => j.getByLabel(rotulo, { exact: true }).locator('xpath=ancestor::div[.//button[normalize-space()="✕"]][1]').getByRole('button', { name: '✕', exact: true }).click();
const quantas = async () => Number((await noBanco(`SELECT COUNT(*) AS n FROM pessoas_juridicas WHERE ${NOMES_APAGAR}`))[0].n);

let d;
async function prepararDados() {
  const um = async (sql, p = []) => (await noBanco(sql, p))[0];
  const dados = {};
  dados.banco = (await um("SELECT id FROM instituicao_financeira WHERE nome = 'Banco Empresa Teste'"))?.id
    || (await noBanco("INSERT INTO instituicao_financeira (nome) VALUES ('Banco Empresa Teste')")).insertId;
  const empresa = async (razao, cnpj, extra = {}) => {
    const existente = await um('SELECT id FROM pessoas_juridicas WHERE razao_social = ?', [razao]);
    if (existente) return existente.id;
    const colunas = ['razao_social', 'cnpj', ...Object.keys(extra)];
    return (await noBanco(`INSERT INTO pessoas_juridicas (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`, [razao, cnpj, ...Object.values(extra)])).insertId;
  };
  dados.duplicada = await empresa('Empresa Duplicada Ficha Juridica Ltda', CNPJ.duplicada);
  dados.completa = await empresa('Empresa Completa Ficha Juridica Ltda', CNPJ.completa, {
    nome_fantasia: 'Completa Fantasia', inscricao_estadual: '123.456.789', em_recuperacao_judicial: 1, cep: '13010-000', logradouro: 'Rua Direita', numero: '100',
    complemento: 'Sala 2', bairro: 'Centro', cidade: 'Campinas', estado: 'SP', observacoes: 'Observação da Ficha Completa',
  });
  if (!(await um('SELECT id FROM telefones_pj WHERE pessoa_id = ?', [dados.completa]))) {
    await noBanco("INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, '(19) 3333-0000', 'Comercial', 1), (?, '(19) 99999-1111', 'Celular do sócio', 0)", [dados.completa, dados.completa]);
    await noBanco("INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, 'contato@completa.invalid', 1), (?, 'financeiro@completa.invalid', 0)", [dados.completa, dados.completa]);
    await noBanco(`INSERT INTO contas_bancarias_pj (pessoa_id, instituicao_financeira_id, tipo, agencia, numero, digito, chave_pix, conta_terceiro, titular, documento_titular, principal)
                   VALUES (?, ?, 'corrente', '1234', '56789', '0', 'contato@completa.invalid', 0, 'Empresa Completa Ficha Juridica Ltda', ?, 1)`, [dados.completa, dados.banco, CNPJ.completa]);
  }
  return dados;
}
async function limparDados() {
  await noBanco(`DELETE FROM pessoas_juridicas WHERE ${NOMES_APAGAR}`);    // telefones, e-mails e contas saem em cascata
  await noBanco("DELETE FROM instituicao_financeira WHERE nome = 'Banco Empresa Teste'");
}

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { await limparDados(); d = await prepararDados(); });
test.afterAll(async () => { await limparDados(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function irParaJuridicas(page) {
  await loginPelaTela(page);
  await page.goto('/pessoas'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Pessoas Jurídicas', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Nova Pessoa Jurídica' })).toBeVisible();
}
async function abrirNova(page) {
  await page.getByRole('button', { name: '+ Nova Pessoa Jurídica' }).click();
  await expect(ficha(page).getByRole('heading', { name: 'Nova Pessoa Jurídica' })).toBeVisible();
}
async function buscarNaLista(page, razao) {
  await page.getByPlaceholder(/Buscar por razão social/).fill(razao);
  await expect(page.locator('tbody tr').filter({ hasText: razao })).toHaveCount(1);
  return page.locator('tbody tr').filter({ hasText: razao });
}
const respostaDaFicha = (page, timeout) => page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/pessoas\/juridicas\/\d+$/.test(r.url()), timeout ? { timeout } : undefined);
async function abrirEdicao(page, razao) {
  // a lista recarrega logo depois de fechar uma janela: abrir o menu, clicar em Editar e esperar os dados do servidor
  // ficam JUNTOS na mesma tentativa — se o menu sumir no meio do clique, recomeça.
  let resposta;
  await expect(async () => {
    const linha = await buscarNaLista(page, razao);
    await abrirMenuAcoes(page, linha);
    [resposta] = await Promise.all([respostaDaFicha(page, 8000), page.getByRole('button', { name: 'Editar', exact: true }).click({ timeout: 4000 })]);
  }).toPass({ timeout: 40000 });
  await aguardarRespostaProcessada(page, resposta);                 // só mexe na ficha depois que a página usou os dados recebidos
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Jurídica' })).toBeVisible();
  await expect(ficha(page).getByLabel(RAZAO, { exact: true })).toHaveValue(razao);
}
async function abrirDetalhes(page, razao) {
  const linha = await buscarNaLista(page, razao);
  const dadosDoServidor = respostaDaFicha(page);
  await linha.getByTitle('Ver detalhes').click();
  await aguardarRespostaProcessada(page, await dadosDoServidor);
  await expect(ficha(page).getByRole('heading', { name: 'Detalhes da Pessoa Jurídica' })).toBeVisible();
  await expect(ficha(page).getByLabel(RAZAO, { exact: true })).toHaveValue(razao);
}

test('@critical Nova Pessoa Jurídica: abre vazia, só com campos de empresa, fecha por Cancelar, ✕ e ESC sem gravar nada, e a janela não tem violação de acessibilidade', async ({ page }) => {
  await irParaJuridicas(page);
  const antes = await quantas();
  await abrirNova(page);
  const j = ficha(page);
  for (const rotulo of [RAZAO, 'Nome Fantasia', 'CNPJ', 'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado', 'Telefone 1', 'E-mail 1', 'Observações'])
    await expect(j.getByLabel(rotulo, { exact: true })).toHaveValue('');
  await expect(j.getByLabel('Em Recuperação Judicial')).not.toBeChecked();
  for (const so_da_fisica of ['CPF', 'RG', 'Data de nascimento', 'PIS', 'Gênero', 'Profissão', 'Buscar responsável legal'])
    await expect(j.getByLabel(so_da_fisica, { exact: true }), `"${so_da_fisica}" é só da pessoa física`).toHaveCount(0);
  await expect(j.getByRole('button', { name: '+ Financeiro' })).toBeVisible();
  await expect(j.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await semViolacoes(page, 'janela Nova Pessoa Jurídica (vazia)');
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirNova(page); await ficha(page).getByRole('button', { name: '✕', exact: true }).first().click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirNova(page); await ficha(page).getByLabel(RAZAO, { exact: true }).fill('Digitada E Descartada'); await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(await quantas()).toBe(antes);
  await abrirNova(page);
  await expect(ficha(page).getByLabel(RAZAO, { exact: true })).toHaveValue('');          // reabrir começa limpo
});

test('@critical Nova Pessoa Jurídica: validações do salvar — razão social em branco ou só espaços, telefone e e-mail repetidos — e nada é gravado', async ({ page }) => {
  await irParaJuridicas(page);
  const antes = await quantas();
  await abrirNova(page);
  const j = ficha(page);
  await salvar(page); await faixa(page, 'Razão social é obrigatória.');
  await j.getByTitle('Fechar', { exact: true }).click(); await expect(j.getByText('Razão social é obrigatória.')).toHaveCount(0);
  await j.getByLabel(RAZAO, { exact: true }).fill('   '); await salvar(page); await faixa(page, 'Razão social é obrigatória.');   // só espaços: o campo limpa ao sair e a tela barra do mesmo jeito
  await j.getByLabel(RAZAO, { exact: true }).fill('Validacoes Ficha Juridica Ltda');
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
  await semViolacoes(page, 'ficha da empresa com o aviso "E-mail inválido" aberto');
  await salvar(page); await faixa(page, 'E-mail inválido: "email-sem-arroba". Corrija antes de salvar.');   // e-mail fora do formato não grava (igual à pessoa física)
  expect(await quantas()).toBe(antes);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0);                         // todo aviso é na faixa da janela, nunca no canto
});

test('@critical Nova Pessoa Jurídica: só a razão social basta — salva direto (sem "Campos sem informação"), nome em maiúsculas e minúsculas certas, CNPJ vazio', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel(RAZAO, { exact: true }).fill('minima FICHA juridica ltda'); await j.getByLabel(RAZAO, { exact: true }).blur();
  await expect(j.getByLabel(RAZAO, { exact: true })).toHaveValue('Minima Ficha Juridica Ltda');   // Title Case ao sair do campo
  await j.getByLabel('Nome Fantasia', { exact: true }).fill('  loja   minima '); await j.getByLabel('Nome Fantasia', { exact: true }).blur();
  await expect(j.getByLabel('Nome Fantasia', { exact: true })).toHaveValue('Loja Minima');
  await salvar(page);
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  const [linha] = await noBanco("SELECT * FROM pessoas_juridicas WHERE razao_social = 'Minima Ficha Juridica Ltda'");
  expect(linha.cnpj).toBeNull(); expect(linha.nome_fantasia).toBe('Loja Minima'); expect(Number(linha.em_recuperacao_judicial)).toBe(0); expect(linha.criado_por).toBe(1);
  expect(await noBanco('SELECT id FROM telefones_pj WHERE pessoa_id = ?', [linha.id])).toHaveLength(0);    // telefone em branco não vira linha
  await esperarSemAviso(page);
  await expect(page.locator('tbody tr').filter({ hasText: 'Minima Ficha Juridica Ltda' })).toHaveCount(1);   // a lista já mostra a empresa nova
});

test('@critical CNPJ: máscara, incompleto, inválido, válido; CNPJ que já existe é barrado no salvar com aviso dentro da janela (sem perder o que foi digitado)', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page); const campo = j.getByLabel('CNPJ', { exact: true });
  await campo.fill('123'); await campo.blur(); await expect(j.getByText('⚠️ CNPJ incompleto')).toBeVisible();
  await campo.fill('11111111111111'); await campo.blur(); await expect(j.getByText('⚠️ CNPJ inválido')).toBeVisible();
  await campo.fill('1234567890abcd'); await expect(campo).toHaveValue('12.345.678/90');          // letras não entram
  const valido = cnpjNovo();
  await campo.fill(valido); await expect(campo).toHaveValue(mascaraCnpj(valido)); await campo.blur();
  await expect(j.getByText(/⚠️ CNPJ/)).toHaveCount(0);
  await semViolacoes(page, 'ficha da empresa com CNPJ preenchido');
  await j.getByLabel(RAZAO, { exact: true }).fill('Cnpj Repetido Ficha Juridica Ltda');
  await campo.fill(CNPJ.duplicada); await campo.blur();
  await salvar(page);
  await faixa(page, 'CNPJ já cadastrado no sistema');
  await expect(ficha(page).getByLabel(RAZAO, { exact: true })).toHaveValue('Cnpj Repetido Ficha Juridica Ltda');   // a janela continua com tudo
  expect(await noBanco("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Cnpj Repetido Ficha Juridica Ltda'")).toHaveLength(0);
  await campo.fill(valido); await salvar(page);                                           // corrigindo o CNPJ, salva
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  expect((await noBanco("SELECT cnpj FROM pessoas_juridicas WHERE razao_social = 'Cnpj Repetido Ficha Juridica Ltda'"))[0].cnpj).toBe(valido);   // gravado só com os números
});

test('@critical Em Recuperação Judicial: marcar e salvar grava 1; a ficha reabre marcada; desmarcar e salvar grava 0', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel(RAZAO, { exact: true }).fill('Recuperacao Ficha Juridica Ltda');
  await j.getByLabel('Em Recuperação Judicial').check();
  await expect(j.getByLabel('Em Recuperação Judicial')).toBeChecked();
  await j.getByText('Em Recuperação Judicial', { exact: true }).click();                     // clicar no texto também alterna (o texto é o rótulo da caixa)
  await expect(j.getByLabel('Em Recuperação Judicial')).not.toBeChecked();
  await j.getByText('Em Recuperação Judicial', { exact: true }).click();
  await salvar(page); await aviso(page, 'Pessoa cadastrada com sucesso!');
  const consulta = "SELECT em_recuperacao_judicial AS rj FROM pessoas_juridicas WHERE razao_social = 'Recuperacao Ficha Juridica Ltda'";
  expect(Number((await noBanco(consulta))[0].rj)).toBe(1);
  await esperarSemAviso(page);
  await abrirEdicao(page, 'Recuperacao Ficha Juridica Ltda');
  await expect(ficha(page).getByLabel('Em Recuperação Judicial')).toBeChecked();
  await ficha(page).getByLabel('Em Recuperação Judicial').uncheck();
  await salvar(page); await aviso(page, 'Pessoa atualizada com sucesso!');
  expect(Number((await noBanco(consulta))[0].rj)).toBe(0);
});

test('@critical Telefones e e-mails da empresa: máscara, descrição, linhas a mais e ✕, e-mail em minúsculas e sem espaços; fica gravado', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel(RAZAO, { exact: true }).fill('Contatos Ficha Juridica Ltda');
  await j.getByLabel('Telefone 1', { exact: true }).fill('1933334444'); await expect(j.getByLabel('Telefone 1', { exact: true })).toHaveValue('(19) 3333-4444');
  await j.getByLabel('Descrição do telefone 1', { exact: true }).fill('  setor   comercial '); await j.getByLabel('Descrição do telefone 1', { exact: true }).blur();
  await expect(j.getByLabel('Descrição do telefone 1', { exact: true })).toHaveValue('setor comercial');
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 2', { exact: true }).fill('19988887777'); await expect(j.getByLabel('Telefone 2', { exact: true })).toHaveValue('(19) 98888-7777');
  await j.getByRole('button', { name: '+ Adicionar telefone' }).click();
  await j.getByLabel('Telefone 3', { exact: true }).fill('11');
  await removerLinha(j, 'Telefone 3');
  await expect(j.getByLabel('Telefone 3', { exact: true })).toHaveCount(0);
  await j.getByLabel('E-mail 1', { exact: true }).fill('  CONTATO @Ficha.INVALID '); await j.getByLabel('E-mail 1', { exact: true }).blur();
  await expect(j.getByLabel('E-mail 1', { exact: true })).toHaveValue('contato@ficha.invalid');
  await salvar(page); await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [p] = await noBanco("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Contatos Ficha Juridica Ltda'");
  const tels = await noBanco('SELECT numero, tipo, principal FROM telefones_pj WHERE pessoa_id = ? ORDER BY id', [p.id]);
  expect(tels.map(t => [t.numero, t.tipo, Number(t.principal)])).toEqual([['(19) 3333-4444', 'setor comercial', 1], ['(19) 98888-7777', 'comercial', 0]]);   // a 2ª linha sem descrição vira o padrão "comercial"
  expect((await noBanco('SELECT email FROM emails_pj WHERE pessoa_id = ?', [p.id])).map(e => e.email)).toEqual(['contato@ficha.invalid']);
});

test('@critical Endereço da empresa: máscara do CEP, incompleto, não encontrado, sem internet e CEP achado (preenche o endereço e leva o cursor ao Número); Observações não é mexida', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page); const cep = j.getByLabel('CEP', { exact: true });
  await cep.fill('13010000'); await expect(cep).toHaveValue('13010-000');
  await cep.fill('130'); await cep.blur(); await expect(j.getByText('CEP incompleto')).toBeVisible();
  await cep.fill('13010-000'); await cep.blur(); await expect(j.getByText('Erro ao consultar CEP — verifique a conexão')).toBeVisible();   // internet bloqueada
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ erro: true }) }));
  await cep.fill('99999-999'); await cep.blur(); await expect(j.getByText('CEP não encontrado')).toBeVisible();
  await page.unroute('https://viacep.com.br/**');
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ logradouro: 'AVENIDA DAS INDUSTRIAS', bairro: 'DISTRITO INDUSTRIAL', localidade: 'CAMPINAS', uf: 'SP' }) }));
  await cep.fill('13010-000'); await cep.blur();
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('Avenida das Industrias');
  await expect(j.getByLabel('Bairro', { exact: true })).toHaveValue('Distrito Industrial'); await expect(j.getByLabel('Cidade', { exact: true })).toHaveValue('Campinas');
  await expect(j.getByLabel('Estado', { exact: true })).toHaveValue('SP');
  await expect(j.getByLabel('Número', { exact: true })).toBeFocused();
  await page.unroute('https://viacep.com.br/**');
  await j.getByLabel('Observações', { exact: true }).fill('texto livre com SIGLA e minúsculas'); await j.getByLabel('Observações', { exact: true }).blur();
  await expect(j.getByLabel('Observações', { exact: true })).toHaveValue('texto livre com SIGLA e minúsculas');   // Observações não vira "Title Case"
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('@critical Contas bancárias da empresa: titular é a própria empresa (razão social + CNPJ), aviso sem CNPJ, conta de outra pessoa, principal, ✕ Remover, aviso do servidor na janela; fica gravado', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirNova(page);
  const j = ficha(page);
  await j.getByLabel(RAZAO, { exact: true }).fill('Conta Bancaria Ficha Juridica Ltda');
  await j.getByRole('button', { name: '+ Financeiro' }).click();
  await expect(j.getByText('⚠️ Esta pessoa não tem CPF/CNPJ cadastrado — cadastre antes ou marque "conta de outra pessoa".')).toBeVisible();
  const cnpj = cnpjNovo();
  await j.getByLabel('CNPJ', { exact: true }).fill(cnpj);
  await expect(j.getByText(`Titular: Conta Bancaria Ficha Juridica Ltda — ${mascaraCnpj(cnpj)}`)).toBeVisible();   // titular = a própria empresa
  const conta = j.locator('div').filter({ has: page.getByPlaceholder('Agência', { exact: true }) }).filter({ has: page.getByRole('button', { name: '✕ Remover' }) }).last();
  await conta.getByLabel('Banco', { exact: true }).selectOption({ label: 'Banco Empresa Teste' });
  await conta.getByPlaceholder('Agência', { exact: true }).fill('1234'); await conta.getByPlaceholder('Conta', { exact: true }).fill('56789');
  await conta.getByPlaceholder('Dígito', { exact: true }).fill('123'); await conta.getByPlaceholder('Chave PIX', { exact: true }).fill('empresa@ficha.invalid');
  await conta.getByLabel('Tipo da conta', { exact: true }).selectOption('poupanca');
  await expect(conta.getByLabel('Conta principal')).toBeChecked();                        // a primeira conta já nasce principal
  await conta.getByLabel('Conta de outra pessoa (autorização)').check();
  await conta.getByPlaceholder('Nome do titular', { exact: true }).fill('Titular Terceiro'); await conta.getByPlaceholder('CPF ou CNPJ do titular', { exact: true }).fill('39053344705');
  await expect(conta.getByPlaceholder('CPF ou CNPJ do titular', { exact: true })).toHaveValue('390.533.447-05');
  await semViolacoes(page, 'ficha da empresa com uma conta bancária preenchida');
  await salvar(page);                                                                      // dígito com mais de 2 caracteres pede confirmação
  const c = confirmacao(page, 'Confirmar dígito da conta');
  await expect(c.getByText('conta 1: 123')).toBeVisible();
  await c.getByRole('button', { name: 'Cancelar' }).click(); await expect(c).toHaveCount(0);
  await conta.getByPlaceholder('Agência', { exact: true }).fill('A'.repeat(21));
  await salvar(page); await confirmacao(page, 'Confirmar dígito da conta').getByRole('button', { name: 'Salvar mesmo assim' }).click();
  await faixa(page, 'A agência muito longa (máximo 20 caracteres)');
  await expect(ficha(page).getByLabel(RAZAO, { exact: true })).toHaveValue('Conta Bancaria Ficha Juridica Ltda');
  expect(await noBanco("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Conta Bancaria Ficha Juridica Ltda'")).toHaveLength(0);
  await conta.getByPlaceholder('Agência', { exact: true }).fill('1234');
  await salvar(page); await confirmacao(page, 'Confirmar dígito da conta').getByRole('button', { name: 'Salvar mesmo assim' }).click();
  await aviso(page, 'Pessoa cadastrada com sucesso!');
  const [p] = await noBanco("SELECT id FROM pessoas_juridicas WHERE razao_social = 'Conta Bancaria Ficha Juridica Ltda'");
  const [cb] = await noBanco('SELECT * FROM contas_bancarias_pj WHERE pessoa_id = ?', [p.id]);
  expect([cb.tipo, cb.agencia, cb.numero, cb.digito, cb.chave_pix, Number(cb.conta_terceiro), cb.titular, cb.documento_titular, Number(cb.principal)])
    .toEqual(['poupanca', '1234', '56789', '123', 'empresa@ficha.invalid', 1, 'Titular Terceiro', '39053344705', 1]);
  await esperarSemAviso(page);
  await abrirEdicao(page, 'Conta Bancaria Ficha Juridica Ltda');
  await ficha(page).getByRole('button', { name: '✕ Remover' }).click();
  await expect(ficha(page).getByRole('button', { name: '✕ Remover' })).toHaveCount(0);
  await salvar(page); await aviso(page, 'Pessoa atualizada com sucesso!');
  expect(Number((await noBanco('SELECT ativo FROM contas_bancarias_pj WHERE pessoa_id = ?', [p.id]))[0].ativo)).toBe(0);   // a conta sai da ficha (fica desativada, não é apagada)
});

test('@critical Editar empresa: abre com tudo preenchido; SALVAR SEM MUDAR NADA funciona e nada se perde (inclusive a inscrição estadual, que não aparece na tela); mudar e salvar grava; CNPJ de outra empresa é barrado', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  const j = ficha(page);
  await expect(j.getByLabel('Nome Fantasia', { exact: true })).toHaveValue('Completa Fantasia');
  await expect(j.getByLabel('CNPJ', { exact: true })).toHaveValue(mascaraCnpj(CNPJ.completa));
  await expect(j.getByLabel('Em Recuperação Judicial')).toBeChecked();
  await expect(j.getByLabel('CEP', { exact: true })).toHaveValue('13010-000'); await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('Rua Direita');
  await expect(j.getByLabel('Número', { exact: true })).toHaveValue('100'); await expect(j.getByLabel('Complemento', { exact: true })).toHaveValue('Sala 2');
  await expect(j.getByLabel('Bairro', { exact: true })).toHaveValue('Centro'); await expect(j.getByLabel('Cidade', { exact: true })).toHaveValue('Campinas'); await expect(j.getByLabel('Estado', { exact: true })).toHaveValue('SP');
  await expect(j.getByLabel('Telefone 1', { exact: true })).toHaveValue('(19) 3333-0000'); await expect(j.getByLabel('Descrição do telefone 2', { exact: true })).toHaveValue('Celular do sócio');
  await expect(j.getByLabel('E-mail 1', { exact: true })).toHaveValue('contato@completa.invalid'); await expect(j.getByLabel('E-mail 2', { exact: true })).toHaveValue('financeiro@completa.invalid');
  await expect(j.getByPlaceholder('Agência', { exact: true })).toHaveValue('1234');
  await expect(j.getByLabel('Observações', { exact: true })).toHaveValue('Observação da Ficha Completa');
  await semViolacoes(page, 'janela Editar Pessoa Jurídica (empresa completa)');
  const antes = (await noBanco('SELECT * FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0];
  const contasAntes = (await noBanco('SELECT id FROM contas_bancarias_pj WHERE pessoa_id = ? AND ativo = 1', [d.completa])).map(c => c.id);
  await salvar(page);                                                                      // sem mudar nada
  await aviso(page, 'Pessoa atualizada com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  const depois = (await noBanco('SELECT * FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0];
  for (const campo of ['razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'em_recuperacao_judicial', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'observacoes'])
    expect(depois[campo], campo).toBe(antes[campo]);
  expect((await noBanco('SELECT numero, tipo FROM telefones_pj WHERE pessoa_id = ? ORDER BY id', [d.completa])).map(t => [t.numero, t.tipo])).toEqual([['(19) 3333-0000', 'Comercial'], ['(19) 99999-1111', 'Celular do sócio']]);
  expect((await noBanco('SELECT email FROM emails_pj WHERE pessoa_id = ? ORDER BY id', [d.completa])).map(e => e.email)).toEqual(['contato@completa.invalid', 'financeiro@completa.invalid']);
  expect((await noBanco('SELECT id FROM contas_bancarias_pj WHERE pessoa_id = ? AND ativo = 1', [d.completa])).map(c => c.id)).toEqual(contasAntes);   // a conta mantém o mesmo id
  await esperarSemAviso(page);
  // mudar de verdade: cidade e um telefone a mais
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('valinhos'); await ficha(page).getByLabel('Cidade', { exact: true }).blur();
  await ficha(page).getByRole('button', { name: '+ Adicionar telefone' }).click(); await ficha(page).getByLabel('Telefone 3', { exact: true }).fill('19944443333');
  await salvar(page); await aviso(page, 'Pessoa atualizada com sucesso!');
  expect((await noBanco('SELECT cidade FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0].cidade).toBe('Valinhos');
  expect(await noBanco('SELECT id FROM telefones_pj WHERE pessoa_id = ?', [d.completa])).toHaveLength(3);
  await esperarSemAviso(page);
  // CNPJ que já é de outra empresa: o servidor barra e a janela continua com o que foi digitado
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('CNPJ', { exact: true }).fill(CNPJ.duplicada);
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Digitada');
  await salvar(page); await faixa(page, 'Este CNPJ já está cadastrado em outra empresa');
  await expect(ficha(page).getByLabel('Cidade', { exact: true })).toHaveValue('Cidade Digitada');
  expect((await noBanco('SELECT cnpj FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0].cnpj).toBe(CNPJ.completa);
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  // volta ao que era (os outros testes dependem destes dados)
  await noBanco("UPDATE pessoas_juridicas SET cidade = 'Campinas' WHERE id = ?", [d.completa]);
  await noBanco("DELETE FROM telefones_pj WHERE pessoa_id = ? AND numero = '(19) 94444-3333'", [d.completa]);
});

test('@critical Editar empresa: Cancelar, ✕ e ESC não gravam; um aviso do servidor (observações acima de 5.000) aparece na faixa e a janela continua com tudo digitado', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada');
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada');
  await ficha(page).getByRole('button', { name: '✕', exact: true }).first().click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Nao Gravada'); await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
  expect((await noBanco('SELECT cidade FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0].cidade).toBe('Campinas');
  await abrirEdicao(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByLabel('Observações', { exact: true }).fill('x'.repeat(5001));
  await ficha(page).getByLabel('Cidade', { exact: true }).fill('Cidade Digitada');
  await salvar(page);
  await faixa(page, 'O campo Observações muito longo (máximo 5000 caracteres)');
  await expect(ficha(page).getByLabel('Cidade', { exact: true })).toHaveValue('Cidade Digitada');             // nada foi perdido
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Jurídica' })).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await noBanco('SELECT observacoes FROM pessoas_juridicas WHERE id = ?', [d.completa]))[0].observacoes).toBe('Observação da Ficha Completa');
});

test('@critical Detalhes da empresa: clicar na razão social abre a ficha TRAVADA (nenhum campo editável, sem "+ Adicionar", sem ✕), com Fechar e Editar; WhatsApp nos telefones; Editar destrava; sem violação de acessibilidade', async ({ page }) => {
  await irParaJuridicas(page);
  await abrirDetalhes(page, 'Empresa Completa Ficha Juridica Ltda');
  const j = ficha(page);
  const campos = j.locator('input:not([type=hidden]), select, textarea');
  const total = await campos.count();
  expect(total).toBeGreaterThan(18);
  for (let i = 0; i < total; i += 1) await expect(campos.nth(i), `campo ${i + 1} de ${total}`).toBeDisabled();
  await expect(j.getByLabel('Em Recuperação Judicial')).toBeChecked();                    // marcada e travada
  for (const botao of ['+ Adicionar telefone', '+ Adicionar e-mail', '+ Financeiro', '✕ Remover']) await expect(j.getByRole('button', { name: botao })).toHaveCount(0);
  await expect(j.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible(); await expect(j.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await expect(j.getByRole('button', { name: 'Enviar WhatsApp para este telefone' })).toHaveCount(2);
  await semViolacoes(page, 'janela Detalhes da Pessoa Jurídica (com conta bancária e Recuperação Judicial marcada)');
  await j.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(ficha(page).getByRole('heading', { name: 'Editar Pessoa Jurídica' })).toBeVisible();
  await expect(ficha(page).getByLabel('Cidade', { exact: true })).toBeEnabled(); await expect(ficha(page).getByLabel('Em Recuperação Judicial')).toBeEnabled();
  await expect(ficha(page).getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await ficha(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await abrirDetalhes(page, 'Empresa Completa Ficha Juridica Ltda');
  await ficha(page).getByRole('button', { name: 'Fechar', exact: true }).click(); await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirDetalhes(page, 'Empresa Completa Ficha Juridica Ltda'); await page.keyboard.press('Escape'); await expect(page.locator('.modal-box')).toHaveCount(0);
});
