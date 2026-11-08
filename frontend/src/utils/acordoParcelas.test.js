import { describe, it, expect } from 'vitest';
import { recalcularParcelasAoEditarBruto, soNumeroParcelas } from './acordoParcelas';

function parcelas(valores) {
  return valores.map((v) => ({ valor_bruto: v, status: 'pendente' }));
}

describe('recalcularParcelasAoEditarBruto', () => {
  it('editar uma parcela redistribui igualmente entre as demais, soma bate com o total', () => {
    const base = parcelas(['2.000,00', '2.000,00', '2.000,00', '2.000,00']); // total 8.000,00
    const { parcelas: r } = recalcularParcelasAoEditarBruto(base, 8000, 0, '5.000,00');
    expect(r[0].valor_bruto).toBe('5.000,00');
    expect(r[0]._brutoManual).toBe(true);
    // restam 3.000,00 para 3 parcelas = 1.000,00 cada
    expect(r[1].valor_bruto).toBe('1.000,00');
    expect(r[2].valor_bruto).toBe('1.000,00');
    expect(r[3].valor_bruto).toBe('1.000,00');
  });

  it('diferença de centavos fica na última parcela ainda livre', () => {
    const base = parcelas(['0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00']); // 10 parcelas, total 20.000
    const { parcelas: r } = recalcularParcelasAoEditarBruto(base, 20000, 0, '2.000,00'); // 1ª parcela do print
    // restam 18.000,00 para 9 parcelas livres = 2.000,00 cada, sem sobra de centavos aqui
    expect(r.slice(1).every((p) => p.valor_bruto === '2.000,00')).toBe(true);
    // caso real de sobra de centavos: total 100,01 em 3 parcelas, 1ª travada em 0,00
    const base2 = parcelas(['0,00', '0,00', '0,00']);
    const { parcelas: r2 } = recalcularParcelasAoEditarBruto(base2, 100.01, 0, '0,00');
    expect(r2[1].valor_bruto).toBe('50,00');
    expect(r2[2].valor_bruto).toBe('50,01'); // a última livre absorve o centavo
  });

  it('editar duas parcelas: só as outras (não editadas) se ajustam', () => {
    const base = parcelas(['2.000,00', '2.000,00', '2.000,00', '2.000,00']); // total 8.000,00
    let { parcelas: r } = recalcularParcelasAoEditarBruto(base, 8000, 0, '5.000,00');
    ({ parcelas: r } = recalcularParcelasAoEditarBruto(r, 8000, 1, '1.000,00'));
    expect(r[0].valor_bruto).toBe('5.000,00'); // continua travada na 1ª edição
    expect(r[1].valor_bruto).toBe('1.000,00');
    // restam 2.000,00 para as parcelas 2 e 3 (índices 2 e 3) = 1.000,00 cada
    expect(r[2].valor_bruto).toBe('1.000,00');
    expect(r[3].valor_bruto).toBe('1.000,00');
  });

  it('valor que ultrapassa o total do acordo é recusado, nada muda', () => {
    const base = parcelas(['2.000,00', '2.000,00', '2.000,00', '2.000,00']); // total 8.000,00
    const resultado = recalcularParcelasAoEditarBruto(base, 8000, 0, '9.000,00');
    expect(resultado.erro).toBe('excede');
    expect(resultado.parcelas).toBeUndefined();
  });

  it('parcela já recebida (status pago) nunca é mexida pelo reajuste', () => {
    const base = [
      { valor_bruto: '2.000,00', status: 'pago' },
      { valor_bruto: '2.000,00', status: 'pendente' },
      { valor_bruto: '2.000,00', status: 'pendente' },
    ]; // total 6.000,00
    const { parcelas: r } = recalcularParcelasAoEditarBruto(base, 6000, 1, '3.000,00');
    expect(r[0].valor_bruto).toBe('2.000,00'); // paga, intocada
    expect(r[1].valor_bruto).toBe('3.000,00'); // a que foi editada
    expect(r[2].valor_bruto).toBe('1.000,00'); // a única livre absorve o restante
  });

  it('sem nenhuma parcela livre sobrando, só marca a editada e não mexe nas outras', () => {
    const base = parcelas(['2.000,00', '2.000,00']);
    let { parcelas: r } = recalcularParcelasAoEditarBruto(base, 4000, 0, '1.000,00');
    ({ parcelas: r } = recalcularParcelasAoEditarBruto(r, 4000, 1, '1.000,00'));
    expect(r[0].valor_bruto).toBe('1.000,00');
    expect(r[1].valor_bruto).toBe('1.000,00'); // ambas já manuais, nenhuma "livre" para reajustar
  });
});

describe('soNumeroParcelas', () => {
  it('aceita só dígitos e recusa letra, sinal e o e do type=number', () => {
    expect(soNumeroParcelas('25')).toBe('25');
    expect(soNumeroParcelas('6-66+212')).toBe('360');
    expect(soNumeroParcelas('abc')).toBe('');
    expect(soNumeroParcelas('12e3')).toBe('123');
    expect(soNumeroParcelas('0')).toBe('');
    expect(soNumeroParcelas(3)).toBe('3');
  });
});
