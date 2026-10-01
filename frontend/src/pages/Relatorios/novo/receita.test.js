import { describe, expect, it } from 'vitest';
import {
  receitaVazia, novaCondicao, trocarCampo, trocarOperador, condicaoCompleta, contarCondicoes,
  contarIncompletas, atualizarNo, validarLocal, limparReceita, mover, valorInicial,
} from './receita';

const assunto = {
  chave: 'prazos', colunasPadrao: ['pasta', 'vencimento'], ordemPadrao: [{ campo: 'vencimento', direcao: 'asc' }],
  campos: [
    { chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', operadores: [{ valor: 'contem', aridade: 'um' }, { valor: 'vazio', aridade: 'nenhum' }] },
    { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', operadores: [{ valor: 'igual', aridade: 'um' }, { valor: 'entre', aridade: 'dois' }, { valor: 'no_periodo', aridade: 'periodo' }] },
    { chave: 'status', rotulo: 'Status', tipo: 'lista', operadores: [{ valor: 'em', aridade: 'lista' }] },
  ],
};
const periodos = [{ valor: 'hoje', rotulo: 'Hoje' }, { valor: 'este_mes', rotulo: 'Este mês' }];

describe('receita (funções puras)', () => {
  it('receita nova usa colunas e ordem padrão do assunto sem compartilhar referências', () => {
    const r = receitaVazia(assunto);
    expect(r).toMatchObject({ versao: 1, assunto: 'prazos', colunas: ['pasta', 'vencimento'], filtros: { op: 'E', itens: [] } });
    r.colunas.push('x'); r.ordem[0].direcao = 'desc';
    expect(assunto.colunasPadrao).toEqual(['pasta', 'vencimento']);
    expect(assunto.ordemPadrao[0].direcao).toBe('asc');
  });

  it('valor inicial combina com o tipo de condição', () => {
    expect(valorInicial('um')).toBe('');
    expect(valorInicial('dois')).toEqual(['', '']);
    expect(valorInicial('lista')).toEqual([]);
    expect(valorInicial('periodo', periodos)).toBe('hoje');
    expect(valorInicial('nenhum')).toBeNull();
  });

  it('trocar campo/operador reinicia o valor só quando o formato muda', () => {
    const c = novaCondicao(assunto, periodos);
    expect(c).toEqual({ campo: 'pasta', operador: 'contem', valor: '' });
    expect(trocarCampo(assunto, c, 'vencimento', periodos)).toEqual({ campo: 'vencimento', operador: 'igual', valor: '' });
    const venc = assunto.campos[1];
    expect(trocarOperador(venc, { campo: 'vencimento', operador: 'igual', valor: '2026-10-01' }, 'entre', periodos).valor).toEqual(['', '']);
    expect(trocarOperador(venc, { campo: 'vencimento', operador: 'entre', valor: ['a', 'b'] }, 'entre', periodos).valor).toEqual(['a', 'b']);
    expect(trocarOperador(venc, { campo: 'vencimento', operador: 'igual', valor: '2026-10-01' }, 'no_periodo', periodos).valor).toBe('hoje');
  });

  it('condição completa depende do formato do valor', () => {
    const ok = (c) => condicaoCompleta(assunto, c);
    expect(ok({ campo: 'pasta', operador: 'contem', valor: '' })).toBe(false);
    expect(ok({ campo: 'pasta', operador: 'contem', valor: '8969' })).toBe(true);
    expect(ok({ campo: 'pasta', operador: 'vazio', valor: null })).toBe(true);
    expect(ok({ campo: 'vencimento', operador: 'entre', valor: ['2026-01-01', ''] })).toBe(false);
    expect(ok({ campo: 'vencimento', operador: 'entre', valor: ['2026-01-01', '2026-02-01'] })).toBe(true);
    expect(ok({ campo: 'status', operador: 'em', valor: [] })).toBe(false);
    expect(ok({ campo: 'status', operador: 'em', valor: ['atrasado'] })).toBe(true);
    expect(ok({ campo: 'naoexiste', operador: 'em', valor: ['x'] })).toBe(false);
  });

  it('conta, atualiza e limpa a árvore de filtros', () => {
    const filtros = { op: 'E', itens: [
      { campo: 'pasta', operador: 'contem', valor: '' },
      { op: 'OU', itens: [{ campo: 'status', operador: 'em', valor: ['atrasado'] }, { campo: 'pasta', operador: 'contem', valor: 'x' }] },
      { op: 'OU', itens: [{ campo: 'pasta', operador: 'contem', valor: '' }] },
    ] };
    expect(contarCondicoes(filtros)).toBe(4);
    expect(contarIncompletas(assunto, filtros)).toBe(2);
    expect(atualizarNo(filtros, [1], g => ({ ...g, op: 'E' })).itens[1].op).toBe('E');
    expect(filtros.itens[1].op).toBe('OU'); // imutável
    const limpa = limparReceita(assunto, { ...receitaVazia(assunto), filtros });
    expect(limpa.filtros.itens).toHaveLength(1);                    // grupo vazio e condição incompleta saíram
    expect(limpa.filtros.itens[0].itens).toHaveLength(2);
  });

  it('validação local pede colunas e valores', () => {
    const r = receitaVazia(assunto);
    expect(validarLocal(assunto, r)).toEqual([]);
    expect(validarLocal(assunto, { ...r, colunas: [] })).toEqual(['Escolha ao menos uma coluna.']);
    expect(validarLocal(assunto, { ...r, filtros: { op: 'E', itens: [novaCondicao(assunto, periodos)] } })[0]).toMatch(/1 filtro\(s\) sem valor/);
  });

  it('mover reordena e ignora posições inválidas', () => {
    expect(mover(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(mover(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
    expect(mover(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });
});
