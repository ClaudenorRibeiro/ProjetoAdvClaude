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

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

test('@critical Financeiro: abas, janelas, validações, recebimento, multa, repasse e consulta', async ({ page, request }) => {
  test.setTimeout(420000);
  // Tudo é criado ANTES de entrar pela tela (um novo login derruba a sessão anterior).
  const F = await prepararFinanceiro(request);
  await F.novoAcordo('Acordo E2E');
  await F.novoAcordo('Segundo E2E');

  await loginPelaTela(page);
  await page.goto('/financeiro'); await aguardarTelaPronta(page);

  console.log('PASSO: Abas');
  await expect(page.getByText('Selecione uma pasta e um processo para ver o financeiro')).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Por processo (vazia)');
  await page.getByRole('button', { name: 'Repasses pendentes' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByRole('heading', { name: 'Repasses' })).toBeVisible();
  await expect(page.getByText('Nenhum repasse pendente.')).toBeVisible();
  await page.getByRole('button', { name: /^Concluídos/ }).click();
  await expect(page.getByText('Nenhum repasse concluído ainda.')).toBeVisible();
  await semViolacoes(page, 'Financeiro — aba Repasses (vazia)');
  await page.getByRole('button', { name: 'Por processo' }).click();

  console.log('PASSO: Escolher pasta e processo');
  await page.getByPlaceholder('Buscar pasta pelo título ou número...').pressSequentially('PROCESSO', { delay: 50 });
  await page.locator('div[style*="cursor: pointer"]').first().dispatchEvent('mousedown');
  await page.getByLabel('Processo', { exact: true }).selectOption({ index: 1 });
  await aguardarTelaPronta(page);
  await expect(page.getByText('Acordos e Alvarás')).toBeVisible();
  await expect(page.getByText('Nenhum lançamento neste processo')).toBeVisible();
  await semViolacoes(page, 'Financeiro — processo com acordos');
  await erroDeTela(page);

  console.log('PASSO: Novo lançamento');
  await page.getByRole('button', { name: '+ Lançamento' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Lançamento' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Lançamento');
  await modal(page).getByRole('button', { name: 'Salvar' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Lançamento' })).toBeVisible(); // não fecha com campos vazios
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.modal-box')).toHaveCount(0);

  console.log('PASSO: Novo acordo, parceria do acordo e novo alvará');
  await page.getByRole('button', { name: '+ Novo Acordo' }).click();
  await expect(modal(page).getByRole('heading', { name: 'Novo Acordo' })).toBeVisible();
  await semViolacoes(page, 'janela Novo Acordo');
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

  console.log('PASSO: Editar acordo, recibos, cancelar acordo (só valida o motivo e volta)');
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

  console.log('PASSO: Receber parcela 1 (validações + conferência da forma × conta)');
  await acordo1.getByRole('button', { name: /Parcelas/ }).click();
  await expect(parcelaPendente(page)).toHaveCount(2);
  await semViolacoes(page, 'parcelas do acordo');
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Receber/ }).click();
  const rec = modal(page);
  await expect(rec.getByRole('heading', { name: 'Receber parcela 1' })).toBeVisible();
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

  console.log('PASSO: Multa da parcela 2');
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
  // com multa pendente, receber a parcela é bloqueado com explicação
  await abrirMenuAcoes(page, parcelaPendente(page).first());
  await page.getByRole('button', { name: /Receber/ }).click();
  await aviso(page, 'Existe uma multa lançada nesta parcela');
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

  console.log('PASSO: Repasses pendentes');
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

  console.log('PASSO: Consulta');
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
  await erroDeTela(page);
});
