import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C7 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Perícias" da pasta — lista, Nova Perícia (locais, perito, senha de dia não útil,
// "já existe agendada"), editar, realizada, cancelar, remarcar, marcar como remarcada, histórico, excluir, "aguardando data",
// permissões, mais de 50 perícias e acessibilidade.
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
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const opcaoLista = (page, nome) => page.locator('div[role="option"]').filter({ hasText: nome });
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ2 = '9400002-00.2026.5.15.0001';
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });
const filtroProcesso = (page) => page.getByLabel('Filtrar por processo', { exact: true });
const util = (n) => { const d = new Date('2099-03-02T12:00:00Z'); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) k++; } return d.toISOString().slice(0, 10); };
const br = (iso) => iso.split('-').reverse().join('/');
const SABADO = '2099-03-07';
const escolher = async (page, j, rotulo, opcao) => { await j.getByLabel(rotulo, { exact: true }).click(); await opcaoLista(page, opcao).first().click(); };

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  const dias = [];
  for (const [ano, mes, ultimo] of [[2098, 6, 30], [2099, 3, 31], [2099, 4, 30]]) {
    for (let dia = 1; dia <= ultimo; dia++) {
      const dt = new Date(Date.UTC(ano, mes - 1, dia, 12));
      dias.push(`('${dt.toISOString().slice(0, 10)}', ${[0, 6].includes(dt.getUTCDay()) ? 0 : 1})`);
    }
  }
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);   // o banco de teste tem calendário esparso
  await noBanco("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Médica C7', 1), ('Engenharia C7', 1), ('Psicológica C7', 1)");
  // o seletor "Perito" só lista pessoas cuja profissão começa com "Perícia"
  await noBanco("INSERT INTO profissao (nome) VALUES ('Perícia C7')");
  await noBanco("UPDATE pessoas_fisicas SET profissao_id = (SELECT id FROM profissao WHERE nome = 'Perícia C7') WHERE nome = 'Perito Paulo E2E'");
});
test.afterAll(async () => {
  await limpar();
  await limparPastaPartes(d);
  await noBanco("DELETE FROM tipo_pericia WHERE nome IN ('Médica C7', 'Engenharia C7', 'Psicológica C7')");
  await noBanco("UPDATE pessoas_fisicas SET profissao_id = NULL, cep = NULL, logradouro = NULL, numero = NULL, complemento = NULL, bairro = NULL, cidade = NULL, estado = NULL WHERE nome = 'Perito Paulo E2E'");
  await noBanco("DELETE FROM profissao WHERE nome = 'Perícia C7'");
  await noBanco("DELETE FROM calendario WHERE data >= '2098-06-01' AND data <= '2099-04-30'");
});
async function limpar() {
  const ids = "(SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))";
  await noBanco(`DELETE FROM auditoria_pericia WHERE pericia_id IN (SELECT id FROM pericia WHERE processo_id IN ${ids})`);
  await noBanco(`DELETE FROM pericia WHERE processo_id IN ${ids}`);
  await noBanco("DELETE FROM logs_auditoria WHERE tabela = 'pericia'");
  await noBanco("UPDATE pessoas_juridicas SET cep = NULL, logradouro = NULL, numero = NULL, bairro = NULL, cidade = NULL, estado = NULL WHERE razao_social = 'Empresa Alfa E2E Ltda'");
}
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
  d.medica = (await noBanco("SELECT id FROM tipo_pericia WHERE nome = 'Médica C7'"))[0].id;
  d.engenharia = (await noBanco("SELECT id FROM tipo_pericia WHERE nome = 'Engenharia C7'"))[0].id;
  d.psicologica = (await noBanco("SELECT id FROM tipo_pericia WHERE nome = 'Psicológica C7'"))[0].id;
  d.perito = (await noBanco("SELECT id FROM pessoas_fisicas WHERE nome = 'Perito Paulo E2E'"))[0].id;
  const nova = async (campos) => (await noBanco(
    `INSERT INTO pericia (processo_id, tipo_pericia_id, data, hora, local, perito_tipo, perito_id, responsavel_id, status, motivo_status, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, campos)).insertId;
  d.p1 = await nova([d.proc1, d.medica, util(1), '10:00', 'IML Central', 'fisica', d.perito, null, 'agendada', null]);
  d.p2 = await nova([d.proc1, d.engenharia, util(5), '14:00', 'Obra Norte', null, null, 1, 'agendada', null]);
  d.p3 = await nova([d.proc2, d.medica, '2001-01-10', '11:00', 'IML', null, null, null, 'realizada', null]);
  d.p4 = await nova([d.proc2, d.medica, '2001-02-10', '11:00', 'IML', null, null, null, 'cancelada', 'Perito faltou']);
  d.p5 = await nova([d.proc2, d.engenharia, null, null, 'A definir', null, null, null, 'aguardando_data', null]);
});

async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=pericias`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Perícias');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const abrirNova = async (page, processo = CNJ1) => {
  await abrirAba(page, processo);
  await page.getByRole('button', { name: '+ Nova Perícia' }).click();
  const j = janela(page, 'Nova Perícia');
  await expect(j).toBeVisible();
  return j;
};
const noBancoPer = (id) => noBanco("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM pericia WHERE id = ?", [id]);
const preencherBasico = async (page, j, { tipo = 'Médica C7', data = util(8), hora = '10:00', local = 'Consultório Dr. Teste' } = {}) => {
  await escolher(page, j, 'Tipo de perícia', tipo);
  await j.getByLabel('Data', { exact: true }).fill(data);
  if (hora) await j.getByLabel('Hora', { exact: true }).fill(hora);
  if (local) { await j.getByRole('radio', { name: 'Digitar outro endereço' }).check(); await j.getByLabel('Nome/Referência do local', { exact: true }).fill(local); }
};

test('@critical Aba Perícias: lista (mais recentes primeiro), colunas, perito/responsável/local, filtro por processo e acessibilidade', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Tipo', 'Data / Hora', 'Perito', 'Responsável', 'Local', 'Status', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '+ Nova Perícia' })).toHaveCount(0);                         // "Todos os processos": não há onde ligar a perícia
  const l1 = linha(page, `${br(util(1))} 10:00`);
  await expect(l1.locator('td').nth(0)).toHaveText('Médica C7');
  await expect(l1.locator('td').nth(2)).toHaveText('Perito Paulo E2E');
  await expect(l1.locator('td').nth(4)).toHaveText('IML Central');
  await expect(l1.locator('td').nth(5)).toHaveText('Agendada');
  const l2 = linha(page, `${br(util(5))} 14:00`);
  await expect(l2.locator('td').nth(2)).toHaveText('—');
  await expect(l2.locator('td').nth(3)).toHaveText('Administrador de Testes');
  await expect(linha(page, '10/01/2001').locator('td').nth(5)).toHaveText('Realizada');
  await expect(linha(page, '10/02/2001').locator('td').nth(5)).toHaveText('Cancelada');
  const datas = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
  const comData = datas.filter(x => /\d{2}\/\d{2}\/\d{4}/.test(x)).map(x => x.slice(0, 10));
  expect(comData).toEqual([br(util(5)), br(util(1)), '10/02/2001', '10/01/2001']);                           // mais recente primeiro
  await semViolacoes(page, 'aba Perícias com 5 perícias');
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '+ Nova Perícia' })).toBeVisible();
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await noBanco('DELETE FROM pericia WHERE processo_id = ?', [d.proc1]);
  await abrirAba(page, CNJ1);
  await expect(page.getByText('Nenhuma perícia encontrada')).toBeVisible();
  await semViolacoes(page, 'aba Perícias sem registros');
});

test('@critical Perícia "Aguardando data" (nascida da ata): a aba mostra o status certo e deixa informar a data', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ2);
  const l = linha(page, 'Engenharia C7');
  await expect(l.locator('td').nth(5), 'o status aparece como "Agendada" mas ainda não tem data').toHaveText('Aguardando data');
  await expect(l.locator('td').nth(1)).toContainText('Aguardando data');
  await abrirMenuAcoes(page, l);
  await page.getByRole('button', { name: /Informar data/ }).click();
  const j = janela(page, 'Editar Perícia');
  await j.getByLabel('Data', { exact: true }).fill(util(9));
  await j.getByLabel('Hora', { exact: true }).fill('10:00');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, continuar' }).click();                                       // sem perito: confirma
  await aviso(page, 'Perícia atualizada!');
  const a = (await noBancoPer(d.p5))[0];
  expect({ st: a.status, dia: a.dia }).toEqual({ st: 'agendada', dia: util(9) });
  await expect(linha(page, `${br(util(9))} 10:00`).locator('td').nth(5)).toHaveText('Agendada');
});

test('@critical Nova perícia: janela, obrigatórios, aviso de réus sem endereço, local manual, "sem perito" pede confirmação, grava e aparece', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ1);
  await expect(j.getByLabel('Número do Processo', { exact: true })).toHaveValue(CNJ1);
  await expect(j.getByLabel('Número do Processo', { exact: true })).toHaveAttribute('readonly', '');
  await expect(j.getByText('Existem 2 réus sem endereço completo.')).toBeVisible();
  await semViolacoes(page, 'janela Nova Perícia');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Data é obrigatória'); await esperarSemAviso(page);
  await j.getByLabel('Data', { exact: true }).fill(util(8));
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(j.getByText('Informe pelo menos um local para a perícia')).toBeVisible();
  await j.getByRole('radio', { name: 'Digitar outro endereço' }).check();
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(j.getByText('Informe pelo menos um local para a perícia')).toBeVisible();                   // marcou "outro local" mas não preencheu
  await semViolacoes(page, 'janela Nova Perícia com local manual');
  await j.getByLabel('Nome/Referência do local', { exact: true }).fill('consultório dr. teste');
  await j.getByLabel('Nome/Referência do local', { exact: true }).blur();
  await expect(j.getByLabel('Nome/Referência do local', { exact: true })).toHaveValue('Consultório Dr. Teste');   // Title Case ao sair do campo
  await escolher(page, j, 'Tipo de perícia', 'Psicológica C7');
  await j.getByLabel('Hora', { exact: true }).fill('15:00');
  await escolher(page, j, 'Responsável pela condução', 'Administrador de Testes');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Perícia sem perito' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();                                      // volta sem gravar
  expect((await noBanco("SELECT COUNT(*) AS n FROM pericia WHERE local = 'Consultório Dr. Teste'"))[0].n).toBe(0);
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Perícia criada!');
  await expect(j).toHaveCount(0);
  const a = (await noBanco("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM pericia WHERE local = 'Consultório Dr. Teste'"))[0];
  expect({ proc: a.processo_id, tipo: a.tipo_pericia_id, dia: a.dia, hm: a.hm, perito: a.perito_id, resp: a.responsavel_id, st: a.status, por: a.criado_por })
    .toEqual({ proc: d.proc1, tipo: d.psicologica, dia: util(8), hm: '15:00', perito: d.perito, resp: 1, st: 'agendada', por: 1 });
  await expect(linha(page, `${br(util(8))} 15:00`)).toBeVisible();
  expect((await noBanco("SELECT COUNT(*) AS n FROM auditoria_pericia WHERE pericia_id = ? AND campo_alterado = 'cadastrado'", [a.id]))[0].n).toBe(1);
});

test('@critical Nova perícia: réu com endereço completo vira local (caixinha) e fica gravado; réu sem endereço não pode ser escolhido', async ({ page }) => {
  await noBanco("UPDATE pessoas_juridicas SET cep = '13000000', logradouro = 'Rua das Flores', numero = '100', bairro = 'Centro', cidade = 'Campinas', estado = 'SP' WHERE razao_social = 'Empresa Alfa E2E Ltda'");
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ1);
  await expect(j.getByText('Existe 1 réu sem endereço completo.')).toBeVisible();                           // só a Beta
  await expect(j.getByRole('radio', { name: /Empresa Beta E2E Ltda/ })).toBeDisabled();
  await expect(j.getByText('Rua das Flores, 100 - Centro - Campinas/SP - 13000000')).toBeVisible();
  await j.getByRole('radio', { name: /Empresa Alfa E2E Ltda/ }).check();
  await escolher(page, j, 'Tipo de perícia', 'Psicológica C7');
  await j.getByLabel('Data', { exact: true }).fill(util(9));
  await j.getByLabel('Hora', { exact: true }).fill('09:00');
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Perícia criada!');
  const id = (await noBanco("SELECT id FROM pericia WHERE processo_id = ? AND data = ?", [d.proc1, util(9)]))[0].id;
  const locais = await noBanco('SELECT tipo_pessoa, pessoa_id FROM pericia_local_reu WHERE pericia_id = ?', [id]);
  expect(locais).toEqual([{ tipo_pessoa: 'juridica', pessoa_id: d.reu1 }]);
});

test('@critical Avisos ao salvar: horário fora do expediente, data passada e sábado pedem a senha do usuário (e a senha errada não grava)', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page);
  await preencherBasico(page, j, { tipo: 'Psicológica C7', data: SABADO, hora: '06:30' });
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Confirmação por senha/ })).toBeVisible();
  await expect(page.getByText(/data retroativa/)).toHaveCount(0);
  await expect(page.getByText(/fora do horário de expediente \(06:30\)/)).toBeVisible();
  await expect(page.getByText(/sábado/)).toBeVisible();
  await semViolacoes(page, 'janela Confirmação por senha');
  await page.getByLabel('Sua senha', { exact: true }).fill('senha-errada');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await aviso(page, /incorreta|inválida/i);
  expect((await noBanco('SELECT COUNT(*) AS n FROM pericia WHERE data = ?', [SABADO]))[0].n).toBe(0);
  await page.getByLabel('Sua senha', { exact: true }).fill('TesteSeguro123!');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await aviso(page, 'Perícia criada!');
  const a = (await noBanco('SELECT id FROM pericia WHERE data = ?', [SABADO]))[0];
  expect((await noBanco("SELECT valor_novo FROM auditoria_pericia WHERE pericia_id = ? AND campo_alterado = 'criacao'", [a.id]))[0].valor_novo).toContain('confirmado com senha');
});

test('@critical Já existe perícia agendada do mesmo tipo: pergunta se é remarcação; "outra perícia" cria; "remarcação" exige motivo e marca a antiga', async ({ page }) => {
  await loginPelaTela(page);
  let j = await abrirNova(page);
  await preencherBasico(page, j, { tipo: 'Médica C7', data: util(10), hora: '10:00' });
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  const m = janela(page, 'Já existe perícia agendada');
  await expect(m.getByText(new RegExp(`${br(util(1))}`))).toBeVisible();
  await semViolacoes(page, 'janela Já existe perícia agendada');
  await m.getByRole('button', { name: 'Voltar' }).click();
  expect((await noBanco('SELECT COUNT(*) AS n FROM pericia WHERE data = ?', [util(10)]))[0].n).toBe(0);
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await janela(page, 'Já existe perícia agendada').getByRole('button', { name: 'Não, é outra perícia' }).click();
  await aviso(page, 'Perícia criada!');
  expect((await noBancoPer(d.p1))[0].status).toBe('agendada');
  await esperarSemAviso(page);
  // remarcação
  await page.getByRole('button', { name: '+ Nova Perícia' }).click();
  j = janela(page, 'Nova Perícia');
  await preencherBasico(page, j, { tipo: 'Engenharia C7', data: util(11), hora: '11:00' });
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  const r = janela(page, 'Já existe perícia agendada');
  await r.getByRole('button', { name: 'Sim, é remarcação' }).click();
  await r.getByRole('button', { name: 'Confirmar remarcação' }).click();
  await aviso(page, 'Informe o motivo da remarcação'); await esperarSemAviso(page);
  await r.getByLabel('Motivo da remarcação', { exact: true }).fill('Perito pediu outra data');
  await r.getByRole('button', { name: 'Confirmar remarcação' }).click();
  await aviso(page, 'Perícia remarcada e nova perícia criada!');
  const a = (await noBancoPer(d.p2))[0];
  expect({ st: a.status, motivo: a.motivo_status }).toEqual({ st: 'remarcada', motivo: 'Perito pediu outra data' });
  await expect(linha(page, `${br(util(11))} 11:00`).locator('td').nth(5)).toHaveText('Agendada');
});

test('@critical Editar perícia: janela preenchida (carrega a perícia completa), salva as mudanças e o histórico registra o que mudou', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Editar/ }).click();
  const j = janela(page, 'Editar Perícia');
  await expect(j.getByLabel('Data', { exact: true })).toHaveValue(util(1));
  await expect(j.getByLabel('Hora', { exact: true })).toHaveValue('10:00');
  await expect(j.getByLabel('Nome/Referência do local', { exact: true })).toHaveValue('IML Central');
  await expect(j.getByLabel('Número do Processo', { exact: true })).toHaveValue(CNJ1);
  await semViolacoes(page, 'janela Editar Perícia');
  await j.getByLabel('Data', { exact: true }).fill(util(12));
  await j.getByLabel('Hora', { exact: true }).fill('13:15');
  await j.getByLabel('Nome/Referência do local', { exact: true }).fill('Novo Local');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Perícia atualizada!');
  const a = (await noBancoPer(d.p1))[0];
  expect({ dia: a.dia, hm: a.hm, local: a.local, perito: a.perito_id }).toEqual({ dia: util(12), hm: '13:15', local: 'Novo Local', perito: d.perito });
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(12))} 13:15`));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const h = janela(page, 'Histórico da Perícia');
  await expect(h.getByRole('cell', { name: 'Data', exact: true }), 'a edição não aparece no histórico').toBeVisible();
  await expect(h.getByRole('cell', { name: 'Local', exact: true })).toBeVisible();
});

test('@critical Marcar como realizada: pede confirmação, "Cancelar" não muda, confirmar muda e registra no histórico', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Marcar realizada/ }).click();
  await expect(page.getByRole('heading', { name: 'Marcar como realizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBancoPer(d.p1))[0].status).toBe('agendada');
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Marcar realizada/ }).click();
  await page.getByRole('button', { name: 'Marcar como realizada', exact: true }).last().click();
  await aviso(page, 'Perícia marcada como realizada');
  await expect(linha(page, `${br(util(1))} 10:00`).locator('td').nth(5)).toHaveText('Realizada');
  expect((await noBanco("SELECT COUNT(*) AS n FROM auditoria_pericia WHERE pericia_id = ? AND valor_novo = 'realizada'", [d.p1]))[0].n).toBe(1);
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  for (const nome of [/Marcar realizada/, /Editar/, /Remarcar/, /Cancelar$/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
});

test('@critical Cancelar perícia: motivo obrigatório, "Voltar" não cancela, confirmar muda o status; cancelada não oferece ações nem Excluir', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Cancelar$/ }).click();
  const j = janela(page, 'Cancelar Perícia');
  await semViolacoes(page, 'janela Cancelar Perícia');
  await j.getByRole('button', { name: 'Cancelar perícia' }).click();
  await aviso(page, 'Informe o motivo do cancelamento'); await esperarSemAviso(page);
  await j.getByLabel('Motivo do cancelamento', { exact: true }).fill('   ');
  await j.getByRole('button', { name: 'Cancelar perícia' }).click();
  await aviso(page, 'Informe o motivo do cancelamento'); await esperarSemAviso(page);
  await j.getByRole('button', { name: 'Voltar' }).click();
  expect((await noBancoPer(d.p1))[0].status).toBe('agendada');
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Cancelar$/ }).click();
  await janela(page, 'Cancelar Perícia').getByLabel('Motivo do cancelamento', { exact: true }).fill('Perito faltou');
  await janela(page, 'Cancelar Perícia').getByRole('button', { name: 'Cancelar perícia' }).click();
  await aviso(page, 'Perícia cancelada');
  const a = (await noBancoPer(d.p1))[0];
  expect({ st: a.status, motivo: a.motivo_status }).toEqual({ st: 'cancelada', motivo: 'Perito faltou' });
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  for (const nome of [/Editar/, /Remarcar/, /Cancelar$/, /Excluir/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Histórico/ })).toBeVisible();
});

test('@critical Remarcar perícia: nova data e motivo obrigatórios, sábado pede senha, e só então a antiga vira "Remarcada" e nasce a nova', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /^🔁 Remarcar$|Remarcar$/ }).first().click();
  const j = janela(page, 'Remarcar Perícia');
  await expect(j.getByLabel('Nova hora', { exact: true })).toHaveValue('10:00');                              // vem com a hora da antiga
  await semViolacoes(page, 'janela Remarcar Perícia');
  await j.getByRole('button', { name: 'Remarcar', exact: true }).click();
  await aviso(page, 'Informe a nova data'); await esperarSemAviso(page);
  await j.getByLabel('Nova data', { exact: true }).fill(SABADO);
  await j.getByRole('button', { name: 'Remarcar', exact: true }).click();
  await aviso(page, 'Informe o motivo da remarcação'); await esperarSemAviso(page);
  await j.getByLabel('Motivo da remarcação', { exact: true }).fill('Pedido do perito');
  await j.getByRole('button', { name: 'Remarcar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Confirmação por senha/ })).toBeVisible();
  await page.getByLabel('Sua senha', { exact: true }).fill('TesteSeguro123!');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await aviso(page, 'Perícia remarcada');
  const velha = (await noBancoPer(d.p1))[0];
  expect({ st: velha.status, motivo: velha.motivo_status }).toEqual({ st: 'remarcada', motivo: 'Pedido do perito' });
  const nova = (await noBanco('SELECT *, DATE_FORMAT(data, "%Y-%m-%d") AS dia FROM pericia WHERE processo_id = ? AND data = ?', [d.proc1, SABADO]))[0];
  expect({ st: nova.status, local: nova.local, perito: nova.perito_id }).toEqual({ st: 'agendada', local: 'IML Central', perito: d.perito });
});

test('@critical Marcar como remarcada: motivo obrigatório; só troca o status (nenhuma perícia nova)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  const antes = (await noBanco('SELECT COUNT(*) AS n FROM pericia'))[0].n;
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Marcar como remarcada/ }).click();
  const j = janela(page, 'Marcar como remarcada');
  await semViolacoes(page, 'janela Marcar como remarcada');
  await j.getByRole('button', { name: 'Marcar como remarcada', exact: true }).click();
  await aviso(page, 'Informe o motivo da remarcação'); await esperarSemAviso(page);
  await j.getByLabel('Motivo da remarcação', { exact: true }).fill('Nova já cadastrada');
  await j.getByRole('button', { name: 'Marcar como remarcada', exact: true }).click();
  await aviso(page, 'Perícia marcada como remarcada');
  expect((await noBancoPer(d.p1))[0].status).toBe('remarcada');
  expect((await noBanco('SELECT COUNT(*) AS n FROM pericia'))[0].n).toBe(antes);
});

test('@critical Histórico da perícia: tabela De/Para com quem e quando; vazio tem mensagem', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(5))} 14:00`));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const v = janela(page, 'Histórico da Perícia');
  await expect(v.getByText('Nenhum registro de histórico')).toBeVisible();
  await semViolacoes(page, 'janela Histórico da Perícia vazio');
  await v.getByRole('button', { name: 'Fechar' }).click();
  await noBanco("INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id) VALUES (?, 'status', 'agendada', 'realizada', 1)", [d.p2]);
  await abrirMenuAcoes(page, linha(page, `${br(util(5))} 14:00`));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const h = janela(page, 'Histórico da Perícia');
  await expect(h.getByRole('columnheader')).toHaveText(['Quando', 'Campo', 'De', 'Para', 'Usuário']);
  await expect(h.locator('tbody tr')).toHaveCount(1);
  await expect(h.locator('tbody tr')).toContainText('Administrador de Testes');
  await semViolacoes(page, 'janela Histórico da Perícia com registro');
  await page.keyboard.press('Escape');
  await expect(h).toHaveCount(0);
});

test('@critical Excluir perícia: confirma, "Cancelar" não apaga, apaga junto o histórico', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await noBanco("INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id) VALUES (?, 'cadastrado', NULL, 'Perícia cadastrada', 1)", [d.p2]);
  await abrirMenuAcoes(page, linha(page, `${br(util(5))} 14:00`));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await expect(page.getByRole('heading', { name: 'Excluir perícia' })).toBeVisible();
  await expect(page.getByText('Tem certeza que deseja excluir esta perícia? Esta ação não pode ser desfeita.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBancoPer(d.p2)).length).toBe(1);
  await abrirMenuAcoes(page, linha(page, `${br(util(5))} 14:00`));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).last().click();
  await aviso(page, 'Perícia excluída');
  await expect(linha(page, `${br(util(5))} 14:00`)).toHaveCount(0);
  expect((await noBancoPer(d.p2)).length).toBe(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM auditoria_pericia WHERE pericia_id = ?', [d.p2]))[0].n).toBe(0);
});

test('@critical Comunicar cliente: sem cliente/e-mail definidos o sistema explica o motivo (não fica mudo nem quebra)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Comunicar cliente/ }).click();
  await aviso(page, /Defina no cadastro do processo|cliente não possui e-mail|Não foi possível enviar|Comunicado enviado/);
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
});

// CPF válido que não colide com os de outros testes (o banco de teste é compartilhado): 9 dígitos vindos do relógio + 2 dígitos verificadores.
function cpfUnicoComunicado(deslocamento) {
  const base = String((Date.now() + deslocamento) % 1000000000).padStart(9, '0').split('').map(Number);
  const dv = (lista, peso) => { const r = (lista.reduce((t, x, i) => t + x * (peso - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 10); const d2 = dv([...base, d1], 11);
  return [...base, d1, d2].join('');
}

test('@critical Comunicar cliente: o clique abre a janela com Para, Assunto e Mensagem; Cancelar não envia nada; só "Enviar comunicado" envia e registra', async ({ page }) => {
  const EMAIL = 'cliente.comunicado.e2e@example.invalid';
  const proc = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  await noBanco("UPDATE tblproc SET cliente_polo = 'autor' WHERE id = ?", [proc]);
  await noBanco('DELETE FROM tbltituloprocautor WHERE proc_id = ?', [proc]);      // a pasta de teste já traz partes: só vale o cliente deste teste
  const cliente = (await noBanco("INSERT INTO pessoas_fisicas (nome, cpf) VALUES ('Cliente Comunicado E2E', ?)", [cpfUnicoComunicado(7)])).insertId;
  await noBanco('INSERT INTO emails_pf (pessoa_id, email, principal, ativo) VALUES (?, ?, 1, 1)', [cliente, EMAIL]);
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'fisica', ?)", [proc, cliente]);
  const enviados = async () => (await noBanco('SELECT COUNT(*) AS n FROM log_comunicacoes WHERE destinatario = ?', [EMAIL]))[0].n;
  try {
    await loginPelaTela(page);
    await abrirAba(page, CNJ1);
    const abrir = async () => {
      await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
      await page.getByRole('button', { name: /Comunicar cliente/ }).click();
      const j = page.getByRole('dialog', { name: 'Comunicar cliente' });
      await expect(j).toBeVisible();
      return j;
    };
    let j = await abrir();
    // mostra para quem vai, o assunto e a mensagem completa — e NADA foi enviado ainda
    await expect(j.getByText(EMAIL)).toBeVisible();
    await expect(j.getByText(/Comunicado de Perícia — Proc\. 9400001-00\.2026\.5\.15\.0001/)).toBeVisible();
    const mensagem = page.frameLocator('iframe[title^="Mensagem do e-mail"]');
    await expect(mensagem.getByText(/Prezado\(a\) Cliente Comunicado E2E/)).toBeVisible();
    await expect(mensagem.getByText(/agendada uma perícia/)).toBeVisible();
    expect(await enviados()).toBe(0);
    await semViolacoes(page, 'janela Comunicar cliente');
    // Cancelar não envia
    await j.getByRole('button', { name: 'Cancelar' }).click();
    await expect(j).toHaveCount(0);
    expect(await enviados()).toBe(0);
    // só "Enviar comunicado" envia e registra
    j = await abrir();
    await j.getByRole('button', { name: 'Enviar comunicado' }).click();
    await aviso(page, /Comunicado enviado ao cliente/);
    await expect(j).toHaveCount(0);
    expect(await enviados()).toBe(1);
  } finally {
    await noBanco('DELETE FROM log_comunicacoes WHERE destinatario = ?', [EMAIL]);
    await noBanco("DELETE FROM pessoas_fisicas WHERE nome = 'Cliente Comunicado E2E'");
  }
});

test('@critical Permissões: só VISUALIZAR não recebe "+ Nova Perícia", Marcar realizada, Editar, Remarcar, Cancelar nem Excluir (só Histórico); sem "ver perícias" recebe aviso claro', async ({ page }) => {
  const so = await criarUsuarioComPermissoes('so_ve_pericias', [['processos', null, 'visualizar'], ['pericias', null, 'visualizar']]);
  await loginPelaTela(page, so);
  await abrirAba(page, CNJ1);
  await expect(linha(page, `${br(util(1))} 10:00`)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Nova Perícia' })).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await expect(page.getByRole('button', { name: /Histórico/ })).toBeVisible();
  for (const nome of [/Marcar realizada/, /Editar/, /Remarcar/, /Cancelar$/, /Excluir/, /Comunicar cliente/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
});

test('@critical Permissões: com cadastrar, alterar e excluir aparecem todas as ações', async ({ page }) => {
  const tudo = await criarUsuarioComPermissoes('tudo_pericias', [['processos', null, 'visualizar'], ['pericias', null, 'visualizar'], ['pericias', null, 'cadastrar'], ['pericias', null, 'alterar'], ['pericias', null, 'excluir']]);
  await loginPelaTela(page, tudo);
  await abrirAba(page, CNJ1);
  await expect(page.getByRole('button', { name: '+ Nova Perícia' })).toBeVisible();
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  for (const nome of [/Marcar realizada/, /Editar/, /Remarcar/, /Marcar como remarcada/, /Cancelar$/, /Comunicar cliente/, /Histórico/, /Excluir/]) await expect(page.getByRole('button', { name: nome })).toBeVisible();
});

test('@critical Quem não tem permissão de ver perícias recebe um aviso claro (não "nenhuma perícia" nem tela quebrada)', async ({ page }) => {
  const sem = await criarUsuarioComPermissoes('sem_pericias', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, sem);
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=pericias`); await aguardarTelaPronta(page);
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  await expect(page.getByText('Você não tem permissão para ver as perícias deste processo.')).toBeVisible();
  await expect(page.getByText('Nenhuma perícia encontrada')).toHaveCount(0);
});

test('@critical Mais de 50 perícias no mesmo processo: a aba mostra todas (sem cortar em 50 em silêncio)', async ({ page }) => {
  const valores = Array.from({ length: 70 }, (_, i) => `(${d.proc1}, '2098-06-${String(1 + (i % 28)).padStart(2, '0')}', 'IML em massa', 1)`).join(',');
  await noBanco(`INSERT INTO pericia (processo_id, data, local, criado_por) VALUES ${valores}`);
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await expect(page.locator('tbody tr'), 'a lista mostrou menos perícias do que existem (70 em massa + 2 do processo)').toHaveCount(72, { timeout: 20000 });
});

const ENDERECO_PERITO = 'Rua do Consultório, 45 - Sala 3 - Centro - Campinas/SP - 13015-001';
async function enderecoDoPerito(completo = true) {
  await noBanco(`UPDATE pessoas_fisicas SET cep = '13015-001', logradouro = 'Rua do Consultório', numero = ${completo ? "'45'" : 'NULL'}, complemento = 'Sala 3', bairro = 'Centro', cidade = 'Campinas', estado = 'SP' WHERE nome = 'Perito Paulo E2E'`);
}

test('@critical Nova perícia: ao escolher o perito, "Endereço do perito" vira opção de local; marcar copia o endereço (editável) para o local manual, desmarcar limpa, trocar o perito tira a cópia; fica gravado', async ({ page }) => {
  await enderecoDoPerito(true);
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ1);
  const opcao = j.getByRole('radio', { name: /Endereço do perito/ });
  await expect(opcao).toHaveCount(0);                                                                       // sem perito escolhido, não há opção
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await expect(opcao).toBeVisible();
  await expect(opcao).not.toBeChecked();                                                                    // vem desmarcada: é uma sugestão
  await expect(j.getByText(ENDERECO_PERITO)).toBeVisible();
  await semViolacoes(page, 'janela Nova Perícia com a opção do perito');
  await opcao.check();
  await expect(opcao).toBeChecked();
  await expect(j.getByRole('radio', { name: 'Digitar outro endereço' })).not.toBeChecked();         // é a escolha do perito (os campos abrem para conferir/editar)
  await expect(j.getByLabel('Nome/Referência do local', { exact: true })).toHaveValue('');                  // o local é só o endereço (sem nome de referência)
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('Rua do Consultório');
  await expect(j.getByLabel('Número', { exact: true })).toHaveValue('45');
  await expect(j.getByLabel('Cidade', { exact: true })).toHaveValue('Campinas');
  await j.getByRole('radio', { name: 'Digitar outro endereço' }).check();                                   // escolher "digitar outro" tira a cópia do perito
  await expect(opcao).not.toBeChecked();
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveValue('');
  await opcao.check();
  await j.getByLabel('Complemento', { exact: true }).fill('Sala 7');                                        // a cópia é editável
  await expect(opcao).not.toBeChecked();                                                                    // editou: já não é igual ao cadastro
  await j.getByLabel('Data', { exact: true }).fill(util(10));
  await escolher(page, j, 'Tipo de perícia', 'Psicológica C7');
  await escolher(page, j, 'Responsável pela condução', 'Administrador de Testes');
  await j.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Perícia criada!');
  const a = (await noBanco("SELECT * FROM pericia WHERE perito_id = ? AND logradouro = 'Rua do Consultório' ORDER BY id DESC LIMIT 1", [d.perito]))[0];
  expect({ perito: a.perito_id, log: a.logradouro, num: a.numero, compl: a.complemento, bairro: a.bairro, cidade: a.cidade, uf: a.estado, cep: a.cep })
    .toEqual({ perito: d.perito, log: 'Rua do Consultório', num: '45', compl: 'Sala 7', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13015-001' });
  // a coluna "Local" da lista mostra só o ENDEREÇO (nada de nome de referência)
  await expect(page.getByRole('cell', { name: 'Rua do Consultório, 45 - Sala 7 - Centro - Campinas/SP - 13015-001', exact: true })).toBeVisible();
});

test('@critical Nova perícia: um só local — escolher réu, perito ou "digitar outro" troca a escolha anterior', async ({ page }) => {
  await noBanco("UPDATE pessoas_juridicas SET cep = '13000000', logradouro = 'Rua das Flores', numero = '100', bairro = 'Centro', cidade = 'Campinas', estado = 'SP' WHERE razao_social = 'Empresa Alfa E2E Ltda'");
  await enderecoDoPerito(true);
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ1);
  const reu = j.getByRole('radio', { name: /Empresa Alfa E2E Ltda/ });
  const perito = j.getByRole('radio', { name: /Endereço do perito/ });
  const digitar = j.getByRole('radio', { name: 'Digitar outro endereço' });
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await reu.check();
  await perito.check();
  await expect(reu).not.toBeChecked(); await expect(perito).toBeChecked(); await expect(digitar).not.toBeChecked();
  await reu.check();
  await expect(perito).not.toBeChecked(); await expect(reu).toBeChecked();
  await expect(j.getByLabel('Logradouro', { exact: true })).toHaveCount(0);                               // a cópia do perito saiu
  await digitar.check();
  await expect(reu).not.toBeChecked(); await expect(digitar).toBeChecked();
});

test('@critical Nova perícia: perito com endereço incompleto aparece desabilitado com o aviso', async ({ page }) => {
  await enderecoDoPerito(false);
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ1);
  await escolher(page, j, 'Perito', 'Perito Paulo E2E');
  await expect(j.getByRole('radio', { name: /Endereço do perito/ })).toBeDisabled();
  await expect(j.getByText('Endereço incompleto — complete o cadastro do perito antes de usar como local.')).toBeVisible();
});

test('@critical Nova perícia: local manual já preenchido não é sobrescrito pelo endereço do perito (avisa e mantém)', async ({ page }) => {
  await enderecoDoPerito(true);
  await loginPelaTela(page);
  const j2 = await abrirNova(page, CNJ1);
  await j2.getByRole('radio', { name: 'Digitar outro endereço' }).check();
  await j2.getByLabel('Nome/Referência do local', { exact: true }).fill('IML Central');
  await escolher(page, j2, 'Perito', 'Perito Paulo E2E');
  await j2.getByRole('radio', { name: /Endereço do perito/ }).click();                                  // (click: a caixa não muda de estado, por isso não é .check())
  await expect(j2.getByText(/O endereço digitado já está preenchido/)).toBeVisible();                            // avisa e NÃO sobrescreve
  await expect(j2.getByLabel('Nome/Referência do local', { exact: true })).toHaveValue('Iml Central');   // (o sistema já arruma maiúsculas ao sair do campo)
  await expect(j2.getByRole('radio', { name: /Endereço do perito/ })).not.toBeChecked();
});
