// Avisos aos clientes — texto de cada aviso (puro texto: serve para e-mail, SMS e WhatsApp; a pessoa pode editar na tela).
const { soData } = require('./regras');

const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'cliente';
const dataBr = (iso) => (soData(iso) || '').split('-').reverse().join('/');
const horaCurta = (h) => (h ? String(h).slice(0, 5) : '');
const quando = (item) => `${dataBr(item.data)}${item.hora ? ` às ${horaCurta(item.hora)}` : ''}`;
const fecho = (escritorio) => (escritorio ? `Em caso de dúvidas, fale com o escritório ${escritorio}.` : 'Em caso de dúvidas, fale com o escritório.');

function enderecoPericia(p) {
  const rua = [p.logradouro, p.numero, p.complemento, p.bairro, [p.cidade, p.estado].filter(Boolean).join('-')].filter(Boolean).join(', ');
  return [p.local, rua].filter(Boolean).join(' — ');
}

// item = linha da perícia com tipo_nome, perito_nome e processo_numero.
function textoPericia(tipo, item, nomeCliente, escritorio) {
  const proc = item.processo_numero ? ` do processo ${item.processo_numero}` : '';
  const ola = `Olá, ${primeiroNome(nomeCliente)}.`;
  const local = enderecoPericia(item);
  const detalhes = `${item.tipo_nome ? `${item.tipo_nome}, ` : ''}em ${quando(item)}${local ? `, local: ${local}` : ''}${item.perito_nome ? `. Perito: ${item.perito_nome}` : ''}.`;
  if (tipo === 'cancelada') return { assunto: `Perícia cancelada${item.processo_numero ? ` — Proc. ${item.processo_numero}` : ''}`, texto: `${ola} Informamos que a perícia${proc} que estava marcada para ${dataBr(item.data)} foi CANCELADA. ${fecho(escritorio)}` };
  const abertura = { agendada: `Informamos que foi agendada uma perícia${proc}:`, remarcada: `Informamos que sua perícia${proc} foi REMARCADA:`, lembrete: `Lembramos que você tem uma perícia${proc}:` }[tipo];
  const assunto = { agendada: 'Perícia agendada', remarcada: 'Perícia remarcada', lembrete: 'Lembrete de perícia' }[tipo];
  return { assunto: `${assunto}${item.processo_numero ? ` — Proc. ${item.processo_numero}` : ''}`, texto: `${ola} ${abertura} ${detalhes} Por favor, compareça no dia e horário indicados. ${fecho(escritorio)}` };
}

// item = linha da audiência com tipo_nome e processo_numero.
function textoAudiencia(tipo, item, nomeCliente, escritorio) {
  const proc = item.processo_numero ? ` do processo ${item.processo_numero}` : '';
  const ola = `Olá, ${primeiroNome(nomeCliente)}.`;
  const virtual = item.modalidade === 'virtual';
  const onde = virtual
    ? `Será por videoconferência${item.plataforma_virtual ? ` (${item.plataforma_virtual})` : ''}${item.link_virtual ? `, link: ${item.link_virtual}` : ''}.`
    : (item.local ? `Local: ${item.local}.` : '');
  const detalhes = `${item.tipo_nome ? `${item.tipo_nome}, ` : ''}em ${quando(item)}. ${onde}`.trim();
  if (tipo === 'cancelada') return { assunto: `Audiência cancelada${item.processo_numero ? ` — Proc. ${item.processo_numero}` : ''}`, texto: `${ola} Informamos que a audiência${proc} que estava marcada para ${dataBr(item.data)} foi CANCELADA. ${fecho(escritorio)}` };
  const abertura = { agendada: `Informamos que foi agendada uma audiência${proc}:`, remarcada: `Informamos que sua audiência${proc} foi REMARCADA:`, lembrete: `Lembramos que você tem uma audiência${proc}:` }[tipo];
  const assunto = { agendada: 'Audiência agendada', remarcada: 'Audiência remarcada', lembrete: 'Lembrete de audiência' }[tipo];
  return { assunto: `${assunto}${item.processo_numero ? ` — Proc. ${item.processo_numero}` : ''}`, texto: `${ola} ${abertura} ${detalhes} Por favor, compareça no dia e horário indicados. ${fecho(escritorio)}` };
}

module.exports = { textoPericia, textoAudiencia, primeiroNome, dataBr };
