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
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Formata data e hora para exibição (DD/MM/YYYY HH:MM)
function formatarDataHora(data) {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Converte data brasileira (DD/MM/YYYY) para formato MySQL (YYYY-MM-DD)
function dataParaMySQL(data) {
  if (!data) return null;
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

// Retorna a data e hora atual no fuso de Brasília
function agora() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
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
  agora,
  truncar,
  formatarNumeroPasta,
};
