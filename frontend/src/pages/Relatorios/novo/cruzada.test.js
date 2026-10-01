import { describe, expect, it } from 'vitest';
import { MAX_COLUNAS_CRUZADA, montarCruzada } from './cruzada';

const metricas = [
  { chave: 'm1', rotulo: 'Quantidade', funcao: 'contagem', tipo: 'numero' },
  { chave: 'm2', rotulo: 'Média de Valor', funcao: 'media', tipo: 'numero', formato: 'moeda' },
  { chave: 'm3', rotulo: 'Máximo de Data', funcao: 'maximo', tipo: 'data' }];
const g = (c, r, v) => ({ tipo: 'grupo', chaves: c, rotulos: r, valores: v });
const DADOS = {
  colunas: { grupos: [{ chave: 'a', rotulo: 'Área' }, { chave: 'b', rotulo: 'Status' }], metricas },
  linhas: [
    g(['t', 'ativo'], ['Trabalhista', 'Ativo'], [10, 100, '2026-01-01']), g(['t', 'arq'], ['Trabalhista', 'Arquivado'], [5, 50, null]),
    { tipo: 'subtotal', chaves: ['t'], rotulos: ['Trabalhista'], valores: [15, 83.33, null] },
    g(['c', 'ativo'], ['Cível', 'Ativo'], [7, 70, null]),
    { tipo: 'subtotal', chaves: ['c'], rotulos: ['Cível'], valores: [7, 70, null] },
    { tipo: 'total', valores: [22, 78, null] }],
};

describe('montarCruzada', () => {
  it('1º grupo nas linhas, 2º nas colunas, valor no cruzamento; célula vazia = nula', () => {
    const c = montarCruzada(DADOS, 'm1');
    expect(c.colunas.map(x => x.rotulo)).toEqual(['Ativo', 'Arquivado']);
    expect(c.linhas.map(l => l.rotulo)).toEqual(['Trabalhista', 'Cível']);
    expect(c.linhas[0].celulas.map(x => x.valor)).toEqual([10, 5]);
    expect(c.linhas[1].celulas.map(x => x && x.valor)).toEqual([7, null]);
    expect(c.linhas[0].celulas[1].chaves).toEqual(['t', 'arq']);          // para abrir os itens ao clicar
  });
  it('totais: da linha vem do subtotal do servidor; da coluna só soma quando é quantidade/soma', () => {
    const c = montarCruzada(DADOS, 'm1');
    expect(c.linhas.map(l => l.total)).toEqual([15, 7]);
    expect(c.totaisColuna).toEqual([17, 5]);
    expect(c.totalGeral).toBe(22);
    const media = montarCruzada(DADOS, 'm2');
    expect(media.totaisColuna).toBeNull();                                  // somar médias seria mentira
    expect(media.linhas[0].total).toBe(83.33);                              // mas o total da LINHA (média da linha) vem do servidor
    expect(media.totalGeral).toBe(78);
  });
  it('totais de data não entram; sem 2 níveis explica', () => {
    expect(montarCruzada(DADOS, 'm3').metrica.chave).toBe('m1');
    expect(montarCruzada({ colunas: { grupos: [DADOS.colunas.grupos[0]], metricas }, linhas: [] }, 'm1').motivo).toMatch(/2 níveis/);
    expect(montarCruzada({ colunas: { grupos: DADOS.colunas.grupos, metricas: [metricas[2]] }, linhas: DADOS.linhas }, 'm3').motivo).toMatch(/numérico/);
  });
  it('limita as colunas e avisa quantas existem', () => {
    const linhas = Array.from({ length: 55 }, (_, i) => g(['x', `s${i}`], ['X', `S${i}`], [1, 1, null]));
    const c = montarCruzada({ colunas: DADOS.colunas, linhas }, 'm1');
    expect(c.colunas).toHaveLength(MAX_COLUNAS_CRUZADA);
    expect(c.totalColunas).toBe(55);
  });
});
