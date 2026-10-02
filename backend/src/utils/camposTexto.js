// ============================================================
// LEITURA SEGURA DE CAMPOS DE TEXTO VINDOS DA TELA
// Um campo de texto pode chegar vazio, com espaços, longo demais ou nem ser texto (número, lista, objeto).
// Devolve { valor } (texto limpo; null quando vazio e opcional) ou { erro } com a mensagem para o usuário.
// ============================================================
function texto(bruto, { rotulo = 'Campo', max, obrigatorio = false, aceitaNumero = false } = {}) {
  let t;
  if (typeof bruto === 'string') t = bruto.trim();
  else if (aceitaNumero && typeof bruto === 'number' && Number.isFinite(bruto)) t = String(bruto);
  else if (bruto === undefined || bruto === null) t = '';
  else if (obrigatorio) t = '';                                    // número/lista/objeto num campo de nome = como se faltasse
  else return { erro: `${rotulo} inválido` };
  if (t === '') return obrigatorio ? { erro: `${rotulo} é obrigatório` } : { valor: null };
  if (max && t.length > max) return { erro: `${rotulo} muito longo (máximo ${max} caracteres)` };
  return { valor: t };
}

// Lê vários campos de uma vez: campos = { chave: { rotulo, max, obrigatorio?, aceitaNumero? } }.
// Devolve { dados } ou { erro } (a primeira mensagem de erro).
function lerTextos(corpo, campos) {
  const dados = {};
  for (const [chave, opcoes] of Object.entries(campos)) {
    const r = texto((corpo || {})[chave], opcoes);
    if (r.erro) return { erro: r.erro };
    dados[chave] = r.valor;
  }
  return { dados };
}

module.exports = { texto, lerTextos };
