// Avisos aos clientes — a rotina diária (e de recuperação): cria os lembretes e os parabéns que já valem, limpa o que não vale mais
// e envia sozinho o que está em módulo sem tela de conferência. Pode rodar quantas vezes quiser: nada se repete.
const { pool } = require('../config/database');
const { hojeBrasilia } = require('../utils/helpers');
const armazenamento = require('./armazenamento');
const { lerConfig } = require('./config');
const { dataDoLembrete, somarDias, soData } = require('./regras');
const { criarAvisosDoEvento } = require('./criacao');
const { enviarAutomaticosPendentes } = require('./automatico');
const { COLUNA_REF } = require('./constantes');
const pericia = require('./modulos/pericia');
const audiencia = require('./modulos/audiencia');
const parabens = require('./modulos/parabens');

const MODULOS_DE_EVENTO = [pericia, audiencia];

// Quando o evento foi marcado pela última vez (cadastro, remarcação ou data informada depois): o lembrete só vale
// se ainda faltar MAIS tempo do que o configurado naquele momento.
async function marcadoEm(mod, item) {
  const [[r]] = await pool.execute(
    `SELECT MAX(DATE(criado_em)) AS dia FROM avisos_cliente WHERE modulo = ? AND ${COLUNA_REF[mod.modulo]} = ? AND tipo IN ('agendada', 'remarcada')`,
    [mod.modulo, item.id]);
  const candidatos = [soData(item.criado_em), r.dia ? soData(r.dia) : null].filter(Boolean);
  return candidatos.sort().pop();
}

async function gerarLembretes(mod, cfg, hoje) {
  let criados = 0;
  for (const item of await mod.futuros(hoje)) {
    const dataEvento = soData(item.data);
    const dataAviso = await dataDoLembrete(dataEvento, cfg[mod.modulo].dias);
    if (hoje < dataAviso || dataAviso <= await marcadoEm(mod, item)) continue;
    const feitos = await criarAvisosDoEvento(mod, 'lembrete', item, dataAviso, cfg);
    criados += feitos.filter(f => f.novo).length;
  }
  return criados;
}

async function gerarAniversarios(cfg) {
  let criados = 0;
  for (const p of await parabens.aniversariantes(cfg.parabens.dias)) {
    const { assunto, texto } = parabens.textoParabens(p.nome, cfg);
    const dataAviso = somarDias(p.data_evento, -cfg.parabens.dias);
    const r = await armazenamento.inserir(pool, {
      modulo: 'parabens', tipo: 'aniversario', referenciaId: p.id, clienteTipo: 'fisica', clienteId: p.id,
      processoId: null, dataEvento: p.data_evento, dataAviso, assunto, texto,
    });
    if (r.novo) criados += 1;
    else if (r.status === 'pendente') await armazenamento.atualizarSeNaoEditado(r.id, { assunto, texto, dataAviso });
  }
  return criados;
}

async function gerarAvisos({ hoje = hojeBrasilia() } = {}) {
  const cfg = await lerConfig();
  await armazenamento.liberarPresos();
  await armazenamento.expirarPassados(hoje);
  const resumo = { lembretes: 0, aniversarios: 0, enviadosSozinhos: 0 };
  for (const mod of MODULOS_DE_EVENTO) {
    await armazenamento.cancelarObsoletos(mod.modulo, mod);
    resumo.lembretes += await gerarLembretes(mod, cfg, hoje);
  }
  await parabens.limparObsoletos();
  resumo.aniversarios = await gerarAniversarios(cfg);
  resumo.enviadosSozinhos = await enviarAutomaticosPendentes(cfg, ['pericia', 'audiencia', 'parabens']);
  return resumo;
}

module.exports = { gerarAvisos, MODULOS_DE_EVENTO };
