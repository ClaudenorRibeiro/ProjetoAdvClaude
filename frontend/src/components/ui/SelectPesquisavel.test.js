import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SelectPesquisavel from './SelectPesquisavel';

describe('SelectPesquisavel', () => {
  const opcoes = [
    { value: '', label: 'Escritório' },
    { value: '1', label: 'Ana Advogada' },
    { value: '2', label: 'Bruno Perito' },
  ];

  it('filtra opções e devolve somente o valor selecionado ao formulário', async () => {
    const user = userEvent.setup();
    const alterar = vi.fn();
    render(<SelectPesquisavel ariaLabel="Responsável" opcoes={opcoes} onChange={alterar} />);

    await user.click(screen.getByLabelText('Responsável'));
    await user.type(screen.getByRole('combobox'), 'bruno');
    expect(screen.getByText('Bruno Perito')).toBeVisible();
    expect(screen.queryByText('Ana Advogada')).not.toBeInTheDocument();
    await user.click(screen.getByText('Bruno Perito'));
    expect(alterar).toHaveBeenCalledWith('2');
  });

  it('preserva a opção vazia quando ela é a escolha atual', () => {
    render(<SelectPesquisavel ariaLabel="Tipo" opcoes={opcoes} value="" onChange={vi.fn()} />);
    expect(screen.getByText('Escritório')).toBeVisible();
  });
});
