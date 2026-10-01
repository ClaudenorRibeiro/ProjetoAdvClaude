import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ executar: vi.fn() }));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));

import TabelaResultado from './TabelaResultado';
import ResultadoAgrupado from './ResultadoAgrupado';

describe('Relatórios — valores em R$ (formato "moeda")', () => {
  it('lista: mostra R$ com vírgula e alinha à direita; número comum continua sem R$', () => {
    const colunas = [
      { chave: 'valor_bruto', rotulo: 'Valor bruto', tipo: 'numero', formato: 'moeda' },
      { chave: 'parcela', rotulo: 'Nº da parcela', tipo: 'numero', formato: null },
    ];
    render(<MemoryRouter><TabelaResultado colunas={colunas} linhas={[{ valor_bruto: 1500.5, parcela: 3 }, { valor_bruto: null, parcela: 4 }]} /></MemoryRouter>);
    const dinheiro = screen.getByText(/R\$\s*1\.500,50/);
    expect(dinheiro.closest('td').style.textAlign).toBe('right');
    expect(screen.getByText('3').textContent).not.toMatch(/R\$/);
    expect(screen.getAllByText('—')).toHaveLength(1);                       // valor vazio continua "—", não "R$ 0,00"
  });

  it('agrupado: soma e média de dinheiro em R$; a quantidade não ganha R$', async () => {
    api.executar.mockResolvedValue({ data: { dados: {
      modo: 'agrupado', totalGrupos: 1,
      colunas: {
        grupos: [{ chave: 'status', rotulo: 'Status da parcela' }],
        metricas: [{ chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero', formato: null },
          { chave: 'm2', rotulo: 'Soma de Valor bruto', funcao: 'soma', tipo: 'numero', formato: 'moeda' },
          { chave: 'm3', rotulo: 'Média de Valor bruto', funcao: 'media', tipo: 'numero', formato: 'moeda' }],
      },
      linhas: [{ tipo: 'grupo', chaves: ['pago'], rotulos: ['Recebida'], valores: [2, 1234.5, 617.25] },
        { tipo: 'total', valores: [2, 1234.5, 617.25] }],
    } } });
    render(<ResultadoAgrupado corpoBase={{ receita: {} }} onAbrirGrupo={() => {}} />);
    expect((await screen.findAllByText(/R\$\s*1\.234,50/)).length).toBe(2);      // grupo e total geral
    expect(screen.getAllByText(/R\$\s*617,25/).length).toBe(2);
    expect(screen.getAllByText('2').every(el => !/R\$/.test(el.textContent))).toBe(true);
  });
});
