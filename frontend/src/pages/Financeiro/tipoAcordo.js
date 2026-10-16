// Nome do tipo de lançamento que usa a estrutura de acordo/parcelas: acordo, alvará ou recebimento avulso
// (valor combinado à parte, sem repasse ao cliente; só o escritório e, se houver, um parceiro).
export function rotuloTipoAcordo(tipo) {
  if (tipo === 'alvara') return 'Alvará';
  if (tipo === 'avulso') return 'Recebimento Avulso';
  return 'Acordo';
}
// Versão curta para listas e Excel ("Avulso 1", "Acordo 2"...).
export function rotuloCurtoTipoAcordo(tipo) {
  if (tipo === 'alvara') return 'Alvará';
  if (tipo === 'avulso') return 'Avulso';
  return 'Acordo';
}
