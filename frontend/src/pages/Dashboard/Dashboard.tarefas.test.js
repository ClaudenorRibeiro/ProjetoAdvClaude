import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FiltrosTarefas } from './Dashboard';

const raiz = process.cwd();
const dashboard = fs.readFileSync(path.join(raiz, 'src/pages/Dashboard/Dashboard.js'), 'utf8');
const api = fs.readFileSync(path.join(raiz, 'src/services/api.js'), 'utf8');

describe('Dashboard — filtros das tarefas pendentes', () => {
  it.each([
    ['Hoje', 'hoje'],
    ['7 dias', '7_dias'],
    ['30 dias', '30_dias'],
    ['Todas', 'todas'],
  ])('seleciona o filtro %s', async (rotulo, periodo) => {
    const usuario = userEvent.setup();
    const aoSelecionar = vi.fn();
    render(React.createElement(FiltrosTarefas, {
      periodoSelecionado: '30_dias',
      onSelecionar: aoSelecionar,
    }));

    await usuario.click(screen.getByRole('button', { name: rotulo }));
    expect(aoSelecionar).toHaveBeenCalledWith(periodo);
  });

  it('envia o período selecionado ao Dashboard e atualiza a lista', () => {
    expect(dashboard).toContain("useState('30_dias')");
    expect(dashboard).toContain('periodo_tarefas: periodo');
    expect(dashboard).toContain('onSelecionar={setPeriodoTarefas}');
    expect(api).toContain("buscarDados: (params) => api.get('/dashboard', { params })");
  });

  it('marca exclusivamente o filtro escolhido para leitores de tela', () => {
    expect(dashboard).toContain('aria-pressed={periodoSelecionado === valor}');
  });
});
