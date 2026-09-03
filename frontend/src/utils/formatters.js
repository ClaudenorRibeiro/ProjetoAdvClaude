// ============================================================
// FORMATADORES — Funções usadas na interface para exibição
// ============================================================

const FUSO_BRASIL = 'America/Sao_Paulo';

// Converte um Date para a data civil local, sem passar por UTC. Usado em cálculos
// que alimentam campos técnicos <input type="date"> no formato obrigatório YYYY-MM-DD.
export function dataParaIsoLocal(data) {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return '';
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Data de HOJE em Brasília, como 'YYYY-MM-DD'. Usar em valores técnicos de
// formulário/API. O toISOString não serve aqui porque converte a data para UTC.
export function hojeLocal() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: FUSO_BRASIL });
}

// Formata data ISO (YYYY-MM-DD) para o padrão brasileiro adotado pelo sistema: DD/MM/YYYY.
export function formatarData(data) {
  if (!data) return '—';
  const partesIso = String(data).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (partesIso) return `${partesIso[3]}/${partesIso[2]}/${partesIso[1]}`;

  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return '—';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BRASIL, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const obter = (tipo) => partes.find(p => p.type === tipo)?.value || '';
  return `${obter('day')}/${obter('month')}/${obter('year')}`;
}

// Deixa o texto de uma publicação legível: quando vem em HTML (acontece em algumas do CNJ),
// remove as tags e decodifica os símbolos. Texto puro (o caso normal, e toda a AASP) passa
// INTACTO — inclusive as quebras de linha. Usado na tela de Publicações e no modal de leitura
// da publicação de origem (a partir de um prazo/tarefa/compromisso).
export function textoLimpo(texto) {
  const s = String(texto == null ? '' : texto);
  if (!/<\/?[a-z][^>]*>/i.test(s)) return s;   // não parece HTML → devolve como está
  let t = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')                 // remove script/style + conteúdo
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, '\n') // quebras viram nova linha
    .replace(/<[^>]+>/g, ' ');                                       // remove o resto das tags
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Formata data e hora ISO para DD/MM/YYYY HH:MM, sempre no fuso de Brasília.
export function formatarDataHora(data) {
  if (!data) return '—';
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return '—';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_BRASIL,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const obter = (tipo) => partes.find(p => p.type === tipo)?.value || '';
  return `${obter('day')}/${obter('month')}/${obter('year')} ${obter('hour')}:${obter('minute')}`;
}

// Formata valor monetário para R$ 1.234,56
export function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(parseFloat(valor));
}

// Máscara de moeda para INPUTS (sem "R$"): preenche da direita p/ esquerda como centavos.
// Ex.: "1500" → "15,00"; "150000" → "1.500,00". Use com parseMoeda() para obter o número ao salvar.
export function mascaraMoeda(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte um NÚMERO (ex.: 1500) no texto da máscara ("1.500,00") — usado ao abrir um form em edição.
export function numeroParaMascaraMoeda(numero) {
  if (numero === null || numero === undefined || numero === '') return '';
  return Number(numero).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte o texto mascarado ("1.500,00") de volta para número (1500.00). Aceita number direto.
export function parseMoeda(texto) {
  if (texto === null || texto === undefined || texto === '') return 0;
  if (typeof texto === 'number') return texto;
  const limpo = String(texto).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return parseFloat(limpo) || 0;
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

// Formata telefone SÓ para exibição (não altera o valor guardado). Cobre:
//   8  → 2053-8881 (fixo local) | 9 → 95048-7461 (celular local)
//   10 → (11) 2053-8881 (DDD+fixo) | 11 → (11) 95048-7461 (DDD+celular)
//   com "55" na frente (12+ dígitos) → remove o código do país e formata o resto
// Tamanho inesperado: devolve como veio (não inventa máscara).
export function formatarTelefone(tel) {
  if (!tel) return '—';
  let d = String(tel).replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // remove código do país (Brasil)
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  if (d.length === 9)  return d.replace(/(\d{5})(\d{4})/, '$1-$2');
  if (d.length === 8)  return d.replace(/(\d{4})(\d{4})/, '$1-$2');
  return tel;
}

// Aplica máscara durante digitação: "12345678000195" → "12.345.678/0001-95"
export function mascaraCNPJ(value) {
  const limpo = value.replace(/\D/g, '').slice(0, 14);
  return limpo
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

// Valida CNPJ usando o algoritmo oficial dos dígitos verificadores
// Rejeita CNPJs com todos os dígitos iguais (00.000.000/0000-00 etc)
export function validarCNPJ(cnpj) {
  const limpo = cnpj.replace(/\D/g, '');
  if (limpo.length !== 14) return false;
  if (/^(\d)\1+$/.test(limpo)) return false; // todos iguais = inválido

  // Calcula um dígito verificador dado os pesos
  function calcDigito(base, pesos) {
    const soma = pesos.reduce((acc, peso, i) => acc + parseInt(base[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  const d1 = calcDigito(limpo, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(limpo[12])) return false;

  const d2 = calcDigito(limpo, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d2 !== parseInt(limpo[13])) return false;

  return true;
}

// Aplica máscara no número CNJ durante digitação
// Formato: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos no total)
// Ex: "00012341220235020001" → "0001234-12.2023.5.02.0001"
export function mascaraCNJ(value) {
  const d = value.replace(/\D/g, '').slice(0, 20);
  if (d.length <=  7) return d;
  if (d.length <=  9) return `${d.slice(0,7)}-${d.slice(7)}`;
  if (d.length <= 13) return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9)}`;
  if (d.length <= 14) return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13)}`;
  if (d.length <= 16) return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14)}`;
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16)}`;
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
    agendado:  'Agendado',
    pendente:  'Pendente',
    atrasado:  'Atrasado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  return map[status] || status;
}

// Limpa os espaços sobrando de um texto digitado: tira os do início e do fim
// e deixa UM só entre as palavras.
// As QUEBRAS DE LINHA são preservadas de propósito — campos de várias linhas
// (Observações, Descrição do prazo/tarefa, resultado da audiência) passam por aqui.
// Ex: "  Frederico   Carvalho  " → "Frederico Carvalho"
export function limparEspacos(str) {
  if (!str) return str;
  return String(str)
    .replace(/[^\S\r\n]+/g, ' ')  // espaços/tabs repetidos viram um só (não toca na quebra de linha)
    .replace(/ *\r?\n */g, '\n')   // tira o espaço colado antes/depois da quebra de linha
    .trim();                          // tira do começo e do fim
}

// Limpa um e-mail digitado: apaga TODOS os espaços (e-mail não pode ter espaço
// em lugar nenhum) e deixa tudo em letra minúscula.
// Ex: " EDNA @Provedor.COM " → "edna@provedor.com"
export function limparEmail(str) {
  if (!str) return str;
  return String(str).replace(/\s+/g, '').toLowerCase();
}

// Converte texto para Primeira Letra Maiúscula Em Cada Palavra
// Ex: "EDNA SILVA" → "Edna Silva" | "edna silva" → "Edna Silva"
// Preposições comuns em português permanecem minúsculas (de, da, do, das, dos, e)
// Também limpa os espaços sobrando (início, fim e repetidos do meio).
export function toTitleCase(str) {
  if (!str) return str;
  const minusculas = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os'];
  return limparEspacos(str)
    .toLowerCase()
    .split(' ')
    .map((palavra, index) => {
      if (!palavra) return '';
      // Primeira palavra sempre maiúscula; preposições intermediárias ficam minúsculas
      if (index === 0 || !minusculas.includes(palavra)) {
        return palavra.charAt(0).toUpperCase() + palavra.slice(1);
      }
      return palavra;
    })
    .join(' ');
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
