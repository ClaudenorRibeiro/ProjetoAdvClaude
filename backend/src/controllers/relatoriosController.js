// ============================================================
// CONTROLLER DE RELATÓRIOS — fino de propósito: valida, chama o motor e responde.
// Regras e SQL moram em services/relatorios/*. Nada do conteúdo dos relatórios é guardado.
// ============================================================
const { pool } = require('../config/database');
const auditoria = require('../middleware/auditoria');
const { sucesso, erro, erroInterno } = require('../utils/response');
const L = require('../services/relatorios/limites');
const { ErroRelatorio } = require('../services/relatorios/erros');
const { criarContexto } = require('../services/relatorios/visibilidade');
const { catalogoParaUsuario } = require('../services/relatorios/catalogo');
const { validarReceita } = require('../services/relatorios/validador');
const { contar, executarPagina } = require('../services/relatorios/executor');
const { exportarXlsx } = require('../services/relatorios/exportadores/xlsx');
const modelos = require('../services/relatorios/modelos');
const limitesAdmin = require('../services/relatorios/limitesAdmin');

function tratar(res, err) {
  if (err instanceof ErroRelatorio) {
    return erro(res, err.mensagens.join(' '), err.status, err.mensagens.length > 1 ? err.mensagens : null);
  }
  return erroInterno(res, err);
}

// A receita vem do corpo (relatório ainda não salvo) ou de um relatório salvo (modelo_id).
// Nos dois casos passa pelo validador com as permissões de HOJE do usuário.
async function resolverReceita(req, ctx) {
  const { modelo_id: modeloId, receita } = req.body || {};
  if (modeloId !== undefined && modeloId !== null) {
    const m = await modelos.obterOuErro(pool, Number(modeloId), req.usuario.id);
    return { ...(await validarReceita(m.receita, ctx)), modelo: m };
  }
  return { ...(await validarReceita(receita, ctx)), modelo: null };
}

function registrarUso(req, acao, modelo, assunto) {
  return modelo
    ? auditoria.registrar(req.usuario.id, 'relatorio_modelo', acao, modelo.id)
    : auditoria.registrar(req.usuario.id, 'relatorio', acao, null, null, null, null, `Relatório não salvo: ${assunto.rotulo}`);
}

// GET /api/relatorios/catalogo
async function catalogo(req, res) {
  try { return sucesso(res, await catalogoParaUsuario(await criarContexto(req.usuario))); }
  catch (err) { return tratar(res, err); }
}

// GET /api/relatorios/modelos
async function listarModelos(req, res) {
  try { return sucesso(res, await modelos.listarMeus(req.usuario.id)); }
  catch (err) { return tratar(res, err); }
}

// POST /api/relatorios/modelos  { nome, descricao?, receita }
async function criarModelo(req, res) {
  try {
    const { receita } = await validarReceita(req.body?.receita, await criarContexto(req.usuario));
    return sucesso(res, await modelos.criar(req.usuario, req.body, receita), 'Relatório salvo', 201);
  } catch (err) { return tratar(res, err); }
}

// PUT /api/relatorios/modelos/:id  { nome?, descricao?, receita? }
async function atualizarModelo(req, res) {
  try {
    let receita = null;
    if (req.body?.receita !== undefined) receita = (await validarReceita(req.body.receita, await criarContexto(req.usuario))).receita;
    return sucesso(res, await modelos.atualizar(req.usuario, Number(req.params.id), req.body || {}, receita), 'Relatório atualizado');
  } catch (err) { return tratar(res, err); }
}

// DELETE /api/relatorios/modelos/:id
async function excluirModelo(req, res) {
  try { await modelos.excluir(req.usuario, Number(req.params.id)); return sucesso(res, null, 'Relatório excluído'); }
  catch (err) { return tratar(res, err); }
}

// POST /api/relatorios/modelos/:id/duplicar
async function duplicarModelo(req, res) {
  try { return sucesso(res, await modelos.duplicar(req.usuario, Number(req.params.id)), 'Relatório duplicado', 201); }
  catch (err) { return tratar(res, err); }
}

// PUT /api/relatorios/modelos/:id/preferencias  { linhas_por_pagina }
async function salvarPreferencias(req, res) {
  try { return sucesso(res, await modelos.salvarPreferencias(req.usuario, Number(req.params.id), req.body), 'Preferências salvas'); }
  catch (err) { return tratar(res, err); }
}

// POST /api/relatorios/executar  { receita | modelo_id, pagina?, limite? }
async function executar(req, res) {
  try {
    const ctx = await criarContexto(req.usuario);
    const { assunto, receita, modelo } = await resolverReceita(req, ctx);
    const resultado = await executarPagina(assunto, receita, ctx, { pagina: req.body.pagina, limite: req.body.limite });
    if (resultado.pagina === 1) await registrarUso(req, 'rodar', modelo, assunto); // só a 1ª página (não a navegação)
    return sucesso(res, { ...resultado, receita, modelo: modelo ? { id: modelo.id, nome: modelo.nome } : null });
  } catch (err) { return tratar(res, err); }
}

function nomeDoArquivo(base) {
  const limpo = String(base || 'Relatório').replace(/[^\p{L}\p{N} _().-]/gu, '').trim().slice(0, 80) || 'Relatório';
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `${limpo} - ${dia}.xlsx`;
}

// POST /api/relatorios/exportar  { receita | modelo_id, formato: 'xlsx', nome? }
async function exportar(req, res) {
  try {
    if ((req.body?.formato || 'xlsx') !== 'xlsx') throw new ErroRelatorio('Esse formato ainda não está disponível. Por enquanto: Excel (xlsx).');
    const ctx = await criarContexto(req.usuario);
    const { assunto, receita, modelo } = await resolverReceita(req, ctx);
    const total = await contar(assunto, receita, ctx);
    if (total > L.LIMITE_EXCEL) {
      throw new ErroRelatorio(`Este relatório tem ${total.toLocaleString('pt-BR')} linhas e o máximo para exportar é ${L.LIMITE_EXCEL.toLocaleString('pt-BR')}. Refine os filtros.`, 413);
    }
    const nomeRelatorio = modelo ? modelo.nome : (String(req.body?.nome || '').trim().slice(0, 100) || `Relatório de ${assunto.rotulo}`);
    const arquivo = nomeDoArquivo(nomeRelatorio);
    res.status(200);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio.xlsx"; filename*=UTF-8''${encodeURIComponent(arquivo)}`);
    res.setHeader('Cache-Control', 'no-store');
    try {
      await exportarXlsx({ res, assunto, receita, ctx, nomeRelatorio, total });
    } catch (err) {
      console.error('Erro ao exportar relatório:', err);
      res.destroy(err); // o arquivo já começou a sair: derruba a conexão para o navegador não aceitar um arquivo cortado
      return undefined;
    }
    await registrarUso(req, 'exportar', modelo, assunto);
    return undefined;
  } catch (err) { return tratar(res, err); }
}

// GET /api/relatorios/limites  (admin)
async function obterLimites(req, res) {
  try { return sucesso(res, await limitesAdmin.obterLimites()); }
  catch (err) { return tratar(res, err); }
}

// PUT /api/relatorios/limites  (admin)  { padrao?, usuarios?: { id: n | null } }
async function salvarLimites(req, res) {
  try { return sucesso(res, await limitesAdmin.salvarLimites(req.usuario, req.body), 'Limites salvos'); }
  catch (err) { return tratar(res, err); }
}

module.exports = {
  catalogo, listarModelos, criarModelo, atualizarModelo, excluirModelo, duplicarModelo,
  salvarPreferencias, executar, exportar, obterLimites, salvarLimites,
};
