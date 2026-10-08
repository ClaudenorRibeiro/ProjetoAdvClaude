// Avisos aos clientes — as rotas da tela de conferência. A permissão é por módulo (ver permissoes.js).
const { sucesso, erro, erroInterno, naoEncontrado } = require('../utils/response');
const armazenamento = require('./armazenamento');
const decisao = require('./decisao');
const listagem = require('./listagem');
const { modulosPermitidos } = require('./permissoes');
const { gerarAvisos } = require('./geracao');

function responderErro(res, err) {
  if (err instanceof decisao.ErroAviso) return erro(res, err.message, err.status, err.extra);
  return erroInterno(res, err);
}

// Carrega o aviso e confere se a pessoa pode mexer nos avisos daquele módulo.
async function avisoPermitido(req, res) {
  const aviso = await armazenamento.buscar(req.params.id);
  if (!aviso) { naoEncontrado(res, 'Aviso não encontrado'); return null; }
  if (!(await modulosPermitidos(req.usuario)).includes(aviso.modulo)) { erro(res, 'Sem permissão para os avisos deste módulo', 403); return null; }
  return aviso;
}

async function listar(req, res) {
  try {
    const modulos = await modulosPermitidos(req.usuario);
    const { itens, smsAtivo } = await listagem.listarPendentes(modulos);
    return sucesso(res, { itens, modulos, sms_ativo: smsAtivo });
  } catch (err) { return erroInterno(res, err); }
}

async function contagem(req, res) {
  try { return sucesso(res, { total: await listagem.contarPendentes(await modulosPermitidos(req.usuario)) }); }
  catch (err) { return erroInterno(res, err); }
}

async function historico(req, res) {
  try { return sucesso(res, await listagem.listarHistorico(await modulosPermitidos(req.usuario))); }
  catch (err) { return erroInterno(res, err); }
}

// "Atualizar a lista": roda a mesma rotina da manhã (lembretes e parabéns que já valem). Só quem tem algum módulo.
async function atualizar(req, res) {
  try {
    if (!(await modulosPermitidos(req.usuario)).length) return erro(res, 'Sem permissão para os avisos', 403);
    return sucesso(res, await gerarAvisos(), 'Lista atualizada');
  } catch (err) { return erroInterno(res, err); }
}

async function editar(req, res) {
  try {
    if (!(await avisoPermitido(req, res))) return undefined;
    await decisao.editarAviso(req.params.id, req.body || {}, req.usuario);
    return sucesso(res, null, 'Aviso atualizado');
  } catch (err) { return responderErro(res, err); }
}

async function enviar(req, res) {
  try {
    if (!(await avisoPermitido(req, res))) return undefined;
    const r = await decisao.enviarAviso(req.params.id, req.body || {}, req.usuario);
    return sucesso(res, r, 'Aviso enviado');
  } catch (err) { return responderErro(res, err); }
}

async function descartar(req, res) {
  try {
    if (!(await avisoPermitido(req, res))) return undefined;
    await decisao.descartarAviso(req.params.id, req.body || {}, req.usuario);
    return sucesso(res, null, 'Aviso descartado');
  } catch (err) { return responderErro(res, err); }
}

module.exports = { listar, contagem, historico, atualizar, editar, enviar, descartar };
