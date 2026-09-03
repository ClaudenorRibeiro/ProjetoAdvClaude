// ============================================================
// SERVICO DE IA (apoio as "Sugestoes" das Publicacoes)
// ------------------------------------------------------------
// BYOK ("bring your own key"): cada escritorio (cada instancia) escolhe UM
// provedor (Claude OU GPT OU nenhum) e usa a PROPRIA chave/credito.
// Config na tabela configuracoes_integracoes, modulo 'ia':
//   { provedor: 'nenhum'|'claude'|'openai'|'mock', modelo: '', chave: '' }
//
// A IA e SO PLANO B: o parser de regras (frontend) roda primeiro; a IA so e
// chamada quando as regras nao acham nada / confianca baixa. Qualquer falha
// (timeout, quota, chave errada, JSON invalido) -> devolve [] e o front fica
// com o resultado das regras (nunca quebra o painel).
//
// Sem dependencia nova: usa o modulo 'https' nativo (funciona em qualquer Node).
// ============================================================

const https = require('https');
const { pool } = require('../config/database');

// ---- Cache curto da config (evita SELECT por requisicao) --------------------
let _cache = { em: 0, cfg: null };
const CACHE_MS = 60 * 1000;

async function configIa() {
  const agora = Date.now();
  if (_cache.cfg && (agora - _cache.em) < CACHE_MS) return _cache.cfg;
  let cfg = { ativo: false, provedor: 'nenhum', modelo: '', chave: '' };
  try {
    const [rows] = await pool.execute(
      "SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'ia' LIMIT 1"
    );
    if (rows.length) {
      let c = rows[0].configuracoes;
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } }
      c = c || {};
      cfg = {
        ativo: Number(rows[0].ativo) === 1,
        provedor: ['nenhum', 'claude', 'openai', 'mock'].includes(c.provedor) ? c.provedor : 'nenhum',
        modelo: String(c.modelo || '').trim(),
        chave: String(c.chave || '').trim(),
      };
    }
  } catch (e) {
    console.error('[iaService] falha ao ler config:', e.message);
  }
  _cache = { em: agora, cfg };
  return cfg;
}

function limparCacheIa() { _cache = { em: 0, cfg: null }; }

function iaHabilitada(cfg) {
  if (!cfg || !cfg.ativo || cfg.provedor === 'nenhum') return false;
  if (cfg.provedor === 'mock') return true;
  return !!cfg.chave;
}

// ---- Chamada HTTPS simples (POST JSON, com timeout) ------------------------
function postJson(url, headers, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('resposta nao-JSON do provedor')); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ---- Prompt --------------------------------------------------------------
function montarPrompt(texto, ctx) {
  return [
    'Voce e um assistente que le a INTIMACAO/PUBLICACAO abaixo (Justica brasileira)',
    'e devolve SUGESTOES DE PROVIDENCIA em JSON. Regras rigidas:',
    '- Responda APENAS com um objeto JSON: {"sugestoes":[...]}. Nada de texto fora do JSON.',
    '- Cada sugestao: {"tipo","subtipo","titulo","descricao","data","hora","local","modalidade","resumo","trechoOrigem","confianca","diasPrazo","diasUteis"}.',
    '- "tipo" so pode ser: "compromisso" (audiencia), "pericia", "prazo" ou "tarefa".',
    '- "data" no formato AAAA-MM-DD (ou "" se nao houver data explicita). NUNCA invente data.',
    '- "hora" "HH:MM" ou "". "confianca": "alta" so se houver data + hora + designacao clara; senao "media".',
    '- "trechoOrigem": copie o trecho exato do texto que justifica a sugestao.',
    '- Para "prazo": preencha "diasPrazo" com o NUMERO INTEIRO de dias do prazo (ex.: 15) e',
    '  "diasUteis" com true (dias uteis) ou false (dias corridos). NAO calcule a data de inicio.',
    '  Se nao houver um numero de dias explicito no texto, NAO sugira "prazo" (sugira "tarefa").',
    '- Se a audiencia/pericia ja foi REALIZADA/CANCELADA, NAO sugira cria-la.',
    '- Se nao houver nada acionavel, devolva {"sugestoes":[]}.',
    ctx && ctx.numeroProcesso ? `Processo: ${ctx.numeroProcesso}` : '',
    ctx && ctx.dataPublicacao ? `Data de disponibilizacao: ${ctx.dataPublicacao}` : '',
    '',
    'TEXTO DA PUBLICACAO:',
    String(texto || '').slice(0, 12000),
  ].filter(Boolean).join('\n');
}

// ---- Chamada por provedor --------------------------------------------------
async function chamarProvedor(cfg, texto, ctx) {
  const prompt = montarPrompt(texto, ctx);

  if (cfg.provedor === 'mock') {
    return {
      sugestoes: [{
        tipo: 'tarefa', subtipo: 'providencia',
        titulo: '[SIMULACAO IA] Providencia da publicacao',
        descricao: 'Sugestao de teste gerada pelo modo Simulacao (sem custo, sem chamada externa).',
        data: '', hora: '', local: '', modalidade: '',
        resumo: '[SIMULACAO] a IA responderia aqui', trechoOrigem: '',
        confianca: 'media',
      }],
    };
  }

  if (cfg.provedor === 'claude') {
    const modelo = cfg.modelo || 'claude-sonnet-5';
    const resp = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': cfg.chave, 'anthropic-version': '2023-06-01' },
      { model: modelo, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }
    );
    const txt = (resp && resp.content && resp.content[0] && resp.content[0].text) || '';
    return parseJsonFrouxo(txt);
  }

  if (cfg.provedor === 'openai') {
    const modelo = cfg.modelo || 'gpt-4o-mini';
    const resp = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${cfg.chave}` },
      {
        model: modelo, max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }
    );
    const txt = (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';
    return parseJsonFrouxo(txt);
  }

  throw new Error('provedor de IA desconhecido');
}

// Aceita JSON puro ou embrulhado em ```json ... ```
function parseJsonFrouxo(s) {
  const t = String(s || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return JSON.parse(t);
}

// ---- Normalizacao / saneamento da resposta da IA -------------------------
function dataBrDeIso(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : '';
}

function normalizar(bruto) {
  const arr = (bruto && Array.isArray(bruto.sugestoes)) ? bruto.sugestoes
            : (Array.isArray(bruto) ? bruto : []);
  const tiposOk = ['compromisso', 'pericia', 'prazo', 'tarefa'];
  const out = [];
  for (const s of arr.slice(0, 8)) {
    if (!s || !tiposOk.includes(s.tipo)) continue;
    const resumo = String(s.resumo || '').trim();
    if (!resumo) continue;
    let data = String(s.data || '').slice(0, 10);
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) data = '';
    const hora = /^\d{1,2}:\d{2}$/.test(String(s.hora || '')) ? String(s.hora) : null;
    const confianca = ['alta', 'media', 'baixa'].includes(s.confianca) ? s.confianca : 'media';

    // PRAZO precisa de campos ESTRUTURADOS (o Novo Prazo lê descricaoInicial/quantidadeInicial/
    // tipoDiasInicial — nao "descricao"). Sem um numero de dias valido, o modal abria em branco
    // (auditoria 02/09, item 5); aqui, sem dias, a sugestao e descartada.
    if (s.tipo === 'prazo') {
      const dias = parseInt(s.diasPrazo, 10);
      if (!Number.isFinite(dias) || dias <= 0 || dias > 365) continue;
      const uteis = s.diasUteis !== false; // padrao "uteis" (mesmo default do modal) se a IA nao disser
      out.push({
        tipo: 'prazo', subtipo: 'prazo',
        titulo: String(s.titulo || resumo).slice(0, 200),
        descricaoInicial: [
          String(s.descricao || '').trim() || `Prazo de ${dias} dia(s)${uteis ? ' úteis' : ''}.`,
          'CONFERIR a data de início — a contagem legal NÃO é calculada automaticamente.',
        ].join('\n').slice(0, 2000),
        quantidadeInicial: dias,
        tipoDiasInicial: uteis ? 'uteis' : 'corridos',
        resumo: resumo.slice(0, 300),
        trechoOrigem: String(s.trechoOrigem || '').slice(0, 600),
        trechoDestaque: String(s.trechoOrigem || '').slice(0, 400),
        regra: 'ia', origem: 'ia', confianca,
      });
      continue;
    }

    out.push({
      tipo: s.tipo,
      subtipo: s.tipo === 'compromisso' ? 'audiencia' : (String(s.subtipo || '').slice(0, 40) || s.tipo),
      titulo: String(s.titulo || resumo).slice(0, 200),
      descricao: String(s.descricao || '').slice(0, 2000),
      data: data || null,
      dataBR: data ? dataBrDeIso(data) : '',
      hora,
      local: s.local ? String(s.local).slice(0, 400) : null,
      modalidade: s.modalidade ? String(s.modalidade).slice(0, 40) : null,
      resumo: resumo.slice(0, 300),
      trechoOrigem: String(s.trechoOrigem || '').slice(0, 600),
      trechoDestaque: String(s.trechoOrigem || '').slice(0, 400),
      regra: 'ia',
      origem: 'ia',
      confianca,
    });
  }
  return out.slice(0, 6);
}

// ---- API do servico -----------------------------------------------------
// Devolve SEMPRE uma lista (vazia em qualquer falha). NUNCA lanca.
async function sugerirComIa(texto, ctx = {}) {
  try {
    const cfg = await configIa();
    if (!iaHabilitada(cfg)) return { sugestoes: [], provedor: cfg.provedor, ia: false };
    if (!texto || !String(texto).trim()) return { sugestoes: [], provedor: cfg.provedor, ia: false };
    let bruto;
    try {
      bruto = await chamarProvedor(cfg, texto, ctx);
    } catch (e1) {
      // 1 retry simples
      console.error('[iaService] 1a tentativa falhou:', e1.message);
      bruto = await chamarProvedor(cfg, texto, ctx);
    }
    return { sugestoes: normalizar(bruto), provedor: cfg.provedor, ia: true };
  } catch (e) {
    console.error('[iaService] sugerirComIa falhou:', e.message);
    return { sugestoes: [], provedor: 'nenhum', ia: false };
  }
}

module.exports = { configIa, limparCacheIa, iaHabilitada, sugerirComIa };
