// Avisos aos clientes — envio SOZINHO (quando "mostrar antes de enviar" está desligado no módulo): só e-mail e SMS, nunca WhatsApp.
// Cada canal sai uma vez só (confere o log). Se nenhum canal serve ou o envio falha, o aviso fica na lista com o motivo.
const { pool } = require('../config/database');
const armazenamento = require('./armazenamento');
const { contatosDoCliente, smsHabilitado, canaisDisponiveis } = require('./contatos');
const { enviarCanais, canaisJaEnviados } = require('./envio');

async function enviarAutomatico(id, cfg) {
  if (!(await armazenamento.reservar(id, null))) return false;       // alguém (ou outra rodada) já pegou
  try {
    const aviso = await armazenamento.buscar(id);
    const contatos = await contatosDoCliente(aviso.cliente_tipo, aviso.cliente_id);
    const disponiveis = canaisDisponiveis(contatos, await smsHabilitado());
    const canais = ['email', 'sms'].filter(c => disponiveis[c]);
    if (!canais.length) { await armazenamento.liberar(id, 'Sem canal para envio automático (o cliente não tem e-mail nem SMS)'); return false; }
    const ja = await canaisJaEnviados(id);
    const faltam = canais.filter(c => !ja.has(c));
    const resultados = faltam.length ? await enviarCanais({ aviso, canais: faltam, contatos, escritorio: cfg.escritorio, usuarioId: null }) : {};
    if (ja.size === 0 && !Object.values(resultados).some(r => r.ok)) {
      const erros = Object.entries(resultados).map(([c, r]) => `${c}: ${r.erro}`).join('; ');
      await armazenamento.liberar(id, `Falha no envio automático — ${erros}`);
      return false;
    }
    await armazenamento.finalizar(id, { status: 'enviado', modo: 'automatico', motivo: null });
    return true;
  } catch (err) {
    await armazenamento.liberar(id, `Falha no envio automático — ${err.message}`);
    console.error(`Aviso ${id}: falha no envio automático:`, err.message);
    return false;
  }
}

// Envia sozinho todos os avisos pendentes dos módulos que NÃO passam pela tela de conferência.
async function enviarAutomaticosPendentes(cfg, modulos) {
  let enviados = 0;
  for (const modulo of modulos) {
    if (cfg[modulo].mostrar) continue;
    const [rows] = await pool.execute(`SELECT id FROM avisos_cliente WHERE modulo = ? AND status = 'pendente' ORDER BY id`, [modulo]);
    for (const r of rows) if (await enviarAutomatico(r.id, cfg)) enviados += 1;
  }
  return enviados;
}

module.exports = { enviarAutomatico, enviarAutomaticosPendentes };
