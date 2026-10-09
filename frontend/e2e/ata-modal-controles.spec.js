import { test, expect } from '@playwright/test';
import { abrirMenuAcoes, adicionarAutorAoProcesso, aguardarTelaPronta, bloquearRedeExterna, criarAudiencia, loginPelaTela, violacoesGraves } from './helpers';

// Verifica TODOS os controles do modal "Registrar Ata" (aberto pela Pasta do processo):
// campos, as 8 caixas "O que teve nessa audiência?", o que cada uma revela, as janelas filhas,
// as mensagens de validação, cadastro/remoção dos rascunhos e o registro final da ata.
const API = 'http://127.0.0.1:3001/api';
const ITENS = ['Prazo', 'Perícia', 'Acordo', 'Nova audiência', 'Alvará', 'Testemunha(s)', 'Desistência da Ação', 'Retornem aos autos', 'Tarefa'];
// Cada teste usa a sua audiência (horário próprio), pois o banco de teste é compartilhado.

async function token(request) {
  const r = await request.post(`${API}/auth/login`, { data: { login: 'admteste', senha: 'TesteSeguro123!' } });
  return (await r.json()).dados.token;
}
const cab = (t) => ({ Authorization: `Bearer ${t}` });

async function abrirAta(page, request, horario, preparo) {
  // A audiência é criada ANTES de entrar pela tela: um novo login (mesmo pela API) derruba a sessão anterior.
  await criarAudiencia(request, horario, 'presencial');
  if (preparo) await preparo();
  await loginPelaTela(page);
  await page.goto('/processos/pasta/1');
  await page.getByRole('button', { name: 'Audiências', exact: true }).click();
  await aguardarTelaPronta(page);
  const linha = page.locator('tbody tr').filter({ hasText: horario }).first();
  await abrirMenuAcoes(page, linha);
  await page.getByRole('button', { name: 'Registrar ata' }).click();
  const ata = page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: /Registrar Ata/ }) });
  await expect(ata).toBeVisible();
  return { ata, horario, linha };
}
const marcar = (ata, nome) => ata.getByRole('checkbox', { name: nome, exact: true });
const aviso = (ata, texto) => expect(ata.getByText(texto)).toBeVisible();
async function semViolacoes(page, rotulo) {
  await expect(page.locator('.Toastify__toast')).toHaveCount(0, { timeout: 10000 });   // um aviso ainda sumindo (transparente) é lido com contraste falso
  const v = await violacoesGraves(page);
  expect(v, `acessibilidade — ${rotulo}: ${JSON.stringify(v, null, 1)}`).toEqual([]);
}
const erroDeTela = (page) => expect(page.getByText('Não foi possível carregar esta tela')).toHaveCount(0);

test.beforeEach(async ({ page }) => { await bloquearRedeExterna(page); });

test('@critical Ata: campos, as 8 caixas, Cancelar e ✕ (fecham sem registrar nada)', async ({ page, request }) => {
  const { ata, horario } = await abrirAta(page, request, '17:10');
  await expect(ata.getByRole('heading', { name: /Registrar Ata — .*17:/ })).toBeVisible();
  await expect(ata.getByText('Advogado(a) que acompanhou a audiência')).toBeVisible();
  const advogado = ata.getByRole('combobox').first();
  await expect(advogado.locator('option', { hasText: '— Selecione —' })).toHaveCount(1);
  await expect(advogado.locator('option', { hasText: 'Ninguém (a parte compareceu sozinha)' })).toHaveCount(1);
  await expect(ata.getByTitle('Cadastrar novo advogado')).toBeVisible();
  await expect(ata.getByPlaceholder('Descreva os principais pontos da audiência...')).toBeVisible();
  await expect(ata.getByText('O que teve nessa audiência?')).toBeVisible();
  for (const nome of ITENS) { await expect(marcar(ata, nome)).toBeVisible(); await expect(marcar(ata, nome)).not.toBeChecked(); }
  await expect(ata.getByRole('textbox', { name: 'Observações' })).toBeVisible();
  await expect(ata.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(ata.getByRole('button', { name: 'Registrar Ata', exact: true })).toBeVisible();
  // Nenhum item extra aparece antes de marcar a caixa correspondente
  for (const botao of ['💰 Registrar acordo', '📅 Designar nova audiência', '+ Cadastrar prazo', '+ Cadastrar perícia', '+ Cadastrar tarefa do alvará', '+ Testemunhas', '+ Cadastrar tarefa']) {
    await expect(ata.getByRole('button', { name: botao, exact: true })).toHaveCount(0);
  }
  // Cancelar fecha; reabre; ✕ fecha
  await ata.getByRole('button', { name: 'Cancelar' }).click();
  await expect(ata).toHaveCount(0);
  const linha = page.locator('tbody tr').filter({ hasText: horario }).first();
  await abrirMenuAcoes(page, linha);
  await page.getByRole('button', { name: 'Registrar ata' }).click();
  await ata.getByRole('button', { name: '✕' }).click();
  await expect(ata).toHaveCount(0);
  await expect(linha).toContainText('Agendada');
  await erroDeTela(page);
});

test('@critical Ata: cada caixa revela os seus controles e, ao desmarcar, eles somem', async ({ page, request }) => {
  const { ata } = await abrirAta(page, request, '17:11');
  const revela = {
    'Acordo': ['💰 Registrar acordo'],
    'Nova audiência': ['📅 Designar nova audiência'],
    'Testemunha(s)': ['+ Testemunhas'],
    'Prazo': ['+ Cadastrar prazo'],
    'Perícia': ['+ Cadastrar perícia'],
    'Alvará': ['+ Cadastrar tarefa do alvará'],
    'Desistência da Ação': ['+ Cadastrar tarefa'],
    'Tarefa': ['+ Cadastrar tarefa'],
  };
  for (const [item, botoes] of Object.entries(revela)) {
    await marcar(ata, item).check();
    for (const b of botoes) await expect(ata.getByRole('button', { name: b, exact: true })).toBeVisible();
    await marcar(ata, item).uncheck();
    for (const b of botoes) await expect(ata.getByRole('button', { name: b, exact: true })).toHaveCount(0);
  }
  // Desistência: motivo; Retornem aos autos: Sim/Não e comentário
  await marcar(ata, 'Desistência da Ação').check();
  await expect(ata.getByRole('textbox', { name: 'Motivo da desistência' })).toBeVisible();
  await expect(ata.getByText('Deseja cadastrar uma tarefa?')).toBeVisible();
  await marcar(ata, 'Desistência da Ação').uncheck();
  await expect(ata.getByRole('textbox', { name: 'Motivo da desistência' })).toHaveCount(0);

  await marcar(ata, 'Retornem aos autos').check();
  const sim = ata.getByRole('radio').first(); const nao = ata.getByRole('radio').nth(1);
  await expect(nao).toBeChecked();
  await expect(ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...')).toHaveCount(0);
  await sim.check();
  await expect(ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...')).toBeVisible();
  await nao.check();
  await expect(ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...')).toHaveCount(0);
  await marcar(ata, 'Retornem aos autos').uncheck();
  await expect(ata.getByRole('radio')).toHaveCount(0);

  // Testemunhas: abre/fecha o cadastro
  await marcar(ata, 'Testemunha(s)').check();
  await ata.getByRole('button', { name: '+ Testemunhas', exact: true }).click();
  await expect(ata.getByPlaceholder('Buscar pessoa cadastrada para adicionar como testemunha...')).toBeVisible();
  await ata.getByRole('button', { name: 'Fechar cadastro', exact: true }).click();
  await expect(ata.getByPlaceholder('Buscar pessoa cadastrada para adicionar como testemunha...')).toHaveCount(0);
  await erroDeTela(page);
});

test('@critical Ata: mensagens de validação de cada controle ao tentar registrar', async ({ page, request }) => {
  const { ata } = await abrirAta(page, request, '17:12');
  const registrar = () => ata.getByRole('button', { name: 'Registrar Ata', exact: true }).click();
  const advogado = ata.getByRole('combobox').first();

  await registrar();
  await aviso(ata, 'Selecione ao menos um item da audiência além de testemunha(s) antes de registrar a ata.');
  await marcar(ata, 'Testemunha(s)').check(); await registrar();
  await aviso(ata, 'Selecione ao menos um item da audiência além de testemunha(s)');   // testemunha sozinha não basta
  await marcar(ata, 'Testemunha(s)').uncheck();

  await marcar(ata, 'Retornem aos autos').check(); await registrar();
  await aviso(ata, 'Informe o advogado que acompanhou a audiência (ou selecione "Ninguém").');
  await advogado.selectOption('ninguem');
  await expect(ata.getByText('Informe o advogado que acompanhou')).toHaveCount(0);   // escolher limpa o aviso

  await ata.getByRole('radio').first().check(); await registrar();
  await aviso(ata, 'Informe o comentário sobre o retorno aos autos ou escolha não registrá-lo.');
  await marcar(ata, 'Retornem aos autos').uncheck();

  const casos = [
    ['Nova audiência', 'Cadastre os dados da nova audiência ou desmarque essa opção antes de registrar a ata.'],
    ['Acordo', 'Registre o acordo no Financeiro ou desmarque essa opção antes de registrar a ata.'],
    ['Prazo', 'Cadastre ao menos um prazo ou desmarque essa opção antes de registrar a ata.'],
    ['Perícia', 'Cadastre ao menos uma perícia ou desmarque essa opção antes de registrar a ata.'],
    ['Alvará', 'Cadastre ao menos uma tarefa do alvará ou desmarque essa opção antes de registrar a ata.'],
    ['Tarefa', 'Cadastre ao menos uma tarefa ou desmarque essa opção antes de registrar a ata.'],
    ['Desistência da Ação', 'Informe o motivo da desistência da ação antes de registrar a ata.'],
  ];
  for (const [item, mensagem] of casos) {
    await marcar(ata, item).check(); await registrar();
    await aviso(ata, mensagem);
    await marcar(ata, item).uncheck();
  }
  // Testemunha marcada junto de outro item: exige cadastrar a testemunha
  await marcar(ata, 'Retornem aos autos').check();
  await marcar(ata, 'Testemunha(s)').check(); await registrar();
  await aviso(ata, 'Cadastre ao menos uma testemunha ou desmarque essa opção antes de registrar a ata.');
  await erroDeTela(page);
});

test('@critical Ata: textos — Resumo e Observações aceitam digitação e padronizam as iniciais ao sair do campo', async ({ page, request }) => {
  const { ata } = await abrirAta(page, request, '17:13');
  const resumo = ata.getByPlaceholder('Descreva os principais pontos da audiência...');
  await resumo.fill('audiência encerrada sem acordo'); await resumo.blur();
  await expect(resumo).toHaveValue('Audiência Encerrada Sem Acordo');
  const obs = ata.getByRole('textbox', { name: 'Observações' });
  await obs.fill('conferir os autos'); await obs.blur();
  await expect(obs).toHaveValue('Conferir os Autos');
  await erroDeTela(page);
});

// Janela filha aberta por cima da ata (identificada pelo título)
// (algumas janelas ficam DENTRO da caixa da ata; a mais interna é a última)
const janela = (page, titulo) => page.locator('.modal-box').filter({ has: page.getByRole('heading', { name: titulo }) }).last();

test('@critical Ata: todas as janelas filhas abrem sem quebrar a tela e o Cancelar delas volta para a ata', async ({ page, request }) => {
  const { ata } = await abrirAta(page, request, '17:14');
  await semViolacoes(page, 'da ata (vazia)');
  const abrirECancelar = async (abre, titulo) => {
    await abre();
    const filha = janela(page, titulo);
    await expect(filha).toBeVisible();
    await erroDeTela(page);
    await semViolacoes(page, `da janela "${titulo}"`);
    await filha.getByRole('button', { name: 'Cancelar' }).click();
    await expect(filha).toHaveCount(0);
    await expect(ata).toBeVisible();
  };
  await abrirECancelar(() => ata.getByTitle('Cadastrar novo advogado').click(), 'Novo Freelancer');

  await marcar(ata, 'Acordo').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '💰 Registrar acordo' }).click(), 'Novo Acordo');
  await marcar(ata, 'Nova audiência').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '📅 Designar nova audiência' }).click(), 'Nova Audiência');
  await marcar(ata, 'Prazo').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '+ Cadastrar prazo' }).click(), 'Cadastrar prazo da ata');
  await marcar(ata, 'Perícia').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '+ Cadastrar perícia' }).click(), 'Cadastrar perícia da ata');
  await marcar(ata, 'Alvará').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '+ Cadastrar tarefa do alvará' }).click(), 'Nova Tarefa');
  await marcar(ata, 'Desistência da Ação').check();
  await abrirECancelar(() => ata.getByRole('button', { name: '+ Cadastrar tarefa', exact: true }).click(), 'Nova Tarefa');
  await marcar(ata, 'Retornem aos autos').check();
  await ata.getByRole('radio').first().check();
  await marcar(ata, 'Testemunha(s)').check();
  await semViolacoes(page, 'da ata com todas as caixas marcadas');
  await ata.getByRole('button', { name: '+ Testemunhas', exact: true }).click();
  await abrirECancelar(() => ata.getByRole('button', { name: '…' }).last().click(), 'Cadastrar Pessoa (Testemunha)');
  await erroDeTela(page);
});

test('@critical Ata: preencher TODOS os controles com dados (cadastrar, remover, readicionar) e registrar a ata completa', async ({ page, request }) => {
  test.setTimeout(150_000);
  const { ata, linha } = await abrirAta(page, request, '17:15', async () => {
    const t = await token(request);
    const r = await request.post(`${API}/pericias/tipos`, { headers: cab(t), data: { nome: 'Perícia Médica' } });
    expect(r.ok(), await r.text()).toBeTruthy();
    await adicionarAutorAoProcesso();
  });
  const advogado = ata.getByRole('combobox').first();

  // --- Advogado: cadastrar um novo (Freelancer) pelo botão "…" e escolher
  await ata.getByTitle('Cadastrar novo advogado').click();
  const freela = janela(page, 'Novo Freelancer');
  await freela.getByLabel('Nome').fill('Dra. Freela Teste');
  await freela.getByLabel('E-mail').fill('freela.teste@example.invalid');
  await freela.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(freela).toHaveCount(0);
  await expect(advogado.locator('option', { hasText: 'Dra. Freela Teste' })).toHaveCount(1);
  await advogado.selectOption({ label: 'Dra. Freela Teste' });

  await ata.getByPlaceholder('Descreva os principais pontos da audiência...').fill('Audiência com todos os desdobramentos.');
  await ata.getByRole('textbox', { name: 'Observações' }).fill('Observação de teste.');

  // --- Prazo (cadastrar, remover, cadastrar de novo)
  await marcar(ata, 'Prazo').check();
  for (const rodada of [1, 2]) {
    await ata.getByRole('button', { name: '+ Cadastrar prazo' }).click();
    const prazo = janela(page, 'Cadastrar prazo da ata');
    const seletores = prazo.locator('.select-pesquisavel__control');
    await seletores.nth(0).click();
    await page.getByText('Processual', { exact: true }).click();
    await seletores.nth(1).click();
    await page.getByText('Contestação', { exact: true }).click();
    await prazo.getByLabel('Data final').fill('2030-06-10');
    await prazo.getByRole('button', { name: 'Adicionar à ata' }).click();
    await expect(page.getByText('Prazo adicionado à ata').first()).toBeVisible();
    await expect(ata.getByText(/Contestação|Prazo —/).first()).toBeVisible();
    if (rodada === 1) {
      await ata.getByRole('button', { name: 'Remover' }).click();
      await expect(ata.getByRole('button', { name: 'Remover' })).toHaveCount(0);
    }
  }

  // --- Perícia
  await marcar(ata, 'Perícia').check();
  for (const rodada of [1, 2]) {
    await ata.getByRole('button', { name: '+ Cadastrar perícia' }).click();
    const per = janela(page, 'Cadastrar perícia da ata');
    await per.getByRole('combobox').first().selectOption({ label: 'Perícia Médica' });
    await per.getByRole('button', { name: 'Adicionar à ata' }).click();
    await expect(ata.getByText(/Perícia Médica — Aguardando data/)).toBeVisible();
    if (rodada === 1) {
      await ata.getByRole('button', { name: 'Remover' }).last().click();
      await expect(ata.getByText(/Perícia Médica — Aguardando data/)).toHaveCount(0);
    }
  }

  // --- Alvará (tarefa)
  await marcar(ata, 'Alvará').check();
  for (const rodada of [1, 2]) {
    await ata.getByRole('button', { name: '+ Cadastrar tarefa do alvará' }).click();
    await janela(page, 'Nova Tarefa').getByRole('button', { name: 'Salvar Tarefa' }).click();
    await expect(ata.getByText(/ATA com Alvará, tomar providências — vencimento/)).toBeVisible();
    if (rodada === 1) {
      await ata.getByRole('button', { name: 'Remover' }).last().click();
      await expect(ata.getByText(/ATA com Alvará, tomar providências — vencimento/)).toHaveCount(0);
    }
  }

  // --- Desistência (motivo + tarefa)
  await marcar(ata, 'Desistência da Ação').check();
  await ata.getByRole('textbox', { name: 'Motivo da desistência' }).fill('cliente desistiu do pedido');
  await ata.getByRole('button', { name: '+ Cadastrar tarefa', exact: true }).click();
  await janela(page, 'Nova Tarefa').getByRole('button', { name: 'Salvar Tarefa' }).click();
  await expect(ata.getByText(/ATA com Desistência da Ação, tomar providências — vencimento/)).toBeVisible();

  // --- Tarefa avulsa (mesma janela "Nova Tarefa" de Publicações, processo travado; só grava ao registrar a ata)
  await marcar(ata, 'Tarefa').check();
  await ata.getByRole('button', { name: '+ Cadastrar tarefa', exact: true }).first().click();
  await janela(page, 'Nova Tarefa').getByLabel('Título', { exact: true }).fill('Conferir cumprimento da ata');
  await janela(page, 'Nova Tarefa').getByRole('button', { name: 'Salvar Tarefa' }).click();
  await expect(ata.getByText(/Conferir Cumprimento Da Ata — vencimento/i)).toBeVisible();

  // --- Retornem aos autos (Sim + comentário)
  await marcar(ata, 'Retornem aos autos').check();
  await ata.getByRole('radio').first().check();
  await ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...').fill('retorno com comentário');

  // --- Nova audiência (designar, remover, designar de novo)
  await marcar(ata, 'Nova audiência').check();
  for (const rodada of [1, 2]) {
    await ata.getByRole('button', { name: rodada === 1 ? '📅 Designar nova audiência' : '📅 Designar nova audiência' }).click();
    const nova = janela(page, 'Nova Audiência');
    await nova.getByRole('button', { name: 'Data da audiência' }).click();
    await nova.getByRole('button', { name: 'Hoje', exact: true }).click();
    await nova.getByLabel('Hora').fill('14:30');
    await nova.getByRole('button', { name: 'Criar Audiência' }).click();
    // Dependendo da hora do dia, "Hoje 14:30" já passou e o sistema pede "Confirmar mesmo assim"; também pode pedir a senha.
    // Trata os dois avisos, em qualquer ordem, até a janela fechar.
    const senha = page.locator('input[type="password"]');
    const mesmoAssim = page.getByRole('button', { name: 'Confirmar mesmo assim' });
    for (let i = 0; i < 3 && await nova.count(); i++) {
      if (await mesmoAssim.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) await mesmoAssim.click();
      else if (await senha.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
        await senha.fill('TesteSeguro123!');
        await page.getByRole('button', { name: 'Confirmar e Agendar' }).click();
      }
    }
    await expect(nova).toHaveCount(0);
    await expect(ata.getByText('✓ Nova audiência pronta para ser registrada com a ata')).toBeVisible();
    await expect(ata.getByRole('button', { name: '📅 Editar nova audiência' })).toBeVisible();
    if (rodada === 1) {
      await ata.getByRole('button', { name: 'Remover' }).first().click();   // o "Remover" da nova audiência vem antes dos das listas
      await expect(ata.getByRole('button', { name: '📅 Designar nova audiência' })).toBeVisible();
    }
  }

  // --- Acordo (cadastra de verdade no Financeiro)
  await marcar(ata, 'Acordo').check();
  await ata.getByRole('button', { name: '💰 Registrar acordo' }).click();
  const acordo = janela(page, 'Novo Acordo');
  await acordo.getByPlaceholder('0,00').fill('1000');
  await acordo.getByPlaceholder('Ex: 25').fill('2');
  await acordo.locator('input[type="date"]').first().fill('2030-07-10');
  await acordo.getByRole('button', { name: 'Gerar parcelas' }).click();
  await acordo.getByRole('button', { name: 'Salvar acordo' }).click();
  await expect(acordo).toHaveCount(0);
  await expect(ata.getByText('✓ Acordo registrado no Financeiro')).toBeVisible();

  // --- Testemunha (cadastro rápido de pessoa)
  await marcar(ata, 'Testemunha(s)').check();
  await ata.getByRole('button', { name: '+ Testemunhas', exact: true }).click();
  await ata.getByRole('button', { name: '…' }).last().click();
  const pessoa = janela(page, 'Cadastrar Pessoa (Testemunha)');
  await pessoa.getByLabel('Nome completo').fill('Testemunha Da Ata');
  await pessoa.getByLabel('CPF').fill('52998224725');   // CPF válido de teste (o sistema exige)
  await pessoa.getByRole('button', { name: 'Cadastrar e Adicionar' }).click();
  await expect(page.getByText('Campos sem informação')).toBeVisible();   // aviso dos campos opcionais vazios
  await semViolacoes(page, 'aviso "Campos sem informação"');
  await page.getByRole('button', { name: 'Salvar assim' }).click();
  await expect(pessoa).toHaveCount(0);
  await expect(ata.getByText('Testemunha Da Ata — Testemunha de quem?')).toBeVisible();
  await ata.getByRole('button', { name: 'Autor Do Processo (Autor)' }).click();      // "testemunha de quem?" (a parte é sempre escolhida)
  await expect(ata.getByText('1 cadastrada(s) para a ATA')).toBeVisible();

  await semViolacoes(page, 'ata com todos os itens preenchidos');

  // --- Registrar
  const envio = page.waitForResponse(r => /\/audiencias\/\d+\/ata$/.test(r.url()) && r.request().method() === 'POST');
  await ata.getByRole('button', { name: 'Registrar Ata', exact: true }).click();
  const resposta = await envio;
  expect(resposta.status(), await resposta.text()).toBe(201);
  await expect(page.getByText('Ata registrada com sucesso!').first()).toBeVisible();
  await expect(ata).toHaveCount(0);
  await expect(linha).toContainText('Realizada');
  await erroDeTela(page);

  // --- O que ficou gravado no banco (conferência pela API)
  const t = await token(request);
  const lista = await (await request.get(`${API}/audiencias?limite=200`, { headers: cab(t) })).json();
  const todas = Array.isArray(lista.dados) ? lista.dados : Object.values(lista.dados).find(Array.isArray) || [];
  const original = todas.find(a => String(a.hora).startsWith('17:15'));
  expect(original.status).toBe('realizada');
  const detalhes = (await (await request.get(`${API}/audiencias/${original.id}/detalhes-ata`, { headers: cab(t) })).json()).dados;
  const ata2 = detalhes.ata;
  expect(ata2.advogado_nome).toBe('Dra. Freela Teste');
  expect(ata2.resultado).toContain('Todos os Desdobramentos');
  expect(ata2.observacoes).toContain('Observação de Teste');
  for (const marca of ['houve_acordo', 'nova_audiencia', 'teve_prazo', 'teve_pericia', 'teve_alvara', 'teve_desistencia', 'teve_retorno_autos']) {
    expect(ata2[marca], `marca ${marca} da ata`).toBe(1);
  }
  const tipos = detalhes.itens.map(i => i.tipo);
  expect([...tipos].sort()).toEqual(['acordo', 'desistencia', 'nova_audiencia', 'pericia', 'prazo', 'retorno_autos', 'tarefa', 'tarefa_alvara', 'tarefa_desistencia', 'testemunha']);
  const nova = todas.find(a => String(a.hora).startsWith('14:30'));
  expect(nova, 'a nova audiência designada na ata precisa ter sido criada').toBeTruthy();
});

test('@critical Ata: desmarcar uma caixa apaga o que foi preenchido nela (marcar de novo volta vazia)', async ({ page, request }) => {
  const { ata } = await abrirAta(page, request, '17:16');
  await marcar(ata, 'Prazo').check();
  await ata.getByRole('button', { name: '+ Cadastrar prazo' }).click();
  const prazo = janela(page, 'Cadastrar prazo da ata');
  const seletores = prazo.locator('.select-pesquisavel__control');
  await seletores.nth(0).click(); await page.getByText('Processual', { exact: true }).click();
  await seletores.nth(1).click(); await page.getByText('Contestação', { exact: true }).click();
  await prazo.getByLabel('Data final').fill('2030-06-10');
  await prazo.getByRole('button', { name: 'Adicionar à ata' }).click();
  await expect(ata.getByText(/Prazo — .* até 10\/06\/2030/)).toBeVisible();

  await marcar(ata, 'Desistência da Ação').check();
  await ata.getByRole('textbox', { name: 'Motivo da desistência' }).fill('motivo qualquer');
  await marcar(ata, 'Retornem aos autos').check();
  await ata.getByRole('radio').first().check();
  await ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...').fill('comentário qualquer');

  for (const item of ['Prazo', 'Desistência da Ação', 'Retornem aos autos']) await marcar(ata, item).uncheck();
  for (const item of ['Prazo', 'Desistência da Ação', 'Retornem aos autos']) await marcar(ata, item).check();
  await expect(ata.getByText(/Prazo — .* até/)).toHaveCount(0);
  await expect(ata.getByRole('textbox', { name: 'Motivo da desistência' })).toHaveValue('');
  await expect(ata.getByRole('radio').nth(1)).toBeChecked();                       // volta em "Não"
  await expect(ata.getByPlaceholder('Registre o comentário para consulta nos Detalhes da ATA...')).toHaveCount(0);
  await erroDeTela(page);
});

