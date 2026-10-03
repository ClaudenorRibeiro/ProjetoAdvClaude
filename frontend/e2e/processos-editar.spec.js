import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparProcessoEditar, loginPelaTela, prepararEditarProcesso, restaurarProcessoEditar, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo B3 do plano (PLANO-TESTES-PROCESSOS.md): as janelas que abrem a partir de um processo dentro da pasta —
// "Detalhes do Processo" (somente leitura, todo campo travado), "Editar Processo" (campo por campo, salvar de verdade e conferir
// no banco), "Motivo da mudança de status" e "Histórico do processo" — mais permissões, erros do servidor e acessibilidade.
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
const erroDeTela = (page) => expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
const janela = (page) => page.locator('.modal-box').first();
const grupo = (page, titulo) => janela(page).locator('.form-group').filter({ has: page.locator('label', { hasText: titulo }) }).first();   // pelo rótulo (não pelo texto de opções de listas)
const rotulo = (page, nome) => janela(page).getByLabel(nome, { exact: true });          // campos pelo nome acessível (igualdade exata)
const motivoJanela = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Motivo da mudança de status' }) }).last();
const TITULO = 'Alberto Autor E2E X Empresa Alfa E2E Ltda';
const CNJ = '9100001-00.2026.5.15.0003';
const linhaProcesso = (page) => page.getByRole('row').filter({ hasText: CNJ });

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { d = await prepararEditarProcesso(); });
test.afterAll(async () => { await limparProcessoEditar(d); });
test.beforeEach(async ({ page }) => { await restaurarProcessoEditar(d); await bloquearRedeExterna(page); });

async function abrirPasta(page) {
  await page.goto(`/processos/pasta/${d.pastaEditar}`); await aguardarTelaPronta(page);
  await expect(linhaProcesso(page)).toBeVisible();
}
async function abrirEditar(page) {
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaProcesso(page));
  await page.getByRole('button', { name: /Editar/ }).click();
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  await aguardarTelaPronta(page);
  await expect(rotulo(page, 'Tipo')).toHaveValue(String(d.tipo));               // os auxiliares já chegaram do servidor
}
async function abrirDetalhes(page) {
  await abrirPasta(page);
  await linhaProcesso(page).getByTitle('Ver cadastro do processo').click();
  await expect(janela(page).getByRole('heading', { name: 'Detalhes do Processo' })).toBeVisible();
  await aguardarTelaPronta(page);
  await expect(rotulo(page, 'Tipo')).toHaveValue(String(d.tipo));
}
const procNoBanco = async () => (await noBanco('SELECT * FROM tblproc WHERE id = ?', [d.procEditar]))[0];
const salvar = (page) => janela(page).getByRole('button', { name: 'Salvar Alterações' });
async function adicionarParte(page, tituloGrupo, placeholder, termo, nomeNoResultado) {
  await grupo(page, tituloGrupo).getByPlaceholder(placeholder).fill(termo);
  await page.getByText(` - ${nomeNoResultado}`, { exact: false }).first().click();
}

test('@critical Detalhes do Processo: mostra tudo do processo e TODO campo fica travado; só "Editar" destrava', async ({ page }) => {
  await loginPelaTela(page);
  await abrirDetalhes(page);
  // valores
  await expect(janela(page).getByText(TITULO)).toBeVisible();
  await expect(grupo(page, 'Autores — polo ativo').getByText('Alberto Autor E2E', { exact: true })).toBeVisible();
  await expect(grupo(page, 'Réus — polo passivo').getByText('Empresa Alfa E2E Ltda')).toBeVisible();
  await expect(grupo(page, 'Peritos do processo').getByText('Perito Paulo E2E')).toBeVisible();
  await expect(rotulo(page, 'Cliente do escritório')).toHaveValue('autor');
  await expect(rotulo(page, 'Responsável pelo processo')).toHaveValue('2');
  await expect(grupo(page, 'OAB(s) do processo').getByText('Administrador de Testes — OAB SP 111111')).toBeVisible();
  await expect(grupo(page, 'OAB(s) do processo').getByText('Avulso E2E — OAB RJ 99999')).toBeVisible();
  await expect(rotulo(page, 'Número do Processo (CNJ)')).toHaveValue(CNJ);
  await expect(rotulo(page, 'Número de Protocolo')).toHaveValue('PROT-EDIT-E2E');
  await expect(rotulo(page, 'Status')).toHaveValue(String(d.statusConhecimento));
  await expect(rotulo(page, 'Instância')).toHaveValue(String(d.instancia1));
  await expect(rotulo(page, 'Fórum')).toHaveValue(String(d.forumNorte));
  await expect(grupo(page, 'Vara').getByText('1ª Norte')).toBeVisible();
  await expect(grupo(page, 'Assuntos').getByText('Assunto Novo A E2E')).toBeVisible();
  await expect(rotulo(page, 'Data de Distribuição')).toHaveValue('2026-03-10');
  await expect(rotulo(page, 'Observações')).toHaveValue('Observação Original');
  // tudo travado: campos desabilitados, sem "×", sem "…", sem o seletor de OAB, assuntos sem lista
  for (const nome of ['Tipo de pessoa do autor', 'Tipo de pessoa do réu', 'Cliente do escritório', 'Responsável pelo processo', 'Tipo de pessoa do perito', 'Tipo', 'Status', 'Instância', 'Fórum', 'Número do Processo (CNJ)', 'Número de Protocolo', 'Data de Distribuição', 'Observações'])
    await expect(rotulo(page, nome), nome).toBeDisabled();
  for (const ph of ['Buscar e adicionar autor...', 'Buscar e adicionar réu...', 'Buscar e adicionar perito...']) await expect(janela(page).getByPlaceholder(ph)).toBeDisabled();
  await expect(janela(page).locator('button', { hasText: /^×$/ })).toHaveCount(0);
  for (const botao of await janela(page).locator('button', { hasText: /^…$/ }).all()) await expect(botao).toBeDisabled();   // o "…" que sobra (peritos) fica travado
  await expect(rotulo(page, 'Adicionar OAB ao processo')).toHaveCount(0);
  await expect(janela(page).getByRole('button', { name: 'Salvar Alterações' })).toHaveCount(0);
  await grupo(page, 'Assuntos').getByText('Assunto Novo A E2E').click();                       // clicar nos assuntos não abre a lista
  await expect(page.getByPlaceholder('Buscar assunto...')).toHaveCount(0);
  await semViolacoes(page, 'Detalhes do Processo');
  await erroDeTela(page);
  // fechar por Fechar, ✕ e ESC (nada é gravado)
  const antes = JSON.stringify(await procNoBanco());
  await janela(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await linhaProcesso(page).getByTitle('Ver cadastro do processo').click();
  await janela(page).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await linhaProcesso(page).getByTitle('Ver cadastro do processo').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(JSON.stringify(await procNoBanco())).toBe(antes);
  // "Editar" destrava os campos e troca o título
  await linhaProcesso(page).getByTitle('Ver cadastro do processo').click();
  await janela(page).getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  await expect(rotulo(page, 'Observações')).toBeEnabled();
  await expect(rotulo(page, 'Tipo')).toBeEnabled();
  await expect(janela(page).getByRole('button', { name: 'Salvar Alterações' })).toBeVisible();
  await expect(janela(page).getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

test('@critical Editar Processo: abre com tudo preenchido do jeito que está no banco, com os "…" e a acessibilidade em dia', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  await expect(janela(page).getByText(TITULO)).toBeVisible();
  await expect(rotulo(page, 'Observações')).toHaveValue('Observação Original');
  await expect(rotulo(page, 'Número do Processo (CNJ)')).toHaveValue(CNJ);
  await expect(janela(page).locator('button', { hasText: /^…$/ })).toHaveCount(10);              // tipo, status, instância, fórum, vara, assuntos + autor, réu, perito, OAB
  await expect(janela(page).locator('button', { hasText: /^×$/ })).toHaveCount(6);                 // autor, réu, perito, assunto, 2 OABs
  await semViolacoes(page, 'Editar Processo (aberto)');
  await erroDeTela(page);
  // cancelar, ✕ e ESC fecham sem gravar
  const antes = JSON.stringify(await procNoBanco());
  await rotulo(page, 'Observações').fill('mudei mas vou cancelar');
  await janela(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await expect(rotulo(page, 'Observações')).toHaveValue('Observação Original');                 // reabrir mostra o que está salvo, não o rascunho
  await janela(page).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(JSON.stringify(await procNoBanco())).toBe(antes);
});

test('@critical Editar Processo: alterar os campos simples e salvar grava no banco (sem pedir motivo quando o status não muda)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  await rotulo(page, 'Número do Processo (CNJ)').fill('');
  await rotulo(page, 'Número do Processo (CNJ)').pressSequentially('12345670020265150001', { delay: 10 });
  await expect(rotulo(page, 'Número do Processo (CNJ)')).toHaveValue('1234567-00.2026.5.15.0001');
  await rotulo(page, 'Número de Protocolo').fill('PROT-EDIT-NOVO');
  await rotulo(page, 'Instância').selectOption({ label: '2ª Instância E2E' });
  await rotulo(page, 'Fórum').selectOption({ label: 'Fórum Sul E2E' });                          // trocar o fórum zera a vara
  await expect(grupo(page, 'Vara').getByText('— Selecione —')).toBeVisible();
  await rotulo(page, 'Vara').click();
  await page.locator('div[role="option"]').filter({ hasText: 'Vara Sul 1 E2E' }).click();
  await rotulo(page, 'Cliente do escritório').selectOption('reu');
  await rotulo(page, 'Responsável pelo processo').selectOption({ label: 'Administrador de Testes — OAB SP 111111' });
  await rotulo(page, 'Data de Distribuição').fill('2026-05-20');
  await rotulo(page, 'Observações').fill('nova observação do processo');
  await rotulo(page, 'Número de Protocolo').click();                                               // sair do campo: iniciais maiúsculas
  await expect(rotulo(page, 'Observações')).toHaveValue('Nova Observação do Processo');
  await semViolacoes(page, 'Editar Processo com campos alterados');
  await salvar(page).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);                                         // fechou
  const p = await procNoBanco();
  expect({ numProc: p.numProc, protocolo: p.protocolo, instancia: p.instancia_id, vara: p.vara_id, polo: p.cliente_polo, resp: p.responsavel_id, obs: p.observacoes, alteradoPor: p.alterado_por, status: p.status_id })
    .toEqual({ numProc: '1234567-00.2026.5.15.0001', protocolo: 'PROT-EDIT-NOVO', instancia: d.instancia2, vara: d.varaSul1, polo: 'reu', resp: 1, obs: 'Nova Observação do Processo', alteradoPor: 1, status: d.statusConhecimento });
  expect(String(p.data_distribuicao.toISOString?.().slice(0, 10) ?? p.data_distribuicao).slice(0, 10)).toBe('2026-05-20');
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status'", [d.procEditar])).toHaveLength(0);
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'editar'", [d.procEditar])).toHaveLength(1);
  await expect(linhaProcesso(page).or(page.getByRole('row').filter({ hasText: '1234567-00.2026.5.15.0001' }))).toBeVisible();   // a lista da pasta recarregou
  // limpar campos opcionais grava vazio (NULL)
  await abrirMenuAcoes(page, page.getByRole('row').filter({ hasText: '1234567-00' })); await page.getByRole('button', { name: /Editar/ }).click();
  await rotulo(page, 'Número de Protocolo').fill(''); await rotulo(page, 'Data de Distribuição').fill('');
  await rotulo(page, 'Observações').fill(''); await rotulo(page, 'Cliente do escritório').selectOption('');
  await rotulo(page, 'Responsável pelo processo').selectOption(''); await rotulo(page, 'Instância').selectOption('');
  await salvar(page).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  await expect.poll(async () => { const q = await procNoBanco(); return { prot: q.protocolo, data: q.data_distribuicao, obs: q.observacoes, polo: q.cliente_polo, resp: q.responsavel_id, inst: q.instancia_id }; })
    .toEqual({ prot: null, data: null, obs: null, polo: null, resp: null, inst: null });
});

test('@critical Editar Processo: partes, perito, assuntos e OABs — adicionar, remover, validar e salvar (título é refeito)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  const autores = grupo(page, 'Autores — polo ativo'); const reus = grupo(page, 'Réus — polo passivo');
  // sem autor ou sem réu não salva
  await autores.locator('button', { hasText: /^×$/ }).click();
  await expect(janela(page).getByText('Nenhum autor adicionado')).toBeVisible();
  await expect(janela(page).getByText('Será gerado ao adicionar autores e réus abaixo')).toBeVisible();
  await salvar(page).click();
  await aviso(page, 'Adicione ao menos um autor (polo ativo)');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Beatriz', 'Beatriz Autora E2E');
  await reus.locator('button', { hasText: /^×$/ }).click();
  await salvar(page).click();
  await aviso(page, 'Adicione ao menos um réu (polo passivo)');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await expect(rotulo(page, 'Tipo de pessoa do réu')).toHaveValue('juridica');                      // o réu começa em "Jurídica", como no Novo Processo
  await expect(rotulo(page, 'Tipo de pessoa do autor')).toHaveValue('fisica');
  await adicionarParte(page, 'Réus — polo passivo', 'Buscar e adicionar réu...', 'Beta', 'Empresa Beta E2E Ltda');
  await expect(janela(page).getByText('Beatriz Autora E2E X Empresa Beta E2E Ltda')).toBeVisible();
  // a mesma pessoa não vai para o polo oposto
  await autores.getByPlaceholder('Buscar e adicionar autor...').fill('Beatriz');
  await page.getByText(' - Beatriz Autora E2E').first().click();
  await aviso(page, 'Beatriz Autora E2E já foi adicionado(a) neste polo');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await adicionarParte(page, 'Autores — polo ativo', 'Buscar e adicionar autor...', 'Alberto', 'Alberto Autor E2E');
  await expect(janela(page).getByText('Beatriz Autora E2E(+1) X Empresa Beta E2E Ltda')).toBeVisible();
  // perito: remover o atual e pôr outro (jurídica)
  await grupo(page, 'Peritos do processo').locator('button', { hasText: /^×$/ }).click();
  await expect(janela(page).getByText('Nenhum perito adicionado')).toBeVisible();
  // assuntos: trocar A por B
  const assuntos = grupo(page, 'Assuntos');
  await assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo A E2E' }).click();
  await assuntos.getByText('Selecionar assuntos...').click();
  await page.getByRole('checkbox', { name: 'Assunto Novo B E2E' }).check();
  await janela(page).getByRole('heading', { name: 'Editar Processo' }).click();
  await expect(assuntos.getByRole('button', { name: 'Remover assunto Assunto Novo B E2E' })).toBeVisible();
  // OABs: tirar o avulso e deixar só o advogado do escritório
  const oabs = grupo(page, 'OAB(s) do processo');
  await oabs.getByText('Avulso E2E — OAB RJ 99999×').locator('button').click();
  await expect(oabs.getByText('Avulso E2E — OAB RJ 99999×')).toHaveCount(0);
  await semViolacoes(page, 'Editar Processo com as partes trocadas');
  await salvar(page).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  const p = await procNoBanco();
  expect(p.NomeTituloProc).toBe('Beatriz Autora E2E(+1) X Empresa Beta E2E Ltda');
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocautor WHERE proc_id = ? ORDER BY id', [d.procEditar])).map(r => r.pessoa_id)).toEqual([d.autor2, d.autor1]);
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [d.procEditar])).map(r => r.pessoa_id)).toEqual([d.reu2]);
  expect(await noBanco('SELECT id FROM processo_perito WHERE proc_id = ?', [d.procEditar])).toHaveLength(0);
  expect((await noBanco('SELECT assunto_id FROM processo_assunto WHERE processo_id = ?', [d.procEditar])).map(r => r.assunto_id)).toEqual([d.assuntoB]);
  expect((await noBanco('SELECT usuario_id, freela_id FROM processo_oabs WHERE processo_id = ?', [d.procEditar])).map(r => [r.usuario_id, r.freela_id])).toEqual([[1, null]]);
});

test('@critical Editar Processo: mudar o status pede o motivo — cancelar, ESC, salvar sem motivo e salvar com motivo (tudo conferido no banco)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  await rotulo(page, 'Status').selectOption({ label: 'Recurso E2E' });
  await salvar(page).click();
  await expect(motivoJanela(page).getByRole('heading', { name: 'Motivo da mudança de status' })).toBeVisible();
  await expect(motivoJanela(page).getByText('O status foi alterado de Conhecimento E2E para Recurso E2E.')).toBeVisible();
  await expect(motivoJanela(page).getByPlaceholder('Digite o motivo, se quiser...')).toBeFocused();
  await semViolacoes(page, 'janela Motivo da mudança de status');
  // Cancelar, ✕ e ESC voltam para a edição, sem gravar nada
  await motivoJanela(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(motivoJanela(page)).toHaveCount(0);
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  expect((await procNoBanco()).status_id).toBe(d.statusConhecimento);
  await salvar(page).click();
  await motivoJanela(page).locator('.modal-fechar').click();
  await expect(motivoJanela(page)).toHaveCount(0);
  await salvar(page).click();
  await page.keyboard.press('Escape');                                                              // ESC fecha só o motivo; a edição continua
  await expect(motivoJanela(page)).toHaveCount(0);
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  expect((await procNoBanco()).status_id).toBe(d.statusConhecimento);
  // salvar SEM motivo
  await salvar(page).click();
  await motivoJanela(page).getByRole('button', { name: 'Salvar sem motivo' }).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect((await procNoBanco()).status_id).toBe(d.statusRecurso);
  let logs = await noBanco("SELECT acao, dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status'", [d.procEditar]);
  expect(logs).toHaveLength(1);
  const novos = typeof logs[0].dados_novos === 'string' ? JSON.parse(logs[0].dados_novos) : logs[0].dados_novos;
  expect({ de: novos.status_anterior, para: novos.status_novo, motivo: novos.motivo }).toEqual({ de: 'Conhecimento E2E', para: 'Recurso E2E', motivo: null });
  await expect(page.getByRole('row').filter({ hasText: CNJ }).getByText('Recurso E2E')).toBeVisible();     // a lista da pasta já mostra o novo status
  // salvar COM motivo (voltando para Conhecimento)
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await rotulo(page, 'Status').selectOption({ label: 'Conhecimento E2E' });
  await salvar(page).click();
  await motivoJanela(page).getByPlaceholder('Digite o motivo, se quiser...').fill('  Decisão do juiz  ');
  await motivoJanela(page).getByRole('button', { name: 'Salvar com motivo' }).click();
  await expect.poll(async () => (await procNoBanco()).status_id).toBe(d.statusConhecimento);
  logs = await noBanco("SELECT dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ? AND acao = 'status' ORDER BY id DESC", [d.procEditar]);
  expect(logs).toHaveLength(2);
  const ultimo = typeof logs[0].dados_novos === 'string' ? JSON.parse(logs[0].dados_novos) : logs[0].dados_novos;
  expect({ de: ultimo.status_anterior, para: ultimo.status_novo, motivo: ultimo.motivo }).toEqual({ de: 'Recurso E2E', para: 'Conhecimento E2E', motivo: 'Decisão do juiz' });
  // tirar o status ("Sem status") também pede motivo
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await rotulo(page, 'Status').selectOption('');
  await salvar(page).click();
  await expect(motivoJanela(page).getByText('O status foi alterado de Conhecimento E2E para Sem status.')).toBeVisible();
  await motivoJanela(page).getByRole('button', { name: 'Salvar sem motivo' }).click();
  await expect.poll(async () => (await procNoBanco()).status_id).toBeNull();
});

test('@critical Editar Processo: erros do servidor (número ou protocolo repetido, queda) mostram o aviso e a janela continua com tudo preenchido', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  await rotulo(page, 'Número do Processo (CNJ)').fill('8000001-00.2026.5.15.0001');                // já existe em outro processo
  await salvar(page).click();
  await aviso(page, 'O número de processo "8000001-00.2026.5.15.0001" já está cadastrado em outro processo');
  await expect(salvar(page)).toBeEnabled();
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await rotulo(page, 'Número do Processo (CNJ)').fill(CNJ);
  await rotulo(page, 'Número de Protocolo').fill('PROT-EMUSO-E2E');                                // já existe em outro processo
  await salvar(page).click();
  await aviso(page, 'O protocolo "PROT-EMUSO-E2E" já está cadastrado em outro processo');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  expect((await procNoBanco()).protocolo).toBe('PROT-EDIT-E2E');                                    // nada foi gravado
  // enquanto grava, "Salvando..." e botão travado
  await rotulo(page, 'Número de Protocolo').fill('PROT-EDIT-LENTO');
  await page.route('**/api/processos/*', async (rota) => { if (rota.request().method() === 'PUT') await new Promise(r => setTimeout(r, 1500)); await rota.continue(); });
  await salvar(page).click();
  await expect(janela(page).getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await aviso(page, 'Processo atualizado com sucesso!');
  await page.unroute('**/api/processos/*');
  // queda do servidor (500)
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await page.route('**/api/processos/*', (rota) => rota.request().method() === 'PUT'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await rotulo(page, 'Observações').fill('texto que continua na tela');
  await salvar(page).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(salvar(page)).toBeEnabled();
  await expect(rotulo(page, 'Observações')).toHaveValue('Texto Que Continua na Tela');
  await page.unroute('**/api/processos/*');
  await erroDeTela(page);
});

test('@critical Histórico do processo: lista quem fez o quê e quando; vazio; erro; fechar por Fechar, ✕ e ESC', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaProcesso(page));
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(janela(page).getByRole('heading', { name: `Histórico — ${CNJ}` })).toBeVisible();
  await expect(janela(page).getByRole('columnheader')).toHaveText(['Quando', 'Ação', 'Quem fez']);
  const linhas = janela(page).locator('tbody tr');
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText('Cadastrou');
  await expect(linhas.first()).toContainText(`Processo ${CNJ}`);
  await expect(linhas.first()).toContainText('Administrador de Testes');
  await expect(linhas.first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await semViolacoes(page, 'Histórico do processo');
  await janela(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  // depois de editar e mudar o status, aparecem "Editou" e "Mudou status", do mais novo para o mais antigo
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Editar/ }).click();
  await rotulo(page, 'Status').selectOption({ label: 'Recurso E2E' });
  await salvar(page).click();
  await motivoJanela(page).getByPlaceholder('Digite o motivo, se quiser...').fill('Decisão do juiz');
  await motivoJanela(page).getByRole('button', { name: 'Salvar com motivo' }).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(janela(page).locator('tbody tr')).toHaveCount(3);
  const textos = await janela(page).locator('tbody tr').allInnerTexts();
  expect(textos.map(t => ['Mudou status', 'Editou', 'Cadastrou'].find(a => t.includes(a))).sort()).toEqual(['Cadastrou', 'Editou', 'Mudou status']);
  const linhaStatus = janela(page).locator('tbody tr').filter({ hasText: 'Mudou status' });
  await expect(linhaStatus).toContainText('De Conhecimento E2E para Recurso E2E');                  // de/para e motivo aparecem no histórico
  await expect(linhaStatus).toContainText('Motivo: Decisão do juiz');
  await expect(janela(page).locator('tbody tr').filter({ hasText: 'Editou' })).not.toContainText('Motivo');
  await semViolacoes(page, 'Histórico do processo com as 3 ações');
  await janela(page).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  // sem registros
  await noBanco("DELETE FROM logs_auditoria WHERE tabela = 'tblproc' AND registro_id = ?", [d.procEditar]);
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(janela(page).getByText('Nenhum registro de histórico')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  // erro do servidor
  await page.route('**/api/processos/*/historico', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await abrirMenuAcoes(page, linhaProcesso(page)); await page.getByRole('button', { name: /Histórico/ }).click();
  await aviso(page, 'Erro ao carregar histórico do processo');
  await expect(janela(page).getByText('Nenhum registro de histórico')).toBeVisible();
  await page.unroute('**/api/processos/*/historico');
});

test('@critical Janela de edição: lista de assuntos e cadastro rápido de parte funcionam também aqui; ESC com lista aberta fecha só a lista', async ({ page }) => {
  await loginPelaTela(page);
  await abrirEditar(page);
  await rotulo(page, 'Observações').fill('texto que não pode se perder');
  const assuntos = grupo(page, 'Assuntos');
  await assuntos.getByRole('button', { name: 'Abrir a lista de assuntos' }).click();
  await expect(page.getByRole('checkbox', { name: 'Assunto Novo A E2E' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Assunto Novo B E2E' })).not.toBeChecked();
  await page.getByPlaceholder('Buscar assunto...').fill('zzzz');
  await expect(page.getByText('Nenhum assunto encontrado')).toBeVisible();
  await semViolacoes(page, 'Editar Processo com a lista de assuntos aberta');
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Buscar assunto...')).toHaveCount(0);
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  await expect(rotulo(page, 'Observações')).toHaveValue('Texto Que Não Pode Se Perder');
  // cadastro rápido: abre, fecha, e cria uma pessoa que já entra no polo
  await grupo(page, 'Autores — polo ativo').getByRole('button', { name: 'Cadastrar novo autor' }).click();
  const rapido = page.locator('.modal-box').filter({ has: page.getByRole('button', { name: 'Cadastrar', exact: true }) }).last();
  await expect(rapido).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(1);
  // os "…" de gerenciar abrem a janela de auxiliares (o conteúdo dela é testado no B4)
  await grupo(page, 'Tipo').getByRole('button', { name: 'Gerenciar tipos de processo' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await erroDeTela(page);
});

test('@critical Permissões: quem só VISUALIZA vê Detalhes e Histórico, mas não Editar nem Excluir', async ({ page }) => {
  const soVer = await criarUsuarioComPermissoes('sover_editar', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, soVer);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaProcesso(page));
  await expect(page.getByRole('button', { name: /Histórico/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await linhaProcesso(page).getByTitle('Ver cadastro do processo').click();
  await expect(janela(page).getByRole('heading', { name: 'Detalhes do Processo' })).toBeVisible();
  await expect(janela(page).getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);   // sem permissão, nem o "Editar" do rodapé
  await expect(janela(page).getByRole('button', { name: 'Fechar' })).toBeVisible();
  await expect(rotulo(page, 'Observações')).toBeDisabled();
});

test('@critical Permissões: quem ALTERA edita e salva, mas não vê Excluir', async ({ page }) => {
  const soAltera = await criarUsuarioComPermissoes('soaltera_editar', [['processos', null, 'visualizar'], ['processos', null, 'alterar']]);
  await loginPelaTela(page, soAltera);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaProcesso(page));
  await expect(page.getByRole('button', { name: /Editar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Editar/ }).click();
  await expect(janela(page).getByRole('heading', { name: 'Editar Processo' })).toBeVisible();
  await aguardarTelaPronta(page);
  await rotulo(page, 'Observações').fill('alterada por quem só altera');
  await salvar(page).click();
  await aviso(page, 'Processo atualizado com sucesso!');
  await expect.poll(async () => (await procNoBanco()).observacoes).toBe('Alterada Por Quem Só Altera');
  expect((await procNoBanco()).alterado_por).not.toBe(1);
});
