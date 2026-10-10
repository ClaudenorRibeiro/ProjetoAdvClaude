// ============================================================
// CONTROLLER FINANCEIRO (reescrito 15/06/2026 — do zero)
// Modelo POR PROCESSO:
//  - conta_corrente: entradas/saídas de um processo (estilo extrato bancário)
//  - acordo + acordo_parcela: acordo parcelado, parcelas com honorário/parceria por linha
//  - baixa: marcar parcela recebida gera uma ENTRADA na conta corrente, vinculada à parcela
// Tudo que escreve em mais de um lugar usa transação (BEGIN/COMMIT/ROLLBACK) + auditoria.
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { hojeBrasilia, paginacao, escaparLike } = require('../utils/helpers');
const { texto, dataIso, inteiroPositivo: inteiroEstrito } = require('../utils/camposTexto');
const { proximoDiaUtil } = require('../services/calendarioService');
const auditoria = require('../middleware/auditoria');

// ---------- helpers de cálculo ----------
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const LIMITE_TEXTO_FIN = 300;               // descrição do lançamento/acordo, observação da parcela e motivo de cancelar (tamanho das colunas / padrão dos outros módulos)
const LIMITE_PARCELAS = 360;                // 30 anos de parcelas mensais
const VALOR_MAXIMO = 9999999999999.99;      // limite da coluna decimal(15,2)
const fmtReal = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Id da rota como número; null quando não é um inteiro positivo (o registro "abc" simplesmente não existe).
function lerIdFin(bruto) {
  const r = inteiroEstrito(bruto, { rotulo: 'Id' });
  return r.erro ? null : r.valor;
}

// Valor em dinheiro: número (ou texto numérico) finito, dentro do limite da coluna. Devolve { valor } ou { erro }.
// permiteZero: honorário/parceria fixos podem ser 0; valor de lançamento e parcela não.
function lerDinheiro(bruto, rotulo, { permiteZero = false } = {}) {
  const ok = (typeof bruto === 'number') || (typeof bruto === 'string' && /^\d+(\.\d+)?$/.test(bruto.trim()));
  const n = ok ? Number(bruto) : NaN;
  if (!Number.isFinite(n)) return { erro: `${rotulo} inválido` };
  if (n < 0 || (n === 0 && !permiteZero)) return { erro: permiteZero ? `${rotulo} inválido` : `${rotulo} deve ser maior que zero` };
  if (n > VALOR_MAXIMO) return { erro: `${rotulo} muito grande (máximo ${fmtReal(VALOR_MAXIMO)})` };
  return { valor: n };
}

// Percentual de 0 a 100 (vazio = não informado → null). Devolve { valor } ou { erro }.
function lerPercentual(bruto, rotulo) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  const ok = (typeof bruto === 'number') || (typeof bruto === 'string' && /^\d+(\.\d+)?$/.test(bruto.trim()));
  const n = ok ? Number(bruto) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: `${rotulo} deve estar entre 0 e 100` };
  return { valor: n };
}

// Processo existente e ativo (o excluído "não existe" para o financeiro). Devolve o id ou null.
async function processoAtivoFin(bruto) {
  const id = lerIdFin(bruto);
  if (!id) return null;
  const [r] = await pool.execute('SELECT id FROM tblproc WHERE id = ? AND ativo = 1', [id]);
  return r.length ? id : null;
}

// Confere a lista de parcelas que vem da tela (criar e editar acordo) ANTES de calcular: lista de objetos (até 360),
// número, vencimento real e parceiro existente. Devolve null (ok) ou { erro, status }.
async function conferirParcelasEntrada(parcelas) {
  if (parcelas.length > LIMITE_PARCELAS) return { erro: `Um acordo pode ter no máximo ${LIMITE_PARCELAS} parcelas`, status: 400 };
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    const rotulo = `Parcela ${i + 1}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { erro: `${rotulo} inválida`, status: 400 };
    if (p.numero !== undefined && p.numero !== null && p.numero !== '' && inteiroEstrito(p.numero, { rotulo }).erro) return { erro: `${rotulo}: número inválido`, status: 400 };
    if (p.vencimento === undefined || p.vencimento === null || p.vencimento === '') return { erro: `${rotulo}: informe o vencimento`, status: 400 };
    const venc = dataIso(p.vencimento, { rotulo: `${rotulo}: vencimento` });
    if (venc.erro) return { erro: venc.erro, status: 400 };
    const mul = lerPercentual(p.multa_percentual, `${rotulo}: a multa`);
    if (mul.erro) return { erro: mul.erro, status: 400 };
    if (p.parceria_pessoa_id) {
      if (!tiposPessoa.has(p.parceria_pessoa_tipo)) return { erro: `${rotulo}: tipo de parceiro inválido`, status: 400 };
      const idPar = inteiroEstrito(p.parceria_pessoa_id, { rotulo: 'Parceiro' });
      if (idPar.erro) return { erro: `${rotulo}: ${idPar.erro}`, status: 400 };
      const [achou] = await pool.execute(`SELECT id FROM ${tabelaPessoa(p.parceria_pessoa_tipo)} WHERE id = ?`, [idPar.valor]);
      if (!achou.length) return { erro: `${rotulo}: parceiro não encontrado`, status: 404 };
    }
  }
  return null;
}

// Erro de validação financeira: mensagem específica (nunca "erro interno") quando um
// valor de parcela/acordo fere uma regra de negócio. O backend nunca confia no cálculo
// do front — quem grava sempre recusa em vez de corrigir em silêncio.
function erroValidacaoFinanceiro(mensagem) {
  const err = new Error(mensagem);
  err.codigoValidacaoFinanceiro = true;
  return err;
}

const tiposPessoa = new Set(['fisica', 'juridica']);
const tabelaContaPessoa = (tipo) => tipo === 'juridica' ? 'contas_bancarias_pj' : 'contas_bancarias_pf';
const tabelaPessoa = (tipo) => tipo === 'juridica' ? 'pessoas_juridicas' : 'pessoas_fisicas';
const campoNomePessoa = (tipo) => tipo === 'juridica' ? 'razao_social' : 'nome';

function inteiroPositivo(valor) {
  const n = Number.parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizarDigitoConta(valor) {
  const digito = String(valor ?? '').trim();
  if (digito.length > 4) throw erroValidacaoFinanceiro('O dígito da conta pode ter no máximo 4 caracteres.');
  return digito || null;
}

// Uma cópia do destino é guardada no momento do pagamento. Assim, renomear banco,
// trocar a conta principal ou editar a ficha da pessoa nunca reescreve um pagamento já feito.
async function resolverContaPessoa(conn, tipo, pessoaId, contaId) {
  if (!tiposPessoa.has(tipo) || !inteiroPositivo(pessoaId) || !inteiroPositivo(contaId)) {
    throw erroValidacaoFinanceiro('Informe a pessoa e a conta bancária de destino.');
  }
  const tabela = tabelaContaPessoa(tipo);
  const [rows] = await conn.execute(
    `SELECT cb.id, cb.tipo, cb.agencia, cb.numero, cb.digito, cb.chave_pix, cb.titular, cb.documento_titular,
            cb.conta_terceiro, cb.observacao, ifin.nome AS instituicao_nome
       FROM ${tabela} cb JOIN instituicao_financeira ifin ON ifin.id=cb.instituicao_financeira_id
      WHERE cb.id=? AND cb.pessoa_id=? AND cb.ativo=1 LIMIT 1`, [contaId, pessoaId]
  );
  if (!rows.length) throw erroValidacaoFinanceiro('A conta escolhida não está ativa ou não pertence à pessoa indicada.');
  return rows[0];
}

// Cliente PADRÃO do acordo/alvará: a pessoa é obrigatória quando há qualquer dado de cliente, mas a CONTA é
// opcional — quem não tem conta recebe "Dinheiro em espécie — em mãos" (ou a conta principal) na hora do repasse.
// Devolve null (nada informado) ou { tipo, pessoaId, contaId } com números já conferidos; contaId pode ser null.
async function resolverClientePadrao(conn, tipo, pessoaId, contaId) {
  const temConta = contaId !== undefined && contaId !== null && contaId !== '';
  if (!tipo && !pessoaId && !temConta) return null;
  if (!tiposPessoa.has(tipo) || !inteiroPositivo(pessoaId)) {
    throw erroValidacaoFinanceiro('Informe o cliente padrão do acordo (a conta é opcional).');
  }
  if (!(await resolverNomePessoa(conn, tipo, pessoaId))) {
    throw erroValidacaoFinanceiro('O cliente escolhido não foi encontrado.');
  }
  if (!temConta) return { tipo, pessoaId: Number(pessoaId), contaId: null };
  await resolverContaPessoa(conn, tipo, pessoaId, contaId);
  return { tipo, pessoaId: Number(pessoaId), contaId: Number(contaId) };
}

// Destino do repasse ao cliente de UMA parcela: o padrão do acordo (quando existe) vale como um bloco só
// (pessoa + conta), para nunca misturar a pessoa nova com a conta de outra; sem padrão, vale o que a parcela já tinha.
function destinoClienteDaParcela(p, destinoCliente) {
  if (destinoCliente) return { tipo: destinoCliente.tipo, pessoaId: destinoCliente.pessoaId, contaId: destinoCliente.contaId };
  return { tipo: p.repasse_cliente_tipo || null, pessoaId: p.repasse_cliente_pessoa_id || null, contaId: p.repasse_cliente_conta_id || null };
}

async function resolverContaEscritorio(conn, contaId) {
  const id = inteiroPositivo(contaId);
  if (!id) throw erroValidacaoFinanceiro('Informe a conta ou o caixa em espécie do escritório.');
  const [rows] = await conn.execute(
    `SELECT cf.*, ifin.nome AS instituicao_nome FROM conta_financeira cf
       LEFT JOIN instituicao_financeira ifin ON ifin.id=cf.instituicao_financeira_id
      WHERE cf.id=? AND cf.ativo=1 LIMIT 1`, [id]
  );
  if (!rows.length) throw erroValidacaoFinanceiro('A conta ou caixa do escritório não está ativo.');
  return rows[0];
}

async function resolverFormaPagamento(conn, formaId, tipoConta) {
  const id = inteiroPositivo(formaId);
  if (!id) throw erroValidacaoFinanceiro('Informe a forma de recebimento ou pagamento.');
  const [rows] = await conn.execute(
    'SELECT id, nome, uso_permitido FROM forma_pagamento WHERE id=? AND ativo=1 FOR UPDATE', [id]
  );
  if (!rows.length) throw erroValidacaoFinanceiro('A forma escolhida não está ativa.');
  const usoNecessario = tipoConta === 'especie' ? 'especie' : 'financeira';
  if (rows[0].uso_permitido !== 'ambos' && rows[0].uso_permitido !== usoNecessario) {
    throw erroValidacaoFinanceiro('Esta forma não é compatível com a conta ou caixa selecionado.');
  }
  return rows[0];
}

async function listarContasEscritorio(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT cf.*, ifin.nome AS instituicao_nome FROM conta_financeira cf
       LEFT JOIN instituicao_financeira ifin ON ifin.id=cf.instituicao_financeira_id
       WHERE cf.ativo=1 ORDER BY cf.principal DESC, cf.tipo ASC, ifin.nome ASC, cf.nome ASC`
    );
    return sucesso(res, rows);
  } catch (err) { return erroInterno(res, err); }
}

async function salvarContaEscritorio(req, res) {
  const id = inteiroPositivo(req.params.id);
  const { instituicao_financeira_id, nome, tipo, agencia, numero, digito, chave_pix, observacao, principal } = req.body;
  const tipoConta = tipo === 'especie' ? 'especie' : 'bancaria';
  if (!String(nome || '').trim()) return erro(res, 'Dê um nome para identificar esta conta ou caixa.');
  const instituicaoId = inteiroPositivo(instituicao_financeira_id);
  if (tipoConta === 'bancaria' && !instituicaoId) return erro(res, 'Escolha a instituição financeira da conta bancária.');
  let digitoNormalizado;
  try {
    digitoNormalizado = tipoConta === 'bancaria' ? normalizarDigitoConta(digito) : null;
  } catch (err) {
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (tipoConta === 'bancaria') {
      const [banco] = await conn.execute('SELECT id FROM instituicao_financeira WHERE id=? AND ativo=1', [instituicaoId]);
      if (!banco.length) throw erroValidacaoFinanceiro('A instituição financeira escolhida não está ativa.');
    }
    let contaId = id;
    const dadosBancarios = tipoConta === 'bancaria'
      ? [agencia || null, numero || null, digitoNormalizado, chave_pix || null]
      : [null, null, null, null];
    const valores = [tipoConta === 'bancaria' ? instituicaoId : null, String(nome).trim(), tipoConta,
      ...dadosBancarios, observacao ? String(observacao).trim() : null, principal ? 1 : 0];
    if (id) {
      const [existentes] = await conn.execute('SELECT tipo, ativo FROM conta_financeira WHERE id=? FOR UPDATE', [id]);
      if (!existentes.length) { await conn.rollback(); return naoEncontrado(res, 'Conta do escritório não encontrada'); }
      if (existentes[0].tipo === 'especie' && existentes[0].ativo && tipoConta !== 'especie') {
        const [outrosCaixas] = await conn.execute('SELECT id FROM conta_financeira WHERE tipo=\'especie\' AND ativo=1 AND id<>? FOR UPDATE', [id]);
        if (!outrosCaixas.length) throw erroValidacaoFinanceiro('O escritório precisa manter ao menos um caixa físico ativo.');
      }
      const [r] = await conn.execute(`UPDATE conta_financeira SET instituicao_financeira_id=?, nome=?, tipo=?, agencia=?, numero=?, digito=?, chave_pix=?, observacao=?, principal=?, ativo=1 WHERE id=?`, [...valores, id]);
      if (!r.affectedRows) { await conn.rollback(); return naoEncontrado(res, 'Conta do escritório não encontrada'); }
    } else {
      const [r] = await conn.execute(`INSERT INTO conta_financeira (instituicao_financeira_id,nome,tipo,agencia,numero,digito,chave_pix,observacao,principal) VALUES (?,?,?,?,?,?,?,?,?)`, valores);
      contaId = r.insertId;
    }
    if (principal) await conn.execute('UPDATE conta_financeira SET principal=0 WHERE id<>?', [contaId]);
    await conn.commit();
    return sucesso(res, { id: contaId }, id ? 'Conta atualizada' : 'Conta cadastrada', id ? 200 : 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe uma conta do escritório com esse nome.');
    return erroInterno(res, err);
  } finally { conn.release(); }
}

async function desativarContaEscritorio(req, res) {
  const id = inteiroPositivo(req.params.id);
  if (!id) return erro(res, 'Conta inválida');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existentes] = await conn.execute('SELECT tipo FROM conta_financeira WHERE id=? AND ativo=1 FOR UPDATE', [id]);
    if (!existentes.length) { await conn.rollback(); return naoEncontrado(res, 'Conta do escritório não encontrada ou já está inativa'); }
    if (existentes[0].tipo === 'especie') {
      const [caixasAtivos] = await conn.execute('SELECT id FROM conta_financeira WHERE tipo=\'especie\' AND ativo=1 FOR UPDATE');
      if (caixasAtivos.length <= 1) throw erroValidacaoFinanceiro('O caixa físico do escritório não pode ser desativado.');
    }
    await conn.execute('UPDATE conta_financeira SET ativo=0, principal=0 WHERE id=?', [id]);
    await conn.commit();
    return sucesso(res, null, 'Conta desativada. O histórico foi preservado.');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally { conn.release(); }
}

async function listarBeneficiariosProcesso(req, res) {
  const processoId = inteiroPositivo(req.params.processoId);
  if (!processoId) return erro(res, 'Processo inválido');
  try {
    // Pessoas dos dois lados do processo. `cliente` diz se a pessoa é do lado do cliente do escritório
    // (campo "cliente_polo" do processo): true/false; null quando o processo não informa o lado do cliente
    // (a tela então mostra todo mundo, como sempre fez).
    const [rows] = await pool.execute(
      `SELECT 'fisica' AS tipo, pf.id, pf.nome AS nome, x.lado FROM pessoas_fisicas pf
         JOIN (SELECT pessoa_id, 'autor' AS lado FROM tbltituloprocautor WHERE proc_id=? AND tipo_pessoa='fisica'
               UNION ALL SELECT pessoa_id, 'reu' AS lado FROM tbltituloprocreu WHERE proc_id=? AND tipo_pessoa='fisica') x ON x.pessoa_id=pf.id
       UNION ALL
       SELECT 'juridica' AS tipo, pj.id, pj.razao_social AS nome, x.lado FROM pessoas_juridicas pj
         JOIN (SELECT pessoa_id, 'autor' AS lado FROM tbltituloprocautor WHERE proc_id=? AND tipo_pessoa='juridica'
               UNION ALL SELECT pessoa_id, 'reu' AS lado FROM tbltituloprocreu WHERE proc_id=? AND tipo_pessoa='juridica') x ON x.pessoa_id=pj.id`,
      [processoId, processoId, processoId, processoId]
    );
    const [[proc]] = await pool.execute('SELECT cliente_polo FROM tblproc WHERE id = ?', [processoId]);
    const polo = proc && (proc.cliente_polo === 'autor' || proc.cliente_polo === 'reu') ? proc.cliente_polo : null;
    const porPessoa = new Map();
    for (const r of rows) {
      const chave = `${r.tipo}:${r.id}`;
      const atual = porPessoa.get(chave) || { tipo: r.tipo, id: r.id, nome: r.nome, lados: new Set() };
      atual.lados.add(r.lado);
      porPessoa.set(chave, atual);
    }
    const lista = [...porPessoa.values()]
      .map(({ tipo, id, nome, lados }) => ({ tipo, id, nome, cliente: polo ? lados.has(polo) : null }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return sucesso(res, lista);
  } catch (err) { return erroInterno(res, err); }
}

async function listarContasBeneficiario(req, res) {
  const tipo = req.query.tipo;
  const pessoaId = inteiroPositivo(req.query.pessoa_id);
  if (!tiposPessoa.has(tipo) || !pessoaId) return erro(res, 'Beneficiário inválido');
  try {
    const tabela = tabelaContaPessoa(tipo);
    const [rows] = await pool.execute(
      `SELECT cb.*, ifin.nome AS instituicao_nome FROM ${tabela} cb
       JOIN instituicao_financeira ifin ON ifin.id=cb.instituicao_financeira_id
       WHERE cb.pessoa_id=? AND cb.ativo=1 ORDER BY cb.principal DESC, cb.id`, [pessoaId]
    );
    return sucesso(res, rows);
  } catch (err) { return erroInterno(res, err); }
}

// POST /api/financeiro/beneficiario/:tipo/:id/conta — cadastro rápido durante o repasse.
// Cria (ou reativa, se for a mesma conta) sem regravar a ficha, telefones ou outras contas da pessoa.
async function criarContaBeneficiario(req, res) {
  const tipo = req.params.tipo;
  const pessoaId = inteiroPositivo(req.params.id);
  const tabela = tiposPessoa.has(tipo) ? tabelaContaPessoa(tipo) : null;
  if (!tabela || !pessoaId) return erro(res, 'Beneficiário inválido.');

  const { instituicao_financeira_id, tipo_conta, agencia, numero, digito, chave_pix,
    conta_terceiro, titular, documento_titular, observacao, principal } = req.body;
  const instituicaoId = inteiroPositivo(instituicao_financeira_id);
  if (!instituicaoId) return erro(res, 'Escolha a instituição financeira.');
  let digitoNormalizado;
  try { digitoNormalizado = normalizarDigitoConta(digito); }
  catch (err) { return erro(res, err.message); }
  const observacaoNormalizada = String(observacao || '').trim();
  if (observacaoNormalizada.length > 1000) return erro(res, 'A observação da conta pode ter no máximo 1.000 caracteres.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pessoas] = await conn.execute(
      tipo === 'juridica'
        ? 'SELECT razao_social AS nome, cnpj AS documento FROM pessoas_juridicas WHERE id=? FOR UPDATE'
        : 'SELECT nome, cpf AS documento FROM pessoas_fisicas WHERE id=? FOR UPDATE',
      [pessoaId]
    );
    if (!pessoas.length) { await conn.rollback(); return naoEncontrado(res, 'Beneficiário não encontrado.'); }
    const [instituicoes] = await conn.execute('SELECT id FROM instituicao_financeira WHERE id=? AND ativo=1 FOR UPDATE', [instituicaoId]);
    if (!instituicoes.length) { await conn.rollback(); return erro(res, 'A instituição financeira escolhida não está ativa.'); }

    const terceiro = conta_terceiro ? 1 : 0;
    const titularConta = terceiro ? String(titular || '').trim() : String(pessoas[0].nome || '').trim();
    const documentoConta = terceiro ? String(documento_titular || '').replace(/\D/g, '') : String(pessoas[0].documento || '').replace(/\D/g, '');
    if (!titularConta || !documentoConta) {
      await conn.rollback();
      return erro(res, 'O beneficiário precisa ter CPF/CNPJ cadastrado ou a conta deve ser marcada como de terceiro com titular e documento.');
    }
    const tipoConta = tipo_conta === 'poupanca' ? 'poupanca' : 'corrente';
    const valores = [instituicaoId, tipoConta, agencia || null, numero || null, digitoNormalizado, chave_pix || null,
      terceiro, titularConta, documentoConta, observacaoNormalizada || null, principal ? 1 : 0];
    const [iguais] = await conn.execute(
      `SELECT id FROM ${tabela}
        WHERE pessoa_id=? AND instituicao_financeira_id=? AND tipo=?
          AND COALESCE(agencia,'')=COALESCE(?,'') AND COALESCE(numero,'')=COALESCE(?,'')
          AND COALESCE(digito,'')=COALESCE(?,'') AND COALESCE(chave_pix,'')=COALESCE(?,'')
        LIMIT 1 FOR UPDATE`,
      [pessoaId, instituicaoId, tipoConta, agencia || null, numero || null, digitoNormalizado, chave_pix || null]
    );
    let contaId;
    if (iguais.length) {
      contaId = iguais[0].id;
      await conn.execute(`UPDATE ${tabela} SET ativo=1, principal=? WHERE id=? AND pessoa_id=?`, [principal ? 1 : 0, contaId, pessoaId]);
    } else {
      const [nova] = await conn.execute(
        `INSERT INTO ${tabela} (pessoa_id,instituicao_financeira_id,tipo,agencia,numero,digito,chave_pix,conta_terceiro,titular,documento_titular,observacao,principal)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [pessoaId, ...valores]
      );
      contaId = nova.insertId;
    }
    if (principal) await conn.execute(`UPDATE ${tabela} SET principal=0 WHERE pessoa_id=? AND id<>?`, [pessoaId, contaId]);
    await auditoria.registrar(req.usuario.id, 'conta_bancaria', 'criar', contaId, null, { pessoa_tipo: tipo, pessoa_id: pessoaId }, conn);
    await conn.commit();
    return sucesso(res, { id: contaId }, 'Conta do beneficiário cadastrada.', 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// Soma N meses a uma data 'YYYY-MM-DD', mantendo o dia (com clamp no último dia do mês).
function somarMeses(dataStr, n) {
  const [y, m, d] = String(dataStr).slice(0, 10).split('-').map(Number);
  const base = new Date(y, (m - 1) + n, 1);            // 1º dia do mês alvo
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);                  // evita "31 de fevereiro"
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${base.getFullYear()}-${mm}-${dd}`;
}

// Recalcula honorário, líquido e parceria de UMA parcela a partir dos campos crus.
// Regra acordada: parceria incide sobre o HONORÁRIO (não sobre o bruto, não mexe no líquido do cliente).
// Nunca confia no cálculo do front: RECUSA (não corrige em silêncio) valor bruto zerado/
// negativo, percentual negativo, e parceria negativa ou maior que o honorário da parcela.
// `rotulo` identifica a parcela na mensagem de erro quando há mais de uma (ex.: "Parcela 2").
function calcularValoresParcela(p, rotulo = 'A parcela') {
  const brutoLido = lerDinheiro(p.valor_bruto, 'Valor bruto');
  if (brutoLido.erro) {
    const semValor = typeof p.valor_bruto === 'number' && p.valor_bruto <= 0;
    throw erroValidacaoFinanceiro(`${rotulo}: ${semValor ? 'informe um valor bruto maior que zero' : 'o valor bruto é inválido'}.`);
  }
  const bruto = round2(brutoLido.valor);

  const honorTipo = ['percent', 'fixo', 'sem'].includes(p.honor_tipo) ? p.honor_tipo : 'percent';

  let honorPct = null;
  let honorValor = 0;
  if (honorTipo === 'percent') {
    const pctLido = lerPercentual(p.honor_percentual, 'O percentual de honorário');
    if (pctLido.erro) throw erroValidacaoFinanceiro(`${rotulo}: ${pctLido.erro.charAt(0).toLowerCase()}${pctLido.erro.slice(1)}.`);
    honorPct = pctLido.valor || 0;
    honorValor = round2(bruto * honorPct / 100);
  } else if (honorTipo === 'fixo') {
    const hv = p.honor_valor === undefined || p.honor_valor === null || p.honor_valor === '' ? { valor: 0 } : lerDinheiro(p.honor_valor, 'Valor do honorário', { permiteZero: true });
    if (hv.erro) throw erroValidacaoFinanceiro(`${rotulo}: o valor do honorário é inválido.`);
    honorValor = round2(hv.valor);
  } // 'sem' => 0
  if (honorValor > bruto) honorValor = bruto;          // honorário nunca passa do bruto
  const liquido = round2(bruto - honorValor);

  // Parceria opcional (só quando há pessoa selecionada)
  const temParceria = !!p.parceria_pessoa_id;
  const parcTipo = temParceria ? (['percent', 'fixo'].includes(p.parceria_tipo) ? p.parceria_tipo : 'percent') : null;
  let parcPct = null;
  let parcValor = null;
  if (temParceria) {
    if (parcTipo === 'fixo') {
      const pv = p.parceria_valor === undefined || p.parceria_valor === null || p.parceria_valor === '' ? { valor: 0 } : lerDinheiro(p.parceria_valor, 'Valor da parceria', { permiteZero: true });
      if (pv.erro) throw erroValidacaoFinanceiro(`${rotulo}: o valor da parceria é inválido.`);
      parcValor = round2(pv.valor);
      if (parcValor > honorValor) {
        throw erroValidacaoFinanceiro(`${rotulo}: a parceria (${fmtReal(parcValor)}) não pode ser maior que o honorário desta parcela (${fmtReal(honorValor)}).`);
      }
    } else {
      const ppLido = lerPercentual(p.parceria_percentual, 'O percentual de parceria');
      if (ppLido.erro) throw erroValidacaoFinanceiro(`${rotulo}: o percentual de parceria deve estar entre 0 e 100.`);
      parcPct = ppLido.valor || 0;
      parcValor = round2(honorValor * parcPct / 100);
    }
  }

  const obs = texto(p.observacao, { rotulo: 'A observação', max: LIMITE_TEXTO_FIN });
  if (obs.erro) throw erroValidacaoFinanceiro(`${rotulo}: ${obs.erro.charAt(0).toLowerCase()}${obs.erro.slice(1)}.`);

  return {
    valor_bruto: bruto,
    honor_tipo: honorTipo,
    honor_percentual: honorTipo === 'percent' ? honorPct : null,
    honor_valor: honorValor,
    valor_liquido: liquido,
    parceria_pessoa_tipo: temParceria ? (p.parceria_pessoa_tipo || null) : null,
    parceria_pessoa_id: temParceria ? p.parceria_pessoa_id : null,
    parceria_tipo: parcTipo,
    parceria_percentual: parcTipo === 'percent' ? parcPct : null,
    parceria_valor: parcValor,
    observacao: obs.valor,
  };
}

// ============================================================
// CONTA CORRENTE (por processo)
// ============================================================

// GET /api/financeiro/processo/:processoId — extrato + saldo
async function buscarContaCorrente(req, res) {
  try {
    const processoId = await processoAtivoFin(req.params.processoId);
    if (!processoId) return naoEncontrado(res, 'Processo não encontrado');
    const de = dataIso(req.query.data_de, { rotulo: 'Data inicial' });
    if (de.erro) return erro(res, de.erro);
    const ate = dataIso(req.query.data_ate, { rotulo: 'Data final' });
    if (ate.erro) return erro(res, ate.erro);
    const data_de = de.valor; const data_ate = ate.valor;
    const params = [processoId];
    let where = 'WHERE cc.processo_id = ?';
    if (data_de)  { where += ' AND cc.data >= ?'; params.push(data_de); }
    if (data_ate) { where += ' AND cc.data <= ?'; params.push(data_ate); }

    const [lancamentos] = await pool.execute(
      `SELECT cc.*, u.nome AS usuario_nome
       FROM conta_corrente cc
       JOIN usuarios u ON cc.usuario_id = u.id
       ${where}
       ORDER BY cc.data ASC, cc.id ASC`,
      params
    );

    // Saldo acumulado: entrada soma, saída subtrai
    let saldo = 0;
    const comSaldo = lancamentos.map(l => {
      saldo += (l.tipo === 'entrada' ? 1 : -1) * parseFloat(l.valor);
      return { ...l, saldo_acumulado: round2(saldo) };
    });

    return sucesso(res, { lancamentos: comSaldo, saldo_total: round2(saldo) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Lê os campos do lançamento que vêm da tela (criar e editar): descrição (≤300), valor, tipo e data reais.
// Devolve { dados: { data (null = não informada), descricao, valor, tipo } } ou { erro }.
function lerLancamento(corpo) {
  const c = corpo || {};
  const desc = texto(c.descricao, { rotulo: 'A descrição', max: LIMITE_TEXTO_FIN, obrigatorio: true });
  if (desc.erro) return { erro: desc.erro.replace('A descrição é obrigatório', 'Descrição é obrigatória') };
  const valor = lerDinheiro(c.valor, 'Valor');
  if (valor.erro) return { erro: valor.erro };
  if (c.tipo !== 'entrada' && c.tipo !== 'saida') return { erro: 'Tipo deve ser "entrada" ou "saida"' };
  const dia = dataIso(c.data, { rotulo: 'Data do lançamento' });
  if (dia.erro) return { erro: dia.erro };
  return { dados: { data: dia.valor, descricao: desc.valor, valor: round2(valor.valor), tipo: c.tipo } };
}

// POST /api/financeiro/processo/:processoId/lancamento — nova entrada/saída manual
async function lancar(req, res) {
  const processoId = await processoAtivoFin(req.params.processoId);
  if (!processoId) return naoEncontrado(res, 'Processo não encontrado');
  const lido = lerLancamento(req.body);
  if (lido.erro) return erro(res, lido.erro);
  const { data, descricao, valor, tipo } = lido.dados;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO conta_corrente (processo_id, data, descricao, tipo, valor, origem, usuario_id)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
      [processoId, data || hojeBrasilia(), descricao, tipo, valor, req.usuario.id]
    );
    await logCC(conn, result.insertId, req.usuario.id, 'criado', null, null, 'Lançamento criado');
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'criar', result.insertId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: result.insertId }, 'Lançamento registrado', 201);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/lancamento/:id — edita um lançamento MANUAL (os de acordo são intocáveis aqui)
async function editarLancamento(req, res) {
  const id = lerIdFin(req.params.id);
  if (!id) return naoEncontrado(res, 'Lançamento não encontrado');
  const lido = lerLancamento(req.body);
  if (lido.erro) return erro(res, lido.erro);
  const { data, descricao, valor, tipo } = lido.dados;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM conta_corrente WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Lançamento não encontrado'); }
    if (rows[0].origem !== 'manual') {
      await conn.rollback();
      return erro(res, 'Este lançamento veio de uma parcela de acordo. Desfaça o recebimento (ou o repasse) da parcela para alterá-lo.');
    }
    const novo = { data: data || rows[0].data, descricao, tipo, valor };
    // Registra no histórico cada campo que mudou (campo a campo, De → Para)
    for (const [k, label] of CAMPOS_CC) {
      if (normCC(k, rows[0][k]) !== normCC(k, novo[k])) {
        await logCC(conn, id, req.usuario.id, 'editado', label, fmtCC(k, rows[0][k]), fmtCC(k, novo[k]));
      }
    }
    await conn.execute(
      `UPDATE conta_corrente SET data = ?, descricao = ?, tipo = ?, valor = ? WHERE id = ?`,
      [novo.data, novo.descricao, novo.tipo, novo.valor, id]
    );
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'atualizar', id, rows[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Lançamento atualizado');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/financeiro/lancamento/:id — exclui lançamento MANUAL
async function excluirLancamento(req, res) {
  const id = lerIdFin(req.params.id);
  if (!id) return naoEncontrado(res, 'Lançamento não encontrado');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM conta_corrente WHERE id = ?', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Lançamento não encontrado'); }
    if (rows[0].origem !== 'manual') {
      await conn.rollback();
      return erro(res, 'Este lançamento veio de uma parcela de acordo. Desfaça o recebimento (ou o repasse) da parcela para removê-lo.');
    }
    await conn.execute('DELETE FROM conta_corrente WHERE id = ?', [id]);
    await auditoria.registrar(req.usuario.id, 'conta_corrente', 'excluir', id, rows[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Lançamento removido');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// ACORDO + PARCELAS
// ============================================================

// GET /api/financeiro/processo/:processoId/acordos — lista acordos do processo (com resumo)
async function listarAcordos(req, res) {
  try {
    const processoId = await processoAtivoFin(req.params.processoId);
    if (!processoId) return naoEncontrado(res, 'Processo não encontrado');
    const [acordos] = await pool.execute(
      `SELECT a.*,
              (SELECT COUNT(*) FROM acordo_parcela ap WHERE ap.acordo_id = a.id) AS total_parcelas_real,
              (SELECT COUNT(*) FROM acordo_parcela ap WHERE ap.acordo_id = a.id AND ap.status = 'pago') AS parcelas_pagas,
              (SELECT COALESCE(SUM(ap.valor_bruto),0) FROM acordo_parcela ap WHERE ap.acordo_id = a.id AND ap.status = 'pago') AS total_recebido,
              -- Número na ordem de criação dentro do processo, POR TIPO (Acordo 1,2.. / Alvará 1,2..).
              -- Mesma numeração usada nas descrições da conta corrente.
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo
       FROM acordo a
       WHERE a.processo_id = ?
       ORDER BY a.id DESC`,
      [processoId]
    );
    return sucesso(res, acordos);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/acordo/previa — gera a TABELA de parcelas (datas em dia útil),
// SEM salvar. Alimenta o modal editável. Body: { valor_total, qtd_parcelas, data_primeira, honor_percentual }
async function gerarPreviaParcelas(req, res) {
  try {
    const { valor_total, qtd_parcelas, data_primeira, honor_percentual, multa_percentual } = req.body;
    const totalLido = lerDinheiro(valor_total, 'Valor total');
    if (totalLido.erro) return erro(res, totalLido.erro);
    const total = round2(totalLido.valor);
    const qtdLida = inteiroEstrito(qtd_parcelas, { rotulo: 'Quantidade de parcelas' });
    if (qtdLida.erro || !qtdLida.valor) return erro(res, 'Quantidade de parcelas inválida');
    if (qtdLida.valor > LIMITE_PARCELAS) return erro(res, `Quantidade de parcelas inválida (máximo ${LIMITE_PARCELAS})`);
    const qtd = qtdLida.valor;
    if (!data_primeira)       return erro(res, 'Data da primeira parcela é obrigatória');
    const dia = dataIso(data_primeira, { rotulo: 'Data da primeira parcela' });
    if (dia.erro) return erro(res, dia.erro);

    const pctLido = lerPercentual(honor_percentual, 'O honorário padrão');
    if (pctLido.erro) return erro(res, pctLido.erro);
    const pct = pctLido.valor != null ? pctLido.valor : 30; // padrão 30%
    // Multa por atraso: sem valor padrão (nem todo acordo tem cláusula de multa judicial) —
    // só entra na parcela se o usuário informar algo no cabeçalho do acordo.
    const multaLida = lerPercentual(multa_percentual, 'A multa por atraso');
    if (multaLida.erro) return erro(res, multaLida.erro);
    const multaPct = multaLida.valor;

    // Divide o total: todas iguais (round2) e a ÚLTIMA absorve a diferença de centavos
    const base = round2(total / qtd);
    const parcelas = [];
    for (let i = 0; i < qtd; i++) {
      const bruto = i === qtd - 1 ? round2(total - base * (qtd - 1)) : base;
      const venc = await proximoDiaUtil(somarMeses(data_primeira, i));
      const calc = calcularValoresParcela({
        valor_bruto: bruto, honor_tipo: 'percent', honor_percentual: pct,
      }, `Parcela ${i + 1}`);
      parcelas.push({ numero: i + 1, vencimento: venc, status: 'pendente', multa_percentual: multaPct, ...calc });
    }
    return sucesso(res, { valor_total: total, qtd_parcelas: qtd, parcelas });
  } catch (err) {
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  }
}

// POST /api/financeiro/processo/:processoId/acordo — cria acordo + parcelas (tabela já editada)
async function criarAcordo(req, res) {
  const { qtd_parcelas, data_primeira, parcelas, tipo,
    beneficiario_cliente_tipo, beneficiario_cliente_id, beneficiario_cliente_conta_id } = req.body;
  const tipoAcordo = tipo === 'alvara' ? 'alvara' : 'acordo';   // mesma estrutura serve a acordo e alvará

  if (!Array.isArray(parcelas) || !parcelas.length) return erro(res, 'Informe as parcelas');
  const totalLido = lerDinheiro(req.body.valor_total, 'Valor total');
  if (totalLido.erro) return erro(res, 'Valor total inválido');
  const valor_total = totalLido.valor;
  const desc = texto(req.body.descricao, { rotulo: 'A descrição', max: LIMITE_TEXTO_FIN });
  if (desc.erro) return erro(res, desc.erro);
  const descricao = desc.valor;
  const processoId = await processoAtivoFin(req.params.processoId);
  if (!processoId) return naoEncontrado(res, 'Processo não encontrado');
  const entrada = await conferirParcelasEntrada(parcelas);
  if (entrada) return erro(res, entrada.erro, entrada.status);
  const primeira = dataIso(data_primeira, { rotulo: 'Data da primeira parcela' });
  if (primeira.erro) return erro(res, primeira.erro);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const destinoCliente = await resolverClientePadrao(conn, beneficiario_cliente_tipo, beneficiario_cliente_id, beneficiario_cliente_conta_id);
    const [a] = await conn.execute(
      `INSERT INTO acordo (processo_id, tipo, descricao, valor_total, qtd_parcelas, data_primeira, criado_por,
        beneficiario_cliente_tipo, beneficiario_cliente_id, beneficiario_cliente_conta_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [processoId, tipoAcordo, descricao || null, round2(valor_total), parseInt(qtd_parcelas, 10) || parcelas.length,
       data_primeira || parcelas[0].vencimento, req.usuario.id,
       destinoCliente ? destinoCliente.tipo : null, destinoCliente ? destinoCliente.pessoaId : null, destinoCliente ? destinoCliente.contaId : null]
    );
    const acordoId = a.insertId;
    await inserirParcelas(conn, acordoId, parcelas, req.usuario.id, valor_total, destinoCliente);
    await auditoria.registrar(req.usuario.id, 'acordo', 'criar', acordoId, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: acordoId }, 'Acordo criado com sucesso', 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ---- Histórico por parcela (auditoria_parcela) ----
// Registra um evento da parcela. Para 'editada' usa campo/valores; para os demais usa só o resumo em valor_novo.
async function logParcela(conn, parcelaId, usuarioId, acao, campo, antes, novo) {
  await conn.execute(
    `INSERT INTO auditoria_parcela (parcela_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [parcelaId, acao, campo || null,
     antes === null || antes === undefined ? null : String(antes),
     novo  === null || novo  === undefined ? null : String(novo), usuarioId]
  );
}

// Campos da parcela rastreados no histórico de edição (chave + rótulo amigável)
const CAMPOS_HIST = [
  ['vencimento', 'Vencimento'], ['valor_bruto', 'Valor bruto'], ['honor_tipo', 'Tipo de honorário'],
  ['honor_percentual', 'Honorário (%)'], ['honor_valor', 'Honorário (R$)'], ['observacao', 'Observação'],
  ['parceria_tipo', 'Tipo da parceria'], ['parceria_percentual', 'Parceria (%)'], ['parceria_valor', 'Parceria (R$)'],
];

// Normaliza um valor de campo para comparação (números arredondados, data só YYYY-MM-DD)
function normCmp(campo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (['valor_bruto', 'honor_valor', 'parceria_valor', 'honor_percentual', 'parceria_percentual'].includes(campo)) {
    return String(round2(Number(v)));
  }
  if (campo === 'vencimento') return String(v).slice(0, 10);
  return String(v);
}

// Formata um valor de campo para EXIBIÇÃO no histórico (legível)
function fmtAudit(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (['valor_bruto', 'honor_valor', 'parceria_valor'].includes(campo)) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (['honor_percentual', 'parceria_percentual'].includes(campo)) return Number(v) + '%';
  if (campo === 'vencimento') return String(v).slice(0, 10).split('-').reverse().join('/');
  if (campo === 'honor_tipo') return { percent: 'Percentual', fixo: 'Fixo', sem: 'Sem honorário' }[v] || v;
  return String(v);
}

// ---- Histórico da CONTA CORRENTE (auditoria_conta_corrente) ----
async function logCC(conn, lancamentoId, usuarioId, acao, campo, antes, novo) {
  await conn.execute(
    `INSERT INTO auditoria_conta_corrente (lancamento_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [lancamentoId, acao, campo || null,
     antes === null || antes === undefined ? null : String(antes),
     novo  === null || novo  === undefined ? null : String(novo), usuarioId]
  );
}
const CAMPOS_CC = [['data', 'Data'], ['descricao', 'Descrição'], ['tipo', 'Tipo'], ['valor', 'Valor']];
function normCC(campo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (campo === 'valor') return String(round2(Number(v)));
  if (campo === 'data') return String(v).slice(0, 10);
  return String(v);
}
function fmtCC(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'valor') return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (campo === 'tipo') return v === 'entrada' ? 'Entrada' : 'Saída';
  if (campo === 'data') return String(v).slice(0, 10).split('-').reverse().join('/');
  return String(v);
}

// Insere a lista de parcelas (recalculando os valores no backend — nunca confia na conta do front).
// Registra o evento 'criada' no histórico de cada parcela. Antes de gravar qualquer coisa,
// confere que a soma dos valores brutos bate EXATAMENTE com o valor total do acordo.
async function inserirParcelas(conn, acordoId, parcelas, usuarioId, valorTotal, destinoCliente = null) {
  const calculadas = parcelas.map((p, i) => calcularValoresParcela(p, `Parcela ${p.numero || (i + 1)}`));
  const soma = round2(calculadas.reduce((s, v) => s + v.valor_bruto, 0));
  if (round2(valorTotal) !== soma) {
    throw erroValidacaoFinanceiro(`A soma das parcelas (${fmtReal(soma)}) não bate com o valor total do acordo (${fmtReal(valorTotal)}).`);
  }
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    const v = calculadas[i];
    const multaPct = p.multa_percentual != null && p.multa_percentual !== '' ? Number(p.multa_percentual) : null;
    // O servidor recalcula tudo, mas este campo vinha direto do corpo da requisição sem
    // conferir contra a lista de tipos válidos (auditoria 24/09, item 9 — S7 corrigiu dado
    // antigo gravado antes desta trava existir).
    const destinoParcela = destinoClienteDaParcela(p, destinoCliente);
    const repasseClienteTipo = destinoParcela.tipo;
    if (repasseClienteTipo && !tiposPessoa.has(repasseClienteTipo)) {
      throw erroValidacaoFinanceiro(`Tipo de beneficiário do repasse inválido na parcela ${p.numero || (i + 1)}.`);
    }
    const [r] = await conn.execute(
      `INSERT INTO acordo_parcela
        (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor,
         valor_liquido, observacao, parceria_pessoa_tipo, parceria_pessoa_id, parceria_tipo,
         parceria_percentual, parceria_valor, multa_percentual, repasse_cliente_tipo, repasse_cliente_pessoa_id,
         repasse_cliente_conta_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [acordoId, p.numero || (i + 1), p.vencimento,
       v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido, v.observacao,
       v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor, multaPct,
       repasseClienteTipo, destinoParcela.pessoaId, destinoParcela.contaId]
    );
    await logParcela(conn, r.insertId, usuarioId, 'criada', null, null, `Parcela ${p.numero || (i + 1)} criada`);
  }
}

// GET /api/financeiro/acordo/:id — acordo + parcelas
async function buscarAcordo(req, res) {
  try {
    const id = lerIdFin(req.params.id);
    if (!id) return naoEncontrado(res, 'Acordo não encontrado');
    const [acordo] = await pool.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!acordo.length) return naoEncontrado(res, 'Acordo não encontrado');
    const [parcelas] = await pool.execute(
      `SELECT ap.*,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.recebimento_forma_id) AS recebimento_forma_nome
       FROM acordo_parcela ap WHERE ap.acordo_id = ? ORDER BY ap.numero ASC`,
      [id]
    );
    // Multa por atraso: no máximo uma por parcela — carregada à parte e aninhada em
    // `parcela.multa` (evita colidir nomes de coluna com a própria acordo_parcela).
    if (parcelas.length) {
      const ph = parcelas.map(() => '?').join(',');
      const [multas] = await pool.execute(
        `SELECT m.*,
                CASE m.parceria_pessoa_tipo
                  WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = m.parceria_pessoa_id)
                  WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = m.parceria_pessoa_id)
                  ELSE NULL
                END AS parceria_nome,
                (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = m.recebimento_forma_id) AS recebimento_forma_nome
         FROM acordo_parcela_multa m WHERE m.parcela_id IN (${ph})`,
        parcelas.map(p => p.id)
      );
      const multaPorParcela = new Map(multas.map(m => [m.parcela_id, m]));
      for (const p of parcelas) p.multa = multaPorParcela.get(p.id) || null;
    }
    return sucesso(res, { ...acordo[0], parcelas });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/financeiro/acordo/:id — atualiza acordo + regrava parcelas.
// Parcelas já recebidas são imutáveis; as pendentes do mesmo acordo continuam editáveis.
async function atualizarAcordo(req, res) {
  const id = lerIdFin(req.params.id);
  if (!id) return naoEncontrado(res, 'Acordo não encontrado');
  const { qtd_parcelas, data_primeira, parcelas,
    beneficiario_cliente_tipo, beneficiario_cliente_id, beneficiario_cliente_conta_id } = req.body;
  if (!Array.isArray(parcelas) || !parcelas.length) return erro(res, 'Informe as parcelas do acordo');
  const totalLido = lerDinheiro(req.body.valor_total, 'Valor total');
  if (totalLido.erro) return erro(res, 'Valor total inválido');
  const valor_total = totalLido.valor;
  const desc = texto(req.body.descricao, { rotulo: 'A descrição', max: LIMITE_TEXTO_FIN });
  if (desc.erro) return erro(res, desc.erro);
  const descricao = desc.valor;
  const entrada = await conferirParcelasEntrada(parcelas);
  if (entrada) return erro(res, entrada.erro, entrada.status);
  const primeira = dataIso(data_primeira, { rotulo: 'Data da primeira parcela' });
  if (primeira.erro) return erro(res, primeira.erro);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT id, status FROM acordo WHERE id = ? FOR UPDATE', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }
    // Cancelamento é definitivo: o acordo vira registro permanente (mesma regra do excluirAcordo).
    if (ac[0].status === 'cancelado') {
      await conn.rollback();
      return erro(res, 'Acordo cancelado é registro permanente e não pode ser editado.');
    }

    // Cliente padrão: pessoa obrigatória, conta opcional (sem conta = principal ou "em mãos" na hora do repasse).
    // O objeto é reconstruído com os dados do formulário (resolverClientePadrao devolve tipo da PESSOA, nunca o da conta).
    const destinoCliente = await resolverClientePadrao(conn, beneficiario_cliente_tipo, beneficiario_cliente_id, beneficiario_cliente_conta_id);

    // Recalcula e valida TODAS as parcelas antes de gravar qualquer coisa — inclusive que a
    // soma dos valores brutos bate EXATAMENTE com o valor total informado para o acordo.
    const calculadas = parcelas.map((p, i) => calcularValoresParcela(p, `Parcela ${p.numero || (i + 1)}`));
    const somaParcelas = round2(calculadas.reduce((s, v) => s + v.valor_bruto, 0));
    if (round2(valor_total) !== somaParcelas) {
      await conn.rollback();
      return erro(res, `A soma das parcelas (${fmtReal(somaParcelas)}) não bate com o valor total do acordo (${fmtReal(valor_total)}).`, 422);
    }

    await conn.execute(
      `UPDATE acordo SET descricao = ?, valor_total = ?, qtd_parcelas = ?, data_primeira = ?,
              beneficiario_cliente_tipo=?, beneficiario_cliente_id=?, beneficiario_cliente_conta_id=?,
              alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [descricao || null, round2(valor_total), parseInt(qtd_parcelas, 10) || parcelas.length,
       data_primeira || parcelas[0].vencimento,
       destinoCliente ? destinoCliente.tipo : null, destinoCliente ? destinoCliente.pessoaId : null,
       destinoCliente ? destinoCliente.contaId : null, req.usuario.id, id]
    );

    // Diff das parcelas — MANTÉM os IDs p/ preservar o histórico de cada parcela.
    // As recebidas ficam travadas na própria transação: não podem ser apagadas, alteradas
    // nem substituídas por uma chamada direta à API. As pendentes seguem normalmente editáveis.
    const [existentes] = await conn.execute('SELECT * FROM acordo_parcela WHERE acordo_id = ? FOR UPDATE', [id]);
    const incomingIds = parcelas.filter(p => p.id).map(p => Number(p.id));
    for (const ex of existentes.filter(p => p.status === 'pago')) {
      const indice = parcelas.findIndex(p => Number(p.id) === Number(ex.id));
      if (indice < 0) {
        await conn.rollback();
        return erro(res, `A parcela ${ex.numero} já foi recebida e não pode ser removida do acordo.`, 422);
      }
      const enviada = parcelas[indice];
      const calculada = calculadas[indice];
      const nova = { ...calculada, numero: enviada.numero || (indice + 1), vencimento: enviada.vencimento };
      const camposImutaveis = ['numero', 'vencimento', 'valor_bruto', 'honor_tipo', 'honor_percentual', 'honor_valor', 'observacao',
        'parceria_pessoa_tipo', 'parceria_pessoa_id', 'parceria_tipo', 'parceria_percentual', 'parceria_valor'];
      if (camposImutaveis.some(campo => normCmp(campo, ex[campo]) !== normCmp(campo, nova[campo]))) {
        await conn.rollback();
        return erro(res, `A parcela ${ex.numero} já foi recebida e não pode ser alterada.`, 422);
      }
    }
    for (const ex of existentes) {
      if (!incomingIds.includes(Number(ex.id)) && ex.status !== 'pago') await conn.execute('DELETE FROM acordo_parcela WHERE id = ?', [ex.id]);
    }

    for (let i = 0; i < parcelas.length; i++) {
      const p = parcelas[i];
      const v = calculadas[i];
      const numero = p.numero || (i + 1);
      const ex = p.id ? existentes.find(e => Number(e.id) === Number(p.id)) : null;
      if (ex) {
        if (ex.status === 'pago') continue;
        const novo = { ...v, vencimento: p.vencimento };
        for (const [k, label] of CAMPOS_HIST) {
          if (normCmp(k, ex[k]) !== normCmp(k, novo[k])) {
            await logParcela(conn, ex.id, req.usuario.id, 'editada', label, fmtAudit(k, ex[k]), fmtAudit(k, novo[k]));
          }
        }
        // Mudança de parceiro (resolve nomes para ficar legível)
        if (String(ex.parceria_pessoa_id || '') !== String(v.parceria_pessoa_id || '')) {
          const antesNome = await resolverNomePessoa(conn, ex.parceria_pessoa_tipo, ex.parceria_pessoa_id);
          const novoNome  = await resolverNomePessoa(conn, v.parceria_pessoa_tipo, v.parceria_pessoa_id);
          await logParcela(conn, ex.id, req.usuario.id, 'editada', 'Parceiro', antesNome || '—', novoNome || '—');
        }
        const multaPct = p.multa_percentual != null && p.multa_percentual !== '' ? Number(p.multa_percentual) : null;
        const destinoEdit = destinoClienteDaParcela(p, destinoCliente);
        const repasseClienteTipoEdit = destinoEdit.tipo;
        if (repasseClienteTipoEdit && !tiposPessoa.has(repasseClienteTipoEdit)) {
          throw erroValidacaoFinanceiro(`Tipo de beneficiário do repasse inválido na parcela ${numero}.`);
        }
        await conn.execute(
          `UPDATE acordo_parcela SET numero=?, vencimento=?, valor_bruto=?, honor_tipo=?, honor_percentual=?,
             honor_valor=?, valor_liquido=?, observacao=?, parceria_pessoa_tipo=?, parceria_pessoa_id=?,
             parceria_tipo=?, parceria_percentual=?, parceria_valor=?, multa_percentual=?, repasse_cliente_tipo=?,
             repasse_cliente_pessoa_id=?, repasse_cliente_conta_id=? WHERE id=?`,
          [numero, p.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
           v.observacao, v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual,
           v.parceria_valor, multaPct, repasseClienteTipoEdit,
           destinoEdit.pessoaId, destinoEdit.contaId, ex.id]
        );
      } else {
        const multaPct = p.multa_percentual != null && p.multa_percentual !== '' ? Number(p.multa_percentual) : null;
        const destinoNovo = destinoClienteDaParcela(p, destinoCliente);
        const repasseClienteTipoNovo = destinoNovo.tipo;
        if (repasseClienteTipoNovo && !tiposPessoa.has(repasseClienteTipoNovo)) {
          throw erroValidacaoFinanceiro(`Tipo de beneficiário do repasse inválido na parcela ${numero}.`);
        }
        const [r] = await conn.execute(
          `INSERT INTO acordo_parcela (acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_percentual,
             honor_valor, valor_liquido, observacao, parceria_pessoa_tipo, parceria_pessoa_id, parceria_tipo,
             parceria_percentual, parceria_valor, multa_percentual, repasse_cliente_tipo, repasse_cliente_pessoa_id,
             repasse_cliente_conta_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
          [id, numero, p.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
           v.observacao, v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor, multaPct,
           repasseClienteTipoNovo, destinoNovo.pessoaId, destinoNovo.contaId]
        );
        await logParcela(conn, r.insertId, req.usuario.id, 'criada', null, null, `Parcela ${numero} criada`);
      }
    }
    await auditoria.registrar(req.usuario.id, 'acordo', 'atualizar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo atualizado');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/financeiro/acordo/:id — exclui acordo (CASCADE nas parcelas). Bloqueado se houver parcela paga.
async function excluirAcordo(req, res) {
  const id = lerIdFin(req.params.id);
  if (!id) return naoEncontrado(res, 'Acordo não encontrado');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }
    if (ac[0].status === 'cancelado') {
      await conn.rollback();
      return erro(res, 'Acordo cancelado é registro permanente e não pode ser excluído.');
    }
    const [pagas] = await conn.execute(
      `SELECT COUNT(*) AS n FROM acordo_parcela WHERE acordo_id = ? AND status = 'pago'`, [id]
    );
    if (pagas[0].n > 0) {
      await conn.rollback();
      return erro(res, 'Há parcelas já recebidas. Desfaça os recebimentos antes de excluir o acordo.');
    }
    // Uma multa pode ser lançada e recebida (dinheiro já entrou, lançamento real na conta
    // corrente) mesmo com a parcela dela ainda pendente — sem esta checagem, excluir o
    // acordo apagaria a multa em cascata e deixaria esse lançamento sem dono (parcela_id
    // vira NULL) e sem jeito de desfazer, órfão pra sempre no extrato do processo.
    const [multasAtivas] = await conn.execute(
      `SELECT COUNT(*) AS n FROM acordo_parcela_multa m
       JOIN acordo_parcela ap ON ap.id = m.parcela_id
       WHERE ap.acordo_id = ? AND m.status IN ('pendente','pago')`, [id]
    );
    if (multasAtivas[0].n > 0) {
      await conn.rollback();
      return erro(res, 'Há multa lançada e/ou recebida em alguma parcela deste acordo. Receba (ou remova) e desfaça o recebimento da multa antes de excluir o acordo.');
    }
    await conn.execute('DELETE FROM acordo WHERE id = ?', [id]); // CASCADE remove as parcelas
    await auditoria.registrar(req.usuario.id, 'acordo', 'excluir', id, ac[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo excluído');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/acordo/:id/cancelar — cancela o acordo e as parcelas PENDENTES (as pagas permanecem).
// Cancelamento é DEFINITIVO; o acordo vira registro permanente (não edita/exclui mais). Exige motivo.
async function cancelarAcordo(req, res) {
  const id = lerIdFin(req.params.id);
  if (!id) return naoEncontrado(res, 'Acordo não encontrado');
  const lidoMotivo = texto(req.body.motivo, { rotulo: 'O motivo do cancelamento', max: LIMITE_TEXTO_FIN, obrigatorio: true });
  if (lidoMotivo.erro) return erro(res, lidoMotivo.erro);
  const motivo = lidoMotivo.valor;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ac] = await conn.execute('SELECT * FROM acordo WHERE id = ?', [id]);
    if (!ac.length) { await conn.rollback(); return naoEncontrado(res, 'Acordo não encontrado'); }
    if (ac[0].status === 'cancelado') { await conn.rollback(); return erro(res, 'Acordo já está cancelado'); }

    // Cancela apenas as parcelas PENDENTES; cada uma registra o evento + motivo no histórico
    const [pendentes] = await conn.execute(
      `SELECT id FROM acordo_parcela WHERE acordo_id = ? AND status = 'pendente'`, [id]
    );
    for (const p of pendentes) {
      await logParcela(conn, p.id, req.usuario.id, 'cancelada', null, null, `Cancelada — ${motivo}`);
      await conn.execute(`UPDATE acordo_parcela SET status = 'cancelada' WHERE id = ?`, [p.id]);
    }
    await conn.execute(
      `UPDATE acordo SET status = 'cancelado', alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
      [req.usuario.id, id]
    );
    await auditoria.registrar(req.usuario.id, 'acordo', 'cancelar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Acordo cancelado');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// BAIXA E REPASSES — a conta corrente espelha o dinheiro REAL que entra e sai do escritório.
// Receber parcela gera entrada do valor bruto. Repassar cliente/parceiro gera sua própria
// saída, na data e conta/caixa efetivamente usados. Honorário é o saldo que sobra do ciclo.
// ============================================================

const ORIGEM_RECEBIMENTO = 'recebimento';
const ORIGEM_REPASSE_CLIENTE = 'rep_cliente';
const ORIGEM_REPASSE_PARCEIRO = 'rep_parceiro';
const ORIGEM_MULTA = 'multa';
const ORIGEM_MULTA_REP_CLIENTE = 'multa_rep_cli';
const ORIGEM_MULTA_REP_PARCEIRO = 'multa_rep_par';

// Resolve o nome da pessoa (PF razão/nome ou PJ razão social) — usado na descrição do repasse de parceria
async function resolverNomePessoa(conn, tipo, pessoaId) {
  if (!pessoaId) return null;
  const sql = tipo === 'juridica'
    ? 'SELECT razao_social AS nome FROM pessoas_juridicas WHERE id = ?'
    : 'SELECT nome FROM pessoas_fisicas WHERE id = ?';
  const [r] = await conn.execute(sql, [pessoaId]);
  return r.length ? r[0].nome : null;
}

// PUT /api/financeiro/parcela/:id/pagar — registra o RECEBIMENTO do réu (réu → escritório).
// Captura a data, a forma de pagamento e a identificação no extrato e registra a entrada
// integral do valor bruto. Os repasses são etapas separadas, feitas somente quando pagos.
async function pagarParcela(req, res) {
  const { id } = req.params;
  const { recebido_em, recebimento_forma_id, recebimento_identificacao, recebimento_conta_financeira_id } = req.body;
  // Normaliza os campos do recebimento (forma é opcional no backend; a tela exige)
  const formaId = (recebimento_forma_id != null && recebimento_forma_id !== '' && !isNaN(parseInt(recebimento_forma_id, 10)))
    ? parseInt(recebimento_forma_id, 10) : null;
  const identificacao = (recebimento_identificacao && String(recebimento_identificacao).trim())
    ? String(recebimento_identificacao).trim() : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE: trava a linha da parcela até o commit. Sem isso, dois recebimentos
    // simultâneos da MESMA parcela liam "pendente" ao mesmo tempo e geravam
    // lançamento em dobro na conta corrente.
    const [rows] = await conn.execute(
      `SELECT ap.*, a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas
       FROM acordo_parcela ap
       JOIN acordo a ON ap.acordo_id = a.id WHERE ap.id = ? FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status === 'pago')      { await conn.rollback(); return erro(res, 'Parcela já está recebida'); }
    if (parc.status === 'cancelada') { await conn.rollback(); return erro(res, 'Esta parcela está cancelada e não pode ser recebida.'); }

    // Parcela e multa são independentes (regra do usuário, 09/10/2026): a empresa pode pagar a
    // parcela antes da multa (ou o contrário), então uma multa pendente NÃO trava o recebimento.

    const dataPg = recebido_em || hojeBrasilia();
    const contaEscritorio = await resolverContaEscritorio(conn, recebimento_conta_financeira_id);
    const formaPagamento = await resolverFormaPagamento(conn, formaId, contaEscritorio.tipo);

    // Número do acordo na ordem de criação DENTRO do processo (1, 2, 3...).
    // Derivado do próprio id (auto_increment): conta quantos acordos do processo foram criados até este.
    // Permite identificar a qual acordo a parcela pertence quando o processo tem mais de um.
    const [accNum] = await conn.execute(
      'SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND tipo = ? AND id <= ?',
      [parc.processo_id, parc.acordo_tipo, parc.acordo_id]
    );
    const numeroAcordo = accNum[0].n;
    const palavraAcordo = parc.acordo_tipo === 'alvara' ? 'alvará' : 'acordo';  // texto na conta corrente

    // ENTRADA = valor efetivamente recebido pelo escritório. Honorário, cliente e parceiro
    // são apurados pelo ciclo completo; nenhum repasse é lançado antes de ser confirmado.
    const bruto = Number(parc.valor_bruto) || 0;
    const descRecebimento = `Recebimento — parc ${parc.numero}/${parc.total_parcelas} do ${palavraAcordo} ${numeroAcordo}` + (parc.observacao ? ` (${parc.observacao})` : '');
    await conn.execute(
      `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id, conta_financeira_id)
       VALUES (?, ?, ?, ?, 'entrada', ?, ?, ?, ?)`,
      [parc.processo_id, id, dataPg, descRecebimento, bruto, ORIGEM_RECEBIMENTO, req.usuario.id, contaEscritorio.id]
    );

    await conn.execute(
      `UPDATE acordo_parcela
         SET status = 'pago', recebido_em = ?, recebimento_forma_id = ?, recebimento_identificacao = ?,
             recebimento_conta_financeira_id = ?
       WHERE id = ?`,
      [dataPg, formaId, identificacao, contaEscritorio.id, id]
    );
    await logParcela(conn, id, req.usuario.id, 'recebida', null, null, `Recebida em ${String(dataPg).slice(0,10).split('-').reverse().join('/')} — ${contaEscritorio.nome} (${formaPagamento.nome})`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'pagar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Parcela recebida');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/desfazer — apaga os lançamentos da parcela e volta para pendente
async function desfazerPagamento(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE: mesma trava usada em pagarParcela — sem ela, dois "desfazer" simultâneos
    // na mesma parcela liam status='pago' ao mesmo tempo e ambos tentavam apagar o mesmo
    // lançamento da conta corrente.
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status !== 'pago') { await conn.rollback(); return erro(res, 'Parcela não está recebida'); }
    // Não dá para desfazer o recebimento enquanto houver repasse baseado nele:
    // o usuário precisa desfazer o(s) repasse(s) (cliente/parceiro) primeiro.
    if (parc.repasse_cliente_em || parc.repasse_parceiro_em) {
      await conn.rollback();
      return erro(res, 'Desfaça os repasses (cliente/parceiro) antes de desfazer o recebimento');
    }
    // Parcela e multa são independentes: desfazer a parcela NUNCA mexe nos lançamentos da multa
    // (recebimento e repasses dela), que têm origem própria. Sem repasses ativos, todo o resto
    // vinculado à parcela pertence ao recebimento (inclusive lançamentos do modelo antigo, sem origem).
    await conn.execute(
      'DELETE FROM conta_corrente WHERE parcela_id = ? AND (origem IS NULL OR origem NOT IN (?, ?, ?))',
      [id, ORIGEM_MULTA, ORIGEM_MULTA_REP_CLIENTE, ORIGEM_MULTA_REP_PARCEIRO]
    );
    await conn.execute(
      `UPDATE acordo_parcela
         SET status = 'pendente', recebido_em = NULL, recebimento_forma_id = NULL,
             recebimento_identificacao = NULL, recebimento_conta_financeira_id = NULL
       WHERE id = ?`, [id]
    );
    await logParcela(conn, id, req.usuario.id, 'recebimento-desfeito', null, null, 'Recebimento desfeito');
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'desfazer-pagamento', id, parc, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Recebimento desfeito');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/financeiro/parcela/:id/historico — eventos da parcela (criada/editada/recebida/desfeita)
async function buscarHistoricoParcela(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.acao, ap.campo_alterado, ap.valor_anterior, ap.valor_novo, ap.criado_em,
              u.nome AS usuario_nome
       FROM auditoria_parcela ap
       LEFT JOIN usuarios u ON ap.usuario_id = u.id
       WHERE ap.parcela_id = ?
       ORDER BY ap.criado_em ASC, ap.id ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// REPASSES — pagamento do escritório ao cliente e/ou ao parceiro.
// Acontecem depois do recebimento, em datas, contas e formas independentes, e cada um
// cria sua própria saída na conta corrente. A ordem entre cliente e parceiro é livre.
// ============================================================

// Mapa controlado tipo -> colunas (evita repetição e blinda contra injeção:
// os nomes de coluna saem SEMPRE deste whitelist, nunca do req).
const COLS_REPASSE = {
  cliente:  { em: 'repasse_cliente_em',  forma: 'repasse_cliente_forma_id',  por: 'repasse_cliente_por',  contaEscritorio: 'repasse_cliente_conta_financeira_id', contaDestino: 'repasse_cliente_conta_id', destinoTipo: 'repasse_cliente_destino_tipo', snapshot: 'repasse_cliente_destino_snapshot', observacao: 'repasse_cliente_observacao', rotulo: 'cliente' },
  parceiro: { em: 'repasse_parceiro_em', forma: 'repasse_parceiro_forma_id', por: 'repasse_parceiro_por', contaEscritorio: 'repasse_parceiro_conta_financeira_id', contaDestino: 'repasse_parceiro_conta_id', destinoTipo: 'repasse_parceiro_destino_tipo', snapshot: 'repasse_parceiro_destino_snapshot', observacao: 'repasse_parceiro_observacao', rotulo: 'parceiro' },
};

// PUT /api/financeiro/parcela/:id/repasse — registra o repasse ao cliente OU ao parceiro.
// Body: { tipo: 'cliente'|'parceiro', data, forma_id, observacao }
async function registrarRepasse(req, res) {
  const { id } = req.params;
  const { tipo, data, forma_id, conta_financeira_id, conta_bancaria_id, beneficiario_tipo, beneficiario_id, destino_tipo, observacao } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const dataRep = data || hojeBrasilia();
  const formaId = (forma_id != null && forma_id !== '' && !isNaN(parseInt(forma_id, 10))) ? parseInt(forma_id, 10) : null;
  const observacaoRepasse = String(observacao || '').trim();
  if (observacaoRepasse.length > 1000) return erro(res, 'A observação do repasse pode ter no máximo 1.000 caracteres.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT ap.*, a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas
         FROM acordo_parcela ap JOIN acordo a ON a.id = ap.acordo_id
        WHERE ap.id = ? FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status !== 'pago') { await conn.rollback(); return erro(res, 'Registre o recebimento do réu antes de repassar'); }
    if (tipo === 'parceiro' && !parc.parceria_pessoa_id) { await conn.rollback(); return erro(res, 'Esta parcela não tem parceria'); }
    if (parc[cfg.em]) { await conn.rollback(); return erro(res, `Repasse ao ${cfg.rotulo} já registrado`); }
    const valorRepasse = tipo === 'cliente' ? Number(parc.valor_liquido) : Number(parc.parceria_valor);
    if (valorRepasse <= 0) { await conn.rollback(); return erro(res, `Não há valor de repasse ao ${cfg.rotulo} nesta parcela.`); }

    const tipoDestino = destino_tipo === 'em_maos' ? 'em_maos' : 'bancaria';
    const contaEscritorio = await resolverContaEscritorio(conn, conta_financeira_id);
    const tipoContaDestino = tipoDestino === 'em_maos' ? 'especie' : 'bancaria';
    const formaPagamento = await resolverFormaPagamento(conn, formaId, tipoContaDestino);
    if (formaPagamento.uso_permitido !== 'ambos' && formaPagamento.uso_permitido !== (tipoDestino === 'em_maos' ? 'especie' : 'financeira')) {
      throw erroValidacaoFinanceiro(tipoDestino === 'em_maos'
        ? 'O repasse em mãos exige uma forma de pagamento disponível para dinheiro em espécie.'
        : 'O repasse para conta bancária exige uma forma de pagamento disponível para instituição financeira.');
    }
    const destinoTipo = tipo === 'cliente' ? (beneficiario_tipo || parc.repasse_cliente_tipo) : parc.parceria_pessoa_tipo;
    const destinoPessoa = tipo === 'cliente' ? (beneficiario_id || parc.repasse_cliente_pessoa_id) : parc.parceria_pessoa_id;
    if (!tiposPessoa.has(destinoTipo) || !inteiroPositivo(destinoPessoa)) {
      throw erroValidacaoFinanceiro('Informe o beneficiário do repasse.');
    }
    const destinoConta = tipoDestino === 'bancaria' ? (conta_bancaria_id || parc[cfg.contaDestino]) : null;
    const contaDestino = tipoDestino === 'bancaria'
      ? await resolverContaPessoa(conn, destinoTipo, destinoPessoa, destinoConta)
      : null;
    const nomeBeneficiario = tipo === 'parceiro'
      ? await resolverNomePessoa(conn, parc.parceria_pessoa_tipo, parc.parceria_pessoa_id)
      : await resolverNomePessoa(conn, destinoTipo, destinoPessoa);
    const snapshot = tipoDestino === 'bancaria'
      ? JSON.stringify({ tipo: destinoTipo, pessoa_id: Number(destinoPessoa), conta_id: contaDestino.id,
        titular: contaDestino.titular, documento_titular: contaDestino.documento_titular,
        instituicao: contaDestino.instituicao_nome, agencia: contaDestino.agencia, numero: contaDestino.numero,
        digito: contaDestino.digito, chave_pix: contaDestino.chave_pix, conta_terceiro: !!contaDestino.conta_terceiro,
        observacao: contaDestino.observacao || null })
      : JSON.stringify({ tipo: destinoTipo, pessoa_id: Number(destinoPessoa), titular: nomeBeneficiario, destino: 'em_maos' });
    await conn.execute(`UPDATE acordo_parcela SET ${cfg.em} = ?, ${cfg.forma} = ?, ${cfg.por} = ?,
      ${cfg.contaEscritorio} = ?, ${cfg.contaDestino} = ?, ${cfg.destinoTipo} = ?, ${cfg.snapshot} = ?, ${cfg.observacao} = ? WHERE id = ?`,
      [dataRep, formaId, req.usuario.id, contaEscritorio.id, contaDestino ? contaDestino.id : null, tipoDestino, snapshot, observacaoRepasse || null, id]);

    const [accNum] = await conn.execute(
      'SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND tipo = ? AND id <= ?',
      [parc.processo_id, parc.acordo_tipo, parc.acordo_id]
    );
    const numeroAcordo = accNum[0].n;
    const palavraAcordo = parc.acordo_tipo === 'alvara' ? 'alvará' : 'acordo';
    const nomeDestino = nomeBeneficiario || (tipo === 'cliente' ? 'cliente' : 'parceiro');
    const origemLancamento = tipo === 'cliente' ? ORIGEM_REPASSE_CLIENTE : ORIGEM_REPASSE_PARCEIRO;
    await conn.execute(
      `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id, conta_financeira_id)
       VALUES (?, ?, ?, ?, 'saida', ?, ?, ?, ?)`,
      [parc.processo_id, id, dataRep,
      `Repasse da parcela ao ${tipo === 'cliente' ? 'cliente' : 'parceiro'} ${nomeDestino}${tipoDestino === 'em_maos' ? ' — em mãos' : ''} — parc ${parc.numero}/${parc.total_parcelas} do ${palavraAcordo} ${numeroAcordo}`,
       valorRepasse, origemLancamento, req.usuario.id, contaEscritorio.id]
    );

    // Resolve o nome da forma para gravar legível no histórico (regra: nomes na escrita)
    const formaNome = formaPagamento.nome;
    const dataBR = String(dataRep).slice(0, 10).split('-').reverse().join('/');
    await logParcela(conn, id, req.usuario.id, `repasse-${cfg.rotulo}`, null, null,
      `Repasse ao ${cfg.rotulo} em ${dataBR}${formaNome ? ' (' + formaNome + ')' : ''}${tipoDestino === 'em_maos' ? ' — entregue em mãos' : ''} — ${contaEscritorio.nome}${observacaoRepasse ? ' — Obs.: ' + observacaoRepasse : ''}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', `repasse-${cfg.rotulo}`, id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse ao ${cfg.rotulo} registrado`);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/repasse/desfazer — desfaz o repasse ao cliente OU ao parceiro.
// Body: { tipo: 'cliente'|'parceiro' }
async function desfazerRepasse(req, res) {
  const { id } = req.params;
  const { tipo } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    if (!rows[0][cfg.em]) { await conn.rollback(); return erro(res, `Não há repasse ao ${cfg.rotulo} para desfazer`); }

    const origemLancamento = tipo === 'cliente' ? ORIGEM_REPASSE_CLIENTE : ORIGEM_REPASSE_PARCEIRO;
    await conn.execute('DELETE FROM conta_corrente WHERE parcela_id=? AND origem=?', [id, origemLancamento]);
    await conn.execute(`UPDATE acordo_parcela SET ${cfg.em}=NULL, ${cfg.forma}=NULL, ${cfg.por}=NULL,
      ${cfg.contaEscritorio}=NULL, ${cfg.contaDestino}=NULL, ${cfg.destinoTipo}=NULL, ${cfg.snapshot}=NULL, ${cfg.observacao}=NULL WHERE id=?`, [id]);
    await logParcela(conn, id, req.usuario.id, `repasse-${cfg.rotulo}-desfeito`, null, null, `Repasse ao ${cfg.rotulo} desfeito`);
    // logs_auditoria.acao é varchar(20): manter a ação global curta (o detalhe vai no histórico da parcela acima)
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'desfazer-repasse', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse ao ${cfg.rotulo} desfeito`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// MULTA POR ATRASO — nasce presa a UMA parcela (parcela_id é UNIQUE em
// acordo_parcela_multa). Segue o mesmo ciclo em 2 tempos que a parcela: lançar
// (percentual + valor + vencimento, sem tocar na conta corrente) -> receber (só
// aqui nasce a entrada, separada, no extrato) -> repasse ao cliente/parceiro
// (opcional, exatamente como o repasse de uma parcela normal). Honorário e
// parceria usam o MESMO honor_tipo/percentual e parceria_tipo/percentual já
// configurados na parcela — não se pede de novo (auditoria 23/09).
// Parcela e multa são independentes (09/10/2026): receber/desfazer uma não depende da outra
// (ver pagarParcela e desfazerPagamento, que não mexem nos lançamentos da multa).
// ============================================================

async function buscarMultaDaParcela(conn, parcelaId, forUpdate = false) {
  const [rows] = await conn.execute(
    `SELECT * FROM acordo_parcela_multa WHERE parcela_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [parcelaId]
  );
  return rows[0] || null;
}

// Recalcula honorário/líquido/parceria da multa herdando o honor_tipo/percentual e
// parceria_tipo/percentual JÁ GRAVADOS nesta parcela — nunca aceita esses percentuais
// vindos do corpo da requisição (evita que a multa seja calculada com regra diferente
// da própria parcela que a originou).
function calcularValoresMulta(parc, body, rotulo) {
  if (!body.vencimento) throw erroValidacaoFinanceiro(`${rotulo}: informe a data em que a multa deve ser paga.`);
  const repasseCliente = !!body.repasse_cliente_habilitado;
  const repasseParceiro = !!body.repasse_parceiro_habilitado;
  if (repasseParceiro && !parc.parceria_pessoa_id) {
    throw erroValidacaoFinanceiro(`${rotulo}: esta parcela não tem parceria — não é possível habilitar o repasse ao parceiro.`);
  }
  const calc = calcularValoresParcela({
    valor_bruto: body.valor_bruto, honor_tipo: parc.honor_tipo, honor_percentual: parc.honor_percentual, honor_valor: parc.honor_valor,
    parceria_pessoa_id: repasseParceiro ? parc.parceria_pessoa_id : null, parceria_pessoa_tipo: parc.parceria_pessoa_tipo,
    parceria_tipo: parc.parceria_tipo, parceria_percentual: parc.parceria_percentual, parceria_valor: parc.parceria_valor,
  }, rotulo);
  return {
    percentual_juiz: body.percentual_juiz != null && body.percentual_juiz !== '' ? Number(body.percentual_juiz) : null,
    vencimento: body.vencimento, valor_bruto: calc.valor_bruto,
    honor_tipo: calc.honor_tipo, honor_percentual: calc.honor_percentual, honor_valor: calc.honor_valor, valor_liquido: calc.valor_liquido,
    repasse_cliente_habilitado: repasseCliente ? 1 : 0,
    repasse_cliente_tipo: repasseCliente ? (parc.repasse_cliente_tipo || null) : null,
    repasse_cliente_pessoa_id: repasseCliente ? (parc.repasse_cliente_pessoa_id || null) : null,
    repasse_cliente_conta_id: repasseCliente ? (parc.repasse_cliente_conta_id || null) : null,
    parceria_pessoa_tipo: calc.parceria_pessoa_tipo, parceria_pessoa_id: calc.parceria_pessoa_id,
    parceria_tipo: calc.parceria_tipo, parceria_percentual: calc.parceria_percentual, parceria_valor: calc.parceria_valor,
    repasse_parceiro_habilitado: repasseParceiro ? 1 : 0,
  };
}

// POST /api/financeiro/parcela/:id/multa — lança a multa desta parcela (ainda não vai para o extrato).
// Body: { percentual_juiz, valor_bruto, vencimento, repasse_cliente_habilitado, repasse_parceiro_habilitado }
async function lancarMulta(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    if (parc.status !== 'pendente') { await conn.rollback(); return erro(res, 'Só é possível lançar multa em uma parcela ainda não recebida.'); }
    if (await buscarMultaDaParcela(conn, id)) { await conn.rollback(); return erro(res, 'Já existe uma multa lançada para esta parcela. Edite ou remova a existente.'); }

    const v = calcularValoresMulta(parc, req.body, 'A multa');
    const [r] = await conn.execute(
      `INSERT INTO acordo_parcela_multa
        (parcela_id, percentual_juiz, vencimento, valor_bruto, honor_tipo, honor_percentual, honor_valor, valor_liquido,
         repasse_cliente_habilitado, repasse_cliente_tipo, repasse_cliente_pessoa_id, repasse_cliente_conta_id,
         parceria_pessoa_tipo, parceria_pessoa_id, parceria_tipo, parceria_percentual, parceria_valor,
         repasse_parceiro_habilitado, status, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
      [id, v.percentual_juiz, v.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
       v.repasse_cliente_habilitado, v.repasse_cliente_tipo, v.repasse_cliente_pessoa_id, v.repasse_cliente_conta_id,
       v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor,
       v.repasse_parceiro_habilitado, req.usuario.id]
    );
    const dataBR = String(v.vencimento).slice(0, 10).split('-').reverse().join('/');
    await logParcela(conn, id, req.usuario.id, 'multa-lancada', null, null, `Multa lançada: ${fmtReal(v.valor_bruto)} — vencimento ${dataBR}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'multa-lancar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, { id: r.insertId }, 'Multa lançada', 201);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/multa — edita a multa (só enquanto ainda não foi recebida).
async function editarMulta(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM acordo_parcela WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Parcela não encontrada'); }
    const parc = rows[0];
    const multa = await buscarMultaDaParcela(conn, id, true);
    if (!multa) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    if (multa.status !== 'pendente') { await conn.rollback(); return erro(res, 'A multa já foi recebida e não pode mais ser editada.'); }

    const v = calcularValoresMulta(parc, req.body, 'A multa');
    await conn.execute(
      `UPDATE acordo_parcela_multa SET percentual_juiz=?, vencimento=?, valor_bruto=?, honor_tipo=?, honor_percentual=?,
         honor_valor=?, valor_liquido=?, repasse_cliente_habilitado=?, repasse_cliente_tipo=?, repasse_cliente_pessoa_id=?,
         repasse_cliente_conta_id=?, parceria_pessoa_tipo=?, parceria_pessoa_id=?, parceria_tipo=?, parceria_percentual=?,
         parceria_valor=?, repasse_parceiro_habilitado=? WHERE parcela_id=?`,
      [v.percentual_juiz, v.vencimento, v.valor_bruto, v.honor_tipo, v.honor_percentual, v.honor_valor, v.valor_liquido,
       v.repasse_cliente_habilitado, v.repasse_cliente_tipo, v.repasse_cliente_pessoa_id, v.repasse_cliente_conta_id,
       v.parceria_pessoa_tipo, v.parceria_pessoa_id, v.parceria_tipo, v.parceria_percentual, v.parceria_valor,
       v.repasse_parceiro_habilitado, id]
    );
    const dataBR = String(v.vencimento).slice(0, 10).split('-').reverse().join('/');
    await logParcela(conn, id, req.usuario.id, 'multa-editada', null, null, `Multa editada: ${fmtReal(v.valor_bruto)} — vencimento ${dataBR}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'multa-editar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Multa atualizada');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/financeiro/parcela/:id/multa — remove a multa (só enquanto ainda não foi recebida).
async function removerMulta(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const multa = await buscarMultaDaParcela(conn, id, true);
    if (!multa) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    if (multa.status !== 'pendente') { await conn.rollback(); return erro(res, 'Desfaça o recebimento da multa antes de removê-la.'); }
    await conn.execute('DELETE FROM acordo_parcela_multa WHERE parcela_id = ?', [id]);
    await logParcela(conn, id, req.usuario.id, 'multa-removida', null, null, 'Multa removida');
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'multa-remover', id, multa, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Multa removida');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/multa/receber — registra o recebimento da multa: só agora
// nasce a entrada (separada da entrada da parcela) na conta corrente.
async function receberMulta(req, res) {
  const { id } = req.params;
  const { recebido_em, recebimento_forma_id, recebimento_identificacao, recebimento_conta_financeira_id } = req.body;
  const formaId = (recebimento_forma_id != null && recebimento_forma_id !== '' && !isNaN(parseInt(recebimento_forma_id, 10)))
    ? parseInt(recebimento_forma_id, 10) : null;
  const identificacao = (recebimento_identificacao && String(recebimento_identificacao).trim())
    ? String(recebimento_identificacao).trim() : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT m.*, ap.numero, a.processo_id, a.tipo AS acordo_tipo, a.id AS acordo_id,
              (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas
       FROM acordo_parcela_multa m
       JOIN acordo_parcela ap ON ap.id = m.parcela_id
       JOIN acordo a ON a.id = ap.acordo_id
       WHERE m.parcela_id = ? FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    const multa = rows[0];
    if (multa.status === 'pago') { await conn.rollback(); return erro(res, 'A multa já está recebida'); }

    const dataPg = recebido_em || hojeBrasilia();
    const contaEscritorio = await resolverContaEscritorio(conn, recebimento_conta_financeira_id);
    const formaPagamento = await resolverFormaPagamento(conn, formaId, contaEscritorio.tipo);

    const [accNum] = await conn.execute(
      'SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND tipo = ? AND id <= ?',
      [multa.processo_id, multa.acordo_tipo, multa.acordo_id]
    );
    const numeroAcordo = accNum[0].n;
    const palavraAcordo = multa.acordo_tipo === 'alvara' ? 'alvará' : 'acordo';
    const descRecebimento = `Multa por atraso — parc ${multa.numero}/${multa.total_parcelas} do ${palavraAcordo} ${numeroAcordo}`;
    await conn.execute(
      `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id, conta_financeira_id)
       VALUES (?, ?, ?, ?, 'entrada', ?, ?, ?, ?)`,
      [multa.processo_id, id, dataPg, descRecebimento, Number(multa.valor_bruto), ORIGEM_MULTA, req.usuario.id, contaEscritorio.id]
    );
    await conn.execute(
      `UPDATE acordo_parcela_multa
         SET status = 'pago', recebido_em = ?, recebimento_forma_id = ?, recebimento_identificacao = ?,
             recebimento_conta_financeira_id = ?
       WHERE parcela_id = ?`,
      [dataPg, formaId, identificacao, contaEscritorio.id, id]
    );
    await logParcela(conn, id, req.usuario.id, 'multa-recebida', null, null,
      `Multa recebida em ${String(dataPg).slice(0,10).split('-').reverse().join('/')} — ${contaEscritorio.nome} (${formaPagamento.nome})`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'multa-pagar', id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Multa recebida');
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/multa/desfazer — desfaz o recebimento da multa.
async function desfazerMulta(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const multa = await buscarMultaDaParcela(conn, id, true);
    if (!multa) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    if (multa.status !== 'pago') { await conn.rollback(); return erro(res, 'A multa não está recebida'); }
    if (multa.repasse_cliente_em || multa.repasse_parceiro_em) {
      await conn.rollback();
      return erro(res, 'Desfaça os repasses da multa (cliente/parceiro) antes de desfazer o recebimento dela');
    }
    await conn.execute(`DELETE FROM conta_corrente WHERE parcela_id = ? AND origem = ?`, [id, ORIGEM_MULTA]);
    await conn.execute(
      `UPDATE acordo_parcela_multa
         SET status = 'pendente', recebido_em = NULL, recebimento_forma_id = NULL,
             recebimento_identificacao = NULL, recebimento_conta_financeira_id = NULL
       WHERE parcela_id = ?`, [id]
    );
    await logParcela(conn, id, req.usuario.id, 'multa-recebimento-desfeito', null, null, 'Recebimento da multa desfeito');
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', 'multa-desfazer', id, multa, null, conn);
    await conn.commit();
    return sucesso(res, null, 'Recebimento da multa desfeito');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/multa/repasse — repassa a multa ao cliente OU ao parceiro
// (só depois de recebida). Mesma mecânica de registrarRepasse, aplicada à multa da parcela.
async function registrarRepasseMulta(req, res) {
  const { id } = req.params;
  const { tipo, data, forma_id, conta_financeira_id, conta_bancaria_id, beneficiario_tipo, beneficiario_id, destino_tipo, observacao } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const dataRep = data || hojeBrasilia();
  const formaId = (forma_id != null && forma_id !== '' && !isNaN(parseInt(forma_id, 10))) ? parseInt(forma_id, 10) : null;
  const observacaoRepasse = String(observacao || '').trim();
  if (observacaoRepasse.length > 1000) return erro(res, 'A observação do repasse pode ter no máximo 1.000 caracteres.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT m.*, ap.numero, a.processo_id, a.tipo AS acordo_tipo, a.id AS acordo_id,
              (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas
       FROM acordo_parcela_multa m
       JOIN acordo_parcela ap ON ap.id = m.parcela_id
       JOIN acordo a ON a.id = ap.acordo_id
       WHERE m.parcela_id = ? FOR UPDATE`, [id]
    );
    if (!rows.length) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    const multa = rows[0];
    if (multa.status !== 'pago') { await conn.rollback(); return erro(res, 'Registre o recebimento da multa antes de repassar'); }
    if (tipo === 'cliente' && !multa.repasse_cliente_habilitado) { await conn.rollback(); return erro(res, 'Esta multa não está habilitada para repasse ao cliente'); }
    if (tipo === 'parceiro' && (!multa.repasse_parceiro_habilitado || !multa.parceria_pessoa_id)) { await conn.rollback(); return erro(res, 'Esta multa não está habilitada para repasse ao parceiro'); }
    if (multa[cfg.em]) { await conn.rollback(); return erro(res, `Repasse da multa ao ${cfg.rotulo} já registrado`); }
    const valorRepasse = tipo === 'cliente' ? Number(multa.valor_liquido) : Number(multa.parceria_valor);
    if (valorRepasse <= 0) { await conn.rollback(); return erro(res, `Não há valor de repasse ao ${cfg.rotulo} nesta multa.`); }

    const tipoDestino = destino_tipo === 'em_maos' ? 'em_maos' : 'bancaria';
    const contaEscritorio = await resolverContaEscritorio(conn, conta_financeira_id);
    const tipoContaDestino = tipoDestino === 'em_maos' ? 'especie' : 'bancaria';
    const formaPagamento = await resolverFormaPagamento(conn, formaId, tipoContaDestino);
    if (formaPagamento.uso_permitido !== 'ambos' && formaPagamento.uso_permitido !== (tipoDestino === 'em_maos' ? 'especie' : 'financeira')) {
      throw erroValidacaoFinanceiro(tipoDestino === 'em_maos'
        ? 'O repasse em mãos exige uma forma de pagamento disponível para dinheiro em espécie.'
        : 'O repasse para conta bancária exige uma forma de pagamento disponível para instituição financeira.');
    }
    const destinoTipo = tipo === 'cliente' ? (beneficiario_tipo || multa.repasse_cliente_tipo) : multa.parceria_pessoa_tipo;
    const destinoPessoa = tipo === 'cliente' ? (beneficiario_id || multa.repasse_cliente_pessoa_id) : multa.parceria_pessoa_id;
    if (!tiposPessoa.has(destinoTipo) || !inteiroPositivo(destinoPessoa)) {
      throw erroValidacaoFinanceiro('Informe o beneficiário do repasse.');
    }
    const destinoConta = tipoDestino === 'bancaria' ? (conta_bancaria_id || multa[cfg.contaDestino]) : null;
    const contaDestino = tipoDestino === 'bancaria'
      ? await resolverContaPessoa(conn, destinoTipo, destinoPessoa, destinoConta)
      : null;
    const nomeBeneficiario = tipo === 'parceiro'
      ? await resolverNomePessoa(conn, multa.parceria_pessoa_tipo, multa.parceria_pessoa_id)
      : await resolverNomePessoa(conn, destinoTipo, destinoPessoa);
    const snapshot = tipoDestino === 'bancaria'
      ? JSON.stringify({ tipo: destinoTipo, pessoa_id: Number(destinoPessoa), conta_id: contaDestino.id,
        titular: contaDestino.titular, documento_titular: contaDestino.documento_titular,
        instituicao: contaDestino.instituicao_nome, agencia: contaDestino.agencia, numero: contaDestino.numero,
        digito: contaDestino.digito, chave_pix: contaDestino.chave_pix, conta_terceiro: !!contaDestino.conta_terceiro,
        observacao: contaDestino.observacao || null })
      : JSON.stringify({ tipo: destinoTipo, pessoa_id: Number(destinoPessoa), titular: nomeBeneficiario, destino: 'em_maos' });
    await conn.execute(`UPDATE acordo_parcela_multa SET ${cfg.em} = ?, ${cfg.forma} = ?, ${cfg.por} = ?,
      ${cfg.contaEscritorio} = ?, ${cfg.contaDestino} = ?, ${cfg.destinoTipo} = ?, ${cfg.snapshot} = ?, ${cfg.observacao} = ? WHERE parcela_id = ?`,
      [dataRep, formaId, req.usuario.id, contaEscritorio.id, contaDestino ? contaDestino.id : null, tipoDestino, snapshot, observacaoRepasse || null, id]);

    const [accNum] = await conn.execute(
      'SELECT COUNT(*) AS n FROM acordo WHERE processo_id = ? AND tipo = ? AND id <= ?',
      [multa.processo_id, multa.acordo_tipo, multa.acordo_id]
    );
    const numeroAcordo = accNum[0].n;
    const palavraAcordo = multa.acordo_tipo === 'alvara' ? 'alvará' : 'acordo';
    const nomeDestino = nomeBeneficiario || (tipo === 'cliente' ? 'cliente' : 'parceiro');
    const origemLancamento = tipo === 'cliente' ? ORIGEM_MULTA_REP_CLIENTE : ORIGEM_MULTA_REP_PARCEIRO;
    await conn.execute(
      `INSERT INTO conta_corrente (processo_id, parcela_id, data, descricao, tipo, valor, origem, usuario_id, conta_financeira_id)
       VALUES (?, ?, ?, ?, 'saida', ?, ?, ?, ?)`,
      [multa.processo_id, id, dataRep,
      `Repasse da multa ao ${tipo === 'cliente' ? 'cliente' : 'parceiro'} ${nomeDestino}${tipoDestino === 'em_maos' ? ' — em mãos' : ''} — parc ${multa.numero}/${multa.total_parcelas} do ${palavraAcordo} ${numeroAcordo}`,
       valorRepasse, origemLancamento, req.usuario.id, contaEscritorio.id]
    );

    const formaNome = formaPagamento.nome;
    const dataBR = String(dataRep).slice(0, 10).split('-').reverse().join('/');
    await logParcela(conn, id, req.usuario.id, `multa-rep-${cfg.rotulo}`, null, null,
      `Repasse da multa ao ${cfg.rotulo} em ${dataBR}${formaNome ? ' (' + formaNome + ')' : ''}${tipoDestino === 'em_maos' ? ' — entregue em mãos' : ''} — ${contaEscritorio.nome}${observacaoRepasse ? ' — Obs.: ' + observacaoRepasse : ''}`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', `multa-rep-${tipo === 'cliente' ? 'cli' : 'par'}`, id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse da multa ao ${cfg.rotulo} registrado`);
  } catch (err) {
    await conn.rollback();
    if (err.codigoValidacaoFinanceiro) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/financeiro/parcela/:id/multa/repasse/desfazer — desfaz o repasse da multa ao cliente OU ao parceiro.
async function desfazerRepasseMulta(req, res) {
  const { id } = req.params;
  const { tipo } = req.body;
  const cfg = COLS_REPASSE[tipo];
  if (!cfg) return erro(res, 'Tipo de repasse inválido');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const multa = await buscarMultaDaParcela(conn, id, true);
    if (!multa) { await conn.rollback(); return naoEncontrado(res, 'Esta parcela não tem multa lançada'); }
    if (!multa[cfg.em]) { await conn.rollback(); return erro(res, `Não há repasse da multa ao ${cfg.rotulo} para desfazer`); }

    const origemLancamento = tipo === 'cliente' ? ORIGEM_MULTA_REP_CLIENTE : ORIGEM_MULTA_REP_PARCEIRO;
    await conn.execute('DELETE FROM conta_corrente WHERE parcela_id=? AND origem=?', [id, origemLancamento]);
    await conn.execute(`UPDATE acordo_parcela_multa SET ${cfg.em}=NULL, ${cfg.forma}=NULL, ${cfg.por}=NULL,
      ${cfg.contaEscritorio}=NULL, ${cfg.contaDestino}=NULL, ${cfg.destinoTipo}=NULL, ${cfg.snapshot}=NULL, ${cfg.observacao}=NULL WHERE parcela_id=?`, [id]);
    await logParcela(conn, id, req.usuario.id, `multa-rep-${cfg.rotulo}-desfeito`, null, null, `Repasse da multa ao ${cfg.rotulo} desfeito`);
    await auditoria.registrar(req.usuario.id, 'acordo_parcela', `multa-rep-${tipo === 'cliente' ? 'cli' : 'par'}-des`, id, null, null, conn);
    await conn.commit();
    return sucesso(res, null, `Repasse da multa ao ${cfg.rotulo} desfeito`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// Filtro opcional ?processo_id= das duas listas de repasses (a aba Financeiro da pasta mostra só o processo aberto).
// Sem o parâmetro, a lista continua global. Valor que não é número inteiro = 400 (nunca vira "sem filtro").
function filtroProcessoRepasses(req) {
  const bruto = req.query.processo_id;
  if (bruto === undefined || bruto === '') return { sql: '', params: [] };
  if (typeof bruto !== 'string' || !/^\d{1,15}$/.test(bruto)) return { erro: 'Processo inválido' };
  return { sql: ' AND a.processo_id = ?', params: [Number(bruto)] };
}

// GET /api/financeiro/repasses-pendentes — worklist GLOBAL: parcelas já recebidas do réu
// que ainda têm repasse pendente (ao cliente e/ou ao parceiro), + multas recebidas na mesma situação.
async function listarRepassesPendentes(req, res) {
  try {
    const fp = filtroProcessoRepasses(req);
    if (fp.erro) return erro(res, fp.erro, 400);
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.numero, ap.recebido_em, ap.valor_liquido,
              ap.parceria_pessoa_tipo, ap.parceria_pessoa_id, ap.parceria_valor,
              ap.repasse_cliente_tipo, ap.repasse_cliente_pessoa_id, ap.repasse_cliente_conta_id,
              ap.repasse_cliente_em, ap.repasse_parceiro_em,
              ap.repasse_cliente_destino_tipo, ap.repasse_parceiro_destino_tipo,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              a.beneficiario_cliente_tipo AS acordo_cliente_tipo, a.beneficiario_cliente_id AS acordo_cliente_id,
              a.beneficiario_cliente_conta_id AS acordo_cliente_conta_id,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela ap
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       WHERE ap.status = 'pago'
         AND (
           (ap.valor_liquido > 0 AND ap.repasse_cliente_em IS NULL)
           OR (ap.parceria_pessoa_id IS NOT NULL AND ap.repasse_parceiro_em IS NULL)
         )${fp.sql}
       ORDER BY ap.recebido_em ASC, p.numProc ASC, ap.numero ASC`, fp.params
    );
    const [multaRows] = await pool.execute(
      `SELECT m.parcela_id AS id, ap.numero, m.recebido_em, m.valor_liquido,
              m.parceria_pessoa_tipo, m.parceria_pessoa_id, m.parceria_valor,
              m.repasse_cliente_tipo, m.repasse_cliente_pessoa_id, m.repasse_cliente_conta_id,
              m.repasse_cliente_em, m.repasse_parceiro_em,
              m.repasse_cliente_destino_tipo, m.repasse_parceiro_destino_tipo,
              CASE m.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = m.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = m.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              a.beneficiario_cliente_tipo AS acordo_cliente_tipo, a.beneficiario_cliente_id AS acordo_cliente_id,
              a.beneficiario_cliente_conta_id AS acordo_cliente_conta_id,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela_multa m
       JOIN acordo_parcela ap ON ap.id = m.parcela_id
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       WHERE m.status = 'pago'
         AND (
           (m.repasse_cliente_habilitado = 1 AND m.valor_liquido > 0 AND m.repasse_cliente_em IS NULL)
           OR (m.repasse_parceiro_habilitado = 1 AND m.parceria_pessoa_id IS NOT NULL AND m.repasse_parceiro_em IS NULL)
         )${fp.sql}
       ORDER BY m.recebido_em ASC, p.numProc ASC, ap.numero ASC`, fp.params
    );
    return sucesso(res, [...rows.map(r => ({ ...r, origem: 'parcela' })), ...multaRows.map(r => ({ ...r, origem: 'multa' }))]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/repasses-concluidos — repasses JÁ FEITOS (consulta/desfazer/histórico),
// da parcela e da multa. Traz a data, a forma de pagamento e quem fez cada repasse. LIMIT defensivo.
async function listarRepassesConcluidos(req, res) {
  try {
    const fp = filtroProcessoRepasses(req);
    if (fp.erro) return erro(res, fp.erro, 400);
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.numero, ap.valor_liquido, ap.parceria_pessoa_id, ap.parceria_valor,
              ap.repasse_cliente_em, ap.repasse_parceiro_em,
              ap.repasse_cliente_observacao, ap.repasse_parceiro_observacao,
              CASE ap.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.repasse_cliente_forma_id)  AS repasse_cliente_forma_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = ap.repasse_parceiro_forma_id) AS repasse_parceiro_forma_nome,
              uc.nome AS repasse_cliente_por_nome,
              up.nome AS repasse_parceiro_por_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela ap
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       LEFT JOIN usuarios uc ON ap.repasse_cliente_por  = uc.id
       LEFT JOIN usuarios up ON ap.repasse_parceiro_por = up.id
       WHERE (ap.repasse_cliente_em IS NOT NULL OR ap.repasse_parceiro_em IS NOT NULL)${fp.sql}
       ORDER BY GREATEST(COALESCE(ap.repasse_cliente_em,'1900-01-01'), COALESCE(ap.repasse_parceiro_em,'1900-01-01')) DESC,
                p.numProc ASC, ap.numero ASC
       LIMIT 300`, fp.params
    );
    const [multaRows] = await pool.execute(
      `SELECT m.parcela_id AS id, ap.numero, m.valor_liquido, m.parceria_pessoa_id, m.parceria_valor,
              m.repasse_cliente_em, m.repasse_parceiro_em,
              m.repasse_cliente_observacao, m.repasse_parceiro_observacao,
              CASE m.parceria_pessoa_tipo
                WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = m.parceria_pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = m.parceria_pessoa_id)
                ELSE NULL
              END AS parceria_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = m.repasse_cliente_forma_id)  AS repasse_cliente_forma_nome,
              (SELECT fp.nome FROM forma_pagamento fp WHERE fp.id = m.repasse_parceiro_forma_id) AS repasse_parceiro_forma_nome,
              uc.nome AS repasse_cliente_por_nome,
              up.nome AS repasse_parceiro_por_nome,
              a.processo_id, a.tipo AS acordo_tipo,
              (SELECT COUNT(*) FROM acordo_parcela ap2 WHERE ap2.acordo_id = ap.acordo_id) AS total_parcelas,
              (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
              p.numProc, p.NomeTituloProc, pa.numPasta
       FROM acordo_parcela_multa m
       JOIN acordo_parcela ap ON ap.id = m.parcela_id
       JOIN acordo a    ON ap.acordo_id = a.id
       JOIN tblproc p   ON a.processo_id = p.id
       JOIN tblpasta pa ON p.pasta_id = pa.id
       LEFT JOIN usuarios uc ON m.repasse_cliente_por  = uc.id
       LEFT JOIN usuarios up ON m.repasse_parceiro_por = up.id
       WHERE (m.repasse_cliente_em IS NOT NULL OR m.repasse_parceiro_em IS NOT NULL)${fp.sql}
       ORDER BY GREATEST(COALESCE(m.repasse_cliente_em,'1900-01-01'), COALESCE(m.repasse_parceiro_em,'1900-01-01')) DESC,
                p.numProc ASC, ap.numero ASC
       LIMIT 300`, fp.params
    );
    return sucesso(res, [...rows.map(r => ({ ...r, origem: 'parcela' })), ...multaRows.map(r => ({ ...r, origem: 'multa' }))]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// CONSULTA / RELATÓRIO do financeiro — busca de parcelas (acordo/alvará) por múltiplos filtros.
// Só LEITURA. Base: acordo_parcela (tem bruto/honorário/líquido/parceria/vencimento/status).
// ============================================================

// FROM + JOINs comuns à listagem, ao total e à exportação (fonte única).
const CONSULTA_FROM = `
  FROM acordo_parcela ap
  JOIN acordo a    ON ap.acordo_id = a.id
  JOIN tblproc p   ON a.processo_id = p.id
  JOIN tblpasta pa ON p.pasta_id = pa.id`;

// SELECT das colunas exibidas (mesma lista p/ tela e Excel).
const CONSULTA_SELECT = `SELECT ap.id, ap.numero, ap.vencimento, ap.valor_bruto, ap.honor_valor, ap.valor_liquido,
       ap.parceria_valor, ap.status, ap.recebido_em,
       a.tipo AS acordo_tipo,
       (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas,
       (SELECT COUNT(*) FROM acordo a2 WHERE a2.processo_id = a.processo_id AND a2.tipo = a.tipo AND a2.id <= a.id) AS numero_acordo,
       CASE ap.parceria_pessoa_tipo
         WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
         WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
         ELSE NULL END AS parceria_nome,
       p.numProc, p.NomeTituloProc, pa.numPasta` + CONSULTA_FROM;

// Monta o WHERE dinâmico parametrizado (só entra a condição do filtro preenchido).
function montarFiltroConsulta(q) {
  const cond = ['1=1'];
  const params = [];
  const like = v => `%${escaparLike(String(v).trim())}%`;   // "%" e "_" digitados são procurados como texto

  if (q.venc_de)  { cond.push('ap.vencimento >= ?'); params.push(q.venc_de); }
  if (q.venc_ate) { cond.push('ap.vencimento <= ?'); params.push(q.venc_ate); }

  // Faixa de valor sobre o campo escolhido (whitelist — o nome da coluna nunca vem cru do request)
  const campoValor = { bruto: 'ap.valor_bruto', liquido: 'ap.valor_liquido', honorario: 'ap.honor_valor' }[q.valor_campo];
  if (campoValor) {
    if (q.valor_de  !== undefined && q.valor_de  !== '') { cond.push(`${campoValor} >= ?`); params.push(Number(q.valor_de)); }
    if (q.valor_ate !== undefined && q.valor_ate !== '') { cond.push(`${campoValor} <= ?`); params.push(Number(q.valor_ate)); }
  }

  if (q.num_processo) { cond.push('p.numProc LIKE ?'); params.push(like(q.num_processo)); }
  if (q.pasta) { const n = parseInt(q.pasta, 10); if (!isNaN(n)) { cond.push('pa.numPasta = ?'); params.push(n); } }
  if (q.status && ['pendente', 'pago', 'cancelada'].includes(q.status)) { cond.push('ap.status = ?'); params.push(q.status); }

  if (q.parceiro) {
    cond.push(`((ap.parceria_pessoa_tipo='fisica'   AND EXISTS(SELECT 1 FROM pessoas_fisicas   pf WHERE pf.id=ap.parceria_pessoa_id AND pf.nome LIKE ?))
             OR (ap.parceria_pessoa_tipo='juridica' AND EXISTS(SELECT 1 FROM pessoas_juridicas pj WHERE pj.id=ap.parceria_pessoa_id AND pj.razao_social LIKE ?)))`);
    params.push(like(q.parceiro), like(q.parceiro));
  }
  if (q.autor) {
    cond.push(`EXISTS(SELECT 1 FROM tbltituloprocautor ta
                 LEFT JOIN pessoas_fisicas   pf ON ta.tipo_pessoa='fisica'   AND ta.pessoa_id=pf.id
                 LEFT JOIN pessoas_juridicas pj ON ta.tipo_pessoa='juridica' AND ta.pessoa_id=pj.id
               WHERE ta.proc_id=p.id AND (pf.nome LIKE ? OR pj.razao_social LIKE ?))`);
    params.push(like(q.autor), like(q.autor));
  }
  if (q.reu) {
    cond.push(`EXISTS(SELECT 1 FROM tbltituloprocreu tr
                 LEFT JOIN pessoas_fisicas   pf ON tr.tipo_pessoa='fisica'   AND tr.pessoa_id=pf.id
                 LEFT JOIN pessoas_juridicas pj ON tr.tipo_pessoa='juridica' AND tr.pessoa_id=pj.id
               WHERE tr.proc_id=p.id AND (pf.nome LIKE ? OR pj.razao_social LIKE ?))`);
    params.push(like(q.reu), like(q.reu));
  }
  return { where: cond.join(' AND '), params };
}

// GET /api/financeiro/consulta — lista paginada + totais (SUM sobre TODO o conjunto filtrado)
async function consultarFinanceiro(req, res) {
  try {
    const { where, params } = montarFiltroConsulta(req.query);
    const { limite: limitInt, offset: offsetInt } = paginacao(req.query, { limitePadrao: 50 });   // página/limite ruins viram o padrão

    const [rows] = await pool.execute(
      `${CONSULTA_SELECT} WHERE ${where} ORDER BY ap.vencimento ASC, p.numProc ASC LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );
    const [tot] = await pool.execute(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(ap.valor_bruto),0)    AS soma_bruto,
              COALESCE(SUM(ap.honor_valor),0)    AS soma_honorario,
              COALESCE(SUM(ap.valor_liquido),0)  AS soma_liquido,
              COALESCE(SUM(ap.parceria_valor),0) AS soma_parceria
       ${CONSULTA_FROM} WHERE ${where}`,
      params
    );
    return sucesso(res, {
      registros: rows,
      total: tot[0].total,
      totais: { bruto: tot[0].soma_bruto, honorario: tot[0].soma_honorario, liquido: tot[0].soma_liquido, parceria: tot[0].soma_parceria },
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/consulta/exportar — mesma consulta (sem paginação) em Excel (.xlsx)
async function exportarConsultaFinanceiro(req, res) {
  try {
    const { where, params } = montarFiltroConsulta(req.query);
    const [rows] = await pool.execute(
      `${CONSULTA_SELECT} WHERE ${where} ORDER BY ap.vencimento ASC, p.numProc ASC LIMIT 50000`, params
    );

    const ExcelJS = require('exceljs');               // require lazy: não derruba o boot se faltar a lib
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Financeiro');
    ws.columns = [
      { header: 'Pasta', key: 'pasta', width: 10 },
      { header: 'Processo', key: 'numProc', width: 26 },
      { header: 'Partes (Autor × Réu)', key: 'partes', width: 42 },
      { header: 'Origem', key: 'origem', width: 14 },
      { header: 'Parcela', key: 'parcela', width: 10 },
      { header: 'Vencimento', key: 'venc', width: 12 },
      { header: 'Bruto', key: 'bruto', width: 14 },
      { header: 'Honorário', key: 'honor', width: 14 },
      { header: 'Líquido', key: 'liquido', width: 14 },
      { header: 'Parceria', key: 'parceria', width: 14 },
      { header: 'Parceiro', key: 'parceiro', width: 26 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };

    const fmtData = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
    const labelStatus = s => s === 'pago' ? 'Recebida' : s === 'cancelada' ? 'Cancelada' : 'Pendente';
    const tipoLabel = t => t === 'alvara' ? 'Alvará' : 'Acordo';
    let tBruto = 0, tHon = 0, tLiq = 0, tPar = 0;
    for (const r of rows) {
      tBruto += Number(r.valor_bruto || 0); tHon += Number(r.honor_valor || 0);
      tLiq += Number(r.valor_liquido || 0); tPar += Number(r.parceria_valor || 0);
      ws.addRow({
        pasta: String(r.numPasta).padStart(4, '0'),
        numProc: r.numProc || '',
        partes: r.NomeTituloProc || '',
        origem: `${tipoLabel(r.acordo_tipo)} ${r.numero_acordo}`,
        parcela: `${r.numero}/${r.total_parcelas}`,
        venc: fmtData(r.vencimento),
        bruto: Number(r.valor_bruto || 0),
        honor: Number(r.honor_valor || 0),
        liquido: Number(r.valor_liquido || 0),
        parceria: Number(r.parceria_valor || 0),
        parceiro: r.parceria_nome || '',
        status: labelStatus(r.status),
      });
    }
    const linhaTotal = ws.addRow({ partes: 'TOTAIS', bruto: tBruto, honor: tHon, liquido: tLiq, parceria: tPar });
    linhaTotal.font = { bold: true };
    ['bruto', 'honor', 'liquido', 'parceria'].forEach(k => { ws.getColumn(k).numFmt = '#,##0.00'; });

    const [y, m, d] = hojeBrasilia().split('-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Consulta financeira - ${d}-${m}-${y}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/financeiro/lancamento/:id/historico — eventos do lançamento (criado/editado)
async function buscarHistoricoLancamento(req, res) {
  try {
    const id = lerIdFin(req.params.id);
    if (!id) return naoEncontrado(res, 'Lançamento não encontrado');
    const [existe] = await pool.execute('SELECT id FROM conta_corrente WHERE id = ?', [id]);
    if (!existe.length) return naoEncontrado(res, 'Lançamento não encontrado');
    const [rows] = await pool.execute(
      `SELECT a.id, a.acao, a.campo_alterado, a.valor_anterior, a.valor_novo, a.criado_em,
              u.nome AS usuario_nome
       FROM auditoria_conta_corrente a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.lancamento_id = ?
       ORDER BY a.criado_em ASC, a.id ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  // contas e destinos financeiros
  listarContasEscritorio, salvarContaEscritorio, desativarContaEscritorio, listarBeneficiariosProcesso, listarContasBeneficiario, criarContaBeneficiario,
  // conta corrente
  buscarContaCorrente, lancar, editarLancamento, excluirLancamento,
  // acordo
  listarAcordos, gerarPreviaParcelas, criarAcordo, buscarAcordo, atualizarAcordo, excluirAcordo, cancelarAcordo,
  // baixa (recebimento do réu)
  pagarParcela, desfazerPagamento,
  // multa por atraso (lançar/editar/remover/receber/desfazer + repasse dela)
  lancarMulta, editarMulta, removerMulta, receberMulta, desfazerMulta, registrarRepasseMulta, desfazerRepasseMulta,
  // repasses (ao cliente / parceiro) + worklists
  registrarRepasse, desfazerRepasse, listarRepassesPendentes, listarRepassesConcluidos,
  // consulta / relatório
  consultarFinanceiro, exportarConsultaFinanceiro,
  // histórico
  buscarHistoricoParcela, buscarHistoricoLancamento,
};
