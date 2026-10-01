import { describe, expect, it } from 'vitest';
import { caminhoArea, caminhoLinha, geometriaLinhas } from './geometriaLinhas';
import { fatiasRosca } from './geometriaRosca';

const serie = (valores) => ({ valores, pontos: valores.map(() => null), cor: '#000' });
const prep = (series, cats) => ({ categorias: cats.map(r => ({ rotulo: r })), series, metrica: { formato: 'moeda', funcao: 'soma' } });

describe('geometria das linhas', () => {
  it('pontos igualmente espaçados; valor maior fica mais alto (y menor)', () => {
    const g = geometriaLinhas({ prep: prep([serie([10, 40, 20])], ['Jan', 'Fev', 'Mar']), largura: 600 });
    const p = g.linhas[0].pontos;
    expect(p).toHaveLength(3);
    expect(p[1].x - p[0].x).toBeCloseTo(p[2].x - p[1].x, 5);
    expect(p[1].y).toBeLessThan(p[0].y);
    expect(p[0].y).toBeLessThan(g.zero);
  });
  it('valor nulo QUEBRA a linha em segmentos (não liga por cima do vazio)', () => {
    const g = geometriaLinhas({ prep: prep([serie([5, null, 8, 9])], ['a', 'b', 'c', 'd']), largura: 600 });
    expect(g.linhas[0].segmentos.map(s => s.length)).toEqual([1, 2]);
    expect(g.linhas[0].pontos).toHaveLength(3);
  });
  it('muitas categorias: rótulos do eixo são espaçados para não sobrepor', () => {
    const cats = Array.from({ length: 30 }, (_, i) => `Semana de ${i}`);
    const g = geometriaLinhas({ prep: prep([serie(cats.map((_, i) => i))], cats), largura: 500 });
    expect(g.passo).toBeGreaterThan(1);
    expect(g.rotulos.filter(r => r.mostrar).length).toBeLessThan(30);
    expect(g.rotulos[0].mostrar).toBe(true);
  });
  it('negativos: o zero fica no meio da área e a escala desce', () => {
    const g = geometriaLinhas({ prep: prep([serie([100, -50])], ['a', 'b']), largura: 600 });
    expect(g.escala.min).toBeLessThan(0);
    expect(g.zero).toBeGreaterThan(g.plot.y);
    expect(g.zero).toBeLessThan(g.plot.y + g.plot.h);
  });
  it('caminhos SVG', () => {
    expect(caminhoLinha([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1.0,2.0L3.0,4.0');
    expect(caminhoArea([{ x: 1, y: 2 }, { x: 3, y: 4 }], 10)).toMatch(/Z$/);
    expect(caminhoArea([], 10)).toBe('');
  });
});

describe('geometria da rosca', () => {
  const caixa = { cx: 100, cy: 100, R: 80, r: 50 };
  it('as fatias somam 100% e cada uma é proporcional ao valor', () => {
    const f = fatiasRosca([50, 30, 20], caixa);
    expect(f.map(x => x.fracao)).toEqual([0.5, 0.3, 0.2]);
    expect(f.reduce((a, x) => a + x.fracao, 0)).toBeCloseTo(1, 10);
    expect(f.every(x => x.caminho.startsWith('M') && x.caminho.endsWith('Z'))).toBe(true);
  });
  it('uma fatia só vira círculo completo; total zero não desenha nada', () => {
    expect(fatiasRosca([7], caixa)).toHaveLength(1);
    expect(fatiasRosca([0, 0], caixa)).toEqual([]);
  });
});
