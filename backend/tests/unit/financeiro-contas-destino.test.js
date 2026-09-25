const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '../../..');
const controller = fs.readFileSync(path.join(raiz, 'backend/src/controllers/financeiroController.js'), 'utf8');
const pessoas = fs.readFileSync(path.join(raiz, 'backend/src/controllers/pessoasController.js'), 'utf8');
const formasController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/formaPagamentoController.js'), 'utf8');
const financeiroFront = fs.readFileSync(path.join(raiz, 'frontend/src/pages/Financeiro/Financeiro.js'), 'utf8');
const instituicoesFront = fs.readFileSync(path.join(raiz, 'frontend/src/pages/Controle/InstituicoesFinanceiras.js'), 'utf8');
const linhaContaFront = fs.readFileSync(path.join(raiz, 'frontend/src/components/LinhaContaBancaria.js'), 'utf8');
const documentosController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/documentosController.js'), 'utf8');
const variaveisDocumento = fs.readFileSync(path.join(raiz, 'backend/src/services/variaveisResolver.js'), 'utf8');
const sql = fs.readFileSync(path.join(raiz, 'scripts/S4 - 2026-09-18_destinos_financeiros_robustos.sql'), 'utf8');
const preflight = fs.readFileSync(path.join(raiz, 'scripts/S4 - 2026-09-18_verificar_pre-requisitos.sql'), 'utf8');

test('financeiro exige e registra conta do escritório e snapshot imutável no destino', () => {
  assert.match(controller, /resolverContaEscritorio\(conn, recebimento_conta_financeira_id\)/);
  assert.match(controller, /repasse_cliente_destino_snapshot/);
  assert.match(controller, /FOR UPDATE/);
  assert.match(controller, /listarBeneficiariosProcesso/);
});

test('desfazer recebimento limpa todos os dados do recebimento, inclusive a conta do escritório', () => {
  const inicio = controller.indexOf('async function desfazerPagamento');
  const fim = controller.indexOf('// GET /api/financeiro/parcela/:id/historico', inicio);
  const trecho = controller.slice(inicio, fim);
  assert.match(trecho, /recebimento_conta_financeira_id = NULL/);
});

test('edição de pessoa preserva a conta e inativa a retirada da ficha', () => {
  assert.doesNotMatch(pessoas, /DELETE FROM \$\{tabela\} WHERE pessoa_id/);
  assert.match(pessoas, /WHERE id=\? AND pessoa_id=\?/);
  assert.match(pessoas, /SET ativo=0, principal=0/);
  assert.match(pessoas, /observacao/);
});

test('migração S4 é aditiva, portátil e exige verificação prévia', () => {
  assert.match(sql, /ADD COLUMN observacao TEXT NULL/);
  assert.doesNotMatch(sql, /IF NOT EXISTS/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
  assert.match(sql, /repasse_cliente_destino_snapshot/);
  assert.match(sql, /LONGTEXT NULL/);
  assert.match(preflight, /APROVADO/);
  assert.match(preflight, /BLOQUEADO/);
});

test('caixa físico não mantém dados bancários e o último caixa ativo é protegido', () => {
  assert.match(controller, /const dadosBancarios = tipoConta === 'bancaria'/);
  assert.match(controller, /\[null, null, null, null\]/);
  assert.match(controller, /O escritório precisa manter ao menos um caixa físico ativo/);
  assert.match(controller, /O caixa físico do escritório não pode ser desativado/);
  assert.match(controller, /FOR UPDATE/);
});

test('forma é compatível com conta financeira ou espécie no backend e na tela', () => {
  assert.match(controller, /async function resolverFormaPagamento/);
  assert.match(controller, /uso_permitido !== 'ambos'/);
  assert.match(controller, /resolverFormaPagamento\(conn, formaId, contaEscritorio.tipo\)/);
  assert.match(formasController, /uso_permitido/);
  assert.match(financeiroFront, /formasCompativeis/);
  assert.match(financeiroFront, /Conta ou caixa de recebimento/);
  assert.match(financeiroFront, /Forma de recebimento/);
});

test('dígito bancário é limitado a quatro caracteres e pede confirmação acima de dois', () => {
  assert.match(controller, /function normalizarDigitoConta/);
  assert.match(controller, /digito\.length > 4/);
  assert.match(pessoas, /digito\.length > 4/);
  assert.match(instituicoesFront, /maxLength=\{4\}/);
  assert.match(linhaContaFront, /maxLength=\{4\}/);
  assert.match(instituicoesFront, /Confirmar dígito da conta/);
  assert.match(instituicoesFront, /digitoConfirmado = false/);
});

test('parcela recebida fica imutável, sem bloquear a edição das pendentes do acordo', () => {
  assert.match(controller, /SELECT \* FROM acordo_parcela WHERE acordo_id = \? FOR UPDATE/);
  assert.match(controller, /A parcela \$\{ex\.numero\} já foi recebida e não pode ser alterada/);
  assert.match(controller, /if \(ex\.status === 'pago'\) continue/);
  assert.match(financeiroFront, /const temParcelasRecebidas = parcelas\.some\(p => p\.status === 'pago'\)/);
  assert.match(financeiroFront, /disabled=\{parcelaRecebida\}/);
  assert.match(financeiroFront, /disabled=\{gerando \|\| temParcelasRecebidas\}/);
});

test('ciclo financeiro registra o bruto ao receber e as saídas somente nos repasses efetivos', () => {
  assert.match(controller, /const ORIGEM_RECEBIMENTO = 'recebimento'/);
  assert.match(controller, /const ORIGEM_REPASSE_CLIENTE = 'rep_cliente'/);
  assert.match(controller, /const ORIGEM_REPASSE_PARCEIRO = 'rep_parceiro'/);
  assert.match(controller, /descRecebimento/);
  assert.match(controller, /tipo, valor, origem, usuario_id, conta_financeira_id\)\n       VALUES \(\?, \?, \?, \?, 'saida'/);
  assert.match(controller, /DELETE FROM conta_corrente WHERE parcela_id=\? AND origem=\?/);
  assert.match(financeiroFront, /Falta repassar ao cliente/);
  assert.match(financeiroFront, /Falta repassar ao parceiro/);
});

test('repasse preserva observação independente por destinatário e atualiza o extrato em tela', () => {
  assert.match(controller, /repasse_cliente_observacao/);
  assert.match(controller, /repasse_parceiro_observacao/);
  assert.match(controller, /A observação do repasse pode ter no máximo 1\.000 caracteres/);
  assert.match(controller, /\$\{cfg\.observacao\}=NULL/);
  assert.match(financeiroFront, /Observação do repasse \(opcional\)/);
  assert.match(financeiroFront, /onMudou=\{carregar\}/);
  assert.match(financeiroFront, /Promise\.all\(\[carregar\(\), onMudou\?\.\(\)\]\)/);
});

test('conta do beneficiário pode ser criada durante o repasse sem alterar a ficha inteira', () => {
  assert.match(controller, /async function criarContaBeneficiario/);
  assert.match(controller, /await conn\.beginTransaction\(\)/);
  assert.match(controller, /Conta do beneficiário cadastrada/);
  assert.match(financeiroFront, /Cadastrar conta do beneficiário/);
  assert.match(financeiroFront, /criarContaBeneficiario/);
  assert.match(financeiroFront, /Conta cadastrada e selecionada para este repasse/);
});

test('repasse em mãos separa a saída do escritório do destino e preserva o histórico', () => {
  assert.match(controller, /destino_tipo/);
  assert.match(controller, /tipoDestino === 'em_maos'/);
  assert.match(controller, /O repasse em mãos exige uma forma de pagamento disponível para dinheiro em espécie/);
  assert.match(controller, /destino: 'em_maos'/);
  assert.match(controller, /\$\{cfg\.destinoTipo\}=NULL/);
  assert.match(financeiroFront, /Dinheiro em espécie — em mãos/);
  assert.match(financeiroFront, /tipoDestino === 'em_maos' \? 'especie' : 'financeira'/);
  assert.match(financeiroFront, /\{contasEscritorio\.map/);
  assert.match(financeiroFront, /Não será usada nenhuma instituição financeira/);
});

test('recibos consolidados do acordo permanecem separados por destinatário', () => {
  assert.match(documentosController, /recibo_acordo_cliente/);
  assert.match(documentosController, /recibo_acordo_parceria/);
  assert.match(variaveisDocumento, /async function resolverAcordo/);
  assert.match(variaveisDocumento, /tipoRecibo === 'cliente'/);
  assert.match(financeiroFront, /Recibo consolidado/);
});
