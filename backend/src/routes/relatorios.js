// ============================================================
// ROTAS DE RELATÓRIOS (montadas pelo routes/index.js)
// Visualizar: permissão "relatorios". Criar/alterar/excluir os próprios: "relatorios.criar > cadastrar".
// Limites: só administrador.
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { autenticar, apenasAdmin } = require('../middleware/auth');
const { verificarPermissao } = require('../middleware/permissoes');
const ctrl = require('../controllers/relatoriosController');

const ver = verificarPermissao('relatorios', 'visualizar');
const criar = verificarPermissao('relatorios', 'criar', 'cadastrar');

// Exportar é pesado: no máximo 10 por minuto por usuário
const limitarExportacao = rateLimit({
  windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.usuario?.id || req.ip),
  message: { ok: false, mensagem: 'Muitas exportações seguidas. Aguarde um minuto e tente de novo.' },
});

router.get('/relatorios/catalogo',                      autenticar, ver, ctrl.catalogo);
router.get('/relatorios/modelos',                       autenticar, ver, ctrl.listarModelos);
router.post('/relatorios/modelos',                      autenticar, criar, ctrl.criarModelo);
router.put('/relatorios/modelos/:id',                   autenticar, criar, ctrl.atualizarModelo);
router.delete('/relatorios/modelos/:id',                autenticar, criar, ctrl.excluirModelo);
router.post('/relatorios/modelos/:id/duplicar',         autenticar, criar, ctrl.duplicarModelo);
router.put('/relatorios/modelos/:id/preferencias',      autenticar, ver, ctrl.salvarPreferencias);
router.post('/relatorios/executar',                     autenticar, ver, ctrl.executar);
router.post('/relatorios/exportar',                     autenticar, ver, limitarExportacao, ctrl.exportar);
router.get('/relatorios/limites',                       autenticar, apenasAdmin, ctrl.obterLimites);
router.put('/relatorios/limites',                       autenticar, apenasAdmin, ctrl.salvarLimites);

module.exports = router;
