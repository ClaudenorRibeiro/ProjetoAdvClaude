// Avisos aos clientes — a decisão de uma pessoa na tela: enviar (pelos canais marcados), descartar ou editar o texto.
const auditoria = require('../middleware/auditoria');
const armazenamento = require('./armazenamento');
const { contatosDoCliente, smsHabilitado, canaisDisponiveis } = require('./contatos');
const { enviarCanais } = require('./envio');
const { lerConfig } = require('./config');
const { CANAIS } = require('./constantes');

class ErroAviso extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.extra = extra; }
}

// Texto para quem chegou tarde: o aviso já foi decidido por outra pessoa. A tela mostra e atualiza a lista.
function mensagemConflito(aviso) {
  const por = aviso.decidido_por_nome ? ` por ${aviso.decidido_por_nome}` : '';
  if (aviso.status === 'enviado') return `Este aviso acabou de ser enviado${por}. A lista foi atualizada.`;
  if (aviso.status === 'descartado') return `Este aviso acabou de ser descartado${por}. A lista foi atualizada.`;
  if (aviso.status === 'enviando') return 'Este aviso está sendo enviado por outra pessoa neste momento. A lista foi atualizada.';
  return 'Este aviso não vale mais (o evento mudou ou já passou). A lista foi atualizada.';
}

async function reservarOuFalhar(id, usuarioId) {
  const aviso = await armazenamento.buscar(id);
  if (!aviso) throw new ErroAviso(404, 'Aviso não encontrado');
  if (!(await armazenamento.reservar(id, usuarioId))) {
    throw new ErroAviso(409, mensagemConflito(await armazenamento.buscar(id)), { atualizar: true });
  }
  return aviso;
}

function lerTextos(corpo, aviso) {
  const assunto = corpo.assunto === undefined ? aviso.assunto : corpo.assunto;
  const texto = corpo.texto === undefined ? aviso.texto : corpo.texto;
  if (typeof assunto !== 'string' || !assunto.trim() || assunto.length > 200) throw new ErroAviso(400, 'O assunto é obrigatório (até 200 caracteres)');
  if (typeof texto !== 'string' || !texto.trim() || texto.length > 2000) throw new ErroAviso(400, 'O texto é obrigatório (até 2.000 caracteres)');
  return { assunto: assunto.trim(), texto: texto.trim() };
}

// Edita o texto de um aviso pendente (assunto e/ou texto).
async function editarAviso(id, corpo, usuario) {
  const aviso = await armazenamento.buscar(id);
  if (!aviso) throw new ErroAviso(404, 'Aviso não encontrado');
  if (aviso.status !== 'pendente') throw new ErroAviso(409, mensagemConflito(aviso), { atualizar: true });
  const { assunto, texto } = lerTextos(corpo, aviso);
  if (!(await armazenamento.gravarTexto(id, assunto, texto))) throw new ErroAviso(409, mensagemConflito(await armazenamento.buscar(id)), { atualizar: true });
  await auditoria.registrar(usuario.id, 'avisos_cliente', 'editar', id, { assunto: aviso.assunto, texto: aviso.texto }, { assunto, texto });
}

// Envia pelos canais marcados. Se nenhum canal conseguir, o aviso volta para a lista (nada se perde).
async function enviarAviso(id, corpo, usuario) {
  const canais = [...new Set(Array.isArray(corpo.canais) ? corpo.canais : [])];
  if (!canais.length || canais.some(c => !CANAIS.includes(c))) throw new ErroAviso(400, 'Escolha ao menos um canal de envio');
  const aviso = await reservarOuFalhar(id, usuario.id);
  try {
    const { assunto, texto } = lerTextos(corpo, aviso);
    if (assunto !== aviso.assunto || texto !== aviso.texto) await armazenamento.gravarTexto(id, assunto, texto);
    const contatos = await contatosDoCliente(aviso.cliente_tipo, aviso.cliente_id);
    const disponiveis = canaisDisponiveis(contatos, await smsHabilitado());
    const indisponivel = canais.find(c => !disponiveis[c]);
    if (!contatos || indisponivel) throw new ErroAviso(400, `O cliente não tem como receber por ${indisponivel === 'sms' ? 'SMS' : indisponivel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}`);
    const escritorio = (await lerConfig()).escritorio;
    const resultados = await enviarCanais({ aviso: { ...aviso, assunto, texto }, canais, contatos, escritorio, usuarioId: usuario.id });
    if (!Object.values(resultados).some(r => r.ok)) {
      const erros = Object.entries(resultados).map(([c, r]) => `${c}: ${r.erro}`).join('; ');
      await armazenamento.liberar(id, `Falha no envio — ${erros}`);
      throw new ErroAviso(502, `Não foi possível enviar: ${erros}. O aviso continua na lista.`, { resultados });
    }
    await armazenamento.finalizar(id, { status: 'enviado', modo: 'tela', motivo: null });
    await auditoria.registrar(usuario.id, 'avisos_cliente', 'enviar', id, null, { canais, resultados: Object.fromEntries(Object.entries(resultados).map(([c, r]) => [c, r.ok])) });
    return { resultados, whatsapp: resultados.whatsapp ? { numero: resultados.whatsapp.destino, texto } : null };
  } catch (err) {
    if (!(err instanceof ErroAviso) || err.status !== 502) await armazenamento.liberar(id, err.message);
    throw err;
  }
}

async function descartarAviso(id, corpo, usuario) {
  const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.trim().slice(0, 300) : '';
  await reservarOuFalhar(id, usuario.id);
  await armazenamento.finalizar(id, { status: 'descartado', modo: 'tela', motivo: motivo || null });
  await auditoria.registrar(usuario.id, 'avisos_cliente', 'descartar', id, null, { motivo: motivo || null });
}

module.exports = { ErroAviso, enviarAviso, descartarAviso, editarAviso, mensagemConflito };
