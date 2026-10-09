import { describe, expect, it } from 'vitest';
import { clientesDoProcesso, clienteUnico, destinoClienteDaParcela, contaEscritorioPadrao, formaUnica, destinoSugerido } from './destinoPadrao';

const joao = { tipo: 'fisica', id: 1, nome: 'João', cliente: true };
const maria = { tipo: 'fisica', id: 2, nome: 'Maria', cliente: true };
const bruna = { tipo: 'fisica', id: 3, nome: 'Bruna', cliente: false };

describe('clientesDoProcesso', () => {
  it('mostra só o lado do cliente quando o processo informa o lado', () => {
    expect(clientesDoProcesso([joao, bruna])).toEqual([joao]);
    expect(clientesDoProcesso([joao, maria, bruna])).toEqual([joao, maria]);
  });
  it('sem lado informado (null) ou sem ninguém do lado do cliente, mostra todos como antes', () => {
    const a = { ...joao, cliente: null }; const b = { ...bruna, cliente: null };
    expect(clientesDoProcesso([a, b])).toEqual([a, b]);
    expect(clientesDoProcesso([bruna])).toEqual([bruna]);
    expect(clientesDoProcesso(undefined)).toEqual([]);
  });
  it('a pessoa já escolhida nunca some da lista, mesmo fora do lado do cliente', () => {
    expect(clientesDoProcesso([joao, bruna], { tipo: 'fisica', id: 3 })).toEqual([joao, bruna]);
    expect(clientesDoProcesso([joao, bruna], { tipo: 'fisica', id: 1 })).toEqual([joao]);
  });
});

describe('clienteUnico', () => {
  it('só escolhe sozinho quando há exatamente um', () => {
    expect(clienteUnico([joao])).toBe(joao);
    expect(clienteUnico([joao, maria])).toBeNull();
    expect(clienteUnico([])).toBeNull();
  });
});

describe('destinoClienteDaParcela', () => {
  it('usa a parcela; sem ela, o acordo; pessoa e conta andam juntas', () => {
    expect(destinoClienteDaParcela({ repasse_cliente_tipo: 'fisica', repasse_cliente_pessoa_id: 1, repasse_cliente_conta_id: null,
      acordo_cliente_tipo: 'fisica', acordo_cliente_id: 2, acordo_cliente_conta_id: 9 })).toEqual({ tipo: 'fisica', pessoaId: 1, contaId: null });
    expect(destinoClienteDaParcela({ acordo_cliente_tipo: 'juridica', acordo_cliente_id: 2, acordo_cliente_conta_id: 9 })).toEqual({ tipo: 'juridica', pessoaId: 2, contaId: 9 });
    expect(destinoClienteDaParcela({})).toBeNull();
    expect(destinoClienteDaParcela(null)).toBeNull();
  });
});

describe('contaEscritorioPadrao e formaUnica', () => {
  it('principal; sem principal, o único caixa em espécie; senão nada', () => {
    expect(contaEscritorioPadrao([{ id: 1, tipo: 'bancaria', principal: 0 }, { id: 2, tipo: 'bancaria', principal: 1 }])).toBe(2);
    expect(contaEscritorioPadrao([{ id: 1, tipo: 'bancaria', principal: 0 }, { id: 2, tipo: 'especie', principal: 0 }])).toBe(2);
    expect(contaEscritorioPadrao([{ id: 1, tipo: 'bancaria', principal: 0 }])).toBe('');
    expect(contaEscritorioPadrao([{ id: 2, tipo: 'especie' }, { id: 3, tipo: 'especie' }])).toBe('');
    expect(contaEscritorioPadrao([])).toBe('');
  });
  it('forma só quando existe uma compatível', () => {
    expect(formaUnica([{ id: 7 }])).toBe(7);
    expect(formaUnica([{ id: 7 }, { id: 8 }])).toBe('');
    expect(formaUnica([])).toBe('');
  });
});

describe('destinoSugerido', () => {
  it('conta já definida, senão principal, senão dinheiro em mãos', () => {
    const contas = [{ id: 10, principal: 0 }, { id: 11, principal: 1 }];
    expect(destinoSugerido(contas, 10)).toEqual({ tipo: 'bancaria', contaId: 10, porFaltaDeConta: false });
    expect(destinoSugerido(contas, 99)).toEqual({ tipo: 'bancaria', contaId: 11, porFaltaDeConta: false });
    expect(destinoSugerido([{ id: 10, principal: 0 }], '')).toEqual({ tipo: 'em_maos', contaId: '', porFaltaDeConta: true });
    expect(destinoSugerido([], '')).toEqual({ tipo: 'em_maos', contaId: '', porFaltaDeConta: true });
  });
});
