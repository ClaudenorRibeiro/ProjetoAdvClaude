// Mensagem de parabéns de aniversário: lê o texto configurado do escritório e resolve {{nome}} e {{escritorio}}.
// Usado pela lista de aniversariantes (Pessoas) e pelos avisos automáticos aos clientes.

// Lê nome do escritório + template da mensagem. Tolerante à coluna mensagem_aniversario
// ainda não existir (se o ALTER não tiver sido rodado, usa o texto padrão).
// Aceita 'pool' ou uma conexão de transação (ambos têm .execute).
async function lerConfigEscritorio(exec) {
  try {
    const [r] = await exec.execute('SELECT nome, mensagem_aniversario FROM configuracoes_escritorio LIMIT 1');
    return { nome: r[0]?.nome || '', template: r[0]?.mensagem_aniversario || '' };
  } catch (_) {
    const [r] = await exec.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1');
    return { nome: r[0]?.nome || '', template: '' };
  }
}

// Monta a mensagem resolvendo {{nome}} (1º nome do cliente) e {{escritorio}}.
function montarMensagemParabens(template, nomeCliente, nomeEscritorio) {
  const primeiroNome = String(nomeCliente || '').trim().split(/\s+/)[0] || String(nomeCliente || '');
  const padrao = 'Olá, {{nome}}! O escritório {{escritorio}} deseja a você um feliz aniversário! 🎂';
  const txt = (template && template.trim()) ? template : padrao;
  return txt
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*escritorio\s*\}\}/gi, nomeEscritorio || '');
}

module.exports = { lerConfigEscritorio, montarMensagemParabens };
