import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Recebimento AVULSO (pasta > Financeiro e tela Financeiro > Consulta): valor combinado à parte que o cliente pagará depois, parcelável.
// Todo o valor é do escritório (sem honorário, líquido nem multa); parceiro opcional. A Consulta ganhou o filtro "Origem" (inclui as MULTAS).
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const CNJ1 = '9400001-00.2026.5.15.0001';
const filtroProcesso = (page) => page.getByLabel('Filtrar por processo', { exact: true });
const blocoAcordo = (page, descricao) => page.locator('div').filter({ hasText: descricao })
  .filter({ has: page.getByRole('button', { name: /Parcelas/ }) }).last();
const DIA = '2099-04-06';

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  const dias = [];
  for (const [ano, mes, ultimo] of [[2099, 3, 31], [2099, 4, 30], [2099, 5, 31], [2099, 6, 30], [2099, 7, 31]]) {
    for (let dia = 1; dia <= ultimo; dia++) {
      const dt = new Date(Date.UTC(ano, mes - 1, dia, 12));
      dias.push(`('${dt.toISOString().slice(0, 10)}', ${[0, 6].includes(dt.getUTCDay()) ? 0 : 1})`);
    }
  }
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);
  d.banco = (await noBanco("INSERT INTO instituicao_financeira (nome, ativo) VALUES ('Banco AV', 1)")).insertId;
  d.conta = (await noBanco("INSERT INTO conta_financeira (instituicao_financeira_id, nome, tipo, ativo, principal) VALUES (?, 'Conta AV', 'bancaria', 1, 0)", [d.banco])).insertId;
  d.forma = (await noBanco("INSERT INTO forma_pagamento (nome, uso_permitido) VALUES ('Pix AV', 'ambos')")).insertId;
});
test.afterAll(async () => {
  await limparPastaPartes(d);
  await noBanco("DELETE FROM conta_financeira WHERE nome = 'Conta AV'");
  await noBanco("DELETE FROM instituicao_financeira WHERE nome = 'Banco AV'");
  await noBanco("DELETE FROM forma_pagamento WHERE nome = 'Pix AV'");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('conta_corrente', 'acordo', 'acordo_parcela')");
  await noBanco("DELETE FROM calendario WHERE data >= '2099-03-01' AND data <= '2099-07-31'");
});
test.beforeEach(async ({ page }) => {
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
});

async function abrirAba(page) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=financeiro`); await aguardarTelaPronta(page);
  await filtroProcesso(page).selectOption({ label: CNJ1 }); await aguardarTelaPronta(page);
}
// Avulso pronto no banco: 2 parcelas de R$ 500 (todo o valor é "honorário", líquido 0)
async function avulsoNoBanco(descricao = 'Honorários AV') {
  const ac = (await noBanco("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, criado_por) VALUES (?, 'avulso', ?, 1000, 2, ?, 1)", [d.proc1, descricao, DIA])).insertId;
  const parc = async (n, venc) => (await noBanco(
    `INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido, status)
     VALUES (?, ?, ?, 500, 'percent', 100, 500, 0, 'pendente')`, [ac, n, venc])).insertId;
  return { ac, p1: await parc(1, DIA), p2: await parc(2, '2099-05-06') };
}

test('@critical Novo Recebimento Avulso: janela sem honorário, multa nem cliente; parcela R$ 1.000 em 3 vezes; salva como avulso com líquido zero e aparece "Recebimento Avulso 1"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await page.getByRole('button', { name: '+ Recebimento Avulso' }).click();
  const j = janela(page, 'Novo Recebimento Avulso');
  await expect(j).toBeVisible();
  await expect(j.getByRole('button', { name: 'Salvar recebimento avulso' })).toBeDisabled();
  // nada de honorário padrão, multa do juiz nem beneficiário (cliente): o valor é todo do escritório
  await expect(j.getByLabel('Honorário padrão (%)', { exact: true })).toHaveCount(0);
  await expect(j.getByLabel('Multa fixada pelo juiz (%)', { exact: true })).toHaveCount(0);
  await expect(j.getByLabel('Beneficiário padrão das parcelas', { exact: true })).toHaveCount(0);
  await j.getByLabel('Valor total (R$)', { exact: true }).fill('100000');
  await j.getByLabel('Nº de parcelas', { exact: true }).fill('3');
  await j.getByLabel('1ª parcela', { exact: true }).fill(DIA);
  await j.getByLabel('Descrição (opcional)', { exact: true }).fill('Honorários combinados à parte');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(j.getByLabel('Vencimento da parcela 3', { exact: true })).toBeVisible();
  await expect(j.getByLabel('Valor bruto da parcela 1', { exact: true })).toHaveValue('333,33');
  await expect(j.getByLabel('Valor bruto da parcela 3', { exact: true })).toHaveValue('333,34');
  await expect(j.getByRole('columnheader', { name: 'Honor.' })).toHaveCount(0);            // sem colunas de honorário/líquido
  await expect(j.getByRole('columnheader', { name: 'Líquido' })).toHaveCount(0);
  await semViolacoes(page, 'janela Novo Recebimento Avulso');
  // parceria: incide sobre o valor (não "sobre o honorário")
  await j.getByRole('button', { name: '+ Parceria do acordo (todas as parcelas)' }).click();
  await expect(page.getByText(/incide sobre o valor/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await j.getByRole('button', { name: 'Salvar recebimento avulso' }).click();
  await aviso(page, 'Recebimento Avulso criado!');
  const novo = (await noBanco("SELECT id, tipo, valor_total, qtd_parcelas, beneficiario_cliente_id FROM acordo WHERE descricao = 'Honorários combinados à parte'"))[0];
  expect({ t: novo.tipo, v: Number(novo.valor_total), q: novo.qtd_parcelas, c: novo.beneficiario_cliente_id }).toEqual({ t: 'avulso', v: 1000, q: 3, c: null });
  const ps = await noBanco('SELECT valor_bruto, honor_valor, valor_liquido, multa_percentual FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [novo.id]);
  expect(ps.map(p => [Number(p.valor_bruto), Number(p.honor_valor), Number(p.valor_liquido), p.multa_percentual])).toEqual([[333.33, 333.33, 0, null], [333.33, 333.33, 0, null], [333.34, 333.34, 0, null]]);
  await expect(page.getByText('Recebimento Avulso 1')).toBeVisible();
  await expect(page.getByText('0/3 parcelas pagas')).toBeVisible();
});

test('@critical Parcelas do avulso: sem colunas de honorário/líquido, sem "Lançar multa"; recebe e não sobra repasse ao cliente', async ({ page }) => {
  await noBanco("INSERT INTO conta_financeira (nome, tipo, ativo, principal) SELECT 'Caixa AV', 'especie', 1, 0 WHERE NOT EXISTS (SELECT 1 FROM conta_financeira WHERE nome = 'Caixa AV')");
  const av = await avulsoNoBanco();
  await loginPelaTela(page);
  await abrirAba(page);
  const bloco = () => blocoAcordo(page, 'Honorários AV');
  await bloco().getByRole('button', { name: /Parcelas/ }).click();
  const tabela = page.getByRole('region', { name: 'Parcelas do acordo' });
  await expect(tabela.locator('thead th')).toHaveText(['#', 'Vencimento', 'Bruto', 'Parceria', 'Obs', 'Status', 'Ações']);   // sem Honorário nem Líquido
  const p1 = tabela.locator('tbody tr').filter({ hasText: 'Pendente' }).first();
  await abrirMenuAcoes(page, p1);
  await expect(page.getByRole('button', { name: /Receber/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Lançar multa/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Receber/ }).first().click();
  const j = janela(page, 'Receber parcela 1');
  await j.getByLabel('Data do recebimento', { exact: true }).fill('2099-04-07');
  await j.getByLabel('Conta ou caixa de recebimento', { exact: true }).selectOption({ label: 'Banco AV — Conta AV' });
  await j.getByLabel('Forma de recebimento', { exact: true }).selectOption({ label: 'Pix AV' });
  await j.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Recebimento registrado');
  const lanc = (await noBanco("SELECT descricao, valor FROM conta_corrente WHERE parcela_id = ? AND origem = 'recebimento'", [av.p1]))[0];
  expect(Number(lanc.valor)).toBe(500);
  expect(lanc.descricao).toContain('recebimento avulso 1');
  await expect(page.getByText('1/2 parcelas pagas')).toBeVisible();
  await bloco().getByRole('button', { name: /Parcelas/ }).click();
  await expect(page.getByText('Falta repassar ao cliente')).toHaveCount(0);
  await expect(page.getByText('✓ Ciclo concluído')).toBeVisible();                           // sem parceiro, o ciclo fecha ao receber
  await semViolacoes(page, 'parcelas do recebimento avulso');
});

test('@critical Consulta: filtro Origem separa avulso, acordo e as MULTAS por atraso, com o total acompanhando', async ({ page }) => {
  await avulsoNoBanco();
  const ac = (await noBanco("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, criado_por) VALUES (?, 'acordo', 'Acordo AV', 2000, 1, ?, 1)", [d.proc1, DIA])).insertId;
  const pa = (await noBanco(`INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido, status)
     VALUES (?, 1, ?, 2000, 'percent', 30, 600, 1400, 'pendente')`, [ac, DIA])).insertId;
  await noBanco(`INSERT INTO acordo_parcela_multa (parcela_id, percentual_juiz, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido, status, criado_por)
     VALUES (?, 10, '2099-04-20', 200, 'percent', 30, 60, 140, 'pendente', 1)`, [pa]);
  await loginPelaTela(page);
  await page.goto('/financeiro'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: 'Consulta' }).click(); await aguardarTelaPronta(page);
  await page.getByLabel('Vencimento de').fill('2099-04-01');
  await page.getByLabel('Vencimento até').fill('2099-04-30');
  await page.getByLabel('Origem').selectOption('avulso');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText('1 parcela(s)')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Avulso 1' })).toBeVisible();
  await expect(page.getByText('Bruto: R$ 500,00')).toBeVisible();
  await semViolacoes(page, 'Consulta — origem avulso');
  await page.getByLabel('Origem').selectOption('acordo');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByRole('cell', { name: 'Acordo 1' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Avulso 1' })).toHaveCount(0);
  await page.getByLabel('Origem').selectOption('multa');
  await page.getByRole('button', { name: 'Pesquisar' }).click(); await aguardarTelaPronta(page);
  await expect(page.getByText('1 multa(s)')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Multa — Acordo 1' })).toBeVisible();
  await expect(page.getByText('Bruto: R$ 200,00')).toBeVisible();
  await semViolacoes(page, 'Consulta — origem multa');
});
