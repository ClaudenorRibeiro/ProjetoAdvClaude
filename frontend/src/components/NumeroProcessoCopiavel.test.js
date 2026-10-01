import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NumeroProcessoCopiavel, { BotaoCopiarNumero } from './NumeroProcessoCopiavel';

const NUMERO = '1001308-02.2026.5.02.0054';

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});

describe('BotaoCopiarNumero', () => {
  it('copia o número inteiro, mostra ✓ e NÃO dispara o clique do item que o contém', async () => {
    const user = userEvent.setup();
    const aoClicarItem = vi.fn();
    render(React.createElement('button', { type: 'button', onClick: aoClicarItem },
      'Una — 1001308-02.2026.5.02.00…', React.createElement(BotaoCopiarNumero, { numero: NUMERO })));

    await user.click(screen.getByRole('button', { name: `Copiar número ${NUMERO}` }));

    expect(await navigator.clipboard.readText()).toBe(NUMERO);
    expect(aoClicarItem).not.toHaveBeenCalled();
    expect(screen.getByTitle('Copiado!')).toHaveTextContent('✓');
  });

  it('funciona pelo teclado (Enter) e sem número não desenha nada', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(React.createElement(BotaoCopiarNumero, { numero: NUMERO }));
    screen.getByRole('button', { name: `Copiar número ${NUMERO}` }).focus();
    await user.keyboard('{Enter}');
    expect(await navigator.clipboard.readText()).toBe(NUMERO);

    rerender(React.createElement(BotaoCopiarNumero, { numero: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa quando não consegue copiar (sem derrubar a tela)', async () => {
    const user = userEvent.setup();
    render(React.createElement(BotaoCopiarNumero, { numero: NUMERO }));
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('bloqueado'));
    document.execCommand = vi.fn(() => false);

    await user.click(screen.getByRole('button', { name: `Copiar número ${NUMERO}` }));
    expect(screen.getByTitle('Não foi possível copiar')).toHaveTextContent('✗');
  });
});

describe('NumeroProcessoCopiavel (regressão após extrair a função de copiar)', () => {
  it('sem ação de abrir, clicar no número copia', async () => {
    const user = userEvent.setup();
    render(React.createElement(NumeroProcessoCopiavel, { numero: NUMERO }));
    await user.click(screen.getByText(NUMERO));
    expect(await navigator.clipboard.readText()).toBe(NUMERO);
  });

  it('com onAbrir, o ⧉ copia e o clique no número abre (sem copiar)', async () => {
    const user = userEvent.setup();
    const abrir = vi.fn();
    render(React.createElement(NumeroProcessoCopiavel, { numero: NUMERO, onAbrir: abrir, href: '/processos/pasta/8969' }));
    await user.click(screen.getByText(NUMERO));
    expect(abrir).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: `Copiar número ${NUMERO}` }));
    expect(await navigator.clipboard.readText()).toBe(NUMERO);
  });

  it('tamanho do ⧉: 13px por padrão (como sempre foi) e configurável sem afetar quem não pede', () => {
    const { unmount } = render(React.createElement(NumeroProcessoCopiavel, { numero: NUMERO, onAbrir: vi.fn() }));
    expect(screen.getByRole('button', { name: `Copiar número ${NUMERO}` })).toHaveStyle({ fontSize: '13px' });
    unmount();
    render(React.createElement(NumeroProcessoCopiavel, { numero: NUMERO, onAbrir: vi.fn(), tamanhoIcone: 18 }));
    expect(screen.getByRole('button', { name: `Copiar número ${NUMERO}` })).toHaveStyle({ fontSize: '18px' });
  });

  it('BotaoCopiarNumero também aceita tamanho (padrão 13px)', () => {
    const { unmount } = render(React.createElement(BotaoCopiarNumero, { numero: NUMERO }));
    expect(screen.getByRole('button')).toHaveStyle({ fontSize: '13px' });
    unmount();
    render(React.createElement(BotaoCopiarNumero, { numero: NUMERO, tamanho: 18 }));
    expect(screen.getByRole('button')).toHaveStyle({ fontSize: '18px' });
  });
});
