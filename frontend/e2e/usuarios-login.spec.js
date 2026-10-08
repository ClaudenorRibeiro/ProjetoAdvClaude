import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers';

// Telas de ENTRADA e de ACESSO: Login, "Esqueci minha senha", Redefinir senha (link do e-mail), Configurações > Usuários e Configurações > Permissões.
// Um erro aqui deixa gente de fora, ou deixa entrar quem não devia. O servidor já tem teste próprio (auth e usuarios-permissoes); aqui é a TELA.
// Cada situação usa os seus próprios usuários (sessão única por usuário e limite de tentativas por login).
const require = createRequire(import.meta.url);
const { conectarBancoTeste } = require('../../backend/tests/support/testDatabase');
const bcrypt = require('../../backend/node_modules/bcryptjs');

const SENHA = 'Senha@Forte1';
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
let SEQ = 0;
const MARCA = 'zzui';                                   // todos os logins criados aqui começam assim (limpeza no fim)
const letras = (n) => { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(97 + (crypto.randomBytes(1)[0] % 26)); return s; };
async function novoUsuario({ nivel = 2, ativo = 1, nome = null, email = true, permissoes = [] } = {}) {
  SEQ += 1;
  const login = `${MARCA}${letras(8)}`;
  const id = (await noBanco(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, notif_email, google_agenda_ativo) VALUES (?, ?, ?, ?, 'advogado', ?, ?, 0, 0)`,
    [nome || `Usuario Ui ${login}`, login, bcrypt.hashSync(SENHA, 4), email ? `${login}@example.invalid` : null, nivel, ativo])).insertId;
  for (const [m, s, a] of permissoes) await noBanco('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return { id, login, nome: nome || `Usuario Ui ${login}` };
}
const linhaDoBanco = async (id) => (await noBanco('SELECT * FROM usuarios WHERE id = ?', [id]))[0];
const aviso = (page, texto) => expect(page.locator('.Toastify__toast').filter({ hasText: texto }).first()).toBeVisible();
async function avisosSumirem(page) { await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 }); }
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await avisosSumirem(page);
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const campoLogin = (page) => page.getByPlaceholder('Seu login');
const campoSenha = (page) => page.getByPlaceholder('Sua senha');
const entrar = (page) => page.getByRole('button', { name: 'Entrar', exact: true });
async function abrirLogin(page) { await page.goto('/login'); await expect(entrar(page)).toBeEnabled(); }
async function tentarEntrar(page, login, senha) {
  await campoLogin(page).fill(login); await campoSenha(page).fill(senha); await entrar(page).click();
}
const novaSenhaOk = 'Nova@Senha9';

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });
test.afterAll(async () => {
  const ids = (await noBanco('SELECT id FROM usuarios WHERE login LIKE ?', [`${MARCA}%`])).map(u => u.id);
  for (const id of ids) {
    await noBanco('DELETE FROM logs_auditoria WHERE usuario_id = ?', [id]).catch(() => {});
    await noBanco('DELETE FROM tblpasta WHERE criado_por = ?', [id]).catch(() => {});
    await noBanco('UPDATE usuarios SET criado_por = NULL WHERE criado_por = ?', [id]).catch(() => {});
    await noBanco('DELETE FROM usuarios WHERE id = ?', [id]).catch(() => {});
  }
});

// ============================================================ LOGIN
test('@critical Login: tela, campos vazios, senha errada, login que não existe (mesma mensagem), olhinho, servidor fora do ar e acessibilidade', async ({ page }) => {
  const u = await novoUsuario();
  await abrirLogin(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(campoLogin(page)).toBeFocused();
  await semViolacoes(page, 'Login');
  await entrar(page).click();
  await expect(page.locator('.login-erro')).toHaveText('Preencha o login e a senha');
  await campoLogin(page).fill(u.login); await entrar(page).click();
  await expect(page.locator('.login-erro')).toHaveText('Preencha o login e a senha');
  await tentarEntrar(page, u.login, 'Errada@123');
  await expect(page.locator('.login-erro')).toHaveText('Login ou senha incorretos');
  await tentarEntrar(page, `${MARCA}naoexiste`, SENHA);
  await expect(page.locator('.login-erro')).toHaveText('Login ou senha incorretos');            // não revela qual dos dois estava errado
  await expect(page).toHaveURL(/\/login$/);
  // olhinho: só troca password <-> text, sem apagar o que foi digitado
  await campoSenha(page).fill('Texto@123');
  await expect(campoSenha(page)).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(campoSenha(page)).toHaveAttribute('type', 'text');
  await expect(campoSenha(page)).toHaveValue('Texto@123');
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(campoSenha(page)).toHaveAttribute('type', 'password');
  // servidor fora do ar durante o login: aviso, sem travar o botão
  await page.route('**/api/auth/login', rota => rota.abort('connectionrefused'));
  await tentarEntrar(page, u.login, SENHA);
  await expect(page.locator('.login-erro')).toHaveText('Erro ao conectar com o servidor');
  await expect(entrar(page)).toBeEnabled();
  await page.unroute('**/api/auth/login');
  // 500 do servidor: mostra a mensagem que ele mandou
  await page.route('**/api/auth/login', rota => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }));
  await entrar(page).click();
  await expect(page.locator('.login-erro')).toHaveText('Erro interno no servidor. Tente novamente.');
});

test('@critical Login: entrar certo leva ao Dashboard e grava a sessão; usuário desativado não entra; sair e voltar pela URL pede login de novo', async ({ page }) => {
  const u = await novoUsuario();
  const inativo = await novoUsuario({ ativo: 0 });
  await abrirLogin(page);
  await tentarEntrar(page, inativo.login, SENHA);
  await expect(page.locator('.login-erro')).toHaveText('Login ou senha incorretos');
  await tentarEntrar(page, `  ${u.login}  `, SENHA);                                             // espaços nas pontas do login não atrapalham
  await page.waitForURL('**/dashboard');
  expect(await page.evaluate(() => !!sessionStorage.getItem('token'))).toBe(true);
  expect((await linhaDoBanco(u.id)).sessao_atual).toBeTruthy();
  expect((await linhaDoBanco(u.id)).ultimo_acesso).toBeTruthy();
  // usuário sem permissão nenhuma: entra, mas as telas de módulo o mandam de volta (já coberto em qualidade.spec; aqui só a rota protegida sem sessão)
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/pessoas');
  await expect(page).toHaveURL(/\/login$/);
});

async function derrubarSessaoDe(u, browser, baseURL, page) {
  await loginPelaTela(page, u.login, SENHA);
  const outro = await browser.newContext({ baseURL });                                           // outro navegador = outra identidade de dispositivo
  const pagina2 = await outro.newPage();
  await bloquearRedeExterna(pagina2);
  await loginPelaTela(pagina2, u.login, SENHA);
  return { outro, pagina2 };
}
const AVISO_OUTRO_DISPOSITIVO = 'Sua sessão foi aberta em outro dispositivo. Faça login novamente.';

test('@critical Login: entrar em OUTRO navegador derruba o primeiro; quem está usando o sistema volta ao login com o aviso de sessão aberta em outro dispositivo', async ({ page, browser, baseURL }) => {
  const u = await novoUsuario({ permissoes: [['pessoas', null, 'visualizar']] });
  const { outro, pagina2 } = await derrubarSessaoDe(u, browser, baseURL, page);
  await page.locator('aside.sidebar').getByText('Pessoas', { exact: true }).first().click();      // próxima ação dentro do sistema, sem recarregar
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(AVISO_OUTRO_DISPOSITIVO)).toBeVisible();
  await semViolacoes(page, 'Login com aviso de sessão encerrada');
  await pagina2.goto('/pessoas');
  await expect(pagina2).toHaveURL(/\/pessoas$/);                                                  // o novo continua dentro
  await outro.close();
});

test('@critical Login: se a página for RECARREGADA depois de a sessão cair em outro dispositivo, o aviso também aparece no login', async ({ page, browser, baseURL }) => {
  const u = await novoUsuario({ permissoes: [['pessoas', null, 'visualizar']] });
  const { outro } = await derrubarSessaoDe(u, browser, baseURL, page);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(AVISO_OUTRO_DISPOSITIVO)).toBeVisible();
  await outro.close();
});

test('@critical Esqueci minha senha: abre, valida o campo, Cancelar e ✕ fecham, e a resposta é a MESMA para login que existe e que não existe (só o que existe ganha o link)', async ({ page }) => {
  const u = await novoUsuario();
  await abrirLogin(page);
  const janela = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Esqueci minha senha' }) });
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(janela).toBeVisible();
  await expect(janela.getByLabel('Login ou E-mail')).toBeFocused();
  await semViolacoes(page, 'janela Esqueci minha senha');
  await janela.getByRole('button', { name: 'Enviar link' }).click();
  await expect(janela.getByText('Informe o login ou e-mail')).toBeVisible();
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela).toHaveCount(0);
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(janela.getByLabel('Login ou E-mail')).toHaveValue('');                              // reabre vazia
  await janela.locator('.modal-fechar').click();
  await expect(janela).toHaveCount(0);
  // login que existe
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await janela.getByLabel('Login ou E-mail').fill(u.login);
  await janela.getByRole('button', { name: 'Enviar link' }).click();
  const sucesso = janela.getByText(/^✅/);
  await expect(sucesso).toBeVisible();
  const textoExiste = await sucesso.innerText();
  expect((await noBanco('SELECT COUNT(*) AS n FROM reset_tokens WHERE usuario_id = ? AND usado = 0', [u.id]))[0].n).toBe(1);
  // login que não existe: mesma mensagem, nenhum link
  await janela.locator('.modal-fechar').click();
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await janela.getByLabel('Login ou E-mail').fill(`${MARCA}naoexiste`);
  await janela.getByRole('button', { name: 'Enviar link' }).click();
  await expect(sucesso).toBeVisible();
  expect(await sucesso.innerText()).toBe(textoExiste);
  expect((await noBanco("SELECT COUNT(*) AS n FROM reset_tokens r JOIN usuarios u ON u.id = r.usuario_id WHERE u.login = ?", [`${MARCA}naoexiste`]))[0].n).toBe(0);
  // erro do servidor aparece dentro da janela, sem fechar
  await janela.locator('.modal-fechar').click();
  await page.route('**/api/auth/esqueci-senha', rota => rota.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' }) }));
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await janela.getByLabel('Login ou E-mail').fill('qualquer');
  await janela.getByRole('button', { name: 'Enviar link' }).click();
  await expect(janela.getByText('Muitas tentativas. Aguarde alguns minutos.')).toBeVisible();
  await expect(janela.getByLabel('Login ou E-mail')).toHaveValue('qualquer');
});

// ============================================================ REDEFINIR SENHA (link do e-mail)
async function criarLink(usuarioId, { minutos = 60, usado = 0 } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  await noBanco(`INSERT INTO reset_tokens (usuario_id, token, expires_at, usado) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`, [usuarioId, token, minutos, usado]);
  return token;
}

test('@critical Redefinir senha — link ruim: sem link, link inventado, vencido e já usado mostram "Link inválido ou expirado" e levam de volta ao login', async ({ page }) => {
  const u = await novoUsuario();
  const links = [
    '/redefinir-senha', '/redefinir-senha?token=', '/redefinir-senha?token=lixo', '/redefinir-senha?token=1', `/redefinir-senha?token=${'a'.repeat(64)}`,
    `/redefinir-senha?token=${await criarLink(u.id, { minutos: -5 })}`, `/redefinir-senha?token=${await criarLink(u.id, { usado: 1 })}`,
  ];
  for (const link of links) {
    await page.goto(link);
    await expect(page.getByText('Link inválido ou expirado')).toBeVisible();
    await expect(page.getByLabel('Nova senha', { exact: true })).toHaveCount(0);
  }
  await semViolacoes(page, 'Redefinir senha com link inválido');
  await page.getByRole('button', { name: 'Voltar ao Login' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('@critical Redefinir senha — link bom: mostra o nome, valida (curta, diferentes, fraca), olhinhos independentes, troca a senha, volta ao login e o link não vale duas vezes', async ({ page }) => {
  const u = await novoUsuario();
  const token = await criarLink(u.id);
  await page.goto(`/redefinir-senha?token=${token}`);
  await expect(page.getByText(`Olá, ${u.nome}`)).toBeVisible();
  await expect(page.getByLabel('Nova senha', { exact: true })).toBeFocused();
  await semViolacoes(page, 'Redefinir senha com link válido');
  const enviar = page.getByRole('button', { name: 'Redefinir Senha' });
  const erro = page.getByText(/A senha deve|As senhas não/).first();
  await page.getByLabel('Nova senha', { exact: true }).fill('Ab1!');
  await enviar.click();
  await expect(page.getByText('A senha deve ter no mínimo 6 caracteres')).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill(novaSenhaOk);
  await page.getByLabel('Confirmar nova senha').fill('Diferente@9');
  await enviar.click();
  await expect(page.getByText('As senhas não coincidem')).toBeVisible();
  // passa na tela (6 letras ou mais) mas o servidor exige a regra completa: o aviso do servidor aparece e nada muda
  await page.getByLabel('Nova senha', { exact: true }).fill('abcdefgh');
  await page.getByLabel('Confirmar nova senha').fill('abcdefgh');
  await enviar.click();
  await expect(page.getByText(/A senha deve conter pelo menos 1 letra maiúscula/)).toBeVisible();
  expect(bcrypt.compareSync(SENHA, (await linhaDoBanco(u.id)).senha_hash)).toBe(true);
  // olhinhos: cada campo tem o seu
  const olhos = page.locator('form button[aria-label$="senha"]');                                // um por campo (o texto do botão muda ao clicar)
  await olhos.nth(0).click();
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveAttribute('type', 'text');
  await expect(page.getByLabel('Confirmar nova senha')).toHaveAttribute('type', 'password');
  await olhos.nth(1).click();
  await expect(page.getByLabel('Confirmar nova senha')).toHaveAttribute('type', 'text');
  // sucesso
  await page.getByLabel('Nova senha', { exact: true }).fill(novaSenhaOk);
  await page.getByLabel('Confirmar nova senha').fill(novaSenhaOk);
  await enviar.click();
  await expect(page.getByText('Senha redefinida com sucesso!')).toBeVisible();
  await semViolacoes(page, 'Redefinir senha concluída');
  await page.waitForURL('**/login', { timeout: 10_000 });
  expect(bcrypt.compareSync(novaSenhaOk, (await linhaDoBanco(u.id)).senha_hash)).toBe(true);
  expect((await noBanco('SELECT usado FROM reset_tokens WHERE token = ?', [token]))[0].usado).toBe(1);
  await tentarEntrar(page, u.login, SENHA);
  await expect(page.locator('.login-erro')).toHaveText('Login ou senha incorretos');             // a antiga não vale mais
  await tentarEntrar(page, u.login, novaSenhaOk);
  await page.waitForURL('**/dashboard');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/redefinir-senha?token=${token}`);                                            // o mesmo link, de novo
  await expect(page.getByText('Link inválido ou expirado')).toBeVisible();
});

test('@critical Redefinir senha: o texto de ajuda e a conferência da tela dizem as MESMAS regras do servidor (8 a 20 caracteres, maiúscula, minúscula, número e especial)', async ({ page }) => {
  const u = await novoUsuario();
  await page.goto(`/redefinir-senha?token=${await criarLink(u.id)}`);
  const dica = await page.getByLabel('Nova senha', { exact: true }).getAttribute('placeholder');
  expect(dica, 'a dica do campo precisa falar do mínimo real (8)').not.toMatch(/6/);
  await page.getByLabel('Nova senha', { exact: true }).fill('Ab1!x');                                            // 5 letras: tem que ser barrada ANTES de ir ao servidor, com o mínimo certo
  await page.getByLabel('Confirmar nova senha').fill('Ab1!x');
  await page.getByRole('button', { name: 'Redefinir Senha' }).click();
  await expect(page.getByText('A senha deve ter no mínimo 8 caracteres')).toBeVisible();
});

// ============================================================ CONFIGURAÇÕES > USUÁRIOS
async function abrirUsuarios(page) {
  await loginPelaTela(page);
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Usuários', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Novo Usuário' })).toBeVisible();
  await aguardarTelaPronta(page);
}
const linhaUsuario = (page, login) => page.locator('tbody tr').filter({ hasText: login }).first();
const janelaUsuario = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) });
async function abrirItem(page, login, nome) {
  await abrirMenuAcoes(page, linhaUsuario(page, login));
  await page.getByRole('button', { name: nome }).click();
}

test('@critical Usuários: lista com nome, login, tipo, OAB e situação (Ativo/Inativo), sem superusuário e sem acessibilidade quebrada', async ({ page }) => {
  const ativo = await novoUsuario({ nome: 'Pessoa Ativa Ui' });
  const inativo = await novoUsuario({ nome: 'Pessoa Inativa Ui', ativo: 0 });
  const sup = await novoUsuario({ nivel: 0 });
  await abrirUsuarios(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Nome', 'Login', 'Tipo', 'OAB', 'Status', 'Ações']);
  await expect(linhaUsuario(page, ativo.login)).toContainText('Pessoa Ativa Ui');
  await expect(linhaUsuario(page, ativo.login).locator('.badge')).toHaveText('Ativo');
  await expect(linhaUsuario(page, inativo.login).locator('.badge')).toHaveText('Inativo');
  await expect(linhaUsuario(page, ativo.login)).toContainText('Advogado');
  await expect(page.getByText(sup.login)).toHaveCount(0);                                         // o superusuário é invisível
  await semViolacoes(page, 'aba Usuários');
  await abrirMenuAcoes(page, linhaUsuario(page, ativo.login));
  for (const item of ['Editar', 'Redefinir senha', 'Histórico', 'Excluir']) await expect(page.getByRole('button', { name: item })).toBeVisible();
});

test('@critical Novo usuário: validações em ordem, login só aceita letras, Cancelar e ✕ não gravam, login repetido avisa, e o criado entra no sistema', async ({ page, browser, baseURL }) => {
  const existente = await novoUsuario();
  await abrirUsuarios(page);
  const janela = janelaUsuario(page, 'Novo Usuário');
  await page.getByRole('button', { name: '+ Novo Usuário' }).click();
  await expect(janela).toBeVisible();
  await semViolacoes(page, 'janela Novo Usuário');
  const salvar = janela.getByRole('button', { name: 'Salvar' });
  await salvar.click(); await aviso(page, 'Nome é obrigatório'); await avisosSumirem(page);
  await janela.getByLabel('Nome completo').fill('maria da silva ui');
  await janela.getByLabel('Nome completo').blur();
  await expect(janela.getByLabel('Nome completo')).toHaveValue('Maria da Silva Ui');              // iniciais em maiúscula
  await salvar.click(); await aviso(page, 'Login é obrigatório'); await avisosSumirem(page);
  const login = janela.getByPlaceholder('Apenas letras');
  await login.fill('Ab12 c-d_e');
  await expect(login).toHaveValue('Abcde');                                                       // número, espaço e símbolo nem entram
  await login.fill(`${MARCA}${letras(8)}`);
  const novoLogin = await login.inputValue();
  await salvar.click(); await aviso(page, 'Senha é obrigatória para novo usuário'); await avisosSumirem(page);
  for (const [senha, msg] of [['Ab1!', 'no mínimo 8'], ['semmaiuscula1!', 'maiúscula'], ['SEMMINUSCULA1!', 'minúscula'], ['SemNumero!!', 'número'], ['SemEspecial1', 'especial'], ['Aa1!' + 'x'.repeat(20), 'no máximo 20']]) {
    await janela.getByLabel('Senha', { exact: true }).fill(senha);
    await salvar.click(); await aviso(page, msg); await avisosSumirem(page);
  }
  expect((await noBanco('SELECT COUNT(*) AS n FROM usuarios WHERE login = ?', [novoLogin]))[0].n).toBe(0);
  // Cancelar e ✕ não gravam
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await expect(janela).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Usuário' }).click();
  await expect(janela.getByLabel('Nome completo')).toHaveValue('');                               // reabre vazia
  await janela.locator('.modal-fechar').click();
  await expect(janela).toHaveCount(0);
  // login que já existe: aviso do servidor e a janela continua com o que foi digitado
  await page.getByRole('button', { name: '+ Novo Usuário' }).click();
  await janela.getByLabel('Nome completo').fill('Repetido Ui');
  await janela.getByPlaceholder('Apenas letras').fill(existente.login);
  await janela.getByLabel('Senha', { exact: true }).fill(SENHA);
  await salvar.click(); await aviso(page, 'Login já está em uso'); await avisosSumirem(page);
  await expect(janela.getByLabel('Nome completo')).toHaveValue('Repetido Ui');
  // criar de verdade: administrador, com OAB e e-mail
  await janela.getByPlaceholder('Apenas letras').fill(novoLogin);
  await janela.getByLabel('Nível de acesso').selectOption({ label: 'Admin' });
  await janela.getByLabel('Nº OAB (advogados)').fill('SP12345');
  await janela.getByLabel('E-mail').fill(`${novoLogin}@example.invalid`);
  await salvar.click(); await aviso(page, 'Usuário criado!');
  await expect(janela).toHaveCount(0);
  await expect(linhaUsuario(page, novoLogin)).toContainText('Repetido Ui');
  const u = (await noBanco('SELECT * FROM usuarios WHERE login = ?', [novoLogin]))[0];
  expect([u.nome, u.nivel, u.ativo, u.oab, u.email, u.criado_por]).toEqual(['Repetido Ui', 1, 1, 'SP12345', `${novoLogin}@example.invalid`, 1]);
  expect(bcrypt.compareSync(SENHA, u.senha_hash)).toBe(true);
  // o usuário criado consegue entrar (em outro navegador)
  const outro = await browser.newContext({ baseURL });
  const p2 = await outro.newPage(); await bloquearRedeExterna(p2);
  await loginPelaTela(p2, novoLogin, SENHA);
  await expect(p2).toHaveURL(/\/dashboard$/);
  await outro.close();
});

test('@critical Editar usuário: abre preenchido (login travado), Cancelar não grava, salvar grava tudo, senha em branco não muda, senha nova muda, desativar/ativar vale no login', async ({ page, browser, baseURL }) => {
  const u = await novoUsuario({ nome: 'Antes Da Edicao Ui' });
  await abrirUsuarios(page);
  const janela = janelaUsuario(page, 'Editar Usuário');
  await abrirItem(page, u.login, /Editar/);
  await expect(janela).toBeVisible();
  await expect(janela.getByLabel('Nome completo')).toHaveValue('Antes Da Edicao Ui');
  await expect(janela.getByPlaceholder('Apenas letras')).toBeDisabled();
  await expect(janela.getByLabel('Nova senha (deixe em branco para não alterar)')).toHaveValue('');
  await expect(janela.getByLabel('Usuário ativo')).toBeChecked();
  await semViolacoes(page, 'janela Editar Usuário');
  await janela.getByLabel('Nome completo').fill('Mudou Mas Cancelou');
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  expect((await linhaDoBanco(u.id)).nome).toBe('Antes Da Edicao Ui');
  const hashAntes = (await linhaDoBanco(u.id)).senha_hash;
  // salvar sem mexer na senha: nome, tipo, nível, OAB e e-mail mudam, a senha continua
  await abrirItem(page, u.login, /Editar/);
  await janela.getByLabel('Nome completo').fill('Depois Da Edicao Ui');
  await janela.getByLabel('Tipo').selectOption({ label: 'Estagiário' });
  await janela.getByLabel('Nível de acesso').selectOption({ label: 'Admin' });
  await janela.getByLabel('Nº OAB (advogados)').fill('RJ999');
  await janela.getByLabel('E-mail').fill('novoemail@example.invalid');
  await janela.getByRole('button', { name: 'Salvar' }).click(); await aviso(page, 'Usuário atualizado!'); await avisosSumirem(page);
  let r = await linhaDoBanco(u.id);
  expect([r.nome, r.tipo, r.nivel, r.oab, r.email, r.senha_hash]).toEqual(['Depois da Edicao Ui', 'estagiario', 1, 'RJ999', 'novoemail@example.invalid', hashAntes]);
  // senha nova fraca é barrada na tela; forte troca
  await abrirItem(page, u.login, /Editar/);
  await janela.getByLabel('Nova senha (deixe em branco para não alterar)').fill('fraca');
  await janela.getByRole('button', { name: 'Salvar' }).click(); await aviso(page, 'no mínimo 8'); await avisosSumirem(page);
  await janela.getByLabel('Nova senha (deixe em branco para não alterar)').fill(novaSenhaOk);
  await janela.getByRole('button', { name: 'Salvar' }).click(); await aviso(page, 'Usuário atualizado!'); await avisosSumirem(page);
  expect(bcrypt.compareSync(novaSenhaOk, (await linhaDoBanco(u.id)).senha_hash)).toBe(true);
  // desativar: some do login; reativar: volta
  await abrirItem(page, u.login, /Editar/);
  await janela.getByLabel('Usuário ativo').uncheck();
  await janela.getByRole('button', { name: 'Salvar' }).click(); await aviso(page, 'Usuário atualizado!'); await avisosSumirem(page);
  await expect(linhaUsuario(page, u.login).locator('.badge')).toHaveText('Inativo');
  const outro = await browser.newContext({ baseURL });
  const p2 = await outro.newPage(); await bloquearRedeExterna(p2);
  await p2.goto('/login'); await tentarEntrar(p2, u.login, novaSenhaOk);
  await expect(p2.locator('.login-erro')).toHaveText('Login ou senha incorretos');
  await abrirItem(page, u.login, /Editar/);
  await janela.getByLabel('Usuário ativo').check();
  await janela.getByRole('button', { name: 'Salvar' }).click(); await aviso(page, 'Usuário atualizado!');
  await expect(linhaUsuario(page, u.login).locator('.badge')).toHaveText('Ativo');
  await tentarEntrar(p2, u.login, novaSenhaOk);
  await p2.waitForURL('**/dashboard');
  await outro.close();
  // erro do servidor aparece e a janela continua
  await avisosSumirem(page);
  await abrirItem(page, u.login, /Editar/);
  await page.route('**/api/configuracoes/usuarios/*', rota => rota.request().method() === 'PUT'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await janela.getByRole('button', { name: 'Salvar' }).click();
  await aviso(page, 'Erro interno no servidor');
  await expect(janela).toBeVisible();
});

test('@critical Último administrador: a tela avisa e NÃO deixa rebaixar nem desativar o único administrador ativo', async ({ page }) => {
  await loginPelaTela(page);
  const outros = await noBanco('SELECT id FROM usuarios WHERE nivel <= 1 AND ativo = 1 AND id <> 1');
  try {
    for (const o of outros) await noBanco('UPDATE usuarios SET ativo = 0 WHERE id = ?', [o.id]);
    await page.goto('/configuracoes');
    await page.getByRole('button', { name: 'Usuários', exact: true }).click();
    await aguardarTelaPronta(page);
    const janela = janelaUsuario(page, 'Editar Usuário');
    await abrirItem(page, 'admteste', /Editar/);
    await janela.getByLabel('Nível de acesso').selectOption({ label: 'Usuário comum' });
    await janela.getByRole('button', { name: 'Salvar' }).click();
    await aviso(page, 'último administrador'); await avisosSumirem(page);
    await janela.getByLabel('Nível de acesso').selectOption({ label: 'Admin' });
    await janela.getByLabel('Usuário ativo').uncheck();
    await janela.getByRole('button', { name: 'Salvar' }).click();
    await aviso(page, 'último administrador');
    await expect(janela).toBeVisible();
    const adm = await linhaDoBanco(1);
    expect([adm.nivel, adm.ativo]).toEqual([1, 1]);
  } finally {
    for (const o of outros) await noBanco('UPDATE usuarios SET ativo = 1 WHERE id = ?', [o.id]);
  }
});

test('@critical Redefinir senha de outro usuário (pelo administrador): regras, senhas diferentes, Cancelar, e a nova senha passa a valer', async ({ page, browser, baseURL }) => {
  const u = await novoUsuario();
  await abrirUsuarios(page);
  const janela = janelaUsuario(page, 'Redefinir Senha');
  await abrirItem(page, u.login, /Redefinir senha/);
  await expect(janela).toBeVisible();
  await expect(janela.getByText(u.nome)).toBeVisible();
  await semViolacoes(page, 'janela Redefinir Senha');
  const salvar = janela.getByRole('button', { name: 'Redefinir Senha' });
  await salvar.click(); await aviso(page, 'no mínimo 8'); await avisosSumirem(page);
  await janela.getByLabel('Nova senha').fill(novaSenhaOk);
  await janela.getByLabel('Confirmar senha').fill('Outra@Senha9');
  await salvar.click(); await aviso(page, 'As senhas não coincidem'); await avisosSumirem(page);
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  expect(bcrypt.compareSync(SENHA, (await linhaDoBanco(u.id)).senha_hash)).toBe(true);
  await abrirItem(page, u.login, /Redefinir senha/);
  await janela.getByLabel('Nova senha').fill(novaSenhaOk);
  await janela.getByLabel('Confirmar senha').fill(novaSenhaOk);
  await salvar.click(); await aviso(page, 'redefinida com sucesso');
  await expect(janela).toHaveCount(0);
  expect(bcrypt.compareSync(novaSenhaOk, (await linhaDoBanco(u.id)).senha_hash)).toBe(true);
  const outro = await browser.newContext({ baseURL });
  const p2 = await outro.newPage(); await bloquearRedeExterna(p2);
  await loginPelaTela(p2, u.login, novaSenhaOk);
  await expect(p2).toHaveURL(/\/dashboard$/);
  await outro.close();
});

test('@critical Histórico do usuário: lista o que ele fez, filtra por data, mostra a pasta quando há e fecha', async ({ page }) => {
  const u = await novoUsuario();
  await noBanco("INSERT INTO logs_auditoria (usuario_id, tabela, acao, registro_id, descricao) VALUES (?, 'tarefas', 'criar', 999999, 'Tarefa de teste do historico')", [u.id]);
  await abrirUsuarios(page);
  const janela = janelaUsuario(page, `Histórico — ${u.nome}`);
  await abrirItem(page, u.login, /Histórico/);
  await expect(janela).toBeVisible();
  await expect(janela.getByText('#999999 - Tarefa de teste do historico')).toBeVisible();
  await expect(janela.getByText('Criou')).toBeVisible();
  await expect(janela.getByText('1 registro encontrado')).toBeVisible();
  await semViolacoes(page, 'janela Histórico do usuário');
  await janela.getByLabel('De').fill('2999-01-01');
  await janela.getByLabel('Até').fill('2999-12-31');
  await janela.getByRole('button', { name: 'Buscar' }).click();
  await expect(janela.getByText('Nenhum registro encontrado para o período')).toBeVisible();
  await janela.getByRole('button', { name: 'Fechar' }).click();
  await expect(janela).toHaveCount(0);
});

test('@critical Excluir usuário: a pergunta (Cancelar não apaga), apaga o que não tem vínculo, e quem tem vínculo é bloqueado com o motivo', async ({ page }) => {
  const livre = await novoUsuario();
  const comPasta = await novoUsuario();
  await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, ?)', [87000 + (SEQ % 900), comPasta.id]);
  await abrirUsuarios(page);
  let pergunta = '';
  page.once('dialog', async d => { pergunta = d.message(); await d.dismiss(); });
  await abrirItem(page, livre.login, /Excluir/);
  await expect.poll(() => pergunta).toContain(`Excluir o usuário "${livre.nome}"?`);
  expect(await linhaDoBanco(livre.id)).toBeTruthy();
  page.once('dialog', d => d.accept());
  await abrirItem(page, livre.login, /Excluir/);
  await aviso(page, 'excluído com sucesso'); await avisosSumirem(page);
  await expect(linhaUsuario(page, livre.login)).toHaveCount(0);
  expect(await linhaDoBanco(livre.id)).toBeUndefined();
  page.once('dialog', d => d.accept());
  await abrirItem(page, comPasta.login, /Excluir/);
  await aviso(page, 'referenciado em: tblpasta');
  await expect(linhaUsuario(page, comPasta.login)).toBeVisible();
  expect(await linhaDoBanco(comPasta.id)).toBeTruthy();
});

test('@critical Quem não é administrador não vê "Configurações" no menu e é mandado ao Dashboard se digitar o endereço', async ({ page }) => {
  const u = await novoUsuario({ permissoes: [['pessoas', null, 'visualizar']] });
  await loginPelaTela(page, u.login, SENHA);
  await expect(page.locator('aside.sidebar').getByText('Configurações')).toHaveCount(0);
  await page.goto('/configuracoes');
  await expect(page).toHaveURL(/\/dashboard$/);
});

// ============================================================ CONFIGURAÇÕES > PERMISSÕES
async function abrirPermissoes(page) {
  await loginPelaTela(page);
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Permissões', exact: true }).click();
  await expect(page.getByText('Selecione um usuário para gerenciar suas permissões')).toBeVisible();
}
const escolher = async (page, u) => { await page.getByLabel('Selecionar usuário').selectOption(String(u.id)); await expect(page.getByRole('button', { name: 'Salvar Permissões' })).toBeVisible(); await aguardarTelaPronta(page); };
const caixa = (page, rotulo) => page.getByLabel(rotulo, { exact: true });

test('@critical Permissões: escolher o usuário, marcar ação/módulo inteiro/sub-módulo, salvar grava, recarregar mantém, e o efeito aparece no menu do usuário', async ({ page, browser, baseURL }) => {
  const u = await novoUsuario();
  await abrirPermissoes(page);
  await escolher(page, u);
  await semViolacoes(page, 'aba Permissões');
  await expect(caixa(page, 'Pessoas: visualizar')).not.toBeChecked();
  await caixa(page, 'Pessoas: visualizar').check();
  await expect(caixa(page, 'Pessoas: visualizar')).toBeChecked();
  await expect(caixa(page, 'Pessoas: todas as ações')).not.toBeChecked();
  // "todas as ações" de Processos marca o módulo e os sub-módulos (sem expandir)
  await caixa(page, 'Processos: todas as ações').check();
  for (const a of ['visualizar', 'cadastrar', 'alterar', 'excluir', 'historico']) await expect(caixa(page, `Processos: ${a}`)).toBeChecked();
  await page.locator('tbody tr').filter({ has: caixa(page, 'Processos: visualizar') }).locator('td').first().click();   // expande os sub-módulos
  await expect(caixa(page, 'Andamentos: cadastrar')).toBeChecked();
  await caixa(page, 'Andamentos: cadastrar').uncheck();
  await expect(caixa(page, 'Processos: todas as ações')).not.toBeChecked();
  await semViolacoes(page, 'aba Permissões com sub-módulos');
  await page.getByRole('button', { name: 'Salvar Permissões' }).click();
  await aviso(page, 'Permissões salvas!'); await avisosSumirem(page);
  const doBanco = async (m, s, a) => (await noBanco('SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = ? AND submodulo <=> ? AND acao = ?', [u.id, m, s, a]))[0]?.permitido;
  expect(await doBanco('pessoas', null, 'visualizar')).toBe(1);
  expect(await doBanco('pessoas', null, 'cadastrar')).toBe(0);
  expect(await doBanco('processos', null, 'excluir')).toBe(1);
  expect(await doBanco('processos', 'andamentos', 'cadastrar')).toBe(0);
  expect(await doBanco('processos', 'andamentos', 'visualizar')).toBe(1);
  // recarrega a tela: o que foi salvo volta marcado
  await page.reload();
  await page.getByRole('button', { name: 'Permissões', exact: true }).click();
  await escolher(page, u);
  await expect(caixa(page, 'Pessoas: visualizar')).toBeChecked();
  await expect(caixa(page, 'Pessoas: cadastrar')).not.toBeChecked();
  await expect(caixa(page, 'Processos: excluir')).toBeChecked();
  // o efeito: o usuário passa a ver Pessoas e Processos no menu, e não vê Financeiro
  const outro = await browser.newContext({ baseURL });
  const p2 = await outro.newPage(); await bloquearRedeExterna(p2);
  await loginPelaTela(p2, u.login, SENHA);
  const menu = p2.locator('aside.sidebar');
  await expect(menu.getByText('Pessoas', { exact: true }).first()).toBeVisible();
  await expect(menu.getByText('Processos', { exact: true }).first()).toBeVisible();
  await expect(menu.getByText('Financeiro', { exact: true })).toHaveCount(0);
  await p2.goto('/financeiro');
  await expect(p2).toHaveURL(/\/dashboard$/);
  await outro.close();
});

test('@critical Permissões: administrador aparece com tudo marcado e travado (sem Salvar); erro do servidor ao salvar avisa e mantém as marcas; trocar de usuário carrega o dele', async ({ page }) => {
  const adm = await novoUsuario({ nivel: 1 });
  const comum = await novoUsuario({ permissoes: [['tarefas', null, 'visualizar']] });
  const outro = await novoUsuario();
  await abrirPermissoes(page);
  await escolher(page, adm);
  await expect(caixa(page, 'Pessoas: visualizar')).toBeChecked();
  await expect(caixa(page, 'Pessoas: visualizar')).toBeDisabled();
  await expect(caixa(page, 'Pessoas: todas as ações')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Salvar Permissões' })).toBeDisabled();
  await escolher(page, comum);
  await expect(caixa(page, 'Tarefas (menu): visualizar')).toBeChecked();
  await expect(caixa(page, 'Pessoas: visualizar')).toBeEnabled();
  await escolher(page, outro);
  await expect(caixa(page, 'Tarefas (menu): visualizar')).not.toBeChecked();                     // não herda as marcas do usuário anterior
  await caixa(page, 'Pessoas: alterar').check();
  await page.route('**/api/configuracoes/permissoes/*', rota => rota.request().method() === 'PUT'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await page.getByRole('button', { name: 'Salvar Permissões' }).click();
  await aviso(page, 'Erro ao salvar permissões');
  await expect(caixa(page, 'Pessoas: alterar')).toBeChecked();                                   // a tela não perde o que foi marcado
  expect((await noBanco('SELECT COUNT(*) AS n FROM permissoes WHERE usuario_id = ?', [outro.id]))[0].n).toBe(0);
});
