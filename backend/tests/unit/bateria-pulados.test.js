// A bateria de qualidade reprova teste PULADO: pular é não ter verificado.
// Aqui conferimos que o leitor de resumos reconhece o que cada ferramenta imprime.
const test = require('node:test');
const assert = require('node:assert/strict');

let contarPulados;
test.before(async () => { ({ contarPulados } = await import('../../../quality/pulados.mjs')); });

test('node --test: reconhece pulados no formato de tela e no TAP; zero pulados passa', () => {
  assert.equal(contarPulados('ℹ tests 109\nℹ pass 108\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0'), 1);
  assert.equal(contarPulados('# tests 10\n# pass 10\n# skipped 2\n# todo 0'), 2);
  assert.equal(contarPulados('ℹ tests 109\nℹ pass 109\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0'), 0);
});

test('vitest: reconhece "skipped" e "todo" nos totais; tudo passando dá zero', () => {
  assert.equal(contarPulados(' Test Files  27 passed (27)\n      Tests  1 skipped | 174 passed (175)'), 1);
  assert.equal(contarPulados('      Tests  2 todo | 173 passed (175)'), 2);
  assert.equal(contarPulados(' Test Files  27 passed (27)\n      Tests  175 passed (175)'), 0);
});

test('playwright: reconhece pulados, não executados e instáveis; tudo passando dá zero', () => {
  assert.equal(contarPulados('  1 skipped\n  5 passed (30s)'), 1);
  assert.equal(contarPulados('  2 did not run\n  4 passed (30s)'), 2);
  assert.equal(contarPulados('  1 flaky\n  5 passed (30s)'), 1);
  assert.equal(contarPulados('  6 passed (26.1s)'), 0);
});
