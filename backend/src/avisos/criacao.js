// Avisos aos clientes — cria os avisos de um evento (um por cliente do processo). Repetir a chamada não duplica nada.
const { buscarClientesDoProcesso } = require('../services/comunicadoService');
const { pool } = require('../config/database');
const armazenamento = require('./armazenamento');
const { soData } = require('./regras');

// mod = módulo de evento (pericia/audiencia); item = registro carregado; devolve [{ id, novo, status }].
async function criarAvisosDoEvento(mod, tipo, item, dataAviso, cfg) {
  const { clientes } = await buscarClientesDoProcesso(item.processo_id);
  const criados = [];
  for (const c of clientes) {
    const { assunto, texto } = mod.texto(tipo, item, c.nome, cfg.escritorio);
    const dados = {
      modulo: mod.modulo, tipo, referenciaId: item.id, clienteTipo: c.tipo_pessoa, clienteId: c.pessoa_id,
      processoId: item.processo_id, dataEvento: soData(item.data), dataAviso, assunto, texto,
    };
    const r = await armazenamento.inserir(pool, dados);
    if (!r.novo && r.status === 'pendente') await armazenamento.atualizarSeNaoEditado(r.id, { assunto, texto, dataAviso });
    criados.push(r);
  }
  return criados;
}

module.exports = { criarAvisosDoEvento };
