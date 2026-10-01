import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ executar: vi.fn() }));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ResultadoAgrupado from './ResultadoAgrupado';

const metricas = [
  { chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero', formato: null },
  { chave: 'm2', rotulo: 'Soma de Valor bruto', funcao: 'soma', tipo: 'numero', formato: 'moeda' }];
const UM = { modo: 'agrupado', totalGrupos: 3, colunas: { grupos: [{ chave: 'status', rotulo: 'Status' }], metricas }, linhas: [
  { tipo: 'grupo', chaves: ['pendente'], rotulos: ['Pendente'], valores: [586, 1000.5] },
  { tipo: 'grupo', chaves: ['pago'], rotulos: ['Recebida'], valores: [293, 500] },
  { tipo: 'grupo', chaves: ['cancelada'], rotulos: ['Cancelada'], valores: [21, 100] },
  { tipo: 'total', valores: [900, 1600.5] }] };
const DOIS = { modo: 'agrupado', totalGrupos: 3, colunas: { grupos: [{ chave: 'v', rotulo: 'Vencimento', passo: 'mes' }, { chave: 'status', rotulo: 'Status' }], metricas }, linhas: [
  { tipo: 'grupo', chaves: ['2026-01', 'pago'], rotulos: ['01/2026', 'Recebida'], valores: [10, 100] },
  { tipo: 'grupo', chaves: ['2026-01', 'pendente'], rotulos: ['01/2026', 'Pendente'], valores: [5, 50] },
  { tipo: 'subtotal', chaves: ['2026-01'], rotulos: ['01/2026'], valores: [15, 150] },
  { tipo: 'grupo', chaves: ['2026-02', 'pendente'], rotulos: ['02/2026', 'Pendente'], valores: [7, 70] },
  { tipo: 'subtotal', chaves: ['2026-02'], rotulos: ['02/2026'], valores: [7, 70] },
  { tipo: 'total', valores: [22, 220] }] };

function montar(dados, extra = {}) {
  api.executar.mockResolvedValue({ data: { dados } });
  const props = { corpoBase: { receita: {} }, onAbrirGrupo: vi.fn(), aoMudarPreferencias: vi.fn(), nomeRelatorio: 'Parcelas', ...extra };
  render(<ResultadoAgrupado {...props} />);
  return props;
}
const graficoSvg = () => document.querySelector('svg[role="img"][aria-label^="Gráfico"]');

describe('Resultado agrupado — três visões', () => {
  beforeEach(() => { api.executar.mockReset(); });

  it('abre na tabela; troca para o gráfico e guarda a escolha como preferência', async () => {
    const props = montar(UM);
    expect(await screen.findByText('TOTAL GERAL')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Gráfico' }));
    expect(graficoSvg().getAttribute('aria-label')).toBe('Gráfico: Quantidade por Status');
    expect(props.aoMudarPreferencias).toHaveBeenCalledWith({ visao: 'grafico' });
    expect(screen.getByRole('button', { name: 'Gráfico' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('abre direto na visão preferida do relatório salvo', async () => {
    montar(UM, { preferencias: { visao: 'grafico', grafico: { tipo: 'barras', metrica: 'm2' } } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    expect(screen.getByLabelText('Tipo de gráfico').value).toBe('barras');
    expect(screen.getByLabelText('Total mostrado').value).toBe('m2');
    expect(graficoSvg().getAttribute('aria-label')).toBe('Gráfico: Soma de Valor bruto por Status');
  });

  it('colunas: uma coluna por grupo, com o valor lido no teclado/mouse e clique que abre os itens', async () => {
    const props = montar(UM, { preferencias: { visao: 'grafico' } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    const faixas = within(graficoSvg()).getAllByRole('img');
    expect(faixas).toHaveLength(3);
    expect(faixas[0].getAttribute('aria-label')).toBe('Pendente: Quantidade 586');
    fireEvent.focus(faixas[1]);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('293');
    expect(screen.getByRole('status').textContent).toContain('Recebida');
    fireEvent.click(faixas[1]);
    expect(props.onAbrirGrupo).toHaveBeenCalledWith(['pago'], ['Recebida']);
  });

  it('o total de dinheiro aparece em R$ no gráfico (tooltip e rótulo da maior barra)', async () => {
    montar(UM, { preferencias: { visao: 'grafico', grafico: { metrica: 'm2' } } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    expect(within(graficoSvg()).getAllByRole('img')[0].getAttribute('aria-label')).toMatch(/R\$\s*1\.000,50/);
    expect(graficoSvg().textContent).toMatch(/R\$\s*1\.000,50/);                       // só a maior barra tem o valor escrito
    expect(graficoSvg().textContent).not.toMatch(/R\$\s*500,00/);
  });

  it('trocar o tipo de gráfico e o total salva a preferência (mesclando, sem apagar a visão)', async () => {
    const props = montar(UM, { preferencias: { visao: 'grafico' } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText('Tipo de gráfico'), 'linhas');
    expect(props.aoMudarPreferencias).toHaveBeenCalledWith({ grafico: { tipo: 'linhas' } });
    expect(graficoSvg().querySelectorAll('circle')).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('Total mostrado'), 'm2');
    expect(props.aoMudarPreferencias).toHaveBeenCalledWith({ grafico: { metrica: 'm2' } });
  });

  it('rosca: disponível com poucos grupos positivos, com legenda de valor e percentual; indisponível com 2 níveis', async () => {
    montar(UM, { preferencias: { visao: 'grafico', grafico: { tipo: 'rosca' } } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    expect(graficoSvg().querySelectorAll('path')).toHaveLength(3);
    const legenda = screen.getByRole('list', { name: 'Legenda do gráfico' });
    expect(legenda.textContent).toContain('Pendente');
    expect(legenda.textContent).toMatch(/65,1%/);                                      // 586 de 900
  });

  it('dois níveis: legenda com as séries, empilhar e rosca bloqueada', async () => {
    montar(DOIS, { preferencias: { visao: 'grafico' } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    expect(screen.getByLabelText('Tipo de gráfico').value).toBe('linhas');             // data no 1º nível => linhas
    const legenda = screen.getByRole('list', { name: 'Legenda do gráfico' });
    expect(within(legenda).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Recebida', 'Pendente']);
    expect(screen.getByRole('option', { name: /Rosca/ }).disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Tipo de gráfico'), 'colunas');
    await userEvent.click(screen.getByLabelText('Empilhar as séries'));
    expect(screen.getByLabelText('Empilhar as séries').checked).toBe(true);
  });

  it('preferência de rosca que não cabe mais (2 níveis) cai em colunas e explica o motivo', async () => {
    montar(DOIS, { preferencias: { visao: 'grafico', grafico: { tipo: 'rosca' } } });
    await waitFor(() => expect(graficoSvg()).toBeTruthy());
    expect(screen.getByRole('note').textContent).toMatch(/um nível/);
    expect(screen.getByLabelText('Tipo de gráfico').value).toBe('colunas');
  });

  it('tabela cruzada: só com 2 níveis; mostra a matriz, os totais e abre os itens da célula', async () => {
    const props = montar(DOIS);
    await screen.findByText('TOTAL GERAL');
    await userEvent.click(screen.getByRole('button', { name: 'Tabela cruzada' }));
    const tabela = screen.getByRole('table');
    expect(within(tabela).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Vencimento \\ Status', 'Recebida', 'Pendente', 'Total']);
    const celula = within(tabela).getAllByRole('cell').find(c => c.textContent === '7');
    await userEvent.click(celula);
    expect(props.onAbrirGrupo).toHaveBeenCalledWith(['2026-02', 'pendente'], ['02/2026', 'Pendente']);
    const total = within(tabela).getByText('TOTAL GERAL').closest('tr');
    expect(within(total).getAllByRole('cell').map(c => c.textContent)).toEqual(['TOTAL GERAL', '10', '12', '22']);
  });

  it('com 1 nível a tabela cruzada fica desabilitada; sem grupo nenhum nem há botões', async () => {
    montar(UM);
    await screen.findByText('TOTAL GERAL');
    expect(screen.getByRole('button', { name: 'Tabela cruzada' }).disabled).toBe(true);
  });

  it('visão preferida "cruzada" sem 2 níveis volta para a tabela', async () => {
    montar(UM, { preferencias: { visao: 'cruzada' } });
    expect(await screen.findByText('TOTAL GERAL')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tabela' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('gráfico sem agrupamento explica o que fazer (e a tela não oferece visões)', async () => {
    montar({ modo: 'agrupado', totalGrupos: 0, colunas: { grupos: [], metricas }, linhas: [{ tipo: 'total', valores: [5, 10] }] });
    expect(await screen.findByText('TOTAL GERAL')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gráfico' })).toBeNull();
  });
});
