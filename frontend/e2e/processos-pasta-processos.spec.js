import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C2 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Processos" da tela da pasta — a tabela (título, número CNJ copiável, protocolo,
// tipo, status, instância, vara/fórum), as etiquetas do escritório (legenda, bolinha, menu, status ligado à cor com pedido de motivo,
// histórico da etiqueta) e o botão "+ Novo Processo (mesma pasta)" com as partes herdadas e o "Novas Partes".
// (Editar, Excluir, Histórico do processo e Detalhes já são cobertos nos passos B3 e B4.)
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
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ2 = '9400002-00.2026.5.15.0001';
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });

let d;
test.describe.configure({ timeout: 150_000 });
async function limparC2() {
  await noBanco("DELETE FROM auditoria_etiqueta_escritorio WHERE modulo = 'processos' AND registro_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM processos_etiquetas_escritorio WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM etiquetas_escritorio_catalogo WHERE modulo = 'processos' AND significado LIKE '%C2'");
  await noBanco("DELETE FROM tarefas WHERE titulo = 'Pendente que trava o arquivamento C2'");
  await noBanco("DELETE FROM tblstatusproc WHERE nome IN ('Recurso C2', 'Arquivo C2')");
}
test.beforeAll(async () => { d = await prepararPastaPartes(); });
test.afterAll(async () => { await limparC2(); await limparPastaPartes(d); });
test.beforeEach(async ({ page, context }) => {
  await limparC2();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // 2 processos extras: só com protocolo e sem nenhum número; vara/fórum/instância no processo 1; catálogo de etiquetas do escritório
  d.statusRecursoC2 = (await noBanco("INSERT INTO tblstatusproc (nome, ativo) VALUES ('Recurso C2', 1)")).insertId;
  d.instancia1 = (await noBanco("SELECT id FROM tblinstanciaproc WHERE nome = '1ª Instância E2E'"))[0].id;
  d.varaNorte1 = (await noBanco("SELECT id FROM tblvara WHERE nome = 'Vara Norte 1 E2E'"))[0].id;
  await noBanco('UPDATE tblproc SET vara_id = ?, instancia_id = ? WHERE numProc = ?', [d.varaNorte1, d.instancia1, CNJ1]);
  await noBanco("UPDATE tblproc SET cliente_polo = 'reu' WHERE numProc = ?", [CNJ2]);
  await noBanco("INSERT INTO tblproc (pasta_id, numProc, protocolo, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, NULL, 'PROT-C2-E2E', 'SO PROTOCOLO C2', ?, ?, 1, 1)", [d.pastaPartes, d.tipo, d.statusConhecimento]);
  await noBanco("INSERT INTO tblproc (pasta_id, numProc, protocolo, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, NULL, NULL, 'SEM NUMERO C2', NULL, NULL, 1, 1)", [d.pastaPartes]);
  await noBanco("INSERT INTO etiquetas_escritorio_catalogo (modulo, slot, cor, significado, status_id) VALUES ('processos', 3, '#639922', 'Arquivada C2', NULL), ('processos', 4, '#ef9f27', 'Em recurso C2', ?), ('processos', 5, '#378add', 'Livre C2', NULL) ON DUPLICATE KEY UPDATE cor = VALUES(cor), significado = VALUES(significado), status_id = VALUES(status_id)", [d.statusRecursoC2]);
});

async function abrirPasta(page) {
  await page.goto(`/processos/pasta/${d.pastaPartes}`); await aguardarTelaPronta(page);
  await expect(linha(page, CNJ1)).toBeVisible();
}
const procId = async (cnj) => (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [cnj]))[0].id;
const slotNoBanco = async (cnj) => (await noBanco('SELECT slot FROM processos_etiquetas_escritorio WHERE processo_id = ?', [await procId(cnj)])).map(r => Number(r.slot));
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());

test('@critical Aba Processos: tabela com título, número CNJ (copiável), protocolo, tipo, status, instância e vara/fórum de cada processo', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Título', 'Número CNJ', 'Tipo', 'Status', 'Instância', 'Vara / Fórum', 'Etiq. Escrit.', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  const l1 = linha(page, CNJ1);
  await expect(l1).toContainText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda(+1)');
  await expect(l1.locator('.badge-azul')).toHaveText('Trabalhista E2E');
  await expect(l1.locator('.badge-cinza')).toHaveText('Conhecimento E2E');
  await expect(l1).toContainText('1ª Instância E2E');
  await expect(l1).toContainText('1ª Norte');
  await expect(l1).toContainText('Fórum Norte E2E');
  await expect(linha(page, CNJ2)).toContainText('—');                                                    // sem instância/vara
  const protocolo = linha(page, 'SO PROTOCOLO C2');
  await expect(protocolo).toContainText('Protocolo: PROT-C2-E2E');
  const nenhum = linha(page, 'SEM NUMERO C2');
  await expect(nenhum.locator('.badge-azul')).toHaveCount(0);                                              // sem tipo e sem status
  await expect(nenhum.locator('.badge-cinza')).toHaveCount(0);
  // clicar no número copia (balão vira "Copiado!!")
  await l1.getByText(CNJ1, { exact: true }).click();
  await expect(l1.getByText('Copiado!')).toBeVisible();
  expect(await clipboard(page)).toBe(CNJ1);
  await esperarSemAviso(page);
  await protocolo.getByText('PROT-C2-E2E', { exact: true }).click();
  expect(await clipboard(page)).toBe('PROT-C2-E2E');
  await semViolacoes(page, 'aba Processos da pasta com 4 processos');
  // clicar no título abre os Detalhes (somente leitura)
  await l1.getByTitle('Ver cadastro do processo').click();
  await expect(janela(page, 'Detalhes do Processo')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Etiqueta do escritório: legenda só com as cores em uso, bolinha, menu para aplicar/trocar/remover, e fica gravado', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await expect(page.getByText('Etiquetas do escritório:')).toHaveCount(0);                               // nenhum processo etiquetado: sem legenda
  await expect(linha(page, CNJ1).getByTitle('Sem etiqueta')).toBeVisible();
  await abrirMenuAcoes(page, linha(page, CNJ1));
  await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
  for (const nome of ['Arquivada C2', 'Em recurso C2', 'Livre C2', 'Histórico da etiqueta']) await expect(page.getByRole('button', { name: nome })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover etiqueta' })).toHaveCount(0);                    // sem etiqueta aplicada, não há o que remover
  await semViolacoes(page, 'menu Etiqueta do processo aberto');
  await page.getByRole('button', { name: 'Arquivada C2' }).click();
  await expect(linha(page, CNJ1).getByTitle('Arquivada C2')).toBeVisible();                              // aparece na hora
  await expect(page.getByText('Etiquetas do escritório:')).toBeVisible();
  await expect(page.locator('div', { hasText: /^Etiquetas do escritório:/ }).last()).toContainText('Arquivada C2');
  expect(await slotNoBanco(CNJ1)).toEqual([3]);
  expect((await noBanco("SELECT slot_anterior, slot_novo FROM auditoria_etiqueta_escritorio WHERE modulo = 'processos' AND registro_id = ?", [await procId(CNJ1)])).map(r => [r.slot_anterior, Number(r.slot_novo)])).toEqual([[null, 3]]);
  // trocar de cor (cor sem status ligado: sem pedir motivo)
  await abrirMenuAcoes(page, linha(page, CNJ1));
  await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
  await page.getByRole('button', { name: 'Livre C2' }).click();
  await expect(linha(page, CNJ1).getByTitle('Livre C2')).toBeVisible();
  expect(await slotNoBanco(CNJ1)).toEqual([5]);
  // remover
  await abrirMenuAcoes(page, linha(page, CNJ1));
  await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
  await page.getByRole('button', { name: 'Remover etiqueta' }).click();
  await expect(linha(page, CNJ1).getByTitle('Sem etiqueta')).toBeVisible();
  expect(await slotNoBanco(CNJ1)).toEqual([]);
  await expect(page.getByText('Etiquetas do escritório:')).toHaveCount(0);
});

test('@critical Etiqueta com status ligado: pede o motivo (Cancelar não muda nada; sem motivo e com motivo mudam o status e deixam o histórico)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  const abrirEtiqueta = async (cnj) => { await abrirMenuAcoes(page, linha(page, cnj)); await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click(); };
  await abrirEtiqueta(CNJ1);
  await page.getByRole('button', { name: 'Em recurso C2' }).click();
  const motivo = janela(page, 'Motivo da mudança de status');
  await expect(motivo.getByText('O status foi alterado de Conhecimento E2E para Recurso C2.')).toBeVisible();
  await semViolacoes(page, 'Motivo da mudança de status pela etiqueta');
  await motivo.getByRole('button', { name: 'Cancelar' }).click();                                          // cancelar: nada muda
  await expect(motivo).toHaveCount(0);
  expect(await slotNoBanco(CNJ1)).toEqual([]);
  expect((await noBanco('SELECT status_id FROM tblproc WHERE id = ?', [await procId(CNJ1)]))[0].status_id).toBe(d.statusConhecimento);
  await abrirEtiqueta(CNJ1);
  await page.getByRole('button', { name: 'Em recurso C2' }).click();
  await page.keyboard.press('Escape');                                                                    // ESC também cancela
  await expect(motivo).toHaveCount(0);
  expect(await slotNoBanco(CNJ1)).toEqual([]);
  // salvar com motivo
  await abrirEtiqueta(CNJ1);
  await page.getByRole('button', { name: 'Em recurso C2' }).click();
  await motivo.getByPlaceholder('Digite o motivo, se quiser...').fill('Recurso interposto');
  await motivo.getByRole('button', { name: 'Salvar com motivo' }).click();
  await expect(linha(page, CNJ1).getByTitle('Em recurso C2')).toBeVisible();
  await expect(linha(page, CNJ1).locator('.badge-cinza')).toHaveText('Recurso C2');                          // o badge de status muda na hora
  expect(await slotNoBanco(CNJ1)).toEqual([4]);
  const log = (await noBanco("SELECT dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND acao = 'status' AND registro_id = ?", [await procId(CNJ1)]))[0];
  const dn = typeof log.dados_novos === 'string' ? JSON.parse(log.dados_novos) : log.dados_novos;
  expect({ de: dn.status_anterior, para: dn.status_novo, motivo: dn.motivo, origem: dn.origem }).toEqual({ de: 'Conhecimento E2E', para: 'Recurso C2', motivo: 'Recurso interposto', origem: 'etiqueta_escritorio' });
  await esperarSemAviso(page);
  // processo que já está nesse status: aplica direto, sem pedir motivo
  await abrirEtiqueta(CNJ1);
  await page.getByRole('button', { name: 'Remover etiqueta' }).click();
  await expect(linha(page, CNJ1).getByTitle('Sem etiqueta')).toBeVisible();
  await abrirEtiqueta(CNJ1);
  await page.getByRole('button', { name: 'Em recurso C2' }).click();
  await expect(linha(page, CNJ1).getByTitle('Em recurso C2')).toBeVisible();
  await expect(janela(page, 'Motivo da mudança de status')).toHaveCount(0);
  // outro processo, "Salvar sem motivo"
  await abrirEtiqueta(CNJ2);
  await page.getByRole('button', { name: 'Em recurso C2' }).click();
  await motivo.getByRole('button', { name: 'Salvar sem motivo' }).click();
  await expect(linha(page, CNJ2).locator('.badge-cinza')).toHaveText('Recurso C2');
  const log2 = (await noBanco("SELECT dados_novos FROM logs_auditoria WHERE tabela = 'tblproc' AND acao = 'status' AND registro_id = ?", [await procId(CNJ2)]))[0];
  const dn2 = typeof log2.dados_novos === 'string' ? JSON.parse(log2.dados_novos) : log2.dados_novos;
  expect(dn2.motivo).toBeNull();
});

test('@critical Histórico da etiqueta: lista quem trocou, de qual cor para qual e quando; vazio; erro do servidor; fecha por Fechar, ✕, ESC e clique fora', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  const abrirHistorico = async () => { await abrirMenuAcoes(page, linha(page, CNJ1)); await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click(); await page.getByRole('button', { name: 'Histórico da etiqueta' }).click(); };
  await abrirHistorico();
  const jan = janela(page, 'Histórico da etiqueta');
  await expect(jan.getByText('Nenhuma alteração registrada ainda para este registro.')).toBeVisible();
  await semViolacoes(page, 'Histórico da etiqueta vazio');
  await jan.getByRole('button', { name: 'Fechar' }).click();
  await expect(jan).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, CNJ1)); await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click(); await page.getByRole('button', { name: 'Arquivada C2' }).click();
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, CNJ1)); await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click(); await page.getByRole('button', { name: 'Livre C2' }).click();
  await abrirHistorico();
  await expect(jan.getByText('Administrador de Testes').first()).toBeVisible();
  await expect(jan.locator('div', { hasText: /^Arquivada C2\s*→\s*Livre C2$/ }).first()).toBeVisible();
  await expect(jan.locator('div', { hasText: /^Sem etiqueta\s*→\s*Arquivada C2$/ }).first()).toBeVisible();
  await semViolacoes(page, 'Histórico da etiqueta com 2 trocas');
  await jan.locator('.modal-fechar').click();
  await expect(jan).toHaveCount(0);
  await abrirHistorico();
  await page.keyboard.press('Escape');
  await expect(jan).toHaveCount(0);
  await abrirHistorico();
  await page.mouse.click(5, 5);                                                                           // clique fora fecha
  await expect(jan).toHaveCount(0);
  await page.route('**/api/etiquetas/escritorio/historico/**', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await abrirHistorico();
  await expect(jan.getByText('Erro interno no servidor. Tente novamente.')).toBeVisible();
});

test('@critical Etiqueta do escritório: sem a permissão de aplicar, o menu só mostra o histórico; erro do servidor ao aplicar avisa', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('so_ve_etiqueta', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linha(page, CNJ1));
  await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
  await expect(page.getByRole('button', { name: 'Histórico da etiqueta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arquivada C2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remover etiqueta' })).toHaveCount(0);
});

test('@critical Etiqueta do escritório: erro do servidor ao aplicar mostra o aviso e a bolinha não muda', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await page.route('**/api/etiquetas/escritorio/marcar', (rota) => rota.request().method() === 'PUT'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) }) : rota.continue());
  await abrirMenuAcoes(page, linha(page, CNJ1));
  await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
  await page.getByRole('button', { name: 'Arquivada C2' }).click();
  await aviso(page, 'Não foi possível salvar a etiqueta do escritório');
  await expect(linha(page, CNJ1).getByTitle('Sem etiqueta')).toBeVisible();
});

test('@critical Etiqueta que arquiva (status que encerra): com pendência o aviso diz o que falta e nada muda; resolvida, arquiva', async ({ page }) => {
  const arquivo = (await noBanco("INSERT INTO tblstatusproc (nome, encerra_processo, ativo) VALUES ('Arquivo C2', 1, 1)")).insertId;
  await noBanco("UPDATE etiquetas_escritorio_catalogo SET status_id = ? WHERE modulo = 'processos' AND slot = 5", [arquivo]);
  const id = await procId(CNJ1);
  await noBanco("INSERT INTO tarefas (titulo, processo_id, criado_por, concluida) VALUES ('Pendente que trava o arquivamento C2', ?, 1, 0)", [id]);
  await loginPelaTela(page);
  await abrirPasta(page);
  const aplicar = async () => {
    await abrirMenuAcoes(page, linha(page, CNJ1));
    await page.getByRole('button', { name: /^.*Etiqueta$/ }).first().click();
    await page.getByRole('button', { name: 'Livre C2' }).click();
    await janela(page, 'Motivo da mudança de status').getByRole('button', { name: 'Salvar sem motivo' }).click();
  };
  await aplicar();
  await aviso(page, 'Não é possível arquivar: 1 tarefa em aberto.');
  await expect(linha(page, CNJ1).getByTitle('Sem etiqueta')).toBeVisible();
  expect(await slotNoBanco(CNJ1)).toEqual([]);
  expect((await noBanco('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id).toBe(d.statusConhecimento);
  await noBanco("UPDATE tarefas SET concluida = 1 WHERE titulo = 'Pendente que trava o arquivamento C2'");
  await esperarSemAviso(page);
  await aplicar();
  await expect(linha(page, CNJ1).getByTitle('Livre C2')).toBeVisible();
  expect((await noBanco('SELECT status_id FROM tblproc WHERE id = ?', [id]))[0].status_id).toBe(arquivo);
});

// ------------------------------------------------------------------ + Novo Processo (mesma pasta)
const novoMesmaPasta = (page) => janela(page, 'Novo Processo (mesma pasta)');
async function abrirNovoMesmaPasta(page) {
  // os 2 processos extras (sem partes) ficariam à frente na lista e seriam o "processo de referência": aqui só valem os 2 com partes
  await noBanco("DELETE FROM tblproc WHERE NomeTituloProc IN ('SO PROTOCOLO C2', 'SEM NUMERO C2')");
  await abrirPasta(page);
  await page.getByRole('button', { name: '+ Novo Processo (mesma pasta)' }).click();
  await expect(novoMesmaPasta(page)).toBeVisible();
  await aguardarTelaPronta(page);
}

test('@critical Novo Processo (mesma pasta): sem número de pasta, partes herdadas e travadas, "Novas Partes" destrava e restaura', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoMesmaPasta(page);
  const jan = novoMesmaPasta(page);
  await expect(page.getByLabel('Número da Pasta')).toHaveCount(0);                                         // a pasta já é conhecida
  // o processo de referência é o 1º da lista (Alberto X Empresa Alfa)
  await expect(jan.getByText('Alberto Autor E2E X Empresa Alfa E2E Ltda')).toBeVisible();
  await expect(jan.getByLabel('Cliente do escritório', { exact: true })).toHaveValue('reu');                // herda o polo do cliente
  await expect(jan.getByPlaceholder('Buscar e adicionar autor...')).toHaveCount(0);                         // partes travadas: sem busca
  await expect(jan.getByPlaceholder('Buscar e adicionar réu...')).toHaveCount(0);
  await expect(jan.getByText('As mesmas partes do processo anterior foram carregadas. Marque para alterar.')).toBeVisible();
  await semViolacoes(page, 'Novo Processo (mesma pasta) com partes travadas');
  const novas = jan.getByRole('checkbox', { name: /Novas Partes/ });
  await novas.check();
  await expect(jan.getByText('Partes desbloqueadas — adicione ou remova livremente. Um novo título será gerado.')).toBeVisible();
  await jan.getByPlaceholder('Buscar e adicionar autor...').fill('Beatriz');
  await page.getByText(' - Beatriz Autora E2E').first().click();
  await expect(jan.getByText('Alberto Autor E2E(+1) X Empresa Alfa E2E Ltda')).toBeVisible();              // título novo com a parte nova
  await novas.uncheck();                                                                                   // desmarcar restaura as partes originais
  await expect(jan.getByText('Alberto Autor E2E X Empresa Alfa E2E Ltda')).toBeVisible();
  await expect(jan.getByPlaceholder('Buscar e adicionar autor...')).toHaveCount(0);
  await jan.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(await noBanco('SELECT COUNT(*) AS n FROM tblproc WHERE pasta_id = ?', [d.pastaPartes])).toEqual([{ n: 2 }]);   // cancelar não criou nada
});

test('@critical Novo Processo (mesma pasta): criar herda as partes e entra na MESMA pasta; com "Novas Partes" usa as partes novas; erros e ESC', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoMesmaPasta(page);
  const jan = novoMesmaPasta(page);
  await jan.getByLabel('Número do Processo (CNJ)').fill('9400003-00.2026.5.15.0001');
  await jan.getByLabel('Número de Protocolo').fill('PROT-C2-NOVO');
  await jan.getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'Processo criado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${d.pastaPartes}$`));                           // continua na mesma pasta
  await expect(linha(page, '9400003-00.2026.5.15.0001')).toBeVisible();                                      // e a lista já mostra o novo
  const novo = (await noBanco("SELECT * FROM tblproc WHERE numProc = '9400003-00.2026.5.15.0001'"))[0];
  expect({ pasta: novo.pasta_id, titulo: novo.NomeTituloProc, polo: novo.cliente_polo }).toEqual({ pasta: d.pastaPartes, titulo: 'Alberto Autor E2E X Empresa Alfa E2E Ltda', polo: 'reu' });
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocautor WHERE proc_id = ?', [novo.id])).map(r => r.pessoa_id)).toEqual([d.autor1]);
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ?', [novo.id])).map(r => r.pessoa_id)).toEqual([d.reu1]);
  expect(await noBanco('SELECT COUNT(*) AS n FROM tblpasta WHERE numPasta = 7401')).toEqual([{ n: 1 }]);   // não criou pasta nova
  await esperarSemAviso(page);
  // número de processo repetido: aviso e a janela continua
  await page.getByRole('button', { name: '+ Novo Processo (mesma pasta)' }).click();
  await expect(novoMesmaPasta(page)).toBeVisible();
  await aguardarTelaPronta(page);
  await novoMesmaPasta(page).getByLabel('Número do Processo (CNJ)').fill(CNJ1);
  await novoMesmaPasta(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, `O número de processo "${CNJ1}" já está cadastrado no sistema`);
  await expect(novoMesmaPasta(page)).toBeVisible();
  // com "Novas Partes": usa as partes escolhidas
  await novoMesmaPasta(page).getByLabel('Número do Processo (CNJ)').fill('9400004-00.2026.5.15.0001');
  await novoMesmaPasta(page).getByRole('checkbox', { name: /Novas Partes/ }).check();
  await novoMesmaPasta(page).getByPlaceholder('Buscar e adicionar réu...').fill('Beta');
  await page.getByText(' - Empresa Beta E2E Ltda').first().click();
  await esperarSemAviso(page);
  await novoMesmaPasta(page).getByRole('button', { name: 'Criar Processo' }).click();
  await aviso(page, 'Processo criado com sucesso!');
  const novo2 = (await noBanco("SELECT id, NomeTituloProc FROM tblproc WHERE numProc = '9400004-00.2026.5.15.0001'"))[0];
  expect(novo2.NomeTituloProc).toBe('Alberto Autor E2E X Empresa Alfa E2E Ltda(+1)');
  expect((await noBanco('SELECT pessoa_id FROM tbltituloprocreu WHERE proc_id = ? ORDER BY id', [novo2.id])).map(r => r.pessoa_id)).toEqual([d.reu1, d.reu2]);
  await esperarSemAviso(page);
  // ESC fecha
  await page.getByRole('button', { name: '+ Novo Processo (mesma pasta)' }).click();
  await expect(novoMesmaPasta(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Novo Processo (mesma pasta): o botão só existe para quem pode cadastrar processos', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('so_ve_pasta_c2', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirPasta(page);
  await expect(page.getByRole('button', { name: '+ Novo Processo (mesma pasta)' })).toHaveCount(0);
});
