import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// PROCESSO APENSO na tela (pasta de teste 7401): criar pelo menu "Criar apenso", marca "APENSO", contador na lista de pastas,
// arquivar o principal (pergunta de confirmação; pendência de apenso bloqueia), excluir o principal com apensos, etiqueta ligada a status,
// edição do apenso (número obrigatório) e as pastas do número na tela de Publicações.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ_APENSO = '5000000-00.2026.8.26.0100';
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();

let d;
test.describe.configure({ timeout: 150_000 });
async function limpar() {
  await noBanco("DELETE FROM processos_etiquetas_escritorio WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402)))");
  await noBanco("DELETE FROM auditoria_etiqueta_escritorio WHERE modulo = 'processos' AND registro_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402)))");
  await noBanco("DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = 'processos' AND significado LIKE '%APE'");
  await noBanco("DELETE FROM tarefas WHERE titulo LIKE '%APE'");
  await noBanco("DELETE FROM publicacoes WHERE texto_hash = REPEAT('e', 64)");
  await noBanco("UPDATE tblproc SET apenso_de_id = NULL WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402))");
  await noBanco("DELETE FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7402)");
  await noBanco("DELETE FROM tblpasta WHERE numPasta = 7402");
  await noBanco("DELETE FROM tblstatusproc WHERE nome IN ('Arquivado APE')");
}
test.beforeAll(async () => { d = await prepararPastaPartes(); });
test.afterAll(async () => { await limpar(); await limparPastaPartes(d); });
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.arquivado = (await noBanco("INSERT INTO tblstatusproc (nome, encerra_processo, ativo) VALUES ('Arquivado APE', 1, 1)")).insertId;
  d.principal = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
});

// apenso já cadastrado no banco (autor e réu próprios), na pasta 7401, do processo 1
async function criarApensoNoBanco(numero = CNJ_APENSO, titulo = 'RECUPERACAO JUDICIAL DA EMPRESA BETA') {
  const id = (await noBanco("INSERT INTO tblproc (pasta_id, apenso_de_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
    [d.pastaPartes, d.principal, numero, titulo, d.tipo, d.statusConhecimento])).insertId;
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'juridica', ?, 1)", [id, d.reu2]);
  await noBanco("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'fisica', ?, 1)", [id, d.autor1]);
  return id;
}
async function abrirPasta(page) {
  await page.goto(`/processos/pasta/${d.pastaPartes}`); await aguardarTelaPronta(page);
  await expect(linha(page, CNJ1)).toBeVisible();
}
async function menuDaLinha(page, texto) {
  await linha(page, texto).getByRole('button', { name: /ações|⋮/i }).first().click();
}
const statusDe = async (id) => Number((await noBanco('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id);

test('@critical Criar apenso pelo menu do processo: número obrigatório, partes à mão, nasce na mesma pasta com a marca APENSO', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('menuitem', { name: /Criar apenso/ }).click();
  const jan = janela(page, 'Novo Apenso');
  await expect(jan).toBeVisible();
  await aguardarTelaPronta(page);
  await expect(jan.getByText(`Apenso do processo ${CNJ1}`)).toBeVisible();
  await expect(page.getByLabel('Número da Pasta')).toHaveCount(0);                                         // sempre a pasta do principal
  await expect(jan.getByLabel('Cliente do escritório', { exact: true })).toHaveValue('');                    // apenso é de outra pessoa
  const v = await violacoesGraves(page);
  expect.soft(v, JSON.stringify(v, null, 1)).toEqual([]);
  await jan.getByPlaceholder('Buscar e adicionar autor...').fill('Beta');
  await jan.getByLabel('Tipo de pessoa do autor').selectOption('juridica');
  await jan.getByPlaceholder('Buscar e adicionar autor...').fill('Empresa Beta');
  await page.getByText('Empresa Beta E2E Ltda').first().click();
  await jan.getByPlaceholder('Buscar e adicionar réu...').fill('Alberto');
  await jan.getByLabel('Tipo de pessoa do réu').selectOption('fisica');
  await jan.getByPlaceholder('Buscar e adicionar réu...').fill('Alberto');
  await page.getByText('Alberto Autor E2E').first().click();
  await jan.getByRole('button', { name: /Salvar|Criar/ }).click();
  await aviso(page, 'O número do processo do apenso é obrigatório');                                       // nada gravado
  expect((await noBanco('SELECT id FROM tblproc WHERE apenso_de_id IS NOT NULL')).length).toBe(0);
  await jan.getByLabel('Número do Processo (CNJ)').fill(CNJ_APENSO);
  await jan.getByRole('button', { name: /Salvar|Criar/ }).click();
  await aviso(page, 'Apenso criado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  const l = linha(page, CNJ_APENSO);
  await expect(l.locator('span', { hasText: 'APENSO' })).toBeVisible();
  const [ap] = await noBanco('SELECT apenso_de_id, pasta_id, cliente_polo FROM tblproc WHERE numProc = ?', [CNJ_APENSO]);
  expect(ap.apenso_de_id).toBe(d.principal); expect(ap.pasta_id).toBe(d.pastaPartes); expect(ap.cliente_polo).toBeNull();
  // o apenso não oferece "Criar apenso" (apenso de apenso não existe)
  await menuDaLinha(page, CNJ_APENSO);
  await expect(page.getByRole('menuitem', { name: /Criar apenso/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('@critical Lista de pastas conta só os processos comuns e mostra "+ N apenso(s)"', async ({ page }) => {
  await criarApensoNoBanco();
  await loginPelaTela(page);
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByPlaceholder(/Buscar|Pesquisar/).first().fill('7401');
  const l = page.locator('tbody tr').filter({ hasText: '7401' });
  await expect(l).toContainText('+ 1 apenso');
  await expect(l.locator('td').nth(0)).not.toContainText('apenso');
});

test('@critical Arquivar o processo principal: pergunta antes, Cancelar não grava; confirmando, o apenso arquiva junto', async ({ page }) => {
  const ap = await criarApensoNoBanco();
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('menuitem', { name: /Editar/ }).click();
  const jan = janela(page, 'Editar Processo');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await jan.getByLabel('Status').first().selectOption(String(d.arquivado)).catch(async () => {
    await jan.locator('select').filter({ has: page.locator(`option[value="${d.arquivado}"]`) }).first().selectOption(String(d.arquivado));
  });
  await jan.getByRole('button', { name: /Salvar/ }).click();
  await page.getByRole('button', { name: /Salvar|Confirmar/ }).last().click();   // pedido de motivo (opcional)
  const pergunta = janela(page, 'Arquivar também os apensos?');
  await expect(pergunta).toBeVisible();
  await expect(pergunta).toContainText(`1 apenso(s): ${CNJ_APENSO}`);
  await pergunta.getByRole('button', { name: 'Cancelar' }).click();
  expect(await statusDe(d.principal)).toBe(d.statusConhecimento); expect(await statusDe(ap)).toBe(d.statusConhecimento);   // nada gravado
  await jan.getByRole('button', { name: /Salvar/ }).click();
  await page.getByRole('button', { name: /Salvar|Confirmar/ }).last().click();
  await janela(page, 'Arquivar também os apensos?').getByRole('button', { name: 'Arquivar tudo' }).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  expect(await statusDe(d.principal)).toBe(d.arquivado); expect(await statusDe(ap)).toBe(d.arquivado);
});

test('@critical Apenso com pendência bloqueia o arquivamento do principal e a mensagem diz qual apenso', async ({ page }) => {
  const ap = await criarApensoNoBanco();
  await noBanco("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Tarefa do apenso APE', ?, 1, 0)", [ap]);
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('menuitem', { name: /Editar/ }).click();
  const jan = janela(page, 'Editar Processo');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await jan.locator('select').filter({ has: page.locator(`option[value="${d.arquivado}"]`) }).first().selectOption(String(d.arquivado));
  await jan.getByRole('button', { name: /Salvar/ }).click();
  await page.getByRole('button', { name: /Salvar|Confirmar/ }).last().click();
  await aviso(page, `o apenso ${CNJ_APENSO} — 1 tarefa em aberto`);
  expect(await statusDe(d.principal)).toBe(d.statusConhecimento); expect(await statusDe(ap)).toBe(d.statusConhecimento);
});

test('@critical Excluir o principal com apensos: segunda pergunta, e só então os dois saem', async ({ page }) => {
  const ap = await criarApensoNoBanco();
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('menuitem', { name: /Excluir/ }).click();
  await janela(page, 'Excluir Processo').getByRole('button', { name: /Excluir Processo/ }).click();
  const pergunta = janela(page, 'Excluir também os apensos?');
  await expect(pergunta).toBeVisible();
  await expect(pergunta).toContainText(CNJ_APENSO);
  await pergunta.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT id FROM tblproc WHERE id IN (?, ?)', [d.principal, ap])).length).toBe(2);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('menuitem', { name: /Excluir/ }).click();
  await janela(page, 'Excluir Processo').getByRole('button', { name: /Excluir Processo/ }).click();
  await janela(page, 'Excluir também os apensos?').getByRole('button', { name: /Excluir tudo/ }).click();
  await aviso(page, 'Processo e apensos excluídos');
  expect((await noBanco('SELECT id FROM tblproc WHERE id IN (?, ?)', [d.principal, ap])).length).toBe(0);
});

test('@critical Editar o apenso: aviso de apenso e número do processo obrigatório', async ({ page }) => {
  await criarApensoNoBanco();
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ_APENSO);
  await page.getByRole('menuitem', { name: /Editar/ }).click();
  const jan = janela(page, 'Editar Processo');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await expect(jan.getByText('Este processo é um APENSO')).toBeVisible();
  await jan.getByLabel('Número do Processo (CNJ)').fill('');
  await jan.getByRole('button', { name: /Salvar/ }).click();
  await aviso(page, 'O número do processo do apenso é obrigatório');
  expect((await noBanco('SELECT numProc FROM tblproc WHERE apenso_de_id IS NOT NULL'))[0].numProc).toBe(CNJ_APENSO);
});

test('@critical Publicação com número de apenso mostra TODAS as pastas em que ele está', async ({ page }) => {
  await criarApensoNoBanco();
  const pasta2 = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7402, 1)')).insertId;
  const comum2 = (await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, 'COMUM-7402-APE', 'COMUM DA OUTRA PASTA', ?, ?, 1, 1)", [pasta2, d.tipo, d.statusConhecimento])).insertId;
  await noBanco("INSERT INTO tblproc (pasta_id, apenso_de_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, ?, 'APENSO NA OUTRA PASTA', ?, ?, 1, 1)", [pasta2, comum2, CNJ_APENSO, d.tipo, d.statusConhecimento]);
  await noBanco("INSERT INTO publicacoes (fonte, data_publicacao, numero_processo, texto, texto_hash, escritorio) VALUES ('aasp', CURDATE(), ?, 'Publicacao do apenso APE', REPEAT('e', 64), 1)", [CNJ_APENSO]);
  await loginPelaTela(page);
  await page.goto('/publicacoes'); await aguardarTelaPronta(page);
  await expect(page.getByText('Pastas: 7401 (apenso) · 7402 (apenso)').or(page.getByText(/Pastas: .*7401.*7402/)).first()).toBeVisible({ timeout: 20000 });
});
