// ============================================================
// RELATÓRIOS DO SISTEMA — os modelos padrão do escritório (os antigos relatórios, refeitos no motor novo).
// O administrador instala com um clique; pode instalar de novo sem duplicar (confere pelo nome).
// Cada um passa pelo validador como qualquer relatório: nada aqui fura permissão ou regra.
// ============================================================
const { pool } = require('../../config/database');
const { criarContexto } = require('./visibilidade');
const { validarReceita } = require('./validador');
const modelos = require('./modelos');

const base = (assunto, colunas, extra = {}) => ({ versao: 2, assunto, colunas, filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [], ordemGrupo: null, ...extra });
const pergunta = (campo, operador, valor) => ({ campo, operador, valor, perguntar: true });
const E = (...itens) => ({ op: 'E', itens });

// diasParado: o padrão do escritório (Configurações), lido na hora de instalar
const modelosPadrao = ({ diasParado }) => [
  { nome: 'Prazos do período', descricao: 'Prazos com vencimento no período escolhido ao abrir.',
    receita: base('prazos', ['pasta', 'processo', 'subtipo', 'vencimento', 'status', 'responsavel'],
      { filtros: E(pergunta('vencimento', 'no_periodo', 'proximos_30_dias')), ordem: [{ campo: 'vencimento', direcao: 'asc' }] }) },
  { nome: 'Tarefas pendentes', descricao: 'Tarefas ainda não concluídas; pergunta as prioridades ao abrir.',
    receita: base('tarefas', ['titulo', 'pasta', 'processo', 'vencimento', 'prioridade', 'atribuida_para'],
      { filtros: E({ campo: 'concluida', operador: 'falso', valor: null }, pergunta('prioridade', 'em', ['urgente', 'normal', 'baixa'])), ordem: [{ campo: 'vencimento', direcao: 'asc' }] }) },
  { nome: 'Audiências do período', descricao: 'Audiências no período escolhido ao abrir.',
    receita: base('audiencias', ['pasta', 'processo', 'tipo', 'data', 'hora', 'modalidade', 'status', 'responsavel'],
      { filtros: E(pergunta('data', 'no_periodo', 'proximos_30_dias')), ordem: [{ campo: 'data', direcao: 'asc' }, { campo: 'hora', direcao: 'asc' }] }) },
  { nome: 'Perícias por perito', descricao: 'Perícias do período, por perito, com telefone e e-mail do perito.',
    receita: base('pericias', ['perito', 'perito_telefone', 'perito_email', 'pasta', 'processo', 'tipo', 'data', 'hora', 'status'],
      { filtros: E(pergunta('data', 'no_periodo', 'proximos_30_dias')), ordem: [{ campo: 'perito', direcao: 'asc' }, { campo: 'data', direcao: 'asc' }] }) },
  { nome: 'Processos (pastas)', descricao: 'Todos os processos ativos, com pasta, tipo, status e responsável.',
    receita: base('processos', ['pasta', 'processo', 'titulo', 'tipo', 'status', 'responsavel'], { ordem: [{ campo: 'pasta', direcao: 'desc' }] }) },
  { nome: 'Processos parados', descricao: 'Risco de prescrição: processos sem movimentação há N dias ou mais (não conta os encerrados).',
    receita: base('processos', ['pasta', 'processo', 'titulo', 'ultima_movimentacao', 'dias_parado'],
      { filtros: E(pergunta('dias_parado', 'maior_igual', diasParado), { campo: 'encerrado', operador: 'falso', valor: null }), ordem: [{ campo: 'dias_parado', direcao: 'desc' }] }) },
  ...[
    ['Aniversariantes de hoje', 'Clientes que fazem aniversário hoje.', { campo: 'proximo_aniversario', operador: 'no_periodo', valor: 'hoje' }],
    ['Aniversariantes da semana', 'Clientes que fazem aniversário de hoje até daqui a 6 dias.', { campo: 'proximo_aniversario', operador: 'entre', valor: [{ rel: 'hoje', dias: 0 }, { rel: 'hoje', dias: 6 }] }],
    ['Aniversariantes do mês', 'Clientes que fazem aniversário no mês escolhido ao abrir.', pergunta('mes_aniversario', 'em', null)],
  ].map(([nome, descricao, filtro]) => ({ nome, descricao,
    receita: base('pessoas_fisicas', ['nome', 'aniversario', 'idade_completa', 'telefone', 'email', 'parabenizado'],
      { filtros: E({ campo: 'cliente', operador: 'verdadeiro', valor: null }, filtro), ordem: [{ campo: 'proximo_aniversario', direcao: 'asc' }, { campo: 'nome', direcao: 'asc' }] }) })),
  { nome: 'Lançamentos financeiros do período', descricao: 'Entradas e saídas da conta corrente dos processos no período escolhido ao abrir.',
    receita: base('financeiro_lancamentos', ['data', 'pasta', 'processo', 'descricao', 'tipo', 'valor'],
      { filtros: E(pergunta('data', 'no_periodo', 'este_mes')), ordem: [{ campo: 'data', direcao: 'asc' }] }) },
];

async function diasParadoPadrao() {
  try {
    const [r] = await pool.execute('SELECT COALESCE(dias_processo_parado, 365) AS d FROM configuracoes_escritorio LIMIT 1');
    return Number(r[0]?.d) > 0 ? Number(r[0].d) : 365;
  } catch (err) { return 365; }
}

// Cria os que faltam (pelo nome). Devolve o que criou, o que já existia e o que não foi possível criar (com o motivo).
async function instalarPadrao(usuario) {
  const ctx = await criarContexto(usuario);
  const resultado = { criados: [], jaExistiam: [], falhas: [] };
  for (const m of modelosPadrao({ diasParado: await diasParadoPadrao() })) {
    const [ja] = await pool.execute("SELECT id FROM relatorio_modelo WHERE escopo = 'sistema' AND nome = ?", [m.nome]);
    if (ja.length) { resultado.jaExistiam.push(m.nome); continue; }
    try {
      const { receita } = await validarReceita(m.receita, ctx, { salvando: true });
      await modelos.criar(usuario, { nome: m.nome, descricao: m.descricao, escopo: 'sistema' }, receita);
      resultado.criados.push(m.nome);
    } catch (err) {
      resultado.falhas.push({ nome: m.nome, motivo: (err.mensagens && err.mensagens.join(' ')) || err.message });
    }
  }
  return resultado;
}

module.exports = { instalarPadrao, modelosPadrao };
