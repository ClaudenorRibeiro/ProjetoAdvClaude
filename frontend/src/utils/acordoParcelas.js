import { parseMoeda, numeroParaMascaraMoeda } from './formatters';

// Nº de parcelas do Novo Acordo: só dígitos, inteiro de 1 a 360 (mesmo teto do servidor).
// Caixa type=number do navegador aceitava e, +, - e texto colado (print 08/11/2026).
export function soNumeroParcelas(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (!d) return '';
  const n = Number(d);
  if (!Number.isSafeInteger(n) || n < 1) return '';
  return String(Math.min(n, 360));
}

// Edição manual do valor Bruto de UMA parcela do acordo: o valor total do acordo é soberano.
// As parcelas ainda LIVRES (não recebidas e não editadas na mão antes) se reajustam, divisão
// igual com a diferença de centavos acumulada na ÚLTIMA parcela livre, para a soma bater com o total.
// Parcela recebida (status 'pago') ou já marcada como editada na mão (_brutoManual) não é mexida.
// Devolve { parcelas } com o array atualizado, ou { erro: 'excede' } sem alterar nada
// (o valor digitado, sozinho com as demais já travadas, passaria do valor total do acordo).
export function recalcularParcelasAoEditarBruto(parcelas, valorTotal, indice, novoValorBrutoMascarado) {
  const atual = parcelas.map((p, idx) =>
    idx === indice ? { ...p, valor_bruto: novoValorBrutoMascarado, _brutoManual: true } : p
  );
  const travada = (p) => p.status === 'pago' || p._brutoManual;
  const somaTravadasCent = atual
    .filter(travada)
    .reduce((s, p) => s + Math.round(parseMoeda(p.valor_bruto) * 100), 0);
  const totalCent = Math.round((Number(valorTotal) || 0) * 100);
  const restanteCent = totalCent - somaTravadasCent;
  if (restanteCent < 0) return { erro: 'excede' };

  const livres = atual.map((p, idx) => idx).filter((idx) => !travada(atual[idx]));
  if (!livres.length) return { parcelas: atual };

  const baseCent = Math.floor(restanteCent / livres.length);
  const ultimoCent = restanteCent - baseCent * (livres.length - 1);
  const parcelasAtualizadas = atual.map((p, idx) => {
    const pos = livres.indexOf(idx);
    if (pos === -1) return p;
    const cents = pos === livres.length - 1 ? ultimoCent : baseCent;
    return { ...p, valor_bruto: numeroParaMascaraMoeda(cents / 100) };
  });
  return { parcelas: parcelasAtualizadas };
}
