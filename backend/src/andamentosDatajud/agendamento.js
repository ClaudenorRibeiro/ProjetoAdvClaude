// ============================================================
// OS HORÁRIOS DO AVISO DIÁRIO DE ANDAMENTOS (ligados no alertasService; tudo em horário de Brasília):
//   02:00  consulta noturna do DataJud (entra na fila e volta; ela pode durar horas)
//   horário do resumo (padrão 07:30, configurável)  resumo da manhã: sino e/ou e-mail de quem escolheu
//   03:30  limpeza: apaga andamentos do DataJud com mais de 6 meses
// O resumo também roda ao ligar o servidor, se o horário de hoje já passou (recupera o dia em que ele ficou parado). Rodar
// o resumo duas vezes é inofensivo: cada andamento só entra num resumo uma vez.
// ============================================================
const { pool } = require('../config/database');
const { agora } = require('../utils/helpers');
const { enfileirarConsultaNoturna } = require('./fila');
const { enviarResumoDeAndamentos } = require('./resumo');
const { apagarAndamentosAntigosDoDataJud } = require('./limpeza');

let ultimoDiaDoResumo = null;

async function horarioDoResumo() {
  const [rows] = await pool.execute('SELECT datajud_aviso_horario AS h FROM configuracoes_escritorio LIMIT 1');
  const h = rows[0] && rows[0].h;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')) ? h : '07:30';
}

async function rodarResumo(dia) {
  ultimoDiaDoResumo = dia;
  try {
    const r = await enviarResumoDeAndamentos();
    if (r.andamentos > 0) console.log(`📚 Resumo de andamentos: ${r.andamentos} andamento(s) para ${r.pessoas} pessoa(s)`);
  } catch (err) { console.error('Erro no resumo de andamentos do DataJud:', err.message); }
}

// Chamado a cada minuto. `quando` (AAAA-MM-DDTHH:MM:SS, Brasília) existe para os testes.
async function resumoSeForAHora(quando = agora()) {
  const dia = quando.slice(0, 10);
  if (ultimoDiaDoResumo === dia) return false;
  if (quando.slice(11, 16) !== await horarioDoResumo()) return false;
  await rodarResumo(dia);
  return true;
}

// Ao ligar o servidor: se o horário de hoje já passou e o resumo de hoje ainda não rodou, roda agora.
async function resumoDeRecuperacao(quando = agora()) {
  const dia = quando.slice(0, 10);
  if (ultimoDiaDoResumo === dia) return false;
  if (quando.slice(11, 16) < await horarioDoResumo()) return false;
  await rodarResumo(dia);
  return true;
}

async function limparAntigos() {
  try {
    const n = await apagarAndamentosAntigosDoDataJud();
    if (n > 0) console.log(`🧹 DataJud: ${n} andamento(s) com mais de 6 meses removido(s)`);
  } catch (err) { console.error('Erro na limpeza dos andamentos do DataJud:', err.message); }
}

function agendarAndamentosDatajud(cron, opcoes) {
  cron.schedule('0 2 * * *', () => {
    console.log('⏰ Cron: consulta noturna do DataJud...');
    enfileirarConsultaNoturna();
  }, opcoes);
  cron.schedule('* * * * *', () => { resumoSeForAHora().catch(() => {}); }, opcoes);
  cron.schedule('30 3 * * *', limparAntigos, opcoes);
  setTimeout(() => { resumoDeRecuperacao().catch(() => {}); }, 30000);   // recuperação depois de servidor parado
}

module.exports = { agendarAndamentosDatajud, resumoSeForAHora, resumoDeRecuperacao, limparAntigos, _zerarParaTeste: () => { ultimoDiaDoResumo = null; } };
