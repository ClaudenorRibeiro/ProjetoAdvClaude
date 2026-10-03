import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C1 do plano (PLANO-TESTES-PROCESSOS.md): o cabeçalho da pasta (voltar, número, título, tipo/status, aviso de recuperação
// judicial, abas) e o painel "Partes do processo" com as ações de cada pessoa: ver cadastro, anotações de atendimento, copiar telefone
// e e-mail, enviar e-mail, WhatsApp e SMS. Envios externos (e-mail, SMS, WhatsApp) são simulados — nada sai de verdade.
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
const painel = (page) => page.getByText('Partes do processo', { exact: false }).first();
const linhaParte = (page, nome) => page.locator('div').filter({ has: page.getByRole('button', { name: nome, exact: true }) }).filter({ has: page.getByTitle('Mais ações') }).last();
const acao = async (page, nome, item) => { await abrirMenuAcoes(page, linhaParte(page, nome)); await page.getByRole('button', { name: item }).click(); };

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { d = await prepararPastaPartes(); });
test.afterAll(async () => { await limparPastaPartes(d); });
test.beforeEach(async ({ page, context }) => {
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

async function abrirPasta(page, abrirPainel = true) {
  await page.goto(`/processos/pasta/${d.pastaPartes}`); await aguardarTelaPronta(page);
  await expect(page.getByText('Pasta 7401', { exact: true })).toBeVisible();
  if (abrirPainel) { await painel(page).click(); await expect(linhaParte(page, 'Alberto Autor E2E')).toBeVisible(); }
}
const areaTransferencia = (page) => page.evaluate(() => navigator.clipboard.readText());

test('@critical Cabeçalho da pasta: número, título, tipo e status, aviso de recuperação judicial (uma vez só), abas e botão Voltar', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, false);
  const tituloPrimeiro = (await page.locator('tbody tr').first().locator('td').first().innerText()).trim();
  await expect(page.getByRole('heading', { name: tituloPrimeiro, exact: true })).toBeVisible();                           // o título da pasta é o do 1º processo da lista
  await expect(page.locator('.badge-azul').filter({ hasText: 'Trabalhista E2E' }).first()).toBeVisible();
  await expect(page.locator('.badge-cinza').filter({ hasText: 'Conhecimento E2E' }).first()).toBeVisible();
  await expect(page.getByText('(Empresa Alfa E2E Ltda em recuperação judicial)')).toHaveCount(1);                       // dois processos, um só aviso
  for (const aba of ['Processos', 'Andamentos', 'Prazos', 'Tarefas', 'Audiências', 'Perícias', 'Financeiro'])
    await expect(page.locator('.aba-btn', { hasText: aba })).toBeVisible();
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Processos');                                                  // abre na aba Processos
  await semViolacoes(page, 'cabeçalho e aba Processos da pasta');
  await page.getByRole('button', { name: '← Voltar' }).click();
  await expect(page).toHaveURL(/\/processos$/);
  // pasta que não existe
  await page.goto('/processos/pasta/99999999'); await aguardarTelaPronta(page);
  await expect(page.getByText('Pasta não encontrada')).toBeVisible();
  // sem a marca de recuperação, o aviso some
  await noBanco('UPDATE pessoas_juridicas SET em_recuperacao_judicial = 0 WHERE id = ?', [d.reu1]);
  await abrirPasta(page, false);
  await expect(page.getByText('em recuperação judicial')).toHaveCount(0);
});

test('@critical Painel "Partes do processo": começa fechado, abre e fecha, mostra cada pessoa uma vez com o papel e quem a representa — também pelo teclado', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page, false);
  await expect(painel(page)).toBeVisible();
  await expect(page.getByText('(5)')).toBeVisible();                                                                    // Alberto aparece nos 2 processos mas conta 1
  await expect(page.getByRole('button', { name: 'Alberto Autor E2E', exact: true })).toHaveCount(0);                    // fechado
  await painel(page).click();
  const nomes = ['Alberto Autor E2E', 'Beatriz Autora E2E', 'Empresa Alfa E2E Ltda', 'Empresa Beta E2E Ltda', 'Perito Paulo E2E'];
  for (const n of nomes) await expect(page.getByRole('button', { name: n, exact: true })).toHaveCount(1);
  await expect(linhaParte(page, 'Alberto Autor E2E').locator('.badge-azul')).toHaveText('Autor');
  await expect(linhaParte(page, 'Empresa Alfa E2E Ltda').locator('.badge-vermelho')).toHaveText('Réu');
  await expect(linhaParte(page, 'Perito Paulo E2E').locator('.badge-roxo')).toHaveText('Perito');
  await expect(linhaParte(page, 'Beatriz Autora E2E')).toContainText('representado(a) por Carlos Responsavel C1 — Pai C1');
  await semViolacoes(page, 'painel de partes aberto');
  await painel(page).click();
  await expect(page.getByRole('button', { name: 'Alberto Autor E2E', exact: true })).toHaveCount(0);                    // fecha de novo
  // pelo teclado: o cabeçalho do painel precisa ser alcançável com Tab e abrir com Enter
  await page.keyboard.press('Tab');
  for (let i = 0; i < 40; i++) {
    const foco = await page.evaluate(() => (document.activeElement?.textContent || '').includes('Partes do processo'));
    if (foco) break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Alberto Autor E2E', exact: true })).toBeVisible({ timeout: 3000 });
});

test('@critical Partes: "Ver cadastro" (pelo nome e pelo menu) abre a ficha só para leitura; pessoa jurídica também; Fechar, ✕ e ESC fecham', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await linhaParte(page, 'Alberto Autor E2E').getByRole('button', { name: 'Alberto Autor E2E', exact: true }).click();
  const ficha = janela(page, 'Detalhes da Pessoa Física');
  await expect(ficha).toBeVisible();
  await expect(ficha.getByRole('button', { name: 'Fechar' })).toBeVisible();
  await semViolacoes(page, 'ficha da pessoa (somente leitura) aberta pela pasta');
  await ficha.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await acao(page, 'Empresa Alfa E2E Ltda', /Ver cadastro/);
  await expect(janela(page, 'Detalhes da Pessoa Jurídica')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await acao(page, 'Perito Paulo E2E', /Ver cadastro/);
  await janela(page, 'Detalhes da Pessoa Física').locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Partes: copiar telefone — um número copia direto, vários abrem a escolha, sem número avisa (só o número local vai para a área de transferência)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await acao(page, 'Perito Paulo E2E', /Copiar telefone/);                                                               // 1 telefone: copia direto
  await aviso(page, 'Telefone copiado!');
  expect(await areaTransferencia(page)).toBe('999998888');                                                              // sem 55, sem DDD
  await esperarSemAviso(page);
  await acao(page, 'Beatriz Autora E2E', /Copiar telefone/);                                                             // nenhum
  await aviso(page, 'Esta pessoa não tem telefone cadastrado');
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Copiar telefone/);                                                              // 2 telefones: escolher
  const escolha = janela(page, 'Copiar telefone — Alberto Autor E2E');
  await expect(escolha).toBeVisible();
  await expect(escolha.getByText('11946850741')).toBeVisible();
  await semViolacoes(page, 'janela Copiar telefone');
  await escolha.getByRole('button', { name: /1133334444/ }).click();
  await aviso(page, 'Telefone copiado (só o número)');
  expect(await areaTransferencia(page)).toBe('33334444');
  await expect(escolha).toHaveCount(0);
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Copiar telefone/);
  await janela(page, 'Copiar telefone — Alberto Autor E2E').getByRole('button', { name: 'Fechar' }).click();             // Fechar não copia
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await acao(page, 'Alberto Autor E2E', /Copiar telefone/);
  await expect(janela(page, 'Copiar telefone — Alberto Autor E2E')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await acao(page, 'Empresa Alfa E2E Ltda', /Copiar telefone/);                                                          // pessoa jurídica
  await aviso(page, 'Telefone copiado!');
  expect(await areaTransferencia(page)).toBe('32221111');
});

test('@critical Partes: copiar e-mail — um copia direto, vários abrem a escolha, sem e-mail avisa', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await acao(page, 'Perito Paulo E2E', /Copiar e-mail/);
  await aviso(page, 'E-mail copiado!');
  expect(await areaTransferencia(page)).toBe('paulo@example.invalid');
  await esperarSemAviso(page);
  await acao(page, 'Empresa Beta E2E Ltda', /Copiar e-mail/);
  await aviso(page, 'Esta pessoa não tem e-mail cadastrado');
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Copiar e-mail/);
  const escolha = janela(page, 'Copiar e-mail — Alberto Autor E2E');
  await expect(escolha).toBeVisible();
  await semViolacoes(page, 'janela Copiar e-mail');
  await escolha.getByRole('button', { name: /alberto\.segundo@example\.invalid/ }).click();
  await aviso(page, 'E-mail copiado');
  expect(await areaTransferencia(page)).toBe('alberto.segundo@example.invalid');
  await expect(escolha).toHaveCount(0);
  await acao(page, 'Alberto Autor E2E', /Copiar e-mail/);
  await janela(page, 'Copiar e-mail — Alberto Autor E2E').locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Partes: WhatsApp — um telefone abre direto, vários abrem a escolha, sem telefone avisa; o envio fica registrado', async ({ page, context }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  const abertos = [];
  await context.route('https://wa.me/**', (rota) => { abertos.push(rota.request().url()); return rota.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>whatsapp simulado</body></html>' }); });
  const abriuLink = async (disparar) => {
    const antes = abertos.length;
    const [nova] = await Promise.all([context.waitForEvent('page'), disparar()]);
    await expect.poll(() => abertos.length).toBeGreaterThan(antes);
    await nova.close();
    return abertos[abertos.length - 1];
  };
  expect(await abriuLink(() => acao(page, 'Perito Paulo E2E', /Enviar WhatsApp/))).toContain('https://wa.me/5521999998888');
  await expect.poll(async () => (await noBanco("SELECT canal FROM log_comunicacoes WHERE canal = 'whatsapp' AND destinatario = '21999998888'")).length).toBe(1);
  await acao(page, 'Beatriz Autora E2E', /Enviar WhatsApp/);
  await aviso(page, 'Esta pessoa não tem telefone cadastrado');
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Enviar WhatsApp/);
  const escolha = janela(page, 'Enviar WhatsApp — Alberto Autor E2E');
  await expect(escolha).toBeVisible();
  await expect(escolha.getByRole('radio').first()).toBeChecked();                                                       // o principal já vem marcado
  await semViolacoes(page, 'janela Escolher telefone do WhatsApp');
  await escolha.getByRole('radio').nth(1).check();
  expect(await abriuLink(() => escolha.getByRole('button', { name: 'Abrir WhatsApp' }).click())).toContain('https://wa.me/551133334444');
  await expect(escolha).toHaveCount(0);
  await acao(page, 'Alberto Autor E2E', /Enviar WhatsApp/);
  await janela(page, 'Enviar WhatsApp — Alberto Autor E2E').getByRole('button', { name: 'Cancelar' }).click();           // Cancelar não abre nada
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Partes: anotações de atendimento — vazio, adicionar, editar, excluir (com confirmação), ajuda e ESC', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await acao(page, 'Alberto Autor E2E', /Anotações de atendimento/);
  const jan = janela(page, /Anotações de atendimento — Alberto Autor E2E/);
  await expect(jan).toBeVisible();
  await expect(jan.getByText('Nenhuma anotação registrada ainda')).toBeVisible();
  await expect(jan.getByRole('button', { name: 'Adicionar' })).toBeDisabled();                                           // sem texto não adiciona
  await semViolacoes(page, 'janela Anotações de atendimento');
  await jan.getByRole('button', { name: 'Ajuda sobre as anotações de atendimento' }).click();
  await expect(jan.getByText('Anote aqui informações referentes ao atendimento realizado.', { exact: true })).toBeVisible();
  await jan.getByRole('button', { name: 'Ajuda sobre as anotações de atendimento' }).click();
  await jan.getByPlaceholder('Escreva o que foi tratado neste atendimento...').fill('Cliente ligou pedindo notícias do processo');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await aviso(page, 'Anotação registrada');
  await expect(jan.getByText('Cliente ligou pedindo notícias do processo')).toBeVisible();
  await expect(jan.getByText('Administrador de Testes')).toBeVisible();
  expect((await noBanco("SELECT descricao, usuario_id FROM historico_atendimento WHERE pessoa_id = ? AND tipo_pessoa = 'fisica'", [d.autor1]))).toEqual([{ descricao: 'Cliente ligou pedindo notícias do processo', usuario_id: 1 }]);
  await esperarSemAviso(page);
  // editar: texto vazio é recusado; novo texto salva
  await jan.getByRole('button', { name: 'Editar', exact: true }).click();
  await jan.locator('textarea').last().fill('   ');
  await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'A anotação não pode ficar em branco');
  await esperarSemAviso(page);
  await jan.locator('textarea').last().fill('Cliente ligou de novo');
  await jan.getByRole('button', { name: 'Cancelar', exact: true }).click();                                              // Cancelar mantém o texto antigo
  await expect(jan.getByText('Cliente ligou pedindo notícias do processo')).toBeVisible();
  await jan.getByRole('button', { name: 'Editar', exact: true }).click();
  await jan.locator('textarea').last().fill('Cliente ligou de novo');
  await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Anotação atualizada');
  await expect(jan.getByText('Cliente ligou de novo')).toBeVisible();
  await esperarSemAviso(page);
  // excluir: Cancelar não apaga; confirmar apaga
  await jan.getByRole('button', { name: 'Excluir', exact: true }).click();
  const confirma = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: 'Excluir anotação' }) });
  await expect(confirma.getByText('Esta anotação será excluída definitivamente. Esta ação não tem volta.')).toBeVisible();
  await confirma.getByRole('button', { name: 'Cancelar' }).click();
  expect(await noBanco('SELECT id FROM historico_atendimento WHERE pessoa_id = ?', [d.autor1])).toHaveLength(1);
  await jan.getByRole('button', { name: 'Excluir', exact: true }).click();
  await confirma.getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Anotação excluída');
  await expect(jan.getByText('Nenhuma anotação registrada ainda')).toBeVisible();
  expect(await noBanco('SELECT id FROM historico_atendimento WHERE pessoa_id = ?', [d.autor1])).toHaveLength(0);
  await jan.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await acao(page, 'Perito Paulo E2E', /Anotações de atendimento/);
  await expect(janela(page, /Anotações de atendimento — Perito Paulo E2E/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Partes: enviar e-mail — destinatário, validações, anexos (tipo e tamanho), confirmação, envio simulado e erro do servidor', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await acao(page, 'Empresa Beta E2E Ltda', /Enviar e-mail/);
  await aviso(page, 'Esta pessoa não tem e-mail cadastrado');
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Enviar e-mail/);
  const jan = janela(page, 'Enviar e-mail — Alberto Autor E2E');
  await expect(jan).toBeVisible();
  await expect(jan.locator('select')).toHaveValue('alberto@example.invalid');                                          // o principal vem escolhido
  await expect(jan.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
  await semViolacoes(page, 'janela Enviar e-mail');
  await jan.getByLabel('Assunto').fill('Atualização do processo');
  await expect(jan.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();                                // falta a mensagem
  await jan.getByLabel('Mensagem').fill('Bom dia, segue a atualização.');
  await expect(jan.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled();
  // anexos: tipo proibido, depois válido, remover, e o limite de 20 MB
  const arquivo = jan.locator('input[type=file]');
  await arquivo.setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(jan.getByText('Tipo de arquivo não permitido. Aceita somente PDF, DOC, DOCX, JPG, JPEG ou PNG.')).toBeVisible();
  await arquivo.setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await expect(jan.getByText('contrato.pdf')).toBeVisible();
  await expect(jan.getByText(/Total: /)).toBeVisible();
  await jan.getByTitle('Remover').click();
  await expect(jan.getByText('contrato.pdf')).toHaveCount(0);
  await arquivo.setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(21 * 1024 * 1024, 1) });
  await expect(jan.getByText(/O limite total é 20 MB/)).toBeVisible();
  await expect(jan.getByText('grande.pdf')).toHaveCount(0);
  await arquivo.setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  // confirmação antes de enviar: Cancelar volta, "Enviar assim mesmo" envia
  await jan.getByRole('button', { name: 'Enviar', exact: true }).click();
  const confirma = janela(page, 'Confirmar envio');
  await expect(confirma.getByText(/não guarda uma cópia do/)).toBeVisible();
  await semViolacoes(page, 'aviso Confirmar envio do e-mail');
  await confirma.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirma).toHaveCount(0);
  await jan.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.keyboard.press('Escape');                                                                                  // ESC fecha só o aviso
  await expect(confirma).toHaveCount(0);
  await expect(jan).toBeVisible();
  let corpo = null;
  await page.route('**/api/pessoas/enviar-email', async (rota) => { corpo = rota.request().postData(); await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mensagem: 'ok' }) }); });
  await jan.getByRole('button', { name: 'Enviar', exact: true }).click();
  await janela(page, 'Confirmar envio').getByRole('button', { name: 'Enviar assim mesmo' }).click();
  await aviso(page, 'E-mail enviado com sucesso');
  await expect(page.locator('.modal-box')).toHaveCount(0);
  expect(corpo).toContain('alberto@example.invalid');
  expect(corpo).toContain('Atualização do processo');
  expect(corpo).toContain('contrato.pdf');
  expect(corpo).toContain(String(d.autor1));
  await page.unroute('**/api/pessoas/enviar-email');
  await esperarSemAviso(page);
  // erro do servidor aparece DENTRO da janela
  await page.route('**/api/pessoas/enviar-email', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Servidor de e-mail indisponível' }) }));
  await acao(page, 'Perito Paulo E2E', /Enviar e-mail/);
  const jan2 = janela(page, 'Enviar e-mail — Perito Paulo E2E');
  await expect(jan2.getByText('paulo@example.invalid')).toBeVisible();                                                  // um só e-mail: sem lista de escolha
  await jan2.getByLabel('Assunto').fill('Teste'); await jan2.getByLabel('Mensagem').fill('Teste');
  await jan2.getByRole('button', { name: 'Enviar', exact: true }).click();
  await janela(page, 'Confirmar envio').getByRole('button', { name: 'Enviar assim mesmo' }).click();
  await expect(jan2.getByText('Servidor de e-mail indisponível')).toBeVisible();
  await expect(jan2.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled();
  await jan2.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Partes: "Enviar SMS" só existe quando o SMS está ativo e só para pessoa física; validações, contador, confirmação e erro', async ({ page }) => {
  await loginPelaTela(page);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaParte(page, 'Alberto Autor E2E'));
  await expect(page.getByRole('button', { name: /Enviar SMS/ })).toHaveCount(0);                                         // integração desligada
  await page.keyboard.press('Escape');
  await page.route('**/api/pessoas/sms-ativo', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, dados: { ativo: true } }) }));
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaParte(page, 'Empresa Alfa E2E Ltda'));
  await expect(page.getByRole('button', { name: /Enviar SMS/ })).toHaveCount(0);                                         // jurídica não recebe SMS
  await page.keyboard.press('Escape');
  await acao(page, 'Beatriz Autora E2E', /Enviar SMS/);
  await aviso(page, 'Esta pessoa não tem telefone cadastrado');
  await esperarSemAviso(page);
  await acao(page, 'Alberto Autor E2E', /Enviar SMS/);
  const jan = janela(page, 'Enviar SMS — Alberto Autor E2E');
  await expect(jan).toBeVisible();
  await expect(jan.locator('select')).toHaveValue('11946850741');
  await semViolacoes(page, 'janela Enviar SMS');
  await jan.getByRole('button', { name: 'Enviar SMS' }).click();
  await expect(jan.getByText('Escreva a mensagem do SMS.')).toBeVisible();
  await jan.getByLabel('Mensagem').fill('Ola');
  await expect(jan.getByText('3 caractere(s) — 1 SMS (até 160 caracteres = 1 crédito)')).toBeVisible();
  await jan.getByLabel('Mensagem').fill('x'.repeat(161));
  await expect(jan.getByText('161 caractere(s) — 2 SMS (cada 160 caracteres = 1 crédito)')).toBeVisible();
  await jan.getByLabel('Mensagem').fill('Ola, tudo bem?');
  await jan.getByRole('button', { name: 'Enviar SMS' }).click();
  await expect(jan.getByText(/Isso consome crédito da conta Comtele configurada/)).toBeVisible();
  await jan.getByRole('button', { name: 'Voltar' }).click();                                                              // Voltar sai da confirmação
  await expect(jan.getByRole('button', { name: 'Enviar SMS' })).toBeVisible();
  let corpo = null;
  await page.route('**/api/pessoas/enviar-sms', async (rota) => { corpo = rota.request().postDataJSON(); await rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Saldo insuficiente' }) }); });
  await jan.getByRole('button', { name: 'Enviar SMS' }).click();
  await jan.getByRole('button', { name: 'Confirmar envio' }).click();
  await expect(jan.getByText('Saldo insuficiente')).toBeVisible();                                                       // erro dentro da janela
  await page.unroute('**/api/pessoas/enviar-sms');
  await page.route('**/api/pessoas/enviar-sms', async (rota) => { corpo = rota.request().postDataJSON(); await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mensagem: 'ok' }) }); });
  await jan.getByRole('button', { name: 'Enviar SMS' }).click();
  await jan.getByRole('button', { name: 'Confirmar envio' }).click();
  await aviso(page, 'SMS enviado com sucesso');
  expect(corpo).toEqual({ numero: '11946850741', mensagem: 'Ola, tudo bem?', tipo_pessoa: 'fisica', pessoa_id: d.autor1 });
  await expect(page.locator('.modal-box')).toHaveCount(0);
});

test('@critical Painel de partes: quem só tem permissão de Processos (sem Pessoas) não recebe ações de contato que não funcionariam', async ({ page }) => {
  const login = await criarUsuarioComPermissoes('so_processos_partes', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, login);
  await abrirPasta(page);
  await abrirMenuAcoes(page, linhaParte(page, 'Perito Paulo E2E'));
  for (const item of [/Ver cadastro/, /Anotações de atendimento/, /Copiar telefone/, /Copiar e-mail/, /Enviar e-mail/, /Enviar WhatsApp/])
    await expect(page.getByRole('button', { name: item }), String(item)).toHaveCount(0);
});

test('@critical Partes: ESC na confirmação do SMS volta para o texto (não fecha a janela e não perde a mensagem)', async ({ page }) => {
  await loginPelaTela(page);
  await page.route('**/api/pessoas/sms-ativo', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, dados: { ativo: true } }) }));
  await abrirPasta(page);
  await acao(page, 'Alberto Autor E2E', /Enviar SMS/);
  const jan = janela(page, 'Enviar SMS — Alberto Autor E2E');
  await expect(jan).toBeVisible();
  await jan.getByLabel('Mensagem').fill('Ola, tudo bem?');
  await jan.getByRole('button', { name: 'Enviar SMS' }).click();
  await expect(jan.getByText(/Isso consome crédito/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(jan).toBeVisible();
  await expect(jan.getByText(/Isso consome crédito/)).toHaveCount(0);
  await expect(jan.getByLabel('Mensagem')).toHaveValue('Ola, tudo bem?');
  await page.keyboard.press('Escape');                                                                                   // sem confirmação, o ESC fecha
  await expect(page.locator('.modal-box')).toHaveCount(0);
});
