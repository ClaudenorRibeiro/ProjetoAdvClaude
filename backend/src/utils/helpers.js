// ============================================================
// FUNÇÕES AUXILIARES REUTILIZÁVEIS EM TODO O SISTEMA
// ============================================================

// Formata CPF: "12345678900" → "123.456.789-00"
function formatarCPF(cpf) {
  if (!cpf) return '';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Formata CNPJ: "12345678000195" → "12.345.678/0001-95"
function formatarCNPJ(cnpj) {
  if (!cnpj) return '';
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Remove tudo que não for número de uma string
function apenasNumeros(str) {
  if (!str) return '';
  return str.replace(/\D/g, '');
}

// Formata data do MySQL (YYYY-MM-DD) para exibição (DD/MM/YYYY)
function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const obter = (tipo) => partes.find(p => p.type === tipo)?.value || '';
  return `${obter('day')}/${obter('month')}/${obter('year')}`;
}

// Formata data e hora para exibição (DD/MM/YYYY HH:MM)
function formatarDataHora(data) {
  if (!data) return '';
  const d = new Date(data);
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const obter = (tipo) => partes.find(p => p.type === tipo)?.value || '';
  return `${obter('day')}/${obter('month')}/${obter('year')} ${obter('hour')}:${obter('minute')}`;
}

// Converte data brasileira (DD/MM/YYYY; também tolera hífens)
// para o formato técnico do MySQL (YYYY-MM-DD).
function dataParaMySQL(data) {
  if (!data) return null;
  const [dia, mes, ano] = String(data).split(/[/-]/);
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

// Extrai a data civil de um Date sem converter o instante para UTC.
function dataParaIsoLocal(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '';
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Retorna a data e hora atual no fuso de Brasília
function agora() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
}

// Retorna a data de hoje (YYYY-MM-DD) no fuso de Brasília
// maisDias: deslocamento opcional em dias (ex: 1 = amanhã, -1 = ontem)
// IMPORTANTE: nunca usar new Date().toISOString() para "hoje" — retorna a data
// em UTC, que no servidor (Ubuntu/UTC) vira o dia seguinte após as 21h de Brasília
function hojeBrasilia(maisDias = 0) {
  return new Date(Date.now() + maisDias * 86400000)
    .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

// Bloqueia agendamento retroativo para quem NÃO é admin (nível > 1): retorna true
// quando há data e ela é anterior a HOJE (fuso de Brasília via hojeBrasilia). Admin
// (nível <= 1) nunca é bloqueado. Usado por Agenda (compromissos) e Tarefas.
function bloqueiaAgendarPassado(usuario, data) {
  if (!data || Number(usuario?.nivel) <= 1) return false;
  return String(data).slice(0, 10) < hojeBrasilia();
}

// Trunca um texto longo adicionando "..." no final
function truncar(texto, limite = 100) {
  if (!texto) return '';
  return texto.length > limite ? texto.substring(0, limite) + '...' : texto;
}

// Gera um número de pasta sequencial formatado (ex: "0001", "0042")
function formatarNumeroPasta(numero) {
  return String(numero).padStart(4, '0');
}

module.exports = {
  formatarCPF,
  formatarCNPJ,
  apenasNumeros,
  formatarData,
  formatarDataHora,
  dataParaMySQL,
  dataParaIsoLocal,
  agora,
  hojeBrasilia,
  bloqueiaAgendarPassado,
  truncar,
  formatarNumeroPasta,
};
