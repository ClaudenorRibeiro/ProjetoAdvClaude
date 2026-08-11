// ============================================================
// CORES DOS EVENTOS DA AGENDA — fonte única (padrões + rótulos + contraste)
// Usado pela Agenda (calendário/legenda/janela do dia) e pelo modal "Aparência".
// Cada usuário pode sobrescrever essas cores (usuarios.cores_agenda); vazio = padrão.
// ============================================================

// Cores PADRÃO (as atuais do sistema). Chaves = tipos de evento da Agenda.
export const CORES_AGENDA_PADRAO = {
  prazo:       '#e2d3a8', // bege
  audiencia:   '#1a56db', // azul
  pericia:     '#7c3aed', // roxo
  tarefa:      '#d97706', // laranja
  compromisso: '#0891b2', // ciano
  feriado:     '#059669', // verde
};

// Rótulos amigáveis (para o modal de personalização).
export const CORES_AGENDA_LABELS = {
  prazo:       'Prazos',
  audiencia:   'Audiências',
  pericia:     'Perícias',
  tarefa:      'Tarefas',
  compromisso: 'Compromissos',
  feriado:     'Feriados',
};

// Junta as cores do usuário sobre o padrão (o que ele não mexeu continua padrão).
export function coresEfetivas(coresUsuario) {
  return { ...CORES_AGENDA_PADRAO, ...(coresUsuario || {}) };
}

// Escolhe automaticamente texto claro ou escuro para ficar legível sobre a cor de fundo.
// Fórmula YIQ (percepção de brilho). Limiar 150 preserva o visual atual (só o bege → texto
// escuro; os demais → branco) e garante legibilidade para qualquer cor que o usuário escolher.
export function corTextoPara(hex) {
  if (!hex || typeof hex !== 'string') return '#fff';
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return '#fff';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#333333' : '#ffffff';
}

// Valida um mapa de cores: só as 6 chaves conhecidas, cada uma um hex #rgb ou #rrggbb.
export function coresValidas(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const chaves = Object.keys(CORES_AGENDA_PADRAO);
  return Object.entries(obj).every(([k, v]) =>
    chaves.includes(k) && typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)
  );
}
