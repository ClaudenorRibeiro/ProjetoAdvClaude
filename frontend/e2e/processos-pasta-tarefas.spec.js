import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C5 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Tarefas" da pasta — lista e filtros, nova tarefa, editar, concluir/reabrir
// (com o andamento que a conclusão lança no processo), excluir, histórico, permissões, mais de 100 tarefas e acessibilidade.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);                                                                              // o cursor parado sobre um botão cinza muda a cor dele (hover) e atrapalha a medição de contraste
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
const mostrar = (page) => page.getByLabel('Mostrar', { exact: true });
const doBanco = (titulo) => noBanco('SELECT *, DATE_FORMAT(data_vencimento, "%Y-%m-%d") AS venc FROM tarefas WHERE titulo = ?', [titulo]);

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { d = await prepararPastaPartes(); });
test.afterAll(async () => { await limpar(); await limparPastaPartes(d); });
async function limpar() {
  await noBanco("DELETE FROM tarefas WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401)) OR titulo LIKE 'Tarefa C5%'");
  await noBanco("DELETE FROM andamento_processual WHERE descricao LIKE 'Tarefa concluída:%' AND processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('tarefas', 'andamento_processual')");
}
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
  d.usuario = (await noBanco("SELECT id FROM usuarios WHERE nome = 'Usuário de Testes'"))[0].id;
  // processo 1: urgente a vencer (escritório), normal ATRASADA (do usuário de testes); processo 2: baixa já concluída, normal a vencer
  await noBanco("INSERT INTO tarefas (titulo, descricao, prioridade, processo_id, data_vencimento, criado_por, atribuida_para) VALUES ('Preparar Contestação', 'Ver os anexos', 'urgente', ?, DATE_ADD(CURDATE(), INTERVAL 5 DAY), 1, NULL), ('Juntar Procuração', NULL, 'normal', ?, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 1, ?)", [d.proc1, d.proc1, d.usuario]);
  await noBanco("INSERT INTO tarefas (titulo, prioridade, processo_id, data_vencimento, criado_por, concluida, concluida_por, concluida_em) VALUES ('Revisar Laudo', 'baixa', ?, DATE_ADD(CURDATE(), INTERVAL 10 DAY), 1, 1, 1, NOW())", [d.proc2]);
  await noBanco("INSERT INTO tarefas (titulo, prioridade, processo_id, data_vencimento, criado_por) VALUES ('Organizar Documentos', 'normal', ?, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 1)", [d.proc2]);
});

async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=tarefas`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Tarefas');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const hojeMais = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

test('@critical Aba Tarefas: lista, filtros (Mostrar, Prioridade, Para, datas), "Limpar filtros", atraso em vermelho e acessibilidade', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Tarefa', 'Prioridade', 'Vencimento', 'Para', 'Status', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(3);                                                        // por padrão só as pendentes, de todos os processos
  await expect(linha(page, 'Preparar Contestação')).toContainText('Ver os anexos');
  await expect(linha(page, 'Preparar Contestação')).toContainText('Urgente');
  await expect(linha(page, 'Preparar Contestação').locator('td').nth(3)).toHaveText('Escritório');
  await expect(linha(page, 'Juntar Procuração').locator('td').nth(3)).toHaveText('Usuário de Testes');
  await expect(linha(page, 'Juntar Procuração')).toContainText('(3d atraso)');
  await expect(linha(page, 'Organizar Documentos').locator('td').nth(4)).toHaveText('Pendente');
  await semViolacoes(page, 'aba Tarefas com 3 tarefas pendentes');
  // Mostrar
  await mostrar(page).selectOption('1');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'Revisar Laudo').locator('td').nth(4)).toHaveText('Concluída');
  await mostrar(page).selectOption('');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await mostrar(page).selectOption('atrasadas');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'Juntar Procuração')).toBeVisible();
  await mostrar(page).selectOption('');
  // Prioridade
  await page.getByLabel('Prioridade', { exact: true }).selectOption('baixa');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Prioridade', { exact: true }).selectOption('');
  // Para (quem vê todas)
  await page.getByLabel('Para', { exact: true }).selectOption({ label: 'Usuário de Testes' });
  await expect(page.locator('tbody tr')).toHaveCount(4);                                                       // as dele + as do escritório (sem responsável), concluídas incluídas
  await expect(linha(page, 'Revisar Laudo')).toBeVisible();
  await semViolacoes(page, 'aba Tarefas com tarefa concluída (linha esmaecida)');
  await page.getByLabel('Para', { exact: true }).selectOption('');
  // datas
  await page.getByLabel('Vencimento de', { exact: true }).fill(hojeMais(1));
  await page.getByLabel('Até', { exact: true }).fill(hojeMais(6));
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(linha(page, 'Juntar Procuração')).toHaveCount(0);
  // processo
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'Organizar Documentos')).toBeVisible();
  // limpar
  await page.getByRole('button', { name: '✕ Limpar filtros' }).click();
  await expect(mostrar(page)).toHaveValue('0');
  await expect(page.getByLabel('Vencimento de', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Até', { exact: true })).toHaveValue('');
  await expect(page.locator('tbody tr')).toHaveCount(1);                                                       // o filtro de processo continua; a limpeza é só dos filtros da aba
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await mostrar(page).selectOption('1');
  await expect(page.getByText('Nenhuma tarefa encontrada')).toBeVisible();
  await semViolacoes(page, 'aba Tarefas sem resultado');
});

test('@critical Nova tarefa com um processo escolhido: janela, obrigatórios, data passada (admin confirma), Title Case, vínculo e histórico de criação', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await page.getByRole('button', { name: '+ Nova Tarefa' }).click();
  const j = janela(page, 'Nova Tarefa');
  await expect(j).toBeVisible();
  await expect(j.getByText('✓ Processo selecionado')).toBeVisible();
  await expect(j.getByPlaceholder('0000000-00.0000.0.00.0000')).toHaveValue(CNJ1);
  await expect(j.getByLabel('Prioridade', { exact: true })).toHaveValue('normal');
  await expect(j.getByLabel('Vencimento', { exact: true })).toHaveValue(hojeMais(0));
  await expect(j.getByLabel('Atribuir para', { exact: true })).toHaveValue('');
  await expect(j.getByRole('checkbox', { name: /Avisar-me/ })).toBeDisabled();                                // sem responsável não há para quem avisar
  await expect(j.getByRole('checkbox', { name: /Enviar e-mail/ })).toBeDisabled();
  await semViolacoes(page, 'janela Nova Tarefa');
  // obrigatório
  await j.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await expect(page.getByRole('heading', { name: 'Título obrigatório' })).toBeVisible();
  await page.getByRole('button', { name: 'Entendi' }).click();
  await expect(j.getByLabel('Título', { exact: true })).toBeFocused();
  // Title Case ao sair do campo
  await j.getByLabel('Título', { exact: true }).fill('tarefa C5 revisar minuta do contrato');
  await j.getByLabel('Descrição', { exact: true }).fill('conferir as cláusulas de multa');
  await j.getByLabel('Prioridade', { exact: true }).selectOption('urgente');
  await j.getByLabel('Atribuir para', { exact: true }).selectOption({ label: 'Usuário de Testes' });
  await expect(j.getByRole('checkbox', { name: /Avisar-me/ })).toBeEnabled();
  await expect(j.getByRole('checkbox', { name: /Enviar e-mail para Usuário de Testes/ })).toBeEnabled();
  // data passada: o admin precisa confirmar
  await j.getByLabel('Vencimento', { exact: true }).fill(hojeMais(-2));
  await j.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await expect(page.getByRole('heading', { name: 'Data anterior a hoje' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  expect((await doBanco('Tarefa C5 Revisar Minuta do Contrato')).length).toBe(0);
  await j.getByLabel('Vencimento', { exact: true }).fill(hojeMais(4));
  await j.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await aviso(page, 'Tarefa criada!');
  await expect(j).toHaveCount(0);
  await expect.poll(async () => (await noBanco("SELECT COUNT(*) AS n FROM tarefas WHERE titulo LIKE 'Tarefa C5%'"))[0].n).toBe(1);
  const t = (await noBanco("SELECT *, DATE_FORMAT(data_vencimento, '%Y-%m-%d') AS venc FROM tarefas WHERE titulo LIKE 'Tarefa C5%'"))[0];
  expect({ proc: t.processo_id, prio: t.prioridade, venc: t.venc, para: t.atribuida_para, por: t.criado_por, desc: t.descricao })
    .toEqual({ proc: d.proc1, prio: 'urgente', venc: hojeMais(4), para: d.usuario, por: 1, desc: 'Conferir as Cláusulas de Multa' });
  expect(t.titulo).toMatch(/^Tarefa C5 Revisar Minuta/);
  await expect(linha(page, 'Tarefa C5')).toBeVisible();
  await expect(linha(page, 'Tarefa C5').locator('td').nth(3)).toHaveText('Usuário de Testes');
  // data passada confirmada pelo admin grava
  await page.getByRole('button', { name: '+ Nova Tarefa' }).click();
  const j2 = janela(page, 'Nova Tarefa');
  await j2.getByLabel('Título', { exact: true }).fill('Tarefa C5 Passada');
  await j2.getByLabel('Vencimento', { exact: true }).fill(hojeMais(-2));
  await j2.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await page.getByRole('button', { name: 'Agendar assim mesmo' }).click();
  await aviso(page, 'Tarefa criada!');
  await expect.poll(async () => (await doBanco('Tarefa C5 Passada'))[0]?.venc, { timeout: 10000 }).toBe(hojeMais(-2));   // o aviso da criação anterior ainda pode estar na tela: espera a gravação
  // ESC e Cancelar fecham sem gravar
  await esperarSemAviso(page);
  await page.getByRole('button', { name: '+ Nova Tarefa' }).click();
  await janela(page, 'Nova Tarefa').getByLabel('Título', { exact: true }).fill('Tarefa C5 Descartada');
  await page.keyboard.press('Escape');
  await expect(janela(page, 'Nova Tarefa')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Nova Tarefa' }).click();
  await janela(page, 'Nova Tarefa').getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela(page, 'Nova Tarefa')).toHaveCount(0);
  expect((await doBanco('Tarefa C5 Descartada')).length).toBe(0);
});

test('@critical "+ Nova Tarefa" só aparece com um processo escolhido (em "Todos os processos" a tarefa ficaria sem ligação com a pasta)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);                                                                                       // filtro "— Todos os processos —"
  await expect(page.getByRole('button', { name: '+ Nova Tarefa' })).toHaveCount(0);
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await expect(page.getByRole('button', { name: '+ Nova Tarefa' })).toBeVisible();
  await page.getByRole('button', { name: '+ Nova Tarefa' }).click();
  const j = janela(page, 'Nova Tarefa');
  await expect(j.getByPlaceholder('0000000-00.0000.0.00.0000')).toHaveValue(CNJ2);
  await j.getByLabel('Título', { exact: true }).fill('Tarefa C5 Do Processo Dois');
  await j.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await aviso(page, 'Tarefa criada!');
  await expect(linha(page, 'Tarefa C5 Do Processo Dois')).toBeVisible();
  expect((await doBanco('Tarefa C5 Do Processo Dois'))[0].processo_id).toBe(d.proc2);
});

test('@critical Editar tarefa: janela preenchida, salva as mudanças, histórico registra, tarefa concluída não tem Editar', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, 'Preparar Contestação'));
  await page.getByRole('button', { name: /Editar/ }).click();
  const j = janela(page, 'Editar Tarefa');
  await expect(j.getByLabel('Título', { exact: true })).toHaveValue('Preparar Contestação');
  await expect(j.getByLabel('Descrição', { exact: true })).toHaveValue('Ver os anexos');
  await expect(j.getByLabel('Prioridade', { exact: true })).toHaveValue('urgente');
  await expect(j.getByLabel('Vencimento', { exact: true })).toHaveValue(hojeMais(5));
  await expect(j.getByPlaceholder('0000000-00.0000.0.00.0000')).toHaveValue(CNJ1);
  await semViolacoes(page, 'janela Editar Tarefa');
  await j.getByLabel('Título', { exact: true }).fill('tarefa C5 contestação revisada');
  await j.getByLabel('Prioridade', { exact: true }).selectOption('baixa');
  await j.getByLabel('Atribuir para', { exact: true }).selectOption({ label: 'Usuário de Testes' });
  await j.getByRole('button', { name: 'Salvar Tarefa' }).click();
  await aviso(page, 'Tarefa atualizada!');
  await expect.poll(async () => (await noBanco("SELECT prioridade FROM tarefas WHERE titulo LIKE 'Tarefa C5 Contestação%'")).length).toBe(1);
  const t = (await noBanco("SELECT * FROM tarefas WHERE titulo LIKE 'Tarefa C5 Contestação%'"))[0];
  expect({ prio: t.prioridade, para: t.atribuida_para, proc: t.processo_id }).toEqual({ prio: 'baixa', para: d.usuario, proc: d.proc1 });
  await expect(linha(page, 'Tarefa C5 Contestação Revisada')).toBeVisible();
  // concluída: sem Editar
  await mostrar(page).selectOption('1');
  await abrirMenuAcoes(page, linha(page, 'Revisar Laudo'));
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Reabrir/ })).toBeVisible();
});

test('@critical Concluir e reabrir: troca o status, lança e desfaz o andamento "Tarefa concluída: …" no processo', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Concluir/ }).click();
  await aviso(page, 'Tarefa concluída!');
  await expect(linha(page, 'Organizar Documentos')).toHaveCount(0);                                          // some das pendentes
  const t = (await doBanco('Organizar Documentos'))[0];
  expect({ conc: t.concluida, por: t.concluida_por }).toEqual({ conc: 1, por: 1 });
  expect((await noBanco("SELECT COUNT(*) AS n FROM andamento_processual WHERE descricao = 'Tarefa concluída: Organizar Documentos' AND processo_id = ?", [d.proc2]))[0].n).toBe(1);
  await page.getByRole('button', { name: 'Andamentos' }).click();
  await expect(page.getByText('Tarefa concluída: Organizar Documentos')).toBeVisible();
  await page.getByRole('button', { name: 'Tarefas', exact: true }).click();
  await esperarSemAviso(page);
  await mostrar(page).selectOption('1');
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Reabrir/ }).click();
  await aviso(page, 'Tarefa reaberta');
  await expect(linha(page, 'Organizar Documentos')).toHaveCount(0);
  expect((await doBanco('Organizar Documentos'))[0].concluida).toBe(0);
  expect((await noBanco("SELECT COUNT(*) AS n FROM andamento_processual WHERE descricao = 'Tarefa concluída: Organizar Documentos'"))[0].n).toBe(0);
});

test('@critical Excluir tarefa: pede confirmação, "Cancelar" não apaga, confirmar apaga', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await expect(page.getByRole('heading', { name: 'Excluir Tarefa' })).toBeVisible();
  await expect(page.getByText('Esta tarefa será removida permanentemente. Esta ação não pode ser desfeita.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect((await doBanco('Organizar Documentos')).length).toBe(1);
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('button', { name: /🗑️ Excluir/ }).click();
  await aviso(page, 'Tarefa excluída');
  await expect(linha(page, 'Organizar Documentos')).toHaveCount(0);
  expect((await doBanco('Organizar Documentos')).length).toBe(0);
});

test('Histórico da tarefa: linha do tempo (cadastrada, concluída, reaberta), Esc e Fechar fecham só a janela do histórico', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Concluir/ }).click();
  await aviso(page, 'Tarefa concluída!');
  await mostrar(page).selectOption('');
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Reabrir/ }).click();
  await aviso(page, 'Tarefa reaberta');
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const j = janela(page, 'Histórico da Tarefa');
  await expect(j.getByText('Organizar Documentos')).toBeVisible();
  await expect(j.getByText(/Tarefa cadastrada|Tarefa concluída|Tarefa reaberta/)).toHaveCount(3);
  await expect(j.getByText('👤 Administrador de Testes')).toHaveCount(3);
  await semViolacoes(page, 'janela Histórico da Tarefa');
  await page.keyboard.press('Escape');
  await expect(j).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${d.pastaPartes}`));                              // continua na pasta
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));
  await page.getByRole('button', { name: /Histórico/ }).click();
  await janela(page, 'Histórico da Tarefa').getByRole('button', { name: 'Fechar' }).click();
  await expect(janela(page, 'Histórico da Tarefa')).toHaveCount(0);
});

test('@critical Permissões: quem só VISUALIZA tarefas não recebe "+ Nova Tarefa", Editar, Histórico nem Excluir; as de outros não aparecem', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('so_ve_tarefas', [['processos', null, 'visualizar'], ['tarefas', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirAba(page);
  await expect(linha(page, 'Preparar Contestação')).toBeVisible();                                           // do escritório
  await expect(linha(page, 'Juntar Procuração')).toHaveCount(0);                                              // do "Usuário de Testes"
  await expect(page.getByLabel('Para', { exact: true })).toHaveCount(0);                                     // sem "ver todas" não há filtro por pessoa
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await expect(page.getByRole('button', { name: '+ Nova Tarefa' })).toHaveCount(0);                         // sem "cadastrar" não há botão
  await abrirMenuAcoes(page, linha(page, 'Preparar Contestação'));
  await expect(page.getByRole('button', { name: /Concluir/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Histórico/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);
});

test('Permissões: com alterar, histórico e excluir os itens aparecem só nas tarefas em que a pessoa é a responsável ou a criadora; com "ver todas" vê o filtro "Para" e as tarefas de todos', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('tudo_tarefas', [['processos', null, 'visualizar'], ['tarefas', null, 'visualizar'], ['tarefas', null, 'cadastrar'], ['tarefas', null, 'alterar'], ['tarefas', null, 'excluir'], ['tarefas', null, 'historico'], ['tarefas', 'ver_todos', 'visualizar']]);
  const eu = (await noBanco('SELECT id FROM usuarios WHERE login = ?', [login]))[0].id;
  await noBanco("UPDATE tarefas SET atribuida_para = ? WHERE titulo = 'Preparar Contestação'", [eu]);           // responsável: ele
  await noBanco("UPDATE tarefas SET criado_por = ? WHERE titulo = 'Organizar Documentos'", [eu]);               // criador: ele
  await loginPelaTela(page, login);
  await abrirAba(page);
  await expect(linha(page, 'Juntar Procuração')).toBeVisible();
  await expect(page.getByLabel('Para', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Nova Tarefa' })).toHaveCount(0);                          // "Todos os processos"
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await expect(page.getByRole('button', { name: '+ Nova Tarefa' })).toBeVisible();
  for (const titulo of ['Preparar Contestação']) {                                                            // responsável
    await abrirMenuAcoes(page, linha(page, titulo));
    for (const nome of [/Concluir/, /Editar/, /Histórico/, /Excluir/]) await expect(page.getByRole('button', { name: nome })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await abrirMenuAcoes(page, linha(page, 'Organizar Documentos'));                                           // criador
  for (const nome of [/Concluir/, /Editar/, /Histórico/, /Excluir/]) await expect(page.getByRole('button', { name: nome })).toBeVisible();
  await page.keyboard.press('Escape');
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await abrirMenuAcoes(page, linha(page, 'Juntar Procuração'));                                              // de outra pessoa: só concluir
  await expect(page.getByRole('button', { name: /Concluir/ })).toBeVisible();
  for (const nome of [/Editar/, /Histórico/, /Excluir/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
});

test('@critical Mais de 100 tarefas no mesmo processo: a aba mostra todas (sem cortar em 100 em silêncio)', async ({ page }) => {
  const valores = Array.from({ length: 130 }, (_, i) => `('Tarefa C5 Em Massa ${String(i).padStart(3, '0')}', 'normal', ${d.proc1}, DATE_ADD(CURDATE(), INTERVAL 20 DAY), 1)`).join(',');
  await noBanco(`INSERT INTO tarefas (titulo, prioridade, processo_id, data_vencimento, criado_por) VALUES ${valores}`);
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await expect(page.locator('tbody tr'), 'a lista mostrou menos tarefas do que existem (130 em massa + 2 do processo)').toHaveCount(132, { timeout: 20000 });
});
