import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers';

// O SINO de notificações (cabeçalho do sistema): o número vermelho, a lista de novas, "Ver todas" (histórico), "Marcar todas como lidas".
// O servidor já tem teste próprio (notificacoes-alertas); aqui é a TELA que a pessoa vê. Cada teste usa o seu usuário, com as notificações criadas no banco.
const require = createRequire(import.meta.url);
const { conectarBancoTeste } = require('../../backend/tests/support/testDatabase');
const bcrypt = require('../../backend/node_modules/bcryptjs');

const SENHA = 'Senha@Forte1';
const MARCA = 'zzsino';
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const letras = (n) => { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(97 + (crypto.randomBytes(1)[0] % 26)); return s; };
async function novoUsuario() {
  const login = `${MARCA}${letras(8)}`;
  const id = (await noBanco(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, notif_email, google_agenda_ativo) VALUES (?, ?, ?, ?, 'advogado', 2, 1, 0, 0)`,
    [`Usuario Sino ${login}`, login, bcrypt.hashSync(SENHA, 4), `${login}@example.invalid`])).insertId;
  return { id, login };
}
async function notificar(usuarioId, mensagem, { lida = 0, criadoEm = null } = {}) {
  await noBanco('INSERT INTO notificacoes (usuario_id, mensagem, lida, criado_em) VALUES (?, ?, ?, COALESCE(?, NOW()))', [usuarioId, mensagem, lida, criadoEm]);
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const sino = (page) => page.getByTitle('Notificações');
const badge = (page) => sino(page).locator('span');
const painel = (page) => page.locator('div').filter({ has: page.locator('strong', { hasText: /^Notificações$/ }) }).last();

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });
test.afterAll(async () => {
  const ids = (await noBanco('SELECT id FROM usuarios WHERE login LIKE ?', [`${MARCA}%`])).map(u => u.id);
  for (const id of ids) {
    await noBanco('DELETE FROM notificacoes WHERE usuario_id = ?', [id]).catch(() => {});
    await noBanco('DELETE FROM logs_auditoria WHERE usuario_id = ?', [id]).catch(() => {});
    await noBanco('DELETE FROM usuarios WHERE id = ?', [id]).catch(() => {});
  }
});

test('@critical Sino: sem notificação não tem número; abre mostrando "Nenhuma notificação nova", sem o botão de marcar como lidas; clicar fora fecha', async ({ page }) => {
  const u = await novoUsuario();
  await loginPelaTela(page, u.login, SENHA);
  await expect(sino(page)).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
  await sino(page).click();
  await expect(page.getByText('Nenhuma notificação nova')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar todas como lidas' })).toHaveCount(0);
  await semViolacoes(page, 'sino aberto e vazio');
  await page.locator('h2').first().click();                                                       // clique fora
  await expect(page.getByText('Nenhuma notificação nova')).toHaveCount(0);
});

test('@critical Sino: o número vermelho conta as não lidas, a lista mostra as mensagens com data e hora, "Ver todas" traz também as já lidas (e "Ver só as novas" volta)', async ({ page }) => {
  const u = await novoUsuario();
  await notificar(u.id, 'Novo prazo atribuído a você: Recurso — vence em 20/10/2026', { criadoEm: '2026-10-07 09:15:00' });
  await notificar(u.id, 'Fulano completou 18 anos — confira a representação legal nos processos.', { criadoEm: '2026-10-08 10:30:00' });
  await notificar(u.id, 'Aviso antigo já lido', { lida: 1, criadoEm: '2026-09-01 08:00:00' });
  await loginPelaTela(page, u.login, SENHA);
  await expect(badge(page)).toHaveText('2');                                                      // a lida não conta
  await sino(page).click();
  await expect(page.getByText('Novo prazo atribuído a você: Recurso — vence em 20/10/2026')).toBeVisible();
  await expect(page.getByText('Fulano completou 18 anos')).toBeVisible();
  await expect(page.getByText('Aviso antigo já lido')).toHaveCount(0);
  await expect(page.getByText('08/10/2026').first()).toBeVisible();                              // data e hora de cada aviso
  const ordem = await page.getByText(/^(Novo prazo atribuído|Fulano completou)/).allInnerTexts();
  expect(ordem.map(t => t.split(' ')[0])).toEqual(['Fulano', 'Novo']);                              // a mais nova primeiro
  await semViolacoes(page, 'sino com notificações novas');
  await page.getByRole('button', { name: 'Ver todas' }).click();
  await expect(page.getByText('Aviso antigo já lido')).toBeVisible();
  await expect(page.getByRole('button', { name: '← Ver só as novas' })).toBeVisible();
  await expect(badge(page)).toHaveText('2');                                                      // só olhar o histórico não marca nada como lido
  await semViolacoes(page, 'sino com o histórico (lidas em cinza)');
  await page.getByRole('button', { name: '← Ver só as novas' }).click();
  await expect(page.getByText('Aviso antigo já lido')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver todas' })).toBeVisible();
});

test('@critical Sino: "Marcar todas como lidas" zera o número, fecha o painel, grava no banco e as lidas continuam no histórico; só as da própria pessoa', async ({ page }) => {
  const u = await novoUsuario(); const outro = await novoUsuario();
  await notificar(u.id, 'Primeira do sino'); await notificar(u.id, 'Segunda do sino'); await notificar(outro.id, 'Do outro usuário');
  await loginPelaTela(page, u.login, SENHA);
  await expect(badge(page)).toHaveText('2');
  await sino(page).click();
  await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(badge(page)).toHaveCount(0);
  await expect(page.getByText('Primeira do sino')).toHaveCount(0);                                // painel fechou
  expect((await noBanco('SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND lida = 0', [u.id]))[0].n).toBe(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND lida = 0', [outro.id]))[0].n).toBe(1);
  await sino(page).click();
  await expect(page.getByText('Nenhuma notificação nova')).toBeVisible();
  await page.getByRole('button', { name: 'Ver todas' }).click();
  await expect(page.getByText('Primeira do sino')).toBeVisible();
  await expect(page.getByText('Segunda do sino')).toBeVisible();
  await expect(page.getByText('Do outro usuário')).toHaveCount(0);
  await page.reload();
  await expect(badge(page)).toHaveCount(0);                                                       // continua zerado depois de recarregar
});

test('@critical Sino: mais de 99 não lidas aparece como "99+", a lista mostra no máximo as 20 mais novas e o histórico as 50 mais novas', async ({ page }) => {
  const u = await novoUsuario();
  const linhas = [];
  for (let i = 1; i <= 105; i += 1) linhas.push([u.id, `Aviso numero ${i}`]);
  const conn = await conectarBancoTeste();
  try { await conn.query('INSERT INTO notificacoes (usuario_id, mensagem) VALUES ?', [linhas]); } finally { await conn.end(); }
  await loginPelaTela(page, u.login, SENHA);
  await expect(badge(page)).toHaveText('99+');
  await sino(page).click();
  await expect(page.getByText(/^Aviso numero \d+$/)).toHaveCount(20);
  await page.getByRole('button', { name: 'Ver todas' }).click();
  await expect(page.getByText(/^Aviso numero \d+$/)).toHaveCount(50);
});

test('@critical Sino: erro do servidor ao carregar a lista não quebra a tela; o painel continua abrindo', async ({ page }) => {
  const u = await novoUsuario();
  await notificar(u.id, 'Aviso que não vai carregar');
  await loginPelaTela(page, u.login, SENHA);
  await expect(badge(page)).toHaveText('1');
  await page.route('**/api/notificacoes', rota => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await sino(page).click();
  await expect(page.locator('strong', { hasText: /^Notificações$/ })).toBeVisible();               // o painel abre, mesmo sem a lista
  await expect(badge(page)).toHaveText('1');                                                      // a tela segue de pé e o número continua
});

test('@critical Sino: um prazo delegado por outra pessoa chega ao sino de quem recebeu, de ponta a ponta', async ({ page, browser, baseURL }) => {
  const quem = await novoUsuario();
  const admin = await browser.newContext({ baseURL });
  const paginaAdmin = await admin.newPage(); await bloquearRedeExterna(paginaAdmin);
  await loginPelaTela(paginaAdmin);
  const token = await paginaAdmin.evaluate(() => sessionStorage.getItem('token'));
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const r = await paginaAdmin.request.post('/api/prazos', {
    headers: { Authorization: `Bearer ${token}` },
    data: { processo_id: 1, descricao: 'Prazo do sino de ponta a ponta', data_inicio: hoje, data_final: hoje, quantidade: 1, tipo_dias: 'corridos', delegado_para: quem.id },
  });
  expect(r.status(), await r.text()).toBe(201);
  await admin.close();
  await loginPelaTela(page, quem.login, SENHA);
  await expect(badge(page)).toHaveText('1');
  await sino(page).click();
  await expect(page.getByText(/Novo prazo atribuído a você: Prazo do sino de ponta a ponta/)).toBeVisible();
});
