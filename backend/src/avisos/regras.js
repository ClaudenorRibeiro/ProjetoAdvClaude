// Avisos aos clientes — contas de datas (sempre texto "AAAA-MM-DD", sem depender do fuso da máquina).
const { diasUteisAntes } = require('../services/calendarioService');

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const soData = (valor) => (valor ? String(valor).slice(0, 10) : null);

// Dia em que o lembrete passa a valer: N dias úteis antes do evento (0 = no próprio dia).
// Se o calendário não cobre a data, cai para dias corridos em vez de perder o aviso.
async function dataDoLembrete(dataEvento, dias) {
  if (!dias) return dataEvento;
  return (await diasUteisAntes(dataEvento, dias)) || somarDias(dataEvento, -dias);
}

module.exports = { somarDias, soData, dataDoLembrete };
