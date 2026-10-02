import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ executar: vi.fn(), exportar: vi.fn(), salvarPreferencias: vi.fn() }));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
const avisos = vi.hoisted(() => ({ erro: vi.fn(), ok: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: avisos.ok, error: avisos.erro } }));
// o desenho do PNG precisa de canvas de verdade (navegador); aqui só interessa que a imagem vá junto do pedido
vi.mock('./grafico/exportarPng', async (original) => ({ ...(await original()), pngEmDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'), baixarPng: vi.fn() }));

import Resultado from './Resultado';

const metricas = [{ chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero', formato: null }];
const AGRUPADO = { modo: 'agrupado', totalGrupos: 2, colunas: { grupos: [{ chave: 'status', rotulo: 'Status' }], metricas }, linhas: [
  { tipo: 'grupo', chaves: ['a'], rotulos: ['Pendente'], valores: [5] }, { tipo: 'grupo', chaves: ['b'], rotulos: ['Recebida'], valores: [3] }, { tipo: 'total', valores: [8] }] };
const LISTA = { colunas: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta' }], linhas: [{ pasta: '0001', __pasta_id: 1 }], total: 1, pagina: 1, limite: 50, limiteTela: 2000, truncado: false };
const RECEITA_AGRUPADA = { versao: 2, assunto: 'prazos', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }], ordemGrupo: null };
const RECEITA_LISTA = { ...RECEITA_AGRUPADA, agrupar: [], metricas: [] };

function montar(receita, dados) {
  api.executar.mockResolvedValue({ data: { dados } });
  api.exportar.mockResolvedValue({ data: new Blob(['x']), headers: { 'content-disposition': "attachment; filename=\"relatorio.pdf\"; filename*=UTF-8''Prazos%20-%202026-10-01.pdf" } });
  render(<MemoryRouter><Resultado receita={receita} modelo={null} parametros={null} temPerguntas={false} onVoltar={() => {}} onEditar={() => {}} onPerguntas={() => {}} /></MemoryRouter>);
}

describe('Exportar em PDF e Word', () => {
  beforeEach(() => {
    Object.values(api).forEach(f => f.mockReset()); avisos.erro.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:x'); global.URL.revokeObjectURL = vi.fn();
    // O download clica num link; o jsdom não navega (e reclama). Aqui o clique é só absorvido.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('três botões: Excel, PDF e Word; cada um pede o formato certo (lista simples, sem gráfico)', async () => {
    montar(RECEITA_LISTA, LISTA);
    await screen.findByText('0001');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_LISTA, formato: 'pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_LISTA, formato: 'docx' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_LISTA, formato: 'xlsx' }));
    expect(screen.queryByRole('checkbox', { name: /Incluir o gráfico/ })).toBeNull();
  });

  it('agrupado na tabela: pede o PDF sem gráfico; "incluir os itens" vai junto', async () => {
    montar(RECEITA_AGRUPADA, AGRUPADO);
    await screen.findByText('TOTAL GERAL');
    expect(screen.queryByRole('checkbox', { name: /Incluir o gráfico/ })).toBeNull();          // gráfico fora da tela: nada a incluir
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_AGRUPADA, formato: 'pdf', incluirDetalhes: false }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Incluir os itens/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_AGRUPADA, formato: 'docx', incluirDetalhes: true }));
  });

  it('com o gráfico na tela: a imagem vai no PDF e no Word; desmarcar tira; o Excel nunca leva imagem', async () => {
    montar(RECEITA_AGRUPADA, AGRUPADO);
    await screen.findByText('TOTAL GERAL');
    await userEvent.click(screen.getByRole('button', { name: 'Gráfico' }));
    const caixa = await screen.findByRole('checkbox', { name: /Incluir o gráfico/ });
    expect(caixa.checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_AGRUPADA, formato: 'pdf', incluirDetalhes: false, grafico: 'data:image/png;base64,AAAA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_AGRUPADA, formato: 'xlsx', incluirDetalhes: false }));
    await userEvent.click(caixa);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    await waitFor(() => expect(api.exportar).toHaveBeenLastCalledWith({ receita: RECEITA_AGRUPADA, formato: 'docx', incluirDetalhes: false }));
  });

  it('voltar para a tabela retira a opção do gráfico (ele não está mais na tela)', async () => {
    montar(RECEITA_AGRUPADA, AGRUPADO);
    await screen.findByText('TOTAL GERAL');
    await userEvent.click(screen.getByRole('button', { name: 'Gráfico' }));
    await screen.findByRole('checkbox', { name: /Incluir o gráfico/ });
    await userEvent.click(screen.getByRole('button', { name: 'Tabela' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Incluir o gráfico/ })).toBeNull());
  });

  it('mostra "Gerando PDF..." e bloqueia os outros botões enquanto gera', async () => {
    montar(RECEITA_LISTA, LISTA);
    await screen.findByText('0001');
    let liberar; api.exportar.mockReturnValue(new Promise((ok) => { liberar = ok; }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(screen.getByRole('button', { name: 'Gerando PDF...' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar Word' }).disabled).toBe(true);
    liberar({ data: new Blob(['x']), headers: {} });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exportar PDF' }).disabled).toBe(false));
  });

  it('recusa do servidor (limite de 1.000 linhas) aparece com a mensagem dele', async () => {
    montar(RECEITA_LISTA, LISTA);
    await screen.findByText('0001');
    const corpo = JSON.stringify({ ok: false, mensagem: 'Este relatório tem 1.500 linhas e o máximo para PDF/Word é 1.000. Use o Excel (até 50.000 linhas) ou refine os filtros.' });
    api.exportar.mockRejectedValue({ response: { data: new Blob([corpo]) } });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => expect(avisos.erro).toHaveBeenCalledWith(expect.stringContaining('máximo para PDF/Word é 1.000')));
    expect(screen.getByRole('button', { name: 'Exportar PDF' }).disabled).toBe(false);          // libera para tentar de novo
  });
});
