import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, limparPastaPartes, loginPelaTela, prepararPastaPartes, restaurarPastaPartes, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo C6 do plano (PLANO-TESTES-PROCESSOS.md): a aba "Audiências" da pasta — lista, janela Nova/Detalhes/Editar, data digitável,
// dia não útil (senha), cancelar, remarcar, histórico, excluir, permissões, mais de 50 audiências e acessibilidade.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);                                                                              // cursor parado sobre botão cinza muda a cor (hover) e atrapalha a medição
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
  const v = await violacoesGraves(page);
  expect.soft(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);   // soft: mostra TODOS os problemas
}
const aviso = (page, texto) => expect(page.getByText(texto).first()).toBeVisible();
const esperarSemAviso = (page) => expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();
const CNJ1 = '9400001-00.2026.5.15.0001';
const CNJ2 = '9400002-00.2026.5.15.0001';
const linha = (page, texto) => page.locator('tbody tr').filter({ hasText: texto });
const filtroProcesso = (page) => page.getByLabel('Filtrar por processo', { exact: true });
// dias úteis (segunda a sexta) no futuro distante, para não cair em "data passada" nem em fim de semana
const util = (n) => { const d = new Date('2099-03-02T12:00:00Z'); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) k++; } return d.toISOString().slice(0, 10); };
const br = (iso) => iso.split('-').reverse().join('/');
const SABADO = '2099-03-07';

let d;
test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  d = await prepararPastaPartes();
  // O banco de teste tem calendário esparso (dia sem linha = "não é dia útil"): cadastra os dias usados aqui e apaga no fim.
  const dias = [];
  for (const [ano, mes, ultimo] of [[2098, 6, 30], [2099, 3, 31], [2099, 4, 30]]) {
    for (let dia = 1; dia <= ultimo; dia++) {
      const dt = new Date(Date.UTC(ano, mes - 1, dia, 12));
      dias.push(`('${dt.toISOString().slice(0, 10)}', ${[0, 6].includes(dt.getUTCDay()) ? 0 : 1})`);
    }
  }
  dias.push("('2001-01-05', 1)");                                                                          // a "data passada" usada num teste precisa ser dia útil
  await noBanco(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${dias.join(',')}`);
  await noBanco("INSERT INTO tblforum (nome, cidade, uf, ativo, criado_por) VALUES ('Fórum E2E C6', 'Campinas', 'SP', 1, 1)");
  const forum = (await noBanco("SELECT id FROM tblforum WHERE nome = 'Fórum E2E C6'"))[0].id;
  await noBanco("INSERT INTO tblvara (nome, abrev_nome, forum_id, ativo, criado_por) VALUES ('1ª Vara do Trabalho E2E C6', '1ªVT E2E', ?, 1, 1)", [forum]);
});
test.afterAll(async () => {
  await limpar();
  await limparPastaPartes(d);
  await noBanco("DELETE FROM tblvara WHERE nome = '1ª Vara do Trabalho E2E C6'");
  await noBanco("DELETE FROM tblforum WHERE nome = 'Fórum E2E C6'");
  await noBanco("DELETE FROM calendario WHERE (data >= '2098-06-01' AND data <= '2099-04-30') OR data = '2001-01-05'");
});
async function limpar() {
  const ids = "(SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta = 7401))";
  await noBanco(`DELETE FROM auditoria_audiencia WHERE audiencia_id IN (SELECT id FROM audiencia WHERE processo_id IN ${ids})`);
  await noBanco(`DELETE FROM audiencia_testemunhas WHERE audiencia_id IN (SELECT id FROM audiencia WHERE processo_id IN ${ids})`);
  await noBanco(`DELETE FROM audiencia_responsaveis WHERE audiencia_id IN (SELECT id FROM audiencia WHERE processo_id IN ${ids})`);
  await noBanco(`DELETE FROM ata_audiencia WHERE audiencia_id IN (SELECT id FROM audiencia WHERE processo_id IN ${ids})`);   // os itens da ata saem junto (cascata)
  await noBanco(`DELETE FROM audiencia WHERE processo_id IN ${ids}`);
  await noBanco("DELETE FROM tarefas WHERE titulo IN ('Tarefa esquecida da ata E2E')");
  await noBanco("DELETE FROM advogados_freela WHERE nome = 'Freela E2E da ata'");
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('audiencia', 'ata_audiencia', 'tarefas')");
}
test.beforeEach(async ({ page }) => {
  await limpar();
  await restaurarPastaPartes(d);
  await bloquearRedeExterna(page);
  d.proc1 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ1]))[0].id;
  d.proc2 = (await noBanco('SELECT id FROM tblproc WHERE numProc = ?', [CNJ2]))[0].id;
  d.vara = (await noBanco("SELECT id FROM tblvara WHERE nome = '1ª Vara do Trabalho E2E C6'"))[0].id;
  d.julgamento = (await noBanco("SELECT id FROM tipo_audiencia WHERE nome = 'Julgamento'"))[0].id;
  d.instrucao = (await noBanco("SELECT id FROM tipo_audiencia WHERE nome = 'Instrução'"))[0].id;
  const nova = async (campos) => (await noBanco(
    `INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id, plataforma_virtual, link_virtual, observacoes, status, motivo_status, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, campos)).insertId;
  d.a1 = await nova([d.proc1, d.julgamento, util(1), '10:00', 'presencial', d.vara, null, null, 'Levar procuração', 'agendada', null]);
  d.a2 = await nova([d.proc1, d.instrucao, util(2), '09:00', 'virtual', null, 'Zoom', 'https://zoom.example/e2e', null, 'agendada', null]);
  d.a3 = await nova([d.proc2, d.julgamento, util(3), '14:00', 'sem_comparecimento', null, null, null, null, 'agendada', null]);
  d.a4 = await nova([d.proc2, d.julgamento, '2001-01-10', '11:00', 'presencial', null, null, null, null, 'realizada', null]);
  d.a5 = await nova([d.proc1, d.julgamento, '2001-02-10', '11:00', 'presencial', null, null, null, null, 'cancelada', 'Parte doente']);
});

async function abrirAba(page, processo = null) {
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=audiencias`); await aguardarTelaPronta(page);
  await expect(page.locator('.aba-btn.ativa')).toHaveText('Audiências');
  if (processo) { await filtroProcesso(page).selectOption({ label: processo }); await aguardarTelaPronta(page); }
}
const abrirNova = async (page, processo = CNJ1) => {
  await abrirAba(page, processo);
  await page.getByRole('button', { name: '+ Nova Audiência' }).click();
  const j = janela(page, 'Nova Audiência');
  await expect(j).toBeVisible();
  return j;
};
const noBancoAud = (id) => noBanco("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM audiencia WHERE id = ?", [id]);
const dataDe = (j) => j.getByRole('textbox', { name: 'Data da audiência' });

test('@critical Aba Audiências: lista (agendadas primeiro, por data), colunas, local/link virtual, filtro por processo e acessibilidade', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Tipo', 'Data / Hora', 'Modalidade', 'Local', 'Status', 'Ações']);
  await expect(page.locator('tbody tr')).toHaveCount(5);
  const datas = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
  expect(datas).toEqual([`${br(util(1))} 10:00`, `${br(util(2))} 09:00`, `${br(util(3))} 14:00`, '10/01/2001 11:00', '10/02/2001 11:00']);   // agendadas primeiro; depois as demais, por data
  await expect(page.getByRole('button', { name: '+ Nova Audiência' })).toHaveCount(0);                      // "Todos os processos": não há onde ligar a audiência
  const l1 = linha(page, `${br(util(1))} 10:00`);
  await expect(l1.locator('td').nth(2)).toHaveText('Presencial');
  await expect(l1.locator('td').nth(3)).toHaveText('1ªVT E2E — Fórum E2E C6');
  await expect(l1.locator('td').nth(4)).toHaveText('Agendada');
  const l2 = linha(page, `${br(util(2))} 09:00`);
  await expect(l2.locator('td').nth(2)).toHaveText('Virtual');
  await expect(l2.locator('td').nth(3)).toContainText('Zoom');
  await expect(l2.getByRole('link', { name: /Link/ })).toHaveAttribute('href', 'https://zoom.example/e2e');
  await expect(linha(page, `${br(util(3))} 14:00`).locator('td').nth(2)).toHaveText('Sem comparecimento');
  await expect(linha(page, '10/01/2001').locator('td').nth(4)).toHaveText('Realizada');
  await expect(linha(page, '10/02/2001').locator('td').nth(4)).toHaveText('Cancelada');
  await semViolacoes(page, 'aba Audiências com 5 audiências');
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ Nova Audiência' })).toBeVisible();
  await filtroProcesso(page).selectOption({ label: CNJ1 });
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await noBanco('DELETE FROM audiencia WHERE processo_id = ?', [d.proc2]);
  await filtroProcesso(page).selectOption({ label: CNJ2 });
  await expect(page.getByText('Nenhuma audiência encontrada')).toBeVisible();
  await semViolacoes(page, 'aba Audiências sem registros');
});

test('@critical Nova audiência presencial: janela, obrigatórios, vara (busca), responsável, grava e aparece na lista', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page, CNJ2);
  await expect(j.getByLabel('Processo', { exact: true })).toHaveValue(new RegExp(CNJ2));
  await expect(j.getByLabel('Modalidade', { exact: true })).toHaveValue('presencial');
  await expect(j.getByText('Pasta: 7401')).toBeVisible();
  await expect(j.getByLabel('Plataforma', { exact: true })).toHaveCount(0);                                  // só em audiência virtual
  await semViolacoes(page, 'janela Nova Audiência');
  // obrigatórios, um de cada vez
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Tipo de audiência é obrigatório'); await esperarSemAviso(page);
  await j.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Julgamento' });
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Data é obrigatória'); await esperarSemAviso(page);
  await dataDe(j).fill(br(util(5))); await dataDe(j).blur();
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Hora é obrigatória'); await esperarSemAviso(page);
  await j.getByLabel('Hora', { exact: true }).fill('15:30');
  // vara: busca, escolhe, mostra o chip
  await j.getByPlaceholder('Digite para buscar vara (nome, fórum, cidade)...').fill('E2E');
  await page.getByText('1ªVT E2E').last().click();
  await expect(j.getByText('1ªVT E2E')).toBeVisible();
  await j.getByLabel('Obs.', { exact: true }).fill('  Levar as testemunhas  ');
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Audiência criada com sucesso!');
  await expect(j).toHaveCount(0);
  const a = (await noBanco("SELECT *, DATE_FORMAT(data, '%Y-%m-%d') AS dia, TIME_FORMAT(hora, '%H:%i') AS hm FROM audiencia WHERE processo_id = ? AND hora = '15:30:00'", [d.proc2]))[0];
  expect({ proc: a.processo_id, tipo: a.tipo_audiencia_id, dia: a.dia, hm: a.hm, mod: a.modalidade, vara: a.vara_id, obs: a.observacoes, status: a.status, por: a.criado_por })
    .toEqual({ proc: d.proc2, tipo: d.julgamento, dia: util(5), hm: '15:30', mod: 'presencial', vara: d.vara, obs: 'Levar as testemunhas', status: 'agendada', por: 1 });
  await expect(linha(page, `${br(util(5))} 15:30`)).toBeVisible();
  // mesmo horário de novo = aviso do servidor, nada gravado
  await esperarSemAviso(page);
  await page.getByRole('button', { name: '+ Nova Audiência' }).click();
  const j2 = janela(page, 'Nova Audiência');
  await j2.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Julgamento' });
  await dataDe(j2).fill(br(util(5))); await dataDe(j2).blur();
  await j2.getByLabel('Hora', { exact: true }).fill('15:30');
  await j2.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, /Já existe uma audiência ativa/);
  expect((await noBanco("SELECT COUNT(*) AS n FROM audiencia WHERE processo_id = ? AND hora = '15:30:00'", [d.proc2]))[0].n).toBe(1);
});

test('@critical Data da audiência: dá para DIGITAR dd/mm/aaaa (e continua dando para escolher no calendário); data inválida não é aceita', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page);
  await expect(dataDe(j), 'a data não pode ser digitada (só há um botão de calendário)').toBeVisible();
  await dataDe(j).fill(br(util(4)));
  await expect(dataDe(j)).toHaveValue(br(util(4)));
  await dataDe(j).fill('31/02/2099'); await dataDe(j).blur();
  await expect(dataDe(j), 'data impossível ficou no campo').toHaveValue('');
  await dataDe(j).fill('2203'); await dataDe(j).blur();
  await expect(dataDe(j)).toHaveValue('');
  // calendário: abre, vai para o mês seguinte e escolhe o dia 15
  await j.getByRole('button', { name: 'Abrir calendário da data da audiência' }).click();
  await page.getByRole('button', { name: '›' }).click();
  await page.getByRole('button', { name: '15', exact: true }).click();
  // "Hoje" no horário de Brasília (o do sistema e do navegador do teste), não o relógio da máquina: numa máquina em UTC,
  // no último dia do mês entre 21h e meia-noite de Brasília, o relógio local já está no mês seguinte.
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 15);
  await expect(dataDe(j)).toHaveValue(`15/${String(alvo.getMonth() + 1).padStart(2, '0')}/${alvo.getFullYear()}`);
  // digitando de novo, o valor muda
  await dataDe(j).fill(br(util(6))); await dataDe(j).blur();
  await expect(dataDe(j)).toHaveValue(br(util(6)));
  await semViolacoes(page, 'janela Nova Audiência com data');
});

test('@critical Avisos ao salvar: horário fora do expediente e data passada pedem confirmação; sábado pede a senha do usuário', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page);
  await j.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Instrução' });
  await dataDe(j).fill(br(util(7))); await dataDe(j).blur();
  await j.getByLabel('Hora', { exact: true }).fill('06:30'); await j.getByLabel('Hora', { exact: true }).blur();
  await expect(j.getByText(/Horário incomum \(06:30\)/)).toBeVisible();                                     // aviso logo abaixo do campo
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await expect(page.getByRole('heading', { name: 'Atenção — dados incomuns' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();                                       // volta sem gravar
  expect((await noBanco("SELECT COUNT(*) AS n FROM audiencia WHERE hora = '06:30:00'"))[0].n).toBe(0);
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await page.getByRole('button', { name: 'Confirmar mesmo assim' }).click();
  await aviso(page, 'Audiência criada com sucesso!');
  const a = (await noBanco("SELECT id FROM audiencia WHERE hora = '06:30:00'"))[0];
  const h = await noBanco("SELECT valor_novo FROM auditoria_audiencia WHERE audiencia_id = ? AND campo_alterado = 'criacao'", [a.id]);
  expect(h[0].valor_novo).toContain('horário incomum confirmado pelo usuário');                              // fica registrado no histórico
  // data passada
  await esperarSemAviso(page);
  await page.getByRole('button', { name: '+ Nova Audiência' }).click();
  const j2 = janela(page, 'Nova Audiência');
  await j2.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Instrução' });
  await dataDe(j2).fill('05/01/2001'); await dataDe(j2).blur();
  await j2.getByLabel('Hora', { exact: true }).fill('10:00');
  await j2.getByRole('button', { name: 'Criar Audiência' }).click();
  await expect(page.getByRole('heading', { name: 'Atenção — dados incomuns' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await dataDe(j2).fill(br(SABADO)); await dataDe(j2).blur();
  await j2.getByRole('button', { name: 'Criar Audiência' }).click();
  await expect(page.getByRole('heading', { name: /Data não é dia útil/ })).toBeVisible();
  await expect(page.getByText(`${br(SABADO)} é sábado`)).toBeVisible();
  await page.getByLabel('Sua senha', { exact: true }).fill('senha-errada');
  await page.getByRole('button', { name: 'Confirmar e Agendar' }).click();
  await aviso(page, /incorreta|inválida/i);
  expect((await noBanco('SELECT COUNT(*) AS n FROM audiencia WHERE data = ?', [SABADO]))[0].n).toBe(0);
  await page.getByLabel('Sua senha', { exact: true }).fill('TesteSeguro123!');
  await page.getByRole('button', { name: 'Confirmar e Agendar' }).click();
  await aviso(page, 'Audiência criada com sucesso!');
  const s = (await noBanco('SELECT id FROM audiencia WHERE data = ?', [SABADO]))[0];
  expect((await noBanco("SELECT valor_novo FROM auditoria_audiencia WHERE audiencia_id = ? AND campo_alterado = 'criacao'", [s.id]))[0].valor_novo).toContain('dia não útil');
});

test('@critical Modalidade na janela Nova Audiência: virtual mostra Plataforma e Link; sem comparecimento esconde Local e Testemunhas e não guarda vara/link', async ({ page }) => {
  await loginPelaTela(page);
  const j = await abrirNova(page);
  await expect(j.getByText('Local da audiência')).toBeVisible();
  await expect(j.getByText('Testemunhas', { exact: true })).toBeVisible();
  await j.getByLabel('Modalidade', { exact: true }).selectOption('virtual');
  await j.getByLabel('Plataforma', { exact: true }).fill('Zoom');
  await j.getByLabel('Link', { exact: true }).fill('https://zoom.example/nova');
  await semViolacoes(page, 'janela Nova Audiência virtual');
  await j.getByLabel('Modalidade', { exact: true }).selectOption('sem_comparecimento');
  await expect(j.getByLabel('Plataforma', { exact: true })).toHaveCount(0);
  await expect(j.getByText('Local da audiência')).toHaveCount(0);
  await expect(j.getByText('Testemunhas', { exact: true })).toHaveCount(0);
  await expect(j.getByText('Responsável pelo acompanhamento')).toBeVisible();
  await j.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Julgamento' });
  await dataDe(j).fill(br(util(8))); await dataDe(j).blur();
  await j.getByLabel('Hora', { exact: true }).fill('16:00');
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Audiência criada com sucesso!');
  const a = (await noBanco("SELECT * FROM audiencia WHERE processo_id = ? AND hora = '16:00:00'", [d.proc1]))[0];
  expect({ mod: a.modalidade, plat: a.plataforma_virtual, link: a.link_virtual, vara: a.vara_id }).toEqual({ mod: 'sem_comparecimento', plat: null, link: null, vara: null });
});

test('@critical Link da audiência virtual: o espaço some ao colar, https:// entra ao sair do campo, endereço inválido é recusado e o link aparece maior na lista', async ({ page }) => {
  await loginPelaTela(page);
  const preencher = async (j, hora, link) => {
    await j.getByLabel('Modalidade', { exact: true }).selectOption('virtual');
    await j.getByLabel('Plataforma', { exact: true }).fill('Zoom');
    await j.getByLabel('Link', { exact: true }).fill(link);
    await j.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Julgamento' });
    await dataDe(j).fill(br(util(8))); await dataDe(j).blur();
    await j.getByLabel('Hora', { exact: true }).fill(hora);
  };
  // 1) colar um link com espaço no meio (como vem do convite): o espaço nem entra; ao sair do campo entra o https://
  let j = await abrirNova(page);
  await preencher(j, '16:10', 'zoom.us/j /856 01023093?pwd=dytLODJ6 ckdYam');
  await expect(j.getByLabel('Link', { exact: true })).toHaveValue('https://zoom.us/j/85601023093?pwd=dytLODJ6ckdYam');
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await aviso(page, 'Audiência criada com sucesso!');
  expect((await noBanco("SELECT link_virtual FROM audiencia WHERE processo_id = ? AND hora = '16:10:00'", [d.proc1]))[0].link_virtual).toBe('https://zoom.us/j/85601023093?pwd=dytLODJ6ckdYam');
  // 2) o link na lista da pasta aparece maior e legível (era 11 px e cinza claro)
  const linkNaLista = page.getByRole('link', { name: /Link/ }).first();
  await expect(linkNaLista).toBeVisible();
  const tamanho = await linkNaLista.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(tamanho).toBeGreaterThanOrEqual(13);
  // 3) texto que não é endereço: o servidor recusa com aviso claro e nada é gravado
  j = await abrirNova(page);
  await preencher(j, '16:11', 'sala do zoom');
  await j.getByRole('button', { name: 'Criar Audiência' }).click();
  await expect(page.getByText(/não é um endereço válido/).first()).toBeVisible();
  expect((await noBanco("SELECT COUNT(*) AS n FROM audiencia WHERE processo_id = ? AND hora = '16:11:00'", [d.proc1]))[0].n).toBe(0);
});

test('@critical Detalhes (somente leitura) e Editar: clicar na linha abre travado; "Editar" destrava; salvar grava e o histórico registra; Esc fecha', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await linha(page, `${br(util(1))} 10:00`).click();
  const j = janela(page, 'Detalhes da Audiência');
  await expect(j).toBeVisible();
  await expect(j.locator('input:not([disabled]), select:not([disabled]), textarea:not([disabled])'), 'há campo editável no modo "só ver"').toHaveCount(0);
  await expect(j.getByLabel('Obs.', { exact: true })).toHaveValue('Levar procuração');
  await expect(dataDe(j)).toBeDisabled();
  await expect(j.getByText('1ªVT E2E')).toBeVisible();
  await semViolacoes(page, 'janela Detalhes da Audiência');
  await page.keyboard.press('Escape');
  await expect(j).toHaveCount(0);
  await linha(page, `${br(util(1))} 10:00`).click();
  await janela(page, 'Detalhes da Audiência').getByRole('button', { name: 'Editar' }).click();
  const e = janela(page, 'Editar Audiência');
  await expect(e.getByLabel('Obs.', { exact: true })).toBeEnabled();
  await semViolacoes(page, 'janela Editar Audiência');
  await e.getByLabel('Tipo de audiência', { exact: true }).selectOption({ label: 'Instrução' });
  await dataDe(e).fill(br(util(9))); await dataDe(e).blur();
  await e.getByLabel('Hora', { exact: true }).fill('11:15');
  await e.getByLabel('Modalidade', { exact: true }).selectOption('virtual');
  await e.getByLabel('Plataforma', { exact: true }).fill('Teams');
  await e.getByLabel('Obs.', { exact: true }).fill('Observação nova');
  await e.getByRole('button', { name: 'Salvar Alterações' }).click();
  await aviso(page, 'Audiência atualizada com sucesso!');
  const a = (await noBancoAud(d.a1))[0];
  expect({ tipo: a.tipo_audiencia_id, dia: a.dia, hm: a.hm, mod: a.modalidade, plat: a.plataforma_virtual, obs: a.observacoes }).toEqual({ tipo: d.instrucao, dia: util(9), hm: '11:15', mod: 'virtual', plat: 'Teams', obs: 'Observação nova' });
  const campos = (await noBanco('SELECT campo_alterado FROM auditoria_audiencia WHERE audiencia_id = ? ORDER BY campo_alterado', [d.a1])).map(x => x.campo_alterado);
  expect(campos).toEqual(['data', 'hora', 'modalidade', 'observacoes', 'plataforma_virtual', 'tipo_audiencia_id']);
  // menu → Editar abre direto no modo de edição
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(9))} 11:15`));
  await page.getByRole('button', { name: /Editar/ }).click();
  await expect(janela(page, 'Editar Audiência')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await expect(janela(page, 'Editar Audiência')).toHaveCount(0);
});

test('@critical Editar: audiência cancelada não tem "Editar" no menu e abre só em modo leitura (sem botão Editar)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, '10/02/2001'));
  await expect(page.getByRole('button', { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cancelar$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Remarcar/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await linha(page, '10/02/2001').click();
  const j = janela(page, 'Detalhes da Audiência');
  await expect(j.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(j.getByRole('button', { name: 'Fechar' })).toBeVisible();
});

test('@critical Cancelar audiência: motivo obrigatório, "Voltar" não cancela, confirmar muda o status e registra no histórico', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(2))} 09:00`));
  await page.getByRole('button', { name: /Cancelar$/ }).click();
  const j = janela(page, 'Cancelar Audiência');
  await expect(j.getByText(`Audiência de ${br(util(2))} às 09:00`)).toBeVisible();
  await semViolacoes(page, 'janela Cancelar Audiência');
  await j.getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Motivo do cancelamento é obrigatório'); await esperarSemAviso(page);
  await j.getByLabel('Motivo do cancelamento', { exact: true }).fill('   ');
  await j.getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Motivo do cancelamento é obrigatório'); await esperarSemAviso(page);
  await j.getByRole('button', { name: 'Voltar' }).click();
  expect((await noBancoAud(d.a2))[0].status).toBe('agendada');
  await abrirMenuAcoes(page, linha(page, `${br(util(2))} 09:00`));
  await page.getByRole('button', { name: /Cancelar$/ }).click();
  await janela(page, 'Cancelar Audiência').getByLabel('Motivo do cancelamento', { exact: true }).fill('Parte contrária pediu');
  await janela(page, 'Cancelar Audiência').getByRole('button', { name: 'Confirmar Cancelamento' }).click();
  await aviso(page, 'Audiência cancelada com sucesso!');
  await expect(linha(page, `${br(util(2))} 09:00`).locator('td').nth(4)).toHaveText('Cancelada');
  const a = (await noBancoAud(d.a2))[0];
  expect({ status: a.status, motivo: a.motivo_status }).toEqual({ status: 'cancelada', motivo: 'Parte contrária pediu' });
  expect((await noBanco("SELECT COUNT(*) AS n FROM auditoria_audiencia WHERE audiencia_id = ? AND campo_alterado = 'status' AND valor_novo = 'cancelada'", [d.a2]))[0].n).toBe(1);
});

test('@critical Remarcar: pede o motivo, abre a nova audiência com o processo travado, e só ao confirmar a antiga vira "Remarcada"', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await page.getByRole('button', { name: /Remarcar/ }).click();
  const m = janela(page, 'Remarcar Audiência');
  await semViolacoes(page, 'janela Remarcar Audiência (motivo)');
  await m.getByRole('button', { name: 'Confirmar Remarcação' }).click();
  await aviso(page, 'Motivo é obrigatório'); await esperarSemAviso(page);
  await m.getByLabel('Motivo da remarcação', { exact: true }).fill('Pedido da parte');
  await m.getByRole('button', { name: 'Confirmar Remarcação' }).click();
  const j = janela(page, 'Remarcar Audiência');
  await expect(j.getByLabel('Processo', { exact: true })).toHaveValue(new RegExp(CNJ1));
  await expect(j.getByLabel('Processo', { exact: true })).toHaveAttribute('readonly', '');                 // processo travado
  await expect(j.getByRole('button', { name: 'Trocar processo' })).toHaveCount(0);
  await expect(dataDe(j)).toHaveValue(br(util(1)));                                                         // vem preenchida com os dados da antiga
  await expect(j.getByLabel('Hora', { exact: true })).toHaveValue('10:00');
  expect((await noBancoAud(d.a1))[0].status).toBe('agendada');                                              // ainda não mudou nada
  await dataDe(j).fill(br(util(10))); await dataDe(j).blur();
  await j.getByLabel('Hora', { exact: true }).fill('13:00');
  await j.getByRole('button', { name: 'Confirmar Remarcação' }).click();
  await aviso(page, 'Audiência remarcada com sucesso!');
  expect((await noBancoAud(d.a1))[0].status).toBe('remarcada');
  expect((await noBancoAud(d.a1))[0].motivo_status).toBe('Pedido da parte');
  await expect(linha(page, `${br(util(10))} 13:00`).locator('td').nth(4)).toHaveText('Agendada');
  await expect(linha(page, `${br(util(1))} 10:00`).locator('td').nth(4)).toHaveText('Remarcada');
});

test('@critical Histórico da audiência: mostra o que mudou, quem e quando; vazio tem mensagem; Esc e Fechar fecham', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await abrirMenuAcoes(page, linha(page, `${br(util(3))} 14:00`));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const v = janela(page, /Histórico —/);
  await expect(v.getByText('Nenhuma alteração registrada para esta audiência.')).toBeVisible();
  await semViolacoes(page, 'janela Histórico vazio');
  await v.getByRole('button', { name: 'Fechar' }).click();
  await expect(v).toHaveCount(0);
  // depois de uma edição aparece
  await noBanco("INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id) VALUES (?, 'hora', '14:00', '15:00', 1), (?, 'cadastrado', NULL, 'Audiência cadastrada', 1)", [d.a3, d.a3]);
  await abrirMenuAcoes(page, linha(page, `${br(util(3))} 14:00`));
  await page.getByRole('button', { name: /Histórico/ }).click();
  const h = janela(page, /Histórico —/);
  await expect(h.getByRole('columnheader')).toHaveText(['Data / Hora', 'Usuário', 'Campo', 'Valor anterior', 'Valor novo']);
  await expect(h.locator('tbody tr')).toHaveCount(2);
  await expect(h.locator('tbody tr').filter({ hasText: 'Hora' })).toContainText('14:00');
  await expect(h.locator('tbody tr').filter({ hasText: 'Hora' })).toContainText('15:00');
  await expect(h.locator('tbody tr').first()).toContainText('Administrador de Testes');
  await semViolacoes(page, 'janela Histórico com registros');
  await page.keyboard.press('Escape');
  await expect(h).toHaveCount(0);
});

test('@critical Excluir audiência: confirma, "Cancelar" não apaga, apaga junto o histórico; cancelada também (administrador, sem ata/testemunha)', async ({ page }) => {
  await loginPelaTela(page);
  await abrirAba(page);
  await noBanco("INSERT INTO auditoria_audiencia (audiencia_id, campo_alterado, valor_anterior, valor_novo, usuario_id) VALUES (?, 'cadastrado', NULL, 'Audiência cadastrada', 1)", [d.a3]);
  await abrirMenuAcoes(page, linha(page, `${br(util(3))} 14:00`));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await expect(page.getByRole('heading', { name: 'Excluir audiência' })).toBeVisible();
  await expect(page.getByText('Tem certeza que deseja excluir esta audiência? Esta ação não pode ser desfeita.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBancoAud(d.a3)).length).toBe(1);
  await abrirMenuAcoes(page, linha(page, `${br(util(3))} 14:00`));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).last().click();
  await aviso(page, 'Audiência excluída com sucesso!');
  await expect(linha(page, `${br(util(3))} 14:00`)).toHaveCount(0);
  expect((await noBancoAud(d.a3)).length).toBe(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM auditoria_audiencia WHERE audiencia_id = ?', [d.a3]))[0].n).toBe(0);
  await esperarSemAviso(page);
  await abrirMenuAcoes(page, linha(page, '10/02/2001'));
  await page.getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).last().click();
  await aviso(page, 'Audiência excluída com sucesso!');
  expect((await noBancoAud(d.a5)).length).toBe(0);
});

test('@critical Permissões: só VISUALIZAR não recebe "+ Nova Audiência", Cancelar, Remarcar, Editar nem Excluir (só Histórico); sem "ver audiências" recebe aviso claro', async ({ page }) => {
  const so = await criarUsuarioComPermissoes('so_ve_audiencias', [['processos', null, 'visualizar'], ['audiencias', null, 'visualizar']]);
  await loginPelaTela(page, so);
  await abrirAba(page, CNJ1);
  await expect(linha(page, `${br(util(1))} 10:00`)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Nova Audiência' })).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  await expect(page.getByRole('button', { name: /Histórico/ })).toBeVisible();
  for (const nome of [/Cancelar$/, /Remarcar/, /Editar/, /Excluir/, /Registrar ata/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await linha(page, `${br(util(1))} 10:00`).click();
  await expect(janela(page, 'Detalhes da Audiência').getByRole('button', { name: 'Editar' })).toHaveCount(0);
});

test('@critical Permissões: com cadastrar e alterar (sem excluir) aparecem Nova, Cancelar, Remarcar e Editar, mas não Excluir', async ({ page }) => {
  const cad = await criarUsuarioComPermissoes('cad_alt_audiencias', [['processos', null, 'visualizar'], ['audiencias', null, 'visualizar'], ['audiencias', null, 'cadastrar'], ['audiencias', null, 'alterar']]);
  await loginPelaTela(page, cad);
  await abrirAba(page, CNJ1);
  await expect(page.getByRole('button', { name: '+ Nova Audiência' })).toBeVisible();
  await abrirMenuAcoes(page, linha(page, `${br(util(1))} 10:00`));
  for (const nome of [/Cancelar$/, /Remarcar/, /Editar/, /Histórico/]) await expect(page.getByRole('button', { name: nome })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0);
});

test('@critical Quem não tem permissão de ver audiências recebe um aviso claro (não "nenhuma audiência" nem tela quebrada)', async ({ page }) => {
  const sem = await criarUsuarioComPermissoes('sem_audiencias', [['processos', null, 'visualizar']]);
  await loginPelaTela(page, sem);
  await page.goto(`/processos/pasta/${d.pastaPartes}?aba=audiencias`); await aguardarTelaPronta(page);
  await expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);
  await expect(page.getByText('Você não tem permissão para ver as audiências deste processo.')).toBeVisible();
  await expect(page.getByText('Nenhuma audiência encontrada')).toHaveCount(0);
});

test('@critical Mais de 50 audiências no mesmo processo: a aba mostra todas (sem cortar em 50 em silêncio)', async ({ page }) => {
  const valores = Array.from({ length: 70 }, (_, i) => `(${d.proc1}, ${d.julgamento}, '2098-06-${String(1 + (i % 28)).padStart(2, '0')}', '${String(8 + Math.floor(i / 28)).padStart(2, '0')}:00:00', 'presencial', 1)`).join(',');
  await noBanco(`INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, criado_por) VALUES ${valores}`);
  await loginPelaTela(page);
  await abrirAba(page, CNJ1);
  await expect(page.locator('tbody tr'), 'a lista mostrou menos audiências do que existem (70 em massa + 3 do processo)').toHaveCount(73, { timeout: 20000 });
});

// ---- Detalhes da ATA e EDITAR ATA pela aba Audiências da pasta (10/10/2026) ----
// a4 = audiência realizada (proc2): ganha uma ata com "Ninguém" como acompanhante e uma tarefa registrada.
async function criarAtaDaA4() {
  const ata = (await noBanco("INSERT INTO ata_audiencia (audiencia_id, resultado, observacoes, sem_advogado, criado_por) VALUES (?, NULL, 'Observação original', 1, 1)", [d.a4])).insertId;
  await noBanco("INSERT INTO ata_audiencia_itens (ata_audiencia_id, tipo, registro_id, titulo, data_referencia) VALUES (?, 'tarefa', NULL, 'Tarefa original da ata', '2030-06-10')", [ata]);
  return ata;
}
const linhaA4 = (page) => page.locator('tbody tr').filter({ hasText: '10/01/2001' });
const caixa = (j, nome) => j.getByRole('checkbox', { name: nome });

test('@critical Aba Audiências da pasta: ato sem comparecimento (sentença) tem "Concluir", sem "Registrar ata" nem "Gerar documento", e a janela não tem responsável, acordo, desistência nem retorno aos autos', async ({ page }) => {
  const sentenca = (await noBanco(
    `INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, status, criado_por) VALUES (?, ?, '2001-03-10', '12:00', 'sem_comparecimento', 'agendada', 1)`,
    [d.proc2, d.julgamento])).insertId;
  await loginPelaTela(page);
  await abrirAba(page, CNJ2);
  const linhaS = page.locator('tbody tr').filter({ hasText: '10/03/2001' });
  await abrirMenuAcoes(page, linhaS);
  await expect(page.getByRole('button', { name: 'Registrar ata' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerar documento' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  const j = janela(page, 'Concluir — 10/03/2001 12:00');
  await expect(j).toBeVisible();
  await expect(j.getByText('Responsável pelo acompanhamento')).toHaveCount(0);
  for (const fora of ['Acordo', 'Desistência da Ação', 'Retornem aos autos', 'Testemunha(s)']) await expect(j.getByText(fora, { exact: true })).toHaveCount(0);
  for (const dentro of ['Prazo', 'Perícia', 'Nova audiência', 'Alvará', 'Tarefa']) await expect(j.getByRole('checkbox', { name: dentro })).toBeVisible();
  await semViolacoes(page, 'janela Concluir');
  await j.getByRole('button', { name: 'Concluir', exact: true }).click();                       // sem texto: recusa
  await expect(j.getByText('Descreva o que aconteceu no ato processual antes de concluir.')).toBeVisible();
  await j.getByPlaceholder('Descreva o resultado disponibilizado ou a baixa realizada...').fill('Sentença de procedência publicada.');
  await j.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(j).toHaveCount(0);
  const ata = (await noBanco('SELECT resultado, advogado_id, advogado_freela_id, criado_por FROM ata_audiencia WHERE audiencia_id = ?', [sentenca]))[0];
  expect({ r: ata.resultado, adv: ata.advogado_id, freela: ata.advogado_freela_id, por: ata.criado_por }).toEqual({ r: 'Sentença de procedência publicada.', adv: null, freela: null, por: 1 });
  // depois: detalhes e edição da conclusão, também sem responsável
  await abrirMenuAcoes(page, linhaS);
  await page.getByRole('button', { name: 'Detalhes da conclusão' }).click();
  const det = janela(page, 'Detalhes da conclusão — 10/03/2001 12:00');
  await expect(det.getByText('Sentença de procedência publicada.')).toBeVisible();
  await expect(det.getByText('Concluída por:')).toBeVisible();
  await expect(det.getByText('Responsável pelo acompanhamento:')).toHaveCount(0);
  await det.getByRole('button', { name: 'Editar conclusão' }).click();
  const ed = janela(page, 'Editar conclusão — 10/03/2001 12:00');
  await expect(ed).toBeVisible();
  await expect(ed.getByText('Responsável pelo acompanhamento')).toHaveCount(0);
});

test('@critical Aba Audiências da pasta: "Detalhes da ATA" só aparece na audiência com ata; "Editar ata" corrige o advogado e as observações e acrescenta uma tarefa esquecida', async ({ page }) => {
  const ataId = await criarAtaDaA4();
  const freela = (await noBanco("INSERT INTO advogados_freela (nome, oab) VALUES ('Freela E2E da ata', 'OAB 123')")).insertId;
  await loginPelaTela(page);
  await abrirAba(page, CNJ2);
  // só a audiência com ata oferece o item
  await abrirMenuAcoes(page, linha(page, 'Sem comparecimento'));
  await expect(page.getByRole('button', { name: /Detalhes d/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await abrirMenuAcoes(page, linhaA4(page));
  await page.getByRole('button', { name: 'Detalhes da ATA' }).click();
  const det = janela(page, 'Detalhes da ATA — 10/01/2001 11:00');
  await expect(det).toBeVisible();
  await expect(det.getByText('Ninguém (a parte compareceu sozinha)')).toBeVisible();
  await expect(det.getByText('Tarefa original da ata')).toBeVisible();
  await semViolacoes(page, 'Detalhes da ATA na pasta');
  // editar
  await det.getByRole('button', { name: 'Editar ata' }).click();
  const ed = janela(page, 'Editar Ata — 10/01/2001 11:00');
  await expect(ed).toBeVisible();
  await expect(ed.getByTestId('itens-ja-registrados')).toContainText('Tarefa: Tarefa original da ata');
  await expect(ed.getByLabel('Advogado(a) que acompanhou a audiência', { exact: true })).toHaveValue('ninguem');
  await expect(ed.getByLabel('Observações', { exact: true })).toHaveValue('Observação original');
  await expect(ed.getByRole('button', { name: 'Salvar alterações' })).toBeVisible();
  await expect(caixa(ed, 'Tarefa')).toBeEnabled();                                            // dá para acrescentar outra tarefa
  await semViolacoes(page, 'janela Editar Ata');
  // sem mexer em nada: o servidor recusa e a janela continua
  await ed.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(ed.getByText('Nenhuma alteração para salvar.')).toBeVisible();
  // corrige o advogado e as observações, acrescenta uma tarefa
  await ed.getByLabel('Advogado(a) que acompanhou a audiência', { exact: true }).selectOption(`freela:${freela}`);
  await ed.getByLabel('Observações', { exact: true }).fill('Observação corrigida');
  await caixa(ed, 'Tarefa').check();
  await ed.getByRole('button', { name: '+ Cadastrar tarefa', exact: true }).click();
  await janela(page, 'Nova Tarefa').getByLabel('Título', { exact: true }).fill('Tarefa esquecida da ata E2E');
  await janela(page, 'Nova Tarefa').getByRole('button', { name: 'Salvar Tarefa' }).click();
  await ed.getByRole('button', { name: 'Salvar alterações' }).click();
  await aviso(page, 'Ata atualizada com sucesso!');
  await expect(ed).toHaveCount(0);
  const ata = (await noBanco('SELECT advogado_freela_id, sem_advogado, observacoes FROM ata_audiencia WHERE id = ?', [ataId]))[0];
  expect(ata).toEqual({ advogado_freela_id: freela, sem_advogado: 0, observacoes: 'Observação Corrigida' });   // o campo põe as iniciais em maiúscula ao sair, como na ata nova
  const itens = await noBanco("SELECT tipo, titulo FROM ata_audiencia_itens WHERE ata_audiencia_id = ? ORDER BY id", [ataId]);
  expect(itens.map(i => i.tipo)).toEqual(['tarefa', 'tarefa']);
  expect(itens[1].titulo).toMatch(/tarefa esquecida da ata e2e/i);
  expect((await noBanco("SELECT COUNT(*) AS n FROM tarefas WHERE titulo LIKE 'Tarefa esquecida da ata E2E'"))[0].n).toBe(1);
  const hist = (await noBanco("SELECT campo_alterado FROM auditoria_audiencia WHERE audiencia_id = ? AND campo_alterado LIKE 'ata_%'", [d.a4])).map(h => h.campo_alterado);
  expect(hist.sort()).toEqual(['ata_advogado', 'ata_item', 'ata_observacoes']);
  // reabrindo os Detalhes: mostram o advogado novo e as duas tarefas
  await abrirMenuAcoes(page, linhaA4(page));
  await page.getByRole('button', { name: 'Detalhes da ATA' }).click();
  const det2 = janela(page, 'Detalhes da ATA — 10/01/2001 11:00');
  await expect(det2.getByText('Freela E2E da ata')).toBeVisible();
  await expect(det2.getByText('Observação Corrigida')).toBeVisible();
  await expect(det2.getByText('Tarefa original da ata')).toBeVisible();
});

test('@critical Aba Audiências da pasta: quem vê audiências mas NÃO tem a permissão de ata consulta os Detalhes da ATA, sem o botão "Editar ata"', async ({ page }) => {
  await criarAtaDaA4();
  const so = await criarUsuarioComPermissoes('so_ve_ata_c6', [['processos', null, 'visualizar'], ['audiencias', null, 'visualizar']]);
  await loginPelaTela(page, so);
  await abrirAba(page, CNJ2);
  await abrirMenuAcoes(page, linhaA4(page));
  await page.getByRole('button', { name: 'Detalhes da ATA' }).click();
  const det = janela(page, 'Detalhes da ATA — 10/01/2001 11:00');
  await expect(det.getByText('Tarefa original da ata')).toBeVisible();
  await expect(det.getByRole('button', { name: 'Editar ata' })).toHaveCount(0);
  await expect(det.getByRole('button', { name: 'Fechar', exact: true })).toBeVisible();
});
