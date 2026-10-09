import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const avisos = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { error: avisos.erro, success: vi.fn() } }));

import ModalConfirmarEmail from './ModalConfirmarEmail';

const email = { nome: 'Ana Souza', para: 'ana@example.invalid', assunto: 'Assunto de teste', texto: 'Linha 1\nLinha 2' };

describe('ModalConfirmarEmail', () => {
  beforeEach(() => { avisos.erro.mockReset(); });

  it('mostra Para, Assunto e Mensagem e só envia quando clica em Enviar', async () => {
    const acao = vi.fn().mockResolvedValue();
    const aoCancelar = vi.fn();
    render(<ModalConfirmarEmail titulo="Comunicar cliente" emails={[email]} acao={acao} onCancelar={aoCancelar} />);
    const janela = screen.getByRole('dialog', { name: 'Comunicar cliente' });
    expect(within(janela).getByText('Para')).toBeTruthy();
    expect(within(janela).getByText(/ana@example\.invalid/)).toBeTruthy();
    expect(within(janela).getByText('Assunto de teste')).toBeTruthy();
    expect(within(janela).getByText(/Linha 1/)).toBeTruthy();
    expect(acao).not.toHaveBeenCalled();                                   // abrir não envia
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar e-mail' }));
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(aoCancelar).toHaveBeenCalled());            // depois de enviar, fecha
  });

  it('Cancelar, Esc e o X fecham sem enviar', async () => {
    const acao = vi.fn();
    const aoCancelar = vi.fn();
    render(<ModalConfirmarEmail emails={[email]} acao={acao} onCancelar={aoCancelar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoCancelar).toHaveBeenCalledTimes(3);
    expect(acao).not.toHaveBeenCalled();
  });

  it('o foco começa em Cancelar (um Enter sem querer não envia)', () => {
    render(<ModalConfirmarEmail emails={[email]} acao={vi.fn()} onCancelar={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('mostra um e-mail por destinatário e o corpo formatado fica isolado num quadro sem scripts', () => {
    const html = { ...email, nome: 'Bia', para: 'bia@example.invalid', texto: undefined, html: '<p>Olá</p>' };
    render(<ModalConfirmarEmail emails={[email, html]} acao={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getAllByTestId('email-a-enviar')).toHaveLength(2);
    const quadro = screen.getByTitle('Mensagem do e-mail para Bia');
    expect(quadro.tagName).toBe('IFRAME');
    expect(quadro.getAttribute('sandbox')).toBe('');                       // sem permissão nenhuma: nada executa
    expect(quadro.getAttribute('srcdoc')).toBe('<p>Olá</p>');
  });

  it('erro no envio: mostra o motivo, não fecha e deixa tentar de novo', async () => {
    const acao = vi.fn().mockRejectedValue({ response: { data: { mensagem: 'Servidor de e-mail fora do ar' } } });
    const aoCancelar = vi.fn();
    render(<ModalConfirmarEmail emails={[email]} acao={acao} onCancelar={aoCancelar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar e-mail' }));
    await waitFor(() => expect(avisos.erro).toHaveBeenCalledWith('Servidor de e-mail fora do ar'));
    expect(aoCancelar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar e-mail' })).toBeTruthy();
  });

  it('sem e-mails (ninguém para receber): só explica e oferece Fechar, sem Enviar', () => {
    render(<ModalConfirmarEmail emails={[]} avisos={['Sem e-mail cadastrado.']} acao={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByText('Sem e-mail cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enviar e-mail' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Fechar' }).length).toBeGreaterThan(0);
  });
});
