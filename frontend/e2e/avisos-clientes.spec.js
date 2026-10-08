import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { bloquearRedeExterna, loginPelaTela, aguardarTelaPronta, criarUsuarioComPermissoes, violacoesGraves } from './helpers.js';

// Tela "Avisos aos clientes": lista de pendentes com os canais do cliente, editar, descartar, enviar (WhatsApp abre o link), conflito
// ("outra pessoa já decidiu") e permissões. Poucos dados: um cliente e um aviso de parabéns por teste (o servidor, o envio real
// e a concorrência já têm teste próprio em backend/tests/integration/avisos-*.integration.test.js).
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const NOME = 'Zz Aviso Tela Teste';
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function limpar() {
  await noBanco("DELETE FROM avisos_cliente WHERE assunto LIKE 'Zz Aviso Tela%'");
  await noBanco(`DELETE FROM pessoas_fisicas WHERE nome = ?`, [NOME]);
}
// Cliente com e-mail e um celular marcado como WhatsApp (sem SMS) + um aviso de parabéns pendente.
async function semear({ zap = true } = {}) {
  const id = (await noBanco('INSERT INTO pessoas_fisicas (nome, data_nascimento) VALUES (?, ?)', [NOME, '1980-05-05'])).insertId;
  await noBanco('INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, 1)', [id, 'zzaviso@example.invalid']);
  if (zap) await noBanco('INSERT INTO telefones_pf (pessoa_id, numero, principal, whatsapp, sms) VALUES (?, ?, 1, 1, 0)', [id, '(19) 98877-6655']);
  const aviso = (await noBanco(
    `INSERT INTO avisos_cliente (modulo, tipo, pessoa_fisica_id, cliente_tipo, cliente_id, data_evento, data_aviso, assunto, texto)
     VALUES ('parabens', 'aniversario', ?, 'fisica', ?, ?, ?, 'Zz Aviso Tela feliz aniversário', 'Parabéns, Zz Aviso!')`, [id, id, hoje(), hoje()])).insertId;
  return { id, aviso };
}
async function abrir(page, login) {
  await loginPelaTela(page, login, login ? 'TesteSeguro123!' : undefined);
  await page.goto('/avisos');
  await aguardarTelaPronta(page);
}
const cartao = (page) => page.getByTestId('aviso-cartao').filter({ hasText: NOME });

test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); await limpar(); });
test.afterAll(async () => { await limpar(); });

test('@critical Avisos: o pendente aparece com os canais do cliente (SMS desligado, e-mail e WhatsApp marcados) e sem violação de acessibilidade', async ({ page }) => {
  await semear();
  await abrir(page);
  const c = cartao(page);
  await expect(c).toContainText('Parabéns de aniversário · Aniversário');
  await expect(c).toContainText('Parabéns, Zz Aviso!');
  await expect(c.getByLabel('Enviar por E-mail')).toBeChecked();
  await expect(c.getByLabel('Enviar por WhatsApp')).toBeChecked();
  await expect(c.getByLabel('Enviar por SMS')).toBeDisabled();
  await expect(page.getByRole('tab', { name: /Pendentes \(\d+\)/ })).toBeVisible();
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade: ${JSON.stringify(v, null, 1)}`).toEqual([]);
});

test('Avisos: editar o texto grava; descartar tira da lista e vai para o histórico', async ({ page }) => {
  const { aviso } = await semear();
  await abrir(page);
  await cartao(page).getByRole('button', { name: 'Editar texto' }).click();
  await page.getByLabel('Mensagem').fill('Texto ajustado pela tela');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(cartao(page)).toContainText('Texto ajustado pela tela');
  expect((await noBanco('SELECT texto, texto_editado FROM avisos_cliente WHERE id = ?', [aviso]))[0]).toMatchObject({ texto: 'Texto ajustado pela tela', texto_editado: 1 });
  await cartao(page).getByRole('button', { name: 'Descartar' }).click();
  await page.locator('.modal-box').getByRole('button', { name: 'Descartar' }).click();
  await expect(cartao(page)).toHaveCount(0);
  expect((await noBanco('SELECT status, modo FROM avisos_cliente WHERE id = ?', [aviso]))[0]).toMatchObject({ status: 'descartado', modo: 'tela' });
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('cell', { name: 'Descartado' }).first()).toBeVisible();
});

test('Avisos: enviar com WhatsApp manda os canais marcados e abre o link do WhatsApp com a mensagem', async ({ page, context }) => {
  await semear();
  let corpo = null;
  await page.route('**/api/avisos/*/enviar', async (rota) => {
    corpo = rota.request().postDataJSON();
    await rota.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, mensagem: 'Aviso enviado', dados: { whatsapp: { numero: '(19) 98877-6655', texto: 'Parabéns, Zz Aviso!' } } }) });
  });
  await context.route('https://wa.me/**', rota => rota.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }));
  await abrir(page);
  await cartao(page).getByLabel('Enviar por E-mail').uncheck();
  const nova = context.waitForEvent('page');
  await cartao(page).getByRole('button', { name: 'Enviar', exact: true }).click();
  const aba = await nova;
  await aba.waitForURL(/wa\.me\/5519988776655\?text=/, { timeout: 15_000 });
  expect(aba.url()).toContain('https://wa.me/5519988776655?text=' + encodeURIComponent('Parabéns, Zz Aviso!'));
  expect(corpo).toEqual({ canais: ['whatsapp'] });
});

test('Avisos: se outra pessoa já enviou, a tela mostra o aviso de conflito e atualiza a lista', async ({ page }) => {
  const { aviso } = await semear({ zap: false });
  await abrir(page);
  await expect(cartao(page)).toHaveCount(1);
  await noBanco("UPDATE avisos_cliente SET status = 'enviado', modo = 'tela', decidido_em = NOW() WHERE id = ?", [aviso]);
  await cartao(page).getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/acabou de ser enviado/).first()).toBeVisible();
  await expect(cartao(page)).toHaveCount(0);
});

test('Avisos: permissão por módulo — quem só tem Audiência não vê o aviso de parabéns; quem não tem nenhuma não vê o menu nem a tela', async ({ page }) => {
  await semear();
  const so = await criarUsuarioComPermissoes('zzavisoaud', [['avisos', 'audiencia', 'visualizar']]);
  await abrir(page, so);
  await expect(page.getByRole('link', { name: /Avisos aos clientes/ })).toBeVisible();
  await expect(cartao(page)).toHaveCount(0);
});

test('Avisos: sem nenhuma permissão de avisos o menu não aparece e a tela volta ao painel', async ({ page }) => {
  const sem = await criarUsuarioComPermissoes('zzavisosem', [['pessoas', null, 'visualizar']]);
  await abrir(page, sem);
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('link', { name: /Avisos aos clientes/ })).toHaveCount(0);
});

test('Avisos: Configurações — "mostrar antes de enviar" por módulo e dias aceitando 0 (mesmo dia) gravam no escritório', async ({ page }) => {
  const antes = (await noBanco('SELECT avisos_pericia_mostrar, avisos_audiencia_mostrar, avisos_parabens_mostrar, dias_alerta_pericia, dias_alerta_audiencia, dias_aviso_parabens FROM configuracoes_escritorio LIMIT 1'))[0];
  try {
    await loginPelaTela(page);
    await page.goto('/configuracoes');
    await aguardarTelaPronta(page);
    const cx = page.getByLabel('Mostrar avisos de Perícia antes de enviar');
    await expect(cx).toBeVisible();
    await cx.setChecked(false);
    await page.getByLabel(/Lembrete de perícia/).fill('0');
    await page.getByLabel(/Lembrete de parabéns de aniversário/).fill('1');
    await page.getByRole('button', { name: 'Salvar Configurações' }).click();
    await expect(page.getByText(/salv|atualiz/i).first()).toBeVisible();
    expect((await noBanco('SELECT avisos_pericia_mostrar, avisos_audiencia_mostrar, dias_alerta_pericia, dias_aviso_parabens FROM configuracoes_escritorio LIMIT 1'))[0])
      .toMatchObject({ avisos_pericia_mostrar: 0, avisos_audiencia_mostrar: 1, dias_alerta_pericia: 0, dias_aviso_parabens: 1 });
  } finally {
    await noBanco('UPDATE configuracoes_escritorio SET avisos_pericia_mostrar = ?, avisos_audiencia_mostrar = ?, avisos_parabens_mostrar = ?, dias_alerta_pericia = ?, dias_alerta_audiencia = ?, dias_aviso_parabens = ?',
      [antes.avisos_pericia_mostrar, antes.avisos_audiencia_mostrar, antes.avisos_parabens_mostrar, antes.dias_alerta_pericia, antes.dias_alerta_audiencia, antes.dias_aviso_parabens]);
  }
});
