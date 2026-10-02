// Regra do projeto: teste PULADO conta como REPROVADO. Pular é não ter verificado — a bateria
// não pode aprovar o que não fez. Procura, no resumo que cada ferramenta imprime, qualquer
// contagem de testes pulados/pendentes/não executados.
const PADROES_PULADOS = [
  /^(?:ℹ|#)\s+(?:skipped|todo|cancelled)\s+([1-9]\d*)/im,                     // node --test (spec ou TAP)
  /^\s*Test(?:s| Files)\s.*?\b([1-9]\d*)\s+(?:skipped|todo)\b/im,              // vitest
  /^\s+([1-9]\d*)\s+(?:skipped|did not run|flaky|interrupted)\s*$/im,           // playwright
];

export function contarPulados(saida) {
  let total = 0;
  for (const padrao of PADROES_PULADOS) {
    const m = padrao.exec(saida);
    if (m) total += Number(m[1]);
  }
  return total;
}
