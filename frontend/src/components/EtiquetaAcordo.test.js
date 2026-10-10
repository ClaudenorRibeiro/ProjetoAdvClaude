import { describe, expect, it } from 'vitest';
import { COR_ACORDO_PADRAO, corDoTextoSobre, estiloFundoAcordo } from './EtiquetaAcordo';

const canal = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);
const rgbHex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rgbDeCss = (css) => css.match(/\d+/g).map(Number);   // "rgb(r, g, b)"  (o fundo é opaco)
const CORES = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#1d4ed8', '#7c3aed', '#166534', '#ff8800', COR_ACORDO_PADRAO];
const TEXTOS = { 'azul dos botões': '#1a56db', 'vermelho dos avisos': '#c0392b', 'cinza da tabela': '#444444' };

describe('etiqueta automática "Acordo"', () => {
  it('o texto da etiqueta tem contraste mínimo de 4,5:1 com a cor escolhida (qualquer cor)', () => {
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
      const cor = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
      const texto = corDoTextoSobre(cor);
      expect(contraste(rgbHex(cor), rgbHex(texto)), `${cor} com texto ${texto}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cor clara leva letra preta e cor escura leva letra branca', () => {
    expect(corDoTextoSobre('#86efac')).toBe('#000000');
    expect(corDoTextoSobre('#1d4ed8')).toBe('#ffffff');
    expect(corDoTextoSobre('#000000')).toBe('#ffffff');
  });

  it('o fundo é a mesma cor, clareada, e os textos que já existem sobre ele mantêm o contraste de 4,5:1 (até com cor escura)', () => {
    for (const cor of CORES) {
      const estilo = estiloFundoAcordo(cor);
      const fundo = rgbDeCss(estilo['--acordo-fundo']);
      for (const [nome, texto] of Object.entries(TEXTOS)) {
        expect(contraste(fundo, rgbHex(texto)), `${cor}: ${nome}`).toBeGreaterThanOrEqual(4.5);
      }
      const hover = rgbDeCss(estilo['--acordo-fundo-hover']);
      expect(contraste(hover, rgbHex('#444444')), `${cor}: cinza no hover`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o fundo é opaco (não se mistura com o cinza da página) e é a cor escolhida clareada: a padrão a 30%, as escuras ainda mais claras', () => {
    expect(estiloFundoAcordo(COR_ACORDO_PADRAO)['--acordo-fundo']).toBe('rgb(219, 250, 230)');   // #86efac a 30% sobre o branco
    const azul = rgbDeCss(estiloFundoAcordo('#1d4ed8')['--acordo-fundo']);
    expect(azul[2]).toBeGreaterThan(azul[0]);                       // continua azulado
    expect(azul[0]).toBeGreaterThan(200);                           // mas bem claro
  });
});
