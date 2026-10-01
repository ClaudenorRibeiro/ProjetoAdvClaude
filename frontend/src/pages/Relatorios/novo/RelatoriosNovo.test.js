import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  catalogo: vi.fn(), listarModelos: vi.fn(), criarModelo: vi.fn(), atualizarModelo: vi.fn(), excluirModelo: vi.fn(),
  duplicarModelo: vi.fn(), salvarPreferencias: vi.fn(), executar: vi.fn(), exportar: vi.fn(),
}));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const auth = vi.hoisted(() => ({ podeCriar: true }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ temPermissao: (m) => (m === 'relatorios.criar' ? auth.podeCriar : true) }),
}));

import RelatoriosNovo from './RelatoriosNovo';
import { toast } from 'react-toastify';

const op = (valor, rotulo, aridade) => ({ valor, rotulo, aridade });
const FUN_NUM = [{ valor: 'soma', rotulo: 'Soma' }, { valor: 'media', rotulo: 'Média' }, { valor: 'minimo', rotulo: 'Mínimo' }, { valor: 'maximo', rotulo: 'Máximo' }];
const FUN_DATA = [{ valor: 'minimo', rotulo: 'Mínimo' }, { valor: 'maximo', rotulo: 'Máximo' }];
const PASSOS = [{ valor: 'dia', rotulo: 'Dia' }, { valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'ano', rotulo: 'Ano' }];
const campo = (extra) => ({ formato: null, opcoes: null, agrupavel: false, passos: null, funcoes: [], ...extra });
const CATALOGO = {
  periodos: [{ valor: 'este_mes', rotulo: 'Este mês' }],
  assuntos: [{
    chave: 'prazos', rotulo: 'Prazos', colunasPadrao: ['pasta', 'processo', 'vencimento', 'status'], ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
    campos: [
      campo({ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta', agrupavel: true, operadores: [op('contem', 'contém', 'um'), op('vazio', 'está vazio', 'nenhum')] }),
      campo({ chave: 'processo', rotulo: 'Processo', tipo: 'texto', formato: 'processo', agrupavel: true, operadores: [op('contem', 'contém', 'um')] }),
      campo({ chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', operadores: [op('contem', 'contém', 'um')] }),
      campo({ chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', agrupavel: true, passos: PASSOS, funcoes: FUN_DATA, operadores: [op('igual', 'é', 'um'), op('entre', 'entre', 'dois'), op('no_periodo', 'no período', 'periodo')] }),
      campo({ chave: 'status', rotulo: 'Status', tipo: 'lista', agrupavel: true, operadores: [op('em', 'é um destes', 'lista')], opcoes: [{ valor: 'atrasado', rotulo: 'Atrasado' }] }),
      campo({ chave: 'concluido', rotulo: 'Concluído', tipo: 'booleano', agrupavel: true, operadores: [op('verdadeiro', 'é sim', 'nenhum')] }),
      campo({ chave: 'quantidade', rotulo: 'Quantidade de dias', tipo: 'numero', agrupavel: true, funcoes: FUN_NUM, operadores: [op('igual', 'é igual a', 'um')] }),
    ],
  }],
};
const RECEITA = { versao: 2, assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [], ordemGrupo: null };
const MODELO = { id: 5, nome: 'Prazos da semana', descricao: 'dia a dia', assunto: 'prazos', receita: RECEITA, preferencias: {}, criado_em: '2026-10-01 09:00:00', alterado_em: null };
const RESULTADO = {
  colunas: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta' }, { chave: 'processo', rotulo: 'Processo', tipo: 'texto', formato: 'processo' },
    { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', formato: null }, { chave: 'concluido', rotulo: 'Concluído', tipo: 'booleano', formato: null }],
  linhas: [{ pasta: '8969', processo: '1001308-02.2026.5.02.0054', vencimento: '2026-10-14', concluido: true, __pasta_id: 77 }],
  total: 1, pagina: 1, limite: 50, limiteTela: 2000, truncado: false, receita: RECEITA, modelo: null,
};

function abrir() {
  return render(<MemoryRouter><RelatoriosNovo /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.podeCriar = true;
  api.catalogo.mockResolvedValue({ data: { dados: CATALOGO } });
  api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [MODELO], limite: 10, criados: 1 } } });
  api.executar.mockResolvedValue({ data: { dados: RESULTADO } });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x'); globalThis.URL.revokeObjectURL = vi.fn();
});

describe('Relatórios (tela nova)', () => {
  it('lista os relatórios do usuário com o uso do limite', async () => {
    abrir();
    expect(await screen.findByText('Prazos da semana', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByText(/de/, { selector: 'span' })).toHaveTextContent('Você usa 1 de 10 relatórios permitidos.');
    expect(screen.getByRole('button', { name: '+ Novo relatório' })).toBeEnabled();
  });

  it('com o limite atingido, "Novo relatório" fica bloqueado; sem permissão de criar, some', async () => {
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [MODELO], limite: 1, criados: 1 } } });
    const { unmount } = abrir();
    expect(await screen.findByRole('button', { name: '+ Novo relatório' })).toBeDisabled();
    unmount();
    auth.podeCriar = false;
    abrir();
    await screen.findByText('Prazos da semana', { selector: 'button' });
    expect(screen.queryByRole('button', { name: '+ Novo relatório' })).not.toBeInTheDocument();
  });

  it('monta um relatório novo (assunto → colunas → filtro) e roda com a receita certa', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    expect(screen.getByRole('button', { name: 'Ver resultado' })).toBeDisabled();           // sem assunto ainda
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    expect(screen.getByRole('checkbox', { name: 'Pasta' })).toBeChecked();                 // colunas padrão
    await user.click(screen.getByRole('checkbox', { name: 'Status' }));                    // tira Status

    await user.click(screen.getByRole('button', { name: '+ Condição' }));
    expect(screen.getByText('Preencha o valor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver resultado' })).toBeDisabled();           // filtro sem valor bloqueia
    const selOperador = screen.getByLabelText('Condição do filtro');
    expect(within(selOperador).getAllByRole('option').map(o => o.textContent)).toEqual(['contém', 'está vazio']); // só o que o tipo permite
    await user.type(screen.getByLabelText('Valor de Pasta'), '8969');

    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    expect(api.executar.mock.calls[0][0]).toEqual({
      receita: {
        versao: 2, assunto: 'prazos', colunas: ['pasta', 'processo', 'vencimento'],
        filtros: { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: '8969' }] },
        ordem: [{ campo: 'vencimento', direcao: 'asc' }], agrupar: [], metricas: [], ordemGrupo: null,
      }, pagina: 1, limite: 50,
    });
    expect(await screen.findByText('1 registro(s) — mostrando 1–1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '8969' })).toHaveAttribute('href', '/processos/pasta/77');
    expect(screen.getByText('14/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar número 1001308-02.2026.5.02.0054' })).toBeInTheDocument();
    expect(screen.getByText('Relatório não salvo')).toBeInTheDocument();
  });

  it('salva o relatório com nome e volta para a lista', async () => {
    const user = userEvent.setup();
    api.criarModelo.mockResolvedValue({ data: { mensagem: 'Relatório salvo', dados: { ...MODELO, id: 9, nome: 'Novo' } } });
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    await user.click(screen.getByRole('button', { name: 'Salvar relatório' }));
    const salvar = within(screen.getByRole('dialog'));
    expect(salvar.getByRole('button', { name: 'Salvar' })).toBeDisabled();                   // nome obrigatório
    await user.type(salvar.getByRole('textbox', { name: /Nome do relatório/ }), '  Meu relatório ');
    await user.click(salvar.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.criarModelo).toHaveBeenCalled());
    expect(api.criarModelo.mock.calls[0][0].nome).toBe('Meu relatório');
    expect(await screen.findByRole('button', { name: '+ Novo relatório' })).toBeInTheDocument(); // voltou à lista
  });

  it('mostra a mensagem do servidor quando o salvamento é recusado (ex.: limite)', async () => {
    const user = userEvent.setup();
    api.criarModelo.mockRejectedValue({ response: { data: { mensagem: 'Você já tem 10 de 10 relatórios permitidos.' } } });
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    await user.click(screen.getByRole('button', { name: 'Salvar relatório' }));
    await user.type(screen.getByRole('textbox', { name: /Nome do relatório/ }), 'X');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você já tem 10 de 10 relatórios permitidos.'));
  });

  it('abre um relatório salvo pelo id, exporta o Excel e baixa o arquivo', async () => {
    const user = userEvent.setup();
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api.exportar.mockResolvedValue({ data: new Blob(['x']), headers: { 'content-disposition': "attachment; filename=\"relatorio.xlsx\"; filename*=UTF-8''Prazos%20da%20semana%20-%202026-10-01.xlsx" } });
    abrir();
    await user.click(await screen.findByText('Prazos da semana', { selector: 'button' }));
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    expect(api.executar.mock.calls[0][0]).toEqual({ modelo_id: 5, pagina: 1, limite: 50 });
    await user.click(await screen.findByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(api.exportar).toHaveBeenCalledWith({ modelo_id: 5, formato: 'xlsx' }));
    await waitFor(() => expect(clicar).toHaveBeenCalled());
    clicar.mockRestore();
  });

  it('avisa quando o resultado passa do limite da tela e mostra o erro do servidor se a consulta falhar', async () => {
    const user = userEvent.setup();
    api.executar.mockResolvedValueOnce({ data: { dados: { ...RESULTADO, total: 5000, truncado: true } } });
    abrir();
    await user.click(await screen.findByText('Prazos da semana', { selector: 'button' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/mostra só os primeiros 2\.000/);
    expect(screen.getByText(/Página 1 de 40/)).toBeInTheDocument();

    api.executar.mockRejectedValueOnce({ response: { data: { mensagem: 'Você não tem permissão para relatórios de Prazos.' } } });
    await user.click(screen.getByRole('button', { name: 'Próxima ›' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para relatórios de Prazos.');
  });

  const AGRUPADO = {
    modo: 'agrupado', totalGrupos: 2, limiteGrupos: 2000, receita: RECEITA, modelo: null,
    colunas: { grupos: [{ chave: 'status', rotulo: 'Status', passo: null }], metricas: [{ chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero' }, { chave: 'm2', rotulo: 'Média de Quantidade de dias', funcao: 'media', tipo: 'numero' }] },
    linhas: [
      { tipo: 'grupo', nivel: 1, chaves: ['agendado'], rotulos: ['Agendado'], valores: [5, 12.5] },
      { tipo: 'grupo', nivel: 1, chaves: ['atrasado'], rotulos: ['Atrasado'], valores: [3, null] },
      { tipo: 'total', nivel: 0, chaves: [], rotulos: [], valores: [8, 12.5] },
    ],
  };

  it('agrupar: o passo oferece só o que faz sentido, roda agrupado e mostra grupos e total geral', async () => {
    const user = userEvent.setup();
    api.executar.mockResolvedValue({ data: { dados: AGRUPADO } });
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');

    const agrupar = screen.getByLabelText('Agrupar por (1)');
    const opcoes = within(agrupar).getAllByRole('option').map(o => o.textContent);
    expect(opcoes).toContain('Status');
    expect(opcoes).not.toContain('Descrição');                                    // texto livre não agrupa
    await user.selectOptions(agrupar, 'status');
    expect(screen.getByLabelText('Total 1')).toHaveValue('contagem');            // a contagem entra sozinha
    const funcoes = within(screen.getByLabelText('Total 1')).getAllByRole('option').map(o => o.textContent);
    expect(funcoes).toEqual(['Quantidade', 'Soma', 'Média', 'Mínimo', 'Máximo']);
    await user.click(screen.getByRole('button', { name: '+ Total' }));
    await user.selectOptions(screen.getByLabelText('Total 2'), 'media');
    expect(screen.getByLabelText('Campo do total 2')).toHaveValue('quantidade');  // só números aparecem para média

    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    const corpo = api.executar.mock.calls[0][0];
    expect(corpo.receita.agrupar).toEqual([{ campo: 'status' }]);
    expect(corpo.receita.metricas).toEqual([{ funcao: 'contagem' }, { funcao: 'media', campo: 'quantidade' }]);
    expect(corpo.pagina).toBeUndefined();                                         // agrupado não pagina

    expect(await screen.findByText('2 grupo(s). Clique em um grupo para ver os itens dele.')).toBeInTheDocument();
    expect(screen.getByText('Agendado').closest('tr')).toHaveTextContent('512,50');
    expect(screen.getByText('Atrasado').closest('tr')).toHaveTextContent('3—');   // média sem valor aparece como traço
    expect(screen.getByText('TOTAL GERAL').closest('tr')).toHaveTextContent('812,50');
  });

  it('data agrupa por mês por padrão e deixa trocar para dia, semana ou ano; segundo nível não repete o campo', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    await user.selectOptions(screen.getByLabelText('Agrupar por (1)'), 'vencimento');
    expect(screen.getByLabelText('Agrupar Vencimento por')).toHaveValue('mes');
    expect(within(screen.getByLabelText('Agrupar Vencimento por')).getAllByRole('option').map(o => o.textContent)).toEqual(['por dia', 'por semana', 'por mês', 'por ano']);
    await user.selectOptions(screen.getByLabelText('Agrupar Vencimento por'), 'semana');
    expect(within(screen.getByLabelText('Agrupar por (2)')).queryByRole('option', { name: 'Vencimento' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Agrupar por (2)'), 'status');
    await user.selectOptions(screen.getByLabelText('Agrupar por (1)'), '');          // limpar o 1º limpa o 2º
    expect(screen.queryByLabelText('Agrupar por (2)')).not.toBeInTheDocument();
  });

  it('clicar num grupo abre os itens dele; o Excel agrupado pode incluir os detalhes', async () => {
    const user = userEvent.setup();
    const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [{ ...MODELO, receita: { ...RECEITA, agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }] } }], limite: 10, criados: 1 } } });
    api.executar.mockImplementation(async (corpo) => ({ data: { dados: corpo.grupo ? { ...RESULTADO, total: 1 } : AGRUPADO } }));
    api.exportar.mockResolvedValue({ data: new Blob(['x']), headers: {} });
    abrir();
    await user.click(await screen.findByText('Prazos da semana', { selector: 'button' }));
    await user.click(await screen.findByText('Atrasado'));
    const janela = await screen.findByRole('dialog', { name: 'Itens do grupo' });
    expect(within(janela).getByText('Itens: Atrasado')).toBeInTheDocument();
    await waitFor(() => expect(api.executar).toHaveBeenCalledWith(expect.objectContaining({ modelo_id: 5, grupo: ['atrasado'] })));
    expect(await within(janela).findByText('8969')).toBeInTheDocument();
    await user.click(within(janela).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: 'Itens do grupo' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ modelo_id: 5, formato: 'xlsx', incluirDetalhes: false }));
    await user.click(screen.getByRole('checkbox', { name: /Incluir os itens/ }));
    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ modelo_id: 5, formato: 'xlsx', incluirDetalhes: true }));
    clicar.mockRestore();
  });

  it('perguntar ao abrir: pergunta antes de rodar, só libera com tudo respondido e envia as respostas por caminho', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    await user.click(screen.getByRole('button', { name: '+ Condição' }));                       // Pasta contém ...
    await user.click(screen.getByRole('checkbox', { name: /Perguntar ao abrir/ }));
    expect(screen.queryByText('Preencha o valor')).not.toBeInTheDocument();                   // vazio é permitido: será perguntado
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));

    const janela = await screen.findByRole('dialog', { name: 'Perguntas do relatório' });
    expect(api.executar).not.toHaveBeenCalled();                                                // não roda antes de responder
    const rodar = within(janela).getByRole('button', { name: 'Rodar relatório' });
    expect(rodar).toBeDisabled();
    await user.type(within(janela).getByLabelText('Valor de Pasta'), '8969');
    await user.click(rodar);
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    const corpo = api.executar.mock.calls[0][0];
    expect(corpo.parametros).toEqual([{ caminho: [0], valor: '8969' }]);
    expect(corpo.receita.filtros.itens[0]).toMatchObject({ campo: 'pasta', operador: 'contem', perguntar: true });
    await user.click(await screen.findByRole('button', { name: 'Alterar respostas' }));
    expect(within(await screen.findByRole('dialog', { name: 'Perguntas do relatório' })).getByLabelText('Valor de Pasta')).toHaveValue('8969'); // lembra a última resposta
  });

  it('data relativa: "hoje" mais ou menos N dias fica na receita como objeto', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: '+ Novo relatório' }));
    await user.selectOptions(screen.getByLabelText('Assunto do relatório'), 'prazos');
    await user.click(screen.getByRole('button', { name: '+ Condição' }));
    await user.selectOptions(screen.getByLabelText('Campo do filtro'), 'vencimento');          // operador "é"
    await user.selectOptions(screen.getByLabelText(/Valor de Vencimento: tipo de data/), 'relativa');
    expect(screen.getByRole('button', { name: 'Ver resultado' })).toBeEnabled();                // 0 dias = hoje: já está completo
    const dias = screen.getByLabelText(/dias a somar/);
    await user.clear(dias);
    expect(screen.getByRole('button', { name: 'Ver resultado' })).toBeDisabled();               // dias vazio bloqueia
    await user.type(dias, '-30');
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    expect(api.executar.mock.calls[0][0].receita.filtros.itens[0]).toEqual({ campo: 'vencimento', operador: 'igual', valor: { rel: 'hoje', dias: -30 } });
  });
});
