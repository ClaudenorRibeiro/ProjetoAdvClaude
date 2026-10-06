import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CampoPesquisa from './CampoPesquisa';

function Tela({ aoAplicar, inicial = '' }) {
  const [valor, setValor] = useState(inicial);
  const aplicar = (t) => { aoAplicar(t); setValor(t); };
  return (
    <div>
      <CampoPesquisa valor={valor} onChange={aplicar} placeholder="Digite" />
      <button type="button" onClick={() => setValor('')}>zerar de fora</button>
      <span data-testid="aplicado">{valor}</span>
    </div>
  );
}

afterEach(() => { vi.useRealTimers(); });

describe('CampoPesquisa', () => {
  it('só consulta depois de parar de digitar, uma vez só e com o texto aparado', async () => {
    vi.useFakeTimers();
    const aoAplicar = vi.fn();
    render(<Tela aoAplicar={aoAplicar} />);
    const campo = screen.getByLabelText('Pesquisar');
    await act(async () => { campo.focus(); });
    for (const letra of '  José e') {
      await act(async () => { fireEvent.change(campo, { target: { value: campo.value + letra } }); });
    }
    expect(aoAplicar).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(349); });
    expect(aoAplicar).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2); });
    expect(aoAplicar).toHaveBeenCalledTimes(1);
    expect(aoAplicar).toHaveBeenCalledWith('José e');
    expect(screen.getByTestId('aplicado')).toHaveTextContent('José e');
  });

  it('"Limpar pesquisa" só aparece com texto, apaga o campo e aplica o vazio na hora', async () => {
    const user = userEvent.setup();
    const aoAplicar = vi.fn();
    render(<Tela aoAplicar={aoAplicar} />);
    expect(screen.queryByRole('button', { name: 'Limpar pesquisa' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Pesquisar'), 'owens');
    await user.click(screen.getByRole('button', { name: 'Limpar pesquisa' }));
    expect(screen.getByLabelText('Pesquisar')).toHaveValue('');
    expect(aoAplicar).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Limpar pesquisa' })).not.toBeInTheDocument();
  });

  it('quando quem usa zera o termo de fora (ex.: "Limpar filtros"), o texto digitado some junto; começa já com o termo recebido', async () => {
    const user = userEvent.setup();
    render(<Tela aoAplicar={vi.fn()} inicial="una" />);
    expect(screen.getByLabelText('Pesquisar')).toHaveValue('una');
    await user.click(screen.getByRole('button', { name: 'zerar de fora' }));
    expect(screen.getByLabelText('Pesquisar')).toHaveValue('');
  });

  it('não consulta nada ao abrir (nem repete o mesmo termo já aplicado) e respeita o limite de caracteres', async () => {
    vi.useFakeTimers();
    const aoAplicar = vi.fn();
    render(<Tela aoAplicar={aoAplicar} inicial="virtual" />);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(aoAplicar).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Pesquisar')).toHaveAttribute('maxlength', '200');
  });
});
