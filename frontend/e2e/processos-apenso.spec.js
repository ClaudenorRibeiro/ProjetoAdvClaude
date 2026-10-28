import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
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
test.describe.configure({ timeout: 60_000 });
async function limpar() {
  await noBanco("DELETE FROM processos_etiquetas_escritorio WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402)))");
  await noBanco("DELETE FROM auditoria_etiqueta_escritorio WHERE modulo = 'processos' AND registro_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402)))");
  await noBanco("DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = 'processos' AND significado LIKE '%APE'");
  await noBanco("DELETE FROM tarefas WHERE titulo LIKE '%APE'");
  await noBanco("DELETE FROM publicacoes WHERE texto_hash = REPEAT('e', 64)");
  await noBanco("UPDATE tblproc SET apenso_de_id = NULL WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (7401, 7402))");
  for (const t of ['tbltituloprocautor', 'tbltituloprocreu']) await noBanco(`DELETE FROM ${t} WHERE proc_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7402))`);
  await noBanco("DELETE FROM processo_assunto WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7402))");
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
  await abrirMenuAcoes(page, linha(page, texto).first());
}
const statusDe = async (id) => Number((await noBanco('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id);

test('@critical Criar apenso pelo menu do processo: número obrigatório, partes à mão, nasce na mesma pasta com a marca APENSO', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('button', { name: /Criar apenso$/ }).click();
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
  await jan.locator('div[style*="cursor: pointer"]').filter({ hasText: 'Empresa Beta E2E Ltda' }).first().click();
  await jan.getByPlaceholder('Buscar e adicionar réu...').fill('Alberto');
  await jan.getByLabel('Tipo de pessoa do réu').selectOption('fisica');
  await jan.getByPlaceholder('Buscar e adicionar réu...').fill('Alberto');
  await jan.locator('div[style*="cursor: pointer"]').filter({ hasText: 'Alberto Autor E2E' }).first().click();
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
  await expect(page.getByRole('button', { name: /Criar apenso$/ })).toHaveCount(0);
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
  await page.getByRole('button', { name: /Editar$/ }).click();
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
  await page.getByRole('button', { name: /Editar$/ }).click();
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
  await page.getByRole('button', { name: /Excluir$/ }).click();
  await janela(page, 'Excluir Processo').getByRole('button', { name: /Excluir Processo/ }).click();
  const pergunta = janela(page, 'Excluir também os apensos?');
  await expect(pergunta).toBeVisible();
  await expect(pergunta).toContainText(CNJ_APENSO);
  await pergunta.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT id FROM tblproc WHERE id IN (?, ?)', [d.principal, ap])).length).toBe(2);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('button', { name: /Excluir$/ }).click();
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
  await page.getByRole('button', { name: /Editar$/ }).click();
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

// ---- o mesmo apenso em várias pastas: as mesmas informações (vara/fórum, tipo, instância, assuntos, data, protocolo)
// O apenso já existe na pasta 7402 (vara do Fórum Sul, 2ª instância, protocolo PROT-E2E); o autor de lá é a "Empresa Beta" e o réu é o "Alberto".
async function idPorNome(tabela, nome) { return (await noBanco(`SELECT id FROM ${tabela} WHERE nome = ?`, [nome]))[0].id; }
async function apensoNaOutraPasta() {
  d.varaSul1 = await idPorNome('tblvara', 'Vara Sul 1 E2E');
  d.instancia2 = await idPorNome('tblinstanciaproc', '2ª Instância E2E');
  d.assuntoA = await idPorNome('tblassuntoproc', 'Assunto Novo A E2E');
  const pasta2 = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7402, 1)')).insertId;
  const comum2 = (await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, 'COMUM-7402-APE', 'COMUM DA OUTRA PASTA', ?, ?, 1, 1)", [pasta2, d.tipo, d.statusConhecimento])).insertId;
  const id = (await noBanco(
    `INSERT INTO tblproc (pasta_id, apenso_de_id, numProc, protocolo, NomeTituloProc, vara_id, tipo_id, status_id, instancia_id, data_distribuicao, ativo, criado_por)
     VALUES (?, ?, ?, 'PROT-E2E', 'APENSO NA OUTRA PASTA', ?, ?, ?, ?, '2026-02-15', 1, 1)`,
    [pasta2, comum2, CNJ_APENSO, d.varaSul1, d.tipo, d.statusConhecimento, d.instancia2])).insertId;
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'juridica', ?, 1)", [id, d.reu2]);
  await noBanco("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'fisica', ?, 1)", [id, d.autor1]);
  await noBanco('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [id, d.assuntoA]);
  return id;
}

test('@critical Novo apenso com número que já existe em outra pasta: vem tudo preenchido (partes só como sugestão invertida); mudar um dado pede confirmação e vale para as duas pastas', async ({ page }) => {
  const outro = await apensoNaOutraPasta();
  await loginPelaTela(page);
  await abrirPasta(page);
  await menuDaLinha(page, CNJ1);
  await page.getByRole('button', { name: /Criar apenso$/ }).click();
  const jan = janela(page, 'Novo Apenso');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await expect(jan.getByTestId('apenso-ja-existe')).toHaveCount(0);                                          // antes de digitar o número, nada
  await jan.getByLabel('Número do Processo (CNJ)').fill(CNJ_APENSO);
  const banner = jan.getByTestId('apenso-ja-existe');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('na pasta 7402');
  await expect(jan.getByText('Vara Sul 1 E2E').first()).toBeVisible();                                        // vara e fórum do apenso
  await expect(jan.getByText('Fórum Sul E2E').first()).toBeVisible();
  await expect(jan.getByLabel('Número de Protocolo')).toHaveValue('PROT-E2E');
  await expect(jan.locator('input[type="date"]')).toHaveValue('2026-02-15');
  await expect(jan.getByText('Nenhum autor adicionado')).toBeVisible();                                        // polo invertido: o autor de lá vem como RÉU
  await expect(jan.getByText('Empresa Beta E2E Ltda')).toBeVisible();
  const v = await violacoesGraves(page);
  expect.soft(v, JSON.stringify(v, null, 1)).toEqual([]);
  await jan.getByPlaceholder('Buscar e adicionar autor...').fill('Alberto');
  await jan.locator('div[style*="cursor: pointer"]').filter({ hasText: 'Alberto Autor E2E' }).first().click();
  // mudar o protocolo: o sistema avisa que vale para a outra pasta; Cancelar não grava nada
  await jan.getByLabel('Número de Protocolo').fill('PROT-E2E-2');
  await jan.getByRole('button', { name: /Salvar|Criar/ }).click();
  const dialogo = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Alterar também nas outras pastas?' }) }).last();
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('7402');
  await expect(dialogo).toContainText('número de protocolo');
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT id FROM tblproc WHERE apenso_de_id IS NOT NULL AND pasta_id = ?', [d.pastaPartes])).length).toBe(0);
  expect((await noBanco('SELECT protocolo FROM tblproc WHERE id = ?', [outro]))[0].protocolo).toBe('PROT-E2E');
  // confirmando: grava e leva o protocolo à outra pasta (os réus de lá não mudam)
  await jan.getByRole('button', { name: /Salvar|Criar/ }).click();
  await page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Alterar também nas outras pastas?' }) }).last().getByRole('button', { name: 'Sim, alterar em todas' }).click();
  await aviso(page, 'Apenso criado com sucesso!');
  const linhas = await noBanco('SELECT id, pasta_id, protocolo, vara_id, instancia_id FROM tblproc WHERE numProc = ? AND apenso_de_id IS NOT NULL', [CNJ_APENSO]);
  expect(linhas.length).toBe(2);
  for (const l of linhas) { expect(l.protocolo).toBe('PROT-E2E-2'); expect(l.vara_id).toBe(d.varaSul1); expect(l.instancia_id).toBe(d.instancia2); }
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [outro])).map(r => r.pessoa_id)).toEqual([d.autor1]);
});

test('@critical Apenso que não é novo: sem mudar nada passa direto; editar dado compartilhado pergunta antes e iguala as pastas; campo livre (observações) não pergunta', async ({ page }) => {
  const outro = await apensoNaOutraPasta();
  const aqui = (await noBanco(
    `INSERT INTO tblproc (pasta_id, apenso_de_id, numProc, protocolo, NomeTituloProc, vara_id, tipo_id, status_id, instancia_id, data_distribuicao, ativo, criado_por)
     VALUES (?, ?, ?, 'PROT-E2E', 'APENSO AQUI', ?, ?, ?, ?, '2026-02-15', 1, 1)`,
    [d.pastaPartes, d.principal, CNJ_APENSO, d.varaSul1, d.tipo, d.statusConhecimento, d.instancia2])).insertId;
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'juridica', ?, 1)", [aqui, d.reu2]);
  await noBanco("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id, criado_por) VALUES (?, 'fisica', ?, 1)", [aqui, d.autor1]);
  await noBanco('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [aqui, d.assuntoA]);
  await loginPelaTela(page);
  await abrirPasta(page);
  // observações: livre, salva sem pergunta e a outra pasta não muda
  await menuDaLinha(page, CNJ_APENSO);
  await page.getByRole('button', { name: /Editar$/ }).click();
  let jan = janela(page, 'Editar Processo');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await jan.getByLabel('Observações').fill('só desta pasta');
  await jan.getByRole('button', { name: /Salvar/ }).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  expect((await noBanco('SELECT observacoes FROM tblproc WHERE id = ?', [outro]))[0].observacoes).toBeNull();
  // protocolo: pergunta antes; confirmando, a outra pasta fica igual
  await abrirPasta(page);
  await menuDaLinha(page, CNJ_APENSO);
  await page.getByRole('button', { name: /Editar$/ }).click();
  jan = janela(page, 'Editar Processo');
  await expect(jan).toBeVisible(); await aguardarTelaPronta(page);
  await jan.getByLabel('Número de Protocolo').fill('PROT-NOVO-E2E');
  await jan.getByRole('button', { name: /Salvar/ }).click();
  const dialogo = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Alterar também nas outras pastas?' }) }).last();
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('7402');
  expect((await noBanco('SELECT protocolo FROM tblproc WHERE id = ?', [aqui]))[0].protocolo).toBe('PROT-E2E');   // nada gravado ainda
  await dialogo.getByRole('button', { name: 'Sim, alterar em todas' }).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  for (const id of [aqui, outro]) expect((await noBanco('SELECT protocolo FROM tblproc WHERE id = ?', [id]))[0].protocolo).toBe('PROT-NOVO-E2E');
});
