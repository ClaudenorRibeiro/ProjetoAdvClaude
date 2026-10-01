import { describe, expect, it } from 'vitest';
import { caminhoBarra, cortar, geometriaBarras } from './geometriaBarras';

const serie = (rotulo, valores) => ({ rotulo, valores, pontos: valores.map(() => null), cor: '#000' });
const prep = (series, cats = ['A', 'B', 'C']) => ({ categorias: cats.map(r => ({ rotulo: r })), series, metrica: { formato: null, funcao: 'contagem' } });

describe('geometria das colunas', () => {
  it('uma série: barras de no máximo 24px, partindo todas da mesma linha-base', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [10, 20, 40])]), horizontal: false, empilhado: false, largura: 600 });
    expect(g.barras).toHaveLength(3);
    expect(Math.max(...g.barras.map(b => b.w))).toBeLessThanOrEqual(24);
    const bases = g.barras.map(b => Math.round(b.y + b.h));
    expect(new Set(bases).size).toBe(1);
    expect(bases[0]).toBe(Math.round(g.zero));
    expect(g.barras[2].h).toBeGreaterThan(g.barras[0].h * 3.9);                 // 40 é 4× 10
    expect(g.barras.every(b => b.lado === 'cima')).toBe(true);
  });
  it('destaca (rótulo) só a maior barra, nunca todas', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [10, 20, 40])]), horizontal: false, empilhado: false, largura: 600 });
    expect(g.destaque.valor).toBe(40);
    const dois = geometriaBarras({ prep: prep([serie('Q', [1, 2, 3]), serie('R', [3, 2, 1])]), horizontal: false, empilhado: false, largura: 600 });
    expect(dois.destaque).toBeNull();
  });
  it('várias séries lado a lado: mesma categoria, barras separadas por 2px', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [5, 5, 5]), serie('R', [6, 6, 6])]), horizontal: false, empilhado: false, largura: 600 });
    const [a, b] = g.barras.filter(x => x.c === 0);
    expect(b.x - (a.x + a.w)).toBeCloseTo(2, 5);
  });
  it('empilhado: fatias se encostam com 2px de espaço, só a do topo arredonda e a altura total = soma', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [10, 10, 10]), serie('R', [30, 30, 30])]), horizontal: false, empilhado: true, largura: 600 });
    const [a, b] = g.barras.filter(x => x.c === 0);
    expect(a.lado).toBeNull();
    expect(b.lado).toBe('cima');
    expect(a.y - (b.y + b.h)).toBeCloseTo(2, 5);
    const topoEsperado = g.zero - (g.zero - g.marcas.find(m => m.valor === 40).pos);
    expect(Math.round(b.y)).toBe(Math.round(topoEsperado));
    expect(g.escala.max).toBeGreaterThanOrEqual(40);                              // a escala cabe a PILHA, não só a maior série
  });
  it('valores negativos descem da linha-base e arredondam embaixo', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [100, -50, 0])]), horizontal: false, empilhado: false, largura: 600 });
    const neg = g.barras.find(b => b.valor === -50);
    expect(neg.y).toBeCloseTo(g.zero, 5);
    expect(neg.lado).toBe('baixo');
    expect(g.escala.min).toBeLessThan(0);
  });
  it('valor nulo não desenha barra; muitas categorias giram os rótulos', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [1, null, 3])]), horizontal: false, empilhado: false, largura: 600 });
    expect(g.barras.map(b => b.c)).toEqual([0, 2]);
    const cats = Array.from({ length: 30 }, (_, i) => `Cat ${i}`);
    expect(geometriaBarras({ prep: prep([serie('Q', cats.map((_, i) => i + 1))], cats), horizontal: false, empilhado: false, largura: 500 }).rotacionar).toBe(true);
  });
});

describe('geometria das barras horizontais', () => {
  it('cada categoria numa linha; comprimento proporcional; cresce da esquerda', () => {
    const g = geometriaBarras({ prep: prep([serie('Q', [10, 20, 40])], ['Um', 'Dois', 'Três']), horizontal: true, empilhado: false, largura: 600 });
    expect(g.barras.map(b => b.x.toFixed(2)).every(x => x === g.barras[0].x.toFixed(2))).toBe(true);
    expect(g.barras[2].w).toBeGreaterThan(g.barras[0].w * 3.9);
    expect(g.barras[0].y).toBeLessThan(g.barras[1].y);
    expect(g.barras.every(b => b.h <= 24 && b.lado === 'direita')).toBe(true);
    expect(g.altura).toBeGreaterThan(g.plot.h);
  });
});

describe('utilitários', () => {
  it('cortar texto longo com reticências', () => {
    expect(cortar('curto', 14)).toBe('curto');
    expect(cortar('Escritório de Advocacia Muito Longo', 14)).toHaveLength(14);
    expect(cortar('Escritório de Advocacia Muito Longo', 14).endsWith('…')).toBe(true);
  });
  it('caminho da barra: ponta arredondada só no lado do dado', () => {
    expect(caminhoBarra({ x: 0, y: 0, w: 20, h: 50, lado: 'cima' })).toContain('Q');
    expect(caminhoBarra({ x: 0, y: 0, w: 20, h: 50, lado: null })).not.toContain('Q');
    expect(caminhoBarra({ x: 0, y: 0, w: 20, h: 1, lado: 'cima' })).toBeTruthy();
  });
});

describe('margem do eixo nas barras horizontais', () => {
  it('o último rótulo do eixo cabe dentro da largura (não é cortado na borda)', () => {
    const g = geometriaBarras({ prep: { categorias: [{ rotulo: 'A' }, { rotulo: 'B' }], series: [{ valores: [635637, 20000], pontos: [null, null], cor: '#000' }], metrica: { formato: 'moeda', funcao: 'soma' } }, horizontal: true, empilhado: false, largura: 800 });
    const ultima = g.marcas.at(-1);
    const metadeDoTexto = ultima.texto.length * 6.4 / 2;
    expect(ultima.pos + metadeDoTexto).toBeLessThanOrEqual(g.largura);
  });
});
