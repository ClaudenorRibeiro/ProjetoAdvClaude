import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ obterLimites: vi.fn(), salvarLimites: vi.fn() }));
vi.mock('../../services/api', () => ({ relatoriosAPI: api }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LimitesRelatorios from './LimitesRelatorios';
import { toast } from 'react-toastify';

const LIMITES = {
  padrao: 10, maximoPermitido: 500,
  usuarios: [
    { id: 4, nome: 'Chefe', login: 'chefe', max_relatorios: null, criados: 3 },
    { id: 5, nome: 'Ana', login: 'ana', max_relatorios: 25, criados: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.obterLimites.mockResolvedValue({ data: { dados: LIMITES } });
});

describe('Limite de relatórios em Permissões', () => {
  it('sem usuário escolhido mostra só o padrão; com usuário mostra o campo dele e quantos já criou', async () => {
    const { rerender } = render(<LimitesRelatorios usuarioId="" />);
    expect(await screen.findByLabelText('Padrão para todos')).toHaveValue(10);
    expect(screen.queryByLabelText(/Deste usuário/)).not.toBeInTheDocument();

    rerender(<LimitesRelatorios usuarioId="5" />);
    expect(await screen.findByLabelText(/Deste usuário/)).toHaveValue(25);
    expect(screen.getByText('Ana já criou 1 relatório(s).')).toBeInTheDocument();
    rerender(<LimitesRelatorios usuarioId="4" />);
    await waitFor(() => expect(screen.getByLabelText(/Deste usuário/)).toHaveValue(null));
    expect(screen.getByLabelText(/Deste usuário/)).toHaveAttribute('placeholder', '10');   // vazio = usa o padrão (10)
  });

  it('só habilita "Salvar limites" quando há mudança válida', async () => {
    const user = userEvent.setup();
    render(<LimitesRelatorios usuarioId="4" />);
    const salvar = await screen.findByRole('button', { name: 'Salvar limites' });
    expect(salvar).toBeDisabled();                                         // nada mudou
    await user.type(screen.getByLabelText(/Deste usuário/), '-');          // inválido (número negativo não passa)
    await user.clear(screen.getByLabelText('Padrão para todos'));
    expect(salvar).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('inteiro de 0 a 500');
    await user.type(screen.getByLabelText('Padrão para todos'), '501');
    expect(salvar).toBeDisabled();                                         // acima do máximo
  });

  it('salva só o que mudou: padrão e/ou o limite do usuário (e vazio devolve ao padrão)', async () => {
    const user = userEvent.setup();
    api.salvarLimites.mockResolvedValue({ data: { dados: { ...LIMITES, padrao: 12, usuarios: [{ ...LIMITES.usuarios[0], max_relatorios: 30 }, LIMITES.usuarios[1]] } } });
    render(<LimitesRelatorios usuarioId="4" />);
    await user.clear(await screen.findByLabelText('Padrão para todos'));
    await user.type(screen.getByLabelText('Padrão para todos'), '12');
    await user.type(screen.getByLabelText(/Deste usuário/), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar limites' }));
    await waitFor(() => expect(api.salvarLimites).toHaveBeenCalledWith({ padrao: 12, usuarios: { 4: 30 } }));
    expect(toast.success).toHaveBeenCalledWith('Limites de relatórios salvos');
    expect(await screen.findByLabelText(/Deste usuário/)).toHaveValue(30);   // recarregou do servidor
  });

  it('esvaziar o campo do usuário volta ao padrão (envia null) e erro do servidor aparece', async () => {
    const user = userEvent.setup();
    api.salvarLimites.mockRejectedValue({ response: { data: { mensagem: 'Os limites devem ser de 0 a 500.' } } });
    render(<LimitesRelatorios usuarioId="5" />);
    await user.clear(await screen.findByLabelText(/Deste usuário/));
    await user.click(screen.getByRole('button', { name: 'Salvar limites' }));
    await waitFor(() => expect(api.salvarLimites).toHaveBeenCalledWith({ usuarios: { 5: null } }));
    expect(toast.error).toHaveBeenCalledWith('Os limites devem ser de 0 a 500.');
  });
});
