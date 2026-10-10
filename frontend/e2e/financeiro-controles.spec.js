import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, prepararFinanceiro, violacoesGraves } from './helpers';

// Percorre a tela Financeiro inteira como o usuário: as 3 abas, as janelas (lançamento, acordo, alvará, parceria,
// recibos, cancelar acordo, receber, multa, repasse, histórico), as mensagens de validação e os filtros da Consulta,
// com a análise de acessibilidade em cada tela/janela e conferência do resultado no banco de teste.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');

async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  // o aviso (toast) some sozinho em 4 s; a cor dele fica semitransparente no fim e isso não é a cor da tela
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const erroDeTela = (page) => expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
const modal = (page) => page.locator('.modal-box').last();
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const linhaDoAcordo = (page, descricao) => page.locator('div').filter({ hasText: descricao })
  .filter({ has: page.getByRole('button', { name: 'Cancelar', exact: true }) }).last();
const parcelaPendente = (page) => page.locator('tbody tr').filter({ hasText: 'Pendente' });


// Escolhe a pasta e o processo (a tela "Por processo" pode voltar vazia depois de trocar de aba).
async function abrirProcesso(page) {
  if (!(await page.getByLabel('Processo', { exact: true }).count())) {
    await page.getByPlaceholder('Buscar pasta pelo título ou número...').pressSequentially('PROCESSO', { delay: 50 });
    await page.locator('div[style*="cursor: pointer"]').first().dispatchEvent('mousedown');
  }
  await page.getByLabel('Processo', { exact: true }).selectOption({ index: 1 });
  await aguardarTelaPronta(page);
}
const abrirParcelas = async (page) => {
  // sempre as parcelas do "Acordo E2E" (a lista mostra o "Segundo E2E" primeiro)
  const fechado = linhaDoAcordo(page, 'Acordo E2E').getByRole('button', { name: /▶ Parcelas/ });
  if (await fechado.count()) await fechado.click();
  await expect(parcelaPendente(page).or(page.locator('tbody tr').filter({ hasText: 'Recebida' })).first()).toBeVisible();
};

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

test('@critical Financeiro: abas, janelas, validações, recebimento, multa, repasse e consulta', async ({ page, request }) => {
  test.setTimeout(420000);
  // Tudo é criado ANTES de entrar pela tela (um novo login derruba a sessão anterior).
  const F = await prepararFinanceiro(request);
  await F.novoAcordo('Acordo E2E');
  await F.novoAcordo('Segundo E2E');

  await loginPelaTela(page);
  await page.goto('/financeiro'); await aguardarTelaPronta(page);

  await expect(page.getByText('Selecione uma pasta e um processo para ver o financeiro')).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Por processo (vazia)');
  await page.getByRole('button', { name: 'Repasses pendentes' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByRole('heading', { name: 'Repasses' })).toBeVisible();
  await expect(page.getByText('Nenhum repasse pendente.')).toBeVisible();
  await page.getByRole('button', { name: /^Concluídos/ }).click();
  await expect(page.getByText('Nenhum repasse concluído ainda.')).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Repasses (vazia)');
  await page.getByRole('button', { name: 'Por processo' }).click();

  await abrirProcesso(page);
  await expect(page.getByText('Acordos e Alvarás')).toBeVisible();
  await expect(page.getByText('Nenhum lançamento neste processo')).toBeVisible();
  await semViolacoes(page, 'Financeiro — processo com acordos');
  await erroDeTela(page);

  await page.getByRole('button', { name: '+ Lançamento' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Lançamento' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Lançamento');
  await modal(page).getByRole('button', { name: 'Salvar' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Lançamento' })).toBeVisible(); // não fecha com campos vazios
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);

  await page.getByRole('button', { name: '+ Novo Acordo' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Acordo' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Acordo');
  // a conta do beneficiário é escrita com agência, número e DÍGITO separado por hífen (mesmo texto nas 3 telas que listam contas)
  await expect(modal(page).getByLabel('Conta padrão do beneficiário').locator('option', { hasText: 'Ag. 0001' })).toHaveText('Banco E2E — Ag. 0001 · 12345-6');
  await modal(page).getByRole('button', { name: /\+ Parceria do acordo/ }).click();
  await expect(page.getByRole('heading', { name: 'Parceria do acordo (todas as parcelas)' })).toBeVisible();
  await semViolacoes(page, 'janela Parceria do acordo');
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Novo Alvará' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Alvará' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Alvará');
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();

  const acordo1 = linhaDoAcordo(page, 'Acordo E2E');
  await acordo1.getByRole('button', { name: 'Editar' }).click();
  await expect(modal(page).getByRole('heading', { name: /^Editar/ })).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();   // parcelas carregadas
  await page.mouse.move(0, 0);
  await semViolacoes(page, 'janela Editar acordo');
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await acordo1.getByRole('button', { name: 'Recibos' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Recibos do acordo' })).toBeVisible();
  await expect(modal(page).getByText('Carregando...')).toHaveCount(0);
  await semViolacoes(page, 'janela Recibos do acordo');
  await modal(page).getByRole('button', { name: 'Fechar' }).click();
  const acordo2 = linhaDoAcordo(page, 'Segundo E2E');
  await acordo2.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(modal(page).getByRole('heading', { name: 'Cancelar acordo' })).toBeVisible();
  await semViolacoes(page, 'janela Cancelar acordo');
  await modal(page).getByRole('button', { name: 'Cancelar acordo' }).click();            // sem motivo: não cancela
  await expect(modal(page).getByRole('heading', { name: 'Cancelar acordo' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Voltar' }).click();
  expect((await noBanco("SELECT status FROM acordo WHERE descricao = 'Segundo E2E'"))[0].status).not.toBe('cancelado');

  await acordo1.getByRole('button', { name: /Parcelas/ }).click();
  await expect(parcelaPendente(page)).toHaveCount(2);
  await semViolacoes(page, 'parcelas do acordo');
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Receber/ }).click();
  const rec = modal(page);
  await expect(rec.getByRole('heading', { name: 'Receber parcela 1' })).toBeVisible();
  await expect(rec.getByLabel('Conta ou caixa de recebimento')).not.toHaveValue('');       // sugestão automática: conta principal (ou o único caixa em espécie)
  await rec.getByLabel('Conta ou caixa de recebimento').selectOption('');                  // a pessoa pode limpar: a conta continua obrigatória
  await expect(rec.getByLabel('Forma de recebimento').locator('option')).toHaveCount(4);   // sem conta escolhida: "Selecione" + todas as 3 formas
  await semViolacoes(page, 'janela Receber parcela');
  await rec.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Informe a conta ou caixa de recebimento');
  await rec.getByLabel('Conta ou caixa de recebimento').selectOption({ label: 'Caixa E2E' });
  await expect(rec.getByLabel('Forma de recebimento').locator('option', { hasText: 'Dinheiro E2E' })).toHaveCount(1);
  await expect(rec.getByLabel('Forma de recebimento').locator('option', { hasText: 'Pix E2E' })).toHaveCount(0); // Pix não vale p/ caixa em espécie
  await rec.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Informe a forma de recebimento');
  await rec.getByLabel('Conta ou caixa de recebimento').selectOption({ label: 'Banco E2E — Conta E2E' });
  await expect(rec.getByLabel('Forma de recebimento').locator('option', { hasText: 'Pix E2E' })).toHaveCount(1);
  await rec.getByLabel('Forma de recebimento').selectOption({ label: 'Pix E2E' });
  await rec.getByLabel('Data do recebimento').fill('2026-01-06');
  await rec.getByLabel('Identificação no extrato').fill('PIX-UI-1');
  await rec.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Recebimento registrado');
  await aguardarTelaPronta(page);
  const [p1] = await noBanco("SELECT status, recebido_em, recebimento_identificacao FROM acordo_parcela WHERE numero = 1 AND status = 'pago'");
  expect(p1.recebimento_identificacao).toBe('PIX-UI-1');
  await expect(page.getByText('Recebimento — parc 1/2 do acordo')).toBeVisible();      // lançamento na conta corrente
  await semViolacoes(page, 'processo após receber parcela');

  await acordo1.getByRole('button', { name: /Parcelas/ }).click();
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Lançar multa/ }).click();
  const multa = modal(page);
  await expect(multa.getByRole('heading', { name: 'Lançar multa — parcela 2' })).toBeVisible();
  await semViolacoes(page, 'janela Lançar multa');
  await multa.getByRole('button', { name: 'Salvar multa' }).click();
  await expect(multa.getByRole('heading', { name: 'Lançar multa — parcela 2' })).toBeVisible();   // exige valor e data
  await multa.getByLabel('Valor da multa (R$)').fill('100,00');
  await multa.getByLabel('Data em que a multa deve ser paga').fill('2026-02-20');
  await multa.getByRole('button', { name: 'Salvar multa' }).click();
  await aviso(page, 'Multa lançada');
  await aguardarTelaPronta(page);

  await acordo1.getByRole('button', { name: /Parcelas/ }).click();
  await expect(page.getByText('Multa ·')).toBeVisible();
  // parcela e multa são independentes: com multa pendente, "Receber" da parcela abre a janela normalmente
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Receber/ }).click();
  await expect(modal(page).getByRole('heading', { name: 'Receber parcela 2' })).toBeVisible();
  await expect(page.getByText('Existe uma multa lançada nesta parcela')).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);
  // editar multa
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Multa/ }).first().hover();
  await page.getByRole('button', { name: /Editar multa/ }).click();
  await expect(modal(page).getByRole('heading', { name: /multa — parcela 2/i })).toBeVisible();
  await semViolacoes(page, 'janela Editar multa');
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  // receber a multa
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Multa/ }).first().hover();
  await page.getByRole('button', { name: /Receber multa/ }).click();
  const recMulta = modal(page);
  await expect(recMulta.getByRole('heading', { name: 'Receber multa da parcela 2' })).toBeVisible();
  await semViolacoes(page, 'janela Receber multa');
  await recMulta.getByLabel('Conta ou caixa de recebimento').selectOption({ label: 'Banco E2E — Conta E2E' });
  await recMulta.getByLabel('Forma de recebimento').selectOption({ label: 'Pix E2E' });
  await recMulta.getByLabel('Data do recebimento').fill('2026-02-21');
  await recMulta.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Multa recebida');
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM conta_corrente WHERE origem = 'multa'"))[0].n).toBe(1);

  // histórico da parcela
  await acordo1.getByRole('button', { name: /Parcelas/ }).click();
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Histórico/ }).click();
  await expect(modal(page).getByRole('heading', { name: 'Histórico da parcela 2' })).toBeVisible();
  await expect(modal(page).getByText('Carregando...')).toHaveCount(0);
  await expect(modal(page).getByText('Multa recebida').first()).toBeVisible();
  await semViolacoes(page, 'janela Histórico da parcela');
  await modal(page).getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('button', { name: 'Repasses pendentes' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByRole('button', { name: /^Pendentes \(/ })).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Repasses com pendências');
  const linhasPend = page.locator('tbody tr');
  const linhaCliente = linhasPend.filter({ hasText: 'Cliente' }).filter({ hasNotText: 'Parceiro' }).first();
  await abrirMenuAcoes(page, linhaCliente);
  await page.getByRole('button', { name: /Repassar/ }).click();
  const rep = modal(page);
  await expect(rep.getByRole('heading', { name: /Repassar ao cliente/ })).toBeVisible();
  await semViolacoes(page, 'janela Repassar');
  await expect(rep.getByLabel('Conta do beneficiário').locator('option', { hasText: 'Ag. 0001' })).toHaveText('Banco E2E — Ag. 0001 · 12345-6');
  await rep.getByRole('button', { name: 'Confirmar repasse' }).click();
  await expect(page.getByText(/obrigatória|obrigatório/).first()).toBeVisible();     // validação (janela de aviso)
  await semViolacoes(page, 'aviso de validação do repasse');
  await page.getByRole('button', { name: /^(OK|Entendi|Fechar|Ok)$/ }).first().click();
  await rep.getByLabel('Conta ou caixa de saída').selectOption({ label: 'Banco E2E — Conta E2E' });
  await rep.getByLabel('Forma do repasse').selectOption({ label: 'Pix E2E' });
  await rep.getByLabel('Observação do repasse (opcional)').fill('Repasse feito pela bateria');
  await rep.getByRole('button', { name: 'Confirmar repasse' }).click();
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE repasse_cliente_em IS NOT NULL"))[0].n).toBe(1);
  await page.getByRole('button', { name: /^Concluídos/ }).click();
  await expect(page.locator('tbody tr').filter({ hasText: 'Repasse feito pela bateria' })).toHaveCount(1);
  await semViolacoes(page, 'Financeiro — aba Repasses concluídos');

  await page.getByRole('button', { name: 'Consulta' }).click(); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText(/\d+ parcela\(s\)/)).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Consulta');
  await page.getByLabel('Status').selectOption('pago');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText('1 parcela(s)')).toBeVisible();
  await page.getByLabel('Status').selectOption('cancelada');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText('0 parcela(s)')).toBeVisible();
  await expect(page.getByRole('button', { name: /Exportar Excel/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Limpar' }).click(); await aguardarTelaPronta(page);
  await page.getByLabel('Nº do processo').fill('0000001');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  const baixa = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar Excel/ }).click();
  expect((await baixa).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole('button', { name: 'Por processo' }).click(); await aguardarTelaPronta(page);
  await abrirProcesso(page);
  await abrirParcelas(page);
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Receber/ }).click();
  await modal(page).getByLabel('Conta ou caixa de recebimento').selectOption({ label: 'Caixa E2E' });
  await modal(page).getByLabel('Forma de recebimento').selectOption({ label: 'Dinheiro E2E' });
  await modal(page).getByLabel('Data do recebimento').fill('2026-02-22');
  await modal(page).getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Recebimento registrado');
  await aguardarTelaPronta(page);

  await page.getByRole('button', { name: 'Repasses pendentes' }).click(); await aguardarTelaPronta(page);
  const pend = (quem, parc) => page.locator('tbody tr').filter({ hasText: parc }).filter(quem === 'parceiro' ? { hasText: 'Parceiro:' } : { hasText: 'Cliente', hasNotText: 'Parceiro' }).first();
  await abrirMenuAcoes(page, pend('parceiro', 'parc 1/2'));
  await page.getByRole('button', { name: /Repassar/ }).click();
  let rep2 = modal(page);
  await expect(rep2.getByRole('heading', { name: /Repassar ao parceiro/ })).toBeVisible();
  await rep2.getByLabel('Destino do repasse').selectOption({ label: 'Dinheiro em espécie — em mãos' });
  await expect(rep2.getByText('O valor será entregue pessoalmente ao beneficiário')).toBeVisible();
  await expect(rep2.getByLabel('Conta do beneficiário')).toHaveCount(0);                       // sem conta de destino
  await expect(rep2.getByLabel('Forma do repasse').locator('option', { hasText: 'Dinheiro E2E' })).toHaveCount(1);
  await expect(rep2.getByLabel('Forma do repasse').locator('option', { hasText: 'Pix E2E' })).toHaveCount(0);   // Pix não vale para espécie
  await semViolacoes(page, 'janela Repassar em espécie');
  await rep2.getByLabel('Conta ou caixa de saída').selectOption({ label: 'Caixa E2E' });
  await rep2.getByLabel('Forma do repasse').selectOption({ label: 'Dinheiro E2E' });
  await rep2.getByRole('button', { name: 'Confirmar repasse' }).click();
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE repasse_parceiro_em IS NOT NULL"))[0].n).toBe(1);

  await abrirMenuAcoes(page, pend('cliente', 'parc 2/2'));
  await page.getByRole('button', { name: /Repassar/ }).click();
  rep2 = modal(page);
  await rep2.getByLabel('Destino do repasse').selectOption({ label: 'Dinheiro em espécie — em mãos' });
  await rep2.getByLabel('Conta ou caixa de saída').selectOption({ label: 'Caixa E2E' });
  await rep2.getByLabel('Forma do repasse').selectOption({ label: 'Dinheiro E2E' });
  await rep2.getByRole('button', { name: 'Confirmar repasse' }).click();
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE repasse_cliente_em IS NOT NULL"))[0].n).toBe(2);

  await abrirMenuAcoes(page, pend('parceiro', 'parc 2/2'));
  await page.getByRole('button', { name: /Repassar/ }).click();
  rep2 = modal(page);
  // o parceiro tem uma conta, mas nenhuma marcada como principal: a janela já sugere "Dinheiro em espécie — em mãos" (e avisa); a pessoa pode trocar
  await expect(rep2.getByLabel('Destino do repasse')).toHaveValue('em_maos');
  await expect(rep2.getByText(/não tem conta principal cadastrada/)).toBeVisible();
  await rep2.getByLabel('Destino do repasse').selectOption({ label: 'Conta bancária' });
  await expect(rep2.getByLabel('Conta do beneficiário').locator('option')).toHaveCount(2);      // "Selecione" + a conta Pix do parceiro
  await rep2.getByRole('button', { name: '+ Cadastrar conta do beneficiário' }).click();
  const nova = modal(page);
  await expect(nova.getByRole('heading', { name: /Nova conta de/ })).toBeVisible();
  await semViolacoes(page, 'janela Nova conta do beneficiário');
  await nova.getByRole('button', { name: /^Cadastrar/ }).click();
  await aviso(page, 'Escolha a instituição financeira.');                                        // exige a instituição
  await nova.getByLabel('Instituição financeira').selectOption({ label: 'Banco E2E' });
  await nova.getByRole('checkbox', { name: /Conta de outra pessoa/ }).check();
  await expect(nova.getByLabel('Titular')).toBeVisible();
  await semViolacoes(page, 'Nova conta do beneficiário — conta de terceiro');
  await nova.getByRole('button', { name: /^Cadastrar/ }).click();
  await aviso(page, 'Informe o titular e o CPF/CNPJ da conta de terceiro.');
  await nova.getByRole('checkbox', { name: /Conta de outra pessoa/ }).uncheck();
  await nova.getByLabel('Agência').fill('0002');
  await nova.getByLabel('Conta', { exact: true }).fill('99887');
  await nova.getByLabel('Dígito').fill('123');                                                    // 3 caracteres: o sistema pede confirmação
  await nova.getByRole('button', { name: /^Cadastrar/ }).click();
  await expect(page.getByText('Confirmar dígito da conta')).toBeVisible();
  await semViolacoes(page, 'aviso do dígito da conta');
  await page.getByRole('button', { name: 'Cadastrar mesmo assim' }).click();
  await aviso(page, 'Conta cadastrada e selecionada para este repasse.');
  rep2 = modal(page);
  await expect(rep2.getByLabel('Conta do beneficiário').locator('option')).toHaveCount(3);      // agora com a conta nova
  await expect(rep2.getByLabel('Conta do beneficiário').locator('option:checked')).toContainText('99887');
  await rep2.getByLabel('Conta ou caixa de saída').selectOption({ label: 'Banco E2E — Conta E2E' });
  await rep2.getByLabel('Forma do repasse').selectOption({ label: 'Pix E2E' });
  await rep2.getByRole('button', { name: 'Confirmar repasse' }).click();
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE repasse_parceiro_em IS NOT NULL"))[0].n).toBe(2);
  await page.getByRole('button', { name: /^Concluídos/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);                                          // 2 parcelas × (cliente + parceiro)
  await semViolacoes(page, 'Repasses concluídos (4 linhas)');

  await page.getByRole('button', { name: 'Por processo' }).click(); await aguardarTelaPronta(page);
  await abrirProcesso(page);
  await abrirParcelas(page);
  await abrirMenuAcoes(page, page.locator('tbody tr').filter({ hasText: 'Recebida' }).first());
  await page.getByRole('button', { name: /Desfazer recebimento/ }).click();
  await aviso(page, "Desfaça os repasses na aba 'Repasses' antes de desfazer o recebimento.");     // bloqueio com explicação
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE status = 'pago'"))[0].n).toBe(2);
  await page.getByRole('button', { name: 'Repasses pendentes' }).click(); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: /^Concluídos/ }).click();
  for (let i = 0; i < 2; i++) {                                                                   // cliente e parceiro da parcela 1
    await abrirMenuAcoes(page, page.locator('tbody tr').filter({ hasText: 'parc 1/2' }).first());
    await page.getByRole('button', { name: /Desfazer/ }).click();
    await aviso(page, 'Repasse desfeito');
    await aguardarTelaPronta(page);
  }
  await expect(page.locator('tbody tr').filter({ hasText: 'parc 1/2' })).toHaveCount(0);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE repasse_cliente_em IS NOT NULL OR repasse_parceiro_em IS NOT NULL"))[0].n).toBe(1);   // só a parcela 2 segue repassada
  await page.getByRole('button', { name: 'Por processo' }).click(); await aguardarTelaPronta(page);
  await abrirProcesso(page);
  await abrirParcelas(page);
  await abrirMenuAcoes(page, page.locator('tbody tr').filter({ hasText: 'Recebida' }).first());
  await page.getByRole('button', { name: /Desfazer recebimento/ }).click();
  await aviso(page, 'Recebimento desfeito');
  await aguardarTelaPronta(page);
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE status = 'pago'"))[0].n).toBe(1);
  await expect(page.getByText('Recebimento — parc 1/2 do acordo')).toHaveCount(0);              // o lançamento da conta corrente sumiu

  await abrirParcelas(page);
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Lançar multa/ }).click();
  await modal(page).getByLabel('Valor da multa (R$)').fill('50,00');
  await modal(page).getByLabel('Data em que a multa deve ser paga').fill('2026-03-01');
  await modal(page).getByRole('button', { name: 'Salvar multa' }).click();
  await aviso(page, 'Multa lançada');
  await aguardarTelaPronta(page);
  await abrirParcelas(page);
  await expect(page.getByText('Multa ·')).toHaveCount(2);                                         // parcela 1 (pendente) e parcela 2 (recebida)
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Multa/ }).first().hover();
  await page.getByRole('button', { name: /Remover multa/ }).click();
  await expect(page.getByRole('heading', { name: 'Remover multa' })).toBeVisible();
  await semViolacoes(page, 'confirmação Remover multa');
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await aviso(page, 'Multa removida');
  await aguardarTelaPronta(page);
  await abrirParcelas(page);
  await expect(page.getByText('Multa ·')).toHaveCount(1);                                         // só a multa recebida da parcela 2 ficou
  await semViolacoes(page, 'processo no fim do fluxo');
  await erroDeTela(page);
  // Controle > Instituições financeiras: a conta do escritório também é escrita com o dígito separado por hífen
  await page.goto('/controle/instituicoes-financeiras'); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr').filter({ hasText: 'Conta E2E' })).toContainText('Ag. 1 · 2-3');
});
