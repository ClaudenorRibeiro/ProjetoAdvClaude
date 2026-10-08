// Avisos aos clientes — o que acontece QUANDO um fato ocorre (perícia/audiência cadastrada, remarcada ou cancelada)
// e quando alguém usa o botão manual antigo. Nunca derruba a operação principal: erro aqui só vai para o console.
const { pool } = require('../config/database');
const { hojeBrasilia } = require('../utils/helpers');
const armazenamento = require('./armazenamento');
const { lerConfig } = require('./config');
const { soData } = require('./regras');
const { criarAvisosDoEvento } = require('./criacao');
const { enviarAutomaticosPendentes } = require('./automatico');
const { COLUNA_REF } = require('./constantes');
const pericia = require('./modulos/pericia');
const audiencia = require('./modulos/audiencia');

const MODULOS = { pericia, audiencia };

// tipo: 'agendada' | 'remarcada' | 'cancelada'. Cria um aviso por cliente do processo; se o módulo não usa a tela, já envia.
async function registrarEvento({ modulo, tipo, id }) {
  try {
    const mod = MODULOS[modulo];
    const item = mod && await mod.carregar(id);
    if (!item || !item.data || soData(item.data) < hojeBrasilia()) return [];
    const cfg = await lerConfig();
    const criados = await criarAvisosDoEvento(mod, tipo, item, hojeBrasilia(), cfg);
    await enviarAutomaticosPendentes(cfg, [modulo]);
    return criados;
  } catch (err) {
    console.error(`Aviso de ${modulo} (${tipo}) não foi criado:`, err.message);
    return [];
  }
}

// O botão manual "Comunicar cliente" enviou na hora: o aviso pendente equivalente não precisa mais sair.
async function marcarEnviadoManual({ modulo, tipo, id }) {
  try {
    await pool.execute(
      `UPDATE avisos_cliente SET status = 'enviado', modo = 'manual', motivo_status = 'Enviado pelo botão manual', decidido_em = NOW()
        WHERE modulo = ? AND ${COLUNA_REF[modulo]} = ? AND tipo = ? AND status = 'pendente'`, [modulo, id, tipo]);
  } catch (err) { console.error('Aviso manual não foi conciliado:', err.message); }
}

// Depois de editar uma perícia/audiência: avisos pendentes de data antiga deixam de valer.
async function conciliarEvento(modulo) {
  try { await armazenamento.cancelarObsoletos(modulo, MODULOS[modulo]); }
  catch (err) { console.error('Avisos não foram conciliados:', err.message); }
}

module.exports = { registrarEvento, marcarEnviadoManual, conciliarEvento };
