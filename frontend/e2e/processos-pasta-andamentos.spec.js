import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C3 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Andamentos" da pasta — filtro por processo, lista (manuais e os do DataJud),
// "Mostrar somente do escritório", as mensagens do DataJud (simuladas), a janela Novo/Editar Andamento, excluir, permissões e acessibilidade.
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

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { d = await prepararPastaPartes(); });
test.afterAll(async () => { await limpar(); await limparPastaPartes(d); });
async function limpar() {
  await noBanco("DELETE FROM andamento_processual WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela = 'andamento_processual'");
}
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
  // processo 1: manual do admin (01/03), do DataJud (10/03 14:30) e manual de outra pessoa (05/03); processo 2: manual do admin (20/02)
  await noBanco("INSERT INTO andamento_processual (processo_id, data, descricao, fonte, criado_por) VALUES (?, '2026-03-01', 'Peticao Inicial Protocolada', 'manual', 1), (?, '2026-03-05', 'Juntada De Documentos', 'manual', 2), (?, '2026-02-20', 'Andamento Do Outro Processo', 'manual', 1)", [d.proc1, d.proc1, d.proc2]);
  await noBanco("INSERT INTO andamento_processual (processo_id, data, data_hora, descricao, fonte, codigo_movimento, hash_movimento) VALUES (?, '2026-03-10', '2026-03-10 14:30:00', 'Distribuição (DataJud)', 'datajud', 26, ?)", [d.proc1, 'a'.repeat(40)]);
});

async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=andamentos`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Andamentos');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const sincMock = (page, corpo) => page.route('**/api/andamento/*/sincronizar', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, dados: corpo }) }));

test('@critical Aba Andamentos: lista de todos os processos (mais novo primeiro), filtro por processo, DataJud só leitura e "somente do escritório"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Data', 'Descrição', 'Registrado por', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  const datas = await page.locator('tbody tr td:first-child').allInnerTexts();
  expect(datas).toEqual(['10/03/2026', '05/03/2026', '01/03/2026', '20/02/2026']);                           // do mais novo para o mais antigo, misturando os processos
  await expect(page.getByRole('button', { name: '+ Novo Andamento' })).toHaveCount(0);                       // com "todos os processos" não há onde gravar
  await expect(page.getByText('DataJud desativado')).toHaveCount(0);                                         // a linha do DataJud só aparece com 1 processo
  const dj = linha(page, 'Distribuição (DataJud)');
  await expect(dj.locator('td').nth(2)).toHaveText('');                                                      // DataJud: sem "Registrado por"
  await expect(dj.getByTitle('Mais ações')).toHaveCount(0);                                                  // e sem ações (só leitura)
  await expect(linha(page, 'Peticao Inicial Protocolada').locator('td').nth(2)).toHaveText('Administrador de Testes');
  await expect(linha(page, 'Juntada De Documentos').locator('td').nth(2)).toHaveText('Usuário de Testes');
  await semViolacoes(page, 'aba Andamentos com 4 andamentos');
  // 1 processo: aparece o botão, a linha do DataJud e só os andamentos dele
  await filtroProcesso(page).selectOption({ label: CNJ2 }); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '+ Novo Andamento' })).toBeVisible();
  await expect(page.getByText('DataJud desativado (ative em Configurações → Integrações).')).toBeVisible();
  await filtroProcesso(page).selectOption({ label: CNJ1 }); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  // "somente do escritório" esconde os do DataJud
  const so = page.getByRole('checkbox', { name: 'Mostrar somente do escritório' });
  await so.check();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(linha(page, 'Distribuição (DataJud)')).toHaveCount(0);
  await so.uncheck();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  // mensagens de lista vazia
  await noBanco("DELETE FROM andamento_processual WHERE fonte = 'manual' AND processo_id = ?", [d.proc1]);
  await abrirAba(page, CNJ1);
  await page.getByRole('checkbox', { name: 'Mostrar somente do escritório' }).check();
  await expect(page.getByText('Nenhum andamento do escritório registrado')).toBeVisible();                  // só tem do DataJud e o filtro está ligado
  await noBanco("DELETE FROM andamento_processual WHERE processo_id = ?", [d.proc1]);
  await abrirAba(page, CNJ1);
  await expect(page.getByText('Nenhum andamento registrado')).toBeVisible();
});

test('@critical Aba Andamentos: mensagens do DataJud (já sincronizado, sem número, erro de comunicação) e a faixa "Atualizando DataJud…" em segundo plano (a lista aparece antes e a tela não trava)', async ({ page }) => {
  await loginPelaTela(page);
  await sincMock(page, { andamentos: [], aviso: '', datajud: { tipo: 'ja_hoje', mensagem: 'DataJud sincronizado hoje às 09:15.' } });
  await abrirAba(page, CNJ1);
  await expect(page.getByText('DataJud sincronizado hoje às 09:15.')).toBeVisible();
  await page.unroute('**/api/andamento/*/sincronizar');
  await sincMock(page, { andamentos: [], aviso: 'O CNJ não respondeu agora.', datajud: { tipo: 'erro', mensagem: 'O CNJ não respondeu agora.' } });
  await abrirAba(page, CNJ1);
  await expect(page.getByText('O CNJ não respondeu agora.')).toBeVisible();                                  // faixa laranja
  await expect(page.getByText('DataJud sincronizado hoje às 09:15.')).toHaveCount(0);
  await page.unroute('**/api/andamento/*/sincronizar');
  // consulta demorada: a lista já salva aparece NA HORA, a faixa "Atualizando DataJud…" avisa e nada trava
  // a consulta fica "pendurada" até o teste soltar (nada de tempo fixo: em máquina lenta a verificação de acessibilidade demora e a consulta acabaria antes)
  let soltarConsulta; const consultaPendurada = new Promise(r => { soltarConsulta = r; });
  await page.route('**/api/andamento/*/sincronizar', async (rota) => { await consultaPendurada; await rota.abort().catch(() => {}); });
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=andamentos`);
  await expect(page.getByText('Atualizando DataJud…')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);                                                      // a lista não esperou o DataJud
  await expect(page.getByText('Consultando o DataJud…')).toHaveCount(0);                                      // nada de quadro que bloqueia a tela
  await expect(page.getByRole('button', { name: 'Atualizar DataJud' })).toBeDisabled();                       // uma consulta por vez
  await semViolacoes(page, 'faixa Atualizando DataJud');
  // sair da aba cancela a consulta que está rodando
  const cancelada = page.waitForEvent('requestfailed', r => /sincronizar/.test(r.url()));
  await page.getByRole('button', { name: 'Prazos', exact: true }).click();
  await cancelada;
  await expect(page.getByText('Atualizando DataJud…')).toHaveCount(0);
  soltarConsulta();
  await page.unroute('**/api/andamento/*/sincronizar');
  await esperarSemAviso(page);
});

test('@critical Aba Andamentos: "Atualizar DataJud" consulta na hora ignorando o limite do dia, mostra o resultado e a abertura da aba NÃO força', async ({ page }) => {
  await loginPelaTela(page);
  const corpos = [];
  await page.route('**/api/andamento/*/sincronizar', async (rota) => {
    const corpo = rota.request().postDataJSON() || {};
    corpos.push(corpo);
    const forcada = corpo.forcar === true;
    const andamentos = forcada
      ? [{ id: 990001, data: '2026-03-11', data_hora: '2026-03-11 09:00:00', descricao: 'Movimento Novo Do DataJud', fonte: 'datajud', criado_por_nome: null }]
      : [];
    const datajud = forcada ? { tipo: 'ok', mensagem: 'Consulta ao DataJud concluída às 10:00.', novos: 1 } : { tipo: 'ja_hoje', mensagem: 'DataJud sincronizado hoje às 08:00.' };
    await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, dados: { andamentos, aviso: '', datajud } }) });
  });
  await abrirAba(page, CNJ1);
  await expect(page.getByText('DataJud sincronizado hoje às 08:00.')).toBeVisible();
  expect(corpos.every(c => c.forcar !== true)).toBe(true);                                                    // abrir a aba respeita o limite de 1x por dia
  await expect(page.getByText('Movimento Novo Do DataJud')).toHaveCount(0);
  await page.getByRole('button', { name: 'Atualizar DataJud' }).click();
  await expect(page.getByText('Movimento Novo Do DataJud')).toBeVisible();
  await expect(page.getByText('Consulta ao DataJud concluída às 10:00.')).toBeVisible();
  expect(corpos[corpos.length - 1]).toEqual({ forcar: true });                                                // o botão pede a consulta forçada
  await expect(page.getByRole('button', { name: 'Atualizar DataJud' })).toBeEnabled();                        // terminou: pode pedir de novo
});

test('@critical Novo Andamento: data de hoje, validação, iniciais maiúsculas, salvar grava e aparece na lista; Cancelar, ✕ e ESC; erro do servidor', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ2);
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  const jan = janela(page, 'Novo Andamento');
  await expect(jan).toBeVisible();
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  await expect(jan.getByLabel('Data', { exact: true })).toHaveValue(hojeIso);
  await semViolacoes(page, 'janela Novo Andamento');
  await jan.getByRole('button', { name: 'Salvar' }).click();
  await expect(jan.getByText('Descreva o andamento para poder salvar.')).toBeVisible();
  await expect(jan.getByText('0/1000 caracteres')).toBeVisible();
  await jan.getByLabel('Descrição', { exact: true }).fill('   ');
  await jan.getByRole('button', { name: 'Salvar' }).click();
  await expect(jan.getByText('Descreva o andamento para poder salvar.')).toBeVisible();                    // só espaços também não vale
  await jan.getByLabel('Descrição', { exact: true }).fill('x'.repeat(1200));
  await expect(jan.getByLabel('Descrição', { exact: true })).toHaveValue('x'.repeat(1000));                 // o campo não aceita mais de 1.000
  await expect(jan.getByText('1000/1000 caracteres')).toBeVisible();
  await jan.getByLabel('Descrição', { exact: true }).fill('audiência designada para o mês que vem');
  await jan.getByLabel('Data', { exact: true }).fill('2026-04-02');
  await jan.getByLabel('Descrição', { exact: true }).blur();
  await expect(jan.getByLabel('Descrição', { exact: true })).toHaveValue('Audiência Designada Para o Mês Que Vem');
  await jan.getByRole('button', { name: 'Salvar' }).click();
  await aviso(page, 'Andamento registrado!');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await expect(linha(page, 'Audiência Designada Para o Mês Que Vem')).toContainText('02/04/2026');
  await expect(linha(page, 'Audiência Designada Para o Mês Que Vem').locator('td').nth(2)).toHaveText('Administrador de Testes');
  const novo = (await noBanco("SELECT data, descricao, fonte, criado_por, processo_id FROM andamento_processual WHERE descricao LIKE 'Audiência Designada%'"))[0];
  expect({ fonte: novo.fonte, por: novo.criado_por, proc: novo.processo_id, descricao: novo.descricao }).toEqual({ fonte: 'manual', por: 1, proc: d.proc2, descricao: 'Audiência Designada Para o Mês Que Vem' });
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'andamento_processual' AND acao = 'criar'")).toHaveLength(1);
  await esperarSemAviso(page);
  // Cancelar, ✕ e ESC não gravam
  const total = (await noBanco('SELECT COUNT(*) AS n FROM andamento_processual'))[0].n;
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  await janela(page, 'Novo Andamento').getByLabel('Descrição', { exact: true }).fill('rascunho');
  await janela(page, 'Novo Andamento').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  await janela(page, 'Novo Andamento').locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  await expect(janela(page, 'Novo Andamento')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM andamento_processual'))[0].n).toBe(total);
  // "Salvando..." e erro do servidor (a faixa aparece DENTRO da janela, com o texto preservado)
  await page.route('**/api/andamento/*', async (rota) => { if (rota.request().method() === 'POST') await new Promise(r => setTimeout(r, 1200)); await rota.continue(); });
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  const j2 = janela(page, 'Novo Andamento');
  await j2.getByLabel('Descrição', { exact: true }).fill('Texto Lento');
  await j2.getByRole('button', { name: 'Salvar' }).click();
  await expect(j2.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await aviso(page, 'Andamento registrado!');
  await page.unroute('**/api/andamento/*');
  await esperarSemAviso(page);
  await page.route('**/api/andamento/*', (rota) => rota.request().method() === 'POST'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await page.getByRole('button', { name: '+ Novo Andamento' }).click();
  const j3 = janela(page, 'Novo Andamento');
  await j3.getByLabel('Descrição', { exact: true }).fill('Texto Que Fica');
  await j3.getByRole('button', { name: 'Salvar' }).click();
  await expect(j3.getByText('Erro interno no servidor. Tente novamente.')).toBeVisible();
  await expect(j3.getByLabel('Descrição', { exact: true })).toHaveValue('Texto Que Fica');
  await expect(page.locator('.Toastify__toast')).toHaveCount(0);
});

test('@critical Editar Andamento: só os manuais; abre com os dados, escolhe o processo certo quando está em "todos", salva, Cancelar não muda', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);                                                                                       // "todos os processos"
  await abrirMenuAcoes(page, linha(page, 'Andamento Do Outro Processo'));
  await page.getByRole('button', { name: /Editar/ }).click();
  const jan = janela(page, 'Editar Andamento');
  await expect(jan).toBeVisible();
  await expect(filtroProcesso(page)).toHaveValue(String(d.proc2));                                            // o seletor passou para o processo do andamento
  await expect(jan.getByLabel('Data', { exact: true })).toHaveValue('2026-02-20');
  await expect(jan.getByLabel('Descrição', { exact: true })).toHaveValue('Andamento Do Outro Processo');
  await semViolacoes(page, 'janela Editar Andamento');
  await jan.getByLabel('Descrição', { exact: true }).fill('Texto Que Vou Cancelar');
  await jan.getByRole('button', { name: 'Cancelar' }).click();
  await expect(linha(page, 'Andamento Do Outro Processo')).toBeVisible();
  expect((await noBanco("SELECT descricao FROM andamento_processual WHERE processo_id = ?", [d.proc2]))[0].descricao).toBe('Andamento Do Outro Processo');
  await abrirMenuAcoes(page, linha(page, 'Andamento Do Outro Processo'));
  await page.getByRole('button', { name: /Editar/ }).click();
  await jan.getByLabel('Data', { exact: true }).fill('2026-02-25');
  await jan.getByLabel('Descrição', { exact: true }).fill('andamento corrigido');
  await jan.getByRole('button', { name: 'Salvar' }).click();
  await aviso(page, 'Andamento atualizado!');
  await expect(linha(page, 'Andamento Corrigido')).toContainText('25/02/2026');
  const a = (await noBanco('SELECT descricao, data, editado_por, fonte FROM andamento_processual WHERE processo_id = ?', [d.proc2]))[0];
  expect({ descricao: a.descricao, editado: a.editado_por, fonte: a.fonte }).toEqual({ descricao: 'Andamento Corrigido', editado: 1, fonte: 'manual' });
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'andamento_processual' AND acao = 'editar'")).toHaveLength(1);
  // erro do servidor (ex.: andamento já apagado por outra pessoa): aviso dentro da janela
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, 'Andamento Corrigido'));
  await page.getByRole('button', { name: /Editar/ }).click();
  await noBanco('DELETE FROM andamento_processual WHERE processo_id = ?', [d.proc2]);
  await jan.getByLabel('Descrição', { exact: true }).fill('Texto Qualquer');
  await jan.getByRole('button', { name: 'Salvar' }).click();
  await expect(jan.getByText('Andamento não encontrado')).toBeVisible();
});

test('@critical Excluir andamento: pede confirmação (Cancelar e ESC não apagam), confirmar apaga e deixa auditoria; erro do servidor mantém a janela', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const confirma = () => janela(page, 'Excluir Andamento');
  await abrirMenuAcoes(page, linha(page, 'Peticao Inicial Protocolada'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await expect(confirma().getByText('Este andamento será removido permanentemente do processo. Esta ação não pode ser desfeita.')).toBeVisible();
  await semViolacoes(page, 'confirmação de exclusão de andamento');
  await confirma().getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirma()).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, 'Peticao Inicial Protocolada'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await page.keyboard.press('Escape');
  await expect(confirma()).toHaveCount(0);
  expect(await noBanco("SELECT id FROM andamento_processual WHERE descricao = 'Peticao Inicial Protocolada'")).toHaveLength(1);
  // erro do servidor
  await page.route('**/api/andamento/*', (rota) => rota.request().method() === 'DELETE'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await abrirMenuAcoes(page, linha(page, 'Peticao Inicial Protocolada'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await confirma().getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Erro interno no servidor. Tente novamente.');
  await expect(confirma()).toBeVisible();
  await page.unroute('**/api/andamento/*');
  await esperarSemAviso(page);
  await confirma().getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Andamento excluído');
  await expect(linha(page, 'Peticao Inicial Protocolada')).toHaveCount(0);
  expect(await noBanco("SELECT id FROM andamento_processual WHERE descricao = 'Peticao Inicial Protocolada'")).toHaveLength(0);
  expect(await noBanco("SELECT id FROM logs_auditoria WHERE tabela = 'andamento_processual' AND acao = 'excluir'")).toHaveLength(1);
  expect(await noBanco("SELECT id FROM andamento_processual WHERE fonte = 'datajud'")).toHaveLength(1);       // o do DataJud nunca é tocado
});

test('@critical Andamentos: quem só pode VISUALIZAR não recebe "+ Novo Andamento", Editar nem Excluir (e quem não vê andamentos recebe o aviso)', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('so_ve_andamentos', [['processos', null, 'visualizar'], ['processos', 'andamentos', 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirAba(page, CNJ1);
  await expect(linha(page, 'Peticao Inicial Protocolada')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo Andamento' })).toHaveCount(0);
  await expect(page.getByTitle('Mais ações').filter({ visible: true })).toHaveCount(0);                      // nenhuma linha oferece Editar/Excluir
});

test('@critical Andamentos: quem pode cadastrar e alterar, mas não excluir, não vê o Excluir', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('cad_alt_andamentos', [['processos', null, 'visualizar'], ['processos', 'andamentos', 'visualizar'], ['processos', 'andamentos', 'cadastrar'], ['processos', 'andamentos', 'alterar']]);
  await loginPelaTela(page, login);
  await abrirAba(page, CNJ1);
  await expect(page.getByRole('button', { name: '+ Novo Andamento' })).toBeVisible();
  await abrirMenuAcoes(page, linha(page, 'Peticao Inicial Protocolada'));
  await expect(page.getByRole('button', { name: /Editar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);
});

test('@critical Andamentos: quem não tem permissão de ver andamentos recebe um aviso claro (não "nenhum andamento" nem tela quebrada)', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('sem_andamentos', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=andamentos`); await aguardarTelaPronta(page);
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  await expect(page.getByText('Você não tem permissão para ver os andamentos deste processo.')).toBeVisible();
  await expect(page.getByText('Nenhum andamento registrado')).toHaveCount(0);
});
