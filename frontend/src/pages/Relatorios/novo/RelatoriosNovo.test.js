import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  catalogo: vi.fn(), listarModelos: vi.fn(), criarModelo: vi.fn(), atualizarModelo: vi.fn(), excluirModelo: vi.fn(),
  duplicarModelo: vi.fn(), salvarPreferencias: vi.fn(), executar: vi.fn(), exportar: vi.fn(), obterLimites: vi.fn(), salvarLimites: vi.fn(),
}));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const auth = vi.hoisted(() => ({ podeCriar: true, ehAdmin: true }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ ehAdmin: auth.ehAdmin, temPermissao: (m) => (m === 'relatorios.criar' ? auth.podeCriar : true) }),
}));

import RelatoriosNovo from './RelatoriosNovo';
import { toast } from 'react-toastify';

const op = (valor, rotulo, aridade) => ({ valor, rotulo, aridade });
const CATALOGO = {
  periodos: [{ valor: 'este_mes', rotulo: 'Este mês' }],
  assuntos: [{
    chave: 'prazos', rotulo: 'Prazos', colunasPadrao: ['pasta', 'processo', 'vencimento', 'status'], ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
    campos: [
      { chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta', operadores: [op('contem', 'contém', 'um'), op('vazio', 'está vazio', 'nenhum')], opcoes: null },
      { chave: 'processo', rotulo: 'Processo', tipo: 'texto', formato: 'processo', operadores: [op('contem', 'contém', 'um')], opcoes: null },
      { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', formato: null, operadores: [op('igual', 'é', 'um'), op('no_periodo', 'no período', 'periodo')], opcoes: null },
      { chave: 'status', rotulo: 'Status', tipo: 'lista', formato: null, operadores: [op('em', 'é um destes', 'lista')], opcoes: [{ valor: 'atrasado', rotulo: 'Atrasado' }] },
      { chave: 'concluido', rotulo: 'Concluído', tipo: 'booleano', formato: null, operadores: [op('verdadeiro', 'é sim', 'nenhum')], opcoes: null },
    ],
  }],
};
const RECEITA = { versao: 1, assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] }, ordem: [] };
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
  auth.podeCriar = true; auth.ehAdmin = true;
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
        versao: 1, assunto: 'prazos', colunas: ['pasta', 'processo', 'vencimento'],
        filtros: { op: 'E', itens: [{ campo: 'pasta', operador: 'contem', valor: '8969' }] },
        ordem: [{ campo: 'vencimento', direcao: 'asc' }],
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

  it('administrador ajusta o limite padrão e o limite individual', async () => {
    const user = userEvent.setup();
    const limites = { padrao: 10, maximoPermitido: 500, usuarios: [{ id: 4, nome: 'Chefe', login: 'chefe', max_relatorios: null, criados: 2 }] };
    api.obterLimites.mockResolvedValue({ data: { dados: limites } });
    api.salvarLimites.mockResolvedValue({ data: { dados: { ...limites, padrao: 12, usuarios: [{ ...limites.usuarios[0], max_relatorios: 30 }] } } });
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Limites por usuário' }));
    const padrao = await screen.findByRole('spinbutton', { name: /Limite padrão/ });
    await user.clear(padrao); await user.type(padrao, '12');
    await user.type(screen.getByRole('spinbutton', { name: 'Limite de Chefe' }), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar limites' }));
    await waitFor(() => expect(api.salvarLimites).toHaveBeenCalledWith({ padrao: 12, usuarios: { 4: 30 } }));
  });
});
