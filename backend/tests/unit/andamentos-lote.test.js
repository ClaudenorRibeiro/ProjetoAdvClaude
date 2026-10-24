// Aviso diário de andamentos do DataJud — peças puras: ler a resposta em lote do CNJ e resumir os movimentos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { lerAchados } = require('../../src/andamentosDatajud/lote');
const { resumirMovimentos } = require('../../src/andamentosDatajud/gravar');
const { atualizacaoDoAchado } = require('../../src/services/datajudService');

test('lote: o mesmo número em dois graus junta os movimentos e fica com a atualização mais recente; só os dígitos do número valem', () => {
  const mapa = lerAchados({ hits: { hits: [
    { _source: { numeroProcesso: '0000001-00.2026.8.26.0100', movimentos: [{ codigo: 1 }], dataHoraUltimaAtualizacao: '2026-10-01T10:00:00.000Z' } },
    { _source: { numeroProcesso: '00000010020268260100', movimentos: [{ codigo: 2 }, { codigo: 3 }], dataHoraUltimaAtualizacao: '2026-10-05T10:00:00.000Z' } },
    { _source: { numeroProcesso: '00000020020268260100', movimentos: 'quebrado' } },
    { _source: { movimentos: [{ codigo: 9 }] } },
    { _source: { numeroProcesso: '   ', movimentos: [{ codigo: 9 }] } },
    null,
  ] } });
  assert.deepEqual([...mapa.keys()], ['00000010020268260100', '00000020020268260100']);
  assert.deepEqual(mapa.get('00000010020268260100'), { movimentos: [{ codigo: 1 }, { codigo: 2 }, { codigo: 3 }], atualizado: '2026-10-05T10:00:00.000Z' });
  assert.deepEqual(mapa.get('00000020020268260100'), { movimentos: [], atualizado: null });
});

test('lote: resposta vazia, sem "hits" ou de outro formato não quebra', () => {
  for (const corpo of [null, undefined, {}, { hits: {} }, { hits: { hits: 'x' } }, 'texto', 5]) assert.equal(lerAchados(corpo).size, 0);
});

test('resumir movimentos: quantidade e o dia do mais recente (ignora data ilegível)', () => {
  assert.deepEqual(resumirMovimentos([]), { quantidade: 0, ultimaData: null });
  assert.deepEqual(resumirMovimentos([
    { dataHora: '2026-03-01T10:00:00.000Z' }, { dataHora: '2026-09-15T10:00:00.000Z' }, { dataHora: 'xx' }, null, {},
  ]), { quantidade: 5, ultimaData: '2026-09-15' });
});

test('data de atualização do CNJ: texto aparado, até 40 letras; qualquer outra coisa é null', () => {
  assert.equal(atualizacaoDoAchado({ _source: { dataHoraUltimaAtualizacao: '  2026-10-01T10:00:00.000Z ' } }), '2026-10-01T10:00:00.000Z');
  assert.equal(atualizacaoDoAchado({ _source: { dataHoraUltimaAtualizacao: 'x'.repeat(60) } }).length, 40);
  for (const v of [undefined, null, '', '   ', 12, {}, []]) assert.equal(atualizacaoDoAchado({ _source: { dataHoraUltimaAtualizacao: v } }), null);
  assert.equal(atualizacaoDoAchado(null), null);
  assert.equal(atualizacaoDoAchado({}), null);
});
