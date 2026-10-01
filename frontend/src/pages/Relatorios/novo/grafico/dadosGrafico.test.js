import { describe, expect, it } from 'vitest';
import { metricasGraficaveis, prepararGrafico, tipoPadrao } from './dadosGrafico';
import { COR_OUTROS, CORES_SERIES } from './cores';

const metricas = (extra = []) => [
  { chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero', formato: null },
  { chave: 'm2', rotulo: 'Soma de Valor bruto', funcao: 'soma', tipo: 'numero', formato: 'moeda' }, ...extra];
const grupo = (chaves, rotulos, valores) => ({ tipo: 'grupo', chaves, rotulos, valores });

const UM_NIVEL = {
  colunas: { grupos: [{ chave: 'status', rotulo: 'Status' }], metricas: metricas() },
  linhas: [grupo(['pendente'], ['Pendente'], [586, 1000.5]), grupo(['pago'], ['Recebida'], [293, 500]), grupo([null], ['(sem valor)'], [1, null]),
    { tipo: 'total', valores: [880, 1500.5] }],
};
const DOIS_NIVEIS = {
  colunas: { grupos: [{ chave: 'vencimento', rotulo: 'Vencimento', passo: 'mes' }, { chave: 'status', rotulo: 'Status' }], metricas: metricas() },
  linhas: [
    grupo(['2026-01', 'pago'], ['01/2026', 'Recebida'], [10, 100]), grupo(['2026-01', 'pendente'], ['01/2026', 'Pendente'], [5, 50]),
    { tipo: 'subtotal', chaves: ['2026-01'], rotulos: ['01/2026'], valores: [15, 150] },
    grupo(['2026-02', 'pendente'], ['02/2026', 'Pendente'], [7, 70]),
    { tipo: 'subtotal', chaves: ['2026-02'], rotulos: ['02/2026'], valores: [7, 70] },
    { tipo: 'total', valores: [22, 220] }],
};

describe('prepararGrafico — um nível', () => {
  it('cada grupo é uma categoria; uma série só, na 1ª cor; subtotal e total não entram', () => {
    const g = prepararGrafico(UM_NIVEL, { metrica: 'm2' });
    expect(g.categorias.map(c => c.rotulo)).toEqual(['Pendente', 'Recebida', '(sem valor)']);
    expect(g.series).toHaveLength(1);
    expect(g.series[0].valores).toEqual([1000.5, 500, null]);          // sem valor continua nulo (não vira zero)
    expect(g.series[0].cor).toBe(CORES_SERIES[0]);
    expect(g.series[0].rotulo).toBe('Soma de Valor bruto');
    expect(g.metrica.formato).toBe('moeda');
  });
  it('o total escolhido muda os valores; total inexistente cai no primeiro', () => {
    expect(prepararGrafico(UM_NIVEL, { metrica: 'm1' }).series[0].valores).toEqual([586, 293, 1]);
    expect(prepararGrafico(UM_NIVEL, { metrica: 'zzz' }).metrica.chave).toBe('m1');
  });
  it('guarda as chaves do grupo para abrir os itens ao clicar', () => {
    expect(prepararGrafico(UM_NIVEL, {}).series[0].pontos[1]).toEqual({ chaves: ['pago'], rotulos: ['Recebida'] });
  });
});

describe('prepararGrafico — dois níveis', () => {
  it('1º nível vira categoria e 2º vira série; lacunas ficam nulas', () => {
    const g = prepararGrafico(DOIS_NIVEIS, { metrica: 'm1' });
    expect(g.categorias.map(c => c.rotulo)).toEqual(['01/2026', '02/2026']);
    expect(g.series.map(s => s.rotulo)).toEqual(['Recebida', 'Pendente']);
    expect(g.series[0].valores).toEqual([10, null]);
    expect(g.series[1].valores).toEqual([5, 7]);
    expect(g.series.map(s => s.cor)).toEqual([CORES_SERIES[0], CORES_SERIES[1]]);
    expect(g.series[1].pontos[1].chaves).toEqual(['2026-02', 'pendente']);
  });
  it('data no 1º nível => gráfico de linhas por padrão; senão colunas', () => {
    expect(tipoPadrao(DOIS_NIVEIS)).toBe('linhas');
    expect(tipoPadrao(UM_NIVEL)).toBe('colunas');
  });
});

describe('prepararGrafico — limites e rosca', () => {
  it('mais de 30 grupos: mostra 30 e avisa', () => {
    const muitos = { colunas: UM_NIVEL.colunas, linhas: Array.from({ length: 45 }, (_, i) => grupo([`k${i}`], [`G${i}`], [i + 1, 1])) };
    const g = prepararGrafico(muitos, {});
    expect(g.categorias).toHaveLength(30);
    expect(g.totalCategorias).toBe(45);
    expect(g.avisos[0]).toMatch(/30 de 45/);
  });
  it('mais de 8 séries: o excedente soma em "Outros" (cinza) quando o total é somável', () => {
    const linhas = Array.from({ length: 11 }, (_, i) => grupo(['2026-01', `s${i}`], ['01/2026', `S${i}`], [i + 1, 10]));
    const g = prepararGrafico({ colunas: DOIS_NIVEIS.colunas, linhas }, { metrica: 'm1' });
    expect(g.series).toHaveLength(9);
    const outros = g.series[8];
    expect(outros.rotulo).toBe('Outros (3)');
    expect(outros.cor).toBe(COR_OUTROS);
    expect(outros.valores).toEqual([9 + 10 + 11]);                    // 3 últimas séries somadas
    expect(g.avisos[0]).toMatch(/Outros/);
  });
  it('mais de 8 séries com média: não soma (seria mentira) — mostra as 8 primeiras e avisa', () => {
    const cols = { grupos: DOIS_NIVEIS.colunas.grupos, metricas: metricas([{ chave: 'm3', rotulo: 'Média', funcao: 'media', tipo: 'numero', formato: null }]) };
    const linhas = Array.from({ length: 10 }, (_, i) => grupo(['2026-01', `s${i}`], ['01/2026', `S${i}`], [1, 1, 2]));
    const g = prepararGrafico({ colunas: cols, linhas }, { metrica: 'm3' });
    expect(g.series).toHaveLength(8);
    expect(g.avisos[0]).toMatch(/não pode ser somado/);
  });
  it('rosca: só 1 nível, de 2 a 6 grupos e valores positivos', () => {
    expect(prepararGrafico(UM_NIVEL, { metrica: 'm1' }).rosca.ok).toBe(true);
    expect(prepararGrafico(UM_NIVEL, { metrica: 'm2' }).rosca.ok).toBe(false);          // há valor nulo
    expect(prepararGrafico(DOIS_NIVEIS, {}).rosca.motivo).toMatch(/um nível/);
    const sete = { colunas: UM_NIVEL.colunas, linhas: Array.from({ length: 7 }, (_, i) => grupo([i], [`G${i}`], [1, 1])) };
    expect(prepararGrafico(sete, {}).rosca.motivo).toMatch(/até 6/);
    const negativo = { colunas: UM_NIVEL.colunas, linhas: [grupo(['a'], ['A'], [1, 5]), grupo(['b'], ['B'], [1, -3])] };
    expect(prepararGrafico(negativo, { metrica: 'm2' }).rosca.ok).toBe(false);
  });
});

describe('prepararGrafico — sem o que mostrar', () => {
  it('sem agrupamento, sem total numérico ou sem grupos explica o motivo', () => {
    expect(prepararGrafico({ colunas: { grupos: [], metricas: metricas() }, linhas: [{ tipo: 'total', valores: [1, 1] }] }, {}).motivo).toMatch(/Agrupar e totalizar/);
    const soData = { colunas: { grupos: UM_NIVEL.colunas.grupos, metricas: [{ chave: 'm1', rotulo: 'Máximo de Vencimento', funcao: 'maximo', tipo: 'data' }] }, linhas: UM_NIVEL.linhas };
    expect(prepararGrafico(soData, {}).motivo).toMatch(/total numérico/);
    expect(metricasGraficaveis(soData)).toHaveLength(0);
    expect(prepararGrafico({ colunas: UM_NIVEL.colunas, linhas: [{ tipo: 'total', valores: [0, 0] }] }, {}).motivo).toMatch(/Nenhum grupo/);
  });
});
