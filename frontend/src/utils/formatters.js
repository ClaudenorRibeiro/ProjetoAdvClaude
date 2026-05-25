// ============================================================
// FORMATADORES — Funções usadas na interface para exibição
// ============================================================

// Formata data ISO (YYYY-MM-DD) para DD/MM/YYYY
export function formatarData(data) {
  if (!data) return '—';
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}

// Formata data e hora ISO para DD/MM/YYYY HH:MM
export function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Formata valor monetário para R$ 1.234,56
export function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(parseFloat(valor));
}

// Formata CPF: 12345678900 → 123.456.789-00
export function formatarCPF(cpf) {
  if (!cpf) return '—';
  const limpo = cpf.replace(/\D/g, '');
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Aplica máscara durante digitação: "12345678900" → "123.456.789-00"
// Usado em conjunto com onChange para formatar enquanto o usuário digita
export function mascaraCPF(value) {
  const limpo = value.replace(/\D/g, '').slice(0, 11);
  return limpo
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

// Valida CPF usando o algoritmo oficial dos dígitos verificadores
// Rejeita CPFs com todos os dígitos iguais (111.111.111-11 etc)
export function validarCPF(cpf) {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  if (/^(\d)\1+$/.test(limpo)) return false; // todos iguais = inválido

  // Primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo[9])) return false;

  // Segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo[10])) return false;

  return true;
}

// Formata CNPJ: 12345678000195 → 12.345.678/0001-95
export function formatarCNPJ(cnpj) {
  if (!cnpj) return '—';
  const limpo = cnpj.replace(/\D/g, '');
  return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Formata número de pasta: 42 → "0042"
export function formatarNumeroPasta(numero) {
  if (!numero) return '—';
  return String(numero).padStart(4, '0');
}

// Retorna classe CSS de cor conforme os dias restantes de um prazo
// negativo = atrasado (vermelho), 0-2 = urgente (laranja), demais = normal
export function corPrazo(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return '';
  if (diasRestantes < 0)  return 'prazo-atrasado';   // vermelho
  if (diasRestantes <= 2) return 'prazo-urgente';    // laranja
  return 'prazo-ok';                                  // normal
}

// Retorna rótulo de prioridade de tarefa
export function labelPrioridade(prioridade) {
  const map = { urgente: '🔴 Urgente', normal: '🟡 Normal', baixa: '🟢 Baixa' };
  return map[prioridade] || prioridade;
}

// Retorna rótulo de status de prazo
export function labelStatusPrazo(status) {
  const map = {
    aberto:    'Aberto',
    fazendo:   'Fazendo',
    pendente:  'Pendente',
    agendado:  'Agendado',
    concluido: 'Concluído',
  };
  return map[status] || status;
}

// Retorna rótulo de área do direito
export function labelAreaDireito(area) {
  const map = {
    trabalhista:     'Trabalhista',
    previdenciario:  'Previdenciário',
    familia:         'Família',
    outro:           'Outro',
  };
  return map[area] || area;
}
