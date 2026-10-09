import { describe, expect, it } from 'vitest';
import { limparLinkDigitado, completarLink } from './linkWeb';

describe('limparLinkDigitado', () => {
  it('tira espaço, quebra de linha e caractere invisível do meio do link', () => {
    expect(limparLinkDigitado('https://zoom.us/j /856 01\n023093?pwd=abc d')).toBe('https://zoom.us/j/85601023093?pwd=abcd');
    expect(limparLinkDigitado(`zoom.us/j/${String.fromCharCode(0xA0)}1${String.fromCharCode(0x200B)}2${String.fromCharCode(0xFEFF)}3`)).toBe('zoom.us/j/123');
    expect(limparLinkDigitado(null)).toBe('');
    expect(limparLinkDigitado(undefined)).toBe('');
  });
});

describe('completarLink', () => {
  it('completa o https:// só quando tem cara de site e ainda não tem endereço completo', () => {
    expect(completarLink('zoom.us/j/123')).toBe('https://zoom.us/j/123');
    expect(completarLink('  meet.google.com/abc -defg ')).toBe('https://meet.google.com/abc-defg');
    expect(completarLink('zoom.us:443/j/1')).toBe('https://zoom.us:443/j/1');
    expect(completarLink('https://zoom.us/j/1')).toBe('https://zoom.us/j/1');
    expect(completarLink('http://sala.exemplo.com.br')).toBe('http://sala.exemplo.com.br');
  });
  it('deixa como está o que não é site (o servidor recusa ao salvar) e devolve vazio para campo vazio', () => {
    expect(completarLink('')).toBe('');
    expect(completarLink('   ')).toBe('');
    expect(completarLink('sala')).toBe('sala');
    expect(completarLink('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(completarLink('//zoom.us/x')).toBe('//zoom.us/x');
  });
});
