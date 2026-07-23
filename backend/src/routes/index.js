// ============================================================
// ROTEADOR PRINCIPAL — Registra todas as rotas da API
// ============================================================

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const { autenticar, apenasAdmin, apenasSuper } = require('../middleware/auth');
const { verificarPermissao } = require('../middleware/permissoes');

// Proteção contra força bruta SÓ no login — chaveada pelo NOME DE USUÁRIO (não por IP),
// para não bloquear um escritório inteiro que compartilha o mesmo IP (NAT).
// skipSuccessfulRequests: logins corretos NÃO consomem o limite — só tentativas que falham.
// Resultado: após 10 falhas no MESMO login em 15 min, aquele usuário é barrado; os demais
// (e logins corretos) seguem normais, mesmo no mesmo IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.login || req.ip || '').toLowerCase().trim(),
  message: { ok: false, mensagem: 'Muitas tentativas de login para este usuário. Aguarde alguns minutos e tente novamente.' },
});

// Controllers
const authCtrl          = require('../controllers/authController');
const pessoasCtrl       = require('../controllers/pessoasController');
const processosCtrl     = require('../controllers/processosController');
const prazosCtrl        = require('../controllers/prazosController');
const tarefasCtrl       = require('../controllers/tarefasController');
const audienciasCtrl    = require('../controllers/audienciasController');
const financeiroCtrl    = require('../controllers/financeiroController');
const formaPagamentoCtrl = require('../controllers/formaPagamentoController');
const andamentoCtrl     = require('../controllers/andamentoController');
const documentosCtrl    = require('../controllers/documentosController');
const publicacoesCtrl   = require('../controllers/publicacoesController');
const configuracaoCtrl  = require('../controllers/configuracaoController');
const dashboardCtrl     = require('../controllers/dashboardController');
const periciasCtrl      = require('../controllers/periciasController');
const agendaCompromissoCtrl = require('../controllers/agendaCompromissoController');
const notificacoesCtrl  = require('../controllers/notificacoesController');
const manutencaoCtrl    = require('../controllers/manutencaoController');

// ---- PÚBLICO (sem autenticação) ----
router.get('/public/info',              configuracaoCtrl.infoPublica);

// ---- AUTENTICAÇÃO (rotas públicas) ----
router.post('/auth/login',              loginLimiter, authCtrl.login);
router.post('/auth/criar-admin',        authCtrl.criarPrimeiroAdmin);
router.get('/auth/verificar',           autenticar, authCtrl.verificarToken);
// Redefinição de senha via e-mail (rotas públicas — sem autenticação)
router.post('/auth/esqueci-senha',      authCtrl.esqueciSenha);
router.get('/auth/validar-token/:token',authCtrl.validarToken);
router.post('/auth/redefinir-senha',    authCtrl.redefinirSenha);
router.put('/auth/trocar-senha',        autenticar, authCtrl.trocarSenha);
router.post('/auth/verificar-senha',   autenticar, authCtrl.verificarSenha);
router.get('/calendario/dia-util',     autenticar, configuracaoCtrl.verificarDiaUtil);

// --- AGENDA: compromissos pessoais/avulsos (cada usuário gerencia os seus) ---
router.get('/agenda/compromissos',        autenticar, agendaCompromissoCtrl.listar);
router.post('/agenda/compromissos',       autenticar, agendaCompromissoCtrl.criar);
router.put('/agenda/compromissos/:id',    autenticar, agendaCompromissoCtrl.atualizar);
router.delete('/agenda/compromissos/:id', autenticar, agendaCompromissoCtrl.excluir);

// ---- DASHBOARD ----
router.get('/dashboard', autenticar, dashboardCtrl.buscarDados);

// ---- PESSOAS ----
// Aniversariantes (clientes PF) — rotas estáticas ANTES das de /:id.
router.get('/pessoas/aniversariantes',         autenticar, verificarPermissao('relatorios','visualizar'), pessoasCtrl.listarAniversariantes);
router.post('/pessoas/:id/parabens',           autenticar, pessoasCtrl.registrarParabens);
router.get('/pessoas/auxiliares',              autenticar, pessoasCtrl.buscarAuxiliares);
// Cadastra novo item em tabela auxiliar (generos, estados_civis, profissoes)
router.post('/pessoas/auxiliares/:tipo',       autenticar, verificarPermissao('pessoas','cadastrar'), pessoasCtrl.criarAuxiliar);
router.get('/pessoas/fisicas',            autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.listarFisicas);
// IMPORTANTE: /exportar e /cpf/:cpf devem ficar ANTES de /:id para o Express não capturar a palavra como id
router.get('/pessoas/fisicas/exportar',   autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.exportarFisicas);
router.get('/pessoas/fisicas/cpf/:cpf',   autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.buscarPorCPF);
// Unifica cadastros duplicados de pessoa física (rota estática ANTES de :id) — SOMENTE admin e superadmin
router.post('/pessoas/fisicas/unificar',  autenticar, apenasAdmin,                                 pessoasCtrl.unificarFisicas);
router.get('/pessoas/fisicas/:id',        autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.buscarFisica);
router.post('/pessoas/fisicas',           autenticar, verificarPermissao('pessoas','cadastrar'),  pessoasCtrl.criarFisica);
router.put('/pessoas/fisicas/:id',        autenticar, verificarPermissao('pessoas','alterar'),    pessoasCtrl.atualizarFisica);
router.delete('/pessoas/fisicas/:id',     autenticar, verificarPermissao('pessoas','excluir'),    pessoasCtrl.excluirFisica);
router.post('/pessoas/fisicas/:id/historico', autenticar, pessoasCtrl.adicionarHistorico);
router.get('/pessoas/juridicas',          autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.listarJuridicas);
router.get('/pessoas/juridicas/exportar', autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.exportarJuridicas);
// Busca 1 empresa com telefones/e-mails (edição) — DEPOIS de /exportar para não capturar a palavra como id
router.get('/pessoas/juridicas/:id',      autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.buscarJuridica);
router.post('/pessoas/juridicas',         autenticar, verificarPermissao('pessoas','cadastrar'),  pessoasCtrl.criarJuridica);
// Unifica cadastros duplicados de empresa (rota estática ANTES de /:id) — SOMENTE admin e superadmin
router.post('/pessoas/juridicas/unificar',autenticar, apenasAdmin,                                 pessoasCtrl.unificarJuridicas);
router.put('/pessoas/juridicas/:id',      autenticar, verificarPermissao('pessoas','alterar'),    pessoasCtrl.atualizarJuridica);
router.delete('/pessoas/juridicas/:id',   autenticar, verificarPermissao('pessoas','excluir'),    pessoasCtrl.excluirJuridica);
// Lista os processos de uma pessoa (:tipo = 'fisicas' | 'juridicas') — ao clicar na "Qtde Proc"
router.get('/pessoas/:tipo/:id/processos', autenticar, verificarPermissao('pessoas','visualizar'), pessoasCtrl.processosDaPessoa);

// ---- PROCESSOS E PASTAS ----
// ATENÇÃO: rotas estáticas (sugerir-pasta, auxiliares, pastas) ANTES de /:id
router.get('/processos/buscar',                     autenticar, processosCtrl.buscarProcessosPorNumero);
router.get('/processos/sugerir-pasta',              autenticar, processosCtrl.sugerirNumeroPasta);
router.get('/processos/pastas/checar',              autenticar, processosCtrl.checarPasta);
router.get('/processos/auxiliares',                 autenticar, processosCtrl.buscarAuxiliares);
// Auxiliares — CRUD completo, permissão por ação (não mais só admin)
router.post('/processos/auxiliares/foruns',          autenticar, verificarPermissao('processos','cadastrar'), processosCtrl.criarForum);
router.put('/processos/auxiliares/foruns/:id',       autenticar, verificarPermissao('processos','alterar'),   processosCtrl.atualizarForum);
router.delete('/processos/auxiliares/foruns/:id',    autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirForum);
router.post('/processos/auxiliares/varas',           autenticar, verificarPermissao('processos','cadastrar'), processosCtrl.criarVara);
router.put('/processos/auxiliares/varas/:id',        autenticar, verificarPermissao('processos','alterar'),   processosCtrl.atualizarVara);
router.delete('/processos/auxiliares/varas/:id',     autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirVara);
router.post('/processos/auxiliares/tipos',           autenticar, verificarPermissao('processos','cadastrar'), processosCtrl.criarTipo);
router.put('/processos/auxiliares/tipos/:id',        autenticar, verificarPermissao('processos','alterar'),   processosCtrl.atualizarTipo);
router.delete('/processos/auxiliares/tipos/:id',     autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirTipo);
router.post('/processos/auxiliares/status',          autenticar, verificarPermissao('processos','cadastrar'), processosCtrl.criarStatusProc);
router.put('/processos/auxiliares/status/:id',       autenticar, verificarPermissao('processos','alterar'),   processosCtrl.atualizarStatusProc);
router.delete('/processos/auxiliares/status/:id',    autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirStatusProc);
router.post('/processos/auxiliares/instancias',      autenticar, verificarPermissao('processos','cadastrar'), processosCtrl.criarInstancia);
router.put('/processos/auxiliares/instancias/:id',   autenticar, verificarPermissao('processos','alterar'),   processosCtrl.atualizarInstancia);
router.delete('/processos/auxiliares/instancias/:id',autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirInstancia);
router.get('/processos/pastas',                     autenticar, verificarPermissao('processos','visualizar'), processosCtrl.listarPastas);
router.put('/processos/pastas/:id/renumerar',       autenticar, verificarPermissao('pastas','alterar'),      processosCtrl.renumerarPasta);
router.get('/processos/pastas/:id',                 autenticar, verificarPermissao('processos','visualizar'), processosCtrl.buscarPasta);
router.post('/processos',                           autenticar, verificarPermissao('processos','cadastrar'),  processosCtrl.criarProcesso);
router.put('/processos/:id',                        autenticar, verificarPermissao('processos','alterar'),    processosCtrl.atualizarProcesso);
router.delete('/processos/:id',                     autenticar, verificarPermissao('processos','excluir'),    processosCtrl.excluirProcesso);

// ---- PRAZOS ----
router.get('/prazos/tipos',       autenticar, prazosCtrl.buscarTipos);
// Cadastro de novo tipo/subtipo direto na tela (botão "…") — rotas estáticas ANTES de /prazos/:id
router.post('/prazos/tipos',      autenticar, verificarPermissao('prazos','cadastrar'), prazosCtrl.criarTipo);
router.post('/prazos/subtipos',   autenticar, verificarPermissao('prazos','cadastrar'), prazosCtrl.criarSubtipo);
router.get('/prazos/calcular',      autenticar, prazosCtrl.calcularDataFinal);
router.get('/prazos/calcular-dias', autenticar, prazosCtrl.calcularDias);
router.get('/prazos/hoje',        autenticar, prazosCtrl.vencemHoje);
// Lista de usuários para o filtro "Responsável" — só quem pode ver prazos de todos (admin passa automático)
router.get('/prazos/usuarios',    autenticar, verificarPermissao('prazos','ver_todos','visualizar'), prazosCtrl.listarUsuariosFiltro);
router.get('/prazos',             autenticar, verificarPermissao('prazos','visualizar'), prazosCtrl.listar);
router.post('/prazos',            autenticar, verificarPermissao('prazos','cadastrar'),  prazosCtrl.criar);
router.put('/prazos/:id/status',          autenticar, prazosCtrl.mudarStatus);
router.put('/prazos/:id/fazendo',         autenticar, prazosCtrl.marcarFazendo);
router.put('/prazos/:id/liberar-fazendo', autenticar, prazosCtrl.liberarFazendo);
// ATENÇÃO: rota estática /historico ANTES de /:id para o Express não capturar "historico" como id
router.get('/prazos/:id/historico',       autenticar, verificarPermissao('prazos','historico'), prazosCtrl.buscarHistorico);
router.put('/prazos/:id',                 autenticar, verificarPermissao('prazos','alterar'), prazosCtrl.editar);
router.delete('/prazos/:id',              autenticar, verificarPermissao('prazos','excluir'), prazosCtrl.excluir);

// ---- NOTIFICAÇÕES ----
router.get('/notificacoes/contagem',     autenticar, notificacoesCtrl.contagem);
router.get('/notificacoes',              autenticar, notificacoesCtrl.listar);
router.put('/notificacoes/marcar-lidas', autenticar, notificacoesCtrl.marcarLidas);

// ---- TAREFAS ----
router.get('/tarefas',             autenticar, verificarPermissao('tarefas','visualizar'), tarefasCtrl.listar);
router.post('/tarefas',            autenticar, verificarPermissao('tarefas','cadastrar'),  tarefasCtrl.criar);
router.put('/tarefas/:id',         autenticar, verificarPermissao('tarefas','alterar'),    tarefasCtrl.atualizar);
router.put('/tarefas/:id/concluir',autenticar, tarefasCtrl.concluir);
router.put('/tarefas/:id/reabrir', autenticar, tarefasCtrl.reabrir);
router.delete('/tarefas/:id',      autenticar, verificarPermissao('tarefas','excluir'),    tarefasCtrl.excluir);
router.get('/tarefas/:id/historico', autenticar, verificarPermissao('tarefas','historico'), tarefasCtrl.buscarHistorico);

// ---- AUDIÊNCIAS ----
router.get('/audiencias/advogados',          autenticar, audienciasCtrl.listarAdvogados);
// Partes do processo — rota estática ANTES de /:id para não conflitar
router.get('/audiencias/partes-processo',    autenticar, audienciasCtrl.buscarPartesProcesso);
// Tipos de audiência (rotas estáticas ANTES de /:id)
router.get('/audiencias/tipos',              autenticar, audienciasCtrl.buscarTipos);
router.post('/audiencias/tipos',             autenticar, verificarPermissao('audiencias','tipos','cadastrar'), audienciasCtrl.criarTipo);
router.put('/audiencias/tipos/:id',          autenticar, verificarPermissao('audiencias','tipos','alterar'),   audienciasCtrl.atualizarTipo);
router.delete('/audiencias/tipos/:id',       autenticar, verificarPermissao('audiencias','tipos','excluir'),   audienciasCtrl.excluirTipo);
// Freelancers
router.get('/audiencias/freelas',            autenticar, audienciasCtrl.listarFreelas);
router.post('/audiencias/freelas',           autenticar, verificarPermissao('audiencias','cadastrar'), audienciasCtrl.criarFreela);
router.put('/audiencias/freelas/:id',        autenticar, verificarPermissao('audiencias','alterar'),   audienciasCtrl.atualizarFreela);
router.delete('/audiencias/freelas/:id',     autenticar, verificarPermissao('audiencias','excluir'),   audienciasCtrl.excluirFreela);
// Audiências
router.get('/audiencias',                    autenticar, verificarPermissao('audiencias','visualizar'), audienciasCtrl.listar);
router.get('/audiencias/:id',                autenticar, verificarPermissao('audiencias','visualizar'), audienciasCtrl.buscar);
router.get('/audiencias/:id/historico',      autenticar, verificarPermissao('audiencias','visualizar'), audienciasCtrl.buscarHistorico);
router.post('/audiencias',                   autenticar, verificarPermissao('audiencias','cadastrar'),  audienciasCtrl.criar);
router.put('/audiencias/:id',                autenticar, verificarPermissao('audiencias','alterar'),    audienciasCtrl.atualizar);
router.delete('/audiencias/:id',             autenticar, verificarPermissao('audiencias','excluir'),    audienciasCtrl.excluir);
router.put('/audiencias/:id/cancelar',       autenticar, verificarPermissao('audiencias','alterar'),    audienciasCtrl.cancelar);
router.put('/audiencias/:id/remarcar',       autenticar, verificarPermissao('audiencias','alterar'),    audienciasCtrl.remarcar);
router.post('/audiencias/:id/ata',              autenticar, verificarPermissao('audiencias','alterar'),    audienciasCtrl.registrarAta);
router.put('/audiencias/:id/ata-impressa',      autenticar, audienciasCtrl.marcarAtaImpressa);
// Testemunhas — CRUD individual
router.post('/audiencias/:id/testemunhas',             autenticar, verificarPermissao('audiencias','alterar'), audienciasCtrl.adicionarTestemunha);
router.put('/audiencias/:id/testemunhas/:testId',      autenticar, verificarPermissao('audiencias','alterar'), audienciasCtrl.editarTestemunha);
router.delete('/audiencias/:id/testemunhas/:testId',   autenticar, verificarPermissao('audiencias','alterar'), audienciasCtrl.excluirTestemunha);

// ---- FINANCEIRO ----
// Conta corrente (por processo)
router.get('/financeiro/processo/:processoId',             autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.buscarContaCorrente);
router.post('/financeiro/processo/:processoId/lancamento', autenticar, verificarPermissao('financeiro','cadastrar'),  financeiroCtrl.lancar);
router.put('/financeiro/lancamento/:id',                   autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.editarLancamento);
router.get('/financeiro/lancamento/:id/historico',         autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.buscarHistoricoLancamento);
router.delete('/financeiro/lancamento/:id',                autenticar, verificarPermissao('financeiro','excluir'),    financeiroCtrl.excluirLancamento);
// Acordo + parcelas (previa ANTES de /acordo/:id para não casar :id='previa')
router.get('/financeiro/processo/:processoId/acordos',     autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.listarAcordos);
router.post('/financeiro/acordo/previa',                   autenticar, verificarPermissao('financeiro','cadastrar'),  financeiroCtrl.gerarPreviaParcelas);
router.post('/financeiro/processo/:processoId/acordo',     autenticar, verificarPermissao('financeiro','cadastrar'),  financeiroCtrl.criarAcordo);
router.get('/financeiro/acordo/:id',                       autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.buscarAcordo);
router.put('/financeiro/acordo/:id',                       autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.atualizarAcordo);
router.delete('/financeiro/acordo/:id',                    autenticar, verificarPermissao('financeiro','excluir'),    financeiroCtrl.excluirAcordo);
router.put('/financeiro/acordo/:id/cancelar',              autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.cancelarAcordo);
// Baixa (recebimento de parcela)
router.put('/financeiro/parcela/:id/pagar',                autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.pagarParcela);
router.put('/financeiro/parcela/:id/desfazer',             autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.desfazerPagamento);
// Repasses ao cliente/parceiro (2º tempo) + worklist global de repasses pendentes
router.get('/financeiro/repasses-pendentes',               autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.listarRepassesPendentes);
router.get('/financeiro/repasses-concluidos',              autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.listarRepassesConcluidos);
// Consulta / relatório do financeiro (busca por múltiplos filtros + exportação Excel)
router.get('/financeiro/consulta',                         autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.consultarFinanceiro);
router.get('/financeiro/consulta/exportar',                autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.exportarConsultaFinanceiro);
router.put('/financeiro/parcela/:id/repasse',              autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.registrarRepasse);
router.put('/financeiro/parcela/:id/repasse/desfazer',     autenticar, verificarPermissao('financeiro','alterar'),    financeiroCtrl.desfazerRepasse);
router.get('/financeiro/parcela/:id/historico',            autenticar, verificarPermissao('financeiro','visualizar'), financeiroCtrl.buscarHistoricoParcela);

// Formas de pagamento — cadastro no menu Controle (admin); a lista também alimenta o select do recebimento
router.get('/financeiro/formas-pagamento',        autenticar, verificarPermissao('financeiro','visualizar'), formaPagamentoCtrl.listar);
router.post('/financeiro/formas-pagamento',       autenticar, verificarPermissao('financeiro','cadastrar'),  formaPagamentoCtrl.criar);
router.put('/financeiro/formas-pagamento/:id',    autenticar, verificarPermissao('financeiro','alterar'),    formaPagamentoCtrl.atualizar);
router.delete('/financeiro/formas-pagamento/:id', autenticar, verificarPermissao('financeiro','excluir'),    formaPagamentoCtrl.excluir);

// ---- ANDAMENTO PROCESSUAL ----
// Usa sub-módulo 'andamentos' — permissão granular independente do módulo 'processos'
router.get('/andamento/:processoId',    autenticar, verificarPermissao('processos','andamentos','visualizar'), andamentoCtrl.listar);
router.post('/andamento/:processoId',   autenticar, verificarPermissao('processos','andamentos','cadastrar'),  andamentoCtrl.criar);
router.put('/andamento/:id',            autenticar, verificarPermissao('processos','andamentos','alterar'),    andamentoCtrl.editar);
router.delete('/andamento/:id',         autenticar, verificarPermissao('processos','andamentos','excluir'),    andamentoCtrl.excluir);

// ---- DOCUMENTOS ----
// Catálogo de variáveis disponíveis nos modelos (referência ao montar o .docx)
router.get('/documentos/variaveis',            autenticar, documentosCtrl.catalogoVariaveis);
// Catálogo das variáveis POR PESSOA (modelos "Documento de partes")
router.get('/documentos/variaveis-partes',     autenticar, documentosCtrl.catalogoVariaveisPartes);
// Opções de "destino" do modelo (tipos de audiência/perícia, subtipos de prazo, modalidades)
router.get('/documentos/destinos-opcoes',      autenticar, verificarPermissao('documentos','modelos','visualizar'), documentosCtrl.destinosOpcoes);
// Geração de documentos (permissão 'documentos/cadastrar')
router.get('/documentos/modelos-gerar',        autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.modelosParaGerar);
router.post('/documentos/gerar',               autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.gerar);
// Geração de "Documento de partes" (vários autores × réus; sem âncora de registro)
router.post('/documentos/gerar-multipessoas',  autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.gerarMultipessoas);
// Geração em LOTE (audiências/perícias): preparar (agrupa por tipo + modelos) e gerar (ZIP)
router.post('/documentos/lote/preparar',       autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.prepararLote);
router.post('/documentos/lote/gerar',          autenticar, verificarPermissao('documentos','cadastrar'), documentosCtrl.gerarLote);
// Histórico de documentos gerados (permissão 'documentos/historico')
router.get('/documentos/historico',            autenticar, verificarPermissao('documentos','historico'), documentosCtrl.historicoDocumentos);
// Modelos (gestão) — submódulo de permissão 'documentos/modelos'
router.get('/documentos/modelos',              autenticar, verificarPermissao('documentos','modelos','visualizar'), documentosCtrl.listarModelos);
router.get('/documentos/modelos/:id',          autenticar, verificarPermissao('documentos','modelos','visualizar'), documentosCtrl.buscarModelo);
router.get('/documentos/modelos/:id/arquivo',  autenticar, verificarPermissao('documentos','modelos','visualizar'), documentosCtrl.baixarModelo);
router.post('/documentos/modelos',             autenticar, verificarPermissao('documentos','modelos','cadastrar'), documentosCtrl.uploadModelo, documentosCtrl.criarModelo);
router.put('/documentos/modelos/:id',          autenticar, verificarPermissao('documentos','modelos','alterar'),   documentosCtrl.uploadModelo, documentosCtrl.atualizarModelo);
router.put('/documentos/modelos/:id/desativar',autenticar, verificarPermissao('documentos','modelos','excluir'),   documentosCtrl.desativarModelo);
router.put('/documentos/modelos/:id/reativar', autenticar, verificarPermissao('documentos','modelos','alterar'),   documentosCtrl.reativarModelo);
// Exclusão DEFINITIVA do modelo (apaga do banco + arquivo do S3) — mesma permissão do "Desativar"
router.delete('/documentos/modelos/:id',       autenticar, verificarPermissao('documentos','modelos','excluir'),   documentosCtrl.excluirModelo);

// ---- PERÍCIAS ----
router.get('/pericias/tipos',             autenticar, periciasCtrl.tipos);
// CRUD de tipos de perícia (botão "..." no modal) — submódulo de permissão 'pericias/tipos'
router.post('/pericias/tipos',            autenticar, verificarPermissao('pericias','tipos','cadastrar'), periciasCtrl.criarTipo);
router.put('/pericias/tipos/:id',         autenticar, verificarPermissao('pericias','tipos','alterar'),   periciasCtrl.atualizarTipo);
router.delete('/pericias/tipos/:id',      autenticar, verificarPermissao('pericias','tipos','excluir'),   periciasCtrl.excluirTipo);
router.get('/pericias/peritos-processo',  autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.peritosDoProcesso);
router.get('/pericias',                   autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.listar);
router.get('/pericias/:id',               autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.buscar);
router.get('/pericias/:id/historico',     autenticar, verificarPermissao('pericias','visualizar'), periciasCtrl.buscarHistorico);
router.post('/pericias',                  autenticar, verificarPermissao('pericias','cadastrar'),  periciasCtrl.criar);
router.put('/pericias/:id',               autenticar, verificarPermissao('pericias','alterar'),    periciasCtrl.atualizar);
router.put('/pericias/:id/realizada',     autenticar, verificarPermissao('pericias','alterar'),    periciasCtrl.marcarRealizada);
router.put('/pericias/:id/cancelar',      autenticar, verificarPermissao('pericias','alterar'),    periciasCtrl.cancelar);
router.put('/pericias/:id/remarcar',      autenticar, verificarPermissao('pericias','alterar'),    periciasCtrl.remarcar);
router.post('/pericias/:id/comunicado',   autenticar, verificarPermissao('pericias','alterar'), periciasCtrl.enviarComunicado);
router.delete('/pericias/:id',            autenticar, verificarPermissao('pericias','excluir'),     periciasCtrl.excluir);

// ---- PUBLICAÇÕES (fonte atual: AASP) ----
// Rotas estáticas antes das com :id.
router.get('/publicacoes/aasp/status',    autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.statusAasp);
router.get('/publicacoes/cnj/status',     autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.statusCnj);
router.post('/publicacoes/cnj/importar',  autenticar, verificarPermissao('publicacoes','cadastrar'),  publicacoesCtrl.importarCnj);
router.get('/publicacoes/usuarios',       autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.usuariosParaDirecionar);
router.get('/publicacoes',                autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.listar);
router.get('/publicacoes/:id/historico',  autenticar, verificarPermissao('publicacoes','visualizar'), publicacoesCtrl.historico);
router.post('/publicacoes/importar',      autenticar, verificarPermissao('publicacoes','cadastrar'),  publicacoesCtrl.importar);
router.put('/publicacoes/:id/direcionar', autenticar, verificarPermissao('publicacoes','alterar'),    publicacoesCtrl.direcionar);
router.put('/publicacoes/:id/tratar',     autenticar, verificarPermissao('publicacoes','alterar'),    publicacoesCtrl.tratar);
router.post('/publicacoes/excluir-lote',  autenticar, verificarPermissao('publicacoes','excluir'),    publicacoesCtrl.excluirLote);
router.delete('/publicacoes/:id',         autenticar, verificarPermissao('publicacoes','excluir'),    publicacoesCtrl.excluir);

// ---- CONFIGURAÇÕES (somente admin) ----
router.get('/configuracoes/escritorio',           autenticar, apenasAdmin, configuracaoCtrl.buscarEscritorio);
router.put('/configuracoes/escritorio',           autenticar, apenasAdmin, configuracaoCtrl.atualizarEscritorio);
// Liga/desliga da CAIXA ALTA no nome do autor/réu nos documentos (somente admin)
router.get('/configuracoes/documentos-maiusculas', autenticar, apenasAdmin, configuracaoCtrl.buscarDocumentosMaiusculas);
router.put('/configuracoes/documentos-maiusculas', autenticar, apenasAdmin, configuracaoCtrl.salvarDocumentosMaiusculas);
router.post('/configuracoes/logo',                autenticar, apenasAdmin, configuracaoCtrl.uploadLogo, configuracaoCtrl.salvarLogo);
router.delete('/configuracoes/logo',              autenticar, apenasAdmin, configuracaoCtrl.removerLogo);
router.put('/configuracoes/setup-concluido',      autenticar, apenasAdmin, configuracaoCtrl.marcarSetupConcluido);
router.get('/configuracoes/feriados',             autenticar, configuracaoCtrl.listarFeriados);
router.post('/configuracoes/feriados',            autenticar, apenasAdmin, configuracaoCtrl.criarFeriado);
router.delete('/configuracoes/feriados/:id',      autenticar, apenasAdmin, configuracaoCtrl.excluirFeriado);
router.get('/configuracoes/usuarios',             autenticar, apenasAdmin, configuracaoCtrl.listarUsuarios);
router.post('/configuracoes/usuarios',            autenticar, apenasAdmin, configuracaoCtrl.criarUsuario);
router.put('/configuracoes/usuarios/:id',         autenticar, apenasAdmin, configuracaoCtrl.atualizarUsuario);
router.put('/configuracoes/usuarios/:id/senha',      autenticar, apenasAdmin, configuracaoCtrl.redefinirSenhaAdmin);
router.delete('/configuracoes/usuarios/:id',         autenticar, apenasAdmin, configuracaoCtrl.excluirUsuario);
router.get('/configuracoes/usuarios/:id/historico',  autenticar, apenasAdmin, configuracaoCtrl.historicoUsuario);
router.get('/configuracoes/permissoes/:usuarioId', autenticar, apenasAdmin, configuracaoCtrl.buscarPermissoes);
router.put('/configuracoes/permissoes/:usuarioId', autenticar, apenasAdmin, configuracaoCtrl.salvarPermissoes);
router.get('/configuracoes/integracoes',          autenticar, apenasAdmin, configuracaoCtrl.buscarIntegracoes);
router.put('/configuracoes/integracoes/:modulo',  autenticar, apenasAdmin, configuracaoCtrl.salvarIntegracao);
router.get('/configuracoes/servidor-hora',        autenticar, apenasAdmin, configuracaoCtrl.horaServidor);

// ---- MANUTENÇÃO (somente SUPERUSUÁRIO, nivel 0) ----
router.post('/manutencao/limpar-dados-teste',     autenticar, apenasSuper, manutencaoCtrl.limparDadosTeste);

module.exports = router;
