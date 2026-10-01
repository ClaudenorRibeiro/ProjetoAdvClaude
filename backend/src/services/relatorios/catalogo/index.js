// ============================================================
// CATÁLOGO DE ASSUNTOS — a ÚNICA porta para saber o que pode virar relatório.
// Assunto novo = um arquivo novo nesta pasta + uma linha aqui.
// ============================================================
const { pode } = require('../visibilidade');
const { operadoresDoTipo } = require('../tipos');
const { listarPeriodos } = require('../datasRelativas');

const ASSUNTOS = {
  prazos: require('./prazos'),
  tarefas: require('./tarefas'),
};

function obterAssunto(chave) {
  return Object.prototype.hasOwnProperty.call(ASSUNTOS, chave) ? ASSUNTOS[chave] : null;
}

function assuntoPermitido(ctx, assunto) {
  return pode(ctx, assunto.permissao.chave, assunto.permissao.acao);
}

// Campo extra pode exigir permissão própria (campo.permissao = { chave, acao }); sem isso, vale a do assunto
function campoPermitido(ctx, campo) {
  return !campo.permissao || pode(ctx, campo.permissao.chave, campo.permissao.acao);
}

async function opcoesDoCampo(campo, ctx) {
  if (campo.tipo !== 'lista') return null;
  return typeof campo.opcoes === 'function' ? campo.opcoes(ctx) : (campo.opcoes || []);
}

// O que a TELA recebe: só assuntos/campos que o usuário pode usar (nunca a expressão SQL)
async function catalogoParaUsuario(ctx) {
  const assuntos = [];
  for (const assunto of Object.values(ASSUNTOS)) {
    if (!assuntoPermitido(ctx, assunto)) continue;
    const campos = [];
    for (const [chave, campo] of Object.entries(assunto.campos)) {
      if (!campoPermitido(ctx, campo)) continue;
      campos.push({
        chave, rotulo: campo.rotulo, tipo: campo.tipo, formato: campo.formato || null,
        operadores: Object.entries(operadoresDoTipo(campo.tipo)).map(([valor, o]) => ({ valor, rotulo: o.rotulo, aridade: o.aridade })),
        opcoes: await opcoesDoCampo(campo, ctx),
      });
    }
    assuntos.push({
      chave: assunto.chave, rotulo: assunto.rotulo, campos,
      colunasPadrao: assunto.colunasPadrao.filter(c => campos.some(x => x.chave === c)),
      ordemPadrao: assunto.ordemPadrao,
    });
  }
  return { assuntos, periodos: listarPeriodos() };
}

module.exports = { obterAssunto, assuntoPermitido, campoPermitido, opcoesDoCampo, catalogoParaUsuario };
