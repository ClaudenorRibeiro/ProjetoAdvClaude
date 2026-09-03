// ============================================================
// SUGESTÕES A PARTIR DO TEXTO DA PUBLICAÇÃO
// ------------------------------------------------------------
// Função PURA (sem estado, sem API, sem banco). Recebe o texto da publicação
// e devolve uma LISTA de sugestões de ação. Determinística: mesma entrada
// gera sempre a mesma saída. Qualquer imprevisto -> retorna [] (nunca quebra a tela).
//
// Detecta (cada uma independente; podem sair várias na mesma publicação):
//   - AUDIÊNCIA designada  -> pré-preenche "Novo compromisso" (tipo:'compromisso')
//   - PERÍCIA designada     -> pré-preenche "Nova perícia"     (tipo:'pericia')
//   - PRAZO processual      -> pré-preenche "Novo prazo"       (tipo:'prazo')
//   - PROVIDÊNCIA genérica  -> pré-preenche "Nova tarefa"      (tipo:'tarefa')
//     (só quando NENHUMA das três acima disparou)
//
// Nada é criado automaticamente: a sugestão só pré-preenche o modal, que o
// usuário confere e salva.
// ============================================================

// Colapsa espaços e quebras de linha — deixa o texto numa linha só.
function achatar(texto) {
  return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
}
function doisDigitos(n) { return String(n).padStart(2, '0'); }
function dataBrDeIso(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : String(iso || '');
}
function isoDe(dt) {
  return `${dt.getFullYear()}-${doisDigitos(dt.getMonth() + 1)}-${doisDigitos(dt.getDate())}`;
}

// Converte "8", "08", ano de 2 dígitos etc. num Date válido (meio-dia local).
// Devolve null se a data for impossível.
function montarData(dia, mes, ano) {
  let d = parseInt(dia, 10), m = parseInt(mes, 10), a = parseInt(ano, 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(a)) return null;
  if (a < 100) a += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(a, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

// Acha a data do EVENTO numa janela de texto. Tenta DD/MM/AAAA (ou /AA); depois
// DD/MM (sem ano) inferindo o ano da data de publicação (+1 se cair antes dela).
// Retorna { dt, anoInferido, idx } ou null.
function acharDataEvento(janela, dataPublicacao) {
  let m = janela.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const dt = montarData(m[1], m[2], m[3]);
    if (dt) return { dt, anoInferido: false, idx: janela.indexOf(m[0]) };
  }
  m = janela.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\s*\/)/);
  if (m) {
    const anoBase = dataPublicacao
      ? new Date(String(dataPublicacao).slice(0, 10) + 'T12:00:00').getFullYear()
      : new Date().getFullYear();
    let cand = montarData(m[1], m[2], anoBase);
    if (cand && dataPublicacao) {
      const pub = new Date(String(dataPublicacao).slice(0, 10) + 'T12:00:00');
      if (cand.getTime() < pub.getTime() - 3 * 864e5) cand = montarData(m[1], m[2], anoBase + 1);
    }
    if (cand) return { dt: cand, anoInferido: true, idx: janela.indexOf(m[0]) };
  }
  return null;
}

// Horário logo depois da data ("10:00 horas", "10h", "às 10 e 30", "10 horas").
function acharHora(trecho) {
  if (!trecho) return null;
  let m;
  if ((m = trecho.match(/(\d{1,2})\s*[:h]\s*(\d{2})/))) {
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h < 24 && min < 60) return `${doisDigitos(h)}:${doisDigitos(min)}`;
  }
  if ((m = trecho.match(/\bàs?\s+(\d{1,2})(?:\s*e\s*(\d{1,2}))?\b/i))) {
    const h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 24 && min < 60) return `${doisDigitos(h)}:${doisDigitos(min)}`;
  }
  if ((m = trecho.match(/\b(\d{1,2})\s*h(?:oras?)?\b/i))) {
    const h = parseInt(m[1], 10);
    if (h < 24) return `${doisDigitos(h)}:00`;
  }
  return null;
}

// Campo "local": (1) "sala de audiências / fórum / edifício ..."; (2) endereço
// ("à Av. Fulano, 123", "(Av. Fulano, 123 - Bairro ...)", "na Rua ...").
function acharLocal(trechoDepoisDaData) {
  if (!trechoDepoisDaData) return null;
  let m = trechoDepoisDaData.match(
    /(?:sala\s+de\s+audi[êe]ncias?|sala\s+n?º?\s*\d+|f[óo]rum\b|edif[íi]cio\b|centro\s+judici[áa]rio)[^.()]{0,240}/i
  );
  if (!m) {
    m = trechoDepoisDaData.match(
      /\(?\s*(?:à\s+|na\s+|no\s+)?(?:av\.?|avenida|rua|r\.|pra[çc]a|rod\.?|rodovia|alameda|al\.|estrada|largo)\s+[A-Za-zÀ-ú][^.()]{0,220}/i
    );
  }
  if (!m) return null;
  let local = m[0];
  local = local.split(/,?\s*(?:devendo\s+as\s+partes|nos\s+termos|na\s+modalidade|ficando|advertindo|sob\s+pena|ocasi[ãa]o\s+em\s+que|oportunidade\s+em\s+que)\b/i)[0];
  local = local.replace(/^[\s(]+/, '').replace(/^(?:à|na|no)\s+/i, '');
  local = local.replace(/\s+/g, ' ').replace(/[;,)\s]+$/, '').trim();
  return local || null;
}

function acharModalidade(txt) {
  const m = txt.match(/\b(telepresencial|semipresencial|presencial|videoconfer[êe]ncia)\b/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return /video/.test(v) ? 'por videoconferência' : v;
}
function acharTipoAudiencia(txt) {
  if (/\bconcilia[çc][ãa]o\b/i.test(txt)) return 'de conciliação';
  if (/\binstru[çc][ãa]o\b/i.test(txt)) return 'de instrução';
  if (/\buna\b/i.test(txt)) return 'una';
  if (/\binici(?:al|ais)\b/i.test(txt)) return 'inicial';
  return null;
}

// Pedaço do texto ao redor de um índice absoluto (para o usuário conferir).
function trechoAoRedor(txt, abs, antes = 160, depois = 140) {
  const ini = Math.max(0, abs - antes);
  let t = txt.slice(ini, abs + depois).trim();
  if (ini > 0) t = '… ' + t;
  return t + ' …';
}

// Núcleo do trecho (sem "…", sem palavras cortadas nas pontas) — usado para
// LOCALIZAR/destacar a origem dentro do texto exibido da publicação.
function nucleoTrecho(txt, abs, antes = 80, depois = 110) {
  const ini = Math.max(0, abs - antes);
  let t = txt.slice(ini, abs + depois);
  if (ini > 0) t = t.replace(/^\S*\s+/, '');           // tira a 1ª palavra cortada
  if (abs + depois < txt.length) t = t.replace(/\s+\S*$/, ''); // tira a última cortada
  return t.trim();
}

function rodapeOrigem(ctx) {
  return `Origem: publicação${ctx.numeroPublicacao ? ` nº ${ctx.numeroPublicacao}` : ''}` +
    (ctx.dataPublicacao ? ` de ${dataBrDeIso(ctx.dataPublicacao)}` : '') + '.';
}

// ------------------------------------------------------------
// DETECTOR: AUDIÊNCIA designada  ->  tipo 'compromisso'
// ------------------------------------------------------------
function detectarAudiencia(txt, ctx) {
  if (!/audi[êe]ncia/i.test(txt)) return null;
  const temDesignacao = /(designe-se|design[ao]\b|design[ae]d[ao]|design[ae]r|apraz|redesign|remarcad[ao]|para\s+o\s+dia)/i.test(txt);
  if (!temDesignacao) return null;
  if (/audi[êe]ncia[^.]{0,60}\b(realizad[ao]|cancelad[ao]|prejudicad[ao]|adiad[ao]\s+sine\s+die|red\s*esignad[ao]\s+sem\s+data)\b/i.test(txt)) return null;

  const ancora = txt.search(/para\s+o\s+dia|design[ae]d[ao]\s+(?:a\s+)?audi[êe]ncia|design[ae]-se|audi[êe]ncia\s+(?:una|de\s+concilia|de\s+instru|inici)/i);
  const base = ancora >= 0 ? ancora : txt.search(/audi[êe]ncia/i);
  const janela = txt.slice(Math.max(0, base - 40), base + 400);
  // A DATA do evento só pode vir DA ÂNCORA PRA FRENTE. Se buscássemos no `janela` (que inclui
  // 40 caracteres ANTES da âncora, só para contexto de modalidade/tipo), um texto como
  // "Disponibilizado em 01/09/2026. Designo audiência para o dia 20/10/2026" pegava a data da
  // PUBLICAÇÃO em vez da data do EVENTO, porque ela aparece antes na janela.
  const janelaData = txt.slice(base, base + 400);

  const d = acharDataEvento(janelaData, ctx.dataPublicacao);
  if (!d) return null;
  const iso = isoDe(d.dt), dataBR = dataBrDeIso(iso);

  const depoisDaData = d.idx >= 0 ? janelaData.slice(d.idx, d.idx + 80) : janelaData;
  const hora = acharHora(depoisDaData);
  const local = acharLocal(d.idx >= 0 ? janelaData.slice(d.idx) : janelaData);
  const modalidade = acharModalidade(janela) || acharModalidade(txt);
  const tipoAud = acharTipoAudiencia(janela) || acharTipoAudiencia(txt);
  const abs = base + (d.idx >= 0 ? d.idx : 0);

  const tt = tipoAud ? ` ${tipoAud}` : '';
  const linhas = [`Audiência${tt}${modalidade ? ` (${modalidade})` : ''}.`];
  if (local) linhas.push(`Local: ${local}`);
  linhas.push(rodapeOrigem(ctx));

  return {
    tipo: 'compromisso', subtipo: 'audiencia',
    titulo: `Audiência${tt}${ctx.numeroProcesso ? ` — ${ctx.numeroProcesso}` : ''}`.slice(0, 200),
    descricao: linhas.join('\n'),
    data: iso, dataBR, hora: hora || null, local: local || null, modalidade: modalidade || null,
    resumo: `Audiência identificada para ${dataBR}${hora ? ` às ${hora}` : ''}${modalidade ? ` (${modalidade})` : ''}`,
    trechoOrigem: trechoAoRedor(txt, abs),
    trechoDestaque: nucleoTrecho(txt, abs),
    regra: 'audiencia-designada',
    confianca: (hora && !d.anoInferido) ? 'alta' : 'media',
  };
}

// ------------------------------------------------------------
// DETECTOR: PERÍCIA designada  ->  tipo 'pericia'
// (só quando há uma data; a Nova Perícia exige processo cadastrado — o modal avisa)
// ------------------------------------------------------------
function detectarPericia(txt, ctx) {
  // "per[íi]cias?\b" casa o SUBSTANTIVO ("perícia" / "perícias"), mas NÃO os
  // adjetivos "pericial" / "periciais" (ex.: "trabalhos periciais", "prova
  // pericial", "laudo pericial", "honorários periciais") — que não designam perícia.
  if (!/per[íi]cias?\b/i.test(txt)) return null;
  // Perícia já concluída / cancelada / laudo entregue -> não sugerir.
  if (/per[íi]cias?\b[^.]{0,60}\b(realizad[ao]|cancelad[ao]|prejudicad[ao]|conclu[íi]d[ao]|encerrad[ao]|finalizad[ao])\b/i.test(txt)) return null;
  if (/\b(finalizad[ao]s?|conclu[íi]d[ao]s?|encerrad[ao]s?)\s+(os?\s+)?(trabalhos?\s+)?per[íi]ci/i.test(txt)) return null;
  if (/\b(laudo|trabalho)s?\s+per[íi]cial(?:is)?\b[^.]{0,40}\b(apresentad|juntad|protocolad)/i.test(txt)) return null;

  // A designação tem que estar COLADA na palavra "perícia" — verbo de designação
  // logo antes, ou "perícia designada/agendada/marcada" logo depois. NÃO uso mais
  // "para o dia"/"dia N" soltos: eles costumam ser da AUDIÊNCIA citada na mesma frase.
  const ancora = txt.search(
    /(?:(?:designo|design[ae]d[ao]|design[ae]r|agend[ao]|agendad[ao]|marc[ao]|marcad[ao]|nomei[ao]|determino)\s+(?:a\s+|nova\s+|realiza[çc][ãa]o\s+d[ae]\s+)?per[íi]cia)|(?:per[íi]cias?\b[^.]{0,50}(?:designad[ao]|agendad[ao]|marcad[ao]|redesignad[ao]|realizar-se-[áa]))/i
  );
  if (ancora < 0) return null;
  // A data só pode vir da âncora pra frente (ver comentário em detectarAudiencia) — nunca de
  // antes dela, onde pode estar a data da publicação.
  const janelaData = txt.slice(ancora, ancora + 400);

  const d = acharDataEvento(janelaData, ctx.dataPublicacao);
  if (!d) return null;
  const iso = isoDe(d.dt), dataBR = dataBrDeIso(iso);

  const depoisDaData = d.idx >= 0 ? janelaData.slice(d.idx, d.idx + 80) : janelaData;
  const hora = acharHora(depoisDaData);
  const local = acharLocal(d.idx >= 0 ? janelaData.slice(d.idx) : janelaData);
  const abs = ancora + (d.idx >= 0 ? d.idx : 0);

  const linhas = [`Perícia${local ? ` — ${local}` : ''}.`, rodapeOrigem(ctx)];

  return {
    tipo: 'pericia', subtipo: 'pericia',
    titulo: `Perícia${ctx.numeroProcesso ? ` — ${ctx.numeroProcesso}` : ''}`.slice(0, 200),
    descricao: linhas.join('\n'),
    data: iso, dataBR, hora: hora || null, local: local || null,
    resumo: `Perícia identificada para ${dataBR}${hora ? ` às ${hora}` : ''}`,
    trechoOrigem: trechoAoRedor(txt, abs),
    trechoDestaque: nucleoTrecho(txt, abs),
    regra: 'pericia-designada',
    confianca: (hora && !d.anoInferido) ? 'alta' : 'media',
  };
}

// ------------------------------------------------------------
// DETECTOR: PRAZO processual  ->  tipo 'prazo'
// NÃO calcula a data de início (matéria jurídica): entrega os DIAS + a
// finalidade e a descrição já dizendo "CONFERIR o início".
// ------------------------------------------------------------
function detectarPrazo(txt, ctx) {
  const m = txt.match(/(?:no\s+)?prazo\s+(?:comum\s+|sucessivo\s+)?de\s+(\d{1,3})\s*\(?[a-zà-ú]*\)?\s*dias?(\s+[úu]teis)?/i);
  if (!m) return null;
  const dias = parseInt(m[1], 10);
  if (!dias || dias > 365) return null;
  const uteis = !!m[2];
  const idx = Math.max(0, txt.indexOf(m[0]));

  const finM = txt.slice(Math.max(0, idx - 120), idx + 40).match(
    /\b(contesta[çc][ãa]o|impugna[çc][ãa]o|manifesta[çc][ãa]o|manifestar-se|recurso|contrarraz[õo]es|embargos|r[ée]plica|raz[õo]es\s+finais|cumprimento|pagamento|apresentar\s+documento|especifica[çc][ãa]o\s+de\s+provas)\b/i
  );
  const fin = finM ? finM[0].toLowerCase() : '';

  const linhas = [
    `Prazo de ${dias} dia(s)${uteis ? ' úteis' : ''}${fin ? ` para ${fin}` : ''}.`,
    `CONFERIR a data de início — a contagem legal NÃO é calculada automaticamente.`,
    rodapeOrigem(ctx),
  ];

  return {
    tipo: 'prazo', subtipo: 'prazo',
    titulo: `Prazo${fin ? ` — ${fin}` : ''}${ctx.numeroProcesso ? ` (${ctx.numeroProcesso})` : ''}`.slice(0, 200),
    descricaoInicial: linhas.join('\n'),
    quantidadeInicial: dias,
    tipoDiasInicial: uteis ? 'uteis' : 'corridos',
    resumo: `Prazo de ${dias} dia(s)${uteis ? ' úteis' : ''}${fin ? ` para ${fin}` : ''} — conferir o início`,
    trechoOrigem: trechoAoRedor(txt, idx, 120, 120),
    trechoDestaque: nucleoTrecho(txt, idx, 60, 130),
    regra: 'prazo-processual',
    confianca: 'media',
  };
}

// ------------------------------------------------------------
// DETECTOR: PROVIDÊNCIA genérica  ->  tipo 'tarefa'
// Só roda quando NENHUM detector específico (audiência/perícia/prazo) disparou.
// ------------------------------------------------------------
function detectarProvidencia(txt, ctx) {
  const m = txt.match(/\b(intime-se|manifeste-se|manifestem-se|cumpra-se|junte-se|providencie|regularize|especifiquem?\s+as\s+partes|digam?\s+as\s+partes)\b/i);
  if (!m) return null;
  const idx = Math.max(0, txt.toLowerCase().indexOf(m[0].toLowerCase()));
  const verbo = m[1].toLowerCase();
  const tit = {
    'intime-se': 'Providência da publicação',
    'manifeste-se': 'Manifestar-se nos autos',
    'manifestem-se': 'Manifestar-se nos autos',
    'cumpra-se': 'Cumprir determinação',
    'junte-se': 'Juntar documento',
    'providencie': 'Providência determinada',
    'regularize': 'Regularizar',
  }[verbo] || 'Providência da publicação';

  return {
    tipo: 'tarefa', subtipo: 'providencia',
    titulo: `${tit}${ctx.numeroProcesso ? ` — ${ctx.numeroProcesso}` : ''}`.slice(0, 200),
    descricao: [
      `Providência a partir da publicação${ctx.numeroPublicacao ? ` nº ${ctx.numeroPublicacao}` : ''}${ctx.dataPublicacao ? ` de ${dataBrDeIso(ctx.dataPublicacao)}` : ''}.`,
      `Trecho: ${trechoAoRedor(txt, idx, 30, 240)}`,
    ].join('\n'),
    resumo: `Providência identificada ("${m[0]}") — criar tarefa para acompanhar`,
    trechoOrigem: trechoAoRedor(txt, idx, 40, 240),
    trechoDestaque: nucleoTrecho(txt, idx, 30, 200),
    regra: 'providencia-generica',
    confianca: 'media',
  };
}

// ------------------------------------------------------------
// FUNÇÃO PRINCIPAL
// ------------------------------------------------------------
export function analisarPublicacao(texto, opcoes = {}) {
  try {
    const ctx = {
      dataPublicacao: opcoes.dataPublicacao || null,
      numeroProcesso: opcoes.numeroProcesso || '',
      numeroPublicacao: opcoes.numeroPublicacao || '',
    };
    const txt = achatar(texto);
    if (!txt) return [];

    const out = [];
    const aud = detectarAudiencia(txt, ctx); if (aud) out.push(aud);
    const per = detectarPericia(txt, ctx);   if (per) out.push(per);
    const prz = detectarPrazo(txt, ctx);     if (prz) out.push(prz);
    if (!out.length) {
      const prov = detectarProvidencia(txt, ctx); if (prov) out.push(prov);
    }
    return out;
  } catch {
    return []; // qualquer imprevisto: nenhuma sugestão, nunca quebra a tela
  }
}
