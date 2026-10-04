import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparExcluirRenumerar, loginPelaTela, prepararExcluirRenumerar, restaurarExcluirRenumerar, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo B4 (parte 1) do plano (PLANO-TESTES-PROCESSOS.md): EXCLUIR um processo dentro da pasta (confirmação, bloqueios, auditoria) e
// RENUMERAR a pasta (o lápis ✎ ao lado do número), com permissões, erros e acessibilidade.
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
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const linha = (page, cnj) => page.getByRole('row').filter({ hasText: cnj });
const confirmacao = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir Processo' }) });
const CASCA = '9200001-00.2026.5.15.0001';
const COM_AND = '9200002-00.2026.5.15.0001';

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { d = await prepararExcluirRenumerar(); });
test.afterAll(async () => { await limparExcluirRenumerar(d); });
test.beforeEach(async ({ page }) => { await restaurarExcluirRenumerar(d); await bloquearRedeExterna(page); });

async function abrirPasta(page, pastaId) {
  await page.goto(`/processos/pasta/${pastaId}`); await aguardarTelaPronta(page);
}
async function pedirExclusao(page, cnj) {
  await abrirMenuAcoes(page, linha(page, cnj));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await expect(confirmacao(page)).toBeVisible();
}

test('@critical Excluir processo: confirmação (Cancelar, ESC, clique fora) não apaga; confirmar apaga só a casca vazia, deixa auditoria e mantém a pasta', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaDuas);
  await pedirExclusao(page, CASCA);
  await expect(confirmacao(page).getByText('Tem certeza que deseja excluir este processo? Todos os dados vinculados serão removidos permanentemente.')).toBeVisible();
  await expect(confirmacao(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();          // o foco nasce no Cancelar (evita Enter acidental)
  await semViolacoes(page, 'confirmação de exclusão de processo');
  // Cancelar, ESC e clique fora fecham sem apagar
  await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmacao(page)).toHaveCount(0);
  await pedirExclusao(page, CASCA); await page.keyboard.press('Escape');
  await expect(confirmacao(page)).toHaveCount(0);
  await pedirExclusao(page, CASCA); await page.mouse.click(5, 5);
  await expect(confirmacao(page)).toHaveCount(0);
  expect(await noBanco('SELECT id FROM tblproc WHERE id = ?', [d.procCasca])).toHaveLength(1);
  // confirmar
  await pedirExclusao(page, CASCA);
  await confirmacao(page).getByRole('button', { name: /Excluir Processo/ }).click();
  await aviso(page, 'Processo excluído');
  await expect(confirmacao(page)).toHaveCount(0);
  await expect(linha(page, CASCA)).toHaveCount(0);                                                    // saiu da lista da pasta
  await expect(linha(page, COM_AND)).toBeVisible();                                                   // o outro processo continua
  expect(await noBanco('SELECT id FROM tblproc WHERE id = ?', [d.procCasca])).toHaveLength(0);
  for (const t of ['tbltituloprocautor', 'tbltituloprocreu']) expect(await noBanco(`SELECT id FROM ${t} WHERE proc_id = ?`, [d.procCasca])).toHaveLength(0);   // vínculos saíram
  expect(await noBanco('SELECT id FROM pessoas_fisicas WHERE id = ?', [d.autor1])).toHaveLength(1);                                                           // pessoas continuam
  expect(await noBanco('SELECT id FROM tblpasta WHERE id = ?', [d.pastaDuas])).toHaveLength(1);                                                                 // pasta continua
  const log = await noBanco("SELECT descricao, usuario_id FROM logs_auditoria WHERE tabela = 'tblproc' AND acao = 'excluir' AND registro_id = ?", [d.procCasca]);
  expect(log).toHaveLength(1);
  expect(log[0].descricao).toBe(`Processo ${CASCA}`);                                                  // a auditoria guarda o NÚMERO do que foi apagado
});

test('@critical Excluir processo: processo com andamento (trabalho ligado) é BLOQUEADO com a explicação, e nada é apagado', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaDuas);
  await pedirExclusao(page, COM_AND);
  await confirmacao(page).getByRole('button', { name: /Excluir Processo/ }).click();
  await aviso(page, 'Não é possível excluir este processo — ele possui: 1 andamento(s) processual(is). Remova esses registros antes de excluir o processo.');
  await expect(confirmacao(page)).toBeVisible();                                                      // a janela fica aberta para ler o motivo
  await expect(confirmacao(page).getByRole('button', { name: /Excluir Processo/ })).toBeEnabled();    // e dá para tentar de novo / cancelar
  await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(linha(page, COM_AND)).toBeVisible();
  expect(await noBanco('SELECT id FROM tblproc WHERE id = ?', [d.procComAndamento])).toHaveLength(1);
  expect(await noBanco('SELECT id FROM andamento_processual WHERE processo_id = ?', [d.procComAndamento])).toHaveLength(1);
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'tblproc' AND acao = 'excluir' AND registro_id = ?", [d.procComAndamento])).toHaveLength(0);
});

test('@critical Excluir processo: erro do servidor mostra o aviso e nada muda; excluir o ÚNICO processo da pasta funciona', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaUma);
  await page.route('**/api/processos/*', (rota) => rota.request().method() === 'DELETE'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await pedirExclusao(page, '9200003-00.2026.5.15.0001');
  await confirmacao(page).getByRole('button', { name: /Excluir Processo/ }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(confirmacao(page)).toBeVisible();
  await page.unroute('**/api/processos/*');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await confirmacao(page).getByRole('button', { name: /Excluir Processo/ }).click();                  // agora o servidor responde
  await aviso(page, 'Processo excluído');
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  expect(await noBanco('SELECT id FROM tblproc WHERE id = ?', [d.procUnico])).toHaveLength(0);
  expect(await noBanco('SELECT id FROM tblpasta WHERE id = ?', [d.pastaUma])).toHaveLength(1);       // a pasta continua (vazia), sem órfãos
  await semViolacoes(page, 'pasta sem processos depois de excluir o último');
});

test('@critical Excluir processo: sem a permissão de excluir o item nem aparece; com ela, aparece', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('soexclui_proc', [['processos', null, 'visualizar'], ['processos', null, 'excluir']]);
  await loginPelaTela(page, login);
  await abrirPasta(page, d.pastaDuas);
  await abrirMenuAcoes(page, linha(page, CASCA));
  await expect(page.getByRole('button', { name: /Excluir/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
});

// ------------------------------------------------------------------ renumerar a pasta
const lapis = (page) => page.getByTitle('Alterar número da pasta');
const campoNumero = (page) => page.getByRole('spinbutton');
const BADGE = (page, num) => page.getByText(`Pasta ${num}`, { exact: true });

test('@critical Renumerar pasta: o lápis abre o campo com o número atual; Enter/OK salva; ESC e ✕ cancelam; valida e recusa número em uso', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaDuas);
  await expect(BADGE(page, 7201)).toBeVisible();
  await lapis(page).click();
  await expect(campoNumero(page)).toHaveValue('7201');
  await expect(campoNumero(page)).toBeFocused();
  await semViolacoes(page, 'pasta com o número em edição');
  // ESC e ✕ cancelam sem gravar
  await campoNumero(page).fill('7290');
  await page.keyboard.press('Escape');
  await expect(campoNumero(page)).toHaveCount(0);
  await expect(BADGE(page, 7201)).toBeVisible();
  await lapis(page).click();
  await expect(campoNumero(page)).toHaveValue('7201');                                                // reabrir mostra o número salvo, não o rascunho
  await page.getByRole('button', { name: '✕' }).first().click();
  await expect(campoNumero(page)).toHaveCount(0);
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7201);
  // número inválido
  await lapis(page).click();
  await campoNumero(page).fill('0');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await aviso(page, 'Número de pasta inválido');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await campoNumero(page).fill('');
  await campoNumero(page).press('Enter');
  await aviso(page, 'Número de pasta inválido');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  // o mesmo número
  await campoNumero(page).fill('7201');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await aviso(page, 'A pasta já possui este número');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  // número que já é de outra pasta com processo ativo, e de pasta sem processos ativos mas com um processo inativado (7002 do B2): cada um com o seu motivo
  for (const [emUso, texto] of [['7203', 'O número 7203 já pertence a outra pasta. Escolha um número que não esteja em uso.'],
    ['7002', 'O número 7002 pertence a uma pasta sem processos ativos, mas ela ainda guarda 1 processo(s) inativado(s). Escolha outro número.']]) {
    await campoNumero(page).fill(emUso);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await aviso(page, texto);
    await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  }
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7201);
  // sucesso por OK
  await campoNumero(page).fill('7290');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await aviso(page, 'Número da pasta atualizado!');
  await expect(BADGE(page, 7290)).toBeVisible();
  await expect(campoNumero(page)).toHaveCount(0);
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7290);
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'renumerar' AND registro_id = ?", [d.pastaDuas])).toHaveLength(1);
  // sucesso por Enter (volta ao número antigo, que agora está livre)
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await lapis(page).click();
  await campoNumero(page).fill('7201');
  await campoNumero(page).press('Enter');
  await aviso(page, 'Número da pasta atualizado!');
  await expect(BADGE(page, 7201)).toBeVisible();
  // a lista de processos mostra o número novo
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await expect(page.getByRole('row').filter({ hasText: 'CASCA VAZIA E2E' }).or(page.getByRole('row').filter({ hasText: '7201' })).first()).toBeVisible();
});

test('@critical Renumerar pasta para o número de uma pasta TOTALMENTE vazia: reaproveita (a vazia sai); com área do direito ou tarefa ligada recusa dizendo o motivo', async ({ page }) => {
  const vazia = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7291, 1)')).insertId;
  const comArea = (await noBanco("INSERT INTO tblpasta (numPasta, area_direito, criado_por) VALUES (7292, 'Trabalhista', 1)")).insertId;
  const comTarefa = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7293, 1)')).insertId;
  await noBanco("INSERT INTO tarefas (titulo, criado_por, pasta_id) VALUES ('Tarefa presa E2E', 1, ?)", [comTarefa]);
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaDuas);
  await lapis(page).click();
  for (const [num, texto] of [['7292', 'O número 7292 pertence a uma pasta sem processos ativos, mas ela tem a área do direito preenchida (Trabalhista). Escolha outro número.'],
    ['7293', 'O número 7293 pertence a uma pasta sem processos ativos, mas ela tem 1 tarefa(s) ligada(s). Escolha outro número.']]) {
    await campoNumero(page).fill(num);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await aviso(page, texto);
    await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  }
  expect((await noBanco('SELECT id FROM tblpasta WHERE id IN (?, ?)', [comArea, comTarefa])).length).toBe(2);        // as recusadas continuam
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7201);       // e a pasta não mudou
  await campoNumero(page).fill('7291');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await aviso(page, 'Número da pasta atualizado!');
  await expect(BADGE(page, 7291)).toBeVisible();
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7291);
  expect(await noBanco('SELECT id FROM tblpasta WHERE id = ?', [vazia])).toHaveLength(0);                            // a vazia saiu
  expect(await noBanco('SELECT id FROM tblproc WHERE pasta_id = ?', [d.pastaDuas])).toHaveLength(2);                 // os processos continuam na pasta
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'tblpasta' AND acao = 'excluir' AND registro_id = ?", [vazia])).toHaveLength(1);
});

test('@critical Renumerar pasta: durante a gravação o botão fica travado ("...") e erro do servidor mantém o campo aberto', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, d.pastaDuas);
  await lapis(page).click();
  await campoNumero(page).fill('7290');
  await page.route('**/api/processos/pastas/*/renumerar', async (rota) => { await new Promise(r => setTimeout(r, 1500)); await rota.continue(); });
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('button', { name: '...', exact: true })).toBeDisabled();
  await aviso(page, 'Número da pasta atualizado!');
  await page.unroute('**/api/processos/pastas/*/renumerar');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await lapis(page).click();
  await campoNumero(page).fill('7201');
  await page.route('**/api/processos/pastas/*/renumerar', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await campoNumero(page).press('Enter');
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(campoNumero(page)).toHaveValue('7201');                                                // continua aberto, com o que foi digitado
  await page.unroute('**/api/processos/pastas/*/renumerar');
});

test('@critical Renumerar pasta: só aparece o lápis para quem tem a permissão de alterar pastas', async ({ page }) => {
  const sem = await criarUsuarioComPermissoes('semrenumerar_pasta', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, sem);
  await abrirPasta(page, d.pastaDuas);
  await expect(BADGE(page, 7201)).toBeVisible();
  await expect(lapis(page)).toHaveCount(0);
});

test('@critical Renumerar pasta: quem tem permissão de alterar pastas vê o lápis e consegue renumerar', async ({ page }) => {
  const com = await criarUsuarioComPermissoes('comrenumerar_pasta', [['processos', null, 'visualizar'], ['pastas', null, 'alterar']]);
  await loginPelaTela(page, com);
  await abrirPasta(page, d.pastaDuas);
  await lapis(page).click();
  await campoNumero(page).fill('7290');
  await campoNumero(page).press('Enter');
  await aviso(page, 'Número da pasta atualizado!');
  expect((await noBanco('SELECT numPasta FROM tblpasta WHERE id = ?', [d.pastaDuas]))[0].numPasta).toBe(7290);
});
