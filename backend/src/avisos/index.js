// Avisos aos clientes (Perícia, Audiência e Parabéns) — porta de entrada do módulo.
const geracao = require('./geracao');
const eventos = require('./eventos');

module.exports = {
  gerarAvisos: geracao.gerarAvisos,
  registrarEvento: eventos.registrarEvento,
  marcarEnviadoManual: eventos.marcarEnviadoManual,
  conciliarEvento: eventos.conciliarEvento,
};
