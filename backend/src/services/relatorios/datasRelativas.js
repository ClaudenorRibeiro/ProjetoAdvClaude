// ============================================================
// RELATÓRIOS — datas relativas ("este mês", "próximos 30 dias"...)
// Tudo em texto 'YYYY-MM-DD' com aritmética em UTC (sem surpresa de fuso).
// A semana vai de domingo a sábado, igual ao calendário da Agenda.
// ============================================================

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmt(dt) { return dt.toISOString().slice(0, 10); }
function somarDias(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
function inicioSemana(s) { return somarDias(s, -parse(s).getUTCDay()); }
function inicioMes(s, deslocar = 0) { const d = parse(s); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deslocar, 1))); }
function fimMes(s, deslocar = 0) { const d = parse(s); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deslocar + 1, 0))); }

// Data real (rejeita 2026-02-30)
function dataValida(s) { return typeof s === 'string' && RE_DATA.test(s) && fmt(parse(s)) === s; }

// chave -> { rotulo, intervalo(hoje) => [de, ate] }
const PERIODOS = {
  hoje:            { rotulo: 'Hoje',                  intervalo: h => [h, h] },
  ontem:           { rotulo: 'Ontem',                 intervalo: h => [somarDias(h, -1), somarDias(h, -1)] },
  amanha:          { rotulo: 'Amanhã',                intervalo: h => [somarDias(h, 1), somarDias(h, 1)] },
  esta_semana:     { rotulo: 'Esta semana',           intervalo: h => [inicioSemana(h), somarDias(inicioSemana(h), 6)] },
  semana_passada:  { rotulo: 'Semana passada',        intervalo: h => [somarDias(inicioSemana(h), -7), somarDias(inicioSemana(h), -1)] },
  proxima_semana:  { rotulo: 'Próxima semana',        intervalo: h => [somarDias(inicioSemana(h), 7), somarDias(inicioSemana(h), 13)] },
  este_mes:        { rotulo: 'Este mês',              intervalo: h => [inicioMes(h), fimMes(h)] },
  mes_passado:     { rotulo: 'Mês passado',           intervalo: h => [inicioMes(h, -1), fimMes(h, -1)] },
  proximo_mes:     { rotulo: 'Próximo mês',           intervalo: h => [inicioMes(h, 1), fimMes(h, 1)] },
  este_ano:        { rotulo: 'Este ano',              intervalo: h => [`${h.slice(0, 4)}-01-01`, `${h.slice(0, 4)}-12-31`] },
  ultimos_7_dias:  { rotulo: 'Últimos 7 dias',        intervalo: h => [somarDias(h, -7), h] },
  ultimos_30_dias: { rotulo: 'Últimos 30 dias',       intervalo: h => [somarDias(h, -30), h] },
  ultimos_90_dias: { rotulo: 'Últimos 90 dias',       intervalo: h => [somarDias(h, -90), h] },
  proximos_7_dias: { rotulo: 'Próximos 7 dias',       intervalo: h => [h, somarDias(h, 7)] },
  proximos_30_dias:{ rotulo: 'Próximos 30 dias',      intervalo: h => [h, somarDias(h, 30)] },
  proximos_90_dias:{ rotulo: 'Próximos 90 dias',      intervalo: h => [h, somarDias(h, 90)] },
};

// Valor de data aceito numa condição: 'YYYY-MM-DD' ou { rel: 'hoje', dias: -30 } (hoje ± dias).
// Devolve 'YYYY-MM-DD' ou null se inválido.
function resolverData(valor, hoje) {
  if (typeof valor === 'string') return dataValida(valor) ? valor : null;
  if (valor && typeof valor === 'object' && valor.rel === 'hoje') {
    const dias = Number(valor.dias || 0);
    return Number.isInteger(dias) && Math.abs(dias) <= 36500 ? somarDias(hoje, dias) : null;
  }
  return null;
}

function resolverPeriodo(chave, hoje) {
  return PERIODOS[chave] ? PERIODOS[chave].intervalo(hoje) : null;
}

function listarPeriodos() {
  return Object.entries(PERIODOS).map(([valor, p]) => ({ valor, rotulo: p.rotulo }));
}

module.exports = { dataValida, resolverData, resolverPeriodo, listarPeriodos, PERIODOS, somarDias, inicioMes, fimMes };
