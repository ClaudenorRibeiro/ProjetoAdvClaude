// ============================================================
// VALOR POR EXTENSO (pt-BR) — para recibos
// ------------------------------------------------------------
// valorPorExtenso(1523.45) -> "mil quinhentos e vinte e três reais e quarenta e cinco centavos"
// Cobre de 0 até bilhões. Reais e centavos com plural/singular corretos.
// ============================================================

const UNIDADES     = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS      = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS     = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

// Extenso de um número de 0 a 999
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  let txt = '';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) txt += CENTENAS[c];
  if (resto > 0) {
    if (txt) txt += ' e ';
    if (resto < 10) txt += UNIDADES[resto];
    else if (resto < 20) txt += DEZ_A_DEZENOVE[resto - 10];
    else {
      txt += DEZENAS[Math.floor(resto / 10)];
      if (resto % 10 > 0) txt += ' e ' + UNIDADES[resto % 10];
    }
  }
  return txt;
}

// Extenso de um inteiro (até bilhões)
function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const escalas = [
    { div: 1000000000, sing: 'bilhão', plur: 'bilhões' },
    { div: 1000000,    sing: 'milhão', plur: 'milhões' },
    { div: 1000,       sing: 'mil',    plur: 'mil' },
    { div: 1,          sing: '',       plur: '' },
  ];
  let resto = n;
  const grupos = []; // { texto, local }  — local = valor 0-999 do grupo de unidades (null nos demais)
  for (const e of escalas) {
    const q = Math.floor(resto / e.div);
    resto = resto % e.div;
    if (q === 0) continue;
    let texto;
    if (e.div === 1000 && q === 1) texto = 'mil';                  // "mil" e não "um mil"
    else if (e.div === 1) texto = ate999(q);
    else texto = ate999(q) + ' ' + (q === 1 ? e.sing : e.plur);
    grupos.push({ texto, local: e.div === 1 ? q : null });
  }
  if (grupos.length === 1) return grupos[0].texto;
  // Conecta com " e " antes do último grupo quando ele é uma escala redonda (mil/milhão),
  // um valor < 100, ou uma centena exata (200, 500...); caso contrário, só espaço.
  const ult = grupos[grupos.length - 1];
  const anteriores = grupos.slice(0, -1).map(g => g.texto).join(' ');
  const usaE = ult.local == null || ult.local < 100 || ult.local % 100 === 0;
  return anteriores + (usaE ? ' e ' : ' ') + ult.texto;
}

// Valor monetário (reais e centavos) por extenso
function valorPorExtenso(valor) {
  const total = Math.round(Number(valor || 0) * 100);
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  const partes = [];
  if (reais > 0) {
    // "de reais" para milhões/bilhões exatos (ex.: "um milhão de reais")
    const usaDe = reais >= 1000000 && reais % 1000000 === 0;
    partes.push(inteiroExtenso(reais) + (usaDe ? ' de ' : ' ') + (reais === 1 ? 'real' : 'reais'));
  }
  if (centavos > 0) partes.push(inteiroExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
  if (partes.length === 0) return 'zero real';
  return partes.join(' e ');
}

module.exports = { valorPorExtenso };
