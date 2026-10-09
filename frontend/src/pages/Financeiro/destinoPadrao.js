// Regras de ESCOLHA AUTOMÁTICA do Financeiro (cliente, conta do escritório). Só sugerem: a tela sempre deixa trocar.
// Ficam num arquivo pequeno, sem tela, para serem testadas sozinhas.

// Quem pode ser o cliente na lista: se o processo informa o lado do cliente (campo `cliente` true/false vindo do servidor),
// só as pessoas desse lado; se não informa (null) ou se ninguém for do lado do cliente, todas, como sempre foi.
// `manter` = pessoa já escolhida (do acordo ou da parcela): nunca some da lista, mesmo que não seja do lado do cliente.
export function clientesDoProcesso(beneficiarios, manter = null) {
  const lista = Array.isArray(beneficiarios) ? beneficiarios : [];
  const doCliente = lista.filter(b => b.cliente === true);
  const base = doCliente.length ? doCliente : lista;
  if (manter && manter.tipo && manter.id && !base.some(b => b.tipo === manter.tipo && String(b.id) === String(manter.id))) {
    const extra = lista.find(b => b.tipo === manter.tipo && String(b.id) === String(manter.id));
    if (extra) return [...base, extra];
  }
  return base;
}

// Cliente automático: só quando a lista tem UMA pessoa (com duas ou mais, quem decide é o usuário).
export function clienteUnico(clientes) {
  return Array.isArray(clientes) && clientes.length === 1 ? clientes[0] : null;
}

// Destino do repasse ao cliente de uma parcela: o que a própria parcela já tem; sem isso, o padrão do acordo
// (pessoa e conta andam juntas, nunca misturadas); sem nenhum dos dois, null.
export function destinoClienteDaParcela(p) {
  if (p?.repasse_cliente_pessoa_id) {
    return { tipo: p.repasse_cliente_tipo || null, pessoaId: p.repasse_cliente_pessoa_id, contaId: p.repasse_cliente_conta_id || null };
  }
  if (p?.acordo_cliente_id) {
    return { tipo: p.acordo_cliente_tipo || null, pessoaId: p.acordo_cliente_id, contaId: p.acordo_cliente_conta_id || null };
  }
  return null;
}

// Conta ou caixa do escritório sugerida: a principal; sem principal, o caixa em espécie se houver UM só (dinheiro em mãos).
// Com mais de um candidato não escolhe nada: a pessoa decide.
export function contaEscritorioPadrao(contas) {
  const lista = Array.isArray(contas) ? contas : [];
  const principal = lista.find(c => c.principal);
  if (principal) return principal.id;
  const caixas = lista.filter(c => c.tipo === 'especie');
  return caixas.length === 1 ? caixas[0].id : '';
}

// Forma de pagamento sugerida: só quando existe UMA compatível.
export function formaUnica(formasCompativeis) {
  return Array.isArray(formasCompativeis) && formasCompativeis.length === 1 ? formasCompativeis[0].id : '';
}

// Destino sugerido para uma lista de contas do beneficiário: a conta já definida (se ainda existir), senão a principal,
// senão "Dinheiro em espécie — em mãos".
export function destinoSugerido(contas, contaAtualId) {
  const lista = Array.isArray(contas) ? contas : [];
  const atual = contaAtualId ? lista.find(c => String(c.id) === String(contaAtualId)) : null;
  if (atual) return { tipo: 'bancaria', contaId: atual.id, porFaltaDeConta: false };
  const principal = lista.find(c => c.principal);
  if (principal) return { tipo: 'bancaria', contaId: principal.id, porFaltaDeConta: false };
  return { tipo: 'em_maos', contaId: '', porFaltaDeConta: true };
}
