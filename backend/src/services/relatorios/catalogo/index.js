// ============================================================
// CATÁLOGO DE ASSUNTOS — a ÚNICA porta para saber o que pode virar relatório.
// Assunto novo = um arquivo novo nesta pasta + uma linha aqui.
// ============================================================
const { pode } = require('../visibilidade');
const { operadoresDoTipo, agrupavel, funcoesDoCampo, ehData, PASSOS_DATA } = require('../tipos');
const { listarPeriodos } = require('../datasRelativas');

const ASSUNTOS = {
  prazos: require('./prazos'),
  tarefas: require('./tarefas'),
  audiencias: require('./audiencias'),
  pericias: require('./pericias'),
  processos: require('./processos'),
  pessoas_fisicas: require('./pessoas_fisicas'),
  pessoas_juridicas: require('./pessoas_juridicas'),
  financeiro_parcelas: require('./financeiro_parcelas'),
  financeiro_lancamentos: require('./financeiro_lancamentos'),
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

// Para montar a TELA: se a lista de opções de UM campo falhar (ex.: tabela que o banco ainda não tem),
// só esse campo fica sem opções — o erro vai para o log e o resto dos relatórios continua funcionando.
async function opcoesParaTela(campo, ctx, assunto, chave) {
  try { return await opcoesDoCampo(campo, ctx); }
  catch (err) {
    console.error(`Relatórios: não foi possível listar as opções de "${assunto.chave}.${chave}":`, err.message);
    return [];
  }
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
        opcoes: await opcoesParaTela(campo, ctx, assunto, chave),
        agrupavel: agrupavel(campo),
        passos: ehData(campo.tipo) ? Object.entries(PASSOS_DATA).map(([valor, rotulo]) => ({ valor, rotulo })) : null,
        funcoes: funcoesDoCampo(campo),   // totais possíveis neste campo (além da contagem)
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

// Ações por linha que o usuário pode usar neste assunto (ex.: ['parabenizar'])
function acoesDoAssunto(ctx, assunto) {
  return (assunto.acoes || []).filter(a => pode(ctx, a.permissao.chave, a.permissao.acao)).map(a => a.chave);
}

module.exports = { acoesDoAssunto, obterAssunto, assuntoPermitido, campoPermitido, opcoesDoCampo, catalogoParaUsuario };
