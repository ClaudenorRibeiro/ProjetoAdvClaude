import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { aguardarTelaPronta, bloquearRedeExterna, criarUsuarioComPermissoes, loginPelaTela, violacoesGraves } from './helpers';

// Aviso diário de andamentos do DataJud, lado da TELA: o quadro de configuração (Configurações > Integrações), o sino que leva a
// "Novidades dos processos" e a própria tela de novidades (quem vê o quê). O servidor tem os testes dele (consulta noturna,
// resumo, limpeza); aqui é o que o administrador e o advogado enxergam.
const { conectarBancoTeste } = createRequire(import.meta.url)('../../backend/tests/support/testDatabase');
async function noBanco(sql, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(sql, params))[0]; } finally { await conn.end(); }
}
async function semViolacoes(page, rotulo) {
  await page.mouse.move(0, 0);
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 12000 });
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const aviso = (page, texto) => expect(page.locator('.Toastify__toast').filter({ hasText: texto }).first()).toBeVisible();

const PASTA = 7731; const PASTA_ALHEIA = 7732;
let ids = {};
test.describe.configure({ timeout: 120_000 });

async function limpar() {
  await noBanco("DELETE FROM notificacoes WHERE destino = 'novidades-processos'");
  await noBanco("DELETE FROM andamento_processual WHERE processo_id IN (SELECT id FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (?, ?)))", [PASTA, PASTA_ALHEIA]);
  await noBanco("DELETE FROM tblproc WHERE pasta_id IN (SELECT id FROM tblpasta WHERE numPasta IN (?, ?))", [PASTA, PASTA_ALHEIA]);
  await noBanco('DELETE FROM tblpasta WHERE numPasta IN (?, ?)', [PASTA, PASTA_ALHEIA]);
  await noBanco('DELETE FROM datajud_tipos_andamento');
  await noBanco("UPDATE usuarios SET datajud_aviso_canal = 'nenhum', datajud_aviso_escopo = 'meus'");
  await noBanco("UPDATE configuracoes_escritorio SET datajud_aviso_modo = 'todos', datajud_aviso_horario = '07:30'");
}
test.beforeAll(async () => {
  await criarUsuarioComPermissoes('novidades_e2e', [['processos', null, 'visualizar']]);
  await criarUsuarioComPermissoes('novidades_sem', [['prazos', null, 'visualizar']]);
  ids.eu = (await noBanco("SELECT id FROM usuarios WHERE login = 'novidades_e2e'"))[0].id;
});
test.afterAll(async () => { await limpar(); });
test.beforeEach(async ({ page }) => { await limpar(); await bloquearRedeExterna(page); });

async function processo(numPasta, responsavel, numero, titulo) {
  const pasta = (await noBanco('INSERT INTO tblpasta (numPasta, criado_por) VALUES (?, 1)', [numPasta])).insertId;
  return { pasta, id: (await noBanco('INSERT INTO tblproc (pasta_id, numProc, NomeTituloProc, status_id, ativo, responsavel_id, criado_por) VALUES (?, ?, ?, 1, 1, ?, 1)', [pasta, numero, titulo, responsavel])).insertId };
}
let seqHash = 0;
const novidade = (proc, descricao, dias = 0, codigo = 67) => noBanco(
  "INSERT INTO andamento_processual (processo_id, data, descricao, fonte, codigo_movimento, hash_movimento, novidade_em) VALUES (?, CURDATE(), ?, 'datajud', ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))",
  [proc, descricao, codigo, `e2e${String(seqHash += 1).padStart(5, '0')}`.padEnd(40, '0'), dias]);

test('@critical Configurações > Integrações: o administrador escolhe horário, modo e quem recebe o resumo de andamentos (e o servidor recusa o que não faz sentido)', async ({ page }) => {
  await noBanco("INSERT INTO datajud_tipos_andamento (codigo, nome, quantidade) VALUES (9001, 'Conclusão Para Decisão', 5), (9002, 'Juntada De Petição', 12)");
  await noBanco("UPDATE usuarios SET email = NULL WHERE login = 'novidades_sem'");
  await loginPelaTela(page);
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Integrações', exact: true }).click();
  const quadro = page.getByRole('group', { name: 'Aviso diário de andamentos' });
  await expect(quadro).toBeVisible();
  await expect(quadro.getByText('últimos 6 meses')).toBeVisible();
  await expect(quadro.getByLabel('Horário do resumo (Brasília)')).toHaveValue('07:30');
  // padrão: ninguém recebe nada
  await expect(quadro.getByLabel('Como Usuário de Testes recebe o resumo')).toHaveValue('nenhum');
  // quem não tem e-mail cadastrado não pode escolher e-mail
  const semEmail = quadro.getByLabel('Como Usuário novidades_sem recebe o resumo');
  await expect(semEmail.locator('option[value="email"]')).toBeDisabled();
  await expect(semEmail.locator('option[value="ambos"]')).toBeDisabled();
  await expect(semEmail.locator('option[value="sino"]')).toBeEnabled();
  // "só importantes" sem marcar nenhum tipo: o servidor recusa e nada muda
  await quadro.getByLabel('O resumo traz').selectOption('importantes');
  await expect(quadro.getByLabel('Conclusão Para Decisão')).toBeVisible();
  await quadro.getByRole('button', { name: 'Salvar aviso de andamentos' }).click();
  await aviso(page, 'Marque ao menos um tipo de andamento como importante');
  expect((await noBanco('SELECT datajud_aviso_modo AS m FROM configuracoes_escritorio'))[0].m).toBe('todos');
  // o que a pessoa procura filtra a lista (sem diferenciar acento)
  await quadro.getByLabel('Procurar tipo de andamento').fill('juntada');
  await expect(quadro.getByLabel('Juntada De Petição')).toBeVisible();
  await expect(quadro.getByLabel('Conclusão Para Decisão')).toHaveCount(0);
  await quadro.getByLabel('Procurar tipo de andamento').fill('');
  await quadro.getByLabel('Conclusão Para Decisão').check();
  await quadro.getByLabel('Horário do resumo (Brasília)').fill('08:15');
  await quadro.getByLabel('Como Usuário de Testes recebe o resumo').selectOption('ambos');
  await quadro.getByLabel('De quais processos Usuário de Testes recebe').selectOption('todos');
  await semViolacoes(page, 'quadro do aviso de andamentos');
  await quadro.getByRole('button', { name: 'Salvar aviso de andamentos' }).click();
  await aviso(page, 'Aviso de andamentos salvo!');
  const cfg = (await noBanco('SELECT datajud_aviso_modo AS m, datajud_aviso_horario AS h FROM configuracoes_escritorio'))[0];
  expect([cfg.m, cfg.h]).toEqual(['importantes', '08:15']);
  expect(await noBanco('SELECT codigo, importante, novo FROM datajud_tipos_andamento ORDER BY codigo')).toEqual([{ codigo: 9001, importante: 1, novo: 0 }, { codigo: 9002, importante: 0, novo: 0 }]);
  expect((await noBanco("SELECT datajud_aviso_canal AS c, datajud_aviso_escopo AS e FROM usuarios WHERE login = 'usuteste'"))[0]).toEqual({ c: 'ambos', e: 'todos' });
  // recarregar mostra o que ficou salvo
  await page.reload();
  await page.getByRole('button', { name: 'Integrações', exact: true }).click();
  const de = page.getByRole('group', { name: 'Aviso diário de andamentos' });
  await expect(de.getByLabel('Horário do resumo (Brasília)')).toHaveValue('08:15');
  await expect(de.getByLabel('O resumo traz')).toHaveValue('importantes');
  await expect(de.getByLabel('Conclusão Para Decisão')).toBeChecked();
  await expect(de.getByLabel('Como Usuário de Testes recebe o resumo')).toHaveValue('ambos');
  await noBanco("UPDATE usuarios SET email = 'novidades_sem@example.invalid' WHERE login = 'novidades_sem'");
});

test('@critical Sino: o resumo de andamentos leva a "Novidades dos processos", que mostra só os processos da pessoa dos últimos 7 dias', async ({ page }) => {
  const meu = await processo(PASTA, ids.eu, '9731000-00.2026.8.26.0100', 'Maria Meu X Banco Meu');
  const alheio = await processo(PASTA_ALHEIA, 1, '9732000-00.2026.8.26.0100', 'João Alheio X Banco Alheio');
  await novidade(meu.id, 'Juntada De Petição Do Meu Processo', 1);
  await novidade(meu.id, 'Conclusão Do Meu Processo', 0, 51);
  await novidade(meu.id, 'Movimento Velho Demais', 9);
  await novidade(alheio.id, 'Movimento Do Processo De Outro', 1);
  await noBanco("UPDATE usuarios SET datajud_aviso_canal = 'sino', datajud_aviso_escopo = 'meus' WHERE id = ?", [ids.eu]);
  await noBanco("INSERT INTO notificacoes (usuario_id, mensagem, destino) VALUES (?, '1 processo com andamentos novos. Veja em Novidades dos processos.', 'novidades-processos'), (?, 'Aviso comum sem tela', NULL)", [ids.eu, ids.eu]);
  await loginPelaTela(page, 'novidades_e2e');
  await page.getByTitle('Notificações').click();
  await expect(page.getByText('Aviso comum sem tela')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aviso comum sem tela' })).toHaveCount(0);                      // só o resumo de andamentos é link
  await page.getByRole('link', { name: '1 processo com andamentos novos. Veja em Novidades dos processos.' }).click();
  await expect(page).toHaveURL(/\/novidades-processos$/);
  await expect(page.getByRole('heading', { name: 'Novidades dos processos' })).toBeVisible();
  await expect(page.getByText('últimos 7 dias nos processos que você acompanha')).toBeVisible();
  await expect(page.getByText('Pasta 7731 · 9731000-00.2026.8.26.0100')).toBeVisible();
  await expect(page.getByText('Maria Meu X Banco Meu')).toBeVisible();
  await expect(page.getByText('Juntada De Petição Do Meu Processo')).toBeVisible();
  await expect(page.getByText('Conclusão Do Meu Processo')).toBeVisible();
  await expect(page.getByText('Movimento Velho Demais')).toHaveCount(0);                                      // fora dos 7 dias
  await expect(page.getByText('Movimento Do Processo De Outro')).toHaveCount(0);                              // escopo "só os meus"
  await semViolacoes(page, 'Novidades dos processos');
  // o link do processo abre a pasta na aba Andamentos
  await page.getByRole('link', { name: /Pasta 7731/ }).click();
  await expect(page).toHaveURL(new RegExp(`/processos/pasta/${meu.pasta}\\?aba=andamentos`));
  // com "todos os processos" a pessoa vê também o do outro
  await noBanco("UPDATE usuarios SET datajud_aviso_escopo = 'todos' WHERE id = ?", [ids.eu]);
  await page.goto('/novidades-processos'); await aguardarTelaPronta(page);
  await expect(page.getByText('Movimento Do Processo De Outro')).toBeVisible();
});

test('@critical Novidades dos processos: sem novidade avisa; quem não tem acesso a Processos não entra', async ({ page }) => {
  await loginPelaTela(page, 'novidades_e2e');
  await page.goto('/novidades-processos'); await aguardarTelaPronta(page);
  await expect(page.getByText('Nenhum andamento novo nos últimos 7 dias.')).toBeVisible();
  await semViolacoes(page, 'Novidades dos processos vazia');
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await loginPelaTela(page, 'novidades_sem');
  await page.goto('/novidades-processos'); await aguardarTelaPronta(page);
  await expect(page.getByRole('heading', { name: 'Novidades dos processos' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/novidades-processos/);
});
