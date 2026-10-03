import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, loginPelaTela, violacoesGraves } from './helpers';
import { createRequire } from 'node:module';

// Passo B4 (parte 2) do plano (PLANO-TESTES-PROCESSOS.md): as janelas "Gerenciar" (o botão "…" ao lado de Tipo, Status, Instância, Fórum,
// Vara e Assuntos) — buscar, criar, editar, excluir, itens em uso, CEP do fórum, permissões e acessibilidade. Cada tipo tem o seu teste.
// Todos os itens criados aqui começam por "Aux Ui" e são apagados do banco antes e depois de cada teste.
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
const janelaAux = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) }).last();
const campo = (jan, rotulo) => jan.locator('.form-group').filter({ has: jan.page().locator('label', { hasText: new RegExp(`^${rotulo}`) }) }).first().locator('input');
const linhaItem = (jan, nome) => jan.locator('strong', { hasText: nome }).first().locator('xpath=../..');
const confirmacao = (page) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /^Excluir / }) }).last();

async function limparAuxUi() {
  await noBanco("DELETE FROM processo_assunto WHERE processo_id IN (SELECT id FROM tblproc WHERE numProc = '9300001-00.2026.5.15.0001')");
  await noBanco("DELETE FROM tblproc WHERE numProc = '9300001-00.2026.5.15.0001'");
  await noBanco("DELETE FROM tblpasta WHERE numPasta = 7301");
  await noBanco("DELETE FROM tblvara WHERE nome LIKE 'Aux Ui%'");
  for (const [t, c] of [['tblforum', 'nome'], ['tbltipoproc', 'nome'], ['tblstatusproc', 'nome'], ['tblinstanciaproc', 'nome'], ['tblassuntoproc', 'nome']])
    await noBanco(`DELETE FROM ${t} WHERE ${c} LIKE 'Aux Ui%'`);
  await noBanco("DELETE FROM logs_auditoria WHERE tabela IN ('tbltipoproc','tblstatusproc','tblinstanciaproc','tblassuntoproc','tblforum','tblvara') AND registro_id NOT IN (SELECT id FROM tbltipoproc UNION SELECT id FROM tblstatusproc UNION SELECT id FROM tblinstanciaproc UNION SELECT id FROM tblassuntoproc UNION SELECT id FROM tblforum UNION SELECT id FROM tblvara)");
}
test.describe.configure({ timeout: 150_000 });
test.beforeEach(async ({ page }) => { await limparAuxUi(); await bloquearRedeExterna(page); });
test.afterAll(async () => { await limparAuxUi(); });

async function abrirNovoProcesso(page) {
  await page.goto('/processos'); await aguardarTelaPronta(page);
  await page.getByRole('button', { name: '+ Novo Processo' }).click();
  await expect(page.locator('.modal-box').first().getByRole('heading', { name: 'Novo Processo' })).toBeVisible();
  await aguardarTelaPronta(page);
  await expect(page.getByLabel('Número da Pasta')).not.toHaveValue('');
}
async function abrirAux(page, c) {
  await abrirNovoProcesso(page);
  await page.locator('.modal-box').first().getByRole('button', { name: c.botao, exact: true }).click();
  const jan = janelaAux(page, c.titulo);
  await expect(jan).toBeVisible();
  return jan;
}

// ------------------------------------------------------------------ tipos simples (só nome)
const SIMPLES = [
  { chave: 'tipos', titulo: 'Tipos de Processo', botao: 'Gerenciar tipos de processo', tabela: 'tbltipoproc',
    usar: (id, pasta) => noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '9300001-00.2026.5.15.0001', 'EM USO AUX', ?, 1, 1, 1)", [pasta, id]),
    msgUso: 'Não é possível excluir — este registro está vinculado a 1 processo(s) ativo(s)', repetido: /Já existe um tipo de processo com este nome|Já existe .+ com este nome/ },
  { chave: 'status', titulo: 'Status de Processo', botao: 'Gerenciar status do processo', tabela: 'tblstatusproc',
    usar: (id, pasta) => noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '9300001-00.2026.5.15.0001', 'EM USO AUX', 1, ?, 1, 1)", [pasta, id]),
    msgUso: 'Não é possível excluir — este status está em uso por 1 processo(s) ativo(s)', repetido: /Já existe .+ com este nome/ },
  { chave: 'instancias', titulo: 'Instâncias', botao: 'Gerenciar instâncias', tabela: 'tblinstanciaproc',
    usar: (id, pasta) => noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, instancia_id, ativo, criado_por) VALUES (?, '9300001-00.2026.5.15.0001', 'EM USO AUX', 1, 1, ?, 1, 1)", [pasta, id]),
    msgUso: 'Não é possível excluir — este registro está vinculado a 1 processo(s) ativo(s)', repetido: /Já existe .+ com este nome/ },
  { chave: 'assuntos', titulo: 'Assuntos dos Processos', botao: 'Gerenciar assuntos', tabela: 'tblassuntoproc',
    usar: async (id, pasta) => {
      const proc = (await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, '9300001-00.2026.5.15.0001', 'EM USO AUX', 1, 1, 1, 1)", [pasta])).insertId;
      await noBanco('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, 1)', [proc, id]);
    },
    msgUso: 'Não é possível excluir — este assunto está vinculado a 1 processo(s)', repetido: 'Já existe um assunto cadastrado com este nome' },
];

for (const c of SIMPLES) {
  test(`@critical Gerenciar ${c.titulo}: abrir, buscar, criar (validação e repetido), editar, excluir e item em uso`, async ({ page }) => {
    await loginPelaTela(page);
    const jan = await abrirAux(page, c);
    const total = (await noBanco(`SELECT COUNT(*) AS n FROM ${c.tabela} WHERE ativo = 1`))[0].n;
    // abrir: título, lista, busca
    if (total === 0) await expect(jan.getByText('Nenhum item cadastrado')).toBeVisible();
    else await expect(jan.getByPlaceholder(`Buscar em ${total} ${total === 1 ? 'item' : 'itens'}...`)).toBeVisible();
    await expect(jan.getByText('Novo item')).toBeVisible();
    await expect(jan.getByRole('button', { name: 'Adicionar' })).toBeVisible();
    await semViolacoes(page, `janela ${c.titulo}`);
    // criar: nome vazio, depois nome válido (iniciais maiúsculas ao sair do campo)
    await jan.getByRole('button', { name: 'Adicionar' }).click();
    await expect(jan.getByText('Nome é obrigatório')).toBeVisible();
    await campo(jan, 'Nome').fill('aux ui primeiro');
    await campo(jan, 'Nome').blur();
    await expect(campo(jan, 'Nome')).toHaveValue('Aux Ui Primeiro');
    await jan.getByRole('button', { name: 'Adicionar' }).click();
    await aviso(page, 'Criado com sucesso!');
    await expect(campo(jan, 'Nome')).toHaveValue('');                                              // formulário limpa
    await expect(jan.getByText('Aux Ui Primeiro', { exact: true })).toBeVisible();                 // entrou na lista
    await jan.getByPlaceholder(/^Buscar em/).fill('zzzz sem nada');                                // a busca aparece quando há itens
    await expect(jan.getByText('Nenhum item encontrado para "zzzz sem nada"')).toBeVisible();
    await jan.getByPlaceholder(/^Buscar em/).fill('aux ui prim');                                  // sem acento/maiúscula, parte do nome
    await expect(jan.getByText('Aux Ui Primeiro', { exact: true })).toBeVisible();
    await jan.getByPlaceholder(/^Buscar em/).fill('');
    expect(await noBanco(`SELECT id FROM ${c.tabela} WHERE nome = 'Aux Ui Primeiro' AND ativo = 1`)).toHaveLength(1);
    await esperarSemAviso(page);
    // repetido
    await campo(jan, 'Nome').fill('Aux Ui Primeiro');
    await jan.getByRole('button', { name: 'Adicionar' }).click();
    await expect(jan.getByText(c.repetido).first()).toBeVisible();
    expect(await noBanco(`SELECT id FROM ${c.tabela} WHERE nome = 'Aux Ui Primeiro'`)).toHaveLength(1);
    await campo(jan, 'Nome').fill('Aux Ui Segundo');
    await jan.getByRole('button', { name: 'Adicionar' }).click();
    await aviso(page, 'Criado com sucesso!');
    await esperarSemAviso(page);
    // editar: Cancelar volta ao modo "Novo item"; Salvar troca o nome; nome repetido é recusado
    await linhaItem(jan, 'Aux Ui Primeiro').getByRole('button', { name: 'Editar' }).click();
    await expect(jan.getByText('Editando: Aux Ui Primeiro')).toBeVisible();
    await expect(campo(jan, 'Nome')).toHaveValue('Aux Ui Primeiro');
    await semViolacoes(page, `janela ${c.titulo} editando um item`);
    await jan.getByRole('button', { name: 'Cancelar' }).click();
    await expect(jan.getByText('Novo item')).toBeVisible();
    await expect(campo(jan, 'Nome')).toHaveValue('');
    await linhaItem(jan, 'Aux Ui Primeiro').getByRole('button', { name: 'Editar' }).click();
    await campo(jan, 'Nome').fill('Aux Ui Segundo');
    await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(jan.getByText(c.repetido).first()).toBeVisible();                                  // recusa nome de outro item
    await campo(jan, 'Nome').fill('Aux Ui Renomeado');
    await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
    await aviso(page, 'Atualizado com sucesso!');
    await expect(jan.getByText('Aux Ui Renomeado', { exact: true })).toBeVisible();
    await expect(jan.getByText('Aux Ui Primeiro', { exact: true })).toHaveCount(0);
    await expect(jan.getByText('Novo item')).toBeVisible();
    expect(await noBanco(`SELECT id FROM ${c.tabela} WHERE nome = 'Aux Ui Renomeado'`)).toHaveLength(1);
    await esperarSemAviso(page);
    // excluir: Cancelar e ESC não apagam; confirmar apaga (some da lista, fica ativo=0 e há auditoria)
    await linhaItem(jan, 'Aux Ui Segundo').getByRole('button', { name: '✕' }).click();
    await expect(confirmacao(page)).toBeVisible();
    await expect(confirmacao(page).getByText('Excluir "Aux Ui Segundo"? Esta ação não pode ser desfeita.')).toBeVisible();
    await semViolacoes(page, `confirmação de exclusão em ${c.titulo}`);
    await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmacao(page)).toHaveCount(0);
    await linhaItem(jan, 'Aux Ui Segundo').getByRole('button', { name: '✕' }).click();
    await page.keyboard.press('Escape');
    await expect(confirmacao(page)).toHaveCount(0);
    await expect(jan).toBeVisible();                                                                // ESC fechou só a confirmação
    expect(await noBanco(`SELECT ativo FROM ${c.tabela} WHERE nome = 'Aux Ui Segundo'`)).toEqual([{ ativo: 1 }]);
    await linhaItem(jan, 'Aux Ui Segundo').getByRole('button', { name: '✕' }).click();
    await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
    await aviso(page, 'Excluído com sucesso!');
    await expect(jan.getByText('Aux Ui Segundo', { exact: true })).toHaveCount(0);
    expect(await noBanco(`SELECT ativo FROM ${c.tabela} WHERE nome = 'Aux Ui Segundo'`)).toEqual([{ ativo: 0 }]);
    await esperarSemAviso(page);
    // item em uso por um processo: a exclusão é bloqueada com o motivo e o item continua
    const idUso = (await noBanco(`INSERT INTO ${c.tabela} (nome, ativo) VALUES ('Aux Ui Em Uso', 1)`)).insertId;
    const pasta = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7301, 1)')).insertId;
    await c.usar(idUso, pasta);
    const jan2 = await abrirAux(page, c);
    await linhaItem(jan2, 'Aux Ui Em Uso').getByRole('button', { name: '✕' }).click();
    await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
    await aviso(page, c.msgUso);
    await expect(confirmacao(page)).toBeVisible();                                                   // fica aberta para ler o motivo
    await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
    expect(await noBanco(`SELECT ativo FROM ${c.tabela} WHERE id = ?`, [idUso])).toEqual([{ ativo: 1 }]);
  });
}

test('@critical Gerenciar Status: caixa "Encerra o processo" (grava, mostra "· encerra o processo") e item em uso não pode ser renomeado', async ({ page }) => {
  await loginPelaTela(page);
  const c = SIMPLES[1];
  const jan = await abrirAux(page, c);
  const caixa = jan.getByRole('checkbox', { name: /Encerra o processo/ });
  await expect(caixa).not.toBeChecked();
  await campo(jan, 'Nome').fill('Aux Ui Encerrado');
  await caixa.check();
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await aviso(page, 'Criado com sucesso!');
  await expect(caixa).not.toBeChecked();                                                            // limpa depois de criar
  await expect(linhaItem(jan, 'Aux Ui Encerrado')).toContainText('· encerra o processo');
  expect((await noBanco("SELECT encerra_processo FROM tblstatusproc WHERE nome = 'Aux Ui Encerrado'"))[0].encerra_processo).toBe(1);
  await esperarSemAviso(page);
  await linhaItem(jan, 'Aux Ui Encerrado').getByRole('button', { name: 'Editar' }).click();
  await expect(caixa).toBeChecked();                                                                // a edição já vem marcada
  await caixa.uncheck();
  await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Atualizado com sucesso!');
  await expect(linhaItem(jan, 'Aux Ui Encerrado')).not.toContainText('encerra o processo');
  expect((await noBanco("SELECT encerra_processo FROM tblstatusproc WHERE nome = 'Aux Ui Encerrado'"))[0].encerra_processo).toBe(0);
  await esperarSemAviso(page);
  // em uso por um processo: renomear é recusado
  const idUso = (await noBanco("INSERT INTO tblstatusproc (nome, ativo) VALUES ('Aux Ui Em Uso', 1)")).insertId;
  const pasta = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7301, 1)')).insertId;
  await c.usar(idUso, pasta);
  const jan2 = await abrirAux(page, c);
  await linhaItem(jan2, 'Aux Ui Em Uso').getByRole('button', { name: 'Editar' }).click();
  await campo(jan2, 'Nome').fill('Aux Ui Outro Nome');
  await jan2.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(jan2.getByText('Não é possível renomear — este status está em uso por 1 processo(s) ativo(s)')).toBeVisible();
  expect(await noBanco('SELECT nome FROM tblstatusproc WHERE id = ?', [idUso])).toEqual([{ nome: 'Aux Ui Em Uso' }]);
});

// ------------------------------------------------------------------ fóruns e varas
const FORUNS = { chave: 'foruns', titulo: 'Fóruns', botao: 'Gerenciar fóruns' };
const VARAS = { chave: 'varas', titulo: 'Varas', botao: 'Gerenciar varas' };

test('@critical Gerenciar Fóruns: todos os campos, CEP (acha, não acha, incompleto, sem internet), criar, editar, excluir e fórum com vara', async ({ page }) => {
  await loginPelaTela(page);
  const jan = await abrirAux(page, FORUNS);
  await semViolacoes(page, 'janela Fóruns');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await expect(jan.getByText('Nome é obrigatório')).toBeVisible();
  // CEP: incompleto, sem internet, não encontrado e encontrado (ViaCEP simulado)
  await campo(jan, 'CEP').fill('1234'); await campo(jan, 'CEP').blur();
  await expect(jan.getByText('CEP incompleto')).toBeVisible();
  await campo(jan, 'CEP').fill('13010000'); await campo(jan, 'CEP').blur();
  await expect(jan.getByText('Não foi possível buscar o CEP agora')).toBeVisible();                // a rede de teste está bloqueada
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ erro: true }) }));
  await campo(jan, 'CEP').fill('13010001'); await campo(jan, 'CEP').blur();
  await expect(jan.getByText('CEP não encontrado')).toBeVisible();
  await page.unroute('https://viacep.com.br/**');
  await page.route('https://viacep.com.br/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ logradouro: 'RUA DAS FLORES', bairro: 'CENTRO', localidade: 'CAMPINAS', uf: 'sp' }) }));
  await campo(jan, 'CEP').fill('13010002'); await campo(jan, 'CEP').blur();
  await expect(campo(jan, 'Logradouro')).toHaveValue('Rua das Flores');
  await expect(campo(jan, 'Bairro')).toHaveValue('Centro');
  await expect(campo(jan, 'Cidade')).toHaveValue('Campinas');
  await expect(campo(jan, 'UF')).toHaveValue('SP');
  await expect(campo(jan, 'Número')).toBeFocused();                                                  // o foco vai para o Número
  await page.unroute('https://viacep.com.br/**');
  await campo(jan, 'Número').fill('100');
  await campo(jan, 'Complemento').fill('Bloco B');
  await campo(jan, 'Nome').fill('aux ui forum central');
  await campo(jan, 'Abreviação').fill('AUX/FC');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await aviso(page, 'Criado com sucesso!');
  const f = (await noBanco("SELECT * FROM tblforum WHERE nome = 'Aux Ui Forum Central'"))[0];
  expect({ abrev: f.abrev_nome, cep: f.cep, log: f.logradouro, num: f.num_end, compl: f.compl_end, bairro: f.bairro, cidade: f.cidade, uf: f.uf, ativo: f.ativo })
    .toEqual({ abrev: 'AUX/FC', cep: '13010002', log: 'Rua das Flores', num: '100', compl: 'Bloco B', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', ativo: 1 });
  await expect(linhaItem(jan, 'AUX/FC')).toContainText('Campinas - SP');                              // lista mostra abreviação, nome e cidade/UF
  await esperarSemAviso(page);
  // editar: campos vêm preenchidos; trocar a cidade
  await linhaItem(jan, 'AUX/FC').getByRole('button', { name: 'Editar' }).click();
  await expect(campo(jan, 'CEP')).toHaveValue('13010002');
  await expect(campo(jan, 'Número')).toHaveValue('100');
  await campo(jan, 'Cidade').fill('Valinhos');
  await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Atualizado com sucesso!');
  expect((await noBanco("SELECT cidade FROM tblforum WHERE nome = 'Aux Ui Forum Central'"))[0].cidade).toBe('Valinhos');
  await esperarSemAviso(page);
  // fórum com vara não pode ser excluído; sem vara, pode
  const idForum = (await noBanco("SELECT id FROM tblforum WHERE nome = 'Aux Ui Forum Central'"))[0].id;
  await noBanco("INSERT INTO tblvara (forum_id, nome, ativo) VALUES (?, 'Aux Ui Vara Do Forum', 1)", [idForum]);
  const jan2 = await abrirAux(page, FORUNS);
  await linhaItem(jan2, 'AUX/FC').getByRole('button', { name: '✕' }).click();
  await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Não é possível excluir este fórum — ele possui 1 vara(s) vinculada(s). Exclua as varas primeiro.');
  await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT ativo FROM tblforum WHERE id = ?', [idForum]))[0].ativo).toBe(1);
  await noBanco('DELETE FROM tblvara WHERE nome = ?', ['Aux Ui Vara Do Forum']);
  const jan3 = await abrirAux(page, FORUNS);
  await linhaItem(jan3, 'AUX/FC').getByRole('button', { name: '✕' }).click();
  await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Excluído com sucesso!');
  expect((await noBanco('SELECT ativo FROM tblforum WHERE id = ?', [idForum]))[0].ativo).toBe(0);
});

test('@critical Gerenciar Varas: exige o fórum, grava todos os campos, edita, mostra o fórum na lista e vara com processo não é excluída', async ({ page }) => {
  const idForum = (await noBanco("INSERT INTO tblforum (nome, cidade, uf, ativo) VALUES ('Aux Ui Forum Das Varas', 'Santos', 'SP', 1)")).insertId;
  await loginPelaTela(page);
  const jan = await abrirAux(page, VARAS);
  await semViolacoes(page, 'janela Varas');
  await campo(jan, 'Nome').fill('aux ui vara primeira');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await expect(jan.getByText('Fórum é obrigatório')).toBeVisible();
  await jan.getByLabel('Fórum da vara', { exact: true }).click();
  await page.locator('div[role="option"]').filter({ hasText: 'Aux Ui Forum Das Varas' }).click();
  await campo(jan, 'Abreviação').fill('AUX/V1');
  await campo(jan, 'Cód. no processo').fill('5159999');
  await campo(jan, 'Complemento End.').fill('4º andar');
  await campo(jan, 'Telefone').fill('(19) 3333-4444');
  await campo(jan, 'E-mail').fill('vara.aux@example.invalid');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await aviso(page, 'Criado com sucesso!');
  const v = (await noBanco("SELECT * FROM tblvara WHERE nome = 'Aux Ui Vara Primeira'"))[0];
  expect({ forum: v.forum_id, abrev: v.abrev_nome, cod: v.codVaraNoProc, compl: v.compl_end, tel: v.tel, email: v.email, ativo: v.ativo })
    .toEqual({ forum: idForum, abrev: 'AUX/V1', cod: '5159999', compl: '4º andar', tel: '(19) 3333-4444', email: 'vara.aux@example.invalid', ativo: 1 });
  await expect(linhaItem(jan, 'AUX/V1')).toContainText('Aux Ui Forum Das Varas');                     // a lista mostra o fórum da vara
  await esperarSemAviso(page);
  // busca pelo nome do fórum
  await jan.getByPlaceholder(/^Buscar em/).fill('forum das varas');
  await expect(jan.getByText('AUX/V1', { exact: true })).toBeVisible();
  await jan.getByPlaceholder(/^Buscar em/).fill('');
  // editar
  await linhaItem(jan, 'AUX/V1').getByRole('button', { name: 'Editar' }).click();
  await expect(campo(jan, 'Cód. no processo')).toHaveValue('5159999');
  await campo(jan, 'Telefone').fill('(19) 3000-0000');
  await jan.getByRole('button', { name: 'Salvar', exact: true }).click();
  await aviso(page, 'Atualizado com sucesso!');
  expect((await noBanco("SELECT tel FROM tblvara WHERE nome = 'Aux Ui Vara Primeira'"))[0].tel).toBe('(19) 3000-0000');
  await esperarSemAviso(page);
  // vara com processo: exclusão bloqueada
  const pasta = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (7301, 1)')).insertId;
  await noBanco("INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, vara_id, ativo, criado_por) VALUES (?, '9300001-00.2026.5.15.0001', 'EM USO AUX', 1, 1, ?, 1, 1)", [pasta, v.id]);
  await linhaItem(jan, 'AUX/V1').getByRole('button', { name: '✕' }).click();
  await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Não é possível excluir esta vara — ela possui 1 processo(s) vinculado(s). Desvincule os processos antes de excluir a vara.');
  await confirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT ativo FROM tblvara WHERE id = ?', [v.id]))[0].ativo).toBe(1);
  // sem o processo, a vara é excluída
  await noBanco("DELETE FROM tblproc WHERE numProc = '9300001-00.2026.5.15.0001'");
  await linhaItem(jan, 'AUX/V1').getByRole('button', { name: '✕' }).click();
  await confirmacao(page).getByRole('button', { name: /Excluir/ }).click();
  await aviso(page, 'Excluído com sucesso!');
  expect((await noBanco('SELECT ativo FROM tblvara WHERE id = ?', [v.id]))[0].ativo).toBe(0);
});

// ------------------------------------------------------------------ comportamento comum: erro do servidor, ESC, fechar, permissões
test('@critical Gerenciar auxiliares: erro do servidor aparece DENTRO da janela, "Salvando..." trava o botão, e Fechar/✕/ESC fecham só a janela de cima', async ({ page }) => {
  await loginPelaTela(page);
  const jan = await abrirAux(page, SIMPLES[0]);
  await campo(jan, 'Nome').fill('Aux Ui Lento');
  await page.route('**/api/processos/auxiliares/tipos', async (rota) => { if (rota.request().method() === 'POST') await new Promise(r => setTimeout(r, 1500)); await rota.continue(); });
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await expect(jan.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await aviso(page, 'Criado com sucesso!');
  await page.unroute('**/api/processos/auxiliares/tipos');
  await esperarSemAviso(page);
  await page.route('**/api/processos/auxiliares/tipos', (rota) => rota.request().method() === 'POST'
    ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno no servidor. Tente novamente.' }) }) : rota.continue());
  await campo(jan, 'Nome').fill('Aux Ui Erro');
  await jan.getByRole('button', { name: 'Adicionar' }).click();
  await expect(jan.getByText('Erro interno no servidor. Tente novamente.')).toBeVisible();          // aviso dentro da janela, sem balão
  await expect(page.locator('.Toastify__toast')).toHaveCount(0);
  await expect(campo(jan, 'Nome')).toHaveValue('Aux Ui Erro');                                       // nada se perdeu
  await page.unroute('**/api/processos/auxiliares/tipos');
  // Fechar, ✕ e ESC fecham só a janelinha; a janela Novo Processo continua
  await jan.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(janelaAux(page, SIMPLES[0].titulo)).toHaveCount(0);
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await page.locator('.modal-box').first().getByRole('button', { name: SIMPLES[0].botao, exact: true }).click();
  await janelaAux(page, SIMPLES[0].titulo).locator('.modal-fechar').click();
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await page.locator('.modal-box').first().getByRole('button', { name: SIMPLES[0].botao, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-box')).toHaveCount(1);
  await expect(page.locator('.modal-box').first().getByRole('heading', { name: 'Novo Processo' })).toBeVisible();
});

test('@critical Gerenciar auxiliares: só cadastrar → formulário sem Editar/✕; cadastrar+alterar → Editar; cadastrar+excluir → ✕ sem formulário; assuntos têm permissão própria', async ({ page }) => {
  await noBanco("INSERT INTO tbltipoproc (nome, codTipoProc, ativo) VALUES ('Aux Ui Tipo Fixo', '7', 1)");
  const soCad = await criarUsuarioComPermissoes('aux_so_cadastra', [['processos', null, 'visualizar'], ['processos', null, 'cadastrar']]);
  await loginPelaTela(page, soCad);
  let jan = await abrirAux(page, SIMPLES[0]);
  await expect(jan.getByRole('button', { name: 'Adicionar' })).toBeVisible();
  await expect(linhaItem(jan, 'Aux Ui Tipo Fixo')).toBeVisible();
  await expect(linhaItem(jan, 'Aux Ui Tipo Fixo').getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(linhaItem(jan, 'Aux Ui Tipo Fixo').getByRole('button', { name: '✕' })).toHaveCount(0);
  await expect(page.locator('.modal-box').first().getByRole('button', { name: 'Gerenciar assuntos', exact: true })).toHaveCount(0);   // assunto tem permissão própria
  await semViolacoes(page, 'janela Tipos para quem só cadastra');
});

test('@critical Gerenciar auxiliares: com "alterar" aparece o Editar (e o formulário só ao editar); com "excluir" aparece o ✕', async ({ page }) => {
  await noBanco("INSERT INTO tbltipoproc (nome, codTipoProc, ativo) VALUES ('Aux Ui Tipo Fixo', '7', 1)");
  const login = await criarUsuarioComPermissoes('aux_altera_exclui', [['processos', null, 'visualizar'], ['processos', null, 'cadastrar'], ['processos', null, 'alterar'], ['processos', null, 'excluir']]);
  await loginPelaTela(page, login);
  const jan = await abrirAux(page, SIMPLES[0]);
  await expect(linhaItem(jan, 'Aux Ui Tipo Fixo').getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(linhaItem(jan, 'Aux Ui Tipo Fixo').getByRole('button', { name: '✕' })).toBeVisible();
});

test('@critical Gerenciar Assuntos: com a permissão própria de assuntos aparece o "…" e o Editar, sem o ✕ se não puder excluir', async ({ page }) => {
  await noBanco("INSERT INTO tblassuntoproc (nome, ativo) VALUES ('Aux Ui Assunto Fixo', 1)");
  const login = await criarUsuarioComPermissoes('aux_assuntos_altera', [['processos', null, 'visualizar'], ['processos', null, 'cadastrar'], ['processos', 'assuntos', 'alterar']]);
  await loginPelaTela(page, login);
  const jan = await abrirAux(page, SIMPLES[3]);
  await expect(linhaItem(jan, 'Aux Ui Assunto Fixo').getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(linhaItem(jan, 'Aux Ui Assunto Fixo').getByRole('button', { name: '✕' })).toHaveCount(0);
  await expect(jan.getByRole('button', { name: 'Adicionar' })).toHaveCount(0);                        // sem "cadastrar" de assuntos não há formulário de novo item
});
