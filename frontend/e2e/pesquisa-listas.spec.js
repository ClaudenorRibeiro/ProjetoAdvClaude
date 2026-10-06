import { test, expect } from '@playwright/test';
import { aguardarTelaPronta, bloquearRedeExterna, loginPelaTela, violacoesGraves } from './helpers.js';
import { createRequire } from 'node:module';

// Teste de TELA do campo "Pesquisar" das listas de Audiências, Perícias e Prazos (componente único CampoPesquisa + busca por frase no servidor):
// a frase inteira vale como um bloco, sem diferenciar acento e maiúscula, procura nas partes do processo, no título, no processo, na pasta e
// nos campos de cada tela; "Limpar pesquisa", "Limpar filtros" (Audiências e Prazos), sem resultado, junto com os outros filtros, acessibilidade.
// Em Prazos o número do processo digitado só com dígitos continua achando o gravado com máscara. Os dados nascem e morrem aqui (marca "Buscaze").
const requisitar = createRequire(import.meta.url);
const { conectarBancoTeste } = requisitar('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
const MARCA = 'Buscaze';
const PASTAS = [9701, 9702];
const CNJ_A = '9876543-21.2026.5.15.0777';

let d;
async function prepararDados() {
  const x = {};
  const pasta = async (n) => (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [n])).insertId;
  const proc = async (p, numero, titulo) => (await noBanco(
    'INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, tipo_id, status_id, ativo, criado_por) VALUES (?, ?, ?, 1, 1, 1, 1)', [p, numero, titulo])).insertId;
  x.procA = await proc(await pasta(PASTAS[0]), CNJ_A, `${MARCA} Alfa contra Beta`);
  x.procB = await proc(await pasta(PASTAS[1]), '9876544-22.2026.5.15.0778', `${MARCA} Gama contra Delta`);
  const pf = async (nome) => (await noBanco('INSERT INTO pessoas_fisicas (nome) VALUES (?)', [nome])).insertId;
  const pj = async (razao, fantasia) => (await noBanco('INSERT INTO pessoas_juridicas (razao_social, nome_fantasia) VALUES (?, ?)', [razao, fantasia])).insertId;
  const jose = await pf(`José ${MARCA} Autor`); const maria = await pf(`Maria ${MARCA} Autora`);
  const owens = await pj(`Owens ${MARCA} Ltda`, `Vidros ${MARCA}`); const zeta = await pj(`Zeta ${MARCA} S/A`, `Zeta Bank ${MARCA}`);
  await noBanco("INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'fisica', ?), (?, 'fisica', ?)", [x.procA, jose, x.procB, maria]);
  await noBanco("INSERT INTO tbltituloprocreu (proc_id, tipo_pessoa, pessoa_id) VALUES (?, 'juridica', ?), (?, 'juridica', ?)", [x.procA, owens, x.procB, zeta]);

  x.forum = (await noBanco('INSERT INTO tblforum (nome) VALUES (?)', [`Fórum ${MARCA}`])).insertId;
  x.vara = (await noBanco('INSERT INTO tblvara (forum_id, nome) VALUES (?, ?)', [x.forum, `3ª Vara ${MARCA}`])).insertId;
  x.tipoAud1 = (await noBanco('INSERT INTO tipo_audiencia (nome) VALUES (?)', [`Una ${MARCA}`])).insertId;
  x.tipoAud2 = (await noBanco('INSERT INTO tipo_audiencia (nome) VALUES (?)', [`Julgamento ${MARCA}`])).insertId;
  const aud = async (proc, tipo, modalidade, dia, status, vara) => (await noBanco(
    'INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, vara_id, status, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [proc, tipo, dia, '10:00:00', modalidade, vara, status])).insertId;
  await aud(x.procA, x.tipoAud1, 'virtual', '2099-03-02', 'agendada', null);
  await aud(x.procB, x.tipoAud2, 'presencial', '2099-03-03', 'agendada', x.vara);
  await aud(x.procA, x.tipoAud2, 'presencial', '2099-03-04', 'cancelada', null);

  x.tipoPer1 = (await noBanco('INSERT INTO tipo_pericia (nome, ativo) VALUES (?, 1)', [`Médica ${MARCA}`])).insertId;
  x.tipoPer2 = (await noBanco('INSERT INTO tipo_pericia (nome, ativo) VALUES (?, 1)', [`Engenharia ${MARCA}`])).insertId;
  x.perito = await pf(`Dr. Peritus ${MARCA}`);
  const per = async (proc, tipo, local, perito, status) => (await noBanco(
    "INSERT INTO pericia (processo_id, tipo_pericia_id, data, hora, local, perito_tipo, perito_id, status, criado_por) VALUES (?, ?, '2099-03-02', '10:00:00', ?, ?, ?, ?, 1)",
    [proc, tipo, local, perito ? 'fisica' : null, perito, status])).insertId;
  await per(x.procA, x.tipoPer1, `Clínica São José ${MARCA}`, x.perito, 'agendada');
  await per(x.procB, x.tipoPer2, `Canteiro ${MARCA} 100% concluído`, null, 'agendada');
  await per(x.procA, x.tipoPer2, `Escritório ${MARCA}`, null, 'cancelada');

  x.tipoPrazo = (await noBanco('INSERT INTO tipo_prazo (nome) VALUES (?)', [`Recursal ${MARCA}`])).insertId;
  x.sub1 = (await noBanco('INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, ?)', [x.tipoPrazo, `Embargos ${MARCA}`])).insertId;
  x.sub2 = (await noBanco('INSERT INTO prazo_subtipo (tipo_prazo_id, nome) VALUES (?, ?)', [x.tipoPrazo, `Contestação ${MARCA}`])).insertId;
  const prazo = async (proc, sub, descricao, dia) => (await noBanco(
    "INSERT INTO prazos_processo (processo_id, subtipo_id, descricao, data_inicio, data_vencimento, criado_por) VALUES (?, ?, ?, '2099-03-01', ?, 1)", [proc, sub, descricao, dia])).insertId;
  await prazo(x.procA, x.sub1, `Apresentar recurso ordinário ${MARCA}`, '2099-04-01');
  await prazo(x.procB, x.sub2, `Preparar defesa com 50% de desconto ${MARCA}`, '2099-04-02');
  await prazo(x.procA, x.sub2, `Manifestação sobre laudo ${MARCA}`, '2099-04-03');
  return x;
}
async function limparDados() {
  const procs = (await noBanco('SELECT p.id FROM tblproc p JOIN tblpasta pa ON pa.id = p.pasta_id WHERE pa.numPasta IN (?, ?)', PASTAS)).map(r => r.id);
  if (procs.length) {
    const m = procs.map(() => '?').join(',');
    for (const t of ['audiencia', 'pericia', 'prazos_processo']) await noBanco(`DELETE FROM ${t} WHERE processo_id IN (${m})`, procs);
    for (const t of ['tbltituloprocautor', 'tbltituloprocreu']) await noBanco(`DELETE FROM ${t} WHERE proc_id IN (${m})`, procs);
    await noBanco(`DELETE FROM tblproc WHERE id IN (${m})`, procs);
  }
  await noBanco('DELETE FROM tblpasta WHERE numPasta IN (?, ?)', PASTAS);
  await noBanco(`DELETE FROM pessoas_fisicas WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM pessoas_juridicas WHERE razao_social LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM tblvara WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM tblforum WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM tipo_audiencia WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM tipo_pericia WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM prazo_subtipo WHERE nome LIKE '%${MARCA}%'`);
  await noBanco(`DELETE FROM tipo_prazo WHERE nome LIKE '%${MARCA}%'`);
}

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => { await limparDados(); d = await prepararDados(); });
test.afterAll(async () => { await limparDados(); });
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

const TELAS = {
  audiencias: { rota: '/audiencias', unidade: 'audiência(s)', vazio: 'Nenhuma audiência encontrada' },
  pericias: { rota: '/pericias', unidade: 'perícia(s)', vazio: 'Nenhuma perícia encontrada' },
  prazos: { rota: '/prazos', unidade: 'prazo(s)', vazio: 'Nenhum prazo encontrado' },
};
const campo = (page) => page.getByLabel('Pesquisar', { exact: true });
const contador = (page, tela) => page.getByText(new RegExp(`^\\d+ ${tela.unidade.replace(/[()]/g, '\\$&')}$`));
async function abrir(page, tela) {
  await loginPelaTela(page);
  await page.goto(tela.rota); await aguardarTelaPronta(page);
  await expect(campo(page)).toBeVisible();
}
// Digita a frase, espera a lista responder (a consulta só sai 350 ms depois de parar de digitar) e confere quantas linhas vieram.
async function pesquisar(page, tela, frase, esperadas) {
  await campo(page).fill(frase);
  await expect(contador(page, tela)).toHaveText(`${esperadas} ${tela.unidade}`);
  if (esperadas === 0) await expect(page.getByText(tela.vazio)).toBeVisible();
  else await expect(page.locator('tbody tr')).toHaveCount(esperadas);
}
async function semViolacoes(page, descricao) {
  const v = await violacoesGraves(page);
  expect.soft(v, `${descricao}: ${JSON.stringify(v)}`).toEqual([]);
}

test('@critical Audiências — Pesquisar: partes, título, processo, pasta, tipo, modalidade, vara e fórum; sem acento e maiúscula; frase inteira; limpar; sem resultado', async ({ page }) => {
  const t = TELAS.audiencias;
  await abrir(page, t);
  await pesquisar(page, t, `José ${MARCA}`, 2);                    // autor do processo A (2 audiências)
  await pesquisar(page, t, `JOSE ${MARCA}`, 2);                    // sem acento e em maiúsculas
  await pesquisar(page, t, `Owens ${MARCA}`, 2);                   // réu empresa
  await pesquisar(page, t, `vidros ${MARCA}`, 2);                  // nome fantasia
  await pesquisar(page, t, `Maria ${MARCA}`, 1);
  await pesquisar(page, t, `Una ${MARCA}`, 1);                     // tipo da audiência
  await pesquisar(page, t, `Julgamento ${MARCA}`, 2);
  await pesquisar(page, t, `${MARCA} Alfa contra`, 2);             // título
  await pesquisar(page, t, `${PASTAS[1]}`, 1);                     // número da pasta
  await pesquisar(page, t, `3ª Vara ${MARCA}`, 1);                 // vara
  await pesquisar(page, t, `forum ${MARCA}`, 1);                   // fórum, sem acento
  await pesquisar(page, t, `Autor ${MARCA}`, 0);                   // a frase vale INTEIRA e na ordem: "Autor Buscaze" não existe (só "José Buscaze Autor")
  await pesquisar(page, t, `${MARCA} José`, 0);
  await pesquisar(page, t, 'xyz inexistente', 0);
  await semViolacoes(page, 'Audiências com a pesquisa sem resultado');
  await pesquisar(page, t, `José ${MARCA}`, 2);
  await semViolacoes(page, 'Audiências com a pesquisa ligada');
  // junto com outro filtro: só as agendadas
  await page.getByLabel('Status', { exact: true }).selectOption('agendada');
  await expect(contador(page, t)).toHaveText(`1 ${t.unidade}`);
  // "Limpar filtros" também apaga o texto da pesquisa
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(campo(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Limpar pesquisa' })).toHaveCount(0);
  await expect(contador(page, t)).not.toHaveText(`1 ${t.unidade}`);
  // "Limpar pesquisa" volta a lista toda
  const todas = await contador(page, t).innerText();
  await pesquisar(page, t, `Una ${MARCA}`, 1);
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(campo(page)).toHaveValue('');
  await expect(contador(page, t)).toHaveText(todas);
});

test('@critical Audiências — Pesquisar: modalidade "virtual" e "presencial" e símbolos "%" e "_" como texto', async ({ page }) => {
  const t = TELAS.audiencias;
  await abrir(page, t);
  await pesquisar(page, t, `Una ${MARCA}`, 1);
  await campo(page).fill('virtual');
  await expect(page.locator('tbody tr').filter({ hasText: `${MARCA} Alfa contra` }).first()).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'Presencial' }).filter({ hasText: `${MARCA} Gama` })).toHaveCount(0);
  await campo(page).fill('%');                                     // "%" não é "qualquer coisa"
  await expect(page.locator('tbody tr').filter({ hasText: MARCA })).toHaveCount(0);
});

test('@critical Perícias — Pesquisar: partes, título, pasta, tipo, perito e local; sem acento; limpar; sem resultado; "%" como texto', async ({ page }) => {
  const t = TELAS.pericias;
  await abrir(page, t);
  await pesquisar(page, t, `José ${MARCA}`, 2);                    // autor do processo A (2 perícias)
  await pesquisar(page, t, `jose ${MARCA}`, 2);
  await pesquisar(page, t, `Zeta ${MARCA}`, 1);                    // réu do processo B
  await pesquisar(page, t, `zeta bank ${MARCA}`, 1);               // nome fantasia
  await pesquisar(page, t, `${MARCA} Gama`, 1);                    // título
  await pesquisar(page, t, `${PASTAS[0]}`, 2);                     // pasta
  await pesquisar(page, t, `medica ${MARCA}`, 1);                  // tipo, sem acento
  await pesquisar(page, t, `Engenharia ${MARCA}`, 2);
  await pesquisar(page, t, `Peritus ${MARCA}`, 1);                 // perito
  await pesquisar(page, t, `Clínica São José ${MARCA}`, 1);        // local
  await pesquisar(page, t, `clinica sao jose ${MARCA}`, 1);        // local, sem acento
  await pesquisar(page, t, `100% concluído`, 1);                   // "%" é texto
  await pesquisar(page, t, `Autor ${MARCA}`, 0);                   // frase na ordem errada
  await pesquisar(page, t, 'xyz inexistente', 0);
  await semViolacoes(page, 'Perícias com a pesquisa sem resultado');
  await pesquisar(page, t, `Engenharia ${MARCA}`, 2);
  await semViolacoes(page, 'Perícias com a pesquisa ligada');
  await page.getByLabel('Status', { exact: true }).selectOption('cancelada');   // junto com o filtro de status
  await expect(contador(page, t)).toHaveText(`1 ${t.unidade}`);
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await expect(contador(page, t)).toHaveText(`2 ${t.unidade}`);          // sem o filtro de status, voltam as 2 de Engenharia
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(campo(page)).toHaveValue('');
  await expect(contador(page, t)).not.toHaveText(`2 ${t.unidade}`);
});

test('@critical Prazos — Pesquisar: partes, título, pasta, descrição, tipo e subtipo; número do processo com e sem máscara; sem acento; limpar; "%" como texto', async ({ page }) => {
  const t = TELAS.prazos;
  await abrir(page, t);
  await pesquisar(page, t, `José ${MARCA}`, 2);                    // autor do processo A
  await pesquisar(page, t, `JOSE ${MARCA}`, 2);
  await pesquisar(page, t, `Owens ${MARCA}`, 2);
  await pesquisar(page, t, `${MARCA} Gama`, 1);                    // título
  await pesquisar(page, t, `${PASTAS[1]}`, 1);                     // pasta
  await pesquisar(page, t, `recurso ordinario`, 1);                // descrição, sem acento
  await pesquisar(page, t, `Embargos ${MARCA}`, 1);                // subtipo
  await pesquisar(page, t, `Recursal ${MARCA}`, 3);                // tipo do prazo
  await pesquisar(page, t, `50% de desconto`, 1);                  // "%" é texto
  await pesquisar(page, t, CNJ_A, 2);                              // número do processo como gravado
  await pesquisar(page, t, CNJ_A.replace(/\D/g, ''), 2);           // só dígitos: continua achando o gravado com máscara (como o campo antigo)
  await pesquisar(page, t, '9876543-21', 2);
  await pesquisar(page, t, `Autor ${MARCA}`, 0);
  await pesquisar(page, t, 'xyz inexistente', 0);
  await semViolacoes(page, 'Prazos com a pesquisa sem resultado');
  await pesquisar(page, t, `José ${MARCA}`, 2);
  await semViolacoes(page, 'Prazos com a pesquisa ligada');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();   // "Limpar filtros" apaga também o texto
  await expect(campo(page)).toHaveValue('');
  await pesquisar(page, t, `Embargos ${MARCA}`, 1);
  await page.getByRole('button', { name: 'Limpar pesquisa' }).click();
  await expect(campo(page)).toHaveValue('');
  await expect(contador(page, t)).not.toHaveText(`1 ${t.unidade}`);
});

test('@critical Pesquisar: erro do servidor mostra o aviso e a tela não quebra; ao voltar o servidor, a pesquisa funciona', async ({ page }) => {
  const t = TELAS.audiencias;
  await abrir(page, t);
  let falhar = true;
  await page.route('**/api/audiencias?**', async (rota) => {
    if (falhar && rota.request().url().includes('busca=')) await rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, mensagem: 'Erro interno' }) });
    else await rota.continue();
  });
  await campo(page).fill(`Una ${MARCA}`);
  await expect(page.getByText('Erro ao carregar audiências')).toBeVisible();
  await expect(campo(page)).toHaveValue(`Una ${MARCA}`);           // o que foi digitado não se perde
  falhar = false;
  await campo(page).fill(`Julgamento ${MARCA}`);
  await expect(contador(page, t)).toHaveText(`2 ${t.unidade}`);
});
