import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { abrirMenuAcoes, aguardarTelaPronta, bloquearRedeExterna, criarAudiencia, criarUsuarioComPermissoes, loginPelaTela, violacoesGraves } from './helpers';

// Tela de DOCUMENTOS (Modelos de documento, CAIXA ALTA, catálogos, histórico, modelos de e-mail do perito) e a janela "Gerar documento".
// SEM S3 (decisão do usuário: a S3 não participa da bateria): os modelos entram direto no banco de teste, com um nome de arquivo
// de mentira; os testes só fazem o que não precisa do arquivo (listar, desativar/reativar, editar os dados, validações, janelas).
// O botão que de fato gera/baixa o .docx e o cadastro de modelo com arquivo NÃO são clicados.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });   // aviso ainda sumindo (transparente) é lido com contraste falso
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.locator('.Toastify__toast').filter({ hasText: texto }).first()).toBeVisible();
const linha = (page, nome) => page.locator('tbody tr').filter({ hasText: nome }).first();
const item = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) });
async function abrirCartao(page, titulo) {
  const h = page.getByRole('heading', { name: titulo });
  await expect(h).toBeVisible();
  if ((await h.textContent()).trim().startsWith('▶')) await h.click();
  await expect(h).toHaveText(/^▼/);
}
async function esperarAvisosSumirem(page) { await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 }); }

const MODELOS = [
  // [nome, destino, tipo_audiencia_id, modalidade, ativo]
  ['Doc E2E Comum', 'comum', null, null, 1],
  ['Doc E2E Para Desativar', 'comum', null, null, 1],
  ['Doc E2E Para Editar', 'comum', null, null, 1],
  ['Doc E2E Para Excluir', 'comum', null, null, 1],
  ['Doc E2E Aud Presencial', 'audiencia', 1, 'presencial', 1],
  ['Doc E2E Aud Virtual Outro', 'audiencia', 1, 'virtual', 1],
  ['Doc E2E Recibo Acordo Cliente', 'recibo_acordo_cliente', null, null, 1],
  ['Doc E2E Recibo Acordo Parceria', 'recibo_acordo_parceria', null, null, 1],
];

// Modelo DESATIVADO só existe durante o teste que precisa dele (a linha desativada aparece na tela de Documentos e entra na análise de acessibilidade).
async function comModeloDesativado(fazer) {
  await noBanco(`INSERT INTO modelo_documento (nome, destino, tipo_audiencia_id, modalidade, arquivo_s3_key, ativo, criado_por)
                 VALUES ('Doc E2E Aud Antigo', 'audiencia', 1, 'presencial', 'nao-usado-na-bateria.docx', 0, 1)`);
  try { await fazer(); } finally { await noBanco("DELETE FROM modelo_documento WHERE nome = 'Doc E2E Aud Antigo'"); }
}
let ID = {};
let HORA_AUD;

test.beforeAll(async ({ request }) => {
  // Tudo criado ANTES de entrar pela tela (um novo login derruba a sessão anterior).
  for (const [nome, destino, tipoAud, modalidade, ativo] of MODELOS) {
    if ((await noBanco('SELECT id FROM modelo_documento WHERE nome = ?', [nome])).length) continue;
    await noBanco(
      `INSERT INTO modelo_documento (nome, descricao, destino, tipo_audiencia_id, modalidade, arquivo_s3_key, ativo, criado_por)
       VALUES (?, ?, ?, ?, ?, 'nao-usado-na-bateria.docx', ?, 1)`,
      [nome, nome.includes('Para Editar') ? 'Descrição inicial' : null, destino, tipoAud, modalidade, ativo]);
  }
  for (const [nome] of MODELOS) ID[nome] = (await noBanco('SELECT id FROM modelo_documento WHERE nome = ?', [nome]))[0].id;
  if (!(await noBanco("SELECT id FROM log_documentos_gerados WHERE modelo_nome = 'Doc E2E Comum'")).length) {
    await noBanco(`INSERT INTO log_documentos_gerados (modelo_nome, formato, ancora_tipo, referencia, nome_arquivo, usuario_id, usuario_nome, gerado_em) VALUES
      ('Doc E2E Comum', 'docx', 'pessoa_fisica', 'Cliente Fulano E2E', 'doc-e2e-janeiro.docx', 1, 'Administrador de Testes', '2026-01-10 10:00:00'),
      ('Doc E2E Comum', 'pdf', 'audiencia', 'Proc E2E', 'doc-e2e-marco.pdf', 1, 'Administrador de Testes', '2026-03-10 11:00:00')`);
  }
  await noBanco('UPDATE configuracoes_escritorio SET documentos_maiusculas = 0 WHERE id = 1');
  HORA_AUD = '07:35';
  // (o Playwright roda este preparo de novo quando um teste falha e recomeça o processo: só cria a audiência se ela ainda não existe)
  if (!(await noBanco("SELECT id FROM audiencia WHERE processo_id = 1 AND data = '2001-01-01' AND hora = ?", [`${HORA_AUD}:00`])).length) await criarAudiencia(request, HORA_AUD, 'presencial');
  await criarUsuarioComPermissoes('doc_so_ver', [['documentos', null, 'visualizar'], ['documentos', 'modelos', 'visualizar']]);
  await criarUsuarioComPermissoes('doc_ver_historico', [['documentos', null, 'visualizar'], ['documentos', 'modelos', 'visualizar'], ['documentos', null, 'historico']]);
});
test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

async function abrirDocumentos(page, login) {
  await loginPelaTela(page, login);
  await page.goto('/documentos');
  await expect(page.getByRole('heading', { name: 'Modelos de documento' })).toBeVisible();
  await aguardarTelaPronta(page);
}

test('@critical Documentos: lista os modelos com o tipo certo (inclusive recibo consolidado do acordo), status e dados que usa', async ({ page }) => {
  await comModeloDesativado(async () => {
  await abrirDocumentos(page);
  await expect(page.getByText('Nenhum modelo cadastrado')).toHaveCount(0);
  await expect(linha(page, 'Doc E2E Comum')).toContainText('Comum');
  await expect(linha(page, 'Doc E2E Comum')).toContainText('Só dados do escritório');
  await expect(linha(page, 'Doc E2E Comum')).toContainText('Ativo');
  await expect(linha(page, 'Doc E2E Para Editar')).toContainText('Descrição inicial');
  await expect(linha(page, 'Doc E2E Aud Presencial')).toContainText('Audiência: Julgamento · Presencial');
  await expect(linha(page, 'Doc E2E Aud Virtual Outro')).toContainText('Audiência: Julgamento · Virtual');
  await expect(linha(page, 'Doc E2E Recibo Acordo Cliente')).toContainText('Recibo consolidado: Cliente');
  await expect(linha(page, 'Doc E2E Recibo Acordo Parceria')).toContainText('Recibo consolidado: Parceria');
  await expect(linha(page, 'Doc E2E Aud Antigo')).toContainText('Desativado');
  await semViolacoes(page, 'tela de Documentos');
  });
});

test('@critical Documentos: menu da linha — desativar e reativar gravam; excluir pede confirmação e "Cancelar" não apaga nada', async ({ page }) => {
  await abrirDocumentos(page);
  const id = ID['Doc E2E Para Desativar'];
  await abrirMenuAcoes(page, linha(page, 'Doc E2E Para Desativar'));
  for (const nome of ['Baixar', 'Editar', 'Desativar', 'Excluir']) await expect(item(page, nome)).toBeVisible();
  await expect(item(page, 'Reativar')).toHaveCount(0);
  await item(page, 'Desativar').click();
  await aviso(page, 'Modelo desativado');
  await expect(linha(page, 'Doc E2E Para Desativar')).toContainText('Desativado');
  expect((await noBanco('SELECT ativo FROM modelo_documento WHERE id = ?', [id]))[0].ativo).toBe(0);
  await abrirMenuAcoes(page, linha(page, 'Doc E2E Para Desativar'));
  await expect(item(page, 'Desativar')).toHaveCount(0);
  await item(page, 'Reativar').click();
  await aviso(page, 'Modelo reativado');
  await expect(linha(page, 'Doc E2E Para Desativar')).toContainText('Ativo');
  expect((await noBanco('SELECT ativo FROM modelo_documento WHERE id = ?', [id]))[0].ativo).toBe(1);
  // excluir: só a confirmação (a exclusão de verdade apaga o arquivo na S3, que não participa da bateria)
  await esperarAvisosSumirem(page);
  await abrirMenuAcoes(page, linha(page, 'Doc E2E Para Excluir'));
  await item(page, 'Excluir').click();
  const conf = janela(page, 'Excluir modelo definitivamente');
  await expect(conf).toBeVisible();
  await expect(conf).toContainText('Doc E2E Para Excluir');
  await expect(conf).toContainText('NÃO pode ser desfeita');
  await semViolacoes(page, 'confirmação de exclusão do modelo');
  await conf.getByRole('button', { name: 'Cancelar' }).click();
  await expect(conf).toHaveCount(0);
  expect((await noBanco('SELECT id FROM modelo_documento WHERE id = ?', [ID['Doc E2E Para Excluir']])).length).toBe(1);
  await expect(linha(page, 'Doc E2E Para Excluir')).toBeVisible();
});

test('@critical CAIXA ALTA: ligar e desligar grava na hora, mostra aviso e continua assim depois de recarregar a tela', async ({ page }) => {
  await abrirDocumentos(page);
  const caixa = page.getByRole('checkbox', { name: /Usar CAIXA ALTA no nome do autor e do réu/ });
  await expect(caixa).toBeVisible();
  await expect(page.getByText('Só o administrador pode alterar.')).toBeVisible();
  await expect(caixa).not.toBeChecked();
  await caixa.click();
  await aviso(page, 'Ligado: os documentos passam a usar CAIXA ALTA');
  await expect(caixa).toBeChecked();
  expect((await noBanco('SELECT documentos_maiusculas AS v FROM configuracoes_escritorio WHERE id = 1'))[0].v).toBe(1);
  await page.reload();
  await aguardarTelaPronta(page);
  await expect(caixa).toBeChecked();
  await semViolacoes(page, 'CAIXA ALTA ligada');
  await caixa.click();
  await aviso(page, 'Desligado: os nomes do autor e do réu voltam ao normal');
  await expect(caixa).not.toBeChecked();
  expect((await noBanco('SELECT documentos_maiusculas AS v FROM configuracoes_escritorio WHERE id = 1'))[0].v).toBe(0);
  await page.reload();
  await aguardarTelaPronta(page);
  await expect(caixa).not.toBeChecked();
});

test('@critical Novo modelo: janela, campos por destino, as 2 opções de recibo consolidado e todas as validações antes de enviar (nada é gravado)', async ({ page }) => {
  const antes = (await noBanco('SELECT COUNT(*) AS n FROM modelo_documento'))[0].n;
  await abrirDocumentos(page);
  await page.getByRole('button', { name: '+ Novo Modelo' }).click();
  const m = janela(page, 'Novo Modelo de Documento');
  await expect(m).toBeVisible();
  const destino = m.getByLabel('Destino do modelo');
  await expect(destino.locator('option')).toHaveText([
    'Comum (procuração, contrato, declaração…)', 'Documento de partes (autores e réus)', 'Recibo de cliente', 'Recibo de parceria',
    'Recibo consolidado do acordo: cliente', 'Recibo consolidado do acordo: parceria',
    'Comunicado de audiência', 'Documento de perícia', 'Documento de prazo']);
  await semViolacoes(page, 'janela Novo Modelo');
  // validações, na ordem em que o sistema confere
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Informe o nome do modelo');
  await esperarAvisosSumirem(page);
  await m.getByLabel('Nome do modelo').fill('Modelo que não deve ser gravado');
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Escolha o arquivo .docx do modelo');
  await esperarAvisosSumirem(page);
  await m.getByLabel('Arquivo .docx').setInputFiles({ name: 'errado.txt', mimeType: 'text/plain', buffer: Buffer.from('não é docx') });
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'O arquivo precisa ser um .docx');
  await esperarAvisosSumirem(page);
  // o arquivo certo (.docx) só passa da conferência do nome; as conferências por destino vêm antes do envio
  await m.getByLabel('Arquivo .docx').setInputFiles({ name: 'ok.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('x') });
  await destino.selectOption('audiencia');
  await expect(m.getByLabel('Tipo de audiência')).toBeVisible();
  await expect(m.getByLabel('Modalidade')).toBeVisible();
  await expect(m.getByLabel('Imprimir o horário quantos minutos antes?')).toBeVisible();
  await semViolacoes(page, 'janela Novo Modelo — destino audiência');
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Escolha o tipo de audiência e a modalidade');
  await esperarAvisosSumirem(page);
  await destino.selectOption('pericia');
  await expect(m.getByLabel('Tipo de perícia')).toBeVisible();
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Escolha o tipo de perícia');
  await esperarAvisosSumirem(page);
  await destino.selectOption('prazo');
  await expect(m.getByLabel('Subtipo de prazo')).toBeVisible();
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Escolha o subtipo de prazo');
  await esperarAvisosSumirem(page);
  for (const opcao of ['recibo_acordo_cliente', 'recibo_acordo_parceria']) {
    await destino.selectOption(opcao);
    await expect(destino).toHaveValue(opcao);
  }
  await m.getByRole('button', { name: 'Cancelar' }).click();
  await expect(m).toHaveCount(0);
  expect((await noBanco('SELECT COUNT(*) AS n FROM modelo_documento'))[0].n).toBe(antes);
  expect((await noBanco("SELECT id FROM modelo_documento WHERE nome = 'Modelo que não deve ser gravado'")).length).toBe(0);
});

test('@critical Editar modelo (só os dados, sem trocar o arquivo): abre preenchido, salva o novo nome e a descrição, e a lista e o banco acompanham', async ({ page }) => {
  await abrirDocumentos(page);
  const id = ID['Doc E2E Para Editar'];
  await abrirMenuAcoes(page, linha(page, 'Doc E2E Para Editar'));
  await item(page, 'Editar').click();
  const m = janela(page, 'Editar Modelo');
  await expect(m).toBeVisible();
  await expect(m.getByLabel('Nome do modelo')).toHaveValue('Doc E2E Para Editar');
  await expect(m.getByLabel('Descrição (opcional)')).toHaveValue('Descrição inicial');
  await expect(m.getByLabel('Destino do modelo')).toHaveValue('comum');
  await semViolacoes(page, 'janela Editar Modelo');
  // trocar o destino para audiência sem classificar é recusado e nada muda
  await m.getByLabel('Destino do modelo').selectOption('audiencia');
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Escolha o tipo de audiência e a modalidade');
  expect((await noBanco('SELECT destino FROM modelo_documento WHERE id = ?', [id]))[0].destino).toBe('comum');
  await esperarAvisosSumirem(page);
  await m.getByLabel('Destino do modelo').selectOption('comum');
  await m.getByLabel('Nome do modelo').fill('Doc Editado Pelo Teste');
  await m.getByLabel('Descrição (opcional)').fill('Descrição nova');
  await m.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Modelo atualizado!');
  await expect(m).toHaveCount(0);
  await expect(linha(page, 'Doc Editado Pelo Teste')).toContainText('Descrição nova');
  const r = (await noBanco('SELECT nome, descricao, arquivo_s3_key, alterado_por FROM modelo_documento WHERE id = ?', [id]))[0];
  expect(r).toEqual({ nome: 'Doc Editado Pelo Teste', descricao: 'Descrição nova', arquivo_s3_key: 'nao-usado-na-bateria.docx', alterado_por: 1 });   // o arquivo continua o mesmo
  // nome em branco é recusado e o nome gravado não muda
  await esperarAvisosSumirem(page);
  await abrirMenuAcoes(page, linha(page, 'Doc Editado Pelo Teste'));
  await item(page, 'Editar').click();
  const m2 = janela(page, 'Editar Modelo');
  await m2.getByLabel('Nome do modelo').fill('   ');
  await m2.getByRole('button', { name: 'Salvar Modelo' }).click();
  await aviso(page, 'Informe o nome do modelo');
  await m2.getByRole('button', { name: 'Cancelar' }).click();
  expect((await noBanco('SELECT nome FROM modelo_documento WHERE id = ?', [id]))[0].nome).toBe('Doc Editado Pelo Teste');
});

test('@critical Catálogos de variáveis, histórico de documentos gerados e modelos de e-mail do perito: abrem, filtram, validam e gravam', async ({ page }) => {
  await abrirDocumentos(page);
  // catálogo de variáveis (clicar copia; aqui só abrir e conferir que as variáveis aparecem)
  await abrirCartao(page, /Variáveis disponíveis nos modelos/);
  await expect(page.getByRole('button', { name: '{{nome_cliente}}' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '{{data_audiencia}}' }).first()).toBeVisible();
  await semViolacoes(page, 'catálogo de variáveis aberto');
  await abrirCartao(page, /Variáveis do "Documento de partes"/);
  await expect(page.getByText('Marcadores de região (clique para copiar)')).toBeVisible();
  await semViolacoes(page, 'catálogo do documento de partes aberto');
  // histórico
  await abrirCartao(page, /Histórico de documentos gerados/);
  await expect(linha(page, 'doc-e2e-janeiro.docx')).toContainText('Cliente Fulano E2E');
  await expect(linha(page, 'doc-e2e-marco.pdf')).toContainText('PDF');
  await page.getByLabel('De', { exact: true }).fill('2026-03-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-03-31');
  await expect(page.getByText('doc-e2e-janeiro.docx')).toHaveCount(0);
  await expect(page.getByText('doc-e2e-marco.pdf')).toBeVisible();
  await page.getByLabel('De', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Até', { exact: true }).fill('2025-01-31');
  await expect(page.getByText('Nenhum documento gerado no período.')).toBeVisible();
  await semViolacoes(page, 'histórico sem resultado');
  // modelos de e-mail para perito: validação e gravação
  await abrirCartao(page, /Modelos de e-mail para perito/);
  await page.getByRole('button', { name: '+ Novo modelo', exact: true }).click();
  await semViolacoes(page, 'modelos de e-mail do perito aberto');
  await page.getByRole('button', { name: 'Salvar' }).last().click();
  await aviso(page, 'Preencha nome, assunto e mensagem de cada modelo.');
  await esperarAvisosSumirem(page);
  await page.getByLabel('Nome do modelo').last().fill('Convite Do Teste');
  await page.getByLabel('Assunto').last().fill('Perícia marcada E2E');
  await page.getByLabel('Mensagem').last().fill('Prezado perito, segue a data da perícia.');
  await page.getByRole('button', { name: 'Salvar' }).last().click();
  await aviso(page, 'Modelos de e-mail salvos!');
  const gravado = (await noBanco('SELECT modelos_email_perito AS v FROM configuracoes_escritorio WHERE id = 1'))[0].v;
  expect(JSON.stringify(gravado)).toContain('Convite Do Teste');
  await page.reload();
  await aguardarTelaPronta(page);
  await abrirCartao(page, /Modelos de e-mail para perito/);
  await expect(page.getByLabel('Nome do modelo').first()).toHaveValue('Convite Do Teste');
});

test('@critical Janela "Gerar documento" (pela pasta do processo): lista só os modelos ATIVOS do tipo e modalidade da audiência, formatos, e-mail e Cancelar', async ({ page }) => {
  await comModeloDesativado(async () => {
  await loginPelaTela(page);
  await page.goto('/processos/pasta/1');
  await page.getByRole('button', { name: 'Audiências', exact: true }).click();
  await aguardarTelaPronta(page);
  await abrirMenuAcoes(page, linha(page, HORA_AUD));
  await item(page, 'Gerar documento').click();
  const g = janela(page, 'Gerar documento');
  await expect(g).toBeVisible();
  const modelo = g.getByLabel('Modelo');
  await expect(modelo.locator('option')).toHaveText(['— Selecione —', 'Doc E2E Aud Presencial']);   // sem o virtual, sem o desativado, sem os de outro destino
  await expect(g.getByLabel('Formato').locator('option')).toHaveText(['Word (.docx)', 'PDF']);
  await semViolacoes(page, 'janela Gerar documento');
  // sem escolher modelo: avisa e não faz nada
  await g.getByRole('button', { name: 'Gerar e Baixar' }).click();
  await aviso(page, 'Escolha um modelo');
  await esperarAvisosSumirem(page);
  await g.getByRole('button', { name: /Enviar por e-mail/ }).click();
  await aviso(page, 'Escolha um modelo');
  await esperarAvisosSumirem(page);
  // com modelo escolhido, abre a janela de e-mail (o envio de verdade gera o arquivo, que usa a S3: não é clicado)
  await modelo.selectOption({ label: 'Doc E2E Aud Presencial' });
  await g.getByRole('button', { name: /Enviar por e-mail/ }).click();
  const email = janela(page, 'Enviar documento por e-mail');
  await expect(email).toBeVisible();
  await expect(email.getByLabel('Para')).toBeVisible();
  await semViolacoes(page, 'janela Enviar documento por e-mail');
  await email.getByRole('button', { name: 'Cancelar' }).click();
  await expect(email).toHaveCount(0);
  await g.getByRole('button', { name: 'Cancelar' }).click();
  await expect(g).toHaveCount(0);
  });
});

test('@critical Permissões: quem só VISUALIZA os modelos não vê "+ Novo Modelo", a CAIXA ALTA, Editar, Excluir, Desativar nem o histórico', async ({ page }) => {
  await abrirDocumentos(page, 'doc_so_ver');
  await expect(linha(page, 'Doc E2E Comum')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo Modelo' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /CAIXA ALTA/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Modelos de e-mail para perito/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Histórico de documentos gerados/ })).toHaveCount(0);
  await abrirMenuAcoes(page, linha(page, 'Doc E2E Comum'));
  await expect(item(page, 'Baixar')).toBeVisible();
  for (const nome of ['Editar', 'Desativar', 'Reativar', 'Excluir']) await expect(item(page, nome)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await semViolacoes(page, 'Documentos para quem só visualiza');
});

test('@critical Permissões: com a permissão de histórico, o histórico aparece (e a CAIXA ALTA continua só do administrador)', async ({ page }) => {
  await abrirDocumentos(page, 'doc_ver_historico');
  await expect(page.getByRole('heading', { name: /Histórico de documentos gerados/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /CAIXA ALTA/ })).toHaveCount(0);
});
