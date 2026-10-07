import { test, expect } from '@playwright/test';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, loginPelaTela, violacoesGraves } from './helpers';

// Tela de PUBLICAÇÕES (abas AASP e CNJ/DJEN): filtros, lista, abrir o texto, Tratada/sem ação e Reabrir, Atribuir, Excluir (uma e selecionadas),
// Importar, e-mail, janelas de ação e permissões. AASP e CNJ são SIMULADAS por um servidor falso LOCAL (a URL da integração, que fica no banco
// de teste, aponta para ele): nada sai para a internet. O envio de e-mail e a criação de prazo/tarefa/compromisso só são ABERTOS e cancelados
// (o servidor já tem teste próprio para o envio).
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 });   // aviso ainda sumindo (transparente) é lido com contraste falso
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.locator('.Toastify__toast').filter({ hasText: texto }).first()).toBeVisible();
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto }).first();
const item = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) });
async function esperarAvisosSumirem(page) { await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 }); }
const PROC = '0000001-01.2026.5.15.0001';          // processo que o banco de testes já tem
const SEM_PROC = '5555555-55.2026.5.15.0055';       // processo que NÃO está cadastrado
let SEQ = 0;
async function nova(extra = {}) {
  SEQ += 1;
  const d = { fonte: 'aasp', data: '2026-02-10', numero_processo: null, texto: `Pub E2E ${SEQ}`, tratada: 0, ...extra };
  const r = await noBanco(`INSERT INTO publicacoes (fonte, id_cnj, data_publicacao, numero_processo, tribunal, texto, texto_hash, escritorio, tratada)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`, [d.fonte, d.id_cnj || null, d.data, d.numero_processo, d.tribunal || null, d.texto,
    crypto.createHash('sha256').update(d.texto + Date.now() + SEQ).digest('hex'), d.tratada]);
  return r.insertId;
}

// ---- fonte falsa (AASP e CNJ) no próprio computador ----
let falso; const pedidos = [];
const ITENS_AASP = (dia) => dia === '10/11/2026' ? [
  { textoPublicacao: 'Pub E2E importada AASP um', numeroUnicoProcesso: '1111111-11.2026.5.15.0011', titulo: 'T', cabecalho: 'C', numeroPublicacao: 71, numeroArquivo: 1, jornal: { dataDisponibilizacao_Publicacao: '2026-11-10T00:00:00' } },
  { textoPublicacao: 'Pub E2E importada AASP dois', numeroUnicoProcesso: '2222222-22.2026.5.15.0022', titulo: 'T', cabecalho: 'C', numeroPublicacao: 72, numeroArquivo: 1, jornal: { dataDisponibilizacao_Publicacao: '2026-11-10T00:00:00' } },
] : [];
const ITENS_CNJ = [
  { id: 880001, texto: 'Pub E2E importada CNJ um', siglaTribunal: 'TRT15', numeroprocessocommascara: '3333333-33.2026.5.15.0033', tipoComunicacao: 'Intimação', nomeOrgao: '1ª Vara', numeroComunicacao: 1, hash: 'h1', data_disponibilizacao: '2026-11-12' },
  { id: 880002, texto: 'Pub E2E importada CNJ dois', siglaTribunal: 'TRT2', numeroprocessocommascara: '4444444-44.2026.5.02.0044', tipoComunicacao: 'Edital', nomeOrgao: '2ª Vara', numeroComunicacao: 2, hash: 'h2', data_disponibilizacao: '2026-11-13' },
];
async function configurar(modulo, ativo, cfg) {
  await noBanco(`INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE ativo = VALUES(ativo), configuracoes = VALUES(configuracoes)`, [modulo, ativo, JSON.stringify(cfg)]);
}

test.beforeAll(async () => {
  falso = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      pedidos.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      if (u.pathname === '/aasp') return res.end(JSON.stringify({ intimacoes: ITENS_AASP(u.searchParams.get('data')) }));
      if (u.pathname === '/cnj') return res.end(JSON.stringify({ items: ITENS_CNJ }));
      res.statusCode = 404; res.end('{}');
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, porta: srv.address().port }));
  });
  await criarUsuarioComPermissoes('pub_recebedor', [['publicacoes', null, 'visualizar']]);
  await criarUsuarioComPermissoes('pub_outro', [['publicacoes', null, 'visualizar']]);
});
test.afterAll(async () => { await new Promise(r => falso.srv.close(r)); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function abrir(page, login) {
  await loginPelaTela(page, login);
  await page.goto('/publicacoes');
  await expect(page.getByRole('button', { name: 'AASP', exact: true })).toBeVisible();
  await aguardarTelaPronta(page);
}
// Deixa a lista mostrando TUDO (todas as publicações, qualquer status) e procura por um trecho do texto.
async function procurar(page, trecho, { status = '' } = {}) {
  const ver = page.getByLabel('Ver publicações');
  if (await ver.count()) await ver.selectOption('todas');
  await page.getByLabel('Status').selectOption(status);
  await page.getByLabel('Pesquisar no conteúdo').fill(trecho);
}

test('@critical Publicações (AASP): abas, filtros, pesquisa, status, período com trava de 3 meses, ordem e marcação de processo repetido', async ({ page }) => {
  const a = await nova({ data: '2026-02-10', numero_processo: PROC, texto: 'Pub E2E L1 alfa' });
  const b = await nova({ data: '2026-02-10', numero_processo: SEM_PROC, texto: 'Pub E2E L1 beta' });
  await nova({ data: '2026-02-10', numero_processo: PROC, texto: 'Pub E2E L1 gama repetida' });
  await nova({ data: '2026-02-11', numero_processo: null, texto: 'Pub E2E L1 delta tratada', tratada: 1 });
  await abrir(page);
  await expect(page.getByRole('button', { name: 'CNJ / DJEN', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filtrar e pesquisar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar publicações' })).toBeVisible();
  await expect(page.getByLabel('Status')).toHaveValue('0');                                  // começa em "Não tratadas"
  await procurar(page, 'Pub E2E L1');
  await expect(page.getByText(/^4 publicações/)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByLabel('Status').selectOption('0');
  await expect(page.getByText(/^3 publicações/)).toBeVisible();
  await page.getByLabel('Status').selectOption('1');
  await expect(page.getByText(/^1 publicação/)).toBeVisible();
  await expect(linha(page, 'delta tratada').locator('.badge', { hasText: /^Tratada$/ })).toBeVisible();
  await page.getByLabel('Status').selectOption('');
  // pesquisa por número do processo e por texto que não existe
  await page.getByLabel('Pesquisar no conteúdo').fill('5555555');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'L1 beta')).toBeVisible();
  await page.getByLabel('Pesquisar no conteúdo').fill('texto que nao existe em nenhuma publicacao');
  await expect(page.getByText('Nenhuma publicação encontrada.')).toBeVisible();
  await page.getByLabel('Pesquisar no conteúdo').fill('Pub E2E L1');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  // processo repetido no mesmo dia: só as duas do mesmo processo e dia ficam marcadas
  await expect(page.getByTitle('O mesmo processo aparece mais de uma vez neste dia (repetida)')).toHaveCount(2);
  // período: janela de datas e a trava de 3 meses
  await page.getByRole('button', { name: 'Escolher período' }).click();
  await page.getByLabel('Período: data inicial').fill('2026-01-01');
  await page.getByLabel('Período: data final').fill('2026-05-01');
  await expect(page.getByText('O período não pode passar de 3 meses.')).toBeVisible();
  await page.getByLabel('Período: data inicial').fill('2026-02-10');
  await page.getByLabel('Período: data final').fill('2026-02-10');
  await expect(page.getByText('O período não pode passar de 3 meses.')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);                                     // só o dia 10/02
  await page.getByRole('button', { name: 'Todas as datas' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  // ordem: clicar no título da coluna alterna a seta
  await page.getByRole('columnheader', { name: 'Data' }).click();
  await expect(page.getByRole('columnheader', { name: /Data [▲▼]/ })).toBeVisible();
  await expect(page.getByText('processo repetido no mesmo dia')).toBeVisible();              // legenda
  await expect(page.locator('tbody tr').first()).toBeVisible();
  void a; void b;
  await semViolacoes(page, 'tela de Publicações (AASP)');
});

test('@critical Publicações: abrir o texto marca como lida (só para quem abriu), mostra o texto inteiro e o Histórico abre', async ({ page }) => {
  const id = await nova({ data: '2026-02-12', numero_processo: SEM_PROC, texto: 'Pub E2E T2 Intimação para manifestação sobre o laudo pericial no prazo de 15 dias úteis.' });
  await abrir(page);
  await procurar(page, 'Pub E2E T2');
  const l = linha(page, 'Pub E2E T2');
  await expect(l).toBeVisible();
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes_lidas WHERE publicacao_id = ?', [id]))[0].n).toBe(0);
  await l.locator('div[title]').filter({ hasText: 'Pub E2E T2' }).first().click();
  const m = page.locator('.modal-box').filter({ hasText: 'manifestação sobre o laudo pericial' });
  await expect(m).toBeVisible();
  await expect(m.getByRole('heading', { name: /Publicação — 12\/02\/2026/ })).toBeVisible();
  await expect.poll(async () => (await noBanco('SELECT COUNT(*) AS n FROM publicacoes_lidas WHERE publicacao_id = ?', [id]))[0].n).toBe(1);
  // pesquisa dentro do texto
  await m.getByLabel('Localizar conteúdo nesta publicação').fill('laudo');
  await expect(m.locator('mark').first()).toBeVisible();
  await semViolacoes(page, 'texto da publicação aberto');
  await m.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(m).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, 'Pub E2E T2'));
  await item(page, 'Histórico').click();
  const h = janela(page, 'Histórico da publicação');
  await expect(h).toBeVisible();
  await semViolacoes(page, 'histórico da publicação');
  await h.getByRole('button', { name: /Fechar|✕/ }).first().click();
  await expect(h).toHaveCount(0);
});

test('@critical Publicações: "Tratada / sem ação" exige o motivo, só aparece com o processo cadastrado; Reabrir limpa tudo', async ({ page }) => {
  const cad = await nova({ data: '2026-02-13', numero_processo: PROC, texto: 'Pub E2E T3 com processo cadastrado' });
  const sem = await nova({ data: '2026-02-13', numero_processo: SEM_PROC, texto: 'Pub E2E T3 sem processo cadastrado' });
  await abrir(page);
  await procurar(page, 'Pub E2E T3');
  await abrirMenuAcoes(page, linha(page, 'sem processo cadastrado'));
  await expect(item(page, 'Tratada / sem ação')).toHaveCount(0);                              // processo não cadastrado: nunca vira tratada
  await expect(item(page, 'Histórico')).toBeVisible();
  await page.keyboard.press('Escape');
  await abrirMenuAcoes(page, linha(page, 'com processo cadastrado'));
  await item(page, 'Tratada / sem ação').click();
  const j = janela(page, 'Tratar sem ação');
  await expect(j).toBeVisible();
  await semViolacoes(page, 'janela Tratar sem ação');
  await j.getByRole('button', { name: 'Marcar como tratada' }).click();
  await expect(j.getByText('Escreva o motivo para marcar esta publicação como tratada sem ação.')).toBeVisible();
  expect((await noBanco('SELECT tratada FROM publicacoes WHERE id = ?', [cad]))[0].tratada).toBe(0);
  await j.getByRole('button', { name: 'Cancelar' }).click();
  await expect(j).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, 'com processo cadastrado'));
  await item(page, 'Tratada / sem ação').click();
  await janela(page, 'Tratar sem ação').getByLabel('Motivo').fill('Publicação apenas informativa');
  await janela(page, 'Tratar sem ação').getByRole('button', { name: 'Marcar como tratada' }).click();
  await aviso(page, 'Publicação marcada como tratada');
  const g = (await noBanco('SELECT tratada, motivo_sem_acao FROM publicacoes WHERE id = ?', [cad]))[0];
  expect([g.tratada, g.motivo_sem_acao]).toEqual([1, 'Publicação apenas informativa']);
  await expect(linha(page, 'com processo cadastrado').locator('.badge', { hasText: /^Tratada$/ })).toBeVisible();
  await esperarAvisosSumirem(page);
  await abrirMenuAcoes(page, linha(page, 'com processo cadastrado'));
  await expect(item(page, 'Excluir')).toHaveCount(0);                                         // tratada não pode ser excluída
  await item(page, 'Reabrir').click();
  await aviso(page, 'Publicação reaberta');
  const r = (await noBanco('SELECT tratada, motivo_sem_acao FROM publicacoes WHERE id = ?', [cad]))[0];
  expect([r.tratada, r.motivo_sem_acao]).toEqual([0, null]);
  await expect(linha(page, 'com processo cadastrado').locator('.badge', { hasText: /^Pendente$/ })).toBeVisible();
  void sem;
});

test('@critical Publicações: Atribuir (janela, marcar quem recebe, aviso ao usuário) e quem recebe passa a ver só aquela publicação', async ({ page }) => {
  const x = await nova({ data: '2026-02-14', numero_processo: PROC, texto: 'Pub E2E T4 atribuída ao recebedor' });
  await nova({ data: '2026-02-14', numero_processo: SEM_PROC, texto: 'Pub E2E T4 de outra pessoa' });
  const usuario = (await noBanco("SELECT id FROM usuarios WHERE login = 'pub_recebedor'"))[0].id;
  await abrir(page);
  await procurar(page, 'Pub E2E T4');
  await abrirMenuAcoes(page, linha(page, 'atribuída ao recebedor'));
  await item(page, 'Atribuir').click();
  const m = janela(page, 'Atribuir publicação');
  await expect(m).toBeVisible();
  await expect(m.getByRole('checkbox', { name: /Usuário pub_recebedor/ })).not.toBeChecked();
  await semViolacoes(page, 'janela Atribuir publicação');
  await m.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacao_usuario WHERE publicacao_id = ?', [x]))[0].n).toBe(0);
  await abrirMenuAcoes(page, linha(page, 'atribuída ao recebedor'));
  await item(page, 'Atribuir').click();
  await janela(page, 'Atribuir publicação').getByRole('checkbox', { name: /Usuário pub_recebedor/ }).check();
  await janela(page, 'Atribuir publicação').getByRole('button', { name: 'Salvar' }).click();
  await aviso(page, 'Atribuição atualizada');
  expect((await noBanco('SELECT usuario_id FROM publicacao_usuario WHERE publicacao_id = ?', [x])).map(r => r.usuario_id)).toEqual([usuario]);
  expect((await noBanco('SELECT tratada FROM publicacoes WHERE id = ?', [x]))[0].tratada).toBe(1);   // quem atribui resolve a triagem
  expect((await noBanco("SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND mensagem LIKE '%foi atribuída a você%'", [usuario]))[0].n).toBeGreaterThan(0);
  // o recebedor entra e vê SÓ a que recebeu
  await esperarAvisosSumirem(page);
  await page.context().clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* sem armazenamento */ } });
  await abrir(page, 'pub_recebedor');
  await page.getByLabel('Status').selectOption('');
  await page.getByLabel('Pesquisar no conteúdo').fill('Pub E2E T4');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'atribuída ao recebedor')).toBeVisible();
  await expect(page.getByText('de outra pessoa')).toHaveCount(0);
});

test('@critical Publicações: Excluir uma (confirmação, Cancelar não apaga) e Excluir selecionadas (tratada não entra na seleção)', async ({ page }) => {
  const a = await nova({ data: '2026-02-15', texto: 'Pub E2E T5 uma' });
  const b = await nova({ data: '2026-02-15', texto: 'Pub E2E T5 dois' });
  const c = await nova({ data: '2026-02-15', texto: 'Pub E2E T5 tres' });
  const t = await nova({ data: '2026-02-15', texto: 'Pub E2E T5 tratada', tratada: 1 });
  await abrir(page);
  await procurar(page, 'Pub E2E T5');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(linha(page, 'T5 tratada').getByRole('checkbox', { name: 'Selecionar esta publicação' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Excluir selecionadas/ })).toBeDisabled();
  // uma só
  await abrirMenuAcoes(page, linha(page, 'T5 uma'));
  await item(page, 'Excluir').click();
  const conf = janela(page, 'Excluir publicação');
  await expect(conf).toBeVisible();
  await expect(conf).toContainText('removida permanentemente');
  await semViolacoes(page, 'confirmação Excluir publicação');
  await conf.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [a]))[0].n).toBe(1);
  await abrirMenuAcoes(page, linha(page, 'T5 uma'));
  await item(page, 'Excluir').click();
  await janela(page, 'Excluir publicação').getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Publicação excluída');
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [a]))[0].n).toBe(0);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await esperarAvisosSumirem(page);
  // selecionadas
  await linha(page, 'T5 dois').getByRole('checkbox', { name: 'Selecionar esta publicação' }).check();
  await linha(page, 'T5 tres').getByRole('checkbox', { name: 'Selecionar esta publicação' }).check();
  await page.getByRole('button', { name: /Excluir selecionadas \(2\)/ }).click();
  const conf2 = janela(page, 'Excluir selecionadas');
  await expect(conf2).toContainText('2 publicação(ões) selecionada(s)');
  await conf2.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id IN (?, ?)', [b, c]))[0].n).toBe(2);
  await page.getByRole('button', { name: /Excluir selecionadas \(2\)/ }).click();
  await janela(page, 'Excluir selecionadas').getByRole('button', { name: 'Excluir selecionadas' }).click();
  await aviso(page, '2 publicação(ões) excluída(s)');
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id IN (?, ?)', [b, c]))[0].n).toBe(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id = ?', [t]))[0].n).toBe(1);   // a tratada continua
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('@critical Publicações AASP — importar: aviso sem integração, data obrigatória, importa o dia (sem duplicar) e mostra o resultado na lista', async ({ page }) => {
  await configurar('aasp', 0, { chave: 'chave-e2e', url: `http://127.0.0.1:${falso.porta}/aasp` });
  await abrir(page);
  await expect(page.getByText('A integração com a AASP não está configurada.')).toBeVisible();
  await page.getByRole('button', { name: 'Importar publicações' }).click();
  await page.getByLabel('Dia da disponibilização (AASP)').fill('2026-11-10');
  await page.getByRole('button', { name: /Buscar publicações do dia/ }).click();
  await aviso(page, 'não está configurada');
  expect((await noBanco("SELECT COUNT(*) AS n FROM publicacoes WHERE texto LIKE 'Pub E2E importada AASP%'"))[0].n).toBe(0);
  await esperarAvisosSumirem(page);
  // liga a integração (a tela só consulta o estado ao abrir)
  await configurar('aasp', 1, { chave: 'chave-e2e', url: `http://127.0.0.1:${falso.porta}/aasp` });
  await page.reload();
  await aguardarTelaPronta(page);
  await expect(page.getByText('A integração com a AASP não está configurada.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Importar publicações' }).click();
  await page.getByLabel('Dia da disponibilização (AASP)').fill('');
  await page.getByRole('button', { name: /Buscar publicações do dia/ }).click();
  await aviso(page, 'Escolha a data');
  await esperarAvisosSumirem(page);
  await semViolacoes(page, 'painel Importar publicações (AASP)');
  await page.getByLabel('Dia da disponibilização (AASP)').fill('2026-11-10');
  await page.getByRole('button', { name: /Buscar publicações do dia/ }).click();
  await aviso(page, '2 nova(s) publicação(ões) importada(s).');
  expect(pedidos.some(p => p.includes('/aasp') && p.includes('data=10%2F11%2F2026') && p.includes('chave=chave-e2e'))).toBe(true);
  await expect(page.locator('tbody tr')).toHaveCount(2);                                      // a tela vai para o dia importado
  await expect(linha(page, 'importada AASP um')).toBeVisible();
  expect((await noBanco("SELECT COUNT(*) AS n FROM publicacoes WHERE fonte = 'aasp' AND texto LIKE 'Pub E2E importada AASP%'"))[0].n).toBe(2);
  await esperarAvisosSumirem(page);
  await page.getByRole('button', { name: 'Importar publicações' }).click();
  await page.getByRole('button', { name: /Buscar publicações do dia/ }).click();
  await aviso(page, 'Nenhuma publicação nova');
  expect((await noBanco("SELECT COUNT(*) AS n FROM publicacoes WHERE fonte = 'aasp' AND texto LIKE 'Pub E2E importada AASP%'"))[0].n).toBe(2);
});

test('@critical Publicações CNJ / DJEN: a aba é separada, valida o período, importa sem duplicar e a lista mostra tribunal e OAB', async ({ page }) => {
  await configurar('cnj', 1, { url: `http://127.0.0.1:${falso.porta}/cnj`, oabs: [{ numero: '12345', uf: 'SP' }] });
  await nova({ fonte: 'cnj', id_cnj: 870001, data: '2026-11-12', texto: 'Pub E2E CNJ já existente', tribunal: 'TRT15' });
  await nova({ fonte: 'aasp', data: '2026-11-12', texto: 'Pub E2E só da AASP' });
  await abrir(page);
  await page.getByRole('button', { name: 'CNJ / DJEN', exact: true }).click();
  await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Importar publicações' }).click();
  await page.getByLabel('De (CNJ)').fill('');                                                    // as datas começam em "hoje"; limpa para testar a exigência
  await page.getByLabel('Até', { exact: true }).fill('');
  await page.getByRole('button', { name: /Buscar publicações do período/ }).click();
  await aviso(page, 'Escolha o período');
  await esperarAvisosSumirem(page);
  await page.getByLabel('De (CNJ)').fill('2026-11-30');
  await page.getByLabel('Até', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: /Buscar publicações do período/ }).click();
  await aviso(page, 'A data final não pode ser anterior à inicial');
  await esperarAvisosSumirem(page);
  await page.getByLabel('De (CNJ)').fill('2026-01-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-05-01');
  await page.getByRole('button', { name: /Buscar publicações do período/ }).click();
  await aviso(page, 'O período de busca não pode passar de 3 meses.');
  await esperarAvisosSumirem(page);
  await semViolacoes(page, 'painel Importar publicações (CNJ)');
  await page.getByLabel('De (CNJ)').fill('2026-11-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-11-30');
  await page.getByRole('button', { name: /Buscar publicações do período/ }).click();
  await aviso(page, '2 nova(s) publicação(ões) importada(s).');
  expect(pedidos.some(p => p.includes('/cnj') && p.includes('numeroOab=12345') && p.includes('ufOab=SP'))).toBe(true);
  const gravadas = await noBanco("SELECT id_cnj, oab, tribunal, fonte FROM publicacoes WHERE id_cnj IN (880001, 880002) ORDER BY id_cnj");
  expect(gravadas.map(g => [g.id_cnj, g.oab, g.tribunal, g.fonte])).toEqual([[880001, '12345/SP', 'TRT15', 'cnj'], [880002, '12345/SP', 'TRT2', 'cnj']]);
  await esperarAvisosSumirem(page);
  await page.getByRole('button', { name: 'Importar publicações' }).click();
  await page.getByRole('button', { name: /Buscar publicações do período/ }).click();
  await aviso(page, 'Nenhuma publicação nova');
  expect((await noBanco('SELECT COUNT(*) AS n FROM publicacoes WHERE id_cnj IN (880001, 880002)'))[0].n).toBe(2);
  // a lista do CNJ não mistura com a da AASP
  await page.getByRole('button', { name: 'Filtrar e pesquisar' }).click();
  await procurar(page, 'Pub E2E');
  await expect(page.getByText('Pub E2E só da AASP')).toHaveCount(0);
  await expect(linha(page, 'CNJ já existente')).toBeVisible();
  await semViolacoes(page, 'tela de Publicações (CNJ)');
});

test('@critical Publicações: janelas de E-mail, Criar prazo, tarefa e compromisso abrem, validam e cancelam sem gravar nada', async ({ page }) => {
  const x = await nova({ data: '2026-02-16', numero_processo: PROC, texto: 'Pub E2E T8 janelas de ação' });
  const antes = (await noBanco('SELECT (SELECT COUNT(*) FROM prazos_processo) AS p, (SELECT COUNT(*) FROM tarefas) AS t, (SELECT COUNT(*) FROM agenda_compromisso) AS c, (SELECT COUNT(*) FROM log_emails) AS e'))[0];
  await abrir(page);
  await procurar(page, 'Pub E2E T8');
  await abrirMenuAcoes(page, linha(page, 'T8 janelas'));
  await item(page, 'Enviar por e-mail').click();
  const em = janela(page, 'Enviar publicação por e-mail');
  await expect(em).toBeVisible();
  await expect(em.getByLabel('Mensagem (opcional)')).toBeVisible();
  await semViolacoes(page, 'janela Enviar publicação por e-mail');
  await em.getByRole('button', { name: /Enviar/ }).last().click();
  await expect(em.getByText('Selecione ao menos um destinatário.')).toBeVisible();
  await em.getByRole('button', { name: 'Cancelar' }).click();
  await expect(em).toHaveCount(0);
  for (const [menu, titulo] of [['Criar prazo', /prazo/i], ['Criar tarefa', /tarefa/i], ['Criar compromisso', /compromisso/i]]) {
    await abrirMenuAcoes(page, linha(page, 'T8 janelas'));
    await item(page, menu).click();
    const j = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).first();
    await expect(j).toBeVisible();
    await semViolacoes(page, `janela ${menu}`);
    await j.getByRole('button', { name: 'Cancelar' }).click();
    await expect(j).toHaveCount(0);
  }
  const depois = (await noBanco('SELECT (SELECT COUNT(*) FROM prazos_processo) AS p, (SELECT COUNT(*) FROM tarefas) AS t, (SELECT COUNT(*) FROM agenda_compromisso) AS c, (SELECT COUNT(*) FROM log_emails) AS e'))[0];
  expect(depois).toEqual(antes);
  expect((await noBanco('SELECT tratada FROM publicacoes WHERE id = ?', [x]))[0].tratada).toBe(0);   // cancelar não trata a publicação
});

test('Permissões: quem só VISUALIZA não vê Importar, "Ver", seleção, Atribuir nem Excluir, e vê só o que recebeu', async ({ page }) => {
  const meu = await nova({ data: '2026-02-17', numero_processo: PROC, texto: 'Pub E2E T9 recebida' });
  await nova({ data: '2026-02-17', numero_processo: PROC, texto: 'Pub E2E T9 alheia' });
  const u = (await noBanco("SELECT id FROM usuarios WHERE login = 'pub_outro'"))[0].id;
  await noBanco('INSERT INTO publicacao_usuario (publicacao_id, usuario_id, atribuida_por) VALUES (?, ?, 1)', [meu, u]);
  await abrir(page, 'pub_outro');
  await expect(page.getByRole('button', { name: 'Importar publicações' })).toHaveCount(0);
  await expect(page.getByLabel('Ver publicações')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Marcar/desmarcar todas da página' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excluir selecionadas/ })).toHaveCount(0);
  await page.getByLabel('Status').selectOption('');
  await page.getByLabel('Pesquisar no conteúdo').fill('Pub E2E T9');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(linha(page, 'T9 recebida')).toBeVisible();
  await abrirMenuAcoes(page, linha(page, 'T9 recebida'));
  await expect(item(page, 'Histórico')).toBeVisible();
  for (const nome of ['Atribuir', 'Excluir']) await expect(item(page, nome)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await semViolacoes(page, 'Publicações para quem só visualiza');
});
