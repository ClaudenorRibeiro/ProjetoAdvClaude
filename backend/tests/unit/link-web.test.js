const test = require('node:test');
const assert = require('node:assert/strict');
const { lerLink } = require('../../src/utils/linkWeb');

test('lerLink: tira espaço, quebra de linha e caractere invisível do meio do link', () => {
  assert.equal(lerLink('https://zoom.us/j /85601023093?pwd=abc').valor, 'https://zoom.us/j/85601023093?pwd=abc');
  assert.equal(lerLink('  https://zoom.us/j/1\n').valor, 'https://zoom.us/j/1');
  assert.equal(lerLink(`https://zoom.us/j/${String.fromCharCode(0xA0)}1${String.fromCharCode(0x200B)}23${String.fromCharCode(0xFEFF)}`).valor, 'https://zoom.us/j/123');   // espaço sem quebra, zero-width e BOM
  assert.equal(lerLink('https://meet.google.com/abc -defg- hij').valor, 'https://meet.google.com/abc-defg-hij');
});

test('lerLink: completa o https:// quando falta e aceita http, porta e parâmetros', () => {
  assert.equal(lerLink('zoom.us/j/123').valor, 'https://zoom.us/j/123');
  assert.equal(lerLink('www.teams.microsoft.com/l/meetup-join/19%3a').valor, 'https://www.teams.microsoft.com/l/meetup-join/19%3a');
  assert.equal(lerLink('http://sala.exemplo.com.br/x').valor, 'http://sala.exemplo.com.br/x');
  assert.equal(lerLink('zoom.us:443/j/1').valor, 'https://zoom.us:443/j/1');
  assert.equal(lerLink('HTTPS://ZOOM.US/J/1').valor, 'HTTPS://ZOOM.US/J/1');
});

test('lerLink: vazio vira null; não texto, endereço inválido e protocolo perigoso são recusados', () => {
  assert.equal(lerLink('').valor, null);
  assert.equal(lerLink('   ').valor, null);
  assert.equal(lerLink(undefined).valor, null);
  assert.equal(lerLink(null).valor, null);
  for (const ruim of [123, ['https://x.com'], {}, true]) assert.match(lerLink(ruim).erro, /inválido/);
  for (const ruim of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'mailto:a@b.com', 'ftp://zoom.us/x', 'Link da sala: https://zoom.us/j/1', 'sem endereço', 'https://', 'https://semponto', '//zoom.us/x']) {
    assert.match(lerLink(ruim).erro, /não é um endereço válido/, ruim);
  }
});

test('lerLink: respeita o limite de tamanho já contando o https:// que foi completado', () => {
  assert.equal(lerLink(`https://a.com/${'x'.repeat(486)}`, { max: 500 }).valor.length, 500);
  assert.match(lerLink(`https://a.com/${'x'.repeat(487)}`, { max: 500 }).erro, /muito longo/);
  assert.match(lerLink(`a.com/${'x'.repeat(490)}`, { max: 500 }).erro, /muito longo/);
});
