// Uma lista de opções que falha (ex.: tabela que o banco ainda não tem) não pode derrubar o catálogo inteiro.
const test = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../src/services/relatorios/catalogo');

test('catálogo continua montando quando as opções de um campo falham', async () => {
  const assunto = catalogo.obterAssunto('financeiro_parcelas');
  const original = assunto.campos.conta_recebimento.opcoes;
  assunto.campos.conta_recebimento.opcoes = async () => { throw new Error("Table 'x.conta_financeira' doesn't exist"); };
  const erroOriginal = console.error; const registrados = [];
  console.error = (...a) => registrados.push(a.join(' '));
  try {
    const c = await catalogo.catalogoParaUsuario({ ehAdmin: true, permissoes: {}, id: 1, usuario: { nome: 'A' }, hoje: '2026-10-01' });
    const campo = c.assuntos.find(a => a.chave === 'financeiro_parcelas').campos.find(x => x.chave === 'conta_recebimento');
    assert.deepEqual(campo.opcoes, []);
    assert.ok(c.assuntos.length >= 9, 'os demais assuntos continuam');
    assert.match(registrados.join('\n'), /financeiro_parcelas\.conta_recebimento/);
  } finally { console.error = erroOriginal; assunto.campos.conta_recebimento.opcoes = original; }
});
