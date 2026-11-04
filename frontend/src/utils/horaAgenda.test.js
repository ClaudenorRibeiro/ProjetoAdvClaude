import { proximoMinuto } from './horaAgenda';

describe('proximoMinuto', () => {
  it('soma os minutos dentro da mesma hora', () => {
    expect(proximoMinuto('08:00')).toBe('08:02');
  });
  it('vira a hora quando passa de 59', () => {
    expect(proximoMinuto('08:59')).toBe('09:01');
  });
  it('vira o dia quando passa de 23:59', () => {
    expect(proximoMinuto('23:59')).toBe('00:01');
  });
  it('sem hora, assume 00:00', () => {
    expect(proximoMinuto(null)).toBe('00:02');
  });
});
