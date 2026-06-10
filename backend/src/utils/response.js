// ============================================================
// PADRONIZAÇÃO DE RESPOSTAS DA API
// Todas as rotas usam estas funções para manter consistência
// ============================================================

// Resposta de sucesso — código 200 por padrão
function sucesso(res, dados, mensagem = 'Operação realizada com sucesso', status = 200) {
  return res.status(status).json({
    ok: true,
    mensagem,
    dados,
  });
}

// Resposta de erro — código 400 por padrão (erro do cliente)
function erro(res, mensagem = 'Erro inesperado', status = 400, detalhes = null) {
  const resposta = { ok: false, mensagem };
  if (detalhes) resposta.detalhes = detalhes;
  return res.status(status).json(resposta);
}

// Resposta de não autorizado — 401 (sem token ou token inválido)
function naoAutorizado(res, mensagem = 'Acesso não autorizado') {
  return res.status(401).json({ ok: false, mensagem });
}

// Resposta de proibido — 403 (tem token mas sem permissão)
function proibido(res, mensagem = 'Sem permissão para esta ação') {
  return res.status(403).json({ ok: false, mensagem });
}

// Resposta de não encontrado — 404
function naoEncontrado(res, mensagem = 'Registro não encontrado') {
  return res.status(404).json({ ok: false, mensagem });
}

// Resposta de erro interno — 500 (erro no servidor)
function erroInterno(res, err) {
  console.error('Erro interno:', err);
  return res.status(500).json({
    ok: false,
    mensagem: 'Erro interno no servidor. Tente novamente.',
  });
}

module.exports = { sucesso, erro, naoAutorizado, proibido, naoEncontrado, erroInterno };
