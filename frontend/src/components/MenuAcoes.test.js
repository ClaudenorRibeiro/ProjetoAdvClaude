import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MenuAcoes from './MenuAcoes';

describe('MenuAcoes', () => {
  it('não renderiza botão quando todas as ações estão ocultas', () => {
    render(React.createElement(MenuAcoes, { itens: [{ label: 'Excluir', oculto: true, onClick: vi.fn() }] }));
    expect(screen.queryByTitle('Mais ações')).not.toBeInTheDocument();
  });

  it('abre somente ações permitidas e executa a escolhida', async () => {
    const user = userEvent.setup();
    const editar = vi.fn();
    render(React.createElement(MenuAcoes, { itens: [
      { label: 'Editar', onClick: editar },
      { label: 'Excluir', oculto: true, onClick: vi.fn() },
    ] }));

    await user.click(screen.getByTitle('Mais ações'));
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(editar).toHaveBeenCalledOnce();
  });
});
