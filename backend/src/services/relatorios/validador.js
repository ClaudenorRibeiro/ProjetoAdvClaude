// ============================================================
// RELATÓRIOS — VALIDADOR da receita (a "portaria").
// Recebe o que veio da tela (nunca confia nela) e devolve uma receita LIMPA ou recusa:
//   * assunto/colunas/filtros/ordem só do catálogo e só o que o usuário pode usar;
//   * operador compatível com o tipo do campo; valor no formato certo;
//   * limites de tamanho (colunas, condições, profundidade).
// ============================================================
const L = require('./limites');
const { ErroRelatorio } = require('./erros');
const { operadoresDoTipo } = require('./tipos');
const { dataValida, resolverData, PERIODOS } = require('./datasRelativas');
const { obterAssunto, assuntoPermitido, campoPermitido, opcoesDoCampo } = require('./catalogo');

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function valorDeData(v, hoje) {
  if (typeof v === 'string') return dataValida(v) ? v : null;
  return resolverData(v, hoje) ? { rel: 'hoje', dias: Number(v.dias || 0) } : null;
}

// Valida e normaliza o valor de UMA condição. Devolve { ok, valor } ou { ok:false, erro }.
async function validarValor(campo, operador, bruto, ctx, cacheOpcoes) {
  const aridade = operadoresDoTipo(campo.tipo)[operador].aridade;
  const rot = campo.rotulo;
  if (aridade === 'nenhum') return { ok: true, valor: null };

  if (aridade === 'periodo') {
    return PERIODOS[bruto] ? { ok: true, valor: bruto } : { ok: false, erro: `Período inválido no filtro "${rot}".` };
  }
  if (aridade === 'lista') {
    if (!Array.isArray(bruto) || bruto.length < 1 || bruto.length > L.MAX_VALORES_LISTA) {
      return { ok: false, erro: `Escolha ao menos uma opção no filtro "${rot}".` };
    }
    if (!cacheOpcoes.has(campo)) cacheOpcoes.set(campo, new Set((await opcoesDoCampo(campo, ctx)).map(o => String(o.valor))));
    const permitidas = cacheOpcoes.get(campo);
    const valores = bruto.map(String);
    return valores.every(v => permitidas.has(v))
      ? { ok: true, valor: [...new Set(valores)] }
      : { ok: false, erro: `O filtro "${rot}" tem uma opção que você não pode usar.` };
  }

  const um = (v) => {
    if (campo.tipo === 'texto') {
      const t = typeof v === 'string' ? v.trim() : '';
      return t && t.length <= L.MAX_TEXTO ? t : null;
    }
    if (campo.tipo === 'numero') {
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      return Number.isFinite(n) ? n : null;
    }
    return valorDeData(v, ctx.hoje); // data / datahora
  };
  if (aridade === 'um') {
    const v = um(bruto);
    return v === null ? { ok: false, erro: `Valor inválido no filtro "${rot}".` } : { ok: true, valor: v };
  }
  if (!Array.isArray(bruto) || bruto.length !== 2) return { ok: false, erro: `O filtro "${rot}" precisa de dois valores.` };
  const [a, b] = [um(bruto[0]), um(bruto[1])];
  return a === null || b === null ? { ok: false, erro: `Valores inválidos no filtro "${rot}".` } : { ok: true, valor: [a, b] };
}

async function validarGrupo(no, assunto, ctx, estado, profundidade) {
  if (profundidade > L.MAX_PROFUNDIDADE) { estado.erros.push('Filtros aninhados demais.'); return null; }
  const op = no.op === 'OU' ? 'OU' : 'E';
  const itens = [];
  for (const item of Array.isArray(no.itens) ? no.itens : []) {
    if (!ehObjeto(item)) { estado.erros.push('Filtro mal formado.'); continue; }
    if (Array.isArray(item.itens)) {
      const g = await validarGrupo(item, assunto, ctx, estado, profundidade + 1);
      if (g) itens.push(g);
      continue;
    }
    estado.condicoes += 1;
    if (estado.condicoes > L.MAX_CONDICOES) { estado.erros.push(`No máximo ${L.MAX_CONDICOES} condições de filtro.`); break; }
    const campo = Object.prototype.hasOwnProperty.call(assunto.campos, item.campo) ? assunto.campos[item.campo] : null;
    if (!campo || !campoPermitido(ctx, campo)) { estado.erros.push(`Campo de filtro indisponível: ${String(item.campo).slice(0, 40)}.`); continue; }
    if (!Object.prototype.hasOwnProperty.call(operadoresDoTipo(campo.tipo), item.operador)) {
      estado.erros.push(`"${campo.rotulo}" não aceita essa condição.`); continue;
    }
    const v = await validarValor(campo, item.operador, item.valor, ctx, estado.cacheOpcoes);
    if (!v.ok) { estado.erros.push(v.erro); continue; }
    itens.push({ campo: item.campo, operador: item.operador, valor: v.valor });
  }
  return itens.length ? { op, itens } : null; // grupo vazio é descartado
}

// Devolve { assunto, receita } normalizados ou lança ErroRelatorio
async function validarReceita(bruta, ctx) {
  const r = ehObjeto(bruta) ? bruta : {};
  const assunto = obterAssunto(r.assunto);
  if (!assunto) throw new ErroRelatorio('Escolha um assunto de relatório válido.');
  if (!assuntoPermitido(ctx, assunto)) throw new ErroRelatorio(`Você não tem permissão para relatórios de ${assunto.rotulo}.`, 403);

  const erros = [];
  const campoOk = (chave) => Object.prototype.hasOwnProperty.call(assunto.campos, chave) && campoPermitido(ctx, assunto.campos[chave]);

  const colunas = [...new Set(Array.isArray(r.colunas) ? r.colunas : [])];
  if (!colunas.length) erros.push('Escolha ao menos uma coluna.');
  if (colunas.length > L.MAX_COLUNAS) erros.push(`No máximo ${L.MAX_COLUNAS} colunas.`);
  colunas.forEach(c => { if (!campoOk(c)) erros.push(`Coluna indisponível: ${String(c).slice(0, 40)}.`); });

  const estado = { erros, condicoes: 0, cacheOpcoes: new Map() };
  const raiz = ehObjeto(r.filtros) ? r.filtros : { op: 'E', itens: [] };
  const filtros = await validarGrupo(raiz, assunto, ctx, estado, 1) || { op: 'E', itens: [] };

  const ordem = [];
  const listaOrdem = Array.isArray(r.ordem) ? r.ordem : [];
  if (listaOrdem.length > L.MAX_ORDENS) erros.push(`No máximo ${L.MAX_ORDENS} critérios de ordem.`);
  for (const o of listaOrdem.slice(0, L.MAX_ORDENS)) {
    if (!ehObjeto(o) || !campoOk(o.campo)) { erros.push('Critério de ordem indisponível.'); continue; }
    if (ordem.some(x => x.campo === o.campo)) continue;
    ordem.push({ campo: o.campo, direcao: o.direcao === 'desc' ? 'desc' : 'asc' });
  }

  if (erros.length) throw new ErroRelatorio([...new Set(erros)]);
  return { assunto, receita: { versao: L.VERSAO_RECEITA, assunto: assunto.chave, colunas, filtros, ordem } };
}

module.exports = { validarReceita };
