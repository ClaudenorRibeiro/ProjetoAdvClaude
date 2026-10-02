// ============================================================
// REDE DE SEGURANÇA DAS ROTAS
// O Express 4 NÃO captura erro de um handler assíncrono: uma exceção fora de try/catch (ou uma promessa rejeitada)
// derrubava o servidor INTEIRO, para todos os usuários, por causa de uma única requisição malformada.
// Aqui cada handler é envolvido: qualquer erro cai no tratamento de erro do app (resposta 500) e o servidor
// continua de pé. Handlers de erro (4 parâmetros) e sub-roteadores ficam como estão.
// ============================================================
function seguro(handler) {
  if (Array.isArray(handler)) return handler.map(seguro);
  if (typeof handler !== 'function' || handler.length === 4 || handler.stack) return handler;
  return function handlerSeguro(req, res, next) {
    try {
      const retorno = handler(req, res, next);
      if (retorno && typeof retorno.then === 'function') retorno.then(undefined, next);
    } catch (erro) {
      next(erro);
    }
  };
}

// Aplica a proteção a TODAS as rotas registradas depois dela neste roteador.
function protegerRotas(roteador) {
  for (const metodo of ['use', 'all', 'get', 'post', 'put', 'patch', 'delete']) {
    const original = roteador[metodo].bind(roteador);
    roteador[metodo] = (...argumentos) => original(...argumentos.map(seguro));
  }
  return roteador;
}

module.exports = { seguro, protegerRotas };
