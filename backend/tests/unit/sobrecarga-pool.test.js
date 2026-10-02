// O aviso "limite de capacidade" só pode acender com espera REAL por conexão (vários segundos),
// nunca por uma fila de milissegundos (ex.: dois Dashboards abrindo juntos).
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarDetectorSobrecarga } = require('../../src/config/sobrecargaPool');

function montar(filas) {
  let t = 1_000_000; let i = 0;
  const detector = criarDetectorSobrecarga({ lerFila: () => filas[Math.min(i++, filas.length - 1)], agora: () => t });
  return { detector, passar: (ms) => { t += ms; } };
}

test('fila curta (uma ou duas olhadas) NÃO acende o aviso', () => {
  const { detector } = montar([0, 9, 4, 0, 0]);
  for (let n = 0; n < 5; n++) detector.amostrar();
  assert.equal(detector.sobrecarregado(), false);
});

test('fila que dura várias olhadas seguidas acende o aviso', () => {
  const { detector } = montar([2, 5, 3, 1]);
  for (let n = 0; n < 4; n++) detector.amostrar();
  assert.equal(detector.sobrecarregado(), true);
});

test('olhadas com fila separadas por uma olhada vazia não somam', () => {
  const { detector } = montar([3, 3, 0, 3, 3, 0, 3, 3]);
  for (let n = 0; n < 8; n++) detector.amostrar();
  assert.equal(detector.sobrecarregado(), false);
});

test('depois de detectada, fica ligado por 3 minutos e apaga sozinho', () => {
  const { detector, passar } = montar([1, 1, 1, 0]);
  for (let n = 0; n < 3; n++) detector.amostrar();
  assert.equal(detector.sobrecarregado(), true);
  passar(179_000); assert.equal(detector.sobrecarregado(), true);
  passar(2_000);   assert.equal(detector.sobrecarregado(), false);
});

test('sem nenhuma fila nunca acende', () => {
  const { detector } = montar([0]);
  for (let n = 0; n < 20; n++) detector.amostrar();
  assert.equal(detector.sobrecarregado(), false);
});
