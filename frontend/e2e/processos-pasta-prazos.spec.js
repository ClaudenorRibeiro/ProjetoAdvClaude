import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C4 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Prazos" da pasta — filtros, lista (dias, responsável, "quem faz", status),
// o menu "⋮" conforme o estado (Fazer, Liberar, Concluir, Cancelar, Editar, Excluir), as janelas Novo Prazo (com a pasta travada),
// Editar Prazo e Cancelar Prazo, os avisos de erro, as permissões e a acessibilidade.
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
const filtroProcesso = (page) => page.getByLabel('Filtrar por processo', { exact: true });
const dia = (deslocamento = 0) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let d;
test.describe.configure({ timeout: 150_000 });
async function limpar() {
  await noBanco("DELETE FROM notificacoes WHERE prazo_id IN (SELECT id FROM prazos_processo WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401)))");
  await noBanco("DELETE FROM auditoria_prazo WHERE prazo_id IN (SELECT id FROM prazos_processo WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401)))");
  await noBanco("DELETE FROM prazos_processo WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM andamento_processual WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('prazos_processo', 'andamento_processual')");
}
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  // o banco de teste só tem alguns dias no calendário; o cálculo de prazos em dias úteis precisa de março/2026 completo (sem feriados)
  for (let dd = 1; dd <= 31; dd++) {
    const data = `2026-03-${String(dd).padStart(2, '0')}`;
    const semana = new Date(`${data}T12:00:00`).getDay();
    const r = await noBanco('INSERT IGNORE INTO calendario (data, dia_util) VALUES (?, ?)', [data, semana === 0 || semana === 6 ? 0 : 1]);
    if (r.affectedRows) (d.calInseridos ||= []).push(data);                 // só apaga depois o que este teste criou
  }
  await noBanco("DELETE FROM prazo_subtipo WHERE nome LIKE '%C4'");
  await noBanco("DELETE FROM tipo_prazo WHERE nome LIKE '%C4'");
  d.tipoPrazo = (await noBanco("INSERT INTO tipo_prazo (nome, ativo) VALUES ('Recurso C4', 1)")).insertId;
  d.subtipo = (await noBanco("INSERT INTO prazo_subtipo (tipo_prazo_id, nome, ativo) VALUES (?, 'Apelação C4', 1)", [d.tipoPrazo])).insertId;
  d.subtipo2 = (await noBanco("INSERT INTO prazo_subtipo (tipo_prazo_id, nome, ativo) VALUES (?, 'Contrarrazões C4', 1)", [d.tipoPrazo])).insertId;
});
test.afterAll(async () => {
  for (const data of d.calInseridos || []) await noBanco('DELETE FROM calendario WHERE data = ?', [data]);
  await limpar();
  await noBanco("DELETE FROM prazo_subtipo WHERE nome LIKE '%C4'");
  await noBanco("DELETE FROM tipo_prazo WHERE nome LIKE '%C4'");
  await limparPastaPartes(d);
});
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
});
async function prazoSql(proc, descricao, vencimento, extra = {}) {
  const c = { delegado: null, fazendo: null, status: 'aberto', subtipo: d.subtipo, ...extra };
  return (await noBanco(
    `INSERT INTO prazos_processo (processo_id, subtipo_id, descricao, data_inicio, quantidade, tipo_dias, data_vencimento, delegado_para, criado_por, status, fazendo_por, fazendo_desde, status_antes_fazendo)
     VALUES (?, ?, ?, ?, 5, 'corridos', ?, ?, 1, ?, ?, ${c.fazendo ? 'NOW()' : 'NULL'}, ${c.fazendo ? "'agendado'" : 'NULL'})`,
    [proc, c.subtipo, descricao, dia(-20), vencimento, c.delegado, c.status, c.fazendo])).insertId;
}
async function cenario() {
  d.atrasado = await prazoSql(d.proc1, 'Prazo Atrasado', dia(-2));
  d.hoje = await prazoSql(d.proc1, 'Prazo De Hoje', dia(0), { delegado: 1 });
  d.futuro = await prazoSql(d.proc1, 'Prazo Futuro', dia(6));
  d.fazendoEu = await prazoSql(d.proc2, 'Prazo Que Eu Faço', dia(7), { fazendo: 1 });
  d.fazendoOutro = await prazoSql(d.proc2, 'Prazo Do Outro Fazendo', dia(8), { fazendo: 2, delegado: 2 });
  d.concluido = await prazoSql(d.proc2, 'Prazo Concluído', dia(3), { status: 'concluido' });
  d.cancelado = await prazoSql(d.proc2, 'Prazo Cancelado', dia(4), { status: 'cancelado' });
}
async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=prazos`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Prazos');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const statusNoBanco = async (id) => (await noBanco('SELECT * FROM prazos_processo WHERE id = ?', [id]))[0];
const menu = async (page, texto) => { await abrirMenuAcoes(page, linha(page, texto)); };
const item = (page, nome) => page.getByRole('button', { name: nome });

test('@critical Aba Prazos: lista com dias, responsável, "quem faz" e status; encerrados escondidos; filtros de status, datas, "mostrar encerrados" e "limpar filtros"', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Prazo', 'Vencimento', 'Dias', 'Responsável', 'Quem faz', 'Status', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(5);                                                   // sem os 2 encerrados
  const nomes = await page.locator('tbody tr td:first-child').allInnerTexts();
  expect(nomes).toEqual(['Apelação C4', 'Apelação C4', 'Apelação C4', 'Apelação C4', 'Apelação C4']);        // o nome do subtipo manda sobre a descrição
  const venc = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
  const fmt = (n) => dia(n).split('-').reverse().join('/');
  expect(venc, 'com "todos os processos", a lista fica toda por vencimento').toEqual([-2, 0, 6, 7, 8].map(fmt));
  await expect(page.getByRole('button', { name: '+ Novo Prazo' })).toHaveCount(0);                           // com "todos os processos" não há onde gravar
  const atrasado = linha(page, dia(-2).split('-').reverse().join('/'));
  await expect(atrasado.getByText('2d atraso')).toBeVisible();
  await expect(atrasado.locator('.badge-vermelho')).toHaveCount(2);                                          // "2d atraso" e "Atrasado"
  await expect(atrasado.getByText('Atrasado', { exact: true })).toBeVisible();
  await expect(atrasado.locator('td').nth(3)).toHaveText('Escritório');                                      // sem responsável = escritório
  const hoje = linha(page, dia(0).split('-').reverse().join('/'));
  await expect(hoje.getByText('Pendente')).toBeVisible();
  await expect(hoje.locator('td').nth(3)).toHaveText('Administrador de Testes');
  await expect(linha(page, dia(6).split('-').reverse().join('/')).getByText('Agendado')).toBeVisible();
  await expect(linha(page, dia(6).split('-').reverse().join('/')).getByText('6d', { exact: true })).toBeVisible();
  await expect(linha(page, dia(7).split('-').reverse().join('/')).locator('td').nth(4)).toContainText('▶ Administrador de Testes');     // "eu faço"
  await expect(linha(page, dia(8).split('-').reverse().join('/')).locator('td').nth(4)).toContainText('▶ Usuário de Testes');          // outro faz
  await semViolacoes(page, 'aba Prazos com 5 prazos');
  // filtros
  const selStatus = page.getByLabel('Status', { exact: true });
  await selStatus.selectOption('atrasado');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await selStatus.selectOption('fazendo');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await selStatus.selectOption('concluido');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first().getByText('Concluído', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText('—');                       // finalizado não conta dias
  await selStatus.selectOption('');
  await page.getByLabel('Vencimento de', { exact: true }).fill(dia(0));
  await page.getByLabel('Até', { exact: true }).fill(dia(6));
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' }).check();
  await page.getByLabel('Vencimento de', { exact: true }).fill('');
  await page.getByLabel('Até', { exact: true }).fill('');
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await page.getByRole('button', { name: '✕ Limpar filtros' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' })).not.toBeChecked();
  // seletor de processo e botão "+ Novo Prazo"
  await filtroProcesso(page).selectOption({ label: CNJ2 }); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ Novo Prazo' })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('cancelado');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Status', { exact: true }).selectOption('atrasado');
  await expect(page.getByText('Nenhum prazo encontrado')).toBeVisible();
  // o filtro "Responsável" aparece para quem vê todos (admin) e filtra
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await filtroProcesso(page).selectOption('todos'); await aguardarTelaPronta(page);
  await page.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Usuário de Testes' });
  await expect(page.locator('tbody tr')).toHaveCount(4);                                                     // os do usuário 2 + os do escritório (sem responsável)
});

test('@critical Menu ⋮ do prazo conforme o estado: aberto, eu fazendo, outro fazendo (admin), concluído/cancelado', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page);
  await page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' }).check();
  const esperar = async (texto, presentes, ausentes) => {
    await menu(page, texto);
    for (const n of presentes) await expect(item(page, n), `${texto}: ${n}`).toBeVisible();
    for (const n of ausentes) await expect(item(page, n), `${texto} sem ${n}`).toHaveCount(0);
    await page.mouse.click(700, 15);                                                                          // clicar fora fecha o menu
    await expect(item(page, 'Editar')).toHaveCount(0);
  };
  await esperar(dia(-2).split('-').reverse().join('/'), ['Fazer', 'Concluir', 'Cancelar', 'Editar', 'Excluir', 'Gerar documento'], ['Liberar']);
  await esperar(dia(7).split('-').reverse().join('/'), ['Liberar', 'Concluir', 'Cancelar', 'Editar', 'Excluir'], ['Fazer']);                 // eu faço
  await esperar(dia(8).split('-').reverse().join('/'), ['Liberar', 'Concluir', 'Cancelar', 'Editar', 'Excluir'], ['Fazer']);                 // outro faz, mas sou admin
  await esperar(dia(3).split('-').reverse().join('/'), ['Gerar documento'], ['Fazer', 'Liberar', 'Concluir', 'Cancelar', 'Editar', 'Excluir']);  // concluído
  await esperar(dia(4).split('-').reverse().join('/'), ['Gerar documento'], ['Fazer', 'Liberar', 'Concluir', 'Cancelar', 'Editar', 'Excluir']);  // cancelado
  await menu(page, dia(-2).split('-').reverse().join('/'));
  await semViolacoes(page, 'menu ⋮ do prazo aberto');
});

test('@critical Prazo: Fazer e Liberar (aviso, quem faz, banco e histórico); erro do servidor mostra o motivo', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataFutura = dia(6).split('-').reverse().join('/');
  await menu(page, dataFutura); await item(page, 'Fazer').click();
  await aviso(page, 'Prazo marcado como "Fazendo"');
  await expect(linha(page, dataFutura).locator('td').nth(4)).toContainText('▶ Administrador de Testes');
  expect((await statusNoBanco(d.futuro)).fazendo_por).toBe(1);
  expect(await noBanco("SELECT id FROM auditoria_prazo WHERE prazo_id = ? AND status_novo = 'fazendo'", [d.futuro])).toHaveLength(1);
  await esperarSemAviso(page);
  await menu(page, dataFutura); await item(page, 'Liberar').click();
  await aviso(page, 'Prazo liberado');
  await expect(linha(page, dataFutura).locator('td').nth(4)).toHaveText('—');
  expect((await statusNoBanco(d.futuro)).fazendo_por).toBeNull();
  expect(await noBanco("SELECT id FROM auditoria_prazo WHERE prazo_id = ? AND status_anterior = 'fazendo'", [d.futuro])).toHaveLength(1);
  await esperarSemAviso(page);
  // outro usuário pegou o prazo enquanto a tela estava aberta: o servidor recusa e a tela mostra o motivo
  await noBanco('UPDATE prazos_processo SET fazendo_por = 2, fazendo_desde = NOW(), status_antes_fazendo = ? WHERE id = ?', ['agendado', d.futuro]);
  await menu(page, dataFutura); await item(page, 'Fazer').click();
  await aviso(page, 'Este prazo já está sendo feito por outro usuário');
  await esperarSemAviso(page);
  await page.route('**/api/prazos/*/liberar-fazendo', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await menu(page, dia(0).split('-').reverse().join('/'));
  await expect(item(page, 'Liberar')).toHaveCount(0);                                                          // o de hoje ninguém está fazendo
});

test('@critical Prazo: Concluir pede confirmação, conclui, lança o andamento "Prazo concluído" e some da lista; Cancelar/ESC não concluem; erro do servidor', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataHoje = dia(0).split('-').reverse().join('/');
  const confirma = () => janela(page, 'Concluir Prazo');
  await menu(page, dataHoje); await item(page, 'Concluir').click();
  await expect(confirma().getByText('Deseja marcar este prazo como Concluído? O status será atualizado para todos os usuários.')).toBeVisible();
  await semViolacoes(page, 'confirmação de Concluir Prazo');
  await confirma().getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirma()).toHaveCount(0);
  await menu(page, dataHoje); await item(page, 'Concluir').click();
  await page.keyboard.press('Escape');
  await expect(confirma()).toHaveCount(0);
  expect((await statusNoBanco(d.hoje)).status).toBe('aberto');
  await page.route('**/api/prazos/*/status', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await menu(page, dataHoje); await item(page, 'Concluir').click();
  await confirma().getByRole('button', { name: /Concluir/ }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(confirma()).toBeVisible();                                                                     // fica aberta para ler o motivo
  await page.unroute('**/api/prazos/*/status');
  await esperarSemAviso(page);
  await confirma().getByRole('button', { name: /Concluir/ }).click();
  await aviso(page, 'Prazo concluído!');
  await expect(linha(page, dataHoje)).toHaveCount(0);                                                         // encerrado some (padrão)
  const p = await statusNoBanco(d.hoje);
  expect({ status: p.status, por: p.concluido_por, fazendo: p.fazendo_por }).toEqual({ status: 'concluido', por: 1, fazendo: null });
  expect(await noBanco("SELECT id FROM andamento_processual WHERE processo_id = ? AND descricao = 'Prazo concluído: Apelação C4' AND fonte = 'manual'", [d.proc1])).toHaveLength(1);
  expect(await noBanco("SELECT id FROM auditoria_prazo WHERE prazo_id = ? AND status_novo = 'concluido'", [d.hoje])).toHaveLength(1);
  await page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' }).check();
  await expect(linha(page, dataHoje).getByText('Concluído', { exact: true })).toBeVisible();
});

test('@critical Prazo: Cancelar exige o motivo (Voltar/✕/ESC não cancelam), cancela com o motivo e guarda no histórico; erro do servidor', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataAtrasada = dia(-2).split('-').reverse().join('/');
  const jan = () => janela(page, 'Cancelar Prazo');
  await menu(page, dataAtrasada); await item(page, 'Cancelar').click();
  await expect(jan()).toBeVisible();
  await expect(jan().getByText('Apelação C4')).toBeVisible();
  await expect(jan().getByText(`Vencimento: ${dataAtrasada}`)).toBeVisible();
  await semViolacoes(page, 'janela Cancelar Prazo');
  await jan().getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Informe o motivo do cancelamento');                                                       // sem motivo
  await esperarSemAviso(page);
  await expect(jan().getByText('0/300 caracteres')).toBeVisible();
  await jan().getByLabel('Motivo do cancelamento').fill('x'.repeat(400));
  await expect(jan().getByLabel('Motivo do cancelamento')).toHaveValue('x'.repeat(300));                      // o campo não aceita mais de 300
  await jan().getByLabel('Motivo do cancelamento').fill('   ');
  await jan().getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Informe o motivo do cancelamento');
  await esperarSemAviso(page);
  await jan().getByRole('button', { name: 'Voltar' }).click();
  await expect(jan()).toHaveCount(0);
  await menu(page, dataAtrasada); await item(page, 'Cancelar').click();
  await jan().locator('.modal-fechar').click();
  await expect(jan()).toHaveCount(0);
  await menu(page, dataAtrasada); await item(page, 'Cancelar').click();
  await expect(jan()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(jan()).toHaveCount(0);
  expect((await statusNoBanco(d.atrasado)).status).toBe('aberto');
  await menu(page, dataAtrasada); await item(page, 'Cancelar').click();
  await jan().getByLabel('Motivo do cancelamento').fill('Cliente desistiu da ação');
  await jan().getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Prazo cancelado');
  await expect(linha(page, dataAtrasada)).toHaveCount(0);
  const p = await statusNoBanco(d.atrasado);
  expect({ status: p.status, motivo: p.motivo_cancelamento }).toEqual({ status: 'cancelado', motivo: 'Cliente desistiu da ação' });
  expect((await noBanco("SELECT observacao FROM auditoria_prazo WHERE prazo_id = ? AND status_novo = 'cancelado'", [d.atrasado]))[0].observacao).toBe('Cliente desistiu da ação');
  await esperarSemAviso(page);
  // erro do servidor
  const dataFutura = dia(6).split('-').reverse().join('/');
  await page.route('**/api/prazos/*/status', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await menu(page, dataFutura); await item(page, 'Cancelar').click();
  await jan().getByLabel('Motivo do cancelamento').fill('Teste de erro');
  await jan().getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(jan()).toBeVisible();
  await expect(jan().getByLabel('Motivo do cancelamento')).toHaveValue('Teste de erro');
});

test('@critical Prazo: Excluir pede confirmação, apaga com o histórico e deixa auditoria; Cancelar/ESC não apagam; erro do servidor', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataFutura = dia(6).split('-').reverse().join('/');
  const confirma = () => janela(page, 'Excluir Prazo');
  await menu(page, dataFutura); await item(page, 'Excluir').click();
  await expect(confirma().getByText('Este prazo será removido permanentemente. Esta ação não pode ser desfeita.')).toBeVisible();
  await confirma().getByRole('button', { name: 'Cancelar' }).click();
  await menu(page, dataFutura); await item(page, 'Excluir').click();
  await page.keyboard.press('Escape');
  await expect(confirma()).toHaveCount(0);
  expect(await noBanco('SELECT id FROM prazos_processo WHERE id = ?', [d.futuro])).toHaveLength(1);
  await page.route('**/api/prazos/*', (rota) => rota.request().method() === 'DELETE'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await menu(page, dataFutura); await item(page, 'Excluir').click();
  await confirma().getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(confirma()).toBeVisible();
  await page.unroute('**/api/prazos/*');
  await esperarSemAviso(page);
  await confirma().getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Prazo excluído');
  await expect(linha(page, dataFutura)).toHaveCount(0);
  expect(await noBanco('SELECT id FROM prazos_processo WHERE id = ?', [d.futuro])).toHaveLength(0);
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'excluir' AND registro_id = ?", [d.futuro])).toHaveLength(1);
});

// ------------------------------------------------------------------ Novo Prazo (pasta travada)
const novoPrazo = (page) => janela(page, 'Novo Prazo');
async function abrirNovoPrazo(page) {
  await abrirAba(page, CNJ1);
  await page.getByRole('button', { name: '+ Novo Prazo' }).click();
  await expect(novoPrazo(page)).toBeVisible();
  await aguardarTelaPronta(page);
}
const escolherNa = async (page, rotulo, opcao) => {
  await novoPrazo(page).getByLabel(rotulo, { exact: true }).click();
  await page.locator('div[role="option"]').filter({ hasText: opcao }).first().click();
};

test('@critical Novo Prazo (pasta travada): processo e título já preenchidos, validações em ordem, cálculo dias↔data (úteis e corridos), delegar, salvar e erro do servidor', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoPrazo(page);
  const jan = novoPrazo(page);
  await expect(jan.getByLabel('Número do Processo', { exact: true })).toHaveValue(CNJ1);
  await expect(jan.getByLabel('Número do Processo', { exact: true })).toHaveAttribute('readonly', '');
  await expect(jan.getByLabel('Titulo', { exact: true })).toHaveValue(/^7401 — /);
  await expect(jan.getByLabel('Data início', { exact: true })).toHaveValue(dia(0));
  await expect(jan.getByLabel('Tipo de dias', { exact: true })).toHaveValue('uteis');
  await semViolacoes(page, 'janela Novo Prazo');
  // validações, uma de cada vez (aviso pequeno; ao fechar, o foco vai para o campo)
  const info = (titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
  await jan.getByLabel('Data início', { exact: true }).fill('');
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(info('Data de início obrigatória')).toBeVisible();
  await info('Data de início obrigatória').getByRole('button').last().click();
  await jan.getByLabel('Data início', { exact: true }).fill(dia(0));
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(info('Tipo de prazo obrigatório')).toBeVisible();
  await info('Tipo de prazo obrigatório').getByRole('button').last().click();
  await escolherNa(page, 'Tipo de prazo *', 'Recurso C4');
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(info('Subtipo obrigatório')).toBeVisible();
  await info('Subtipo obrigatório').getByRole('button').last().click();
  await escolherNa(page, 'Subtipo *', 'Apelação C4');
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(info('Data final obrigatória')).toBeVisible();
  await info('Data final obrigatória').getByRole('button').last().click();
  // dias → data (corridos: início + 9; úteis: pula sábado/domingo) e data → dias
  await jan.getByLabel('Data início', { exact: true }).fill('2026-03-02');                                   // segunda-feira
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('corridos');
  await jan.getByLabel('Quantidade de dias', { exact: true }).fill('10');
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-11');
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('uteis');
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-13');                      // 10 dias úteis a partir de segunda
  await jan.getByLabel('Data final', { exact: true }).fill('2026-03-20');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('15');                      // 15 dias úteis entre 02/03 e 20/03 (inclusive)
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('corridos');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('19');
  // início e final no mesmo domingo, em dias úteis: zero dias úteis → a quantidade fica VAZIA (não "0"); com corridos volta a contar 1
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('uteis');
  await jan.getByLabel('Data início', { exact: true }).fill('2026-03-08');                                   // domingo
  await jan.getByLabel('Data final', { exact: true }).fill('2026-03-08');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('');
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('corridos');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('1');
  // volta aos valores usados nos passos seguintes
  await jan.getByLabel('Data início', { exact: true }).fill('2026-03-02');
  await jan.getByLabel('Data final', { exact: true }).fill('2026-03-20');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('19');
  // delegar: o aviso de conclusão só vale com um responsável
  const avisar = jan.getByRole('checkbox', { name: /Avisar-me quando este prazo for concluído/ });
  await expect(avisar).toBeDisabled();
  await escolherNa(page, 'Delegar para', 'Usuário de Testes');
  await expect(avisar).toBeEnabled();
  await avisar.check();
  await jan.getByLabel('Descrição', { exact: true }).fill('prazo para apelar da sentença');
  await jan.getByLabel('Descrição', { exact: true }).blur();
  await expect(jan.getByLabel('Descrição', { exact: true })).toHaveValue('Prazo Para Apelar da Sentença');
  // erro do servidor: faixa dentro da janela, nada se perde
  await page.route('**/api/prazos', (rota) => rota.request().method() === 'POST'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(jan.getByText('Erro interno no servidor. Tente novamente.')).toBeVisible();
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-20');
  await page.unroute('**/api/prazos');
  // salvar de verdade
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await aviso(page, 'Prazo criado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(linha(page, '20/03/2026')).toBeVisible();
  const p = (await noBanco("SELECT * FROM prazos_processo WHERE descricao = 'Prazo Para Apelar da Sentença'"))[0];
  expect({ proc: p.processo_id, sub: p.subtipo_id, deleg: p.delegado_para, por: p.criado_por, qtd: p.quantidade, tipo: p.tipo_dias, notif: p.notificar_conclusao })
    .toEqual({ proc: d.proc1, sub: d.subtipo, deleg: 2, por: 1, qtd: 19, tipo: 'corridos', notif: 1 });
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'criar' AND registro_id = ?", [p.id])).toHaveLength(1);
  expect(await noBanco('SELECT id FROM notificacoes WHERE prazo_id = ? AND usuario_id = 2', [p.id])).toHaveLength(1);        // o delegado foi avisado na hora
});

test('@critical Novo Prazo: resposta ATRASADA do servidor não sobrescreve o que a pessoa digitou depois (dias→data e data→dias)', async ({ page }) => {
  // Segura de propósito a resposta do cálculo de data final por 1,5 s: antes da correção ela chegava depois e trocava a data digitada.
  await page.route(/\/api\/prazos\/calcular\?/, async (rota) => { await new Promise(r => setTimeout(r, 1500)); await rota.continue(); });
  await loginPelaTela(page);
  await abrirNovoPrazo(page);
  const jan = novoPrazo(page);
  await jan.getByLabel('Data início', { exact: true }).fill('2026-03-02');
  await jan.getByLabel('Tipo de dias', { exact: true }).selectOption('corridos');
  await jan.getByLabel('Quantidade de dias', { exact: true }).fill('10');           // pede a data final ao servidor (resposta demora)
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-11');   // cálculo local imediato
  await jan.getByLabel('Data final', { exact: true }).fill('2026-03-20');           // a pessoa digita a data antes da resposta chegar
  await page.waitForTimeout(2500);                                                  // dá tempo da resposta atrasada chegar
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-20');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('19');
});

test('@critical Novo Prazo: Cancelar, ✕ e ESC não gravam; subtipo depende do tipo; "Salvando..."', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoPrazo(page);
  const jan = novoPrazo(page);
  await expect(jan.getByLabel('Subtipo *', { exact: true })).toBeVisible();
  await jan.getByLabel('Subtipo *', { exact: true }).click();
  await expect(page.locator('div[role="option"]').filter({ hasText: 'Apelação C4' })).toHaveCount(1);          // sem tipo escolhido, mostra todos os subtipos
  await page.keyboard.press('Escape');
  await expect(jan).toBeVisible();                                                                            // ESC com a lista aberta fecha só a lista
  await jan.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Prazo' }).click();
  await novoPrazo(page).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Prazo' }).click();
  await expect(novoPrazo(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(await noBanco('SELECT COUNT(*) AS n FROM prazos_processo WHERE processo_id IN (?, ?)', [d.proc1, d.proc2])).toEqual([{ n: 0 }]);
  // "Salvando..." enquanto grava
  await page.getByRole('button', { name: '+ Novo Prazo' }).click();
  const j2 = novoPrazo(page);
  await escolherNa(page, 'Tipo de prazo *', 'Recurso C4');
  await escolherNa(page, 'Subtipo *', 'Contrarrazões C4');
  await j2.getByLabel('Quantidade de dias', { exact: true }).fill('3');
  await expect(j2.getByLabel('Data final', { exact: true })).not.toHaveValue('');
  await page.route('**/api/prazos', async (rota) => { if (rota.request().method() === 'POST') await new Promise(r => setTimeout(r, 1200)); await rota.continue(); });
  await j2.getByRole('button', { name: 'Salvar Prazo' }).click();
  await expect(j2.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await aviso(page, 'Prazo criado com sucesso!');
});

// ------------------------------------------------------------------ Editar Prazo
test('@critical Editar Prazo: abre com os dados, não recalcula sozinho, salva, Cancelar/ESC não mudam, erro do servidor e validações', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataFutura = dia(6).split('-').reverse().join('/');
  const jan = () => janela(page, 'Editar Prazo');
  await menu(page, dataFutura); await item(page, 'Editar').click();
  await expect(jan()).toBeVisible();
  await expect(jan().getByLabel('Processo', { exact: true })).toHaveValue(CNJ1);
  await expect(jan().getByLabel('Pasta', { exact: true })).toHaveValue(/^7401 — /);
  await expect(jan().getByLabel('Data final', { exact: true })).toHaveValue(dia(6));                          // preserva o que estava gravado
  await expect(jan().getByLabel('Quantidade de dias', { exact: true })).toHaveValue('5');
  await expect(jan().getByLabel('Data início', { exact: true })).toHaveValue(dia(-20));
  await semViolacoes(page, 'janela Editar Prazo');
  await jan().getByLabel('Descrição', { exact: true }).fill('mudei mas vou cancelar');
  await jan().getByRole('button', { name: 'Cancelar' }).click();
  await expect(jan()).toHaveCount(0);
  await menu(page, dataFutura); await item(page, 'Editar').click();
  await expect(jan()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(jan()).toHaveCount(0);
  expect((await statusNoBanco(d.futuro)).descricao).toBe('Prazo Futuro');
  await menu(page, dataFutura); await item(page, 'Editar').click();
  await jan().getByLabel('Data final', { exact: true }).fill(dia(12));
  await expect(jan().getByLabel('Quantidade de dias', { exact: true })).not.toHaveValue('5');                  // data → dias recalcula
  await jan().getByLabel('Descrição', { exact: true }).fill('descrição editada do prazo');
  await jan().getByLabel('Descrição', { exact: true }).blur();
  await page.route('**/api/prazos/*', (rota) => rota.request().method() === 'PUT' && !/status|fazendo|liberar/.test(rota.request().url())
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await jan().getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(jan().getByText('Erro interno no servidor. Tente novamente.')).toBeVisible();
  await page.unroute('**/api/prazos/*');
  await jan().getByRole('button', { name: 'Salvar Alterações' }).click();
  await aviso(page, 'Prazo atualizado!');
  await expect(linha(page, dia(12).split('-').reverse().join('/'))).toBeVisible();
  const p = await statusNoBanco(d.futuro);
  expect({ desc: p.descricao, venc: String(p.data_vencimento.toISOString ? p.data_vencimento.toISOString().slice(0, 10) : p.data_vencimento).slice(0, 10) }).toEqual({ desc: 'Descrição Editada do Prazo', venc: dia(12) });
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'prazos_processo' AND acao = 'editar' AND registro_id = ?", [d.futuro])).toHaveLength(1);
});

test('@critical Prazo que começa e termina no mesmo domingo (zero dias úteis): salva sem a quantidade, novo e editar — a data final manda', async ({ page }) => {
  await loginPelaTela(page);
  await abrirNovoPrazo(page);
  const jan = novoPrazo(page);
  await escolherNa(page, 'Tipo de prazo *', 'Recurso C4');
  await escolherNa(page, 'Subtipo *', 'Apelação C4');
  await jan.getByLabel('Descrição', { exact: true }).fill('prazo domingo');
  await jan.getByLabel('Data início', { exact: true }).fill('2026-03-08');                                   // domingo
  await jan.getByLabel('Data final', { exact: true }).fill('2026-03-08');
  await expect(jan.getByLabel('Tipo de dias', { exact: true })).toHaveValue('uteis');
  await expect(jan.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('');
  await jan.getByRole('button', { name: 'Salvar Prazo' }).click();
  await aviso(page, 'Prazo criado com sucesso!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(linha(page, '08/03/2026')).toBeVisible();
  const p = (await noBanco("SELECT * FROM prazos_processo WHERE descricao = 'Prazo Domingo'"))[0];
  expect({ qtd: p.quantidade, tipo: p.tipo_dias, venc: String(p.data_vencimento.toISOString ? p.data_vencimento.toISOString().slice(0, 10) : p.data_vencimento).slice(0, 10) })
    .toEqual({ qtd: null, tipo: 'uteis', venc: '2026-03-08' });
  // editar: abre com a quantidade vazia, e salvar de novo (mesmo dia, outra descrição) também funciona
  await esperarSemAviso(page);
  await menu(page, '08/03/2026'); await item(page, 'Editar').click();
  const ed = janela(page, 'Editar Prazo');
  await expect(ed).toBeVisible();
  await expect(ed.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('');
  await expect(ed.getByLabel('Data final', { exact: true })).toHaveValue('2026-03-08');
  await ed.getByLabel('Descrição', { exact: true }).fill('prazo domingo editado');
  await ed.getByLabel('Descrição', { exact: true }).blur();
  await ed.getByLabel('Data final', { exact: true }).fill('2026-03-08');                                     // mexe na data: recalcula → continua vazio
  await expect(ed.getByLabel('Quantidade de dias', { exact: true })).toHaveValue('');
  await ed.getByRole('button', { name: 'Salvar Alterações' }).click();
  await aviso(page, 'Prazo atualizado!');
  const e = (await noBanco('SELECT * FROM prazos_processo WHERE id = ?', [p.id]))[0];
  expect({ desc: e.descricao, qtd: e.quantidade }).toEqual({ desc: 'Prazo Domingo Editado', qtd: null });
});

// ------------------------------------------------------------------ permissões
test('@critical Prazos da pasta: quem só visualiza e pode agir só nos seus — o menu respeita o dono e o "fazendo" dos outros', async ({ page }) => {
  await cenario();
  const login = await criarUsuarioComPermissoes('so_ve_prazos', [['processos', null, 'visualizar'], ['prazos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirAba(page, CNJ1);
  await expect(page.locator('tbody tr')).toHaveCount(2);                                                       // só os do escritório (sem delegado); o do admin ("hoje") fica escondido
  await menu(page, dia(-2).split('-').reverse().join('/'));
  await expect(item(page, 'Fazer')).toBeVisible();
  await expect(item(page, 'Concluir')).toBeVisible();
  await expect(item(page, 'Cancelar')).toBeVisible();
  await expect(item(page, 'Editar')).toHaveCount(0);                                                           // sem "alterar"
  await expect(item(page, 'Excluir')).toHaveCount(0);                                                          // sem "excluir"
  await expect(page.getByRole('button', { name: '+ Novo Prazo' })).toHaveCount(0);                             // sem "cadastrar"
  await page.keyboard.press('Escape');
  // prazo que outra pessoa está fazendo: só ver (nada de concluir/cancelar/editar/excluir/liberar)
  await filtroProcesso(page).selectOption({ label: CNJ2 }); await aguardarTelaPronta(page);
  await page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' }).check();
  await expect(page.locator('tbody tr')).toHaveCount(3);                                                       // "Fazendo por mim"(admin) é do escritório; o do usuário 2 e delegado a ele não aparece
  // prazo que o ADMIN está fazendo (visto por outra pessoa): ela não pode concluir, cancelar nem liberar
  await expect(linha(page, dia(7).split('-').reverse().join('/'))).toBeVisible();
  await expect(linha(page, dia(7).split('-').reverse().join('/')).getByTitle('Mais ações')).toHaveCount(0);   // nenhuma ação sobra: o menu nem aparece
});

test('@critical Aba Prazos: mais de 50 (e de 100) prazos no mesmo processo aparecem todos, sem cortar', async ({ page }) => {
  for (let i = 1; i <= 130; i++) await prazoSql(d.proc1, `Prazo Em Massa ${i}`, dia(30 + i));
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await expect(page.locator('tbody tr')).toHaveCount(130);
  const venc = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
  expect(venc[0]).toBe(dia(31).split('-').reverse().join('/'));
  expect(venc[129]).toBe(dia(160).split('-').reverse().join('/'));
});

// ------------------------------------------------------------------ Clicar na linha = Detalhes (somente leitura)
test('@critical Clicar na linha do prazo abre "Detalhes do Prazo" só para ver; Editar libera; concluído/cancelado não tem Editar; o menu ⋮ não abre os Detalhes', async ({ page }) => {
  await cenario();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const dataFutura = dia(6).split('-').reverse().join('/');
  // o clique no ⋮ não abre os Detalhes
  await menu(page, dataFutura);
  await expect(janela(page, 'Detalhes do Prazo')).toHaveCount(0);
  await page.mouse.click(700, 15);
  await linha(page, dataFutura).locator('td').first().click();
  const jan = janela(page, 'Detalhes do Prazo');
  await expect(jan).toBeVisible();
  await expect(jan.getByLabel('Data final', { exact: true })).toHaveValue(dia(6));
  await expect(jan.getByLabel('Descrição', { exact: true })).toBeDisabled();
  await expect(jan.getByLabel('Data final', { exact: true })).toBeDisabled();
  await expect(jan.getByRole('combobox', { name: 'Delegar para' })).toBeDisabled();
  await expect(jan.getByRole('button', { name: 'Salvar Alterações' })).toHaveCount(0);
  await semViolacoes(page, 'janela Detalhes do Prazo');
  await jan.getByRole('button', { name: 'Editar', exact: true }).click();
  const ed = janela(page, 'Editar Prazo');
  await expect(ed.getByLabel('Descrição', { exact: true })).toBeEnabled();
  await expect(ed.getByRole('button', { name: 'Salvar Alterações' })).toBeVisible();
  await ed.getByRole('button', { name: 'Cancelar' }).click();
  expect((await statusNoBanco(d.futuro)).descricao).toBe('Prazo Futuro');
  // concluído: abre só para ver, sem Editar
  await page.getByRole('checkbox', { name: 'Mostrar concluídos e cancelados' }).check();
  await linha(page, dia(3).split('-').reverse().join('/')).locator('td').first().click();
  const c = janela(page, 'Detalhes do Prazo');
  await expect(c).toBeVisible();
  await expect(c.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await c.getByRole('button', { name: 'Fechar' }).click();
  await expect(c).toHaveCount(0);
});
