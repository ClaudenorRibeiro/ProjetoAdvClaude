// ============================================================
// LEITURA SEGURA DE CAMPOS DE TEXTO VINDOS DA TELA
// Um campo de texto pode chegar vazio, com espaços, longo demais ou nem ser texto (número, lista, objeto).
// Devolve { valor } (texto limpo; null quando vazio e opcional) ou { erro } com a mensagem para o usuário.
// ============================================================
function texto(bruto, { rotulo = 'Campo', max, obrigatorio = false, aceitaNumero = false, feminino = false } = {}) {
  // `feminino: true` para rótulos femininos ("A razão social", "A anotação"): "obrigatória", "longa", "inválida".
  const o = feminino ? 'a' : 'o';
  let t;
  if (typeof bruto === 'string') t = bruto.trim();
  else if (aceitaNumero && typeof bruto === 'number' && Number.isFinite(bruto)) t = String(bruto);
  else if (bruto === undefined || bruto === null) t = '';
  else if (obrigatorio) t = '';                                    // número/lista/objeto num campo de nome = como se faltasse
  else return { erro: `${rotulo} inválid${o}` };
  if (t === '') return obrigatorio ? { erro: `${rotulo} é obrigatóri${o}` } : { valor: null };
  if (max && t.length > max) return { erro: `${rotulo} muito long${o} (máximo ${max} caracteres)` };
  return { valor: t };
}

// Lê vários campos de uma vez: campos = { chave: { rotulo, max, obrigatorio?, aceitaNumero?, feminino? } }.
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

// Data "AAAA-MM-DD" de um dia que existe (rejeita 2026-02-30, 2026-13-45, números, listas...). Vazia = não informada ({ valor: null }).
function dataIso(bruto, { rotulo = 'Data' } = {}) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return { erro: `${rotulo} inválida (use o formato AAAA-MM-DD)` };
  const d = new Date(`${bruto}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== bruto) return { erro: `${rotulo} inválida` };
  return { valor: bruto };
}

// Número inteiro positivo (aceita número ou texto só de dígitos, como vem dos campos da tela). Vazio = não informado ({ valor: null }).
function inteiroPositivo(bruto, { rotulo = 'Valor', max = 2147483647 } = {}) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  const ok = (typeof bruto === 'number' && Number.isInteger(bruto)) || (typeof bruto === 'string' && /^\d+$/.test(bruto.trim()));
  const n = ok ? Number(bruto) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) return { erro: `${rotulo} inválido` };
  if (n > max) return { erro: `${rotulo} muito grande (máximo ${max})` };
  return { valor: n };
}

module.exports = { texto, lerTextos, dataIso, inteiroPositivo };
