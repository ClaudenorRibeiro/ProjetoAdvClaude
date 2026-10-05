// Leitura segura dos dados de pessoa (física e jurídica): tipo, limites reais das colunas, CPF/CNPJ, data de nascimento, contatos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { lerDadosFisica, lerDadosJuridica, lerDocumento, lerDataNascimento } = require('../../src/utils/dadosPessoa');

test('lerDocumento: só texto, guarda só os dígitos, vazio vira nulo, acima do máximo é erro', () => {
  assert.deepEqual(lerDocumento('529.982.247-25', 'O CPF', 11), { valor: '52998224725' });
  assert.deepEqual(lerDocumento('  ', 'O CPF', 11), { valor: null });
  assert.deepEqual(lerDocumento('abc', 'O CPF', 11), { valor: null });
  assert.deepEqual(lerDocumento(undefined, 'O CPF', 11), { valor: null });
  assert.deepEqual(lerDocumento(12345678901, 'O CPF', 11), { erro: 'O CPF inválido' });
  assert.deepEqual(lerDocumento(['1'], 'O CPF', 11), { erro: 'O CPF inválido' });
  assert.deepEqual(lerDocumento('1'.repeat(12), 'O CPF', 11), { erro: 'O CPF deve ter no máximo 11 números' });
});

test('lerDataNascimento: dia que existe; aceita o horário que a tela às vezes manda; recusa o resto', () => {
  assert.deepEqual(lerDataNascimento('1990-05-17'), { valor: '1990-05-17' });
  assert.deepEqual(lerDataNascimento('1972-03-27T03:00:00.000Z'), { valor: '1972-03-27' });
  for (const vazio of [undefined, null, '']) assert.deepEqual(lerDataNascimento(vazio), { valor: null });
  for (const ruim of ['2026-13-45', '2026-02-30', 'abc', '1990-05-17 lixo', 123, ['1990-05-17'], {}, true]) assert.ok(lerDataNascimento(ruim).erro, JSON.stringify(ruim));
});

test('lerDadosFisica: limpa e confere (nome obrigatório, limites das colunas, ids, contatos); primeira falha vira a mensagem', () => {
  const ok = lerDadosFisica({ nome: '  Ana  ', cpf: '529.982.247-25', rg: 123, cidade: ' Campinas ', profissao_id: '3', genero_id: 0, estado_civil_id: '',
    telefones: [{ numero: ' (19) 9999-0000 ', principal: true }, { numero: '' }], emails: [{ email: ' ANA@X.com ' }, {}], contasBancarias: [] });
  assert.equal(ok.erro, undefined);
  assert.deepEqual([ok.dados.nome, ok.dados.cpf, ok.dados.rg, ok.dados.cidade, ok.dados.profissao_id, ok.dados.genero_id, ok.dados.estado_civil_id], ['Ana', '52998224725', '123', 'Campinas', 3, null, null]);
  assert.deepEqual(ok.dados.telefones, [{ numero: '(19) 9999-0000', tipo: null, principal: true }]);
  assert.deepEqual(ok.dados.emails, [{ email: 'ana@x.com', principal: undefined }]);
  assert.deepEqual(lerDadosFisica({}), { erro: 'O nome é obrigatório' });
  assert.deepEqual(lerDadosFisica(undefined), { erro: 'O nome é obrigatório' });
  assert.equal(lerDadosFisica({ nome: 'a', estado: 'SPX' }).erro, 'A UF muito longa (máximo 2 caracteres)');
  assert.equal(lerDadosFisica({ nome: 'a', profissao_id: 'abc' }).erro, 'O campo profissão inválido');
  assert.equal(lerDadosFisica({ nome: 'a', telefones: {} }).erro, 'A lista de telefones é inválida');
  assert.equal(lerDadosFisica({ nome: 'a', observacoes: 'x'.repeat(5001) }).erro, 'O campo Observações muito longo (máximo 5000 caracteres)');
});

test('lerDadosJuridica: razão social obrigatória (feminino), CNPJ até 14 números, inscrição estadual só conferida no cadastro', () => {
  assert.deepEqual(lerDadosJuridica({}), { erro: 'A razão social é obrigatória' });
  assert.equal(lerDadosJuridica({ razao_social: 'x'.repeat(201) }).erro, 'A razão social muito longa (máximo 200 caracteres)');
  assert.equal(lerDadosJuridica({ razao_social: 'a', cnpj: '1'.repeat(15) }).erro, 'O CNPJ deve ter no máximo 14 números');
  assert.equal(lerDadosJuridica({ razao_social: 'a', inscricao_estadual: 'x'.repeat(31) }).erro, 'A inscrição estadual muito longa (máximo 30 caracteres)');
  assert.equal(lerDadosJuridica({ razao_social: 'a', inscricao_estadual: 'x'.repeat(31) }, { atualizando: true }).erro, undefined);
  assert.equal(lerDadosJuridica({ razao_social: ' Empresa ', cnpj: '11.222.333/0001-81' }).dados.cnpj, '11222333000181');
});
