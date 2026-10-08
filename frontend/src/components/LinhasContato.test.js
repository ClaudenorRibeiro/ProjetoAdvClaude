import { describe, it, expect } from 'vitest';
import { atualizarTelefone, pareceCelular } from './LinhasContato';

const linha = (numero, extra = {}) => ({ numero, tipo: '', principal: false, ...extra });

describe('marcadores de WhatsApp e SMS nos telefones', () => {
  it('só celular completo (DDD + 9 dígitos começando em 9) parece celular', () => {
    expect(pareceCelular('(19) 98877-6655')).toBe(true);
    expect(pareceCelular('19988776655')).toBe(true);
    expect(pareceCelular('(19) 3333-4444')).toBe(false);
    expect(pareceCelular('(19) 98877-66')).toBe(false);
    expect(pareceCelular('')).toBe(false);
  });

  it('marcar WhatsApp num número desmarca o que estava marcado em outro; o mesmo número pode ter os dois', () => {
    const lista = [linha('(19) 98877-0001', { whatsapp: true, sms: true }), linha('(19) 98877-0002')];
    const depois = atualizarTelefone(lista, 1, { ...lista[1], whatsapp: true });
    expect(depois.map(t => [!!t.whatsapp, !!t.sms])).toEqual([[false, true], [true, false]]);
    const dois = atualizarTelefone(depois, 1, { ...depois[1], sms: true });
    expect(dois.map(t => [!!t.whatsapp, !!t.sms])).toEqual([[false, false], [true, true]]);
  });

  it('desmarcar não marca ninguém no lugar', () => {
    const lista = [linha('(19) 98877-0001', { whatsapp: true, sms: true })];
    expect(atualizarTelefone(lista, 0, { ...lista[0], whatsapp: false, sms: false }).map(t => [!!t.whatsapp, !!t.sms])).toEqual([[false, false]]);
  });

  it('quando o número vira celular e ninguém está marcado, já vem marcado; se alguém já está marcado, não mexe', () => {
    const vazia = [linha('')];
    expect(atualizarTelefone(vazia, 0, linha('(19) 98877-0001')).map(t => [!!t.whatsapp, !!t.sms])).toEqual([[true, true]]);
    const fixo = [linha('')];
    expect(atualizarTelefone(fixo, 0, linha('(19) 3333-4444')).map(t => [!!t.whatsapp, !!t.sms])).toEqual([[false, false]]);
    const comMarca = [linha('(19) 98877-0001', { whatsapp: true }), linha('')];
    expect(atualizarTelefone(comMarca, 1, linha('(19) 98877-0002')).map(t => [!!t.whatsapp, !!t.sms])).toEqual([[true, false], [false, false]]);
  });

  it('quem já desmarcou não é remarcado ao continuar digitando', () => {
    const lista = [linha('(19) 98877-000', { whatsapp: false, sms: false })];
    const completo = atualizarTelefone(lista, 0, { ...lista[0], numero: '(19) 98877-0001', whatsapp: false, sms: false });
    expect(completo.map(t => [!!t.whatsapp, !!t.sms])).toEqual([[false, false]]);
  });
});
