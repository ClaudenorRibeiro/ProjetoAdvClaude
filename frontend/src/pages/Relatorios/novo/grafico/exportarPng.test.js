import { describe, expect, it } from 'vitest';
import { esc, montarSvgImagem, serializarSvg } from './exportarPng';

describe('imagem do gráfico (PNG)', () => {
  const base = { svgTexto: '<svg width="600" height="320"></svg>', largura: 600, altura: 320, titulo: 'Parcelas', subtitulo: 'Gráfico: Quantidade por Status' };

  it('texto vindo do banco é escapado (nunca vira marcação)', () => {
    expect(esc('A&B <script>"x"')).toBe('A&amp;B &lt;script&gt;&quot;x&quot;');
    const { texto } = montarSvgImagem({ ...base, titulo: 'Fulano <b>&</b>', legenda: [{ cor: '#2a78d6', rotulo: 'S <i>1</i>' }] });
    expect(texto).not.toContain('<b>');
    expect(texto).not.toContain('<i>');
    expect(texto).toContain('Fulano &lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('leva título, subtítulo, o gráfico e a legenda com a cor de cada série', () => {
    const { texto, largura, altura } = montarSvgImagem({ ...base, legenda: [{ cor: '#2a78d6', rotulo: 'Recebida' }, { cor: '#eb6834', rotulo: 'Pendente' }] });
    expect(texto.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(texto).toContain('>Parcelas<');
    expect(texto).toContain('Gráfico: Quantidade por Status');
    expect(texto).toContain(base.svgTexto);
    expect(texto).toContain('fill="#2a78d6"');
    expect(texto).toContain('fill="#eb6834"');
    expect(largura).toBe(632);
    expect(altura).toBeGreaterThan(320 + 62);                 // título + gráfico + legenda
  });

  it('legenda grande quebra em várias linhas (a imagem cresce, nada fica cortado)', () => {
    const muitas = Array.from({ length: 24 }, (_, i) => ({ cor: '#000000', rotulo: `Série número ${i}` }));
    const uma = montarSvgImagem({ ...base, legenda: muitas.slice(0, 2) });
    const varias = montarSvgImagem({ ...base, legenda: muitas });
    expect(varias.altura).toBeGreaterThan(uma.altura + 40);
    const ys = [...varias.texto.matchAll(/<text x="\d+(?:\.\d+)?" y="(\d+)" font-family="Arial/g)].map(m => Number(m[1])).filter(y => y > 380);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });

  it('sem legenda (uma série) não reserva espaço extra', () => {
    const sem = montarSvgImagem(base);
    expect(sem.altura).toBe(62 + 320 + 16);
  });

  it('efeitos de passar o mouse não vão para a imagem baixada (e o original da tela fica intacto)', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<rect data-efeito="1" width="10" height="10"/><path d="M0,0L1,1"/><line data-efeito="1" x1="0" x2="1"/>';
    const texto = serializarSvg(svg);
    expect(texto).not.toContain('data-efeito');
    expect(texto).not.toContain('<rect');
    expect(texto).toContain('<path');
    expect(svg.querySelectorAll('[data-efeito]')).toHaveLength(2);
  });
});
