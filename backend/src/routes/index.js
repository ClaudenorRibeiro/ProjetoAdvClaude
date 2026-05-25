// ============================================================
// ROTEADOR PRINCIPAL — Registra todas as rotas da API
// ============================================================

const express = require('express');
const router = express.Router();

const { autenticar, apenasAdmin } = require('../middleware/auth');
const { verificarPermissao } = require('../middleware/permissoes');

// Controllers
const authCtrl          = require('../controllers/authController');
const pessoasCtrl       = require('../controllers/pessoasController');
const processosCtrl     = require('../controllers/processosController');
const prazosCtrl        = require('../controllers/prazosController');
const tarefasCtrl       = require('../controllers/tarefasController');
const audienciasCtrl    = require('../controllers/audienciasController');
const financeiroCtrl    = require('../controllers/financeiroController');
const andamentoCtrl     = require('../controllers/andamentoController');
const documentosCtrl    = require('../controllers/documentosController');
const publicacoesCtrl   = require('../controllers/publicacoesController');
const configuracaoCtrl  = require('../controllers/configuracaoController');
const dashboardCtrl     = require('../controllers/dashboardController');
const periciasCtrl      = require('../controllers/periciasController');

// ---- AUTENTICAÇÃO (rotas públicas) ----
router.post('/auth/login',         authCtrl.login);
router.post('/auth/criar-admin',   authCtrl.criarPrimeiroAdmin);
router.get('/auth/verificar',      autenticar, authCtrl.verificarToken);

// ---- DASHBOARD ----
router.get('/dashboard', autenticar, dashboardCtrl.buscarDados);

// ---- PESSOAS ----
router.get('/pessoas/auxiliares',         autenticar, pessoasCtrl.buscarAuxiliares);
router.get('/pessoas/fisicas',            autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.listarFisicas);
// IMPORTANTE: rota /cpf/:cpf deve ficar ANTES de /:id para o Express não capturar "cpf" como id
router.get('/pessoas/fisicas/cpf/:cpf',   autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.buscarPorCPF);
router.get('/pessoas/fisicas/:id',        autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.buscarFisica);
router.post('/pessoas/fisicas',           autenticar, verificarPermissao('pessoas','cadastrar'),  pessoasCtrl.criarFisica);
router.put('/pessoas/fisicas/:id',        autenticar, verificarPermissao('pessoas','alterar'),    pessoasCtrl.atualizarFisica);
router.post('/pessoas/fisicas/:id/historico', autenticar, pessoasCtrl.adicionarHistorico);
router.get('/pessoas/juridicas',          autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.listarJuridicas);
router.post('/pessoas/juridicas',         autenticar, verificarPermissao('pessoas','cadastrar'),  pessoasCtrl.criarJuridica);

// ---- PROCESSOS E PASTAS ----
router.get('/processos/auxiliares',       autenticar, processosCtrl.buscarAuxiliares);
router.get('/processos/pastas',           autenticar, verificarPermissao('processos','visualizar'), processosCtrl.listarPastas);
router.get('/processos/pastas/:id',       autenticar, verificarPermissao('processos','visualizar'), processosCtrl.buscarPasta);
router.post('/processos/pastas',          autenticar, verificarPermissao('processos','cadastrar'),  processosCtrl.criarPasta);
router.get('/processos/:id',              autenticar, verificarPermissao('processos','visualizar'), processosCtrl.buscarProcesso);
router.post('/processos',                 autenticar, verificarPermissao('processos','cadastrar'),  processosCtrl.criarProcesso);
router.put('/processos/:id',              autenticar, verificarPermissao('processos','alterar'),    processosCtrl.atualizarProcesso);

// ---- PRAZOS ----
router.get('/prazos/tipos',       autenticar, prazosCtrl.buscarTipos);
router.get('/prazos/hoje',        autenticar, prazosCtrl.vencemHoje);
router.get('/prazos',             autenticar, verificarPermissao('prazos','visualizar'), prazosCtrl.listar);
router.post('/prazos',            autenticar, verificarPermissao('prazos','cadastrar'),  prazosCtrl.criar);
router.put('/prazos/:id/status',  autenticar, prazosCtrl.mudarStatus);

// ---- TAREFAS ----
router.get('/tarefas',             autenticar, verificarPermissao('tarefas','visualizar'), tarefasCtrl.listar);
router.post('/tarefas',            autenticar, verificarPermissao('tarefas','cadastrar'),  tarefasCtrl.criar);
router.put('/tarefas/:id',         autenticar, verificarPermissao('tarefas','alterar'),    tarefasCtrl.atualizar);
router.put('/tarefas/:id/concluir',autenticar, tarefasCtrl.concluir);
router.put('/tarefas/:id/reabrir', autenticar, tarefasCtrl.reabrir);

// ---- AUDIÊNCIAS ----
router.get('/audiencias/tipos',          autenticar, audienciasCtrl.buscarTipos);
router.get('/audiencias',                autenticar, verificarPermissao('audiencias','visualizar'), audienciasCtrl.listar);
router.get('/audiencias/:id',            autenticar, verificarPermissao('audiencias','visualizar'), audienciasCtrl.buscar);
router.post('/audiencias',               autenticar, verificarPermissao('audiencias','cadastrar'),  audienciasCtrl.criar);
router.post('/audiencias/:id/ata',       autenticar, verificarPermissao('audiencias','alterar'),    audienciasCtrl.registrarAta);
router.put('/audiencias/:id/ata-impressa', autenticar, audienciasCtrl.marcarAtaImpressa);

// ---- FINANCEIRO ----
router.get('/financeiro/pasta/:pastaId',             autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.buscarContaCorrente);
router.post('/financeiro/pasta/:pastaId/lancamento', autenticar, verificarPermissao('financeiro','cadastrar'),  financeiroCtrl.lancar);
router.delete('/financeiro/lancamento/:id',          autenticar, verificarPermissao('financeiro','excluir'),    financeiroCtrl.excluirLancamento);
router.post('/financeiro/pasta/:pastaId/honorarios', autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.salvarHonorarios);
router.get('/financeiro/pasta/:pastaId/recibo',      autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.gerarRecibo);
router.get('/financeiro/relatorio',                  autenticar, apenasAdmin, financeiroCtrl.relatorio);

// ---- ANDAMENTO PROCESSUAL ----
router.get('/andamento/:processoId',    autenticar, verificarPermissao('processos','visualizar'), andamentoCtrl.listar);
router.post('/andamento/:processoId',   autenticar, verificarPermissao('processos','alterar'),    andamentoCtrl.criar);
router.put('/andamento/:id',            autenticar, verificarPermissao('processos','alterar'),    andamentoCtrl.editar);
router.delete('/andamento/:id',         autenticar, verificarPermissao('processos','excluir'),    andamentoCtrl.excluir);

// ---- DOCUMENTOS ----
router.get('/documentos/modelos',         autenticar, documentosCtrl.listarModelos);
router.get('/documentos/modelos/:id',     autenticar, documentosCtrl.buscarModelo);
router.post('/documentos/modelos',        autenticar, apenasAdmin, documentosCtrl.criarModelo);
router.put('/documentos/modelos/:id',     autenticar, apenasAdmin, documentosCtrl.atualizarModelo);
router.post('/documentos/gerar',          autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.gerar);

// ---- PERÍCIAS ----
router.get('/pericias/tipos',            autenticar, periciasCtrl.tipos);
router.get('/pericias',                  autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.listar);
router.get('/pericias/:id',              autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.buscar);
router.post('/pericias',                 autenticar, verificarPermissao('pericias','cadastrar'),  periciasCtrl.criar);
router.put('/pericias/:id',              autenticar, verificarPermissao('pericias','alterar'),    periciasCtrl.atualizar);
router.put('/pericias/:id/email-perito', autenticar, periciasCtrl.marcarEmailPerito);
router.put('/pericias/:id/comunicado',   autenticar, periciasCtrl.marcarComunicado);

// ---- PUBLICAÇÕES AASP ----
router.get('/publicacoes',                autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.listar);
router.post('/publicacoes/buscar-aasp',   autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.buscarNaAAsp);
router.put('/publicacoes/:id/tratar',     autenticar, verificarPermissao('publicacoes','alterar'),    publicacoesCtrl.marcarTratada);
router.delete('/publicacoes/:id',         autenticar, verificarPermissao('publicacoes','excluir'),    publicacoesCtrl.excluir);

// ---- CONFIGURAÇÕES (somente admin) ----
router.get('/configuracoes/escritorio',           autenticar, apenasAdmin, configuracaoCtrl.buscarEscritorio);
router.put('/configuracoes/escritorio',           autenticar, apenasAdmin, configuracaoCtrl.atualizarEscritorio);
router.put('/configuracoes/setup-concluido',      autenticar, apenasAdmin, configuracaoCtrl.marcarSetupConcluido);
router.get('/configuracoes/feriados',             autenticar, configuracaoCtrl.listarFeriados);
router.post('/configuracoes/feriados',            autenticar, apenasAdmin, configuracaoCtrl.criarFeriado);
router.delete('/configuracoes/feriados/:id',      autenticar, apenasAdmin, configuracaoCtrl.excluirFeriado);
router.get('/configuracoes/usuarios',             autenticar, apenasAdmin, configuracaoCtrl.listarUsuarios);
router.post('/configuracoes/usuarios',            autenticar, apenasAdmin, configuracaoCtrl.criarUsuario);
router.put('/configuracoes/usuarios/:id',         autenticar, apenasAdmin, configuracaoCtrl.atualizarUsuario);
router.get('/configuracoes/permissoes/:usuarioId', autenticar, apenasAdmin, configuracaoCtrl.buscarPermissoes);
router.put('/configuracoes/permissoes/:usuarioId', autenticar, apenasAdmin, configuracaoCtrl.salvarPermissoes);
router.get('/configuracoes/integracoes',          autenticar, apenasAdmin, configuracaoCtrl.buscarIntegracoes);
router.put('/configuracoes/integracoes/:modulo',  autenticar, apenasAdmin, configuracaoCtrl.salvarIntegracao);

module.exports = router;
