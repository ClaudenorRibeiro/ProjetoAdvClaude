// ============================================================
// RELATÓRIOS — agrupar e totalizar: expressões SQL, rótulos legíveis e o "detalhe do grupo".
// Datas agrupam por dia, semana (domingo a sábado), mês ou ano.
// ============================================================
const { ErroRelatorio } = require('./erros');
const { ehData } = require('./tipos');
const { dataValida, somarDias, fimMes } = require('./datasRelativas');

const SEM_VALOR = '(sem valor)';

// { chave: SQL da chave do grupo, rotulo: SQL do nome a mostrar (ou null) }
function expressaoGrupo(campo, passo) {
  const e = campo.expr;
  if (ehData(campo.tipo)) {
    const d = campo.tipo === 'datahora' ? `DATE(${e})` : e;
    const chave = { semana: `DATE_SUB(${d}, INTERVAL (DAYOFWEEK(${d}) - 1) DAY)`, mes: `DATE_FORMAT(${d}, '%Y-%m')`, ano: `YEAR(${d})` }[passo] || d;
    return { chave, rotulo: null };
  }
  if (campo.tipo === 'lista') return campo.exprFiltro ? { chave: campo.exprFiltro, rotulo: `MIN(${e})` } : { chave: e, rotulo: null };
  if (campo.tipo === 'texto') return { chave: `NULLIF(${e}, '')`, rotulo: null };   // '' e NULL viram o mesmo grupo "(sem valor)"
  if (campo.tipo === 'booleano') return { chave: `IF(${e} = 1, 1, 0)`, rotulo: null };
  return { chave: e, rotulo: null };
}

function expressaoMetrica(m, assunto) {
  const e = m.campo ? assunto.campos[m.campo].expr : null;
  return { contagem: 'COUNT(*)', soma: `SUM(${e})`, media: `AVG(${e})`, minimo: `MIN(${e})`, maximo: `MAX(${e})` }[m.funcao];
}

const dmy = (iso) => iso.split('-').reverse().join('/');
function rotuloData(passo, k) {
  switch (passo) {
    case 'dia': return dmy(k);
    case 'semana': return `Semana de ${dmy(k)}`;
    case 'mes': return `${k.slice(5, 7)}/${k.slice(0, 4)}`;
    default: return String(k);
  }
}

function rotuloDoGrupo(campo, passo, chave, rotuloSql) {
  if (chave === null || chave === undefined) return SEM_VALOR;
  if (ehData(campo.tipo)) return rotuloData(passo, String(chave));
  if (campo.tipo === 'booleano') return Number(chave) === 1 ? 'Sim' : 'Não';
  if (campo.tipo === 'lista') return rotuloSql ?? campo.rotulosValor?.[chave] ?? String(chave);
  return String(chave);
}

// Valor de um total vindo do banco -> número (ou texto, para datas mín./máx.)
function valorDaMetrica(m, assunto, bruto) {
  if (bruto === null || bruto === undefined) return null;
  const tipo = m.campo ? assunto.campos[m.campo].tipo : 'numero';
  if (m.funcao === 'minimo' || m.funcao === 'maximo') return tipo === 'numero' ? Number(bruto) : String(bruto);
  return m.funcao === 'media' ? Math.round(Number(bruto) * 100) / 100 : Number(bruto);
}

// Cabeçalhos das colunas de resultado (a tela e o Excel usam a mesma descrição)
function rotuloDaMetrica(m, assunto) {
  const nomes = { contagem: 'Quantidade', soma: 'Soma', media: 'Média', minimo: 'Mínimo', maximo: 'Máximo' };
  return m.campo ? `${nomes[m.funcao]} de ${assunto.campos[m.campo].rotulo}` : nomes[m.funcao];
}

const textoChave = (v) => (typeof v === 'string' || typeof v === 'number') ? v : null;

// Condições (já no formato interno do motor) que selecionam EXATAMENTE as linhas de um grupo.
// A chave vem do cliente: cada tipo é conferido; nada vira texto de SQL (só parâmetro).
function condicoesDoGrupo(assunto, agrupar, chaves) {
  if (!Array.isArray(chaves) || chaves.length !== agrupar.length) throw new ErroRelatorio('Grupo inválido.');
  return agrupar.map((g, i) => {
    const campo = assunto.campos[g.campo];
    const v = chaves[i];
    const invalido = () => new ErroRelatorio('Grupo inválido.');
    if (v === null) return { campo: g.campo, operador: 'vazio', valor: null };
    if (campo.tipo === 'booleano') return { campo: g.campo, operador: Number(v) === 1 ? 'verdadeiro' : 'falso', valor: null };
    if (textoChave(v) === null) throw invalido();
    if (campo.tipo === 'lista') return { campo: g.campo, operador: 'em', valor: [String(v)] };
    if (campo.tipo === 'texto') return { campo: g.campo, operador: 'igual', valor: String(v) };
    if (campo.tipo === 'numero') {
      if (!Number.isFinite(Number(v))) throw invalido();
      return { campo: g.campo, operador: 'igual', valor: Number(v) };
    }
    const k = String(v);   // data / datahora
    if (g.passo === 'dia' && dataValida(k)) return { campo: g.campo, operador: 'igual', valor: k };
    if (g.passo === 'semana' && dataValida(k)) return { campo: g.campo, operador: 'entre', valor: [k, somarDias(k, 6)] };
    if (g.passo === 'mes' && /^\d{4}-\d{2}$/.test(k) && dataValida(`${k}-01`)) return { campo: g.campo, operador: 'entre', valor: [`${k}-01`, fimMes(`${k}-01`)] };
    if (g.passo === 'ano' && /^\d{4}$/.test(k)) return { campo: g.campo, operador: 'entre', valor: [`${k}-01-01`, `${k}-12-31`] };
    throw invalido();
  });
}

module.exports = { SEM_VALOR, expressaoGrupo, expressaoMetrica, rotuloDoGrupo, rotuloData, valorDaMetrica, rotuloDaMetrica, condicoesDoGrupo };
