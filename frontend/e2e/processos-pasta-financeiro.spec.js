import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C8 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Financeiro" da pasta — por processo: conta corrente (extrato e saldo), lançamento manual
// (novo, editar, histórico, excluir), acordo e alvará (novo, editar, cancelar, excluir), receber/desfazer parcela, lançamentos de acordo
// intocáveis, troca de processo, permissões e acessibilidade. (Multa e repasse têm testes próprios na tela Financeiro.)
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ2 = '9400002-00.2026.5.15.0001';
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });
const filtroProcesso = (page) => page.getByLabel('Filtrar por processo', { exact: true });
const blocoAcordo = (page, descricao) => page.locator('div').filter({ hasText: descricao })
  .filter({ has: page.getByRole('button', { name: /Parcelas/ }) }).last();
// Item do menu ⋮ (o do fim da página: o bloco do acordo tem botões com o mesmo nome, e vem antes do extrato)
const itemMenu = (page, nome) => page.getByRole('button', { name: new RegExp(nome) }).last();
const DIA = '2099-04-06';   // segunda-feira útil no calendário do teste

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  const dias = [];
  for (const [ano, mes, ultimo] of [[2001, 1, 31], [2099, 3, 31], [2099, 4, 30], [2099, 5, 31], [2099, 6, 30], [2099, 7, 31]]) {
    for (let dia = 1; dia <= ultimo; dia++) {
      const dt = new Date(Date.UTC(ano, mes - 1, dia, 12));
      dias.push(`('${dt.toISOString().slice(0, 10)}', ${[0, 6].includes(dt.getUTCDay()) ? 0 : 1})`);
    }
  }
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);   // o banco de teste tem calendário esparso
  d.banco = (await noBanco("INSERT INTO instituicao_financeira (nome, ativo) VALUES ('Banco C8', 1)")).insertId;
  d.conta = (await noBanco("INSERT INTO conta_financeira (instituicao_financeira_id, nome, tipo, ativo, principal) VALUES (?, 'Conta C8', 'bancaria', 1, 0)", [d.banco])).insertId;
  d.forma = (await noBanco("INSERT INTO forma_pagamento (nome, uso_permitido) VALUES ('Pix C8', 'ambos')")).insertId;
});
test.afterAll(async () => {
  await limparPastaPartes(d);
  await noBanco("DELETE FROM conta_financeira WHERE nome = 'Conta C8'");
  await noBanco("DELETE FROM instituicao_financeira WHERE nome = 'Banco C8'");
  await noBanco("DELETE FROM forma_pagamento WHERE nome = 'Pix C8'");
  await noBanco("DELETE FROM conta_financeira WHERE nome = 'Caixa C8'");
  await noBanco("DELETE FROM forma_pagamento WHERE nome = 'Dinheiro C8'");
  await noBanco("DELETE FROM pessoas_fisicas WHERE nome IN ('Cliente Repasse C8', 'Parceiro Repasse C8')");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('conta_corrente', 'acordo', 'acordo_parcela')");
  await noBanco("DELETE FROM calendario WHERE data >= '2099-03-01' AND data <= '2099-07-31'");
  await noBanco("DELETE FROM calendario WHERE data >= '2001-01-01' AND data <= '2001-01-31'");
});
test.beforeEach(async ({ page }) => {
  await restaurarPastaPartes(d);    // recria a pasta 7401 (e apaga lançamentos e acordos antigos em cascata)
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
  const lanc = async (proc, data, descricao, tipo, valor, origem = 'manual') => (await noBanco(
    'INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, origem, usuario_id) VALUES (?, ?, ?, ?, ?, ?, 1)', [proc, data, descricao, tipo, valor, origem])).insertId;
  d.l1 = await lanc(d.proc1, '2099-03-01', 'Adiantamento do cliente', 'entrada', 1000);
  d.l2 = await lanc(d.proc1, '2099-03-02', 'Custas do cartório', 'saida', 250.5);
  d.l3 = await lanc(d.proc1, '2099-03-03', 'Recebimento do acordo', 'entrada', 300, 'recebimento');
  d.l4 = await lanc(d.proc2, '2099-03-04', 'Despesa do outro processo', 'saida', 80);
  d.ac = (await noBanco("INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, criado_por) VALUES (?, 'acordo', 'Acordo C8', 2000, 2, ?, 1)", [d.proc1, DIA])).insertId;
  const parc = async (n, venc) => (await noBanco(
    `INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido, status)
     VALUES (?, ?, ?, 1000, 'percent', 30, 300, 700, 'pendente')`, [d.ac, n, venc])).insertId;
  d.pa1 = await parc(1, DIA); d.pa2 = await parc(2, '2099-05-06');
});

async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=financeiro`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Financeiro');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const preencherLanc = async (j, { tipo = 'Saída', data = '2099-03-10', descricao = 'cartório central', valor = '15050' } = {}) => {
  await j.getByLabel('Tipo', { exact: true }).selectOption({ label: tipo });
  await j.getByLabel('Data', { exact: true }).fill(data);
  await j.getByLabel('Descrição', { exact: true }).fill(descricao);
  await j.getByLabel('Valor (R$)', { exact: true }).fill(valor);
};
const lancNoBanco = (descricao) => noBanco("SELECT tipo, valor, origem, DATE_FORMAT(data, '%Y-%m-%d') AS dia FROM conta_corrente WHERE LOWER(descricao) = LOWER(?)", [descricao]);

test('@critical Aba Financeiro: sem processo escolhido pede o processo; com processo mostra botões, acordo, extrato, saldo e a marca "(acordo)" sem menu', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByText('Selecione um processo para ver o financeiro')).toBeVisible();
  for (const nome of ['+ Lançamento', '+ Novo Acordo', '+ Novo Alvará']) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);   // sem processo não há onde ligar o lançamento
  await filtroProcesso(page).selectOption({ label: CNJ1 }); await aguardarTelaPronta(page);
  for (const nome of ['+ Lançamento', '+ Novo Acordo', '+ Novo Alvará']) await expect(page.getByRole('button', { name: nome })).toBeVisible();
  await expect(page.getByText('Conta corrente')).toBeVisible();
  await expect(page.getByText(/1\.049,50/)).toBeVisible();                                   // 1.000 − 250,50 + 300
  await expect(page.getByRole('columnheader')).toHaveText(['Data', 'Descrição', 'Tipo', 'Valor', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const l1 = linha(page, 'Adiantamento do cliente');
  await expect(l1.locator('td').nth(0)).toHaveText('01/03/2099');
  await expect(l1.locator('td').nth(2)).toHaveText('Entrada');
  await expect(l1.locator('td').nth(3)).toContainText('+');
  await expect(l1.locator('td').nth(3)).toContainText('1.000,00');
  await expect(linha(page, 'Custas do cartório').locator('td').nth(2)).toHaveText('Saída');
  await expect(linha(page, 'Custas do cartório').locator('td').nth(3)).toContainText('250,50');
  const doAcordo = linha(page, 'Recebimento do acordo');
  await expect(doAcordo.getByText('(acordo)')).toBeVisible();
  await expect(doAcordo.getByTitle('Mais ações')).toHaveCount(0);                           // lançamento de acordo não se mexe aqui
  await expect(page.getByText('0/2 parcelas pagas')).toBeVisible();
  await expect(page.getByText('Acordo 1')).toBeVisible();
  await semViolacoes(page, 'aba Financeiro com extrato e acordo');
  await filtroProcesso(page).selectOption({ label: CNJ2 }); await aguardarTelaPronta(page);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Despesa do outro processo')).toBeVisible();
  await expect(page.getByText('Adiantamento do cliente')).toHaveCount(0);                   // um processo não mostra o lançamento do outro
  await expect(page.getByText('Acordo 1')).toHaveCount(0);
  await filtroProcesso(page).selectOption('todos'); await aguardarTelaPronta(page);
  await expect(page.getByText('Selecione um processo para ver o financeiro')).toBeVisible();
});

test('@critical Novo lançamento: janela, obrigatórios, grava entrada e saída, soma no saldo e aparece no extrato', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await page.getByRole('button', { name: '+ Lançamento' }).click();
  const j = janela(page, 'Novo Lançamento');
  await expect(j).toBeVisible();
  await expect(j.getByLabel('Tipo', { exact: true })).toHaveValue('saida');
  await semViolacoes(page, 'janela Novo Lançamento');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Descrição é obrigatória');
  await j.getByLabel('Descrição', { exact: true }).fill('cartório central');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Valor deve ser maior que zero');
  await preencherLanc(j, { tipo: 'Entrada', descricao: 'depósito do réu', valor: '50000' });
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Lançamento registrado!');
  await expect(janela(page, 'Novo Lançamento')).toHaveCount(0);
  const e = await lancNoBanco('Depósito Do Réu');
  expect(e.length, 'o lançamento não foi gravado (ou o título não foi ajustado)').toBe(1);
  expect({ t: e[0].tipo, v: Number(e[0].valor), o: e[0].origem, d: e[0].dia }).toEqual({ t: 'entrada', v: 500, o: 'manual', d: '2099-03-10' });
  await expect(linha(page, 'Depósito Do Réu')).toBeVisible();
  await expect(page.getByText(/1\.549,50/)).toBeVisible();                                   // saldo: 1.049,50 + 500
});

test('@critical Editar lançamento: janela preenchida, salva, o histórico mostra De → Para; só o lançamento manual tem menu', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  await itemMenu(page, 'Editar').click();
  const j = janela(page, 'Editar Lançamento');
  await expect(j.getByLabel('Descrição', { exact: true })).toHaveValue('Custas do cartório');
  await expect(j.getByLabel('Valor (R$)', { exact: true })).toHaveValue('250,50');
  await expect(j.getByLabel('Tipo', { exact: true })).toHaveValue('saida');
  await j.getByLabel('Valor (R$)', { exact: true }).fill('30000');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Lançamento atualizado!');
  expect(Number((await noBanco('SELECT valor FROM conta_corrente WHERE id = ?', [d.l2]))[0].valor)).toBe(300);
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  await itemMenu(page, 'Histórico').click();
  const h = janela(page, 'Histórico do lançamento');
  await expect(h.getByRole('columnheader')).toHaveText(['Quando', 'Evento', 'Campo', 'De', 'Para', 'Usuário']);
  await expect(h.getByRole('cell', { name: 'Valor', exact: true })).toBeVisible();
  await expect(h.getByRole('cell', { name: /250,50/ })).toBeVisible();
  await expect(h.getByRole('cell', { name: /300,00/ })).toBeVisible();
  await semViolacoes(page, 'Histórico do lançamento');
});

test('@critical Excluir lançamento: pede confirmação, "Cancelar" não apaga, "Excluir" apaga e o saldo acompanha', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  await itemMenu(page, 'Excluir').click();
  await expect(page.getByText('Este lançamento será removido permanentemente.')).toBeVisible();
  await janela(page, 'Excluir lançamento').getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await noBanco('SELECT id FROM conta_corrente WHERE id = ?', [d.l2])).length).toBe(1);
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  await itemMenu(page, 'Excluir').click();
  await janela(page, 'Excluir lançamento').getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Lançamento removido');
  expect((await noBanco('SELECT id FROM conta_corrente WHERE id = ?', [d.l2])).length).toBe(0);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText(/1\.300,00/)).toBeVisible();                                   // 1.000 + 300
});

test('@critical Novo acordo: janela, obrigatórios, data retroativa pede confirmação, gera as parcelas, salva e aparece o bloco "Acordo 2"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await page.getByRole('button', { name: '+ Novo Acordo' }).click();
  const j = janela(page, 'Novo Acordo');
  await expect(j).toBeVisible();
  await expect(j.getByRole('button', { name: 'Salvar acordo' })).toBeDisabled();             // sem parcelas não salva
  await semViolacoes(page, 'janela Novo Acordo (vazia)');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await aviso(page, 'Informe o valor total');
  await j.getByLabel('Valor total (R$)', { exact: true }).fill('300000');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await aviso(page, 'Informe a quantidade de parcelas');
  await j.getByLabel('Nº de parcelas', { exact: true }).fill('3');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await aviso(page, 'Informe a data da primeira parcela');
  await j.getByLabel('1ª parcela', { exact: true }).fill('2001-01-08');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(page.getByText('Data retroativa')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect(j.getByLabel('Vencimento da parcela 1', { exact: true })).toHaveCount(0);      // cancelou: nada foi gerado
  await j.getByLabel('1ª parcela', { exact: true }).fill(DIA);
  await j.getByLabel('Descrição (opcional)', { exact: true }).fill('Acordo da audiência');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(j.getByLabel('Vencimento da parcela 3', { exact: true })).toBeVisible();
  await expect(j.getByLabel('Valor bruto da parcela 1', { exact: true })).toHaveValue('1.000,00');
  await expect(j.getByText(/Soma bruta/)).toContainText('3.000,00');
  await semViolacoes(page, 'janela Novo Acordo com parcelas');
  await j.getByLabel('Observação da parcela 2', { exact: true }).fill('Segunda parcela');
  await j.getByRole('button', { name: 'Salvar acordo' }).click();
  await aviso(page, 'Acordo criado!');
  const novo = (await noBanco("SELECT id, tipo, valor_total, qtd_parcelas, status FROM acordo WHERE descricao = 'Acordo da audiência'"))[0];
  expect({ t: novo.tipo, v: Number(novo.valor_total), q: novo.qtd_parcelas, s: novo.status }).toEqual({ t: 'acordo', v: 3000, q: 3, s: 'ativo' });
  const ps = await noBanco('SELECT numero, valor_bruto, honor_valor, valor_liquido, observacao FROM acordo_parcela WHERE acordo_id = ? ORDER BY numero', [novo.id]);
  expect(ps.map(p => [Number(p.valor_bruto), Number(p.honor_valor), Number(p.valor_liquido)])).toEqual([[1000, 300, 700], [1000, 300, 700], [1000, 300, 700]]);
  expect(ps[1].observacao).toBe('Segunda parcela');
  await expect(page.getByText('Acordo 2')).toBeVisible();
  await expect(page.getByText('0/3 parcelas pagas')).toBeVisible();
});

test('@critical Novo alvará: mesma janela com o nome "Alvará", valor com centavos, bloco "Alvará 1"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await page.getByRole('button', { name: '+ Novo Alvará' }).click();
  const j = janela(page, 'Novo Alvará');
  await expect(j).toBeVisible();
  await j.getByLabel('Valor total (R$)', { exact: true }).fill('123456');
  await j.getByLabel('Nº de parcelas', { exact: true }).fill('1');
  await j.getByLabel('1ª parcela', { exact: true }).fill(DIA);
  await j.getByLabel('Descrição (opcional)', { exact: true }).fill('Alvará de levantamento');
  await j.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(j.getByLabel('Valor bruto da parcela 1', { exact: true })).toHaveValue('1.234,56');
  await j.getByRole('button', { name: 'Salvar alvará' }).click();
  await aviso(page, 'Alvará criado!');
  const novo = (await noBanco("SELECT tipo, valor_total FROM acordo WHERE descricao = 'Alvará de levantamento'"))[0];
  expect({ t: novo.tipo, v: Number(novo.valor_total) }).toEqual({ t: 'alvara', v: 1234.56 });
  await expect(page.getByText('Alvará 1')).toBeVisible();
});

test('@critical Editar acordo: janela carregada com as parcelas, muda uma parcela, o total muda (pede confirmação) e o histórico da parcela registra', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await blocoAcordo(page, 'Acordo C8').getByRole('button', { name: 'Editar', exact: true }).click();
  const j = janela(page, 'Editar Acordo');
  await expect(j.getByLabel('Descrição (opcional)', { exact: true })).toHaveValue('Acordo C8');
  await expect(j.getByLabel('Valor bruto da parcela 2', { exact: true })).toHaveValue('1.000,00');
  await j.getByLabel('Valor bruto da parcela 2', { exact: true }).fill('150000');
  await j.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Total do acordo alterado')).toBeVisible();
  await page.getByRole('button', { name: 'Sim, salvar' }).click();
  await aviso(page, 'Acordo atualizado!');
  const a = (await noBanco('SELECT valor_total FROM acordo WHERE id = ?', [d.ac]))[0];
  expect(Number(a.valor_total)).toBe(2500);
  expect(Number((await noBanco('SELECT valor_bruto FROM acordo_parcela WHERE id = ?', [d.pa2]))[0].valor_bruto)).toBe(1500);
  const h = await noBanco("SELECT campo_alterado, valor_anterior, valor_novo FROM auditoria_parcela WHERE parcela_id = ? AND acao = 'editada'", [d.pa2]);
  expect(h.map(x => x.campo_alterado)).toContain('Valor bruto');
});

test('@critical Receber e desfazer parcela pela aba: pede data, conta e forma; gera a entrada no extrato; desfazer limpa tudo', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const bloco = () => blocoAcordo(page, 'Acordo C8');
  await bloco().getByRole('button', { name: /Parcelas/ }).click();
  const p1 = linha(page, 'Pendente').first();
  await expect(p1).toBeVisible();
  await abrirMenuAcoes(page, p1);
  await page.getByRole('button', { name: /Receber/ }).click();
  const j = janela(page, 'Receber parcela 1');
  await j.getByLabel('Data do recebimento', { exact: true }).fill('2099-03-15');
  await j.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Informe a conta ou caixa de recebimento');
  await j.getByLabel('Conta ou caixa de recebimento', { exact: true }).selectOption({ label: 'Banco C8 — Conta C8' });
  await j.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Informe a forma de recebimento');
  await j.getByLabel('Forma de recebimento', { exact: true }).selectOption({ label: 'Pix C8' });
  await semViolacoes(page, 'janela Receber parcela');
  await j.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await aviso(page, 'Recebimento registrado');
  const par = (await noBanco('SELECT status, DATE_FORMAT(recebido_em, "%Y-%m-%d") AS dia FROM acordo_parcela WHERE id = ?', [d.pa1]))[0];
  expect(par).toEqual({ status: 'pago', dia: '2099-03-15' });
  await expect(page.getByText('1/2 parcelas pagas')).toBeVisible();
  expect((await noBanco("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ? AND tipo = 'entrada'", [d.pa1]))[0].n).toBe(1);
  await expect(page.getByText(/2\.049,50/)).toBeVisible();                                    // 1.049,50 + 1.000 recebidos
  // desfazer
  await bloco().getByRole('button', { name: /Parcelas/ }).click();
  await abrirMenuAcoes(page, linha(page, 'Recebida'));
  await page.getByRole('button', { name: /Desfazer recebimento/ }).click();
  await aviso(page, 'Recebimento desfeito');
  expect((await noBanco('SELECT status FROM acordo_parcela WHERE id = ?', [d.pa1]))[0].status).toBe('pendente');
  expect((await noBanco("SELECT COUNT(*) AS n FROM conta_corrente WHERE parcela_id = ?", [d.pa1]))[0].n).toBe(0);
  await expect(page.getByText('0/2 parcelas pagas')).toBeVisible();
  // histórico da parcela
  await bloco().getByRole('button', { name: /Parcelas/ }).click();
  await abrirMenuAcoes(page, linha(page, 'Pendente').first());
  await itemMenu(page, 'Histórico').click();
  const h = janela(page, 'Histórico da parcela 1');
  for (const evento of ['Recebida', 'Recebimento desfeito']) await expect(h.getByRole('cell', { name: evento, exact: true }).first()).toBeVisible();
});

test('@critical Cancelar acordo: pede o motivo, cancela as parcelas pendentes, vira registro permanente (sem Editar, Cancelar nem Excluir)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const bloco = () => blocoAcordo(page, 'Acordo C8');
  await bloco().getByRole('button', { name: 'Cancelar', exact: true }).click();
  const j = janela(page, 'Cancelar acordo');
  await expect(j).toBeVisible();
  await semViolacoes(page, 'janela Cancelar acordo');
  await j.getByRole('button', { name: 'Cancelar acordo' }).click();
  await aviso(page, 'Informe o motivo do cancelamento');
  await j.getByLabel('Motivo do cancelamento', { exact: true }).fill('Réu quitou por fora');
  await j.getByRole('button', { name: 'Cancelar acordo' }).click();
  await aviso(page, 'Acordo cancelado');
  expect((await noBanco('SELECT status FROM acordo WHERE id = ?', [d.ac]))[0].status).toBe('cancelado');
  expect((await noBanco("SELECT COUNT(*) AS n FROM acordo_parcela WHERE acordo_id = ? AND status = 'cancelada'", [d.ac]))[0].n).toBe(2);
  await expect(bloco().getByText('Cancelado', { exact: true })).toBeVisible();
  for (const nome of ['Editar', 'Cancelar', 'Excluir']) await expect(bloco().getByRole('button', { name: nome, exact: true })).toHaveCount(0);
});

test('@critical Excluir acordo: pede confirmação, "Cancelar" não apaga; com parcela recebida a exclusão é recusada com o motivo; sem recebimento apaga acordo e parcelas', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const bloco = () => blocoAcordo(page, 'Acordo C8');
  await bloco().getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByText('O acordo e todas as parcelas serão removidos.')).toBeVisible();
  await janela(page, 'Excluir acordo').getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await noBanco('SELECT id FROM acordo WHERE id = ?', [d.ac])).length).toBe(1);
  await noBanco("UPDATE acordo_parcela SET status = 'pago', recebido_em = '2099-03-20' WHERE id = ?", [d.pa1]);
  await abrirAba(page, CNJ1);
  await bloco().getByRole('button', { name: 'Excluir', exact: true }).click();
  await janela(page, 'Excluir acordo').getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Há parcelas já recebidas. Desfaça os recebimentos antes de excluir o acordo.');
  expect((await noBanco('SELECT id FROM acordo WHERE id = ?', [d.ac])).length).toBe(1);
  await noBanco("UPDATE acordo_parcela SET status = 'pendente', recebido_em = NULL WHERE id = ?", [d.pa1]);
  await abrirAba(page, CNJ1);
  await bloco().getByRole('button', { name: 'Excluir', exact: true }).click();
  await janela(page, 'Excluir acordo').getByRole('button', { name: 'Excluir', exact: true }).click();
  await aviso(page, 'Acordo excluído');
  expect((await noBanco('SELECT id FROM acordo WHERE id = ?', [d.ac])).length).toBe(0);
  expect((await noBanco('SELECT id FROM acordo_parcela WHERE acordo_id = ?', [d.ac])).length).toBe(0);
  await expect(page.getByText('Acordo 1')).toHaveCount(0);
});

test('@critical Permissões: só visualizar vê tudo mas não tem nenhuma ação; com cadastrar, alterar e excluir aparecem todas', async ({ page }) => {
  const ver = await criarUsuarioComPermissoes('ver_financeiro', [['processos', null, 'visualizar'], ['financeiro', null, 'visualizar']]);
  await loginPelaTela(page, ver);
  await abrirAba(page, CNJ1);
  await expect(page.getByText('Conta corrente')).toBeVisible();
  for (const nome of ['+ Lançamento', '+ Novo Acordo', '+ Novo Alvará']) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  for (const nome of ['Editar', 'Cancelar', 'Excluir']) await expect(blocoAcordo(page, 'Acordo C8').getByRole('button', { name: nome, exact: true })).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  await expect(itemMenu(page, 'Histórico')).toBeVisible();
  for (const nome of ['Editar', 'Excluir']) await expect(itemMenu(page, nome)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await blocoAcordo(page, 'Acordo C8').getByRole('button', { name: /Parcelas/ }).click();
  await abrirMenuAcoes(page, linha(page, 'Pendente').first());
  await expect(itemMenu(page, 'Histórico')).toBeVisible();
  for (const nome of [/Receber/, /Lançar multa/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
});

test('@critical Permissões: com cadastrar, alterar e excluir aparecem todas as ações', async ({ page }) => {
  const tudo = await criarUsuarioComPermissoes('tudo_financeiro', [['processos', null, 'visualizar'], ['financeiro', null, 'visualizar'], ['financeiro', null, 'cadastrar'], ['financeiro', null, 'alterar'], ['financeiro', null, 'excluir']]);
  await loginPelaTela(page, tudo);
  await abrirAba(page, CNJ1);
  for (const nome of ['+ Lançamento', '+ Novo Acordo', '+ Novo Alvará']) await expect(page.getByRole('button', { name: nome })).toBeVisible();
  for (const nome of ['Editar', 'Cancelar', 'Excluir']) await expect(blocoAcordo(page, 'Acordo C8').getByRole('button', { name: nome, exact: true })).toBeVisible();
  await abrirMenuAcoes(page, linha(page, 'Custas do cartório'));
  for (const nome of ['Editar', 'Histórico', 'Excluir']) await expect(itemMenu(page, nome)).toBeVisible();
});

test('@critical Quem não tem permissão de ver o financeiro recebe um aviso claro (não "nenhum lançamento" nem tela quebrada)', async ({ page }) => {
  const sem = await criarUsuarioComPermissoes('sem_financeiro', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, sem);
  await abrirAba(page, CNJ1);
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  await expect(page.getByText('Você não tem permissão para ver o financeiro deste processo.')).toBeVisible();
  await expect(page.getByText('Nenhum lançamento neste processo')).toHaveCount(0);
  await expect(page.getByText('Conta corrente')).toHaveCount(0);
});

test('@critical Sem lançamentos nem acordos: a aba mostra "Nenhum lançamento neste processo" e saldo zero', async ({ page }) => {
  await noBanco('DELETE FROM conta_corrente WHERE processo_id = ?', [d.proc1]);
  await noBanco('DELETE FROM acordo WHERE processo_id = ?', [d.proc1]);
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await expect(page.getByText('Nenhum lançamento neste processo')).toBeVisible();
  await expect(page.getByText(/R\$\s?0,00/).first()).toBeVisible();
  await semViolacoes(page, 'aba Financeiro vazia');
});

// ---- Repasse DESTA parcela, direto do menu ⋮ da parcela (a aba "Repasses pendentes" da tela Financeiro continua igual) ----
// Prepara: caixa e forma de dinheiro, cliente e parceiro; a parcela 1 do acordo vira "recebida" com o cliente como beneficiário padrão.
// CPF válido que não colide com os de outros testes (o banco de teste é compartilhado): 9 dígitos vindos do relógio + 2 dígitos verificadores.
function cpfUnico(deslocamento) {
  const base = String((Date.now() + deslocamento) % 1000000000).padStart(9, '0').split('').map(Number);
  const dv = (lista, peso) => { const r = (lista.reduce((t, x, i) => t + x * (peso - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 10); const d2 = dv([...base, d1], 11);
  return [...base, d1, d2].join('');
}
async function prepararRepasse({ comParceiro = false } = {}) {
  // cadastros de apoio ficam entre os testes deste bloco (limpos no afterAll): cria só se ainda não existir
  const achaOuCria = async (sqlBusca, sqlInsere) => (await noBanco(sqlBusca))[0]?.id ?? (await noBanco(sqlInsere)).insertId;
  const caixa = await achaOuCria("SELECT id FROM conta_financeira WHERE nome = 'Caixa C8'", "INSERT INTO conta_financeira (nome, tipo, ativo, principal) VALUES ('Caixa C8', 'especie', 1, 0)");
  const forma = await achaOuCria("SELECT id FROM forma_pagamento WHERE nome = 'Dinheiro C8'", "INSERT INTO forma_pagamento (nome, uso_permitido) VALUES ('Dinheiro C8', 'especie')");
  const cliente = await achaOuCria("SELECT id FROM pessoas_fisicas WHERE nome = 'Cliente Repasse C8'", `INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Repasse C8', '${cpfUnico(1)}')`);
  const parceiro = await achaOuCria("SELECT id FROM pessoas_fisicas WHERE nome = 'Parceiro Repasse C8'", `INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Parceiro Repasse C8', '${cpfUnico(2)}')`);
  await noBanco("UPDATE acordo_parcela SET status = 'pago', recebido_em = '2099-03-15', repasse_cliente_tipo = 'fisica', repasse_cliente_pessoa_id = ? WHERE id = ?", [cliente, d.pa1]);
  if (comParceiro) await noBanco("UPDATE acordo_parcela SET parceria_pessoa_tipo = 'fisica', parceria_pessoa_id = ?, parceria_tipo = 'valor', parceria_valor = 100 WHERE id = ?", [parceiro, d.pa1]);
  return { caixa, forma, cliente, parceiro };
}
const parcelaRecebida = (page) => linha(page, 'Recebida').first();
async function abrirParcelas(page) {
  const bloco = blocoAcordo(page, 'Acordo C8');
  await bloco.getByRole('button', { name: /Parcelas/ }).click();
  await expect(parcelaRecebida(page)).toBeVisible();
}

test('@critical Repassar pelo menu da parcela: só aparece na recebida com repasse pendente; abre a janela do repasse ao cliente; Cancelar não grava; em mãos grava e some do menu', async ({ page }) => {
  await prepararRepasse();
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirParcelas(page);
  await expect(parcelaRecebida(page).getByText('Falta repassar ao cliente')).toBeVisible();
  // a parcela PENDENTE não oferece repasse (só a recebida)
  await abrirMenuAcoes(page, linha(page, 'Pendente').first());
  await expect(page.getByRole('button', { name: /Receber/ }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /Repassar/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // a recebida oferece "Repassar" (um só repasse pendente: abre direto, sem submenu)
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await expect(page.getByRole('button', { name: /Desfazer recebimento/ })).toBeVisible();   // o que já existia continua
  await expect(page.getByRole('button', { name: /Histórico/ }).last()).toBeVisible();
  await page.getByRole('button', { name: /^\S*\s*Repassar ao cliente$/ }).click();
  const j = janela(page, 'Repassar ao cliente');
  await expect(j).toBeVisible();
  await semViolacoes(page, 'janela Repassar (pelo menu da parcela)');
  // Cancelar não grava nada
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(j).toHaveCount(0);
  expect((await noBanco('SELECT repasse_cliente_em FROM acordo_parcela WHERE id = ?', [d.pa1]))[0].repasse_cliente_em).toBeNull();
  // repasse em dinheiro em mãos desta parcela
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await page.getByRole('button', { name: /^\S*\s*Repassar ao cliente$/ }).click();
  await j.getByLabel('Conta ou caixa de saída', { exact: true }).selectOption({ label: 'Caixa C8' });
  await j.getByLabel('Destino do repasse', { exact: true }).selectOption({ label: 'Dinheiro em espécie — em mãos' });
  await j.getByLabel('Forma do repasse', { exact: true }).selectOption({ label: 'Dinheiro C8' });
  await j.getByRole('button', { name: 'Confirmar repasse' }).click();
  await aviso(page, 'Repasse registrado');
  const par = (await noBanco('SELECT repasse_cliente_em, repasse_cliente_destino_tipo FROM acordo_parcela WHERE id = ?', [d.pa1]))[0];
  expect(par.repasse_cliente_em).not.toBeNull();
  expect(par.repasse_cliente_destino_tipo).toBe('em_maos');
  expect((await noBanco('SELECT COUNT(*) AS n FROM acordo_parcela WHERE id <> ? AND repasse_cliente_em IS NOT NULL AND acordo_id = (SELECT acordo_id FROM acordo_parcela WHERE id = ?)', [d.pa1, d.pa1]))[0].n).toBe(0);   // só ESTA parcela
  // depois: a parcela mostra o repasse feito e o menu não oferece mais "Repassar"
  await abrirParcelas(page);
  await expect(parcelaRecebida(page).getByText(/Cliente/)).toBeVisible();
  await expect(parcelaRecebida(page).getByText('Falta repassar ao cliente')).toHaveCount(0);
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await expect(page.getByRole('button', { name: /Desfazer recebimento/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Repassar ao/ })).toHaveCount(0);
  // a aba "Repasses pendentes" da tela Financeiro continua mostrando o que ainda falta (a parcela 2 ainda não foi recebida: nada dela)
  await page.keyboard.press('Escape');
});

test('@critical Repassar pelo menu da parcela: com cliente E parceiro pendentes vira submenu (ao cliente / ao parceiro) e cada item abre a janela do repasse certo', async ({ page }) => {
  await prepararRepasse({ comParceiro: true });
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirParcelas(page);
  await expect(parcelaRecebida(page).getByText('Falta repassar ao cliente')).toBeVisible();
  await expect(parcelaRecebida(page).getByText('Falta repassar ao parceiro')).toBeVisible();
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await page.getByRole('button', { name: /^\S*\s*Repassar/ }).first().hover();
  await expect(page.getByRole('button', { name: /Repassar ao cliente/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^\S*\s*Repassar ao parceiro$/ })).toBeVisible();   // o item do menu não leva o nome (a coluna Parceria e a janela do repasse já mostram quem é)
  // o painel do submenu acompanha o tamanho do texto e NÃO invade o menu principal (antes o texto comprido passava da borda e ficava por cima de "Histórico")
  const painelSub = page.getByRole('button', { name: /Repassar ao parceiro/ }).locator('..');
  const menuPrincipal = page.getByRole('button', { name: /Desfazer recebimento/ }).locator('..');
  const caixaSub = await painelSub.boundingBox(); const caixaMenu = await menuPrincipal.boundingBox();
  const textoParceiro = await page.getByRole('button', { name: /Repassar ao parceiro/ }).boundingBox();
  expect(textoParceiro.x).toBeGreaterThanOrEqual(caixaSub.x); expect(textoParceiro.x + textoParceiro.width).toBeLessThanOrEqual(caixaSub.x + caixaSub.width + 1);   // o texto cabe dentro do painel
  const seCruzam = caixaSub.x < caixaMenu.x + caixaMenu.width - 3 && caixaSub.x + caixaSub.width > caixaMenu.x + 3;
  expect(seCruzam).toBe(false);                                                                                                                                       // um painel ao lado do outro, sem se sobrepor
  await page.getByRole('button', { name: /Repassar ao parceiro/ }).click();
  const j = janela(page, 'Repassar ao parceiro (Parceiro Repasse C8)');
  await expect(j).toBeVisible();
  await j.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await page.getByRole('button', { name: /^\S*\s*Repassar/ }).first().hover();
  await page.getByRole('button', { name: /Repassar ao cliente/ }).click();
  await expect(janela(page, 'Repassar ao cliente')).toBeVisible();
  expect((await noBanco('SELECT repasse_cliente_em, repasse_parceiro_em FROM acordo_parcela WHERE id = ?', [d.pa1]))[0]).toEqual({ repasse_cliente_em: null, repasse_parceiro_em: null });
});

test('@critical Repassar pelo menu da parcela: cliente já repassado e parceiro pendente — o item diz "Repassar ao parceiro" e abre a janela do parceiro', async ({ page }) => {
  await prepararRepasse({ comParceiro: true });
  await noBanco("UPDATE acordo_parcela SET repasse_cliente_em = '2099-03-16' WHERE id = ?", [d.pa1]);
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirParcelas(page);
  await expect(parcelaRecebida(page).getByText('Falta repassar ao parceiro')).toBeVisible();
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await expect(page.getByRole('button', { name: /Repassar ao cliente/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^\S*\s*Repassar ao parceiro$/ }).click();
  await expect(janela(page, 'Repassar ao parceiro (Parceiro Repasse C8)')).toBeVisible();
});

test('@critical Repassar pelo menu da parcela: quem só VISUALIZA o financeiro não vê o item', async ({ page }) => {
  await prepararRepasse();
  const so = await criarUsuarioComPermissoes('so_ve_financeiro_c8', [['processos', null, 'visualizar'], ['financeiro', null, 'visualizar']]);
  await loginPelaTela(page, so);
  await abrirAba(page, CNJ1);
  await abrirParcelas(page);
  await expect(parcelaRecebida(page).getByText('Falta repassar ao cliente')).toBeVisible();
  // o menu existe (tem "Histórico"), mas sem permissão de alterar não oferece Repassar nem Desfazer recebimento
  await abrirMenuAcoes(page, parcelaRecebida(page));
  await expect(page.getByRole('button', { name: /Histórico/ }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /Repassar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Desfazer recebimento/ })).toHaveCount(0);
});
