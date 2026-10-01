import { describe, expect, it } from 'vitest';
import { escalaBonita, proporcao } from './escala';
import { formatarEixo, formatarValor, percentual } from './formato';

describe('escala dos gráficos', () => {
  it('sempre inclui o zero e usa marcas redondas', () => {
    expect(escalaBonita(0, 586)).toMatchObject({ min: 0, max: 600, marcas: [0, 100, 200, 300, 400, 500, 600] });
    expect(escalaBonita(120, 980)).toMatchObject({ min: 0, max: 1000 });
  });
  it('valores negativos (fluxo de caixa) ganham escala abaixo do zero', () => {
    const e = escalaBonita(-95.25, 250);
    expect(e.min).toBeLessThan(0);
    expect(e.marcas).toContain(0);
    expect(proporcao(0, e)).toBeGreaterThan(0);
    expect(proporcao(0, e)).toBeLessThan(1);
  });
  it('tudo zero ou valor único não quebra', () => {
    expect(escalaBonita(0, 0).max).toBeGreaterThan(0);
    expect(escalaBonita(5, 5).marcas.length).toBeGreaterThan(1);
  });
  it('números decimais pequenos têm marcas limpas', () => {
    const e = escalaBonita(0, 0.9);
    expect(e.marcas.every(m => Math.abs(m * 10 - Math.round(m * 10)) < 1e-9)).toBe(true);
  });
});

describe('formatação dos gráficos', () => {
  it('valor completo: dinheiro em R$, média com 2 casas, inteiro sem casas', () => {
    expect(formatarValor(1234.5, { formato: 'moeda' })).toMatch(/R\$\s*1\.234,50/);
    expect(formatarValor(82.789, { funcao: 'media' })).toBe('82,79');
    expect(formatarValor(5599)).toBe('5.599');
    expect(formatarValor(null)).toBe('—');
  });
  it('eixo compacto: mil, mi, bi e R$', () => {
    expect(formatarEixo(500)).toBe('500');
    expect(formatarEixo(25000)).toBe('25 mil');
    expect(formatarEixo(1500000)).toBe('1,5 mi');
    expect(formatarEixo(2500000, { formato: 'moeda' })).toBe('R$ 2,5 mi');
    expect(formatarEixo(0.5)).toBe('0,5');
  });
  it('percentual', () => {
    expect(percentual(1, 4)).toBe('25%');
    expect(percentual(1, 0)).toBe('—');
  });
});
